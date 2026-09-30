package com.innovii.parkna.db;

import com.innovii.parkna.engine.Cal;
import com.innovii.parkna.engine.Changes;
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

import java.sql.Connection;
import java.sql.Date;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Types;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * Reads the whole state from MariaDB at startup, and writes what each unit of work changed.
 * The caller owns the connection and the transaction.
 */
public final class StateRepository {

    /** Tables cleared by a demo reset, children first. */
    private static final String[] TABLES = {"invoice_line", "invoice", "org_topup", "org_plate", "organisation", "officer_check", "officer",
            "ledger_entry", "plate_payer", "plate", "sms_message", "receipt", "wallet", "subscriber_plate", "subscriber",
            "tariff_change", "tariff", "park_bay", "exception_case", "announcement", "fine", "system_state"};

    // ================================================================== load

    /** The saved state, or null when the database has never been filled. */
    public State load(Connection c) throws SQLException {
        State s = new State();
        try (Statement st = c.createStatement()) {
            try (ResultSet rs = st.executeQuery("SELECT sim_date, sim_minute, clock_running, ticket_seq, state_version FROM system_state WHERE id = 1")) {
                if (!rs.next()) return null;
                s.clock = new Clock();
                s.clock.date = rs.getDate(1).toLocalDate();
                s.clock.min = rs.getInt(2);
                s.clock.run = rs.getBoolean(3);
                s.seq = rs.getInt(4);
                s.ver = rs.getLong(5);
            }
            try (ResultSet rs = st.executeQuery("SELECT daily_gmd, monthly_gmd, grace_days, wallet_limit_gmd, annual_gmd, fine_gmd FROM tariff WHERE id = 1")) {
                if (!rs.next()) throw new SQLException("tariff row missing");
                s.tariff = new Tariff();
                s.tariff.daily = rs.getInt(1); s.tariff.monthly = rs.getInt(2); s.tariff.grace = rs.getInt(3); s.tariff.walletLimit = rs.getInt(4);
                s.tariff.annual = rs.getInt(5); s.tariff.fine = rs.getInt(6);
            }
            try (ResultSet rs = st.executeQuery("SELECT changed_when, description, authority, changed_by FROM tariff_change ORDER BY id")) {
                while (rs.next()) s.tariff.log.add(new Tariff.Change(rs.getString(1), rs.getString(2), rs.getString(3), rs.getString(4)));
            }
            loadSubscribers(st, s);
            loadPlates(st, s);
            try (ResultSet rs = st.executeQuery("SELECT entry_time, entry_day, description, amount_label, amount_gmd, source, plate, provider, ticket, msisdn, failed "
                    + "FROM ledger_entry ORDER BY id DESC LIMIT " + State.LOG_KEEP)) {
                while (rs.next()) {
                    LedgerEntry l = new LedgerEntry();
                    l.t = rs.getString(1); l.day = dkey(rs.getDate(2)); l.text = rs.getString(3); l.amt = rs.getString(4); l.amount = rs.getInt(5);
                    l.src = rs.getString(6); l.plate = rs.getString(7); l.prov = rs.getString(8); l.ticket = rs.getString(9); l.num = rs.getString(10);
                    boolean bad = rs.getBoolean(11); l.bad = rs.wasNull() ? null : bad;
                    s.log.add(l);
                }
            }
            try (ResultSet rs = st.executeQuery("SELECT sms_time, day_label, msisdn, body, tag, out_id FROM sms_message WHERE out_id IS NOT NULL ORDER BY out_id DESC LIMIT " + State.OUT_KEEP)) {
                while (rs.next()) {
                    OutMessage o = new OutMessage();
                    o.t = rs.getString(1); o.d = rs.getString(2); o.num = rs.getString(3); o.text = rs.getString(4); o.tag = rs.getString(5); o.id = rs.getLong(6);
                    s.out.add(o);
                }
            }
            try (ResultSet rs = st.executeQuery("SELECT check_day, check_minute, plate, attendant_id, road, result FROM officer_check ORDER BY id")) {
                while (rs.next()) {
                    Check k = new Check();
                    k.day = dkey(rs.getDate(1)); k.t = rs.getInt(2); k.plate = rs.getString(3); k.off = rs.getString(4); k.road = rs.getString(5); k.st = rs.getString(6);
                    s.checks.add(k);
                }
            }
            loadOfficers(st, s);
            loadOrganisations(st, s);
            try (ResultSet rs = st.executeQuery("SELECT road, bay, plate, driver_msisdn FROM park_bay ORDER BY position")) {
                while (rs.next()) s.park.add(new ParkedCar(rs.getString(1), rs.getString(2), rs.getString(3), rs.getString(4)));
            }
            try (ResultSet rs = st.executeQuery("SELECT kind, plate, detail, status FROM exception_case ORDER BY position")) {
                while (rs.next()) {
                    ExceptionCase e = new ExceptionCase();
                    e.type = rs.getString(1); e.plate = rs.getString(2); e.detail = rs.getString(3); e.status = rs.getString(4);
                    s.exc.add(e);
                }
            }
            try (ResultSet rs = st.executeQuery("SELECT announcement_id, kind, title, body, when_label, link, theme, show_from, show_to, status, created_on, created_by FROM announcement ORDER BY position")) {
                while (rs.next()) {
                    Announcement a = new Announcement();
                    a.id = rs.getString(1); a.kind = rs.getString(2); a.title = rs.getString(3); a.text = rs.getString(4); a.when = rs.getString(5); a.link = rs.getString(6);
                    a.theme = rs.getString(7); a.from = date(rs.getDate(8)); a.to = date(rs.getDate(9)); a.status = rs.getString(10); a.created = date(rs.getDate(11)); a.by = rs.getString(12);
                    s.ann.add(a);
                }
            }
            try (ResultSet rs = st.executeQuery("SELECT fine_id, plate, fine_day, fine_minute, road, attendant_id, base_gmd, fine_gmd, status, settled_day, settled_time, settled_gmd,"
                    + " settled_late, settled_method, settled_ticket, settled_msisdn, note FROM fine ORDER BY id")) {
                while (rs.next()) {
                    Fine f = new Fine();
                    f.id = rs.getString(1); f.plate = rs.getString(2); f.day = dkey(rs.getDate(3)); f.t = rs.getInt(4); f.road = rs.getString(5); f.off = rs.getString(6);
                    f.base = rs.getInt(7); f.fine = rs.getInt(8); f.status = rs.getString(9);
                    if (rs.getDate(10) != null) {
                        Fine.Settled x = new Fine.Settled();
                        x.day = dkey(rs.getDate(10)); x.t = rs.getString(11); x.amount = rs.getInt(12); x.late = rs.getBoolean(13); x.method = rs.getString(14);
                        x.ticket = rs.getString(15); x.num = rs.getString(16);
                        f.settled = x;
                    }
                    f.note = rs.getString(17);
                    s.fines.add(f);
                }
            }
        }
        return s;
    }

