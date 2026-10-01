package com.innovii.parkna.service;

import com.innovii.parkna.auth.Role;
import com.innovii.parkna.auth.Session;
import com.innovii.parkna.config.AppConfig;
import com.innovii.parkna.engine.Cal;
import com.innovii.parkna.engine.ParkingEngine;
import com.innovii.parkna.json.Json;
import com.innovii.parkna.model.Announcement;
import com.innovii.parkna.model.Check;
import com.innovii.parkna.model.Fine;
import com.innovii.parkna.model.LedgerEntry;
import com.innovii.parkna.model.Officer;
import com.innovii.parkna.model.Organisation;
import com.innovii.parkna.model.OutMessage;
import com.innovii.parkna.model.ParkedCar;
import com.innovii.parkna.model.PlateRecord;
import com.innovii.parkna.model.Receipt;
import com.innovii.parkna.model.State;
import com.innovii.parkna.model.Subscriber;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * What each signed-in person receives. Staff get everything; a driver gets their own number, plates, receipts and
 * the checks on their plates; an attendant their own record and checks; an organisation contact their account.
 * Nobody receives another person's phone number, receipts or messages. Same JSON shape as the full state, so the
 * screens read it the same way, plus "ME" (who is signed in) and "MODE" (what this server offers).
 */
final class Views {
    private final AppConfig cfg;
    private java.util.function.Supplier<String> termsV = () -> "1";

    Views(AppConfig cfg) { this.cfg = cfg; }

    /** Where the version of the terms in force comes from. */
    void termsVersion(java.util.function.Supplier<String> v) { this.termsV = v; }

    /** The view for one session. {@code full} is the full state JSON, already built once for all staff. */
    String forSession(ParkingEngine e, Session s, String full) {
        if (s.role() == Role.POLICE) return withHeader(e, s, Json.write(police(e)));
        if (s.staff()) return withHeader(e, s, full);
        String body = switch (s.role()) {
            case DRIVER -> Json.write(driver(e, s.subject()));
            case OFFICER -> Json.write(officer(e, s.subject()));
            case ORG -> Json.write(org(e, s.orgId()));
            default -> Json.write(base(e));
        };
        return withHeader(e, s, body);
    }

