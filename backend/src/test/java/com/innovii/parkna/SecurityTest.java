package com.innovii.parkna;

import com.innovii.parkna.auth.AuthException;
import com.innovii.parkna.auth.AuthService;
import com.innovii.parkna.auth.Passwords;
import com.innovii.parkna.auth.Role;
import com.innovii.parkna.auth.Session;
import com.innovii.parkna.config.AppConfig;
import com.innovii.parkna.service.ParknaService;
import com.innovii.parkna.sms.SimulatedSmsGateway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.mariadb.jdbc.MariaDbDataSource;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Sign-in and permissions against a real MariaDB: codes, sessions, staff passwords and lockout, and that every action
 * is limited to the signed-in person's role and own number.
 * Run with: mvn test -Dtest.db.url=jdbc:mariadb://127.0.0.1:3306/parkna_test -Dtest.db.password=...
 */
class SecurityTest {
    private static MariaDbDataSource ds;
    private static ParknaService service;
    private static AuthService auth;

    @BeforeAll
    static void start() throws Exception {
        String url = System.getProperty("test.db.url", "");
        Assumptions.assumeFalse(url.isBlank(), "test.db.url not set");
        ds = new MariaDbDataSource(url);
        ds.setUser(System.getProperty("test.db.username", "parkna_test"));
        ds.setPassword(System.getProperty("test.db.password", ""));
        try (Connection c = ds.getConnection(); Statement st = c.createStatement()) {
            List<String> tables = new ArrayList<>();
            try (ResultSet rs = st.executeQuery("SHOW TABLES")) { while (rs.next()) tables.add(rs.getString(1)); }
            for (String t : tables) st.execute("DROP TABLE `" + t + "`");
        }
        Properties db = new Properties();
        db.setProperty("db.url", url);
        db.setProperty("db.username", "x");
        Properties cfg = new Properties();
        cfg.setProperty("app.mode", "demo");
        cfg.setProperty("clock.mode", "demo");
        cfg.setProperty("auth.reviewNumbers", "7000001:246810");
        AppConfig config = AppConfig.of(db, cfg);
        service = new ParknaService(config, ds, new SimulatedSmsGateway());
        service.start();
        auth = new AuthService(config, ds, new SimulatedSmsGateway(), service);
        service.setAuth(auth);
        auth.bootstrap();
    }

    @AfterAll
    static void stop() { if (service != null) service.close(); }

    private static Session phone(String num, String as) {
        Map<String, Object> r = auth.requestOtp(num, as, "10.0.0.1");
        String code = (String) r.get("code");
        assertNotNull(code, "the test server shows codes in the app");
        String token = (String) auth.verifyOtp(num, as, code, "10.0.0.1", "test").get("token");
        return auth.authenticate(token);
    }

