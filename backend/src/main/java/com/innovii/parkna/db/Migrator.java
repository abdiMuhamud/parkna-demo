package com.innovii.parkna.db;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.sql.DataSource;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Applies the SQL files in db/migration (listed in index.txt, named V&lt;n&gt;__description.sql) that the database
 * has not had yet, and records each one in schema_version. The same files can be run by hand with the mysql client.
 */
public final class Migrator {
    private static final Logger log = LoggerFactory.getLogger(Migrator.class);

    private Migrator() {}

    public static void migrate(DataSource ds) throws SQLException {
        try (Connection c = ds.getConnection(); Statement st = c.createStatement()) {
            st.execute("CREATE TABLE IF NOT EXISTS schema_version (version INT NOT NULL PRIMARY KEY, description VARCHAR(200) NOT NULL, "
                    + "applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
            int current = 0;
            try (ResultSet rs = st.executeQuery("SELECT COALESCE(MAX(version), 0) FROM schema_version")) { if (rs.next()) current = rs.getInt(1); }
            for (String file : resource("index.txt").lines().map(String::trim).filter(s -> !s.isEmpty()).collect(Collectors.toList())) {
                int v = Integer.parseInt(file.substring(1, file.indexOf("__")));
                if (v <= current) continue;
                String desc = file.substring(file.indexOf("__") + 2, file.lastIndexOf('.')).replace('_', ' ');
                log.info("Applying database migration V{}: {}", v, desc);
                for (String sql : statements(resource(file))) st.execute(sql);
                try (PreparedStatement ps = c.prepareStatement("INSERT INTO schema_version (version, description) VALUES (?, ?)")) {
                    ps.setInt(1, v); ps.setString(2, desc); ps.executeUpdate();
                }
                current = v;
            }
            log.info("Database schema is at version {}", current);
        }
    }

    private static String resource(String name) {
        try (InputStream in = Migrator.class.getResourceAsStream("/db/migration/" + name)) {
            if (in == null) throw new IllegalStateException("Missing db/migration/" + name + " in the WAR");
            try (BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) { return r.lines().collect(Collectors.joining("\n")); }
        } catch (IOException e) { throw new IllegalStateException(e); }
    }

    /** Splits a file into statements on ';' at the end of a line; lines starting with -- are comments. */
    static List<String> statements(String sql) {
        List<String> out = new ArrayList<>();
        StringBuilder cur = new StringBuilder();
        for (String line : sql.split("\n")) {
            if (line.trim().startsWith("--")) continue;
            cur.append(line).append('\n');
            if (line.trim().endsWith(";")) {
                String s = cur.toString().trim();
                out.add(s.substring(0, s.length() - 1));
                cur.setLength(0);
            }
        }
        if (!cur.toString().isBlank()) out.add(cur.toString().trim());
        return out;
    }
}
