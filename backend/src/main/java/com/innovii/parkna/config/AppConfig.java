package com.innovii.parkna.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Properties;

/**
 * The two property files that live outside the WAR, so one build runs in every environment:
 * <ul>
 *   <li>{@code database.properties}: how to reach MariaDB</li>
 *   <li>{@code config.properties}: public address, clock mode, SMS gateway (Kannel) and other integration settings</li>
 * </ul>
 * Folder, first match wins: system property {@code parkna.config.dir} (set in Tomcat's bin/setenv.sh),
 * environment variable {@code PARKNA_CONFIG_DIR}, then {@code $CATALINA_BASE/conf/parkna}.
 */
public final class AppConfig {
    private static final Logger log = LoggerFactory.getLogger(AppConfig.class);

    public enum ClockMode { DEMO, REAL }
    public enum SmsMode { SIMULATED, KANNEL }

    public final Path dir;
    public final Database db;
    public final String publicUrl;
    public final List<String> allowedOrigins;
    public final ClockMode clockMode;
    public final ZoneId timezone;
    public final boolean demoControls;
    public final Sms sms;

    public record Database(String url, String username, String password, int maxPoolSize, int minIdle, long connectionTimeoutMs, boolean migrate) {}

    public record Sms(SmsMode mode, String shortCode, String sendSmsUrl, String username, String password, String from,
                      String countryCode, String coding, int timeoutMs, List<String> moAllowedIps) {}

    private AppConfig(Path dir, Properties dbp, Properties cfg) {
        this.dir = dir;
        this.db = new Database(
                req(dbp, "db.url", "database.properties"),
                req(dbp, "db.username", "database.properties"),
                dbp.getProperty("db.password", ""),
                integer(dbp, "db.pool.maximumPoolSize", 10),
                integer(dbp, "db.pool.minimumIdle", 2),
                integer(dbp, "db.pool.connectionTimeoutMs", 10000),
                bool(dbp, "db.migrate", true));
        this.publicUrl = cfg.getProperty("server.publicUrl", "").trim().replaceAll("/+$", "");
        this.allowedOrigins = list(cfg.getProperty("api.allowedOrigins", "*"));
        this.clockMode = ClockMode.valueOf(cfg.getProperty("clock.mode", "demo").trim().toUpperCase());
        this.timezone = ZoneId.of(cfg.getProperty("clock.timezone", "Africa/Banjul").trim());
        this.demoControls = bool(cfg, "demo.controls.enabled", clockMode == ClockMode.DEMO);
        this.sms = new Sms(
                SmsMode.valueOf(cfg.getProperty("sms.gateway", "simulated").trim().toUpperCase()),
                cfg.getProperty("sms.shortcode", "7275").trim(),
                cfg.getProperty("sms.kannel.sendsmsUrl", "http://127.0.0.1:13013/cgi-bin/sendsms").trim(),
                cfg.getProperty("sms.kannel.username", "").trim(),
                cfg.getProperty("sms.kannel.password", ""),
                cfg.getProperty("sms.kannel.from", "7275").trim(),
                cfg.getProperty("sms.kannel.countryCode", "220").trim(),
                cfg.getProperty("sms.kannel.coding", "auto").trim(),
                integer(cfg, "sms.kannel.timeoutMs", 5000),
                list(cfg.getProperty("sms.mo.allowedIps", "127.0.0.1,::1,0:0:0:0:0:0:0:1")));
        if (sms.mode() == SmsMode.KANNEL && sms.username().isEmpty())
            throw new IllegalStateException("config.properties: sms.gateway=kannel needs sms.kannel.username and sms.kannel.password");
    }

    public static AppConfig load() {
        Path dir = findDir();
        log.info("Reading ParkNa configuration from {}", dir);
        Properties dbp = read(dir.resolve("database.properties"), true);
        Properties cfg = read(dir.resolve("config.properties"), false);
        return new AppConfig(dir, dbp, cfg);
    }

    /** For tests and tools: build from properties in memory. */
    public static AppConfig of(Properties dbp, Properties cfg) { return new AppConfig(Path.of("."), dbp, cfg); }

    private static Path findDir() {
        String p = System.getProperty("parkna.config.dir");
        if (p == null || p.isBlank()) p = System.getenv("PARKNA_CONFIG_DIR");
        if (p == null || p.isBlank()) {
            String base = System.getProperty("catalina.base", ".");
            p = Path.of(base, "conf", "parkna").toString();
        }
        return Path.of(p);
    }

    private static Properties read(Path f, boolean required) {
        Properties p = new Properties();
        if (!Files.isRegularFile(f)) {
            if (required) throw new IllegalStateException("Missing " + f + " (copy config/" + f.getFileName() + ".example from the release and fill it in)");
            log.warn("{} not found, using defaults", f);
            return p;
        }
        try (Reader r = Files.newBufferedReader(f, StandardCharsets.UTF_8)) { p.load(r); }
        catch (IOException e) { throw new IllegalStateException("Cannot read " + f, e); }
        return p;
    }

    private static String req(Properties p, String k, String file) {
        String v = p.getProperty(k, "").trim();
        if (v.isEmpty()) throw new IllegalStateException(file + ": " + k + " is required");
        return v;
    }

    private static int integer(Properties p, String k, int def) {
        String v = p.getProperty(k, "").trim();
        try { return v.isEmpty() ? def : Integer.parseInt(v); }
        catch (NumberFormatException e) { throw new IllegalStateException(k + " must be a whole number, not '" + v + "'"); }
    }

    private static boolean bool(Properties p, String k, boolean def) {
        String v = p.getProperty(k, "").trim();
        return v.isEmpty() ? def : Boolean.parseBoolean(v);
    }

    private static List<String> list(String v) {
        List<String> r = new ArrayList<>();
        for (String s : v.split(",")) if (!s.isBlank()) r.add(s.trim());
        return r;
    }

    /** One line for the startup log (never includes passwords). */
    public String summary() {
        return "db=" + db.url() + " user=" + db.username() + ", clock=" + clockMode.name().toLowerCase() + " (" + timezone + ")"
                + ", demoControls=" + demoControls + ", sms=" + sms.mode().name().toLowerCase()
                + (sms.mode() == SmsMode.KANNEL ? " via " + sms.sendSmsUrl() : "") + ", publicUrl=" + (publicUrl.isEmpty() ? "(not set)" : publicUrl);
    }
}
