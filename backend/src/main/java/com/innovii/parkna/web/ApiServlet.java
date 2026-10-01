package com.innovii.parkna.web;

import com.innovii.parkna.auth.AuthException;
import com.innovii.parkna.auth.AuthService;
import com.innovii.parkna.auth.Role;
import com.innovii.parkna.auth.Session;
import com.innovii.parkna.config.AppConfig;
import com.innovii.parkna.json.Json;
import com.innovii.parkna.service.ParknaService;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The SUNU Park API. Behind Nginx these are https://your-domain/api/...; Tomcat serves them at /parkna/api/...
 * <pre>
 * Open to everyone
 *   GET  /api/ping              is this a SUNU Park server, and what does it offer
 *   GET  /api/health            200 when the server and MariaDB are up, 503 if not (for monitoring)
 *   POST /api/auth/code         {phone, as: driver|officer|org}  send a sign-in code by SMS
 *   POST /api/auth/verify       {phone, as, code}                 check it, returns {token}
 *   POST /api/auth/staff        {username, password}              staff sign-in, returns {token}
 *   GET  /api/terms             the terms and conditions in force {v, title, body, at}
 *   GET  /api/sim/bench, /api/sim/info?num=   the SMS and USSD simulator (/sms), while sms.simulator.enabled
 *   POST /api/sim/sms {from, text}, /api/sim/ussd {from, text}, /api/sim/clock {what}
 *   POST /api/ussd              a USSD gateway: sessionId, phoneNumber, text (form or JSON), answers "CON ..."/"END ..."; allowed IPs only
 *   GET  /api/sms/mo            incoming SMS from Kannel (?from=%p&amp;text=%a), allowed IPs only
 * With "Authorization: Bearer &lt;token&gt;"
 *   GET  /api/state             your view of the data
 *   POST /api/act               one action, e.g. {"type": "driver.pay", ...}
 *   POST /api/auth/ticket       a one-time ticket for GET /api/events?ticket=... (live updates)
 *   GET  /api/auth/me, POST /api/auth/logout, POST /api/auth/password {current, next}
 *   GET  /api/staff, POST /api/staff {username, name, role}, POST /api/staff/update   (admins)
 *   GET  /api/audit             the latest audit log entries (admins)
 *   GET  /api/terms/history, POST /api/terms {title, body, note, notify}   publish new terms (admins)
 * </pre>
 */
@WebServlet(urlPatterns = "/api/*", asyncSupported = true, loadOnStartup = 1)
public class ApiServlet extends HttpServlet {
    private static final Logger log = LoggerFactory.getLogger(ApiServlet.class);
    private static final int MAX_BODY = 1_000_000;

    private ParknaService service() { return (ParknaService) getServletContext().getAttribute(AppListener.SERVICE); }
    private AuthService auth() { return (AuthService) getServletContext().getAttribute(AppListener.AUTH); }
    private AppConfig config() { return (AppConfig) getServletContext().getAttribute(AppListener.CONFIG); }
    private EventHub hub() { return (EventHub) getServletContext().getAttribute(AppListener.EVENTS); }

    @Override protected void doOptions(HttpServletRequest req, HttpServletResponse resp) {
        cors(req, resp);
        resp.setStatus(204);
    }

