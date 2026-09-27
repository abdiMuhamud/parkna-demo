package com.innovii.parkna;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.innovii.parkna.db.Migrator;
import com.innovii.parkna.db.StateRepository;
import com.innovii.parkna.engine.ParkingEngine;
import com.innovii.parkna.json.Json;
import com.innovii.parkna.model.State;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.mariadb.jdbc.MariaDbDataSource;

import java.io.BufferedReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * Saves every step to MariaDB and, every 25 steps, restarts from what is in the database. The results must still
 * match the JavaScript engine's (so nothing an action changes is left unsaved).
 * Run with: mvn test -Dparity.dir=target/parity -Dtest.db.url=jdbc:mariadb://127.0.0.1:3306/parkna_test -Dtest.db.password=...
 */
class DatabaseRoundTripTest {
    private static final ObjectMapper M = new ObjectMapper();
    private static final int RESTART_EVERY = 25;

    private static MariaDbDataSource dataSource() throws SQLException {
        String url = System.getProperty("test.db.url", "");
        Assumptions.assumeFalse(url.isBlank(), "test.db.url not set");
        MariaDbDataSource ds = new MariaDbDataSource(url);
        ds.setUser(System.getProperty("test.db.username", "parkna_test"));
        ds.setPassword(System.getProperty("test.db.password", ""));
        return ds;
    }

    private static void emptyDatabase(MariaDbDataSource ds) throws SQLException {
        try (Connection c = ds.getConnection(); Statement st = c.createStatement()) {
            List<String> tables = new ArrayList<>();
            try (ResultSet rs = st.executeQuery("SHOW TABLES")) { while (rs.next()) tables.add(rs.getString(1)); }
            for (String t : tables) st.execute("DROP TABLE `" + t + "`");
        }
    }

    @Test
    void migrationsCreateTheSchemaAndAreRepeatable() throws Exception {
        MariaDbDataSource ds = dataSource();
        emptyDatabase(ds);
        Migrator.migrate(ds);
        Migrator.migrate(ds);
        try (Connection c = ds.getConnection()) { assertNull(new StateRepository().load(c)); }
    }

    @Test
    void seededStateSurvivesARestart() throws Exception {
        MariaDbDataSource ds = dataSource();
        emptyDatabase(ds);
        Migrator.migrate(ds);
        ParkingEngine e = ParkingEngine.seeded();
        StateRepository repo = new StateRepository();
        try (Connection c = ds.getConnection()) {
            c.setAutoCommit(false);
            repo.save(c, e.state(), e.takeChanges());
            c.commit();
            State loaded = repo.load(c);
            assertNotNull(loaded);
            assertEquals(Json.snapshot(e.state()), Json.snapshot(loaded));
        }
    }

    @Test
    void recordedRunsGiveTheSameResultsWithRestartsFromTheDatabase() throws Exception {
        String dir = System.getProperty("parity.dir", "");
        Assumptions.assumeFalse(dir.isBlank(), "parity.dir not set");
        MariaDbDataSource ds = dataSource();
        for (String name : List.of("story.jsonl", "random-1.jsonl", "random-2.jsonl")) {
            Path f = Path.of(dir, name);
            if (!Files.exists(f)) continue;
            emptyDatabase(ds);
            Migrator.migrate(ds);
            replayWithRestarts(ds, f);
        }
    }

    @SuppressWarnings("unchecked")
    private static void replayWithRestarts(MariaDbDataSource ds, Path file) throws Exception {
        StateRepository repo = new StateRepository();
        try (Connection c = ds.getConnection(); BufferedReader r = Files.newBufferedReader(file, StandardCharsets.UTF_8)) {
            c.setAutoCommit(false);
            ParkingEngine e = ParkingEngine.seeded();
            repo.save(c, e.state(), e.takeChanges());
            c.commit();
            String line;
            int n = -1, restarts = 0;
            while ((line = r.readLine()) != null) {
                if (line.isBlank()) continue;
                n++;
                JsonNode rec = M.readTree(line);
                JsonNode step = rec.get("step");
                if (step == null || step.isNull()) continue;
                if (step.has("act")) {
                    Map<String, Object> a = M.convertValue(step.get("act"), Map.class);
                    String res = Json.write(e.act(new LinkedHashMap<>(a)));
                    e.bump();
                    assertEquals(M.readTree(rec.get("res").asText()), M.readTree(res), file.getFileName() + " step " + n + " response");
                } else if (step.has("tick")) {
                    if (e.tickMinute()) e.bump();
                }
                repo.save(c, e.state(), e.takeChanges());
                c.commit();
                if (n % RESTART_EVERY == 0) {
                    String before = Json.snapshot(e.state());
                    State loaded = repo.load(c);
                    String after = Json.snapshot(loaded);
                    if (!before.equals(after)) assertEquals(M.readTree(before), M.readTree(after), file.getFileName() + " step " + n + ": state read back from MariaDB differs");
                    assertEquals(before, after, file.getFileName() + " step " + n + ": key order differs after reload");
                    e = new ParkingEngine(loaded);
                    restarts++;
                }
                JsonNode expected = M.readTree(rec.get("snap").asText());
                assertEquals(expected, M.readTree(Json.snapshot(e.state())), file.getFileName() + " step " + n + " state");
            }
            System.out.println(file.getFileName() + ": " + n + " steps, " + restarts + " restarts from MariaDB");
        }
    }
}
