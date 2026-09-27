package com.innovii.parkna.engine;

import com.innovii.parkna.model.Check;
import com.innovii.parkna.model.Clock;
import com.innovii.parkna.model.DailyPass;
import com.innovii.parkna.model.ExceptionCase;
import com.innovii.parkna.model.LedgerEntry;
import com.innovii.parkna.model.MonthlyPass;
import com.innovii.parkna.model.Officer;
import com.innovii.parkna.model.Organisation;
import com.innovii.parkna.model.OutMessage;
import com.innovii.parkna.model.ParkedCar;
import com.innovii.parkna.model.Pending;
import com.innovii.parkna.model.PlateRecord;
import com.innovii.parkna.model.Receipt;
import com.innovii.parkna.model.SmsEntry;
import com.innovii.parkna.model.State;
import com.innovii.parkna.model.Subscriber;
import com.innovii.parkna.model.Tariff;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

import static com.innovii.parkna.engine.Cal.DOW;
import static com.innovii.parkna.engine.Cal.MONL;
import static com.innovii.parkna.engine.Cal.addDays;
import static com.innovii.parkna.engine.Cal.addMonth;
import static com.innovii.parkna.engine.Cal.daysBetween;
import static com.innovii.parkna.engine.Cal.dkey;
import static com.innovii.parkna.engine.Cal.fmtD;
import static com.innovii.parkna.engine.Cal.hm;
import static com.innovii.parkna.engine.Js.gmd;
import static com.innovii.parkna.engine.Js.pad;
import static com.innovii.parkna.engine.Js.round;
import static com.innovii.parkna.engine.Js.str;
import static com.innovii.parkna.engine.Js.strOr;
import static com.innovii.parkna.engine.Js.trim;
import static com.innovii.parkna.engine.Js.truthy;

/**
 * ParkNa business rules: payments, passes, attendant checks, organisation invoicing and the SMS lines.
 *
 * <p>Ported from the v0.1 JavaScript engine (frontend/shared/engine.js), which the apps still use to
 * read the state. Pilot rules (journey documents v1.2):
 * <ul>
 *   <li>one pilot price for every plate: 200 GMD a day (till 7pm) or 4,420 GMD a month</li>
 *   <li>paid hours 7am-7pm Mon-Sat; no fines in the pilot; the pass follows the plate</li>
 *   <li>organisation plates are covered; invoice on the 25th, due the 1st, 5 days' grace</li>
 *   <li>attendants use START, a plate, END from their registered number</li>
 * </ul>
 *
 * <p>Not thread-safe: the service calls it under one lock, one action at a time. Every change is
 * recorded in {@link Changes} so it can be saved to MariaDB.
 */
public class ParkingEngine {
    public static final String SHORT_CODE = "7275";
    static final String CODE = "482913";
    public static final List<String> PROVIDERS = List.of("Wave", "Afrimoney", "APS", "QMoney");

    public record Road(String name, String bays) {}
    public record Shift(String label, int s, int e) {}

    public static final Map<String, Road> ROADS = new LinkedHashMap<>();
    public static final Map<String, Shift> SHIFTS = new LinkedHashMap<>();
    static {
        ROADS.put("WEL", new Road("Wellington Road", "A1-A48"));
        ROADS.put("LIB", new Road("Liberation Avenue", "A1-A44"));
        ROADS.put("IND", new Road("Independence Drive", "B1-B40"));
        ROADS.put("LEM", new Road("Leman Street", "A1-A50"));
        ROADS.put("RUS", new Road("Russell Street", "B1-B46"));
        SHIFTS.put("AM", new Shift("7am-1pm", 420, 780));
        SHIFTS.put("PM", new Shift("1pm-7pm", 780, 1140));
    }

    private final State S;
    private Changes ch = new Changes();
    private final Messages msg;

    public ParkingEngine(State state) {
        this.S = state;
        this.msg = new Messages(() -> S.tariff);
    }

    /** A new engine with the pilot's starting data. */
    public static ParkingEngine seeded() {
        ParkingEngine e = new ParkingEngine(new State());
        e.reset();
        return e;
    }

    public State state() { return S; }

    /** The changes since the last call, for saving. */
    public Changes takeChanges() { Changes c = ch; ch = new Changes(); return c; }

    /** Every change pushed to the screens gets a new version number. */
    public long bump() { return ++S.ver; }

    // ------------------------------------------------------------------ lookups

    private PlateRecord P(String p) {
        ch.plates.add(p);
        return S.plates.computeIfAbsent(p, k -> { PlateRecord r = new PlateRecord(); r.plate = k; return r; });
    }

    private Subscriber N(String num) { return N(num, null); }

    private Subscriber N(String num, String name) {
        ch.subscribers.add(num);
        Subscriber u = S.nums.get(num);
        if (u == null) {
            u = new Subscriber();
            u.num = num;
            u.name = truthy(name) ? name : "+220 " + num;
            for (String p : PROVIDERS) u.wallet.put(p, 5000);
            S.nums.put(num, u);
        }
        return u;
    }

    private Officer officer(String num) {
        Officer o = S.off.get(num);
        if (o != null) ch.officers.add(num);
        return o;
    }

    private Organisation org(String id) {
        Organisation o = S.orga.get(id);
        if (o != null) ch.orgs.add(id);
        return o;
    }

    private LocalDate today() { return S.clock.date; }
    private boolean paidHours() { return Cal.dow(S.clock.date) != 0 && S.clock.min >= 420 && S.clock.min < 1140; }

    private Organisation orgOf(String p) {
        LocalDate t = today();
        for (Organisation o : S.orga.values()) {
            if (o.status.equals("reverted") || o.status.equals("new")) continue;
            for (Organisation.FleetPlate x : o.plates)
                if (x.plate.equals(p) && !x.from.isAfter(t) && (x.to == null || t.isBefore(x.to))) return o;
        }
        return null;
    }