    @Override protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        cors(req, resp);
        try {
            switch (path(req)) {
                case "/ping" -> {
                    Map<String, Object> r = new LinkedHashMap<>();
                    r.put("ok", true);
                    r.put("name", "SUNU Park server");
                    r.put("version", AppListener.VERSION);
                    r.put("addresses", config().publicUrl.isEmpty() ? List.of() : List.of(config().publicUrl));
                    r.putAll(service().mode());
                    json(resp, 200, r);
                }
                case "/health" -> {
                    boolean db = service().databaseUp();
                    Map<String, Object> r = new LinkedHashMap<>();
                    r.put("ok", db);
                    r.put("database", db ? "up" : "down");
                    r.put("liveConnections", hub().count());
                    r.put("version", AppListener.VERSION);
                    json(resp, db ? 200 : 503, r);
                }
                case "/sms/mo" -> incomingSms(req, resp);
                case "/sim/bench" -> json(resp, 200, service().simBench());
                case "/sim/info" -> json(resp, 200, service().simInfo(req.getParameter("num")));
                case "/terms" -> {
                    Map<String, Object> r = new LinkedHashMap<>();
                    r.put("ok", true);
                    r.putAll(service().terms().current().toMap(true));
                    json(resp, 200, r);
                }
                case "/terms/history" -> {
                    admin(req);
                    try { json(resp, 200, Map.of("ok", true, "versions", service().terms().history())); }
                    catch (java.sql.SQLException e) { json(resp, 500, Map.of("err", "Could not read the terms history.")); }
                }
                case "/events" -> {
                    Session s = auth().redeemTicket(req.getParameter("ticket"));
                    if (s == null) throw AuthException.unauthorized();
                    hub().open(req, resp, s, service().viewFor(s));
                }
                case "/state" -> raw(resp, 200, service().viewFor(session(req)));
                case "/auth/me" -> {
                    Session s = session(req);
                    Map<String, Object> r = new LinkedHashMap<>();
                    r.put("ok", true);
                    r.put("role", s.role().name().toLowerCase());
                    r.put(s.staff() ? "username" : "num", s.subject());
                    if (s.staff()) { r.put("name", s.name()); r.put("mustChangePassword", s.mustChangePassword()); }
                    if (s.orgId() != null) r.put("org", s.orgId());
                    json(resp, 200, r);
                }
                case "/staff" -> {
                    Session a = admin(req);
                    json(resp, 200, Map.of("ok", true, "staff", auth().listStaff(), "me", a.subject()));
                }
                case "/audit" -> {
                    admin(req);
                    int limit = parseInt(req.getParameter("limit"), 100);
                    json(resp, 200, Map.of("ok", true, "entries", auth().recentAudit(limit)));
                }
                default -> json(resp, 404, Map.of("err", "Unknown endpoint"));
            }
        } catch (AuthException e) {
            json(resp, e.status, Map.of("err", e.getMessage()));
        }
    }

    @Override protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        cors(req, resp);
        String p = path(req), ip = clientIp(req), ua = req.getHeader("User-Agent");
        try {
            if (p.equals("/sms/mo")) { incomingSms(req, resp); return; }
            if (p.equals("/ussd") && !String.valueOf(req.getContentType()).contains("json")) { ussdGateway(req, resp, req.getParameter("phoneNumber"), req.getParameter("text")); return; }
            Map<String, Object> body = body(req);
            switch (p) {
                case "/auth/code" -> json(resp, 200, auth().requestOtp(str(body.get("phone")), str(body.get("as")), ip));
                case "/auth/verify" -> json(resp, 200, auth().verifyOtp(str(body.get("phone")), str(body.get("as")), str(body.get("code")), ip, ua));
                case "/auth/staff" -> json(resp, 200, auth().staffLogin(str(body.get("username")), str(body.get("password")), ip, ua));
                case "/auth/ticket" -> json(resp, 200, Map.of("ok", true, "ticket", auth().ticket(session(req))));
                case "/auth/logout" -> { auth().logout(session(req)); json(resp, 200, Map.of("ok", true)); }
                case "/auth/password" -> { auth().changePassword(session(req), str(body.get("current")), str(body.get("next"))); json(resp, 200, Map.of("ok", true)); }
                case "/act" -> json(resp, 200, service().act(session(req), body, ip));
                case "/sim/sms" -> json(resp, 200, service().simSms(str(body.get("from")), str(body.get("text")), ip));
                case "/sim/ussd" -> json(resp, 200, service().simUssd(str(body.get("from")), str(body.get("text"))));
                case "/sim/clock" -> json(resp, 200, service().simClock(str(body.get("what"))));
                case "/ussd" -> ussdGateway(req, resp, str(body.get("phoneNumber")), str(body.get("text")));
                case "/terms" -> json(resp, 200, service().publishTerms(admin(req), str(body.get("title")), str(body.get("body")), str(body.get("note")),
                        Boolean.TRUE.equals(body.get("notify")), ip));
                case "/staff" -> json(resp, 200, auth().createStaff(admin(req), str(body.get("username")), str(body.get("name")), str(body.get("role"))));
                case "/staff/update" -> {
                    Object active = body.get("active");
                    json(resp, 200, auth().updateStaff(admin(req), str(body.get("username")), body.get("role") == null ? null : str(body.get("role")),
                            active instanceof Boolean b ? b : null, Boolean.TRUE.equals(body.get("resetPassword"))));
                }
                default -> json(resp, 404, Map.of("err", "Unknown endpoint"));
            }
        } catch (AuthException e) {
            json(resp, e.status, Map.of("err", e.getMessage()));
        } catch (IllegalArgumentException e) {
            json(resp, 400, Map.of("err", "Bad request"));
        }
    }

    private Session session(HttpServletRequest req) {
        String h = req.getHeader("Authorization");
        String token = h != null && h.regionMatches(true, 0, "Bearer ", 0, 7) ? h.substring(7).trim() : null;
        Session s = auth().authenticate(token);
        if (s == null) throw AuthException.unauthorized();
        return s;
    }

    private Session admin(HttpServletRequest req) {
        Session s = session(req);
        if (s.role() != Role.ADMIN) throw AuthException.forbidden();
        if (s.mustChangePassword()) throw new AuthException(403, "Choose a new password first.");
        return s;
    }

    private static Map<String, Object> body(HttpServletRequest req) throws IOException {
        byte[] b;
        try (InputStream in = req.getInputStream()) { b = in.readNBytes(MAX_BODY + 1); }
        if (b.length > MAX_BODY) throw new AuthException(413, "Request too large");
        return Json.readAction(new String(b, StandardCharsets.UTF_8));
    }

    /**
     * Kannel delivers each SMS to the short code here (sms-service get-url, see deploy/kannel). Only the IPs in
     * sms.mo.allowedIps may call it; Nginx also blocks /api/sms/ from outside.
     */
    private void incomingSms(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String ip = clientIp(req);
        if (!config().sms.moAllowedIps().contains(ip)) {
            log.warn("Refused incoming SMS call from {} (not in sms.mo.allowedIps)", ip);
            resp.setStatus(403);
            return;
        }
        String from = req.getParameter("from"), text = req.getParameter("text");
        if (from == null || text == null) { resp.setStatus(400); resp.getWriter().write("from and text are required"); return; }
        log.info("Incoming SMS from {} via {}", from, ip);
        service().incomingSms(from, text);
        resp.setStatus(200);
        resp.setContentType("text/plain");
    }

    /** A USSD gateway's request (Africa's Talking style). Only the addresses in sms.mo.allowedIps, like incoming SMS. */
    private void ussdGateway(HttpServletRequest req, HttpServletResponse resp, String phone, String text) throws IOException {
        String ip = clientIp(req);
        if (!config().sms.moAllowedIps().contains(ip)) { log.warn("Refused USSD call from {} (not in sms.mo.allowedIps)", ip); resp.setStatus(403); return; }
        if (phone == null) { resp.setStatus(400); resp.getWriter().write("phoneNumber is required"); return; }
        String r = service().ussd(phone, text);
        resp.setStatus(200);
        resp.setContentType("text/plain");
        resp.setCharacterEncoding(StandardCharsets.UTF_8.name());
        resp.getWriter().write(r);
    }

    /** The caller's address; behind Nginx that is X-Real-IP, not Nginx itself. */
    static String clientIp(HttpServletRequest req) {
        String real = req.getHeader("X-Real-IP");
        if (real != null && !real.isBlank()) return real.trim();
        String fwd = req.getHeader("X-Forwarded-For");
        if (fwd != null && !fwd.isBlank()) return fwd.split(",")[0].trim();
        return req.getRemoteAddr();
    }

    private void cors(HttpServletRequest req, HttpServletResponse resp) {
        List<String> allowed = config().allowedOrigins;
        String origin = req.getHeader("Origin");
        if (allowed.contains("*")) resp.setHeader("Access-Control-Allow-Origin", "*");
        else if (origin != null && allowed.contains(origin)) { resp.setHeader("Access-Control-Allow-Origin", origin); resp.setHeader("Vary", "Origin"); }
        resp.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
        resp.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    }

    private static String path(HttpServletRequest req) { String p = req.getPathInfo(); return p == null ? "/" : p; }
    private static String str(Object o) { return o == null ? null : String.valueOf(o); }
    private static int parseInt(String s, int def) { try { return s == null ? def : Integer.parseInt(s); } catch (NumberFormatException e) { return def; } }

    private static void json(HttpServletResponse resp, int status, Object body) throws IOException { raw(resp, status, Json.write(body)); }

    private static void raw(HttpServletResponse resp, int status, String body) throws IOException {
        resp.setStatus(status);
        resp.setContentType("application/json");
        resp.setCharacterEncoding(StandardCharsets.UTF_8.name());
        resp.setHeader("Cache-Control", "no-store");
        resp.getWriter().write(body);
    }
}