    private void loadSubscribers(Statement st, State s) throws SQLException {
        try (ResultSet rs = st.executeQuery("SELECT msisdn, name, last_plate, pending_plate, pending_kind, last_sms_day, welcomed, preferred_provider, persona, persona_note FROM subscriber ORDER BY id")) {
            while (rs.next()) {
                Subscriber u = new Subscriber();
                u.num = rs.getString(1); u.name = rs.getString(2); u.last = rs.getString(3);
                String pp = rs.getString(4);
                u.pending = pp == null ? null : new Pending(pp, rs.getString(5));
                u.lastD = dkey(rs.getDate(6));
                u.welcomed = rs.getBoolean(7); u.prov = rs.getString(8);
                boolean persona = rs.getBoolean(9); u.persona = rs.wasNull() ? null : persona;
                u.note = rs.getString(10);
                s.nums.put(u.num, u);
            }
        }
        try (ResultSet rs = st.executeQuery("SELECT msisdn, plate FROM subscriber_plate ORDER BY msisdn, position")) {
            while (rs.next()) s.nums.get(rs.getString(1)).plates.add(rs.getString(2));
        }
        try (ResultSet rs = st.executeQuery("SELECT msisdn, provider, balance_gmd FROM wallet ORDER BY msisdn, position")) {
            while (rs.next()) s.nums.get(rs.getString(1)).wallet.put(rs.getString(2), rs.getInt(3));
        }
        try (ResultSet rs = st.executeQuery("SELECT msisdn, plate, kind, amount_gmd, provider, when_label, pay_day, pay_time, ticket, valid_to FROM receipt ORDER BY id DESC")) {
            while (rs.next()) {
                Receipt r = new Receipt();
                r.plate = rs.getString(2); r.kind = rs.getString(3); r.amount = rs.getInt(4); r.prov = rs.getString(5); r.when = rs.getString(6);
                r.day = dkey(rs.getDate(7)); r.t = rs.getString(8); r.ticket = rs.getString(9); r.to = date(rs.getDate(10));
                s.nums.get(rs.getString(1)).receipts.add(r);
            }
        }
        // the newest 300 lines of each phone's thread, oldest first
        try (ResultSet rs = st.executeQuery("SELECT msisdn, direction, body, tag, sms_time, day_label, out_id FROM ("
                + " SELECT m.*, ROW_NUMBER() OVER (PARTITION BY msisdn ORDER BY id DESC) AS rn FROM sms_message m) x"
                + " WHERE rn <= " + State.SMS_KEEP + " ORDER BY msisdn, id")) {
            while (rs.next()) {
                SmsEntry e = switch (rs.getString(2)) {
                    case "DAY" -> SmsEntry.dayHeader(rs.getString(6));
                    case "MO" -> SmsEntry.fromPhone(rs.getString(3), rs.getString(5));
                    default -> SmsEntry.toPhone(rs.getString(3), rs.getString(4), rs.getString(5));
                };
                long out = rs.getLong(7);
                if (!rs.wasNull()) e.outId = out;
                s.nums.get(rs.getString(1)).sms.add(e);
            }
        }
    }