    Map<String, Object> mode(ParkingEngine e) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("mode", cfg.mode.name().toLowerCase());
        m.put("demo", cfg.mode == AppConfig.Mode.DEMO);
        m.put("demoControls", cfg.demoControls);
        m.put("payments", e.paymentsEnabled());
        m.put("clock", cfg.clockMode.name().toLowerCase());
        m.put("otpInApp", cfg.auth.otpInApp());
        m.put("shortcode", cfg.sms.shortCode());
        m.put("daily", e.state().tariff.daily);
        m.put("termsV", termsV.get());
        m.put("smsSimulator", cfg.smsSimulator);
        // a production server still holding the demo story (e.g. upgraded from a demo install): the back office warns
        if (cfg.mode == AppConfig.Mode.PRODUCTION && e.state().off.values().stream().anyMatch(o -> o.bg != null)) m.put("demoData", true);
        if (!cfg.supportPhone.isEmpty()) m.put("supportPhone", cfg.supportPhone);
        if (!cfg.supportEmail.isEmpty()) m.put("supportEmail", cfg.supportEmail);
        return m;
    }

    private String withHeader(ParkingEngine e, Session s, String body) {
        Map<String, Object> me = new LinkedHashMap<>();
        me.put("role", s.role().name().toLowerCase());
        me.put("staff", s.staff());
        if (s.staff()) { me.put("username", s.subject()); me.put("name", s.name()); me.put("mustChangePassword", s.mustChangePassword()); }
        else me.put("num", s.subject());
        if (s.orgId() != null) me.put("org", s.orgId());
        if (s.role() == Role.DRIVER) {
            Subscriber u = e.state().nums.get(s.subject());
            me.put("needName", u == null || u.name.equals("+220 " + s.subject()));
        }
        String head = "{\"ME\":" + Json.write(me) + ",\"MODE\":" + Json.write(mode(e));
        if ((s.staff() || s.role() == Role.ORG) && cfg.billing.configured()) {
            Map<String, Object> bank = new LinkedHashMap<>();
            bank.put("bank", cfg.billing.bankName()); bank.put("accountName", cfg.billing.accountName()); bank.put("accountNumber", cfg.billing.accountNumber());
            head += ",\"BANK\":" + Json.write(bank);
        }
        return body.length() > 2 ? head + "," + body.substring(1) : head + "}";
    }

    /** The parts everyone may see: clock, prices, and the Council announcements that are live today. */
    private Map<String, Object> base(ParkingEngine e) {
        State st = e.state();
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("v", st.ver);
        m.put("B", st.clock);
        m.put("PLATES", new LinkedHashMap<>());
        m.put("NUMS", new LinkedHashMap<>());
        m.put("LOG", List.of());
        m.put("OUT", List.of());
        m.put("CHECKS", List.of());
        m.put("OFF", new LinkedHashMap<>());
        m.put("ORGA", new LinkedHashMap<>());
        m.put("PARK", List.of());
        m.put("EXC", List.of());
        List<Announcement> live = new ArrayList<>();
        for (Announcement a : st.ann) if (e.annLive(a)) live.add(a);
        m.put("ANN", live);
        m.put("FINES", List.of());
        m.put("T", st.tariff);
        m.put("seq", 0);
        return m;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> driver(ParkingEngine e, String num) {
        State st = e.state();
        Map<String, Object> m = base(e);
        Subscriber u = st.nums.get(num);
        if (u == null) return m;
        ((Map<String, Object>) m.get("NUMS")).put(num, u);
        Set<String> plates = new LinkedHashSet<>(u.plates);
        int n = 0;
        for (Receipt r : u.receipts) { if (n++ >= 50) break; plates.add(r.plate); }
        putPlates(st, m, plates);
        m.put("CHECKS", checksOn(st, new LinkedHashSet<>(u.plates), 62, 200));
        m.put("ORGA", orgsCovering(st, plates));
        m.put("FINES", finesOn(st, plates, null));
        return m;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> officer(ParkingEngine e, String num) {
        State st = e.state();
        Map<String, Object> m = base(e);
        Officer o = st.off.get(num);
        if (o == null) return m;
        ((Map<String, Object>) m.get("OFF")).put(num, o);
        Subscriber u = st.nums.get(num);
        if (u != null) ((Map<String, Object>) m.get("NUMS")).put(num, u);
        String road = e.currentRoad(o), today = Cal.dkey(st.clock.date);
        LocalDate since = st.clock.date.minusDays(14);
        List<Check> checks = new ArrayList<>();
        for (Check c : st.checks) {
            boolean mine = c.off.equals(o.id) && !Cal.fromDkey(c.day).isBefore(since);
            boolean roadToday = c.day.equals(today) && c.road.equals(road);
            if (mine || roadToday) checks.add(c);
        }
        if (checks.size() > 400) checks = checks.subList(checks.size() - 400, checks.size());
        m.put("CHECKS", checks);
        Set<String> plates = new LinkedHashSet<>();
        for (Check c : checks) plates.add(c.plate);
        putPlates(st, m, plates);
        m.put("ORGA", orgsCovering(st, plates));
        m.put("FINES", finesOn(st, plates, o.id));
        if (cfg.mode == AppConfig.Mode.DEMO) {
            List<ParkedCar> park = new ArrayList<>();
            for (ParkedCar c : st.park) if (c.road.equals(road)) park.add(new ParkedCar(c.road, c.bay, c.plate, null));
            m.put("PARK", park);
        }
        return m;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> org(ParkingEngine e, String orgId) {
        State st = e.state();
        Map<String, Object> m = base(e);
        Organisation o = orgId == null ? null : st.orga.get(orgId);
        if (o == null) return m;
        ((Map<String, Object>) m.get("ORGA")).put(o.id, o);
        Subscriber contact = st.nums.get(o.contact.num);
        if (contact != null) ((Map<String, Object>) m.get("NUMS")).put(contact.num, contact);
        List<OutMessage> out = new ArrayList<>();
        for (OutMessage x : st.out) if (x.num.equals(o.contact.num)) out.add(x);
        m.put("OUT", out);
        Set<String> fleet = new LinkedHashSet<>();
        for (Organisation.FleetPlate x : o.plates) fleet.add(x.plate);
        putPlates(st, m, fleet);
        m.put("CHECKS", checksOn(st, fleet, 62, 2000));
        m.put("FINES", finesOn(st, fleet, null));
        List<LedgerEntry> log = new ArrayList<>();
        for (LedgerEntry l : st.log) {
            boolean mineInvoice = "org".equals(l.src) && l.text != null && l.text.contains(" " + o.id + " ");
            boolean fleetPlate = l.plate != null && fleet.contains(l.plate);
            if (mineInvoice || fleetPlate) log.add(withoutPayer(l));
        }
        m.put("LOG", log);
        return m;
    }

    /**
     * The police: every warning (open ones and those of the last 62 days), the plates' records, and who to contact:
     * the name and number of the phones linked to a plate with an open warning. No payments, wallets or messages.
     */
    @SuppressWarnings("unchecked")
    private Map<String, Object> police(ParkingEngine e) {
        State st = e.state();
        Map<String, Object> m = base(e);
        LocalDate since = st.clock.date.minusDays(62);
        List<Fine> fines = new ArrayList<>();
        Set<String> plates = new LinkedHashSet<>(), open = new LinkedHashSet<>();
        for (Fine f : st.fines) plates.add(f.plate);
        for (Fine f : st.fines) {
            if (f.status.equals("open")) open.add(f.plate);
            if (f.status.equals("open") || !Cal.fromDkey(f.day).isBefore(since)) fines.add(withoutPhone(f));
        }
        m.put("FINES", fines);
        putPlates(st, m, plates);
        m.put("CHECKS", checksOn(st, plates, 62, 3000));
        m.put("ORGA", orgsCovering(st, plates));
        Map<String, Object> nums = (Map<String, Object>) m.get("NUMS");
        for (Subscriber u : st.nums.values()) {
            if (st.off.containsKey(u.num)) continue;
            List<String> mine = new ArrayList<>();
            for (String p : u.plates) if (open.contains(p)) mine.add(p);
            if (mine.isEmpty()) continue;
            Map<String, Object> c = new LinkedHashMap<>();
            c.put("num", u.num); c.put("name", u.name); c.put("plates", mine);
            nums.put(u.num, c);
        }
        Map<String, Object> off = (Map<String, Object>) m.get("OFF");
        for (Officer o : st.off.values()) {
            Map<String, Object> c = new LinkedHashMap<>();
            c.put("id", o.id); c.put("name", o.name); c.put("road", o.road); c.put("active", o.active);
            off.put(o.id, c);
        }
        return m;
    }

    /** Plate records without the payers (other people's phone numbers). */
    @SuppressWarnings("unchecked")
    private static void putPlates(State st, Map<String, Object> m, Set<String> plates) {
        Map<String, Object> out = (Map<String, Object>) m.get("PLATES");
        for (String p : plates) {
            PlateRecord r = st.plates.get(p);
            if (r == null) continue;
            PlateRecord c = new PlateRecord();
            c.plate = r.plate; c.daily = r.daily; c.monthly = r.monthly;
            out.put(p, c);
        }
    }

    /** Warnings on these plates (open ones always, others from the last 62 days), plus those this attendant issued in 14 days. */
    private static List<Fine> finesOn(State st, Set<String> plates, String attendant) {
        LocalDate since = st.clock.date.minusDays(62), mine = st.clock.date.minusDays(14);
        List<Fine> out = new ArrayList<>();
        for (Fine f : st.fines) {
            LocalDate d = Cal.fromDkey(f.day);
            boolean onPlate = plates.contains(f.plate) && (f.status.equals("open") || !d.isBefore(since));
            boolean issued = attendant != null && f.off.equals(attendant) && !d.isBefore(mine);
            if (onPlate || issued) out.add(withoutPhone(f));
        }
        return out;
    }

    /** A warning without the number that paid it. */
    private static Fine withoutPhone(Fine f) {
        if (f.settled == null || f.settled.num == null) return f;
        Fine c = new Fine();
        c.id = f.id; c.plate = f.plate; c.day = f.day; c.t = f.t; c.road = f.road; c.off = f.off; c.base = f.base; c.fine = f.fine; c.status = f.status; c.note = f.note;
        Fine.Settled x = new Fine.Settled();
        x.day = f.settled.day; x.t = f.settled.t; x.amount = f.settled.amount; x.late = f.settled.late; x.method = f.settled.method; x.ticket = f.settled.ticket;
        c.settled = x;
        return c;
    }

    private static List<Check> checksOn(State st, Set<String> plates, int days, int max) {
        LocalDate since = st.clock.date.minusDays(days);
        List<Check> out = new ArrayList<>();
        for (Check c : st.checks) if (plates.contains(c.plate) && !Cal.fromDkey(c.day).isBefore(since)) out.add(c);
        return out.size() > max ? out.subList(out.size() - max, out.size()) : out;
    }

    /** Just enough of an organisation to tell whether a plate is covered and until when: no contact, no other plates. */
    private static Map<String, Object> orgsCovering(State st, Set<String> plates) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (Organisation o : st.orga.values()) {
            List<Organisation.FleetPlate> mine = new ArrayList<>();
            for (Organisation.FleetPlate x : o.plates) if (plates.contains(x.plate)) mine.add(x);
            if (mine.isEmpty()) continue;
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("id", o.id);
            r.put("name", o.name);
            r.put("status", o.status);
            r.put("coverFrom", o.coverFrom);
            r.put("coverTo", o.coverTo);
            r.put("plates", mine);
            r.put("invoices", List.of());
            r.put("topups", List.of());
            out.put(o.id, r);
        }
        return out;
    }

    private static LedgerEntry withoutPayer(LedgerEntry l) {
        LedgerEntry c = new LedgerEntry();
        c.t = l.t; c.day = l.day; c.text = l.text; c.amt = l.amt; c.amount = l.amount; c.src = l.src; c.plate = l.plate; c.prov = l.prov; c.ticket = l.ticket; c.bad = l.bad;
        return c;
    }
}
