package com.innovii.parkna.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.innovii.parkna.auth.Role;
import com.innovii.parkna.auth.Session;
import com.innovii.parkna.config.AppConfig;
import com.innovii.parkna.engine.ParkingEngine;
import com.innovii.parkna.json.Json;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Nobody but staff receives other people's phone numbers, receipts or messages. */
class ViewsTest {
    private static final ObjectMapper M = new ObjectMapper();

    private static AppConfig config(String mode) {
        Properties db = new Properties();
        db.setProperty("db.url", "jdbc:mariadb://127.0.0.1/none");
        db.setProperty("db.username", "x");
        Properties cfg = new Properties();
        cfg.setProperty("app.mode", mode);
        return AppConfig.of(db, cfg);
    }

    private static Session session(Role role, String subject, String org) {
        return new Session("h", role, subject, org, role.staff ? "Staff Person" : null, Instant.now().plusSeconds(60), false);
    }

    /** A demo engine after some real activity: payments, checks, an SMS conversation. */
    private static ParkingEngine busy() {
        ParkingEngine e = ParkingEngine.seeded();
        act(e, "type", "driver.pay", "num", "7055501", "plate", "BJL8080", "prov", "Afrimoney");
        act(e, "type", "driver.pay", "num", "7023456", "plate", "BJL1234", "prov", "Wave");
        act(e, "type", "driver.pay", "num", "7023456", "plate", "BJL8080", "kind", "monthly", "prov", "Wave");
        act(e, "type", "sms", "num", "7300007", "text", "START");
        act(e, "type", "sms", "num", "7300007", "text", "BJL8080");
        act(e, "type", "sms", "num", "7300007", "text", "BJL9191");
        act(e, "type", "sms", "num", "7300007", "text", "BJL7001");
        act(e, "type", "org.sendCode", "phone", "7101234");
        return e;
    }

