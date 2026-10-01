package com.innovii.parkna.service;

import com.innovii.parkna.auth.AuthService;
import com.innovii.parkna.auth.Role;
import com.innovii.parkna.auth.Session;
import com.innovii.parkna.config.AppConfig;
import com.innovii.parkna.db.Migrator;
import com.innovii.parkna.db.StateRepository;
import com.innovii.parkna.engine.Cal;
import com.innovii.parkna.engine.Changes;
import com.innovii.parkna.engine.ParkingEngine;
import com.innovii.parkna.json.Json;
import com.innovii.parkna.model.OutMessage;
import com.innovii.parkna.model.State;
import com.innovii.parkna.sms.SmsGateway;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.SQLException;
import java.time.ZonedDateTime;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Function;

import static com.innovii.parkna.auth.Role.ADMIN;
import static com.innovii.parkna.auth.Role.DRIVER;
import static com.innovii.parkna.auth.Role.FINANCE;
import static com.innovii.parkna.auth.Role.OFFICER;
import static com.innovii.parkna.auth.Role.ORG;
import static com.innovii.parkna.auth.Role.SUPERVISOR;

/**
 * Runs the engine for the whole server: one action at a time, each checked against the signed-in person's role,
 * saved to MariaDB in its own transaction before anyone sees it, then pushed to every open screen as that
 * person's own view. If a save fails, the action is undone by reloading from the database.
 */
public final class ParknaService implements AutoCloseable, AuthService.Directory {
    private static final Logger log = LoggerFactory.getLogger(ParknaService.class);

    /** Which roles may run each action. Anything not listed is refused. */
    private static final Map<String, Set<Role>> ALLOWED = Map.ofEntries(
            Map.entry("driver.login", EnumSet.of(DRIVER)),
            Map.entry("driver.addPlate", EnumSet.of(DRIVER)),
            Map.entry("driver.removePlate", EnumSet.of(DRIVER)),
            Map.entry("driver.focus", EnumSet.of(DRIVER)),
            Map.entry("driver.pay", EnumSet.of(DRIVER)),
            Map.entry("driver.status", EnumSet.of(DRIVER)),
            Map.entry("terms.accept", EnumSet.of(DRIVER, OFFICER)),
            Map.entry("sms", EnumSet.of(OFFICER)),
            Map.entry("sim.sms", EnumSet.of(ADMIN, SUPERVISOR)),
            Map.entry("org.addPlate", EnumSet.of(ORG)),
            Map.entry("org.addPlates", EnumSet.of(ORG)),
            Map.entry("org.removePlate", EnumSet.of(ORG)),
            Map.entry("org.uploadProof", EnumSet.of(ORG)),
            Map.entry("org.payWallet", EnumSet.of(ORG)),
            Map.entry("back.register", EnumSet.of(ADMIN, SUPERVISOR)),
            Map.entry("back.reassign", EnumSet.of(ADMIN, SUPERVISOR)),
            Map.entry("back.createOrg", EnumSet.of(ADMIN)),
            Map.entry("back.match", EnumSet.of(ADMIN, FINANCE)),
            Map.entry("back.refer", EnumSet.of(ADMIN, FINANCE)),
            Map.entry("back.exception", EnumSet.of(ADMIN, FINANCE, SUPERVISOR)),
            Map.entry("back.settleFine", EnumSet.of(ADMIN, FINANCE)),
            Map.entry("back.cancelFine", EnumSet.of(ADMIN, SUPERVISOR)),
            Map.entry("back.publish", EnumSet.of(ADMIN)),
            Map.entry("back.announce", EnumSet.of(ADMIN)),
            Map.entry("back.announceStatus", EnumSet.of(ADMIN)),
            Map.entry("back.announceDelete", EnumSet.of(ADMIN)),
            Map.entry("clock.set", EnumSet.of(ADMIN)),
            Map.entry("clock.add", EnumSet.of(ADMIN)),
            Map.entry("clock.nextDay", EnumSet.of(ADMIN)),
            Map.entry("clock.run", EnumSet.of(ADMIN)),
            Map.entry("demo.reset", EnumSet.of(ADMIN)));

    /** Something that shows the state to people (the live-update stream). Called under the lock; must only queue work. */
    public interface Listener {
        void changed(Function<Session, String> viewFor);
    }