    private void loadPlates(Statement st, State s) throws SQLException {
        try (ResultSet rs = st.executeQuery("SELECT plate, daily_day, daily_ticket, daily_time, daily_provider, monthly_to, monthly_ticket, monthly_provider FROM plate ORDER BY id")) {
            while (rs.next()) {
                PlateRecord r = new PlateRecord();
                r.plate = rs.getString(1);
                if (rs.getDate(2) != null) {
                    r.daily = new DailyPass();
                    r.daily.day = dkey(rs.getDate(2)); r.daily.ticket = rs.getString(3); r.daily.t = rs.getString(4); r.daily.prov = rs.getString(5);
                }
                if (rs.getDate(6) != null) {
                    r.monthly = new MonthlyPass();
                    r.monthly.to = date(rs.getDate(6)); r.monthly.ticket = rs.getString(7); r.monthly.prov = rs.getString(8);
                }
                s.plates.put(r.plate, r);
            }
        }
        try (ResultSet rs = st.executeQuery("SELECT plate, msisdn FROM plate_payer ORDER BY plate, position")) {
            while (rs.next()) s.plates.get(rs.getString(1)).payers.add(rs.getString(2));
        }
    }

    private void loadOfficers(Statement st, State s) throws SQLException {
        try (ResultSet rs = st.executeQuery("SELECT msisdn, attendant_id, name, home_road, shift_code, staff_no, supervisor, active, on_shift, shift_start, shift_day,"
                + " last_sms_minute, last_sms_day, stats_checked, stats_paid, stats_unpaid, re_road, re_from, re_day, summary_end, summary_day, summary_checked,"
                + " summary_paid, summary_unpaid, summary_road, summary_auto, bg_rate, bg_unpaid_rate, bg_stop, is_new FROM officer ORDER BY id")) {
            while (rs.next()) {
                Officer o = new Officer();
                o.num = rs.getString(1); o.id = rs.getString(2); o.name = rs.getString(3); o.road = rs.getString(4); o.shift = rs.getString(5);
                o.staff = rs.getString(6); o.supervisor = rs.getString(7); o.active = rs.getBoolean(8); o.on = rs.getBoolean(9);
                o.start = integer(rs, 10); o.day = dkey(rs.getDate(11)); o.last = integer(rs, 12); o.lastDay = dkey(rs.getDate(13));
                Integer checked = integer(rs, 14);
                if (checked != null) { o.stats = new Officer.ShiftStats(); o.stats.checked = checked; o.stats.paid = rs.getInt(15); o.stats.unpaid = rs.getInt(16); }
                if (rs.getString(17) != null) { o.re = new Officer.Reassignment(); o.re.road = rs.getString(17); o.re.from = rs.getInt(18); o.re.day = dkey(rs.getDate(19)); }
                Integer end = integer(rs, 20);
                if (end != null) {
                    Officer.ShiftSummary sm = new Officer.ShiftSummary();
                    sm.end = end; sm.day = dkey(rs.getDate(21)); sm.checked = integer(rs, 22); sm.paid = integer(rs, 23); sm.unpaid = integer(rs, 24);
                    sm.road = rs.getString(25);
                    boolean auto = rs.getBoolean(26); sm.auto = rs.wasNull() ? null : auto;
                    o.summary = sm;
                }
                double rate = rs.getDouble(27);
                if (!rs.wasNull()) o.bg = new Officer.Background(rate, rs.getDouble(28), integer(rs, 29));
                boolean isNew = rs.getBoolean(30); o.isNew = rs.wasNull() ? null : isNew;
                s.off.put(o.num, o);
            }
        }
    }

