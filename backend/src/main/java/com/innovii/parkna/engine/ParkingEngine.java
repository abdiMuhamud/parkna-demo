package com.innovii.parkna.engine;

import com.innovii.parkna.model.Announcement;
import com.innovii.parkna.model.Check;
import com.innovii.parkna.model.Clock;
import com.innovii.parkna.model.DailyPass;
import com.innovii.parkna.model.ExceptionCase;
import com.innovii.parkna.model.Fine;
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
import static com.innovii.parkna.engine.Cal.addYear;
import static com.innovii.parkna.engine.Cal.daysBetween;
import static com.innovii.parkna.engine.Cal.dkey;
import static com.innovii.parkna.engine.Cal.fmtD;
import static com.innovii.parkna.engine.Cal.fmtY;
import static com.innovii.parkna.engine.Cal.hm;
import static com.innovii.parkna.engine.Js.gmd;
import static com.innovii.parkna.engine.Js.pad;
import static com.innovii.parkna.engine.Js.round;
import static com.innovii.parkna.engine.Js.str;
import static com.innovii.parkna.engine.Js.strOr;
import static com.innovii.parkna.engine.Js.trim;
import static com.innovii.parkna.engine.Js.truthy;

/**
 * SUNU Park business rules: payments, passes, attendant checks, organisation invoicing and the SMS lines.
 *
 * <p>Ported from the v0.1 JavaScript engine (frontend/shared/engine.js), which the apps still use to
 * read the state. Pilot rules (journey documents v1.2):
 * <ul>
 *   <li>one price for every plate: 200 GMD a day (till 7pm) or 4,000 GMD a month (20 paid days)</li>
 *   <li>paid hours 7am-7pm Mon-Sat; the pass follows the plate</li>
 *   <li>unpaid car: the attendant issues a warning; the daily fee is due within 24 hours, then with a 1,880 GMD fine</li>
 *   <li>a phone with an unpaid warning on one of its plates settles it before buying any new pass</li>
 *   <li>organisations pay upfront per car per year; cars added later pay the months left; renewal invoice
 *       30 days before the year ends, 5 days' grace</li>
 *   <li>attendants use START, a plate, END from their registered number</li>
 * </ul>
 *
 * <p>Not thread-safe: the service calls it under one lock, one action at a time. Every change is
 * recorded in {@link Changes} so it can be saved to MariaDB.
 */
public class ParkingEngine {
    public static final String SHORT_CODE = "7275";
    /** Where the terms and conditions are published (in SMS). */
    public static final String TERMS_URL = "sunupark.gm/terms";
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
    /** Off until a mobile-money provider is connected (payments.mode). The demo runs with simulated wallets. */
    private boolean paymentsEnabled = true;

    /** The message drivers get while no mobile-money provider is connected. */
    public static final String PAYMENTS_OFF = "Paying by mobile money opens soon. We will send you an SMS when it does.";

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

    public void setPaymentsEnabled(boolean on) { this.paymentsEnabled = on; }
    public boolean paymentsEnabled() { return paymentsEnabled; }

    /** A new engine for a real service: today's date and time, the default tariff, and nothing else. */
    public static ParkingEngine empty(LocalDate today, int minute) {
        ParkingEngine e = new ParkingEngine(new State());
        State s = e.S;
        s.clock = new Clock();
        s.clock.date = today;
        s.clock.min = minute;
        s.clock.run = true;
        s.seq = 1;
        Tariff t = new Tariff();
        t.daily = 200; t.monthly = monthlyFor(200); t.annual = t.monthly * 12; t.fine = 1880; t.grace = 5; t.walletLimit = 10000;
        t.log.add(new Tariff.Change(fmtD(today) + " " + today.getYear() + " " + hm(minute),
                "Starting tariff: 200 GMD a day, " + gmd(t.monthly) + " GMD a month, " + gmd(t.annual) + " GMD a car a year for organisations; "
                        + gmd(t.fine) + " GMD fine for rule breakers (a warning not paid within 24 hours). Paid hours 7am–7pm, Mon–Sat.", "SUNU Park set-up", "System"));
        s.tariff = t;
        s.ver = 1;
        e.ch = new Changes();
        e.ch.fullReset = true;
        return e;
    }

    /** Who did it: the signed-in staff member's name, added by the service (never taken from the screen). */
    private static String actor(Map<String, Object> a, String fallback) {
        Object v = a.get("_actor");
        return v instanceof String s && !s.isBlank() ? s : fallback;
    }

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

    /** An organisation covers its paid cars while its year runs, and during the grace days of an unpaid renewal. */
    private boolean covering(Organisation o) {
        return (o.status.equals("active") || o.status.equals("grace")) && o.coverTo != null && (!today().isAfter(o.coverTo) || o.status.equals("grace"));
    }

    private Organisation orgOf(String p) {
        LocalDate t = today();
        for (Organisation o : S.orga.values()) {
            if (!covering(o)) continue;
            for (Organisation.FleetPlate x : o.plates)
                if (x.plate.equals(p) && x.from != null && !x.from.isAfter(t) && (x.to == null || t.isBefore(x.to))) return o;
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

    /** Whether a plate is covered right now, for the "pay for a plate" screen. Changes nothing. */
    public Map<String, Object> plateStatus(Object num, Object raw) {
        String p = normPlate(raw);
        if (p == null) return err("Enter a plate like BJL1234");
        String st = plateState(p);
        Map<String, Object> r = ok();
        r.put("plate", p);
        r.put("st", st);
        PlateRecord rec = S.plates.get(p);
        if (st.equals("DAILY")) r.put("until", "19:00");
        if (st.equals("MONTHLY")) r.put("to", rec.monthly.to);
        if (st.equals("ORG")) r.put("org", orgOf(p).name);
        r.put("paidHours", paidHours());
        List<Fine> fs = openFines(p);
        if (!fs.isEmpty()) {
            // an open warning is paid first
            int owed = 0;
            boolean late = false;
            List<Map<String, Object>> list = new ArrayList<>();
            for (Fine f : fs) {
                owed += fineOwed(f);
                late |= fineLate(f);
                Map<String, Object> x = new LinkedHashMap<>();
                x.put("id", f.id); x.put("road", ROADS.get(f.road).name()); x.put("day", f.day); x.put("t", f.t); x.put("base", f.base); x.put("fine", f.fine);
                x.put("owed", fineOwed(f)); x.put("late", fineLate(f)); x.put("due", fineDue(f));
                list.add(x);
            }
            r.put("fines", list);
            r.put("fineOwed", owed);
            r.put("fineLate", late);
        } else {
            String ff = fineFirst(num == null ? null : String.valueOf(num), p);
            if (ff != null) { r.put("first", ff); r.put("firstOwed", owed(ff)); }
        }
        r.put("offences", offences(p));
        return r;
    }

    /** What paying this plate would cost this phone right now, or why it can't be paid (USSD menus). Changes nothing. */
    public Map<String, Object> quoteFor(String num, Object plate, String kind) {
        Quote q = quote(num, plate, kind);
        Map<String, Object> r = new LinkedHashMap<>();
        if (q.err != null) r.put("err", q.err);
        r.put("plate", q.plate); r.put("st", q.st); r.put("kind", q.kind); r.put("amount", q.amount); r.put("to", q.to);
        r.put("ids", q.ids); r.put("late", q.late); r.put("first", q.first);
        r.put("payments", paymentsEnabled);
        return r;
    }

    /** The plate's state right now (UNPAID, DAILY, MONTHLY, ORG) and until when. */
    public String stateOf(String p) { return plateState(p); }
    public String untilOf(String p) {
        String st = plateState(p);
        PlateRecord r = S.plates.get(p);
        return switch (st) { case "DAILY" -> "7pm today"; case "MONTHLY" -> fmtD(r.monthly.to); case "ORG" -> orgOf(p).name; default -> ""; };
    }
    public boolean paidHoursNow() { return paidHours(); }
    /** The open warnings on a plate, with what each costs now. */
    public List<Map<String, Object>> openWarnings(String p) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Fine f : openFines(p)) {
            Map<String, Object> x = new LinkedHashMap<>();
            x.put("id", f.id); x.put("road", ROADS.get(f.road).name()); x.put("day", f.day); x.put("t", hm(f.t));
            x.put("owed", fineOwed(f)); x.put("late", fineLate(f)); x.put("due", fineDue(f));
            out.add(x);
        }
        return out;
    }

