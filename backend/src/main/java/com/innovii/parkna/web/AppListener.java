package com.innovii.parkna.web;

import com.innovii.parkna.auth.AuthService;
import com.innovii.parkna.config.AppConfig;
import com.innovii.parkna.service.ParknaService;
import com.innovii.parkna.sms.SmsGateway;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import jakarta.servlet.ServletContext;
import jakarta.servlet.ServletContextEvent;
import jakarta.servlet.ServletContextListener;
import jakarta.servlet.annotation.WebListener;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.InputStream;
import java.sql.Driver;
import java.sql.DriverManager;
import java.util.Collections;
import java.util.Properties;

/**
 * Starts ParkNa when Tomcat deploys the WAR: reads the property files, opens the MariaDB pool, applies
 * database migrations, loads the data and starts the clock. If anything is wrong the deployment fails with
 * the reason in catalina.out and parkna.log.
 */
@WebListener
public class AppListener implements ServletContextListener {
    private static final Logger log = LoggerFactory.getLogger(AppListener.class);

    static final String SERVICE = "parkna.service", CONFIG = "parkna.config", EVENTS = "parkna.events", AUTH = "parkna.auth";
    static final String VERSION = readVersion();

    private HikariDataSource ds;
    private ParknaService service;
    private EventHub events;

    @Override public void contextInitialized(ServletContextEvent sce) {
        ServletContext ctx = sce.getServletContext();
        log.info("Starting ParkNa back end {} on {}", VERSION, ctx.getServerInfo());
        try {
            AppConfig cfg = AppConfig.load();
            log.info("Configuration: {}", cfg.summary());
            HikariConfig hc = new HikariConfig();
            hc.setPoolName("parkna-db");
            hc.setDriverClassName("org.mariadb.jdbc.Driver");
            hc.setJdbcUrl(cfg.db.url());
            hc.setUsername(cfg.db.username());
            hc.setPassword(cfg.db.password());
            hc.setMaximumPoolSize(cfg.db.maxPoolSize());
            hc.setMinimumIdle(cfg.db.minIdle());
            hc.setConnectionTimeout(cfg.db.connectionTimeoutMs());
            ds = new HikariDataSource(hc);
            SmsGateway sms = SmsGateway.from(cfg.sms);
            service = new ParknaService(cfg, ds, sms);
            service.start();
            AuthService auth = new AuthService(cfg, ds, sms, service);
            service.setAuth(auth);
            auth.bootstrap();
            service.every(60, auth::cleanup);
            events = new EventHub(auth);
            service.addListener(events);
            ctx.setAttribute(CONFIG, cfg);
            ctx.setAttribute(SERVICE, service);
            ctx.setAttribute(EVENTS, events);
            ctx.setAttribute(AUTH, auth);
            log.info("ParkNa is running");
        } catch (Exception e) {
            log.error("ParkNa failed to start: {}", e.getMessage(), e);
            contextDestroyed(sce);
            throw new IllegalStateException("ParkNa failed to start: " + e.getMessage(), e);
        }
    }

    @Override public void contextDestroyed(ServletContextEvent sce) {
        if (events != null) events.close();
        if (service != null) service.close();
        if (ds != null) ds.close();
        // the MariaDB driver is inside the WAR: unregister it so Tomcat can unload the app cleanly
        for (Driver d : Collections.list(DriverManager.getDrivers())) {
            if (d.getClass().getClassLoader() == getClass().getClassLoader()) {
                try { DriverManager.deregisterDriver(d); } catch (Exception ignored) {}
            }
        }
        log.info("ParkNa stopped");
    }

    private static String readVersion() {
        try (InputStream in = AppListener.class.getResourceAsStream("/parkna-version.properties")) {
            Properties p = new Properties();
            if (in != null) p.load(in);
            return p.getProperty("version", "dev");
        } catch (Exception e) { return "dev"; }
    }
}