    /** ORG, MONTHLY, DAILY or UNPAID. */
    public String plateState(String p) {
        PlateRecord r = S.plates.get(p);
        if (orgOf(p) != null) return "ORG";
        if (r != null && r.monthly != null && daysBetween(S.clock.date, r.monthly.to) >= 0) return "MONTHLY";
        if (r != null && r.daily != null && r.daily.day.equals(dkey(S.clock.date))) return "DAILY";
        return "UNPAID";
    }

    private String roadOf(Officer o) {
        return o.re != null && o.re.day.equals(dkey(S.clock.date)) && S.clock.min >= o.re.from ? o.re.road : o.road;
    }

    private static String roadLine(String k) { return ROADS.get(k).name() + " " + ROADS.get(k).bays(); }
    private boolean isOfficer(String num) { Officer o = S.off.get(num); return o != null && o.active; }

    private List<Organisation.FleetPlate> activePlates(Organisation o, LocalDate at) {
        LocalDate t = at != null ? at : today();
        List<Organisation.FleetPlate> r = new ArrayList<>();
        for (Organisation.FleetPlate x : o.plates) if (!x.from.isAfter(t) && (x.to == null || t.isBefore(x.to))) r.add(x);
        return r;
    }

    private int proRata(Organisation o) {
        LocalDate t = today();
        int n = Cal.dim(t);
        return (int) round((double) (n - t.getDayOfMonth() + 1) / n * S.tariff.monthly * (1 - o.disc));
    }

    static int monthlyFor(double d) { return (int) round(d * 26 * 0.85); }

    private static final Pattern PLATE = Pattern.compile("^[A-Z]{2,4}\\d{1,4}[A-Z]?$");

    /** A plate as ParkNa stores it (BJL1234), or null when it is not a plate. */
    public static String normPlate(Object s) {
        String x = Js.SPACES.matcher(strOr(s, "").replace("-", "")).replaceAll("").toUpperCase(java.util.Locale.ROOT);
        return PLATE.matcher(x).matches() ? x : null;
    }

    // ------------------------------------------------------------------ quotes and payments

    /** What paying this plate would cost right now, or why it can't be paid. */
    private static final class Quote {
        String err, plate, st, kind;
        int amount;
        LocalDate to;
    }

    private Quote quote(Object plate, String kind) {
        Quote q = new Quote();
        String p = normPlate(plate);
        if (p == null) { q.err = "Enter a plate like BJL1234"; return q; }
        String st = plateState(p);
        PlateRecord r = S.plates.get(p);
        q.plate = p;
        q.st = st;
        if (st.equals("ORG")) { q.err = p + " is covered by " + orgOf(p).name + " fleet. Nothing to pay."; return q; }
        if (kind.equals("monthly")) {
            LocalDate from = S.clock.date;
            if (r != null && r.monthly != null && daysBetween(S.clock.date, r.monthly.to) >= 0) {
                if (daysBetween(S.clock.date, r.monthly.to) > 3) { q.err = "Monthly pass to " + fmtD(r.monthly.to) + ". Renewal opens 3 days before it ends."; return q; }
                from = r.monthly.to;
            }
            q.kind = "monthly";
            q.amount = S.tariff.monthly;
            q.to = addMonth(from);
            return q;
        }
        if (st.equals("DAILY")) { q.err = p + " is already paid till 7pm today."; return q; }
        if (st.equals("MONTHLY")) { q.err = p + " has a monthly pass to " + fmtD(r.monthly.to) + ". Nothing to pay today."; return q; }
        if (!paidHours()) { q.err = "Parking is free now. Paid hours 7am–7pm, Mon–Sat."; return q; }
        q.kind = "daily";
        q.amount = S.tariff.daily;
        return q;
    }

    private String recordPay(String num, String prov, String plate, String kind, LocalDate to) {
        Subscriber u = N(num);
        String ticket = "PN-" + Js.padStart(Integer.toString(S.seq++), 5);
        PlateRecord r = P(plate);
        int amt = kind.equals("monthly") ? S.tariff.monthly : S.tariff.daily;
        link(num, plate);
        u.welcomed = true;
        u.prov = prov;
        if (kind.equals("monthly")) {
            MonthlyPass m = new MonthlyPass(); m.to = to; m.ticket = ticket; m.prov = prov; r.monthly = m;
        } else {
            DailyPass d = new DailyPass(); d.day = dkey(S.clock.date); d.ticket = ticket; d.t = hm(S.clock.min); d.prov = prov; r.daily = d;
        }
        Receipt rc = new Receipt();
        rc.plate = plate; rc.kind = kind; rc.amount = amt; rc.prov = prov;
        rc.when = DOW[Cal.dow(S.clock.date)] + " " + fmtD(S.clock.date) + " " + hm(S.clock.min);
        rc.day = dkey(S.clock.date); rc.t = hm(S.clock.min); rc.ticket = ticket; rc.to = to;
        u.receipts.add(0, rc);
        ch.receipts.add(new Changes.NewReceipt(num, rc));
        LedgerEntry l = new LedgerEntry();
        l.t = hm(S.clock.min); l.day = dkey(S.clock.date); l.text = prov + " · " + plate + " " + kind + " · " + ticket;
        l.amt = "+" + gmd(amt); l.amount = amt; l.src = kind; l.plate = plate; l.prov = prov; l.ticket = ticket; l.num = num;
        ledger(l);
        return ticket;
    }

    private void ledger(LedgerEntry l) {
        S.log.add(0, l);
        if (S.log.size() > State.LOG_KEEP) S.log.subList(State.LOG_KEEP, S.log.size()).clear();
        ch.ledger.add(l);
    }