    /** The road an attendant is on right now (their own, or where they were moved today). */
    public String currentRoad(Officer o) { return roadOf(o); }

    private static String roadLine(String k) { return ROADS.get(k).name() + " " + ROADS.get(k).bays(); }
    /** A registered, active attendant's number? */
    public boolean isOfficer(String num) { Officer o = S.off.get(num); return o != null && o.active; }

    /** The organisation whose billing contact has this number, or null. */
    public String orgForContact(String num) {
        String id = null;
        for (Organisation o : S.orga.values()) if (o.contact.num.equals(num)) id = o.id;
        return id;
    }

    private List<Organisation.FleetPlate> activePlates(Organisation o, LocalDate at) {
        LocalDate t = at != null ? at : today();
        List<Organisation.FleetPlate> r = new ArrayList<>();
        for (Organisation.FleetPlate x : o.plates) if (x.from != null && !x.from.isAfter(t) && (x.to == null || t.isBefore(x.to))) r.add(x);
        return r;
    }

    /** Months left in the organisation's year, counting the current month in full (1 to 12). */
    private static int monthsLeft(Organisation o, LocalDate t) {
        LocalDate e = o.coverTo;
        int m = (e.getYear() - t.getYear()) * 12 + e.getMonthValue() - t.getMonthValue() + (e.getDayOfMonth() >= t.getDayOfMonth() ? 1 : 0);
        return Math.max(1, Math.min(12, m));
    }

    /** One car for a year, after the organisation's discount. */
    private int carYear(Organisation o) { return (int) round(S.tariff.annual * (1 - o.disc)); }

    /** What one more car costs now: the months left in the current year, or a full year before the first payment. */
    public int proRata(Organisation o) { return o.coverTo != null && covering(o) ? (int) round((double) carYear(o) * monthsLeft(o, today()) / 12) : carYear(o); }

    /** 20 paid days: a monthly pass costs 5 days a week instead of 6. */
    static int monthlyFor(double d) { return (int) round(d * 20); }

    private static final Pattern PLATE = Pattern.compile("^[A-Z]{2,4}\\d{1,4}[A-Z]?$");

    /** A plate as SUNU Park stores it (BJL1234), or null when it is not a plate. */
    public static String normPlate(Object s) {
        String x = Js.SPACES.matcher(strOr(s, "").replace("-", "")).replaceAll("").toUpperCase(java.util.Locale.ROOT);
        return PLATE.matcher(x).matches() ? x : null;
    }

    // ------------------------------------------------------------------ quotes and payments

    // ------------------------------------------------------------------ warnings and fines

    private List<Fine> openFines(String p) {
        List<Fine> r = new ArrayList<>();
        for (Fine f : S.fines) if (f.plate.equals(p) && f.status.equals("open")) r.add(f);
        return r;
    }

    /** More than 24 hours after the warning: the fine is added. */
    private boolean fineLate(Fine f) {
        long n = daysBetween(Cal.fromDkey(f.day), S.clock.date);
        return n > 1 || (n == 1 && S.clock.min > f.t);
    }

    private int fineOwed(Fine f) { return f.base + (fineLate(f) ? f.fine : 0); }

    private static String fineDue(Fine f) { return hm(f.t) + " on " + fmtD(addDays(Cal.fromDkey(f.day), 1)); }

    /** Another of this phone's plates with an unpaid warning: it is paid before any new pass. */
    private String fineFirst(String num, String p) {
        Subscriber u = num == null ? null : S.nums.get(num);
        if (u == null) return null;
        for (String x : u.plates) if (!x.equals(p) && !openFines(x).isEmpty()) return x;
        return null;
    }

    private int owed(String p) { int n = 0; for (Fine f : openFines(p)) n += fineOwed(f); return n; }

    /** The plate's record: every warning that was not cancelled. */
    public int offences(String p) { int n = 0; for (Fine f : S.fines) if (f.plate.equals(p) && !f.status.equals("cancelled")) n++; return n; }

    static String nth(int n) {
        int t = n % 100;
        String s = t >= 11 && t <= 13 ? "th" : switch (n % 10) { case 1 -> "st"; case 2 -> "nd"; case 3 -> "rd"; default -> "th"; };
        return n + s;
    }

    /** First-time or repeat offender, as the attendant and the police read it. */
    private String offenderLine(String p) {
        int n = offences(p);
        return n <= 1 ? "First-time offender." : "Repeat offender: " + nth(n) + " warning for this plate.";
    }

    /** The phones to tell about a plate: the numbers that paid for it, then the numbers that added it. */
    private List<String> plateNums(String p) {
        PlateRecord r = S.plates.get(p);
        List<String> out = r != null ? new ArrayList<>(r.payers) : new ArrayList<>();
        List<String> more = new ArrayList<>();
        for (Map.Entry<String, Subscriber> e : S.nums.entrySet()) if (e.getValue().plates.contains(p) && !out.contains(e.getKey())) more.add(e.getKey());
        java.util.Collections.sort(more);
        out.addAll(more);
        out.removeIf(this::isOfficer);
        return out;
    }