    private final AppConfig cfg;
    private final DataSource ds;
    private final SmsGateway sms;
    private final Views views;
    private final TermsService terms;
    private final StateRepository repo = new StateRepository();
    private final ReentrantLock lock = new ReentrantLock();
    private final List<Listener> listeners = new CopyOnWriteArrayList<>();
    private final ScheduledExecutorService clock = Executors.newSingleThreadScheduledExecutor(r -> { Thread t = new Thread(r, "parkna-clock"); t.setDaemon(true); return t; });
    private AuthService auth;
    private ParkingEngine engine;
    /** The full state as JSON, rebuilt after every change and shared by all staff views. */
    private volatile String snapshot;
    /** Held while this server runs, with a MariaDB lock that stops a second SUNU Park from using the same database. */
    private Connection instanceLock;

    public ParknaService(AppConfig cfg, DataSource ds, SmsGateway sms) {
        this.cfg = cfg;
        this.ds = ds;
        this.sms = sms;
        this.views = new Views(cfg);
        this.terms = new TermsService(ds);
        this.views.termsVersion(() -> terms.current().v());
    }

    /** Used to write the audit log. */
    public void setAuth(AuthService auth) { this.auth = auth; }

    public void start() throws SQLException {
        takeInstanceLock();
        if (cfg.db.migrate()) Migrator.migrate(ds);
        try (Connection c = ds.getConnection()) {
            State s = repo.load(c);
            if (s == null) {
                if (cfg.mode == AppConfig.Mode.DEMO) {
                    engine = ParkingEngine.seeded();
                    if (cfg.clockMode == AppConfig.ClockMode.REAL) startAtToday(engine.state());
                    log.info("Database was empty: loaded the demo story (app.mode=demo)");
                } else {
                    ZonedDateTime now = ZonedDateTime.now(cfg.timezone);
                    engine = ParkingEngine.empty(now.toLocalDate(), now.getHour() * 60 + now.getMinute());
                    log.info("Database was empty: started a new SUNU Park service with no data (app.mode=production)");
                }
                c.setAutoCommit(false);
                repo.save(c, engine.state(), engine.takeChanges());
                c.commit();
            } else {
                engine = new ParkingEngine(s);
                log.info("Loaded SUNU Park data from the database: {} phone numbers, {} plates, {} attendants, {} organisations, clock {} {}",
                        s.nums.size(), s.plates.size(), s.off.size(), s.orga.size(), s.clock.date, Cal.hm(s.clock.min));
                if (cfg.mode == AppConfig.Mode.PRODUCTION && s.off.values().stream().anyMatch(o -> o.bg != null))
                    log.warn("app.mode=production, but this database holds the DEMO story (sample drivers, attendants, Demo Bank). "
                            + "Empty the database before real use (docs/DEPLOYMENT.md, section 11), or set app.mode=demo for a demo server.");
            }
        }
        engine.setPaymentsEnabled(cfg.payments == AppConfig.PaymentsMode.SIMULATED);
        snapshot = Json.snapshot(engine.state());
        if (cfg.clockMode == AppConfig.ClockMode.REAL) {
            syncRealClock();
            clock.scheduleAtFixedRate(this::syncRealClock, 15, 15, TimeUnit.SECONDS);
        } else {
            clock.scheduleAtFixedRate(this::tick, 60, 60, TimeUnit.SECONDS);
        }
    }

    /** Runs a housekeeping job on the service's scheduler. */
    public void every(long minutes, Runnable job) {
        clock.scheduleAtFixedRate(() -> {
            try { job.run(); } catch (RuntimeException e) { log.warn("Housekeeping failed: {}", e.getMessage()); }
        }, minutes, minutes, TimeUnit.MINUTES);
    }

    private void takeInstanceLock() throws SQLException {
        Connection c = ds.getConnection();
        try (java.sql.Statement st = c.createStatement(); java.sql.ResultSet rs = st.executeQuery("SELECT GET_LOCK(CONCAT(DATABASE(), '.parkna-server'), 10)")) {
            if (rs.next() && rs.getInt(1) == 1) { instanceLock = c; return; }
        }
        c.close();
        throw new IllegalStateException("Another SUNU Park server is already running on this database. Stop it first (two servers would overwrite each other's data).");
    }