    private void loadOrganisations(Statement st, State s) throws SQLException {
        try (ResultSet rs = st.executeQuery("SELECT org_id, name, contact_name, contact_msisdn, discount, plates_agreed, status, created_on, grace_day, cover_from, cover_to FROM organisation ORDER BY id")) {
            while (rs.next()) {
                Organisation o = new Organisation();
                o.id = rs.getString(1); o.name = rs.getString(2); o.contact = new Organisation.Contact(rs.getString(3), rs.getString(4));
                o.disc = rs.getDouble(5); o.agreed = rs.getDouble(6); o.status = rs.getString(7); o.created = date(rs.getDate(8)); o.graceDay = integer(rs, 9);
                o.coverFrom = date(rs.getDate(10)); o.coverTo = date(rs.getDate(11));
                s.orga.put(o.id, o);
            }
        }
        try (ResultSet rs = st.executeQuery("SELECT org_id, plate, dept, driver, from_date, to_date FROM org_plate ORDER BY org_id, position")) {
            while (rs.next()) {
                Organisation.FleetPlate x = new Organisation.FleetPlate();
                x.plate = rs.getString(2); x.dept = rs.getString(3); x.driver = rs.getString(4); x.from = date(rs.getDate(5)); x.to = date(rs.getDate(6));
                s.orga.get(rs.getString(1)).plates.add(x);
            }
        }
        try (ResultSet rs = st.executeQuery("SELECT org_id, description, amount_gmd FROM org_topup ORDER BY org_id, position")) {
            while (rs.next()) s.orga.get(rs.getString(1)).topups.add(new Organisation.Topup(rs.getString(2), rs.getInt(3)));
        }
        try (ResultSet rs = st.executeQuery("SELECT org_id, invoice_no, month_label, issued_on, due_on, cover_end, amount_gmd, status, method, paid_on, proof_on, kind, plate_list FROM invoice ORDER BY org_id, position")) {
            while (rs.next()) {
                Organisation.Invoice i = new Organisation.Invoice();
                i.no = rs.getString(2); i.month = rs.getString(3); i.issued = date(rs.getDate(4)); i.due = date(rs.getDate(5)); i.end = date(rs.getDate(6));
                i.amount = rs.getInt(7); i.status = rs.getString(8); i.method = rs.getString(9); i.paidOn = date(rs.getDate(10)); i.proofOn = date(rs.getDate(11));
                i.kind = rs.getString(12);
                String list = rs.getString(13);
                if (list != null && !list.isEmpty()) i.plates.addAll(List.of(list.split(",")));
                s.orga.get(rs.getString(1)).invoices.add(i);
            }
        }
        try (ResultSet rs = st.executeQuery("SELECT org_id, invoice_position, description, amount_gmd FROM invoice_line ORDER BY org_id, invoice_position, position")) {
            while (rs.next()) s.orga.get(rs.getString(1)).invoices.get(rs.getInt(2)).lines.add(new Organisation.Line(rs.getString(3), rs.getInt(4)));
        }
    }

    // ================================================================== save

    /** Writes one unit of work. A reset rewrites everything. */
    public void save(Connection c, State s, Changes ch) throws SQLException {
        if (ch.fullReset) { saveAll(c, s); return; }
        saveSystemState(c, s);
        if (ch.tariff) saveTariff(c, s.tariff);
        insertTariffChanges(c, ch.tariffLog);
        for (String num : ch.subscribers) { Subscriber u = s.nums.get(num); if (u != null) saveSubscriber(c, u); }
        insertSms(c, ch.sms);
        insertReceipts(c, ch.receipts);
        for (String p : ch.plates) { PlateRecord r = s.plates.get(p); if (r != null) savePlate(c, r); }
        insertLedger(c, ch.ledger);
        for (String num : ch.officers) { Officer o = s.off.get(num); if (o != null) saveOfficer(c, o); }
        insertChecks(c, ch.checks);
        for (String id : ch.orgs) { Organisation o = s.orga.get(id); if (o != null) saveOrganisation(c, o); }
        if (ch.exceptions) saveExceptions(c, s.exc);
        if (ch.announcements) saveAnnouncements(c, s.ann);
        for (String id : ch.fines) for (Fine f : s.fines) if (f.id.equals(id)) { saveFine(c, f); break; }
    }