    private Map<String, Object> pay(String num, Object plate, String kind, String prov) {
        Quote q = quote(plate, kind);
        if (q.err != null) return err(q.err);
        if (!PROVIDERS.contains(prov)) return err("Choose a payment provider");
        Subscriber u = N(num);
        if (u.wallet.get(prov) < q.amount) {
            LedgerEntry l = new LedgerEntry();
            l.t = hm(S.clock.min); l.day = dkey(S.clock.date); l.text = prov + " insufficient balance · " + q.plate; l.amt = "failed"; l.bad = true; l.amount = 0;
            ledger(l);
            mt(num, "Payment failed (" + prov + ": insufficient balance). Nothing was charged. Try another provider.", null);
            return err(prov + ": insufficient balance. Nothing was charged.");
        }
        u.wallet.put(prov, u.wallet.get(prov) - q.amount);
        String tk = recordPay(num, prov, q.plate, q.kind, q.to);
        mt(num, q.kind.equals("monthly") ? msg.okM(q.plate, q.to, tk, prov) : msg.okD(q.plate, tk, prov), "Receipt");
        Map<String, Object> r = ok();
        r.put("ticket", tk); r.put("plate", q.plate); r.put("kind", q.kind); r.put("amount", q.amount); r.put("to", q.to); r.put("prov", prov);
        return r;
    }

    // ------------------------------------------------------------------ SMS plumbing

    private void smsPush(String num, SmsEntry m, OutMessage out) {
        Subscriber u = N(num);
        String k = dkey(S.clock.date);
        if (!k.equals(u.lastD)) {
            SmsEntry h = SmsEntry.dayHeader(DOW[Cal.dow(S.clock.date)] + " " + fmtD(S.clock.date));
            u.sms.add(h);
            ch.sms.add(new Changes.NewSms(num, h, null));
            u.lastD = k;
        }
        u.sms.add(m);
        ch.sms.add(new Changes.NewSms(num, m, out));
        if (u.sms.size() > State.SMS_KEEP) u.sms.subList(0, u.sms.size() - State.SMS_KEEP).clear();
    }

    /** An SMS from ParkNa to a phone. */
    private String mt(String num, String text, String tag) {
        OutMessage o = new OutMessage();
        o.t = hm(S.clock.min); o.d = fmtD(S.clock.date); o.num = num; o.text = text; o.tag = tag; o.id = ++S.ver;
        S.out.add(0, o);
        if (S.out.size() > State.OUT_KEEP) S.out.subList(State.OUT_KEEP, S.out.size()).clear();
        SmsEntry e = SmsEntry.toPhone(text, tag, hm(S.clock.min));
        e.outId = o.id;
        smsPush(num, e, o);
        return text;
    }

    /** An SMS from a phone to ParkNa. */
    private void mo(String num, String text) { smsPush(num, SmsEntry.fromPhone(text, hm(S.clock.min)), null); }

    private void link(String num, String p) {
        Subscriber u = N(num);
        PlateRecord r = P(p);
        if (!u.plates.contains(p)) u.plates.add(p);
        if (!r.payers.contains(num)) r.payers.add(num);
        u.last = p;
    }

    // ------------------------------------------------------------------ driver SMS line

    private static final Pattern ONE_DIGIT = Pattern.compile("^[0-9]$");
    private static final Pattern MONTHLY_CMD = Pattern.compile("^M" + "[\\t\\n\\u000B\\f\\r \\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF]+" + "\\S");
    private static final Pattern HAS_DIGIT = Pattern.compile("\\d");

    /** An SMS arriving on the short code. Returns the reply text, a payment result, or null. */
    public Object smsIn(String num, Object raw) {
        String t = trim(strOr(raw, ""));
        String U = Js.SPACES.matcher(t.toUpperCase(java.util.Locale.ROOT)).replaceAll(" ");
        if (t.isEmpty()) return null;
        mo(num, t);
        if (isOfficer(num)) return officerIn(num, U);
        Subscriber u = N(num);
        if (ONE_DIGIT.matcher(U).matches() && u.pending != null) return answer(num, U);
        u.pending = null;
        if (U.equals("START") || U.equals("END")) return mt(num, msg.officerOnly(U), null);
        if (U.equals("HELP") || U.equals("INFO")) return mt(num, msg.help(), null);
        if (U.equals("M") || MONTHLY_CMD.matcher(U).find()) {
            String mp = U.equals("M") ? (u.last != null ? u.last : (u.plates.isEmpty() ? null : u.plates.get(0))) : normPlate(U.substring(2));
            if (mp == null) return mt(num, U.equals("M") ? "Text M and your plate, e.g. M BJL1234" : msg.bad(), null);
            Quote qm = quote(mp, "monthly");
            if (qm.err != null) return mt(num, qm.err, null);
            link(num, qm.plate);
            u.pending = new Pending(qm.plate, "monthly");
            return mt(num, msg.moffer(qm.plate, qm.to), null);
        }
        boolean digit = HAS_DIGIT.matcher(U).find();
        String p = normPlate(U);
        if (p == null && !digit) p = u.last != null ? u.last : (u.plates.isEmpty() ? null : u.plates.get(0));
        if (p == null) return mt(num, digit ? msg.bad() : msg.welcome(), null);
        String st = plateState(p);
        if (!paidHours()) return mt(num, msg.free(), null);
        if (st.equals("ORG")) { Organisation o = orgOf(p); return mt(num, msg.org(p, o.name, o.id), null); }
        link(num, p);
        u.welcomed = true;
        if (st.equals("MONTHLY")) return mt(num, msg.mcov(p, S.plates.get(p).monthly.to), null);
        if (st.equals("DAILY")) return mt(num, msg.dcov(p, S.plates.get(p).daily.ticket), null);
        u.pending = new Pending(p, "daily");
        return mt(num, msg.offer(p), null);
    }

    private Object answer(String num, String U) {
        Subscriber u = N(num);
        Pending pe = u.pending;
        int i = Integer.parseInt(U);
        if (!(i >= 1 && i <= 4)) return mt(num, "Reply 1 Wave, 2 Afrimoney, 3 APS or 4 QMoney.", null);
        u.pending = null;
        return pay(num, pe.plate, pe.kind, PROVIDERS.get(i - 1));
    }

    // ------------------------------------------------------------------ attendant line

    private int unpaidEarlier(String road, String id) {
        String d = dkey(S.clock.date);
        java.util.Set<String> s = new java.util.HashSet<>();
        for (Check c : S.checks) if (c.day.equals(d) && c.road.equals(road) && !c.off.equals(id) && c.st.equals("UNPAID")) s.add(c.plate);
        return s.size();
    }