    private void startAtToday(State s) {
        ZonedDateTime now = ZonedDateTime.now(cfg.timezone);
        s.clock.date = now.toLocalDate();
        s.clock.min = now.getHour() * 60 + now.getMinute();
    }

    // ================================================================== views

    /** What this person may see, as JSON. */
    public String viewFor(Session s) {
        lock.lock();
        try { return views.forSession(engine, s, snapshot); }
        finally { lock.unlock(); }
    }

    /** What this server offers (for /api/ping, before sign-in). */
    public Map<String, Object> mode() {
        lock.lock();
        try { return views.mode(engine); }
        finally { lock.unlock(); }
    }

    public void addListener(Listener l) { listeners.add(l); }
    public void removeListener(Listener l) { listeners.remove(l); }

    // ================================================================== sign-in directory

    @Override public String refuse(String num, Role role) {
        lock.lock();
        try {
            return switch (role) {
                case OFFICER -> engine.isOfficer(num) ? null : "This number is not a registered SUNU Park attendant. Ask your supervisor to register it in the back office.";
                case ORG -> engine.orgForContact(num) != null ? null : "This number is not the contact on a SUNU Park organisation account.";
                case DRIVER -> engine.isOfficer(num) ? "This number belongs to a SUNU Park attendant. Use the SUNU Park Officer app." : null;
                default -> "Staff sign in with a username and password.";
            };
        } finally {
            lock.unlock();
        }
    }

    @Override public String orgFor(String num) {
        lock.lock();
        try { return engine.orgForContact(num); }
        finally { lock.unlock(); }
    }

    // ================================================================== actions

    /** Runs one action for a signed-in person, after checking they may. */
    public Map<String, Object> act(Session s, Map<String, Object> a, String ip) {
        String type = String.valueOf(a.get("type"));
        a.remove("_actor");
        Set<Role> allowed = ALLOWED.get(type);
        if (allowed == null || !allowed.contains(s.role())) {
            if (s.staff() && auth != null) auth.audit(s.name(), s.role(), type, null, "refused", "not allowed for this role", ip);
            return error(s.role() == Role.COUNCIL ? "The Council view is read-only." : s.role() == Role.POLICE ? "The police view is read-only." : "You are not allowed to do that.");
        }
        if (s.staff() && s.mustChangePassword()) return error("Choose a new password first.");
        if (type.startsWith("clock.") || type.equals("demo.reset")) {
            if (!cfg.demoControls) return error("Demo controls are switched off on this server.");
            if (cfg.clockMode == AppConfig.ClockMode.REAL && type.startsWith("clock.")) return error("The clock follows real time on this server.");
        }
        switch (s.role()) {
            case DRIVER -> a.put("num", s.subject());
            case OFFICER -> {
                a.put("num", s.subject());
                if (!isOfficer(s.subject())) return error("Your attendant account is switched off. Ask your supervisor.");
            }
            case ORG -> {
                a.put("org", s.orgId());
                if (!s.orgId().equals(orgFor(s.subject()))) return error("This number is no longer the contact for " + s.orgId() + ".");
            }
            default -> a.put("_actor", s.name());
        }
        if (type.equals("sim.sms")) return simulatedSms(s, a, ip);
        if (type.equals("terms.accept") && !terms.current().v().equals(String.valueOf(a.get("v"))))
            return error("The terms have changed. Read the new version first.");
        if (type.equals("driver.status")) {
            lock.lock();
            try { return engine.plateStatus(a.get("num"), a.get("plate")); }
            finally { lock.unlock(); }
        }
        Map<String, Object> r = run(a, s.who());
        if (s.staff() && auth != null) auth.audit(s.name(), s.role(), type, target(a), r.containsKey("err") ? "refused" : "ok", r.containsKey("err") ? String.valueOf(r.get("err")) : null, ip);
        return r;
    }

    private boolean isOfficer(String num) {
        lock.lock();
        try { return engine.isOfficer(num); }
        finally { lock.unlock(); }
    }

    public TermsService terms() { return terms; }

    /** Numbers used in the SMS simulator, and until when the replies to them stay in the simulator. */
    private final Map<String, Long> simulated = new java.util.concurrent.ConcurrentHashMap<>();

