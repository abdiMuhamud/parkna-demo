package com.innovii.parkna.web;

import com.innovii.parkna.auth.AuthService;
import com.innovii.parkna.auth.Session;
import com.innovii.parkna.service.ParknaService;
import jakarta.servlet.AsyncContext;
import jakarta.servlet.AsyncEvent;
import jakarta.servlet.AsyncListener;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.function.Function;

/**
 * Live updates for every open app and portal (GET /api/events?ticket=..., Server-Sent Events). After each change
 * every screen receives its own person's view of the state. One thread does all the writing, so messages go out
 * in order. Screens whose session was signed out or expired are disconnected.
 */
final class EventHub implements ParknaService.Listener, AutoCloseable {
    private static final Logger log = LoggerFactory.getLogger(EventHub.class);

    private final Map<AsyncContext, Session> clients = new ConcurrentHashMap<>();
    private final ScheduledExecutorService writer = Executors.newSingleThreadScheduledExecutor(r -> { Thread t = new Thread(r, "parkna-events"); t.setDaemon(true); return t; });

    EventHub(AuthService auth) {
        writer.scheduleAtFixedRate(() -> sendAll(": keep-alive\n\n"), 20, 20, TimeUnit.SECONDS);
        writer.scheduleAtFixedRate(() -> {
            for (Map.Entry<AsyncContext, Session> c : clients.entrySet())
                if (!auth.stillValid(c.getValue())) { write(c.getKey(), "event: signout\ndata: {}\n\n"); close(c.getKey()); }
        }, 60, 60, TimeUnit.SECONDS);
    }

    void open(HttpServletRequest req, HttpServletResponse resp, Session s, String firstView) {
        resp.setStatus(200);
        resp.setContentType("text/event-stream");
        resp.setCharacterEncoding(StandardCharsets.UTF_8.name());
        resp.setHeader("Cache-Control", "no-store");
        resp.setHeader("X-Accel-Buffering", "no");   // tells Nginx not to buffer this response
        AsyncContext ac = req.startAsync();
        ac.setTimeout(0);
        ac.addListener(new AsyncListener() {
            @Override public void onComplete(AsyncEvent e) { clients.remove(ac); }
            @Override public void onTimeout(AsyncEvent e) { clients.remove(ac); }
            @Override public void onError(AsyncEvent e) { clients.remove(ac); }
            @Override public void onStartAsync(AsyncEvent e) {}
        });
        // registered first, so a change made while the first view is on its way is sent right after it
        clients.put(ac, s);
        writer.execute(() -> { if (!write(ac, "retry: 3000\n\nevent: state\ndata: " + firstView + "\n\n")) clients.remove(ac); });
    }

    /** A change: build each screen's view now (the caller holds the service lock), then send them in order. */
    @Override public void changed(Function<Session, String> viewFor) {
        Map<String, String> cache = new HashMap<>();
        Map<AsyncContext, String> out = new HashMap<>();
        for (Map.Entry<AsyncContext, Session> c : clients.entrySet()) {
            Session s = c.getValue();
            String key = s.staff() ? "staff:" + s.subject() + ":" + s.role() + ":" + s.mustChangePassword() : s.role() + ":" + s.subject() + ":" + s.orgId();
            out.put(c.getKey(), cache.computeIfAbsent(key, k -> viewFor.apply(s)));
        }
        writer.execute(() -> out.forEach((ac, view) -> { if (clients.containsKey(ac) && !write(ac, "event: state\ndata: " + view + "\n\n")) clients.remove(ac); }));
    }

    int count() { return clients.size(); }

    private void sendAll(String chunk) { for (AsyncContext ac : clients.keySet()) if (!write(ac, chunk)) clients.remove(ac); }

    private boolean write(AsyncContext ac, String chunk) {
        try {
            PrintWriter w = ac.getResponse().getWriter();
            w.write(chunk);
            w.flush();
            if (w.checkError()) throw new IOException("client gone");
            ac.getResponse().flushBuffer();
            return true;
        } catch (IOException | IllegalStateException e) {
            close(ac);
            return false;
        }
    }

    private void close(AsyncContext ac) {
        clients.remove(ac);
        try { ac.complete(); } catch (IllegalStateException ignored) {}
    }

    @Override public void close() {
        writer.shutdownNow();
        for (AsyncContext ac : clients.keySet()) { try { ac.complete(); } catch (IllegalStateException ignored) {} }
        clients.clear();
        log.info("Closed live-update connections");
    }
}