    private static void act(ParkingEngine e, Object... kv) {
        Map<String, Object> a = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) a.put((String) kv[i], kv[i + 1]);
        e.act(a);
    }

    private static JsonNode view(ParkingEngine e, Session s) throws Exception {
        return M.readTree(new Views(config("demo")).forSession(e, s, Json.snapshot(e.state())));
    }

    private static List<String> keys(JsonNode n) { List<String> k = new ArrayList<>(); n.fieldNames().forEachRemaining(k::add); return k; }

    @Test
    void driverSeesOnlyTheirOwnData() throws Exception {
        ParkingEngine e = busy();
        JsonNode v = view(e, session(Role.DRIVER, "7055501", null));
        assertEquals(List.of("7055501"), keys(v.get("NUMS")));
        assertEquals("driver", v.get("ME").get("role").asText());
        assertFalse(v.get("ME").get("needName").asBoolean());
        assertEquals(0, v.get("LOG").size());
        assertEquals(0, v.get("OUT").size());
        assertEquals(0, v.get("OFF").size());
        assertEquals(0, v.get("EXC").size());
        assertTrue(v.get("PLATES").has("BJL8080"));
        for (JsonNode p : v.get("PLATES")) assertEquals(0, p.get("payers").size(), "payers (other people's numbers) must not be sent");
        for (JsonNode c : v.get("CHECKS")) assertEquals("BJL8080", c.get("plate").asText());
        assertFalse(v.toString().contains("7023456"), "another driver's number leaked into the view");
        assertFalse(v.toString().contains("7101234"), "an organisation contact's number leaked into the view");
    }

    @Test
    void driverWithAFleetPlateSeesOnlyWhatCoversIt() throws Exception {
        JsonNode v = view(busy(), session(Role.DRIVER, "7089012", null));
        JsonNode org = v.get("ORGA").get("ORG-014");
        assertEquals("Demo Bank", org.get("name").asText());
        assertEquals(1, org.get("plates").size());
        assertFalse(org.has("contact"));
        assertFalse(v.toString().contains("BJL7002"), "other fleet plates must not be sent");
    }

    @Test
    void warningsGoOnlyToTheirPlatesAndNeverCarryThePayersNumber() throws Exception {
        ParkingEngine e = ParkingEngine.seeded();
        act(e, "type", "sms", "num", "7300007", "text", "START");
        act(e, "type", "sms", "num", "7300007", "text", "W BJL2211");   // Isatou's car
        act(e, "type", "sms", "num", "7300007", "text", "W BJL9191");   // nobody's
        act(e, "type", "driver.pay", "num", "7023456", "plate", "BJL2211", "prov", "Wave");   // a friend pays Isatou's warning
        JsonNode isatou = view(e, session(Role.DRIVER, "3034567", null));
        assertEquals(1, isatou.get("FINES").size());
        JsonNode w = isatou.get("FINES").get(0);
        assertEquals("BJL2211", w.get("plate").asText());
        assertEquals("paid", w.get("status").asText());
        assertTrue(w.get("settled").get("num").isNull(), "the payer's number must not be sent");
        assertFalse(isatou.toString().contains("7023456"), "the payer's number leaked into the view");
        JsonNode musa = view(e, session(Role.DRIVER, "7055501", null));
        assertEquals(0, musa.get("FINES").size());
        JsonNode officer = view(e, session(Role.OFFICER, "7300007", null));
        assertEquals(2, officer.get("FINES").size());
        JsonNode anon = view(e, session(Role.ORG, "7101234", "ORG-014"));
        assertEquals(0, anon.get("FINES").size());
    }

    @Test
    void officerSeesTheirRecordAndChecks() throws Exception {
        JsonNode v = view(busy(), session(Role.OFFICER, "7300007", null));
        assertEquals(List.of("7300007"), keys(v.get("OFF")));
        assertEquals(List.of("7300007"), keys(v.get("NUMS")));
        assertEquals(3, v.get("CHECKS").size());
        assertEquals(0, v.get("LOG").size());
        String json = v.toString();
        int i = json.indexOf("7055501");
        assertFalse(i >= 0, "a driver's number leaked: ..." + (i >= 0 ? json.substring(Math.max(0, i - 200), Math.min(json.length(), i + 60)) : ""));
        assertFalse(json.contains("7300012"), "other attendants' numbers must not be sent");
    }

    @Test
    void organisationSeesItsAccountButNoPayerNumbers() throws Exception {
        JsonNode v = view(busy(), session(Role.ORG, "7101234", "ORG-014"));
        assertEquals(List.of("ORG-014"), keys(v.get("ORGA")));
        assertEquals(List.of("7101234"), keys(v.get("NUMS")));
        for (JsonNode m : v.get("OUT")) assertEquals("7101234", m.get("num").asText());
        for (JsonNode l : v.get("LOG")) assertFalse(l.has("num"));
        assertFalse(v.toString().contains("7089012"), "the fleet driver's own number must not be sent");
    }

    @Test
    void staffSeeEverything() throws Exception {
        ParkingEngine e = busy();
        JsonNode v = view(e, session(Role.COUNCIL, "council", null));
        assertTrue(v.get("NUMS").has("7023456"));
        assertTrue(v.get("NUMS").has("7101234"));
        assertEquals("council", v.get("ME").get("role").asText());
        assertEquals(M.readTree(Json.snapshot(e.state())).get("LOG"), v.get("LOG"));
    }

    @Test
    void onlyLiveAnnouncementsAreSentToThePublic() throws Exception {
        ParkingEngine e = ParkingEngine.seeded();
        act(e, "type", "back.announce", "title", "Future market", "from", "2027-01-01", "to", "2027-01-10");
        act(e, "type", "back.announceStatus", "id", "AN-001", "status", "hidden");
        JsonNode v = view(e, session(Role.DRIVER, "7055501", null));
        List<String> ids = new ArrayList<>();
        for (JsonNode a : v.get("ANN")) ids.add(a.get("id").asText());
        assertEquals(List.of("AN-002"), ids);
        assertEquals(3, view(e, session(Role.ADMIN, "admin", null)).get("ANN").size());
    }

    @Test
    void productionStartsEmptyAndWithoutPayments() throws Exception {
        ParkingEngine e = ParkingEngine.empty(java.time.LocalDate.of(2026, 9, 28), 600);
        e.setPaymentsEnabled(false);
        assertEquals(0, e.state().nums.size());
        assertEquals(0, e.state().off.size());
        assertEquals(0, e.state().orga.size());
        assertEquals(0, e.state().ann.size());
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("type", "driver.pay"); r.put("num", "7012345"); r.put("plate", "BJL1234"); r.put("prov", "Wave");
        assertEquals(ParkingEngine.PAYMENTS_OFF, e.act(r).get("err"));
        Map<String, Object> sms = new LinkedHashMap<>();
        sms.put("type", "sms"); sms.put("num", "7012345"); sms.put("text", "BJL1234");
        String reply = String.valueOf(e.act(sms).get("reply"));
        assertTrue(reply.contains("opens soon"), reply);
        assertFalse(reply.contains("1 Wave"), "no provider menu while payments are off");
        JsonNode mode = M.readTree(Json.write(new Views(config("production")).mode(e)));
        assertFalse(mode.get("payments").asBoolean());
        assertFalse(mode.get("demo").asBoolean());
    }

    @Test
    void bankDetailsGoOnlyToOrganisationsAndStaff() throws Exception {
        Properties db = new Properties();
        db.setProperty("db.url", "jdbc:mariadb://127.0.0.1/none");
        db.setProperty("db.username", "x");
        Properties cfg = new Properties();
        cfg.setProperty("app.mode", "production");
        cfg.setProperty("billing.bank.name", "Test Bank");
        cfg.setProperty("billing.bank.accountNumber", "001 234");
        cfg.setProperty("support.phone", "+220 400 0000");
        Views views = new Views(AppConfig.of(db, cfg));
        ParkingEngine e = busy();
        String full = Json.snapshot(e.state());
        JsonNode org = M.readTree(views.forSession(e, session(Role.ORG, "7101234", "ORG-014"), full));
        JsonNode staff = M.readTree(views.forSession(e, session(Role.FINANCE, "lamin", null), full));
        JsonNode driver = M.readTree(views.forSession(e, session(Role.DRIVER, "7055501", null), full));
        JsonNode officer = M.readTree(views.forSession(e, session(Role.OFFICER, "7300007", null), full));
        assertEquals("Test Bank", org.get("BANK").get("bank").asText());
        assertEquals("001 234", staff.get("BANK").get("accountNumber").asText());
        assertFalse(driver.has("BANK"));
        assertFalse(officer.has("BANK"));
        assertEquals("+220 400 0000", driver.get("MODE").get("supportPhone").asText());
        assertFalse(M.readTree(new Views(config("production")).forSession(e, session(Role.ORG, "7101234", "ORG-014"), full)).has("BANK"), "no BANK until it is configured");
    }

    @Test
    void productionServerHoldingTheDemoStoryIsFlagged() throws Exception {
        Session admin = session(Role.ADMIN, "admin", null);
        ParkingEngine demo = ParkingEngine.seeded(), fresh = ParkingEngine.empty(java.time.LocalDate.of(2026, 11, 2), 540);
        JsonNode upgraded = M.readTree(new Views(config("production")).forSession(demo, admin, Json.snapshot(demo.state())));
        JsonNode clean = M.readTree(new Views(config("production")).forSession(fresh, admin, Json.snapshot(fresh.state())));
        JsonNode demoServer = M.readTree(new Views(config("demo")).forSession(demo, admin, Json.snapshot(demo.state())));
        assertTrue(upgraded.get("MODE").get("demoData").asBoolean());
        assertFalse(clean.get("MODE").has("demoData"));
        assertFalse(demoServer.get("MODE").has("demoData"));
    }

    /** The police: warnings, plates and who to contact about an unpaid one; no payments, wallets, messages or attendants' phones. */
    @Test
    void policeSeeWarningsAndDriversToFollowUpOnly() throws Exception {
        ParkingEngine e = busy();
        act(e, "type", "sms", "num", "7300007", "text", "W BJL5678");
        JsonNode v = view(e, session(Role.POLICE, "police1", null));
        assertEquals("police", v.get("ME").get("role").asText());
        assertEquals(1, v.get("FINES").size());
        assertEquals("BJL5678", v.get("FINES").get(0).get("plate").asText());
        assertEquals(List.of("3034567"), keys(v.get("NUMS")), "only the phones linked to a plate with an open warning");
        JsonNode u = v.get("NUMS").get("3034567");
        assertEquals(List.of("num", "name", "plates"), keys(u), "name, number and the warned plates only");
        assertEquals(0, v.get("LOG").size());
        assertEquals(0, v.get("OUT").size());
        assertEquals(0, v.get("EXC").size());
        for (JsonNode o : v.get("OFF")) assertFalse(o.has("num"), "attendants' phone numbers are not sent to the police");
        assertFalse(v.toString().contains("7023456"), "a driver without an open warning leaked into the view");
        assertFalse(v.toString().contains("\"receipts\"") || v.toString().contains("\"Afrimoney\":"), "receipts or wallets leaked into the police view");
    }

    @Test
    void modeTellsTheAppsTheTermsInForce() throws Exception {
        Views views = new Views(config("demo"));
        views.termsVersion(() -> "7");
        JsonNode mode = M.readTree(Json.write(views.mode(ParkingEngine.seeded())));
        assertEquals("7", mode.get("termsV").asText());
        assertTrue(mode.get("smsSimulator").asBoolean(), "on by default on a demo server");
    }
}