    /** A text typed in the SMS simulator, handled exactly as if it came from that phone through Kannel. */
    private Map<String, Object> simulatedSms(Session s, Map<String, Object> a, String ip) {
        Map<String, Object> r = simSms(String.valueOf(a.getOrDefault("from", "")), String.valueOf(a.getOrDefault("text", "")), s.name());
        if (auth != null) auth.audit(s.name(), s.role(), "sim.sms", String.valueOf(a.get("from")), r.containsKey("err") ? "refused" : "ok", String.valueOf(a.get("text")), ip);
        return r;
    }

    // ================================================================== SMS and USSD simulator (/sms, no sign-in)

    public boolean simulatorOn() { return cfg.smsSimulator; }

    private static String msisdn(String raw) {
        String d = String.valueOf(raw == null ? "" : raw).replaceAll("[^0-9]", "");
        return d.length() > 7 ? d.substring(d.length() - 7) : d;
    }

    /** A text typed in the simulator, handled exactly like an SMS from that phone through Kannel. */
    public Map<String, Object> simSms(String rawFrom, String rawText, String who) {
        if (!cfg.smsSimulator) return error("The SMS simulator is switched off on this server (sms.simulator.enabled).");
        String from = msisdn(rawFrom), text = String.valueOf(rawText == null ? "" : rawText).trim();
        if (from.length() != 7) return error("Enter a 7-digit phone number.");
        if (text.isEmpty()) return error("Type a message.");
        if (text.length() > 160) return error("Keep it to one SMS (160 characters).");
        simulated.put(from, System.currentTimeMillis() + 2 * 3600_000L);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("type", "sms");
        m.put("num", from);
        m.put("text", text);
        return run(m, "SMS simulator (" + who + ") as +220 " + from);
    }

    /** One step of a USSD session (*7275#): {@code text} is the whole session so far ("", "1", "1*2"...). "CON ..." or "END ...". */
    public String ussd(String rawFrom, String text) {
        String num = msisdn(rawFrom);
        if (num.length() != 7) return "END Unknown number.";
        return new UssdMenu(ussdBackend()).handle(num, text);
    }

    /** A USSD session from the simulator (the replies' SMS stay in the simulator, like simSms). */
    public Map<String, Object> simUssd(String rawFrom, String text) {
        if (!cfg.smsSimulator) return error("The simulator is switched off on this server (sms.simulator.enabled).");
        String num = msisdn(rawFrom);
        if (num.length() != 7) return error("Enter a 7-digit phone number.");
        simulated.put(num, System.currentTimeMillis() + 2 * 3600_000L);
        String r = ussd(num, text);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("end", r.startsWith("END"));
        out.put("text", r.substring(4));
        return out;
    }

    private UssdMenu.Backend ussdBackend() {
        return new UssdMenu.Backend() {
            private <T> T read(java.util.function.Supplier<T> f) { lock.lock(); try { return f.get(); } finally { lock.unlock(); } }
            @Override public boolean officer(String num) { return read(() -> engine.isOfficer(num)); }
            @Override public String officerId(String num) { return read(() -> engine.state().off.get(num).id); }
            @Override public List<String> plates(String num) { return read(() -> { var u = engine.state().nums.get(num); return u == null ? List.<String>of() : List.copyOf(u.plates); }); }
            @Override public List<String> warnedPlates(String num) {
                return read(() -> { var u = engine.state().nums.get(num); List<String> o = new java.util.ArrayList<>();
                    if (u != null) for (String p : u.plates) if (!engine.openWarnings(p).isEmpty()) o.add(p); return o; });
            }
            @Override public Map<String, Object> quote(String num, String plate, String kind) { return read(() -> engine.quoteFor(num, plate, kind)); }
            @Override public String describe(String p) { return read(() -> describePlate(p)); }
            @Override public Map<String, Object> pay(String num, String plate, String kind, String prov) {
                Map<String, Object> a = new LinkedHashMap<>();
                a.put("type", "driver.pay"); a.put("num", num); a.put("plate", plate); a.put("kind", kind); a.put("prov", prov);
                return run(a, "USSD +220 " + num);
            }
            @Override public String officerLine(String num, String text) {
                Map<String, Object> a = new LinkedHashMap<>();
                a.put("type", "sms"); a.put("num", num); a.put("text", text);
                Object reply = run(a, "USSD +220 " + num).get("reply");
                return reply == null ? "Done." : String.valueOf(reply);
            }
            @Override public int daily() { return read(() -> engine.state().tariff.daily); }
            @Override public int monthly() { return read(() -> engine.state().tariff.monthly); }
            @Override public boolean payments() { return engine.paymentsEnabled(); }
        };
    }