    private String officerIn(String num, String U) {
        Officer o = officer(num);
        o.last = S.clock.min;
        o.lastDay = dkey(S.clock.date);
        if (U.equals("START")) {
            if (o.on) return mt(num, "Your shift is already running since " + hm(o.start) + ". Text a plate to check it, or END.", null);
            o.on = true; o.start = S.clock.min; o.day = dkey(S.clock.date); o.stats = new Officer.ShiftStats(); o.summary = null;
            String road = roadOf(o);
            int h = unpaidEarlier(road, o.id);
            return mt(num, "ParkNa: shift started " + hm(S.clock.min) + ". Attendant " + o.id + ", " + roadLine(road) + ", " + SHIFTS.get(o.shift).label() + "."
                    + (h > 0 ? " " + h + " plate" + (h > 1 ? "s were" : " was") + " unpaid earlier today." : "") + " Text a plate to check it. Text END to finish.", "Shift");
        }
        if (U.equals("END")) {
            if (!o.on) return mt(num, "No shift running. Text START to begin.", null);
            o.on = false;
            Officer.ShiftStats s = o.stats;
            Officer.ShiftSummary sm = new Officer.ShiftSummary();
            sm.end = S.clock.min; sm.day = dkey(S.clock.date); sm.checked = s.checked; sm.paid = s.paid; sm.unpaid = s.unpaid; sm.road = roadOf(o);
            o.summary = sm;
            return mt(num, "Shift ended " + hm(S.clock.min) + ". Attendant " + o.id + ", " + ROADS.get(roadOf(o)).name() + ".\nChecked " + s.checked + ": paid " + s.paid + ", unpaid " + s.unpaid + ".\nCash handled: none. Thank you.", "Shift");
        }
        String p = normPlate(U);
        if (p == null) {
            if (HAS_DIGIT.matcher(U).find()) return mt(num, o.on ? "Plate not recognised. Text the plate e.g. BJL1234" : "Text START to begin your shift first.", null);
            return mt(num, "Officer commands: START, END, or a plate e.g. BJL1234", null);
        }
        if (!o.on) return mt(num, "Text START to begin your shift first.", null);
        if (!paidHours()) return mt(num, "Outside paid hours. Parking is free now.", null);
        return mt(num, doCheck(o, p), null);
    }

    private String doCheck(Officer o, String p) {
        String road = roadOf(o), st = plateState(p), d = dkey(S.clock.date);
        List<Check> prev = new ArrayList<>();
        for (Check c : S.checks) if (c.day.equals(d) && c.plate.equals(p) && c.road.equals(road)) prev.add(c);
        Check c = new Check();
        c.day = d; c.t = S.clock.min; c.plate = p; c.off = o.id; c.road = road; c.st = st;
        S.checks.add(c);
        ch.checks.add(c);
        o.stats.checked++;
        if (st.equals("UNPAID")) o.stats.unpaid++; else o.stats.paid++;
        String m;
        if (st.equals("UNPAID")) {
            List<String> pu = new ArrayList<>();
            for (Check x : prev) if (x.st.equals("UNPAID")) pu.add(hm(x.t));
            m = !pu.isEmpty() ? p + ": UNPAID. Also unpaid at " + String.join(", ", pu) + " on your road. Card already left? Move on."
                    : p + ": UNPAID. No pass today.\nDriver there: show the Park & Pay card.\nNot there: leave a card on the windscreen.";
        } else if (st.equals("DAILY")) {
            boolean wasUnpaid = prev.stream().anyMatch(x -> x.st.equals("UNPAID"));
            m = p + ": PAID. Daily pass till 7pm" + (wasUnpaid ? " (paid " + S.plates.get(p).daily.t + ")" : "") + ".";
        } else if (st.equals("MONTHLY")) {
            m = p + ": PAID. Monthly pass to " + fmtD(S.plates.get(p).monthly.to) + ".";
        } else {
            m = p + ": PAID. Organisation " + orgOf(p).id + ".";
        }
        if (!road.equals(o.road)) m += " Recorded on " + ROADS.get(road).name() + ".";
        return m;
    }

    private Map<String, Object> reassign(String num, String road) {
        Officer o = officer(num);
        if (o == null) return err("Unknown officer");
        if (!ROADS.containsKey(road)) return err("Unknown road");
        if (roadOf(o).equals(road)) return err("Attendant " + o.id + " is already on " + ROADS.get(road).name() + ".");
        Officer.Reassignment re = new Officer.Reassignment();
        re.road = road; re.from = S.clock.min; re.day = dkey(S.clock.date);
        o.re = re;
        mt(num, "ParkNa: Admin moved you to " + roadLine(road) + " from " + hm(S.clock.min) + " today, until the end of your shift. Your next checks are recorded there.", "Reassigned");
        return ok();
    }

    private Map<String, Object> registerOfficer(Map<String, Object> f) {
        String ph = Js.digits(strOr(f.get("phone"), ""));
        if (trim(strOr(f.get("name"), "")).isEmpty()) return err("Enter the officer’s full name.");
        if (ph.length() != 7) return err("Enter the 7-digit registered phone number.");
        if (S.off.containsKey(ph)) return err("That number is already registered to Attendant " + S.off.get(ph).id + ".");
        String road = strOr(f.get("road"), "RUS"), shift = strOr(f.get("shift"), "AM");
        if (!ROADS.containsKey(road)) return err("Unknown road");
        if (!SHIFTS.containsKey(shift)) return err("Unknown shift");
        int max = S.off.values().stream().mapToInt(x -> Integer.parseInt(x.id)).max().orElse(0);
        String id = pad(max + 1);
        Officer o = new Officer();
        o.id = id; o.name = trim(str(f.get("name"))); o.num = ph; o.road = road; o.shift = shift; o.staff = strOr(f.get("staff"), "—");
        o.active = true; o.supervisor = "Supervisor Jobe"; o.isNew = true;
        S.off.put(ph, o);
        ch.officers.add(ph);
        N(ph, o.name).name = o.name;
        String first = o.name.contains(" ") ? o.name.substring(0, o.name.indexOf(' ')) : o.name;
        mt(ph, "ParkNa: welcome " + first + ". You are Attendant " + id + " on " + roadLine(o.road) + ", " + SHIFTS.get(o.shift).label() + ". Text START to begin, a plate to check it, END to finish. Never take money.", "Welcome");
        Map<String, Object> r = ok();
        r.put("id", id);
        return r;
    }

