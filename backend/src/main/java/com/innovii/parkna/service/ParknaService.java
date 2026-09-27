package com.innovii.parkna.service;

import com.innovii.parkna.config.AppConfig;
import com.innovii.parkna.db.Migrator;
import com.innovii.parkna.db.StateRepository;
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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Consumer;

/**
 * Runs the engine for the whole server: one action at a time, each saved to MariaDB in its own transaction
 * before anyone sees it. After a save, outgoing SMS go to the gateway and the new state is pushed to every
 * connected screen. If a save fails, the action is undone by reloading from the database.
 */
public final class ParknaService implements AutoCloseable {
    private static final Logger log = LoggerFactory.getLogger(ParknaService.class);

    private final AppConfig cfg;
    private final DataSource ds;
    private final SmsGateway sms;
    private final StateRepository repo = new StateRepository();
    private final ReentrantLock lock = new ReentrantLock();
    private final List<Consumer<String>> listeners = new CopyOnWriteArrayList<>();
    private final ScheduledExecutorService clock = Executors.newSingleThreadScheduledExecutor(r -> { Thread t = new Thread(r, "parkna-clock"); t.setDaemon(true); return t; });
    private ParkingEngine engine;
    private volatile String snapshot;
    /** Held while this server runs, with a MariaDB lock that stops a second ParkNa from using the same database. */
    private Connection instanceLock;

    public ParknaService(AppConfig cfg, DataSource ds, SmsGateway sms) {
        this.cfg = cfg;
        this.ds = ds;
        this.sms = sms;
    }

    public void start() throws SQLException {
        takeInstanceLock();
        if (cfg.db.migrate()) Migrator.migrate(ds);
        try (Connection c = ds.getConnection()) {
            State s = repo.load(c);
            if (s == null) {
                engine = ParkingEngine.seeded();
                if (cfg.clockMode == AppConfig.ClockMode.REAL) startAtToday(engine.state());
                c.setAutoCommit(false);
                repo.save(c, engine.state(), engine.takeChanges());
                c.commit();
                log.info("Database was empty: loaded the ParkNa pilot starting data");
            } else {
                engine = new ParkingEngine(s);
                log.info("Loaded ParkNa data from the database: {} phone numbers, {} plates, {} attendants, {} organisations, clock {} {}",
                        s.nums.size(), s.plates.size(), s.off.size(), s.orga.size(), s.clock.date, com.innovii.parkna.engine.Cal.hm(s.clock.min));
            }
        }
        snapshot = Json.snapshot(engine.state());
        if (cfg.clockMode == AppConfig.ClockMode.REAL) {
            syncRealClock();
            clock.scheduleAtFixedRate(this::syncRealClock, 15, 15, TimeUnit.SECONDS);
        } else {
            clock.scheduleAtFixedRate(this::tick, 60, 60, TimeUnit.SECONDS);
        }
    }

    private void takeInstanceLock() throws SQLException {
        Connection c = ds.getConnection();
        try (java.sql.Statement st = c.createStatement(); java.sql.ResultSet rs = st.executeQuery("SELECT GET_LOCK(CONCAT(DATABASE(), '.parkna-server'), 10)")) {
            if (rs.next() && rs.getInt(1) == 1) { instanceLock = c; return; }
        }
        c.close();
        throw new IllegalStateException("Another ParkNa server is already running on this database. Stop it first (two servers would overwrite each other's data).");
    }

    private void startAtToday(State s) {
        ZonedDateTime now = ZonedDateTime.now(cfg.timezone);
        s.clock.date = now.toLocalDate();
        s.clock.min = now.getHour() * 60 + now.getMinute();
    }

    /** The state as the screens receive it. */
    public String snapshot() { return snapshot; }

    public void addListener(Consumer<String> l) { listeners.add(l); }
    public void removeListener(Consumer<String> l) { listeners.remove(l); }

    /** Runs one action from a screen and returns its answer. */
    public Map<String, Object> act(Map<String, Object> a) {
        String type = String.valueOf(a.get("type"));
        if (!cfg.demoControls && (type.startsWith("clock.") || type.equals("demo.reset")))
            return error("Demo controls are switched off on this server.");
        if (cfg.clockMode == AppConfig.ClockMode.REAL && type.startsWith("clock."))
            return error("The clock follows real time on this server.");
        long t0 = System.nanoTime();
        Map<String, Object> r;
        lock.lock();
        try {
            r = engine.act(a);
            engine.bump();
            Changes ch = engine.takeChanges();
            if (!persist(ch)) return error("Could not save that. Please try again.");
            snapshot = Json.snapshot(engine.state());
            publish(ch.outgoing(), snapshot);
        } catch (RuntimeException e) {
            log.error("Action {} failed; reloading from the database", type, e);
            reloadQuietly();
            return error("Server error: " + e.getMessage());
        } finally {
            lock.unlock();
        }
        long ms = (System.nanoTime() - t0) / 1_000_000;
        if (r.containsKey("err")) log.info("{} {} -> refused: {} ({} ms)", type, who(a), r.get("err"), ms);
        else log.info("{} {} -> ok ({} ms)", type, who(a), ms);
        return r;
    }

    /** An SMS that arrived from a real phone through Kannel. */
    public Map<String, Object> incomingSms(String from, String text) {
        Map<String, Object> a = new LinkedHashMap<>();
        a.put("type", "sms");
        a.put("num", from);
        a.put("text", text);
        return act(a);
    }

    /** Demo clock: one minute passes. */
    void tick() {
        lock.lock();
        try {
            if (engine.tickMinute()) {
                engine.bump();
                if (persist(engine.takeChanges())) { snapshot = Json.snapshot(engine.state()); publish(List.of(), snapshot); }
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
                if (persist(ch)) { snapshot = Json.snapshot(engine.state()); publish(ch.outgoing(), snapshot); }
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
            if (s != null) { engine = new ParkingEngine(s); snapshot = Json.snapshot(s); }
        } catch (SQLException e) {
            log.error("Could not reload from MariaDB either; the server keeps the unsaved data in memory until the database is back", e);
        }
    }

    /** Hands new SMS to the gateway and the new state to the screens. Both only queue work, so this runs under the lock and keeps the order. */
    private void publish(List<OutMessage> outgoing, String snap) {
        for (OutMessage m : outgoing) {
            try { sms.send(m); } catch (RuntimeException e) { log.error("SMS gateway error", e); }
        }
        for (Consumer<String> l : listeners) {
            try { l.accept(snap); } catch (RuntimeException e) { log.warn("Could not push the state to a screen", e); }
        }
    }

    /** True when MariaDB answers. */
    public boolean databaseUp() {
        try (Connection c = ds.getConnection()) { return c.isValid(2); }
        catch (SQLException e) { return false; }
    }

    private static Map<String, Object> error(String m) { Map<String, Object> r = new LinkedHashMap<>(); r.put("err", m); return r; }

    private static String who(Map<String, Object> a) {
        for (String k : new String[]{"num", "phone", "org", "off"}) if (a.get(k) != null) return k + "=" + a.get(k);
        return "";
    }

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