    private static Session staff(String username, String role, boolean mustChange) throws Exception {
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(
                "INSERT INTO staff_user (username, display_name, role, password_hash, must_change_password) VALUES (?, ?, ?, ?, ?)")) {
            ps.setString(1, username); ps.setString(2, "Test " + username); ps.setString(3, role); ps.setString(4, Passwords.hash("correct horse battery"));
            ps.setBoolean(5, mustChange);
            ps.executeUpdate();
        }
        String token = (String) auth.staffLogin(username, "correct horse battery", "10.0.0.2", "test").get("token");
        return auth.authenticate(token);
    }

    private static Map<String, Object> act(Session s, Object... kv) {
        Map<String, Object> a = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) a.put((String) kv[i], kv[i + 1]);
        return service.act(s, a, "10.0.0.3");
    }

    @Test
    void phoneSignInWithACode() {
        Map<String, Object> r = auth.requestOtp("+220 705 5501", "driver", "10.0.0.1");
        String code = (String) r.get("code");
        AuthException tooSoon = assertThrows(AuthException.class, () -> auth.requestOtp("7055501", "driver", "10.0.0.1"));
        assertEquals(429, tooSoon.status);
        String wrong = code.equals("000000") ? "111111" : "000000";
        assertEquals(400, assertThrows(AuthException.class, () -> auth.verifyOtp("7055501", "driver", wrong, "10.0.0.1", "t")).status);
        String token = (String) auth.verifyOtp("2207055501", "driver", code, "10.0.0.1", "t").get("token");
        Session s = auth.authenticate(token);
        assertEquals(Role.DRIVER, s.role());
        assertEquals("7055501", s.subject());
        assertEquals(400, assertThrows(AuthException.class, () -> auth.verifyOtp("7055501", "driver", code, "10.0.0.1", "t")).status, "a code works once");
        auth.logout(s);
        assertNull(auth.authenticate(token));
    }

    @Test
    void codesStopAfterFiveWrongTries() {
        String code = (String) auth.requestOtp("7045678", "driver", "10.0.0.1").get("code");
        String wrong = code.equals("000000") ? "111111" : "000000";
        for (int i = 0; i < 5; i++) assertThrows(AuthException.class, () -> auth.verifyOtp("7045678", "driver", wrong, "10.0.0.1", "t"));
        assertThrows(AuthException.class, () -> auth.verifyOtp("7045678", "driver", code, "10.0.0.1", "t"), "the right code no longer works after 5 wrong ones");
    }

    @Test
    void rolesFollowTheRecords() {
        assertEquals(403, assertThrows(AuthException.class, () -> auth.requestOtp("7023456", "officer", "10.0.0.1")).status);
        assertEquals(403, assertThrows(AuthException.class, () -> auth.requestOtp("7300012", "driver", "10.0.0.1")).status);
        assertEquals(403, assertThrows(AuthException.class, () -> auth.requestOtp("7023456", "org", "10.0.0.1")).status);
        Session org = phone("7101234", "org");
        assertEquals("ORG-014", org.orgId());
    }

    @Test
    void driversActOnlyAsThemselves() {
        Session lamin = phone("7023456", "driver");
        Map<String, Object> r = act(lamin, "type", "driver.pay", "num", "3034567", "plate", "BJL5678", "prov", "Wave");
        assertEquals(Boolean.TRUE, r.get("ok"));
        assertTrue(service.viewFor(lamin).contains("\"BJL5678\""), "the payment is recorded for the signed-in driver, not the number sent");
        String isatou = service.viewFor(new Session("x", Role.ADMIN, "admin", null, "A", java.time.Instant.now().plusSeconds(60), false));
        assertTrue(isatou.contains("\"3034567\""));
        assertEquals("You are not allowed to do that.", act(lamin, "type", "back.publish", "daily", 250, "auth", "x").get("err"));
        assertEquals("You are not allowed to do that.", act(lamin, "type", "sms", "text", "START").get("err"));
        assertEquals("You are not allowed to do that.", act(lamin, "type", "org.sendCode", "phone", "7101234").get("err"), "the old fixed-code sign-in is gone");
    }

    @Test
    void officersWorkTheirOwnLine() {
        Session modou = phone("7300007", "officer");
        assertTrue(String.valueOf(act(modou, "type", "sms", "num", "7300012", "text", "START").get("reply")).contains("Attendant 07"));
        assertEquals("You are not allowed to do that.", act(modou, "type", "back.reassign", "off", "7300007", "road", "LEM").get("err"));
    }

    @Test
    void staffRolesAndTheAuditLog() throws Exception {
        Session council = staff("council1", "COUNCIL", false);
        assertEquals("The Council view is read-only.", act(council, "type", "back.exception", "plate", "BJL1234").get("err"));
        Session finance = staff("finance1", "FINANCE", false);
        assertEquals("You are not allowed to do that.", act(finance, "type", "back.publish", "daily", 250, "auth", "x").get("err"));
        Session admin = staff("admin2", "ADMIN", false);
        assertEquals(Boolean.TRUE, act(admin, "type", "back.publish", "daily", 240, "auth", "BCC 2026/41", "_actor", "Somebody Else").get("ok"));
        String full = service.viewFor(admin);
        assertTrue(full.contains("\"by\":\"Test admin2\""), "the change is signed with the staff member's real name, not a name sent by the screen");
        try (Connection c = ds.getConnection(); Statement st = c.createStatement();
             ResultSet rs = st.executeQuery("SELECT actor, action, result FROM audit_log WHERE action = 'back.publish' ORDER BY id DESC LIMIT 1")) {
            assertTrue(rs.next());
            assertEquals("Test admin2", rs.getString(1));
            assertEquals("ok", rs.getString(3));
        }
    }

    @Test
    void newStaffAccountsAreAdministratorsOrPolice() throws Exception {
        Session admin = staff("admin4", "ADMIN", false);
        Map<String, Object> police = auth.createStaff(admin, "police.kanifing", "Awa Police", "police");
        assertEquals(Boolean.TRUE, police.get("ok"));
        assertNotNull(police.get("password"), "a temporary password, shown once");
        for (String old : List.of("supervisor", "finance", "council", "driver", "org"))
            assertEquals(400, assertThrows(AuthException.class, () -> auth.createStaff(admin, "new." + old, "New Person", old)).status, old + " is not offered any more");
        assertEquals(400, assertThrows(AuthException.class, () -> auth.updateStaff(admin, "police.kanifing", "finance", null, false)).status);
        auth.updateStaff(admin, "police.kanifing", "admin", null, false);
        Session council = staff("council2", "COUNCIL", false);
        assertNotNull(council, "an account made before keeps signing in with its old role");
        auth.updateStaff(admin, "council2", "police", null, false);
        String token = (String) auth.staffLogin("council2", "correct horse battery", "10.0.0.2", "t").get("token");
        assertEquals(Role.POLICE, auth.authenticate(token).role(), "an old account can be moved to Police");
    }

    @Test
    void staffPasswordsAndLockout() throws Exception {
        Session fresh = staff("super1", "SUPERVISOR", true);
        assertEquals("Choose a new password first.", act(fresh, "type", "back.register", "name", "X Y", "phone", "7300099").get("err"));
        assertThrows(AuthException.class, () -> auth.changePassword(fresh, "correct horse battery", "short"));
        auth.changePassword(fresh, "correct horse battery", "a much longer password");
        Session again = auth.authenticate(null);
        assertNull(again);
        String token = (String) auth.staffLogin("super1", "a much longer password", "10.0.0.2", "t").get("token");
        Session s = auth.authenticate(token);
        assertEquals(Boolean.TRUE, act(s, "type", "back.register", "name", "Kaddy Njie", "phone", "7300099", "road", "WEL").get("ok"));
        for (int i = 0; i < 5; i++) assertThrows(AuthException.class, () -> auth.staffLogin("super1", "wrong password!", "10.0.0.2", "t"));
        AuthException locked = assertThrows(AuthException.class, () -> auth.staffLogin("super1", "a much longer password", "10.0.0.2", "t"));
        assertEquals(429, locked.status, "locked for 15 minutes after 5 wrong passwords");
    }

    @Test
    void theFirstAdminIsCreatedOnce() throws Exception {
        auth.bootstrap();
        try (Connection c = ds.getConnection(); Statement st = c.createStatement(); ResultSet rs = st.executeQuery("SELECT COUNT(*) FROM staff_user WHERE username = 'admin'")) {
            assertTrue(rs.next());
            assertEquals(1, rs.getInt(1));
        }
    }

    @Test
    void playReviewNumberSignsInWithItsFixedCodeOnly() {
        Map<String, Object> r = auth.requestOtp("7000001", "driver", "10.0.0.9");
        assertEquals(true, r.get("ok"));
        assertNull(r.get("code"), "the fixed code is never sent back, even on a server that shows codes in the app");
        assertThrows(AuthException.class, () -> auth.verifyOtp("7000001", "driver", "111111", "10.0.0.9", "test"));
        Map<String, Object> ok = auth.verifyOtp("7000001", "driver", "246810", "10.0.0.9", "test");
        assertNotNull(ok.get("token"));
        // other numbers still get a random code
        Map<String, Object> other = auth.requestOtp("7000002", "driver", "10.0.0.9");
        assertTrue(!"246810".equals(other.get("code")));
    }
}