    // ------------------------------------------------------------------ organisations

    private Organisation.Invoice issueInvoice(Organisation o) {
        LocalDate t = today();
        int m0 = t.getMonthValue() - 1;
        LocalDate start = Cal.date(t.getYear(), m0 + 1, 1), end = Cal.date(t.getYear(), m0 + 2, 0);
        int n = activePlates(o, start).size();
        Organisation.Invoice inv = new Organisation.Invoice();
        inv.lines.add(new Organisation.Line(n + " plates × " + gmd(S.tariff.monthly) + " GMD", n * S.tariff.monthly));
        inv.lines.add(new Organisation.Line("Bulk discount " + round(o.disc * 100) + "%", (int) -round(n * S.tariff.monthly * o.disc)));
        for (Organisation.Topup x : o.topups) inv.lines.add(new Organisation.Line(x.t, x.a));
        o.topups = new ArrayList<>();
        inv.no = "INV-" + Integer.toString(start.getYear()).substring(2) + pad(start.getMonthValue()) + "-" + o.id.substring(4);
        inv.month = MONL[start.getMonthValue() - 1] + " " + start.getYear();
        inv.issued = t; inv.due = start; inv.end = end;
        inv.amount = inv.lines.stream().mapToInt(l -> l.a).sum();
        inv.status = "open";
        o.invoices.add(0, inv);
        return inv;
    }

    private void orgDay(Organisation o) {
        if (o.status.equals("new")) return;
        LocalDate d = today();
        String c = o.contact.num;
        if (d.getDayOfMonth() == 25 && !o.plates.isEmpty()) {
            Organisation.Invoice ni = issueInvoice(o);
            mt(c, "ParkNa: invoice " + ni.no + " for " + ni.month + " is ready. GMD " + gmd(ni.amount) + ", due " + fmtD(ni.due) + ". Pay in the portal, or by bank transfer quoting " + ni.no + ".", "Invoice");
        }
        Organisation.Invoice inv = null;
        for (Organisation.Invoice i : o.invoices) if (!i.status.equals("paid") && daysBetween(i.due, d) >= 1) { inv = i; break; }
        if (inv != null) {
            long g = daysBetween(inv.due, d);
            if (g <= S.tariff.grace) {
                o.status = "grace";
                o.graceDay = (int) g;
                mt(c, "ParkNa: " + inv.no + " is overdue. Grace day " + g + " of " + S.tariff.grace + ": your plates stay covered. Pay now to keep them covered.", "Grace");
            } else if (!o.status.equals("reverted")) {
                o.status = "reverted";
                mt(c, "ParkNa: " + inv.no + " is still unpaid after " + S.tariff.grace + " days of grace. Your " + activePlates(o, null).size() + " plates are now UNPAID and drivers must pay daily. Pay the invoice to restore cover.", "Plates reverted");
            }
        }
    }

    private Map<String, Object> payInvoice(Organisation o, Organisation.Invoice inv, String method) {
        inv.status = "paid"; inv.method = method; inv.paidOn = today();
        boolean wasOff = !o.status.equals("active");
        o.status = "active";
        o.graceDay = 0;
        LedgerEntry l = new LedgerEntry();
        l.t = hm(S.clock.min); l.day = dkey(S.clock.date); l.text = method + " · " + o.id + " " + inv.no; l.amt = "+" + gmd(inv.amount); l.amount = inv.amount; l.src = "org";
        ledger(l);
        mt(o.contact.num, "ParkNa: payment received for " + inv.no + ", GMD " + gmd(inv.amount) + ". Thank you." + (wasOff ? " Cover is restored:" : "") + " Your " + activePlates(o, null).size() + " plates are covered to " + fmtD(inv.end) + ".", "Payment received");
        return ok();
    }

    private Map<String, Object> createOrg(Map<String, Object> f) {
        String ph = Js.digits(strOr(f.get("phone"), ""));
        if (trim(strOr(f.get("name"), "")).isEmpty()) return err("Enter the organisation name.");
        double plates = Js.numOrNaN(f.get("plates"));
        if (!(plates > 0)) return err("Enter the number of plates agreed.");
        if (trim(strOr(f.get("contact"), "")).isEmpty() || ph.length() != 7) return err("Enter the billing contact and a 7-digit phone number.");
        if (!truthy(f.get("signed"))) return err("Tick when the signed agreement is received.");
        int max = S.orga.keySet().stream().mapToInt(k -> Integer.parseInt(k.substring(4))).max().orElse(0);
        String id = "ORG-" + Js.padStart(pad(max + 1), 3);
        Organisation o = new Organisation();
        o.id = id; o.name = trim(str(f.get("name")));
        o.contact = new Organisation.Contact(trim(str(f.get("contact"))), ph);
        double disc = Js.numOrNaN(f.get("disc"));
        o.disc = disc != 0 && !Double.isNaN(disc) ? disc : .15;
        o.agreed = plates; o.status = "new"; o.created = today();
        S.orga.put(id, o);
        ch.orgs.add(id);
        N(ph, o.contact.name);
        mt(ph, "Welcome to ParkNa, " + o.name + " (" + id + "). Sign in to the ParkNa organisation portal with this number to add your plates. Your account manager will help you.", "Welcome");
        Map<String, Object> r = ok();
        r.put("id", id);
        return r;
    }

    private void addFleetPlate(Organisation o, String p, Object dept, Object driver) {
        Organisation.FleetPlate x = new Organisation.FleetPlate();
        x.plate = p; x.dept = strOr(dept, "—"); x.driver = strOr(driver, "—"); x.from = today();
        o.plates.add(x);
        o.topups.add(new Organisation.Topup(p + " from " + fmtD(today()) + " (pro-rata)", proRata(o)));
        if (o.status.equals("new")) o.status = "active";
    }

