package com.innovii.parkna;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.innovii.parkna.engine.ParkingEngine;
import com.innovii.parkna.json.Json;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.TestFactory;

import java.io.BufferedReader;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.fail;

/**
 * Replays the steps recorded from the original JavaScript engine (scripts/parity/generate.js) and checks that
 * the Java engine gives the same response and the same full state after every step.
 * Run with: mvn test -Dparity.dir=target/parity
 */
class ParityTest {
    private static final ObjectMapper M = new ObjectMapper();

    @TestFactory
    Stream<DynamicTest> sameResultsAsTheJavaScriptEngine() throws IOException {
        String dir = System.getProperty("parity.dir", "");
        Assumptions.assumeFalse(dir.isBlank(), "parity.dir not set: run scripts/parity/generate.js first");
        List<Path> files = new ArrayList<>();
        try (Stream<Path> s = Files.list(Path.of(dir))) { s.filter(p -> p.toString().endsWith(".jsonl")).sorted().forEach(files::add); }
        Assumptions.assumeFalse(files.isEmpty(), "no parity files in " + dir);
        return files.stream().map(f -> DynamicTest.dynamicTest(f.getFileName().toString(), () -> replay(f)));
    }

    @SuppressWarnings("unchecked")
    static void replay(Path file) throws IOException {
        ParkingEngine e = ParkingEngine.seeded();
        try (BufferedReader r = Files.newBufferedReader(file, StandardCharsets.UTF_8)) {
            String line;
            int n = -1;
            while ((line = r.readLine()) != null) {
                if (line.isBlank()) continue;
                n++;
                JsonNode rec = M.readTree(line);
                JsonNode step = rec.get("step");
                String res = null;
                if (step != null && !step.isNull()) {
                    if (step.has("act")) {
                        Map<String, Object> a = M.convertValue(step.get("act"), Map.class);
                        res = Json.write(e.act(new java.util.LinkedHashMap<>(a)));
                        e.bump();
                    } else if (step.has("tick")) {
                        if (e.tickMinute()) e.bump();
                    }
                    e.takeChanges();
                    if (!rec.get("res").isNull()) compare(file, n, step, "response", M.readTree(rec.get("res").asText()), M.readTree(res));
                }
                compare(file, n, step, "state", M.readTree(rec.get("snap").asText()), M.readTree(Json.snapshot(e.state())));
            }
        }
    }

    private static void compare(Path f, int n, JsonNode step, String what, JsonNode js, JsonNode java) {
        List<String> diffs = new ArrayList<>();
        diff("", js, java, diffs);
        for (String key : List.of("PLATES", "ORGA")) {
            if (js.has(key) && java.has(key)) {
                List<String> a = new ArrayList<>(), b = new ArrayList<>();
                js.get(key).fieldNames().forEachRemaining(a::add);
                java.get(key).fieldNames().forEachRemaining(b::add);
                if (!a.equals(b)) diffs.add(key + " order: js=" + a + " java=" + b);
            }
        }
        if (!diffs.isEmpty())
            fail(f.getFileName() + " step " + n + " " + step + ": " + what + " differs:\n  " + String.join("\n  ", diffs.subList(0, Math.min(15, diffs.size()))));
    }

    private static void diff(String path, JsonNode a, JsonNode b, List<String> out) {
        if (out.size() > 20) return;
        if (a.isNumber() && b.isNumber()) { if (a.decimalValue().compareTo(b.decimalValue()) != 0) out.add(path + ": js=" + a + " java=" + b); return; }
        if (a.getNodeType() != b.getNodeType()) { out.add(path + ": js=" + trim(a) + " java=" + trim(b)); return; }
        if (a.isObject()) {
            for (Iterator<String> it = a.fieldNames(); it.hasNext(); ) { String k = it.next(); if (!b.has(k)) out.add(path + "." + k + ": missing in java (js=" + trim(a.get(k)) + ")"); else diff(path + "." + k, a.get(k), b.get(k), out); }
            for (Iterator<String> it = b.fieldNames(); it.hasNext(); ) { String k = it.next(); if (!a.has(k)) out.add(path + "." + k + ": extra in java (" + trim(b.get(k)) + ")"); }
        } else if (a.isArray()) {
            if (a.size() != b.size()) out.add(path + ": length js=" + a.size() + " java=" + b.size());
            for (int i = 0; i < Math.min(a.size(), b.size()); i++) diff(path + "[" + i + "]", a.get(i), b.get(i), out);
        } else if (!a.equals(b)) out.add(path + ": js=" + a + " java=" + b);
    }

    private static String trim(JsonNode n) { String s = String.valueOf(n); return s.length() > 160 ? s.substring(0, 160) + "…" : s; }
}
