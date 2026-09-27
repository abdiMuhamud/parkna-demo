package com.innovii.parkna.web;

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
 * The API the apps and portals use (unchanged from v0.1, so they need no changes):
 * <pre>
 *   GET  /api/ping       is this a ParkNa server?
 *   GET  /api/state      the whole state
 *   GET  /api/events     live updates (Server-Sent Events)
 *   POST /api/act        one action, e.g. {"type": "driver.pay", ...}
 *   GET  /api/health     200 when the server and MariaDB are up, 503 if not (for monitoring)
 *   GET  /api/sms/mo     incoming SMS from Kannel (?from=%p&amp;text=%a), allowed IPs only
 * </pre>
 * Behind Nginx these are https://your-domain/api/...; Tomcat serves them at /parkna/api/...
 */
@WebServlet(urlPatterns = "/api/*", asyncSupported = true, loadOnStartup = 1)
public class ApiServlet extends HttpServlet {
    private static final Logger log = LoggerFactory.getLogger(ApiServlet.class);
    private static final int MAX_BODY = 1_000_000;

    private ParknaService service() { return (ParknaService) getServletContext().getAttribute(AppListener.SERVICE); }
    private AppConfig config() { return (AppConfig) getServletContext().getAttribute(AppListener.CONFIG); }
    private EventHub hub() { return (EventHub) getServletContext().getAttribute(AppListener.EVENTS); }

    @Override protected void doOptions(HttpServletRequest req, HttpServletResponse resp) {
        cors(req, resp);
        resp.setStatus(204);
    }

    @Override protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        cors(req, resp);
        String p = path(req);
        switch (p) {
            case "/ping" -> {
                Map<String, Object> r = new LinkedHashMap<>();
                r.put("ok", true);
                r.put("name", "ParkNa server");
                r.put("version", AppListener.VERSION);
                r.put("addresses", config().publicUrl.isEmpty() ? List.of() : List.of(config().publicUrl));
                json(resp, 200, Json.write(r));
            }
            case "/state" -> json(resp, 200, service().snapshot());
            case "/events" -> hub().open(req, resp, service().snapshot());
            case "/health" -> {
                boolean db = service().databaseUp();
                Map<String, Object> r = new LinkedHashMap<>();
                r.put("ok", db);
                r.put("database", db ? "up" : "down");
                r.put("liveConnections", hub().count());
                r.put("version", AppListener.VERSION);
                json(resp, db ? 200 : 503, Json.write(r));
            }
            case "/sms/mo" -> incomingSms(req, resp);
            default -> json(resp, 404, "{\"err\":\"Unknown endpoint\"}");
        }
    }

    @Override protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        cors(req, resp);
        String p = path(req);
        if (p.equals("/sms/mo")) { incomingSms(req, resp); return; }
        if (!p.equals("/act")) { json(resp, 404, "{\"err\":\"Unknown endpoint\"}"); return; }
        byte[] body;
        try (InputStream in = req.getInputStream()) { body = in.readNBytes(MAX_BODY + 1); }
        if (body.length > MAX_BODY) { json(resp, 413, "{\"err\":\"Request too large\"}"); return; }
        Map<String, Object> action;
        try { action = Json.readAction(new String(body, StandardCharsets.UTF_8)); }
        catch (IllegalArgumentException e) { json(resp, 400, "{\"err\":\"Bad JSON\"}"); return; }
        json(resp, 200, Json.write(service().act(action)));
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

    /** The caller's address; behind Nginx that is X-Real-IP, not Nginx itself. */
    private static String clientIp(HttpServletRequest req) {
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
        resp.setHeader("Access-Control-Allow-Headers", "Content-Type");
    }

    private static String path(HttpServletRequest req) { String p = req.getPathInfo(); return p == null ? "/" : p; }

    private static void json(HttpServletResponse resp, int status, String body) throws IOException {
        resp.setStatus(status);
        resp.setContentType("application/json");
        resp.setCharacterEncoding(StandardCharsets.UTF_8.name());
        resp.setHeader("Cache-Control", "no-store");
        resp.getWriter().write(body);
    }
}
