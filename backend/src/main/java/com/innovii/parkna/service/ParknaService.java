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
        if (!cfg.smsSimulator) return error("The SMS simulator is switched off on this server (sms.simulator.enabled).");
        String from = String.valueOf(a.getOrDefault("from", "")).replaceAll("[^0-9]", "");
        if (from.length() > 7) from = from.substring(from.length() - 7);
        String text = String.valueOf(a.getOrDefault("text", "")).trim();
        if (from.length() != 7) return error("Enter a 7-digit phone number.");
        if (text.isEmpty()) return error("Type a message.");
        if (text.length() > 160) return error("Keep it to one SMS (160 characters).");
        simulated.put(from, System.currentTimeMillis() + 2 * 3600_000L);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("type", "sms");
        m.put("num", from);
        m.put("text", text);
        Map<String, Object> r = run(m, "SMS simulator (" + s.name() + ") as +220 " + from);
        if (auth != null) auth.audit(s.name(), s.role(), "sim.sms", from, r.containsKey("err") ? "refused" : "ok", text, ip);
        return r;
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