    private Fine fine(Object id) {
        for (Fine f : S.fines) if (f.id.equals(id)) return f;
        return null;
    }

    /** Marks the plate's open warnings paid; one issued today also counts as today's daily pass. */
    private boolean settleFines(String p, String method, String ticket, String num) {
        PlateRecord r = P(p);
        String d = dkey(S.clock.date);
        boolean cov = false;
        for (Fine f : openFines(p)) {
            boolean late = fineLate(f);
            f.status = "paid";
            Fine.Settled st = new Fine.Settled();
            st.day = d; st.t = hm(S.clock.min); st.amount = fineOwed(f); st.late = late; st.method = method; st.ticket = ticket; st.num = num;
            f.settled = st;
            ch.fines.add(f.id);
            if (f.day.equals(d)) cov = true;
        }
        if (cov && plateState(p).equals("UNPAID")) {
            DailyPass dp = new DailyPass(); dp.day = d; dp.ticket = ticket; dp.t = hm(S.clock.min); dp.prov = method; r.daily = dp;
        }
        return cov;
    }

    /** One warning paid at the Council office (no phone involved). */
    private boolean settleOne(Fine f, String method) {
        String d = dkey(S.clock.date);
        boolean late = fineLate(f);
        f.status = "paid";
        Fine.Settled st = new Fine.Settled();
        st.day = d; st.t = hm(S.clock.min); st.amount = fineOwed(f); st.late = late; st.method = method;
        f.settled = st;
        ch.fines.add(f.id);
        if (f.day.equals(d) && plateState(f.plate).equals("UNPAID")) {
            DailyPass dp = new DailyPass(); dp.day = d; dp.ticket = f.id; dp.t = hm(S.clock.min); dp.prov = "Council office"; P(f.plate).daily = dp;
        }
        return f.day.equals(d);
    }

    private String warn(Officer o, String p) {
        String road = roadOf(o), st = plateState(p), d = dkey(S.clock.date);
        if (!st.equals("UNPAID")) return p + ": " + (st.equals("ORG") ? "covered by an organisation" : "PAID") + ". No warning needed.";
        for (Fine f : openFines(p)) if (f.day.equals(d)) return p + ": warning " + f.id + " was already issued at " + hm(f.t) + ".";
        Fine f = new Fine();
        f.id = "W-" + Js.padStart(Integer.toString(S.fines.size() + 1), 5);
        f.plate = p; f.day = d; f.t = S.clock.min; f.road = road; f.off = o.id; f.base = S.tariff.daily; f.fine = S.tariff.fine; f.status = "open";
        S.fines.add(f);
        ch.fines.add(f.id);
        List<String> nums = plateNums(p);
        for (String n : nums) mt(n, msg.warn(f, ROADS.get(f.road).name(), fineDue(f), SHORT_CODE), "Warning");
        return p + ": WARNING " + f.id + " issued at " + hm(S.clock.min) + ". " + offenderLine(p) + " " + (!nums.isEmpty() ? "The driver has been told by SMS." : "No phone is linked to this plate yet: the warning waits on the plate.")
                + "\nLeave a Park & Pay card on the windscreen.";
    }

    /** What paying this plate would cost right now, or why it can't be paid. */
    private static final class Quote {
        String err, plate, st, kind, first;
        int amount;
        LocalDate to;
        List<String> ids;
        boolean late;
    }