    /** "BJL1234: PAID till 7pm today", with any open warning. Call under the lock. */
    private String describePlate(String p) {
        String st = engine.stateOf(p);
        StringBuilder b = new StringBuilder(p).append(": ");
        switch (st) {
            case "DAILY" -> b.append("PAID till 7pm today");
            case "MONTHLY" -> b.append("monthly pass to ").append(engine.untilOf(p));
            case "ORG" -> b.append("covered by ").append(engine.untilOf(p));
            default -> b.append(engine.paidHoursNow() ? "NOT PAID today (" + engine.state().tariff.daily + " GMD)" : "free now (paid 7am-7pm Mon-Sat)");
        }
        for (Map<String, Object> w : engine.openWarnings(p))
            b.append(". Warning ").append(w.get("id")).append(": ").append(w.get("owed")).append(" GMD").append(Boolean.TRUE.equals(w.get("late")) ? " with the fine" : " by " + w.get("due"));
        int n = engine.offences(p);
        if (n > 1) b.append(". Repeat offender (").append(n).append(" warnings)");
        return b.toString();
    }

    /** Everything the simulator shows about one number: who it is, plates, wallet, receipts and its SMS thread. */
    public Map<String, Object> simInfo(String raw) {
        if (!cfg.smsSimulator) return error("The simulator is switched off on this server (sms.simulator.enabled).");
        String num = msisdn(raw);
        if (num.length() != 7) return error("Enter a 7-digit phone number.");
        lock.lock();
        try {
            State st = engine.state();
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("ok", true);
            r.put("num", num);
            var u = st.nums.get(num);
            var o = st.off.get(num);
            String org = engine.orgForContact(num);
            if (o != null && o.active) {
                r.put("role", "officer");
                r.put("name", o.name);
                r.put("label", "Attendant " + o.id + " · " + engine.currentRoad(o) + (o.on ? " · on shift" : ""));
            } else if (org != null) {
                r.put("role", "org");
                r.put("name", st.orga.get(org).contact.name);
                r.put("label", st.orga.get(org).name + " · " + org);
            } else {
                r.put("role", u == null ? "new" : "driver");
                r.put("name", u == null || u.name.equals("+220 " + num) ? "New number" : u.name);
                r.put("label", u == null ? "Not known to SUNU Park yet" : "Driver");
            }
            List<Map<String, Object>> plates = new java.util.ArrayList<>();
            if (u != null) for (String p : u.plates) {
                Map<String, Object> x = new LinkedHashMap<>();
                x.put("plate", p); x.put("st", engine.stateOf(p)); x.put("until", engine.untilOf(p));
                x.put("warnings", engine.openWarnings(p)); x.put("offences", engine.offences(p));
                plates.add(x);
            }
            r.put("plates", plates);
            r.put("wallet", u == null ? Map.of() : u.wallet);
            r.put("receipts", u == null ? List.of() : u.receipts.subList(0, Math.min(12, u.receipts.size())));
            r.put("sms", u == null ? List.of() : u.sms.subList(Math.max(0, u.sms.size() - 150), u.sms.size()));
            r.put("terms", u == null ? null : u.terms);
            return r;
        } finally {
            lock.unlock();
        }
    }

    /** The bench: clock, prices, and on a demo server the sample people to pick from. */
    public Map<String, Object> simBench() {
        lock.lock();
        try {
            State st = engine.state();
            Map<String, Object> r = new LinkedHashMap<>(views.mode(engine));
            r.put("ok", true);
            r.put("simulator", cfg.smsSimulator);
            r.put("version", com.innovii.parkna.web.AppListener.VERSION);
            r.put("date", Cal.fmtD(st.clock.date) + " " + st.clock.date.getYear());
            r.put("dow", st.clock.date.getDayOfWeek().getValue() % 7);
            r.put("time", Cal.hm(st.clock.min));
            r.put("paidHours", engine.paidHoursNow());
            r.put("monthly", st.tariff.monthly);
            r.put("fine", st.tariff.fine);
            if (cfg.mode == AppConfig.Mode.DEMO && cfg.smsSimulator) {
                List<Map<String, Object>> people = new java.util.ArrayList<>();
                for (var o : st.off.values()) if (o.active && o.bg == null) people.add(Map.of("num", o.num, "name", o.name, "role", "officer", "note", "Attendant " + o.id + " · " + engine.currentRoad(o)));
                for (var g : st.orga.values()) people.add(Map.of("num", g.contact.num, "name", g.contact.name, "role", "org", "note", g.name));
                for (var u : st.nums.values()) {
                    if (st.off.containsKey(u.num) || engine.orgForContact(u.num) != null || u.plates.isEmpty() || !u.num.matches("\\d{7}")) continue;
                    people.add(Map.of("num", u.num, "name", u.name, "role", "driver", "note", String.join(", ", u.plates)));
                    if (people.size() > 40) break;
                }
                r.put("people", people);
            }
            return r;
        } finally {
            lock.unlock();
        }
    }

