package com.innovii.parkna.web;

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
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

/**
 * Live updates for every open app and portal (GET /api/events, Server-Sent Events). Each change sends the whole
 * state as an "event: state". One thread does all the writing, so messages go out in order.
 */
final class EventHub implements Consumer<String>, AutoCloseable {
    private static final Logger log = LoggerFactory.getLogger(EventHub.class);

    private final Set<AsyncContext> clients = ConcurrentHashMap.newKeySet();
    private final ScheduledExecutorService writer = Executors.newSingleThreadScheduledExecutor(r -> { Thread t = new Thread(r, "parkna-events"); t.setDaemon(true); return t; });

    EventHub() {
        writer.scheduleAtFixedRate(() -> sendAll(": keep-alive\n\n"), 20, 20, TimeUnit.SECONDS);
    }

    void open(HttpServletRequest req, HttpServletResponse resp, String firstState) {
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
        writer.execute(() -> {
            if (write(ac, "retry: 2000\n\nevent: state\ndata: " + firstState + "\n\n")) clients.add(ac);
        });
    }

    /** A new state for everyone. */
    @Override public void accept(String state) { writer.execute(() -> sendAll("event: state\ndata: " + state + "\n\n")); }

    int count() { return clients.size(); }

    private void sendAll(String chunk) { for (AsyncContext ac : clients) if (!write(ac, chunk)) clients.remove(ac); }

    private boolean write(AsyncContext ac, String chunk) {
        try {
            PrintWriter w = ac.getResponse().getWriter();
            w.write(chunk);
            w.flush();
            if (w.checkError()) throw new IOException("client gone");
            ac.getResponse().flushBuffer();
            return true;
        } catch (IOException | IllegalStateException e) {
            try { ac.complete(); } catch (IllegalStateException ignored) {}
            return false;
        }
    }

    @Override public void close() {
        writer.shutdownNow();
        for (AsyncContext ac : clients) { try { ac.complete(); } catch (IllegalStateException ignored) {} }
        clients.clear();
        log.info("Closed live-update connections");
    }
}
