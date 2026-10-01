package com.innovii.parkna.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.sql.DataSource;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The terms and conditions, published by administrators in the back office (table terms_version). The newest
 * version is in force; the apps show it before sign-in and ask everyone to accept it again after a change. With no
 * version published yet, the built-in first version (resources/terms/terms-v1.md) applies.
 */
public final class TermsService {
    private static final Logger log = LoggerFactory.getLogger(TermsService.class);
    public static final String DEFAULT_TITLE = "SUNU Park terms and conditions";
    private static final int MAX_BODY = 60_000;

    /** One version of the terms. */
    public record Terms(int version, String title, String body, String note, Instant at, String by) {
        public String v() { return Integer.toString(version); }
        public Map<String, Object> toMap(boolean withBody) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("v", v());
            m.put("title", title);
            if (withBody) m.put("body", body);
            if (note != null) m.put("note", note);
            m.put("at", at == null ? null : at.toString());
            m.put("by", by);
            return m;
        }
    }

    private final DataSource ds;
    private volatile Terms current;

    public TermsService(DataSource ds) { this.ds = ds; }

    static Terms builtIn() {
        try (InputStream in = TermsService.class.getResourceAsStream("/terms/terms-v1.md")) {
            String body = in == null ? "" : new String(in.readAllBytes(), StandardCharsets.UTF_8);
            return new Terms(1, DEFAULT_TITLE, body.strip(), null, null, "SUNU Park");
        } catch (IOException e) { throw new IllegalStateException(e); }
    }

    /** The version in force. */
    public Terms current() {
        Terms t = current;
        if (t != null) return t;
        try (Connection c = ds.getConnection();
             PreparedStatement ps = c.prepareStatement("SELECT version, title, body, change_note, published_at, published_by FROM terms_version ORDER BY version DESC LIMIT 1");
             ResultSet rs = ps.executeQuery()) {
            t = rs.next() ? read(rs) : builtIn();
        } catch (SQLException e) {
            log.warn("Could not read the terms from the database: {}", e.getMessage());
            return builtIn();
        }
        current = t;
        return t;
    }

    /** Every published version, newest first, without the text. */
    public List<Map<String, Object>> history() throws SQLException {
        List<Map<String, Object>> out = new ArrayList<>();
        try (Connection c = ds.getConnection();
             PreparedStatement ps = c.prepareStatement("SELECT version, title, body, change_note, published_at, published_by FROM terms_version ORDER BY version DESC LIMIT 50");
             ResultSet rs = ps.executeQuery()) {
            while (rs.next()) out.add(read(rs).toMap(false));
        }
        if (out.isEmpty() || !"1".equals(out.get(out.size() - 1).get("v"))) out.add(builtIn().toMap(false));
        return out;
    }

    /** Publishes a new version. Returns it, or throws IllegalArgumentException with the reason to show. */
    public Terms publish(String title, String body, String note, String by) throws SQLException {
        title = title == null || title.isBlank() ? DEFAULT_TITLE : title.strip();
        body = body == null ? "" : body.replace("\r\n", "\n").strip();
        note = note == null || note.isBlank() ? null : note.strip();
        if (title.length() > 120) throw new IllegalArgumentException("Keep the title to 120 characters.");
        if (body.length() < 50) throw new IllegalArgumentException("Write the terms (at least a few sentences).");
        if (body.length() > MAX_BODY) throw new IllegalArgumentException("The terms are too long (60,000 characters at most).");
        if (note != null && note.length() > 300) throw new IllegalArgumentException("Keep the note on what changed to 300 characters.");
        Terms now = current();
        if (body.equals(now.body()) && title.equals(now.title())) throw new IllegalArgumentException("No change to publish.");
        int v = now.version() + 1;
        try (Connection c = ds.getConnection();
             PreparedStatement ps = c.prepareStatement("INSERT INTO terms_version (version, title, body, change_note, published_at, published_by) VALUES (?, ?, ?, ?, ?, ?)")) {
            Instant at = Instant.now();
            ps.setInt(1, v); ps.setString(2, title); ps.setString(3, body); ps.setString(4, note); ps.setTimestamp(5, Timestamp.from(at)); ps.setString(6, by);
            ps.executeUpdate();
            current = new Terms(v, title, body, note, at, by);
        }
        log.info("Terms and conditions version {} published by {}", v, by);
        return current;
    }

    private static Terms read(ResultSet rs) throws SQLException {
        Timestamp at = rs.getTimestamp(5);
        return new Terms(rs.getInt(1), rs.getString(2), rs.getString(3), rs.getString(4), at == null ? null : at.toInstant(), rs.getString(6));
    }
}