    /** Demo clock buttons on the bench (demo servers with demo controls only). */
    public Map<String, Object> simClock(String what) {
        if (!cfg.smsSimulator || !cfg.demoControls) return error("Demo controls are switched off on this server.");
        if (cfg.clockMode == AppConfig.ClockMode.REAL) return error("The clock follows real time on this server.");
        Map<String, Object> a = new LinkedHashMap<>();
        switch (String.valueOf(what)) {
            case "nextDay" -> a.put("type", "clock.nextDay");
            case "hour" -> { a.put("type", "clock.add"); a.put("min", 60); }
            case "morning" -> { a.put("type", "clock.set"); a.put("min", 600); }
            case "evening" -> { a.put("type", "clock.set"); a.put("min", 1160); }
            case "reset" -> a.put("type", "demo.reset");
            default -> { return error("Unknown control."); }
        }
        return run(a, "SMS simulator demo controls");
    }

    /**
     * An administrator publishes a new version of the terms. Every open screen gets the new version number (the apps
     * then ask for it to be accepted); with {@code notify}, every phone that uses SUNU Park also gets an SMS with the link.
     */
    public Map<String, Object> publishTerms(Session s, String title, String body, String note, boolean notify, String ip) {
        Map<String, Object> r;
        TermsService.Terms t;
        try {
            t = terms.publish(title, body, note, s.name());
        } catch (IllegalArgumentException e) {
            if (auth != null) auth.audit(s.name(), s.role(), "terms.publish", null, "refused", e.getMessage(), ip);
            return error(e.getMessage());
        } catch (SQLException e) {
            log.error("Could not save the terms", e);
            return error("Could not save that. Please try again.");
        }
        if (auth != null) auth.audit(s.name(), s.role(), "terms.publish", "v=" + t.v(), "ok", note, ip);
        if (notify) {
            Map<String, Object> a = new LinkedHashMap<>();
            a.put("type", "terms.notify");
            a.put("v", t.v());
            r = run(a, s.name());
            if (r.containsKey("err")) return r;
        } else {
            r = new LinkedHashMap<>();
            r.put("ok", true);
            lock.lock();
            try { publish(List.of()); } finally { lock.unlock(); }
        }
        r.put("v", t.v());
        return r;
    }

    /** An SMS that arrived from a real phone through Kannel (the phone network vouches for the number). */
    public Map<String, Object> incomingSms(String from, String text) {
        Map<String, Object> a = new LinkedHashMap<>();
        a.put("type", "sms");
        a.put("num", from);
        a.put("text", text);
        return run(a, "sms from +" + from.replaceAll("[^0-9]", ""));
    }

    private Map<String, Object> run(Map<String, Object> a, String who) {
        String type = String.valueOf(a.get("type"));
        long t0 = System.nanoTime();
        Map<String, Object> r;
        lock.lock();
        try {
            r = engine.act(a);
            engine.bump();
            Changes ch = engine.takeChanges();
            if (!persist(ch)) return error("Could not save that. Please try again.");
            snapshot = Json.snapshot(engine.state());
            publish(ch.outgoing());
        } catch (RuntimeException e) {
            log.error("Action {} failed; reloading from the database", type, e);
            reloadQuietly();
            return error("Something went wrong on the server. Please try again.");
        } finally {
            lock.unlock();
        }
        long ms = (System.nanoTime() - t0) / 1_000_000;
        if (r.containsKey("err")) log.info("{} by {} -> refused: {} ({} ms)", type, who, r.get("err"), ms);
        else log.info("{} by {} -> ok ({} ms)", type, who, ms);
        return r;
    }