    private static boolean onAccount(Organisation o, String plate) {
        for (Organisation.FleetPlate y : o.plates) if (y.plate.equals(plate) && y.to == null) return true;
        return false;
    }

    private Organisation.Invoice invoice(Organisation o, Object no) {
        String n = str(no);
        for (Organisation.Invoice i : o.invoices) if (i.no.equals(n)) return i;
        return null;
    }

    // ------------------------------------------------------------------ clock

    /** Ends the day: closes open shifts, moves to 7am next day, sends pass reminders and runs invoicing. */
    public void nextDay() {
        for (Officer o : S.off.values()) {
            ch.officers.add(o.num);
            if (o.on) {
                o.on = false;
                Officer.ShiftSummary sm = new Officer.ShiftSummary();
                sm.end = SHIFTS.get(o.shift).e(); sm.day = o.day;
                if (o.stats != null) { sm.checked = o.stats.checked; sm.paid = o.stats.paid; sm.unpaid = o.stats.unpaid; }
                sm.road = roadOf(o); sm.auto = true;
                o.summary = sm;
            }
            o.re = null;
        }
        S.clock.date = addDays(S.clock.date, 1);
        S.clock.min = 7 * 60;
        for (Map.Entry<String, PlateRecord> e : S.plates.entrySet()) {
            PlateRecord r = e.getValue();
            if (r.monthly != null && daysBetween(S.clock.date, r.monthly.to) == 3 && !r.payers.isEmpty())
                mt(r.payers.get(r.payers.size() - 1), msg.remind(e.getKey(), r.monthly.to), "Reminder");
        }
        for (Organisation o : S.orga.values()) { ch.orgs.add(o.id); orgDay(o); }
    }

    /** The demo clock moves one minute. Returns true when the time changed. */
    public boolean tickMinute() {
        if (S.clock.run && S.clock.min < 23 * 60 + 59) { S.clock.min++; return true; }
        return false;
    }

    /** Real-time mode: brings the clock to this day and minute, running the end-of-day rules for each day passed. */
    public boolean syncTo(LocalDate date, int minute) {
        boolean changed = false;
        while (S.clock.date.isBefore(date)) { nextDay(); changed = true; }
        if (S.clock.min != minute) { S.clock.min = minute; changed = true; }
        return changed;
    }

    // ------------------------------------------------------------------ starting data

    private record Persona(String num, String name, String note, List<String> plates, Integer monthlyTo, String low) {}

    private static final List<Persona> PERSONAS = List.of(
            new Persona("7012345", "Fatou", "first time", List.of(), null, null),
            new Persona("3034567", "Isatou", "two plates", List.of("BJL5678", "BJL2211"), null, null),
            new Persona("7023456", "Lamin", "pays for a friend", List.of("BJL1234"), null, null),
            new Persona("3078901", "Omar", "monthly pass", List.of("BJL7777"), 4, null),
            new Persona("7055501", "Musa", "unpaid car", List.of("BJL8080"), null, null),
            new Persona("7045678", "Ebrima", "low Wave balance", List.of("BJL3030"), null, "Wave"),
            new Persona("7089012", "Kebba", "work car", List.of("BJL7001"), null, null));

    private record OfficerSeed(String id, String name, String num, String road, String shift, String staff, Officer.Background bg) {}

    private static final List<OfficerSeed> OFFSEED = List.of(
            new OfficerSeed("07", "Modou Jallow", "7300007", "WEL", "AM", "BCC-0407", null),
            new OfficerSeed("12", "Awa Sarr", "7300012", "WEL", "PM", "BCC-0412", null),
            new OfficerSeed("03", "Binta Touray", "7300003", "LIB", "AM", "BCC-0403", new Officer.Background(.42, .14, null)),
            new OfficerSeed("09", "Saikou Bah", "7300009", "IND", "AM", "BCC-0409", new Officer.Background(.34, .13, null)),
            new OfficerSeed("11", "Alieu Ceesay", "7300011", "LEM", "AM", "BCC-0411", new Officer.Background(.34, .2, 580)),
            new OfficerSeed("14", "Haddy Sowe", "7300014", "RUS", "AM", "BCC-0414", new Officer.Background(.49, .18, null)));

    private static final String[][] PARKSEED = {
            {"WEL", "A3", "BJL1234", "7023456"}, {"WEL", "A5", "BJL7777", "3078901"}, {"WEL", "A8", "BJL7001", "7089012"}, {"WEL", "A11", "BJL8080", "7055501"},
            {"WEL", "A14", "BJL9191", null}, {"WEL", "A17", "BJL5678", "3034567"}, {"WEL", "A20", "BJL3030", "7045678"},
            {"LEM", "A2", "BJL4545", null}, {"LEM", "A6", "BJL6006", null}, {"LEM", "A9", "BJL7002", null}};

    private void resetTariff() {
        Tariff t = new Tariff();
        t.daily = 200; t.monthly = 4420; t.grace = 5; t.walletLimit = 10000;
        t.log.add(new Tariff.Change("28 Oct 2026", "Pilot tariff published: 200 GMD a day, 4,420 GMD a month. Paid hours 7am–7pm, Mon–Sat.", "BCC pilot resolution (reference to confirm)", "Aisha K."));
        S.tariff = t;
    }