    private Quote quote(String num, Object plate, String kind) {
        Quote q = new Quote();
        String p = normPlate(plate);
        if (p == null) { q.err = "Enter a plate like BJL1234"; return q; }
        String st = plateState(p);
        PlateRecord r = S.plates.get(p);
        q.plate = p;
        q.st = st;
        List<Fine> fs = openFines(p);
        if (!fs.isEmpty()) {
            // an open warning is paid first: the daily fee within 24 hours, with the fine after that
            q.kind = "fine";
            q.ids = new ArrayList<>();
            for (Fine f : fs) { q.amount += fineOwed(f); q.ids.add(f.id); if (fineLate(f)) q.late = true; }
            return q;
        }
        String ff = fineFirst(num, p);
        if (ff != null) { q.err = "Pay the unpaid warning on " + ff + " first (" + owed(ff) + " GMD). A warning is settled before any new pass."; q.first = ff; return q; }
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

    private String recordPay(String num, String prov, String plate, String kind, LocalDate to) { return recordPay(num, prov, plate, kind, to, 0, null); }

    private String recordPay(String num, String prov, String plate, String kind, LocalDate to, int fineAmount, List<String> ids) {
        Subscriber u = N(num);
        String ticket = "PN-" + Js.padStart(Integer.toString(S.seq++), 5);
        PlateRecord r = P(plate);
        int amt = kind.equals("fine") ? fineAmount : kind.equals("monthly") ? S.tariff.monthly : S.tariff.daily;
        link(num, plate);
        u.welcomed = true;
        u.prov = prov;
        if (kind.equals("fine")) {
            settleFines(plate, prov, ticket, num);
        } else if (kind.equals("monthly")) {
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
        l.t = hm(S.clock.min); l.day = dkey(S.clock.date); l.text = prov + " · " + plate + " " + (kind.equals("fine") ? "warning " + String.join(", ", ids) : kind) + " · " + ticket;
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
        Quote q = quote(num, plate, kind);
        if (q.err != null) return err(q.err);
        if (!paymentsEnabled) return err(q.kind.equals("fine") ? PAYMENTS_OFF + " Warnings can also be paid at the Council office." : PAYMENTS_OFF);
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
        String tk = recordPay(num, prov, q.plate, q.kind, q.to, q.amount, q.ids);
        String text;
        if (q.kind.equals("fine")) {
            PlateRecord pr = S.plates.get(q.plate);
            text = msg.okF(q.plate, q.amount, q.ids, plateState(q.plate).equals("DAILY") && pr.daily.ticket.equals(tk), tk, prov);
        } else text = q.kind.equals("monthly") ? msg.okM(q.plate, q.to, tk, prov) : msg.okD(q.plate, tk, prov);
        mt(num, text, "Receipt");
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

    /** An SMS from SUNU Park to a phone. */
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

    /** An SMS from a phone to SUNU Park. */
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
    /** W or WARN and a plate (the text is already upper case with single spaces). */
    private static final Pattern WARN_CMD = Pattern.compile("^(W|WARN) ");
    private static final Pattern WARN_CMD_PREFIX = Pattern.compile("^(W|WARN) +");

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
        if (U.equals("TERMS") || U.equals("T&C") || U.equals("TC")) return mt(num, msg.terms(), null);
        if (U.equals("M") || MONTHLY_CMD.matcher(U).find()) {
            String mp = U.equals("M") ? (u.last != null ? u.last : (u.plates.isEmpty() ? null : u.plates.get(0))) : normPlate(U.substring(2));
            if (mp == null) return mt(num, U.equals("M") ? "Text M and your plate, e.g. M BJL1234" : msg.bad(), null);
            Quote qm = quote(num, mp, "monthly");
            if (qm.first != null) return fineFirstOffer(num, qm.first, qm.plate);
            if (qm.err != null) return mt(num, qm.err, null);
            link(num, qm.plate);
            if (!paymentsEnabled) return mt(num, qm.kind.equals("fine") ? fineUnpayable(qm) : "Monthly pass " + qm.plate + ": " + S.tariff.monthly + " GMD. " + PAYMENTS_OFF, null);
            u.pending = new Pending(qm.plate, qm.kind);
            return mt(num, qm.kind.equals("fine") ? msg.foffer(qm.plate, qm.ids, qm.amount, qm.late) : msg.moffer(qm.plate, qm.to), null);
        }
        boolean digit = HAS_DIGIT.matcher(U).find();
        String p = normPlate(U);
        if (p == null && !digit) p = u.last != null ? u.last : (u.plates.isEmpty() ? null : u.plates.get(0));
        if (p == null) return mt(num, digit ? msg.bad() : msg.welcome(), null);
        String st = plateState(p);
        if (!openFines(p).isEmpty()) {
            Quote qf = quote(num, p, "daily");
            link(num, p);
            u.welcomed = true;
            if (!paymentsEnabled) return mt(num, fineUnpayable(qf), null);
            u.pending = new Pending(p, "fine");
            return mt(num, msg.foffer(qf.plate, qf.ids, qf.amount, qf.late), null);
        }
        String f1 = fineFirst(num, p);
        if (f1 != null) return fineFirstOffer(num, f1, p);
        if (!paidHours()) return mt(num, msg.free(), null);
        if (st.equals("ORG")) { Organisation o = orgOf(p); return mt(num, msg.org(p, o.name, o.id), null); }
        link(num, p);
        u.welcomed = true;
        if (st.equals("MONTHLY")) return mt(num, msg.mcov(p, S.plates.get(p).monthly.to), null);
        if (st.equals("DAILY")) return mt(num, msg.dcov(p, S.plates.get(p).daily.ticket), null);
        if (!paymentsEnabled) return mt(num, p + " is not paid today (" + S.tariff.daily + " GMD till 7pm). " + PAYMENTS_OFF, null);
        u.pending = new Pending(p, "choose");
        return mt(num, msg.choose(p, quote(num, p, "monthly").to), null);
    }

    /** Asked about one plate while another of the phone's plates has an unpaid warning: the warning is offered first. */
    private Object fineFirstOffer(String num, String first, String p) {
        Subscriber u = N(num);
        Quote q = quote(num, first, "daily");
        if (!paymentsEnabled) return mt(num, "Settle your warning before paying for " + p + ". " + fineUnpayable(q), null);
        u.pending = new Pending(first, "fine");
        return mt(num, "Settle your warning before paying for " + p + ". " + msg.foffer(q.plate, q.ids, q.amount, q.late), null);
    }

    /** While mobile money is off: what the warning costs and where to pay it. */
    private String fineUnpayable(Quote q) {
        return q.plate + " has an unpaid warning (" + String.join(", ", q.ids) + "): " + q.amount + " GMD" + (q.late ? " including the " + S.tariff.fine + " GMD fine" : "")
                + ". " + PAYMENTS_OFF + " You can pay it at the Council office.";
    }

    private Object answer(String num, String U) {
        Subscriber u = N(num);
        Pending pe = u.pending;
        int i = Integer.parseInt(U);
        if (pe.kind.equals("choose")) {
            /* a plate was texted: 1 daily pass, 2 monthly pass, then the provider */
            if (i == 1) { u.pending = new Pending(pe.plate, "daily"); return mt(num, msg.offer(pe.plate), null); }
            if (i != 2) return mt(num, "Reply 1 for a daily pass or 2 for a monthly pass.", null);
            Quote qm = quote(num, pe.plate, "monthly");
            if (qm.err != null) { u.pending = null; return mt(num, qm.err, null); }
            u.pending = new Pending(qm.plate, qm.kind);
            return mt(num, msg.moffer(qm.plate, qm.to), null);
        }
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
            return mt(num, "SUNU Park: shift started " + hm(S.clock.min) + ". Attendant " + o.id + ", " + roadLine(road) + ", " + SHIFTS.get(o.shift).label() + "."
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
        if (WARN_CMD.matcher(U).find()) {
            String wp = normPlate(WARN_CMD_PREFIX.matcher(U).replaceFirst(""));
            if (wp == null) return mt(num, "Text W and the plate, e.g. W BJL1234", null);
            if (!o.on) return mt(num, "Text START to begin your shift first.", null);
            if (!paidHours()) return mt(num, "Outside paid hours. Parking is free now.", null);
            return mt(num, warn(o, wp), null);
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
            List<Fine> fs = openFines(p), wd = new ArrayList<>();
            for (Fine f : fs) if (f.day.equals(d)) wd.add(f);
            m = !wd.isEmpty() ? p + ": UNPAID. Warning " + wd.get(0).id + " already issued at " + hm(wd.get(0).t) + ". Move on."
                    : !pu.isEmpty() ? p + ": UNPAID. Also unpaid at " + String.join(", ", pu) + " on your road. Card already left? Move on."
                    : p + ": UNPAID. No pass today.\nDriver there: show the Park & Pay card.\nNot there: issue a warning (text W " + p + ").";
            if (!fs.isEmpty() && wd.isEmpty()) {
                List<String> ids = new ArrayList<>();
                for (Fine f : fs) ids.add(f.id);
                m += "\nOpen warning " + String.join(", ", ids) + " from " + fmtD(Cal.fromDkey(fs.get(0).day)) + ".";
            }
            int k = 0;
            for (Fine f : S.fines) if (f.plate.equals(p) && !f.status.equals("cancelled") && !f.day.equals(d)) k++;
            m += k > 0 ? "\nRecord: " + k + " earlier warning" + (k > 1 ? "s" : "") + " (repeat offender)." : "\nRecord: no earlier warnings.";
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
        mt(num, "SUNU Park: Admin moved you to " + roadLine(road) + " from " + hm(S.clock.min) + " today, until the end of your shift. Your next checks are recorded there.", "Reassigned");
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
        o.active = true; o.supervisor = actor(f, "Supervisor Jobe"); o.isNew = true;
        S.off.put(ph, o);
        ch.officers.add(ph);
        N(ph, o.name).name = o.name;
        String first = o.name.contains(" ") ? o.name.substring(0, o.name.indexOf(' ')) : o.name;
        mt(ph, "SUNU Park: welcome " + first + ". You are Attendant " + id + " on " + roadLine(o.road) + ", " + SHIFTS.get(o.shift).label() + ". Text START to begin, a plate to check it, END to finish. Never take money.", "Welcome");
        Map<String, Object> r = ok();
        r.put("id", id);
        return r;
    }

    // ------------------------------------------------------------------ organisations

    private static boolean unpaid(Organisation.Invoice i) { return i.status.equals("open") || i.status.equals("proof"); }
    private static String cars(int n) { return n + (n == 1 ? " car" : " cars"); }
    private static String invNo(Organisation o) { return "INV-" + o.id.substring(4) + "-" + Js.padStart(Integer.toString(o.invoices.size() + 1), 3); }

    /** The lines of an invoice, from its cars: a year per car (opening and renewal) or the months left (cars added later). */
    private List<Organisation.Line> invLines(Organisation o, Organisation.Invoice inv) {
        List<Organisation.Line> r = new ArrayList<>();
        int n = inv.plates.size();
        if (inv.kind.equals("addon")) {
            int m = monthsLeft(o, inv.issued), each = (int) round((double) carYear(o) * m / 12);
            for (String p : inv.plates) r.add(new Organisation.Line(p + " · " + m + (m == 1 ? " month" : " months") + " to " + fmtY(o.coverTo), each));
            return r;
        }
        r.add(new Organisation.Line(cars(n) + " × " + gmd(S.tariff.annual) + " GMD a year", n * S.tariff.annual));
        r.add(new Organisation.Line("Discount " + round(o.disc * 100) + "%", (int) -round(n * S.tariff.annual * o.disc)));
        return r;
    }

    private void fillInvoice(Organisation o, Organisation.Invoice inv) {
        inv.lines = invLines(o, inv);
        inv.amount = inv.lines.stream().mapToInt(l -> l.a).sum();
    }

    private Organisation.Invoice newInvoice(Organisation o, String kind, List<String> plates, LocalDate due, LocalDate end, String label) {
        Organisation.Invoice inv = new Organisation.Invoice();
        inv.no = invNo(o); inv.kind = kind; inv.month = label; inv.issued = today(); inv.due = due; inv.end = end;
        inv.plates = new ArrayList<>(plates); inv.status = "open";
        fillInvoice(o, inv);
        o.invoices.add(0, inv);
        return inv;
    }

    /** New cars wait on an invoice: the months left if the year is running, else the opening invoice for a full year. */
    private Organisation.Invoice invoiceCars(Organisation o, List<String> plates) {
        if (plates.isEmpty()) return null;
        LocalDate t = today();
        String c = o.contact.num;
        if (o.coverTo != null && covering(o)) {
            Organisation.Invoice ni = newInvoice(o, "addon", plates, t, o.coverTo, "To " + fmtY(o.coverTo));
            mt(c, "SUNU Park: invoice " + ni.no + " for " + plates.size() + " more " + (plates.size() == 1 ? "car" : "cars") + " to " + fmtY(o.coverTo) + ": GMD " + gmd(ni.amount)
                    + ". The cars are covered once it is paid. Pay in the portal or by bank transfer quoting " + ni.no + ".", "Invoice");
            return ni;
        }
        for (Organisation.Invoice i : o.invoices) {
            if (i.kind.equals("annual") && unpaid(i)) {
                for (String p : plates) if (!i.plates.contains(p)) i.plates.add(p);
                fillInvoice(o, i);
                return i;
            }
        }
        Organisation.Invoice ai = newInvoice(o, "annual", plates, t, addDays(addYear(t), -1), "12 months from payment");
        mt(c, "SUNU Park: invoice " + ai.no + " for " + cars(plates.size()) + ", one year paid upfront: GMD " + gmd(ai.amount)
                + ". The cars are covered for 12 months from the day it is paid. Pay by bank transfer quoting " + ai.no + ".", "Invoice");
        return ai;
    }

    private void orgDay(Organisation o) {
        if (o.status.equals("new") || o.coverTo == null) return;
        LocalDate d = today();
        String c = o.contact.num;
        boolean renewalOpen = false;
        for (Organisation.Invoice i : o.invoices) if (i.kind.equals("renewal") && unpaid(i)) renewalOpen = true;
        // the renewal invoice: 30 days before the year ends (or at once for an account from 1.0 with less time left)
        if (daysBetween(d, o.coverTo) <= 30 && !renewalOpen) {
            // the renewal takes the covered cars and any car still waiting on an add-on invoice (which is cancelled)
            List<String> list = new ArrayList<>();
            for (Organisation.FleetPlate x : activePlates(o, o.coverTo)) list.add(x.plate);
            for (Organisation.Invoice i : o.invoices) {
                if (i.kind.equals("addon") && unpaid(i)) {
                    for (String q : i.plates) if (!list.contains(q)) list.add(q);
                    i.status = "void";
                }
            }
            if (!list.isEmpty()) {
                LocalDate start = addDays(o.coverTo, 1), end = addDays(addYear(start), -1);
                Organisation.Invoice ri = newInvoice(o, "renewal", list, start, end, fmtY(start) + " – " + fmtY(end));
                mt(c, "SUNU Park: your fleet cover ends " + fmtY(o.coverTo) + ". Renewal invoice " + ri.no + " for " + cars(list.size()) + ": GMD " + gmd(ri.amount) + ", due " + fmtY(start)
                        + ". Pay in the portal, or by bank transfer quoting " + ri.no + ".", "Invoice");
            }
        }
        Organisation.Invoice inv = null;
        for (Organisation.Invoice i : o.invoices) if (i.kind.equals("renewal") && unpaid(i) && daysBetween(i.due, d) >= 0) { inv = i; break; }
        if (inv != null) {
            long g = daysBetween(inv.due, d) + 1;
            if (g <= S.tariff.grace) {
                o.status = "grace";
                o.graceDay = (int) g;
                mt(c, "SUNU Park: " + inv.no + " is overdue. Grace day " + g + " of " + S.tariff.grace + ": your cars stay covered. Pay now to keep them covered.", "Grace");
            } else if (!o.status.equals("reverted")) {
                o.status = "reverted";
                mt(c, "SUNU Park: " + inv.no + " is still unpaid after " + S.tariff.grace + " days of grace. Your " + cars(activePlates(o, null).size()) + " are now UNPAID and drivers must pay daily. Pay the invoice to restore cover.", "Plates reverted");
            }
        }
    }

    private Map<String, Object> payInvoice(Organisation o, Organisation.Invoice inv, String method) {
        if (inv.status.equals("paid")) return err(inv.no + " is already paid.");
        if (inv.status.equals("void")) return err(inv.no + " was cancelled.");
        LocalDate t = today();
        inv.status = "paid"; inv.method = method; inv.paidOn = t;
        boolean wasOff = o.status.equals("grace") || o.status.equals("reverted");
        if (inv.kind.equals("annual")) { o.coverFrom = t; o.coverTo = addDays(addYear(t), -1); inv.end = o.coverTo; inv.month = fmtY(t) + " – " + fmtY(o.coverTo); }
        else if (inv.kind.equals("renewal")) { o.coverFrom = inv.due; o.coverTo = inv.end; }
        for (Organisation.FleetPlate x : o.plates) if (x.from == null && x.to == null && inv.plates.contains(x.plate)) x.from = t;
        o.status = "active";
        o.graceDay = 0;
        LedgerEntry l = new LedgerEntry();
        l.t = hm(S.clock.min); l.day = dkey(S.clock.date); l.text = method + " · " + o.id + " " + inv.no; l.amt = "+" + gmd(inv.amount); l.amount = inv.amount; l.src = "org";
        ledger(l);
        int n = activePlates(o, null).size();
        mt(o.contact.num, "SUNU Park: payment received for " + inv.no + ", GMD " + gmd(inv.amount) + ". Thank you." + (wasOff ? " Cover is restored:" : "") + " Your " + cars(n) + " " + (n == 1 ? "is" : "are")
                + " covered to " + fmtY(o.coverTo) + ".", "Payment received");
        return ok();
    }

    private Map<String, Object> createOrg(Map<String, Object> f) {
        String ph = Js.digits(strOr(f.get("phone"), ""));
        if (trim(strOr(f.get("name"), "")).isEmpty()) return err("Enter the organisation name.");
        double plates = Js.numOrNaN(f.get("plates"));
        if (!(plates > 0)) return err("Enter the number of cars agreed.");
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
        mt(ph, "Welcome to SUNU Park, " + o.name + " (" + id + "). Sign in to the SUNU Park organisation portal with this number to add your cars. Cars are paid upfront for a year. Your account manager will help you.", "Welcome");
        Map<String, Object> r = ok();
        r.put("id", id);
        return r;
    }

    private void addFleetPlate(Organisation o, String p, Object dept, Object driver) {
        Organisation.FleetPlate x = new Organisation.FleetPlate();
        x.plate = p; x.dept = strOr(dept, "—"); x.driver = strOr(driver, "—");
        o.plates.add(x);
    }

    /** A car leaves the account: a waiting car also leaves its unpaid invoice (cancelled when empty); a covered car stops tomorrow (no refund). */
    private void removeFleetPlate(Organisation o, String p) {
        Organisation.FleetPlate x = null;
        for (Organisation.FleetPlate y : o.plates) if (y.plate.equals(p) && y.to == null) { x = y; break; }
        if (x == null) return;
        if (x.from == null) o.plates.remove(x);
        else x.to = addDays(today(), 1);
        for (int i = o.invoices.size() - 1; i >= 0; i--) {
            Organisation.Invoice inv = o.invoices.get(i);
            if (!unpaid(inv) || !inv.plates.contains(p)) continue;
            inv.plates.removeIf(q -> q.equals(p));
            if (!inv.plates.isEmpty()) fillInvoice(o, inv); else inv.status = "void";
        }
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

    // ------------------------------------------------------------------ Council announcements

    static final List<String> ANN_KINDS = List.of("Event", "Announcement", "Notice");
    static final List<String> ANN_THEMES = List.of("blue", "yellow", "green", "red");
    private static final Pattern DAY = Pattern.compile("^(\\d{4})-(\\d{2})-(\\d{2})$");
    private static final Pattern LINK = Pattern.compile("^https?://" + Js.NON_SPACES + "$", Pattern.CASE_INSENSITIVE);

    /** "2026-11-07" to a day, or null. */
    static LocalDate parseDay(Object s) {
        java.util.regex.Matcher m = DAY.matcher(trim(strOr(s, "")));
        if (!m.matches()) return null;
        int y = Integer.parseInt(m.group(1)), mo = Integer.parseInt(m.group(2)), d = Integer.parseInt(m.group(3));
        if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
        return Cal.date(y, mo - 1, d);
    }

    /** Shown to drivers today? */
    public boolean annLive(Announcement x) {
        LocalDate t = today();
        return x.status.equals("live") && !x.from.isAfter(t) && !t.isAfter(x.to);
    }

    private Map<String, Object> announce(Map<String, Object> f) {
        String title = trim(strOr(f.get("title"), "")), text = trim(strOr(f.get("text"), "")), link = trim(strOr(f.get("link"), "")), when = trim(strOr(f.get("when"), ""));
        String kind = f.get("kind") instanceof String k && ANN_KINDS.contains(k) ? k : "Announcement";
        String theme = f.get("theme") instanceof String th && ANN_THEMES.contains(th) ? th : "blue";
        if (title.isEmpty()) return err("Add a title.");
        if (title.length() > 60) return err("Keep the title to 60 characters.");
        if (text.length() > 180) return err("Keep the text to 180 characters.");
        if (when.length() > 40) return err("Keep the date line to 40 characters.");
        if (link.length() > 200) return err("The link is too long.");
        if (!link.isEmpty() && !LINK.matcher(link).matches()) return err("The link must start with https://");
        LocalDate from = truthy(f.get("from")) ? parseDay(f.get("from")) : today();
        LocalDate to = truthy(f.get("to")) ? parseDay(f.get("to")) : (from != null ? addDays(from, 14) : null);
        if (from == null || to == null) return err("Enter the dates like 2026-11-07.");
        if (to.isBefore(from)) return err("The end date is before the start date.");
        int max = S.ann.stream().mapToInt(x -> Integer.parseInt(x.id.substring(3))).max().orElse(0);
        Announcement x = new Announcement();
        x.id = "AN-" + Js.padStart(Integer.toString(max + 1), 3);
        x.kind = kind; x.title = title; x.text = text; x.when = when; x.link = link; x.theme = theme;
        x.from = from; x.to = to; x.status = "live"; x.created = today(); x.by = actor(f, "Aisha K.");
        S.ann.add(0, x);
        ch.announcements = true;
        Map<String, Object> r = ok(); r.put("id", x.id); r.put("live", annLive(x)); return r;
    }

    private Announcement announcement(Object id) {
        for (Announcement x : S.ann) if (x.id.equals(id)) return x;
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
        for (Fine f : S.fines)
            if (f.status.equals("open") && daysBetween(Cal.fromDkey(f.day), S.clock.date) == 1)
                for (String n : plateNums(f.plate)) mt(n, msg.fremind(f, SHORT_CODE), "Reminder");
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

    private static Announcement seedAnnouncement(String id, String kind, String title, String text, String when, String theme, LocalDate from, LocalDate to, LocalDate created) {
        Announcement x = new Announcement();
        x.id = id; x.kind = kind; x.title = title; x.text = text; x.when = when; x.link = ""; x.theme = theme;
        x.from = from; x.to = to; x.status = "live"; x.created = created; x.by = "Aisha K.";
        return x;
    }

    private void resetTariff() {
        Tariff t = new Tariff();
        t.daily = 200; t.monthly = 4000; t.annual = 48000; t.fine = 1880; t.grace = 5; t.walletLimit = 10000;
        t.log.add(new Tariff.Change("28 Oct 2026", "Pilot tariff published: 200 GMD a day, 4,000 GMD a month, 48,000 GMD a car a year for organisations; 1,880 GMD fine for rule breakers (a warning not paid within 24 hours). Paid hours 7am–7pm, Mon–Sat.",
                "Agreed points with BCC", "Aisha K."));
        S.tariff = t;
    }

    /** Back to the pilot's starting data. */
    public void reset() {
        S.clock = new Clock();
        S.clock.date = Cal.date(2026, 10, 2);
        S.clock.min = 9 * 60;
        S.clock.run = true;
        S.plates.clear(); S.nums.clear(); S.seq = 12; S.log.clear(); S.out.clear(); S.checks.clear(); S.exc.clear(); S.fines.clear();
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
        o.created = Cal.date(2026, 8, 20);
        o.coverFrom = Cal.date(2026, 9, 1); o.coverTo = Cal.date(2027, 8, 30);
        String[][] fleet = {{"BJL7001", "Branch ops", "Kebba J."}, {"BJL7002", "Cash logistics", "Fatima N."}, {"BJL7003", "Facilities", "Ousman B."}, {"BJL7009", "Branch ops", "Lamin D."}};
        for (String[] f : fleet) {
            Organisation.FleetPlate x = new Organisation.FleetPlate();
            x.plate = f[0]; x.dept = f[1]; x.driver = f[2]; x.from = Cal.date(2026, 9, 1);
            o.plates.add(x);
        }
        Organisation.Invoice inv = new Organisation.Invoice();
        inv.no = "INV-014-001"; inv.kind = "annual"; inv.month = "1 Oct 2026 – 30 Sep 2027"; inv.issued = Cal.date(2026, 8, 25); inv.due = Cal.date(2026, 8, 25); inv.end = Cal.date(2027, 8, 30);
        inv.plates = new ArrayList<>(List.of("BJL7001", "BJL7002", "BJL7003", "BJL7009"));
        inv.lines.add(new Organisation.Line("4 cars × 48,000 GMD a year", 192000));
        inv.lines.add(new Organisation.Line("Discount 15%", -28800));
        inv.amount = 163200; inv.status = "paid"; inv.method = "Bank transfer"; inv.paidOn = Cal.date(2026, 9, 1);
        o.invoices.add(inv);
        S.orga.put(o.id, o);
        N("7101234", "Mariama S.");
        /* a car already paid on Leman Street this morning */
        int keep = S.clock.min;
        S.clock.min = 8 * 60 + 15;
        recordPay("7066000", "Wave", "BJL4545", "daily", null);
        S.clock.min = keep;
        N("7066000").name = "A driver";
        S.ann.clear();
        S.ann.add(seedAnnouncement("AN-002", "Event", "Banjul Day clean-up", "Join the Council and your neighbours to clean the city centre. Gloves and bags provided.",
                "Sat 7 Nov · 8am at Arch 22", "green", Cal.date(2026, 10, 1), Cal.date(2026, 10, 7), Cal.date(2026, 9, 30)));
        S.ann.add(seedAnnouncement("AN-001", "Announcement", "Pay for parking from your phone",
                "SUNU Park is live on Wellington Road, Liberation Avenue, Independence Drive, Leman Street and Russell Street.",
                "", "blue", Cal.date(2026, 9, 28), Cal.date(2026, 11, 31), Cal.date(2026, 9, 28)));
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
                if (isOfficer(num)) return err("That number is registered to a SUNU Park attendant.");
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
            case "terms.accept": {
                String num = str(a.get("num"));
                if (num.isEmpty()) return err("Sign in first.");
                String tv = trim(strOr(a.get("v"), ""));
                if (tv.length() > 20) tv = tv.substring(0, 20);
                if (tv.isEmpty()) return err("Which terms?");
                Subscriber tu = N(num);
                Subscriber.Terms tt = new Subscriber.Terms(); tt.v = tv; tt.day = dkey(S.clock.date); tt.t = hm(S.clock.min);
                tu.terms = tt;
                return ok();
            }
            case "terms.notify": {
                String nv = trim(strOr(a.get("v"), ""));
                if (nv.length() > 20) nv = nv.substring(0, 20);
                if (nv.isEmpty()) return err("Which terms?");
                List<String> to = new ArrayList<>();
                for (Map.Entry<String, Subscriber> e : S.nums.entrySet()) { Subscriber x = e.getValue(); if (x.welcomed || !x.plates.isEmpty() || isOfficer(e.getKey())) to.add(e.getKey()); }
                java.util.Collections.sort(to);
                for (String k : to) mt(k, msg.termsNew(nv), "Terms");
                Map<String, Object> r = ok(); r.put("sent", to.size()); return r;
            }
            case "sms": {
                Object reply = smsIn(Js.lastChars(Js.digits(str(a.get("num"))), 7), a.get("text"));
                Map<String, Object> r = ok();
                if (reply != null) r.put("reply", reply);
                return r;
            }
            case "officer.login": {
                String on = Js.lastChars(Js.digits(strOr(a.get("num"), "")), 7);
                if (!isOfficer(on)) return err("This number is not a registered SUNU Park attendant. Ask your supervisor to register it in the back office.");
                Map<String, Object> r = ok(); r.put("num", on); return r;
            }
            case "org.sendCode":
            case "org.login": {
                String ph = Js.lastChars(Js.digits(strOr(a.get("phone"), "")), 7);
                Organisation org = null;
                for (Organisation o : S.orga.values()) if (o.contact.num.equals(ph)) org = o;
                if (org == null) return err("This number is not the contact on a SUNU Park organisation account.");
                if (type.equals("org.sendCode")) mt(ph, "SUNU Park portal code: " + CODE + ". It expires in 10 minutes. Do not share it.", "Code");
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
                Organisation.Invoice ia = invoiceCars(oa, List.of(ap));
                Map<String, Object> r = ok(); r.put("plate", ap); r.put("proRata", pr); r.put("inv", ia.no); return r;
            }
            case "org.addPlates": {
                Organisation ob = org(str(a.get("org")));
                if (ob == null) return new LinkedHashMap<>(NO_ORG);
                List<String> added = new ArrayList<>();
                if (a.get("rows") instanceof List<?> rows) {
                    for (Object row : rows) {
                        Map<String, Object> x = asMap(row);
                        String q = normPlate(x.get("p"));
                        if (q != null && !onAccount(ob, q)) { addFleetPlate(ob, q, x.get("dept"), x.get("driver")); added.add(q); }
                    }
                }
                Organisation.Invoice ib = invoiceCars(ob, added);
                Map<String, Object> r = ok(); r.put("added", added.size()); r.put("inv", ib == null ? null : ib.no); return r;
            }
            case "org.removePlate": {
                Organisation oc = org(str(a.get("org")));
                if (oc == null) return new LinkedHashMap<>(NO_ORG);
                removeFleetPlate(oc, str(a.get("plate")));
                return ok();
            }
            case "org.uploadProof": {
                Organisation od = org(str(a.get("org")));
                if (od == null) return new LinkedHashMap<>(NO_ORG);
                Organisation.Invoice iv = invoice(od, a.get("inv"));
                if (iv == null) return err("Unknown invoice");
                if (!unpaid(iv)) return err(iv.no + " is " + (iv.status.equals("paid") ? "already paid." : "cancelled."));
                iv.status = "proof";
                iv.proofOn = today();
                return ok();
            }
            case "org.payWallet": {
                Organisation oe = org(str(a.get("org")));
                if (oe == null) return new LinkedHashMap<>(NO_ORG);
                Organisation.Invoice iw = invoice(oe, a.get("inv"));
                if (iw == null) return err("Unknown invoice");
                if (!paymentsEnabled) return err("Paying by mobile money opens soon. Pay by bank transfer quoting " + iw.no + ".");
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
                Tariff T = S.tariff;
                double v2 = a.get("daily") == null ? T.daily : round(Js.num(a.get("daily")));
                double va = a.get("annual") == null ? T.annual : round(Js.num(a.get("annual")));
                double vf = a.get("fine") == null ? T.fine : round(Js.num(a.get("fine")));
                if (!(v2 >= 50 && v2 <= 2000)) return err("Enter a daily price between 50 and 2,000 GMD.");
                if (!(va >= 1000 && va <= 1000000)) return err("Enter a yearly price per car between 1,000 and 1,000,000 GMD.");
                if (!(vf >= 0 && vf <= 5000)) return err("Enter a fine between 0 and 5,000 GMD.");
                if (v2 == T.daily && va == T.annual && vf == T.fine) return err("No change to publish.");
                if (trim(strOr(a.get("auth"), "")).isEmpty()) return err("Add the Council authority reference. Tariff changes need one.");
                List<String> what = new ArrayList<>();
                if (v2 != T.daily) what.add("Daily " + T.daily + " → " + (int) v2 + " GMD; monthly " + gmd(T.monthly) + " → " + gmd(monthlyFor(v2)) + " GMD");
                if (va != T.annual) what.add("Organisations " + gmd(T.annual) + " → " + gmd(va) + " GMD a car a year");
                if (vf != T.fine) what.add("Fine " + T.fine + " → " + (int) vf + " GMD");
                T.daily = (int) v2; T.monthly = monthlyFor(v2); T.annual = (int) va; T.fine = (int) vf;
                Tariff.Change c = new Tariff.Change(fmtD(S.clock.date) + " " + S.clock.date.getYear() + " " + hm(S.clock.min),
                        String.join("; ", what), trim(str(a.get("auth"))), actor(a, "Aisha K."));
                S.tariff.log.add(c);
                ch.tariff = true;
                ch.tariffLog.add(c);
                return ok();
            }
            case "back.settleFine": {
                Fine fs = fine(a.get("id"));
                if (fs == null) return err("Unknown warning");
                if (!fs.status.equals("open")) return err(fs.id + " is not open.");
                String ref = trim(strOr(a.get("ref"), ""));
                if (ref.isEmpty()) return err("Add the receipt or reference number of the payment.");
                int amt = fineOwed(fs);
                boolean today2 = settleOne(fs, "Council office · " + ref);
                LedgerEntry l = new LedgerEntry();
                l.t = hm(S.clock.min); l.day = dkey(S.clock.date); l.text = "Council office · " + fs.plate + " warning " + fs.id + " · " + ref; l.amt = "+" + gmd(amt); l.amount = amt; l.src = "fine"; l.plate = fs.plate;
                ledger(l);
                for (String n : plateNums(fs.plate))
                    mt(n, "SUNU Park: payment of " + amt + " GMD for warning " + fs.id + " (" + fs.plate + ") was received at the Council office. Thank you." + (today2 ? " " + fs.plate + " is PAID till 7pm today." : ""), "Receipt");
                Map<String, Object> r = ok(); r.put("amount", amt); return r;
            }
            case "back.cancelFine": {
                Fine fc = fine(a.get("id"));
                if (fc == null) return err("Unknown warning");
                if (!fc.status.equals("open")) return err(fc.id + " is not open.");
                String why = trim(strOr(a.get("reason"), ""));
                if (why.isEmpty()) return err("Say why the warning is cancelled.");
                fc.status = "cancelled"; fc.note = why;
                ch.fines.add(fc.id);
                for (String n : plateNums(fc.plate)) mt(n, "SUNU Park: warning " + fc.id + " for " + fc.plate + " is cancelled. Nothing to pay.", "Warning");
                return ok();
            }
            case "back.announce": return announce(a);
            case "back.announceStatus": {
                Announcement x = announcement(a.get("id"));
                if (x == null) return err("Unknown announcement");
                x.status = "hidden".equals(a.get("status")) ? "hidden" : "live";
                ch.announcements = true;
                return ok();
            }
            case "back.announceDelete": {
                Announcement x = announcement(a.get("id"));
                if (x == null) return err("Unknown announcement");
                S.ann.remove(x);
                ch.announcements = true;
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