    /** Clears every table and writes the whole state (used for the first start and for a demo reset). */
    public void saveAll(Connection c, State s) throws SQLException {
        try (Statement st = c.createStatement()) { for (String t : TABLES) st.executeUpdate("DELETE FROM " + t); }
        saveSystemState(c, s);
        saveTariff(c, s.tariff);
        insertTariffChanges(c, s.tariff.log);
        List<Changes.NewSms> sms = new ArrayList<>();
        List<Changes.NewReceipt> receipts = new ArrayList<>();
        Map<Long, OutMessage> outbox = new java.util.HashMap<>();
        for (OutMessage o : s.out) outbox.put(o.id, o);
        for (Subscriber u : s.nums.values()) {
            saveSubscriber(c, u);
            for (SmsEntry e : u.sms) sms.add(new Changes.NewSms(u.num, e, e.outId == null ? null : outbox.get(e.outId)));
            List<Receipt> rs = new ArrayList<>(u.receipts);
            Collections.reverse(rs);
            for (Receipt r : rs) receipts.add(new Changes.NewReceipt(u.num, r));
        }
        insertSms(c, sms);
        insertReceipts(c, receipts);
        for (PlateRecord r : s.plates.values()) savePlate(c, r);
        List<LedgerEntry> ledger = new ArrayList<>(s.log);
        Collections.reverse(ledger);
        insertLedger(c, ledger);
        for (Officer o : s.off.values()) saveOfficer(c, o);
        insertChecks(c, s.checks);
        for (Organisation o : s.orga.values()) saveOrganisation(c, o);
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO park_bay (position, road, bay, plate, driver_msisdn) VALUES (?, ?, ?, ?, ?)")) {
            int i = 0;
            for (ParkedCar p : s.park) { set(ps, i, p.road, p.bay, p.plate, p.driver); i++; ps.addBatch(); }
            ps.executeBatch();
        }
        saveExceptions(c, s.exc);
        saveAnnouncements(c, s.ann);
        for (Fine f : s.fines) saveFine(c, f);
    }

    private void saveFine(Connection c, Fine f) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO fine (fine_id, plate, fine_day, fine_minute, road, attendant_id, base_gmd, fine_gmd, status, settled_day, settled_time,"
                + " settled_gmd, settled_late, settled_method, settled_ticket, settled_msisdn, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
                + " ON DUPLICATE KEY UPDATE status = VALUES(status), settled_day = VALUES(settled_day), settled_time = VALUES(settled_time), settled_gmd = VALUES(settled_gmd),"
                + " settled_late = VALUES(settled_late), settled_method = VALUES(settled_method), settled_ticket = VALUES(settled_ticket), settled_msisdn = VALUES(settled_msisdn), note = VALUES(note)")) {
            Fine.Settled x = f.settled;
            set(ps, f.id, f.plate, day(f.day), f.t, f.road, f.off, f.base, f.fine, f.status, x == null ? null : day(x.day), x == null ? null : x.t,
                    x == null ? null : x.amount, x == null ? null : x.late, x == null ? null : x.method, x == null ? null : x.ticket, x == null ? null : x.num, f.note);
            ps.executeUpdate();
        }
    }

    private void saveSystemState(Connection c, State s) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO system_state (id, sim_date, sim_minute, clock_running, ticket_seq, state_version) VALUES (1, ?, ?, ?, ?, ?)"
                + " ON DUPLICATE KEY UPDATE sim_date = VALUES(sim_date), sim_minute = VALUES(sim_minute), clock_running = VALUES(clock_running),"
                + " ticket_seq = VALUES(ticket_seq), state_version = VALUES(state_version)")) {
            set(ps, s.clock.date, s.clock.min, s.clock.run, s.seq, s.ver);
            ps.executeUpdate();
        }
    }

    private void saveTariff(Connection c, Tariff t) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO tariff (id, daily_gmd, monthly_gmd, grace_days, wallet_limit_gmd, annual_gmd, fine_gmd) VALUES (1, ?, ?, ?, ?, ?, ?)"
                + " ON DUPLICATE KEY UPDATE daily_gmd = VALUES(daily_gmd), monthly_gmd = VALUES(monthly_gmd), grace_days = VALUES(grace_days), wallet_limit_gmd = VALUES(wallet_limit_gmd),"
                + " annual_gmd = VALUES(annual_gmd), fine_gmd = VALUES(fine_gmd)")) {
            set(ps, t.daily, t.monthly, t.grace, t.walletLimit, t.annual, t.fine);
            ps.executeUpdate();
        }
    }

    private void insertTariffChanges(Connection c, List<Tariff.Change> list) throws SQLException {
        if (list.isEmpty()) return;
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO tariff_change (changed_when, description, authority, changed_by) VALUES (?, ?, ?, ?)")) {
            for (Tariff.Change x : list) { set(ps, x.when, x.what, x.auth, x.by); ps.addBatch(); }
            ps.executeBatch();
        }
    }

    private void saveSubscriber(Connection c, Subscriber u) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO subscriber (msisdn, name, last_plate, pending_plate, pending_kind, last_sms_day, welcomed, preferred_provider, persona, persona_note)"
                + " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), last_plate = VALUES(last_plate), pending_plate = VALUES(pending_plate),"
                + " pending_kind = VALUES(pending_kind), last_sms_day = VALUES(last_sms_day), welcomed = VALUES(welcomed), preferred_provider = VALUES(preferred_provider),"
                + " persona = VALUES(persona), persona_note = VALUES(persona_note)")) {
            set(ps, u.num, u.name, u.last, u.pending == null ? null : u.pending.plate, u.pending == null ? null : u.pending.kind, day(u.lastD), u.welcomed, u.prov, u.persona, u.note);
            ps.executeUpdate();
        }
        try (PreparedStatement del = c.prepareStatement("DELETE FROM subscriber_plate WHERE msisdn = ?")) { set(del, u.num); del.executeUpdate(); }
        if (!u.plates.isEmpty()) {
            try (PreparedStatement ps = c.prepareStatement("INSERT INTO subscriber_plate (msisdn, position, plate) VALUES (?, ?, ?)")) {
                int i = 0;
                for (String p : u.plates) { set(ps, u.num, i++, p); ps.addBatch(); }
                ps.executeBatch();
            }
        }
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO wallet (msisdn, position, provider, balance_gmd) VALUES (?, ?, ?, ?)"
                + " ON DUPLICATE KEY UPDATE position = VALUES(position), balance_gmd = VALUES(balance_gmd)")) {
            int i = 0;
            for (Map.Entry<String, Integer> w : u.wallet.entrySet()) { set(ps, u.num, i++, w.getKey(), w.getValue()); ps.addBatch(); }
            ps.executeBatch();
        }
    }

    private void insertSms(Connection c, List<Changes.NewSms> list) throws SQLException {
        if (list.isEmpty()) return;
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO sms_message (msisdn, direction, body, tag, sms_time, day_label, out_id) VALUES (?, ?, ?, ?, ?, ?, ?)")) {
            for (Changes.NewSms m : list) {
                SmsEntry e = m.entry();
                if (e.d != null) set(ps, m.num(), "DAY", null, null, null, e.d, null);
                else if (e.o != null) set(ps, m.num(), "MO", e.o, null, e.t, null, null);
                else set(ps, m.num(), "MT", e.i, e.tag, e.t, m.out() == null ? null : m.out().d, m.out() == null ? null : m.out().id);
                ps.addBatch();
            }
            ps.executeBatch();
        }
    }

    private void insertReceipts(Connection c, List<Changes.NewReceipt> list) throws SQLException {
        if (list.isEmpty()) return;
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO receipt (msisdn, plate, kind, amount_gmd, provider, when_label, pay_day, pay_time, ticket, valid_to) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")) {
            for (Changes.NewReceipt n : list) {
                Receipt r = n.receipt();
                set(ps, n.num(), r.plate, r.kind, r.amount, r.prov, r.when, day(r.day), r.t, r.ticket, r.to);
                ps.addBatch();
            }
            ps.executeBatch();
        }
    }

    private void savePlate(Connection c, PlateRecord r) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO plate (plate, daily_day, daily_ticket, daily_time, daily_provider, monthly_to, monthly_ticket, monthly_provider)"
                + " VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE daily_day = VALUES(daily_day), daily_ticket = VALUES(daily_ticket), daily_time = VALUES(daily_time),"
                + " daily_provider = VALUES(daily_provider), monthly_to = VALUES(monthly_to), monthly_ticket = VALUES(monthly_ticket), monthly_provider = VALUES(monthly_provider)")) {
            DailyPass d = r.daily;
            MonthlyPass m = r.monthly;
            set(ps, r.plate, d == null ? null : day(d.day), d == null ? null : d.ticket, d == null ? null : d.t, d == null ? null : d.prov,
                    m == null ? null : m.to, m == null ? null : m.ticket, m == null ? null : m.prov);
            ps.executeUpdate();
        }
        try (PreparedStatement del = c.prepareStatement("DELETE FROM plate_payer WHERE plate = ?")) { set(del, r.plate); del.executeUpdate(); }
        if (!r.payers.isEmpty()) {
            try (PreparedStatement ps = c.prepareStatement("INSERT INTO plate_payer (plate, position, msisdn) VALUES (?, ?, ?)")) {
                int i = 0;
                for (String n : r.payers) { set(ps, r.plate, i++, n); ps.addBatch(); }
                ps.executeBatch();
            }
        }
    }

    private void insertLedger(Connection c, List<LedgerEntry> list) throws SQLException {
        if (list.isEmpty()) return;
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO ledger_entry (entry_day, entry_time, description, amount_label, amount_gmd, source, plate, provider, ticket, msisdn, failed)"
                + " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")) {
            for (LedgerEntry l : list) { set(ps, day(l.day), l.t, l.text, l.amt, l.amount, l.src, l.plate, l.prov, l.ticket, l.num, l.bad); ps.addBatch(); }
            ps.executeBatch();
        }
    }

    private void saveOfficer(Connection c, Officer o) throws SQLException {
        String cols = "msisdn, attendant_id, name, home_road, shift_code, staff_no, supervisor, active, on_shift, shift_start, shift_day, last_sms_minute, last_sms_day,"
                + " stats_checked, stats_paid, stats_unpaid, re_road, re_from, re_day, summary_end, summary_day, summary_checked, summary_paid, summary_unpaid,"
                + " summary_road, summary_auto, bg_rate, bg_unpaid_rate, bg_stop, is_new";
        StringBuilder upd = new StringBuilder();
        for (String col : cols.split(",")) { col = col.trim(); if (col.equals("msisdn")) continue; if (upd.length() > 0) upd.append(", "); upd.append(col).append(" = VALUES(").append(col).append(')'); }
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO officer (" + cols + ") VALUES (" + "?, ".repeat(29) + "?) ON DUPLICATE KEY UPDATE " + upd)) {
            Officer.ShiftStats st = o.stats;
            Officer.Reassignment re = o.re;
            Officer.ShiftSummary sm = o.summary;
            Officer.Background bg = o.bg;
            set(ps, o.num, o.id, o.name, o.road, o.shift, o.staff, o.supervisor, o.active, o.on, o.start, day(o.day), o.last, day(o.lastDay),
                    st == null ? null : st.checked, st == null ? null : st.paid, st == null ? null : st.unpaid,
                    re == null ? null : re.road, re == null ? null : re.from, re == null ? null : day(re.day),
                    sm == null ? null : sm.end, sm == null ? null : day(sm.day), sm == null ? null : sm.checked, sm == null ? null : sm.paid, sm == null ? null : sm.unpaid,
                    sm == null ? null : sm.road, sm == null ? null : sm.auto,
                    bg == null ? null : bg.rate, bg == null ? null : bg.unp, bg == null ? null : bg.stop, o.isNew);
            ps.executeUpdate();
        }
    }

    private void insertChecks(Connection c, List<Check> list) throws SQLException {
        if (list.isEmpty()) return;
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO officer_check (check_day, check_minute, plate, attendant_id, road, result) VALUES (?, ?, ?, ?, ?, ?)")) {
            for (Check k : list) { set(ps, day(k.day), k.t, k.plate, k.off, k.road, k.st); ps.addBatch(); }
            ps.executeBatch();
        }
    }

    private void saveOrganisation(Connection c, Organisation o) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO organisation (org_id, name, contact_name, contact_msisdn, discount, plates_agreed, status, created_on, grace_day, cover_from, cover_to)"
                + " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), contact_name = VALUES(contact_name), contact_msisdn = VALUES(contact_msisdn),"
                + " discount = VALUES(discount), plates_agreed = VALUES(plates_agreed), status = VALUES(status), created_on = VALUES(created_on), grace_day = VALUES(grace_day),"
                + " cover_from = VALUES(cover_from), cover_to = VALUES(cover_to)")) {
            set(ps, o.id, o.name, o.contact.name, o.contact.num, o.disc, o.agreed, o.status, o.created, o.graceDay, o.coverFrom, o.coverTo);
            ps.executeUpdate();
        }
        for (String t : new String[]{"org_plate", "org_topup", "invoice", "invoice_line"}) {
            try (PreparedStatement del = c.prepareStatement("DELETE FROM " + t + " WHERE org_id = ?")) { set(del, o.id); del.executeUpdate(); }
        }
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO org_plate (org_id, position, plate, dept, driver, from_date, to_date) VALUES (?, ?, ?, ?, ?, ?, ?)")) {
            int i = 0;
            for (Organisation.FleetPlate x : o.plates) { set(ps, o.id, i++, x.plate, x.dept, x.driver, x.from, x.to); ps.addBatch(); }
            ps.executeBatch();
        }
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO org_topup (org_id, position, description, amount_gmd) VALUES (?, ?, ?, ?)")) {
            int i = 0;
            for (Organisation.Topup x : o.topups) { set(ps, o.id, i++, x.t, x.a); ps.addBatch(); }
            ps.executeBatch();
        }
        try (PreparedStatement inv = c.prepareStatement("INSERT INTO invoice (org_id, position, invoice_no, month_label, issued_on, due_on, cover_end, amount_gmd, status, method, paid_on, proof_on, kind, plate_list)"
                + " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
             PreparedStatement line = c.prepareStatement("INSERT INTO invoice_line (org_id, invoice_position, position, description, amount_gmd) VALUES (?, ?, ?, ?, ?)")) {
            int i = 0;
            for (Organisation.Invoice x : o.invoices) {
                set(inv, o.id, i, x.no, x.month, x.issued, x.due, x.end, x.amount, x.status, x.method, x.paidOn, x.proofOn, x.kind == null ? "monthly" : x.kind, String.join(",", x.plates));
                inv.addBatch();
                int j = 0;
                for (Organisation.Line l : x.lines) { set(line, o.id, i, j++, l.t, l.a); line.addBatch(); }
                i++;
            }
            inv.executeBatch();
            line.executeBatch();
        }
    }

    private void saveExceptions(Connection c, List<ExceptionCase> list) throws SQLException {
        try (Statement st = c.createStatement()) { st.executeUpdate("DELETE FROM exception_case"); }
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO exception_case (position, kind, plate, detail, status) VALUES (?, ?, ?, ?, ?)")) {
            int i = 0;
            for (ExceptionCase e : list) { set(ps, i++, e.type, e.plate, e.detail, e.status); ps.addBatch(); }
            ps.executeBatch();
        }
    }

    private void saveAnnouncements(Connection c, List<Announcement> list) throws SQLException {
        try (Statement st = c.createStatement()) { st.executeUpdate("DELETE FROM announcement"); }
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO announcement (announcement_id, position, kind, title, body, when_label, link, theme, show_from, show_to, status, created_on, created_by)"
                + " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")) {
            int i = 0;
            for (Announcement a : list) { set(ps, a.id, i++, a.kind, a.title, a.text, a.when, a.link, a.theme, a.from, a.to, a.status, a.created, a.by); ps.addBatch(); }
            ps.executeBatch();
        }
    }

    // ================================================================== helpers

    private static void set(PreparedStatement ps, Object... values) throws SQLException {
        for (int i = 0; i < values.length; i++) {
            Object v = values[i];
            int k = i + 1;
            if (v == null) ps.setNull(k, Types.NULL);
            else if (v instanceof String s) ps.setString(k, s);
            else if (v instanceof Integer n) ps.setInt(k, n);
            else if (v instanceof Long n) ps.setLong(k, n);
            else if (v instanceof Double d) ps.setDouble(k, d);
            else if (v instanceof Boolean b) ps.setBoolean(k, b);
            else if (v instanceof LocalDate d) ps.setDate(k, Date.valueOf(d));
            else throw new IllegalArgumentException("Unsupported value " + v.getClass());
        }
    }

    /** Day key ("2026-10-2") to a calendar day. */
    private static LocalDate day(String dkey) { return dkey == null ? null : Cal.fromDkey(dkey); }
    private static String dkey(Date d) { return d == null ? null : Cal.dkey(d.toLocalDate()); }
    private static LocalDate date(Date d) { return d == null ? null : d.toLocalDate(); }
    private static Integer integer(ResultSet rs, int i) throws SQLException { int v = rs.getInt(i); return rs.wasNull() ? null : v; }
}