    /** Back to the pilot's starting data. */
    public void reset() {
        S.clock = new Clock();
        S.clock.date = Cal.date(2026, 10, 2);
        S.clock.min = 9 * 60;
        S.clock.run = true;
        S.plates.clear(); S.nums.clear(); S.seq = 12; S.log.clear(); S.out.clear(); S.checks.clear(); S.exc.clear();
        resetTariff();
        for (Persona p : PERSONAS) {
            Subscriber u = N(p.num(), p.name());
            u.plates = new ArrayList<>(p.plates());
            u.last = p.plates().isEmpty() ? null : p.plates().get(0);
            u.welcomed = !p.plates().isEmpty();
            u.persona = true;
            u.note = p.note();
            if (p.low() != null) u.wallet.put(p.low(), 100);
            for (String x : p.plates()) {
                PlateRecord r = P(x);
                r.payers.add(p.num());
                if (p.monthlyTo() != null) {
                    MonthlyPass m = new MonthlyPass(); m.to = addDays(S.clock.date, p.monthlyTo()); m.ticket = "PN-00007"; m.prov = "Wave"; r.monthly = m;
                }
            }
        }
        S.off.clear();
        for (OfficerSeed s : OFFSEED) {
            Officer o = new Officer();
            o.active = true; o.supervisor = "Supervisor Jobe";
            o.id = s.id(); o.name = s.name(); o.num = s.num(); o.road = s.road(); o.shift = s.shift(); o.staff = s.staff();
            o.bg = s.bg() == null ? null : new Officer.Background(s.bg().rate, s.bg().unp, s.bg().stop);
            S.off.put(s.num(), o);
            N(s.num(), s.name());
        }
        S.park.clear();
        for (String[] a : PARKSEED) S.park.add(new ParkedCar(a[0], a[1], a[2], a[3]));
        S.orga.clear();
        Organisation o = new Organisation();
        o.id = "ORG-014"; o.name = "Demo Bank"; o.contact = new Organisation.Contact("Mariama S.", "7101234"); o.disc = .15; o.agreed = 4; o.status = "active";
        o.created = Cal.date(2026, 9, 20);
        String[][] fleet = {{"BJL7001", "Branch ops", "Kebba J."}, {"BJL7002", "Cash logistics", "Fatima N."}, {"BJL7003", "Facilities", "Ousman B."}, {"BJL7009", "Branch ops", "Lamin D."}};
        for (String[] f : fleet) {
            Organisation.FleetPlate x = new Organisation.FleetPlate();
            x.plate = f[0]; x.dept = f[1]; x.driver = f[2]; x.from = Cal.date(2026, 9, 1);
            o.plates.add(x);
        }
        Organisation.Invoice inv = new Organisation.Invoice();
        inv.no = "INV-2611-014"; inv.month = "November 2026"; inv.issued = Cal.date(2026, 9, 25); inv.due = Cal.date(2026, 10, 1); inv.end = Cal.date(2026, 10, 30);
        inv.lines.add(new Organisation.Line("4 plates × 4,420 GMD", 17680));
        inv.lines.add(new Organisation.Line("Bulk discount 15%", -2652));
        inv.amount = 15028; inv.status = "paid"; inv.method = "Bank transfer"; inv.paidOn = Cal.date(2026, 9, 30);
        o.invoices.add(inv);
        S.orga.put(o.id, o);
        N("7101234", "Mariama S.");
        /* a car already paid on Leman Street this morning */
        int keep = S.clock.min;
        S.clock.min = 8 * 60 + 15;
        recordPay("7066000", "Wave", "BJL4545", "daily", null);
        S.clock.min = keep;
        N("7066000").name = "A driver";
        S.ver++;
        ch = new Changes();
        ch.fullReset = true;
    }

    // ------------------------------------------------------------------ actions

    private static Map<String, Object> ok() { Map<String, Object> r = new LinkedHashMap<>(); r.put("ok", true); return r; }
    private static Map<String, Object> err(String m) { Map<String, Object> r = new LinkedHashMap<>(); r.put("err", m); return r; }
    private static final Map<String, Object> NO_ORG = Map.of("err", "Unknown organisation");

    @SuppressWarnings("unchecked")
    private static Map<String, Object> asMap(Object o) { return o instanceof Map ? (Map<String, Object>) o : Map.of(); }