    private static String target(Map<String, Object> a) {
        StringBuilder b = new StringBuilder();
        for (String k : new String[]{"off", "org", "inv", "plate", "phone", "name", "road", "id", "daily", "annual", "fine", "ref", "reason", "title"})
            if (a.get(k) != null) { if (b.length() > 0) b.append(' '); b.append(k).append('=').append(a.get(k)); }
        return b.toString();
    }

    /** Demo clock: one minute passes. */
    void tick() {
        lock.lock();
        try {
            if (engine.tickMinute()) {
                engine.bump();
                if (persist(engine.takeChanges())) { snapshot = Json.snapshot(engine.state()); publish(List.of()); }
            }
        } catch (RuntimeException e) {
            log.error("Clock tick failed", e);
        } finally {
            lock.unlock();
        }
    }

    /** Real-time clock: follow the wall clock, running the end-of-day rules at midnight. */
    void syncRealClock() {
        ZonedDateTime now = ZonedDateTime.now(cfg.timezone);
        lock.lock();
        try {
            if (engine.state().clock.date.isAfter(now.toLocalDate())) {
                log.warn("Stored clock {} is ahead of today {}: moving it back", engine.state().clock.date, now.toLocalDate());
                engine.state().clock.date = now.toLocalDate();
            }
            if (engine.syncTo(now.toLocalDate(), now.getHour() * 60 + now.getMinute())) {
                engine.bump();
                Changes ch = engine.takeChanges();
                if (persist(ch)) { snapshot = Json.snapshot(engine.state()); publish(ch.outgoing()); }
            }
        } catch (RuntimeException e) {
            log.error("Clock update failed", e);
        } finally {
            lock.unlock();
        }
    }

    private boolean persist(Changes ch) {
        try (Connection c = ds.getConnection()) {
            c.setAutoCommit(false);
            try {
                repo.save(c, engine.state(), ch);
                c.commit();
                return true;
            } catch (SQLException | RuntimeException e) {
                c.rollback();
                throw e;
            }
        } catch (SQLException | RuntimeException e) {
            log.error("Could not save to MariaDB; undoing the change by reloading from the database", e);
            reloadQuietly();
            return false;
        }
    }

    private void reloadQuietly() {
        try (Connection c = ds.getConnection()) {
            State s = repo.load(c);
            if (s != null) {
                boolean pay = engine != null && engine.paymentsEnabled();
                engine = new ParkingEngine(s);
                engine.setPaymentsEnabled(pay);
                snapshot = Json.snapshot(s);
            }
        } catch (SQLException e) {
            log.error("Could not reload from MariaDB either; the server keeps the unsaved data in memory until the database is back", e);
        }
    }

    /** Hands new SMS to the gateway and tells the screens. Both only queue work, so this runs under the lock and keeps the order. */
    private void publish(List<OutMessage> outgoing) {
        long now = System.currentTimeMillis();
        for (OutMessage m : outgoing) {
            Long until = simulated.get(m.num);
            if (until != null) { if (until > now) continue; simulated.remove(m.num); }
            try { sms.send(m); } catch (RuntimeException e) { log.error("SMS gateway error", e); }
        }
        Function<Session, String> viewFor = s -> views.forSession(engine, s, snapshot);
        for (Listener l : listeners) {
            try { l.changed(viewFor); } catch (RuntimeException e) { log.warn("Could not push the state to the screens", e); }
        }
    }

    /** True when MariaDB answers. */
    public boolean databaseUp() {
        try (Connection c = ds.getConnection()) { return c.isValid(2); }
        catch (SQLException e) { return false; }
    }

    private static Map<String, Object> error(String m) { Map<String, Object> r = new LinkedHashMap<>(); r.put("err", m); return r; }

    @Override public void close() {
        clock.shutdownNow();
        sms.close();
        if (instanceLock != null) {
            try (java.sql.Statement st = instanceLock.createStatement()) { st.execute("SELECT RELEASE_LOCK(CONCAT(DATABASE(), '.parkna-server'))"); }
            catch (SQLException ignored) {}
            try { instanceLock.close(); } catch (SQLException ignored) {}
        }
    }
}