    /**
     * Runs one action sent by an app or portal ({"type": "driver.pay", ...}). The result is sent back to
     * that screen; the new state goes to every screen.
     */
    public Map<String, Object> act(Map<String, Object> a) {
        Object typeRaw = a.get("type");
        String type = typeRaw == null ? "undefined" : str(typeRaw);
        switch (type) {
            case "driver.login": {
                String num = Js.lastChars(Js.digits(strOr(a.get("num"), "")), 7);
                if (num.length() != 7) return err("Enter a 7-digit Gambian number.");
                if (isOfficer(num)) return err("That number is registered to a ParkNa attendant.");
                Subscriber u = S.nums.get(num);
                if (u == null || u.name.equals("+220 " + num)) {
                    if (trim(strOr(a.get("name"), "")).isEmpty()) { Map<String, Object> r = new LinkedHashMap<>(); r.put("need", "name"); return r; }
                    u = N(num);
                    u.name = trim(str(a.get("name")));
                }
                Map<String, Object> r = ok(); r.put("num", num); return r;
            }
            case "driver.addPlate": {
                String p = normPlate(a.get("plate"));
                if (p == null) return err("Enter a plate like BJL1234");
                String num = str(a.get("num"));
                if (num.isEmpty()) return err("Sign in first.");
                link(num, p);
                Map<String, Object> r = ok(); r.put("plate", p); return r;
            }
            case "driver.removePlate": {
                String num = str(a.get("num")), plate = str(a.get("plate"));
                if (num.isEmpty()) return err("Sign in first.");
                Subscriber du = N(num);
                du.plates.removeIf(x -> x.equals(plate));
                if (plate.equals(du.last)) du.last = du.plates.isEmpty() ? null : du.plates.get(0);
                return ok();
            }
            case "driver.focus": {
                String num = str(a.get("num")), plate = str(a.get("plate"));
                if (num.isEmpty()) return err("Sign in first.");
                Subscriber fu = N(num);
                if (fu.plates.contains(plate)) fu.last = plate;
                return ok();
            }
            case "driver.pay": {
                String num = str(a.get("num"));
                if (num.isEmpty()) return err("Sign in first.");
                return pay(num, a.get("plate"), strOr(a.get("kind"), "daily"), str(a.get("prov")));
            }
            case "sms": {
                Object reply = smsIn(Js.lastChars(Js.digits(str(a.get("num"))), 7), a.get("text"));
                Map<String, Object> r = ok();
                if (reply != null) r.put("reply", reply);
                return r;
            }
            case "officer.login": {
                String on = Js.lastChars(Js.digits(strOr(a.get("num"), "")), 7);
                if (!isOfficer(on)) return err("This number is not a registered ParkNa attendant. Ask your supervisor to register it in the back office.");
                Map<String, Object> r = ok(); r.put("num", on); return r;
            }
            case "org.sendCode":
            case "org.login": {
                String ph = Js.lastChars(Js.digits(strOr(a.get("phone"), "")), 7);
                Organisation org = null;
                for (Organisation o : S.orga.values()) if (o.contact.num.equals(ph)) org = o;
                if (org == null) return err("This number is not the contact on a ParkNa organisation account.");
                if (type.equals("org.sendCode")) mt(ph, "ParkNa portal code: " + CODE + ". It expires in 10 minutes. Do not share it.", "Code");
                else if (!trim(a.containsKey("code") ? str(a.get("code")) : "undefined").equals(CODE)) return err("That code is not right. Check the SMS and try again.");
                Map<String, Object> r = ok(); r.put("org", org.id); return r;
            }
            case "org.addPlate": {
                Organisation oa = org(str(a.get("org")));
                String ap = normPlate(a.get("plate"));
                if (oa == null) return err("Unknown organisation");
                if (ap == null) return err("Enter a plate like BJL7010");
                if (onAccount(oa, ap)) return err(ap + " is already on this account");
                int pr = proRata(oa);
                addFleetPlate(oa, ap, a.get("dept"), a.get("driver"));
                Map<String, Object> r = ok(); r.put("plate", ap); r.put("proRata", pr); return r;
            }
            case "org.addPlates": {
                Organisation ob = org(str(a.get("org")));
                if (ob == null) return new LinkedHashMap<>(NO_ORG);
                if (a.get("rows") instanceof List<?> rows) {
                    for (Object row : rows) {
                        Map<String, Object> x = asMap(row);
                        String q = normPlate(x.get("p"));
                        if (q != null && !onAccount(ob, q)) addFleetPlate(ob, q, x.get("dept"), x.get("driver"));
                    }
                }
                return ok();
            }
            case "org.removePlate": {
                Organisation oc = org(str(a.get("org")));
                if (oc == null) return new LinkedHashMap<>(NO_ORG);
                String plate = str(a.get("plate"));
                for (Organisation.FleetPlate x : oc.plates) if (x.plate.equals(plate) && x.to == null) { x.to = addDays(today(), 1); break; }
                return ok();
            }
            case "org.uploadProof": {
                Organisation od = org(str(a.get("org")));
                if (od == null) return new LinkedHashMap<>(NO_ORG);
                Organisation.Invoice iv = invoice(od, a.get("inv"));
                if (iv == null) return err("Unknown invoice");
                iv.status = "proof";
                iv.proofOn = today();
                return ok();
            }
            case "org.payWallet": {
                Organisation oe = org(str(a.get("org")));
                if (oe == null) return new LinkedHashMap<>(NO_ORG);
                Organisation.Invoice iw = invoice(oe, a.get("inv"));
                if (iw == null) return err("Unknown invoice");
                if (iw.amount > S.tariff.walletLimit) return err("Above the wallet limit. Pay by bank transfer.");
                return payInvoice(oe, iw, "Wave Business");
            }
            case "back.register": return registerOfficer(a);
            case "back.reassign": return reassign(str(a.get("off")), str(a.get("road")));
            case "back.createOrg": return createOrg(a);
            case "back.match": {
                Organisation om = org(str(a.get("org")));
                if (om == null) return new LinkedHashMap<>(NO_ORG);
                Organisation.Invoice im = invoice(om, a.get("inv"));
                if (im == null) return err("Unknown invoice");
                return payInvoice(om, im, "Bank transfer");
            }
            case "back.refer": {
                double i = Js.numOrNaN(a.get("i"));
                if (i == Math.rint(i) && i >= 0 && i < S.exc.size()) { S.exc.get((int) i).status = "finance"; ch.exceptions = true; }
                return ok();
            }
            case "back.publish": {
                long v2 = round(Js.num(a.get("daily")));
                if (!(v2 >= 50 && v2 <= 2000)) return err("Enter a daily price between 50 and 2,000 GMD.");
                if (v2 == S.tariff.daily) return err("No change to publish.");
                if (trim(strOr(a.get("auth"), "")).isEmpty()) return err("Add the Council authority reference. Tariff changes need one.");
                int old = S.tariff.daily;
                S.tariff.daily = (int) v2;
                S.tariff.monthly = monthlyFor(v2);
                Tariff.Change c = new Tariff.Change(fmtD(S.clock.date) + " " + S.clock.date.getYear() + " " + hm(S.clock.min),
                        "Daily " + old + " → " + v2 + " GMD; monthly " + gmd(monthlyFor(old)) + " → " + gmd(S.tariff.monthly) + " GMD", trim(str(a.get("auth"))), "Aisha K.");
                S.tariff.log.add(c);
                ch.tariff = true;
                ch.tariffLog.add(c);
                return ok();
            }
            case "back.exception": {
                ExceptionCase e = new ExceptionCase();
                e.type = strOr(a.get("kind"), "Wrong-plate payment");
                e.plate = a.get("plate") == null ? null : str(a.get("plate"));
                e.detail = strOr(a.get("detail"), "");
                e.status = "open";
                S.exc.add(e);
                ch.exceptions = true;
                return ok();
            }
            case "clock.set": {
                double m = Js.numOrNaN(a.get("min"));
                if (Double.isNaN(m)) return err("Enter a time.");
                S.clock.min = (int) Math.max(0, Math.min(1439, round(m)));
                return ok();
            }
            case "clock.add": {
                double m = Js.numOrNaN(a.get("min"));
                if (Double.isNaN(m)) return err("Enter a number of minutes.");
                S.clock.min = (int) Math.max(0, Math.min(1439, S.clock.min + round(m)));
                return ok();
            }
            case "clock.nextDay": nextDay(); return ok();
            case "clock.run": S.clock.run = truthy(a.get("on")); return ok();
            case "demo.reset": reset(); return ok();
            default: return err("Unknown action " + type);
        }
    }
}
