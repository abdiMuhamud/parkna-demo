package com.innovii.parkna.json;

import com.fasterxml.jackson.annotation.JsonAutoDetect;
import com.fasterxml.jackson.annotation.PropertyAccessor;
import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonSerializer;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializerProvider;
import com.fasterxml.jackson.databind.module.SimpleModule;
import com.innovii.parkna.model.State;

import java.io.IOException;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * JSON as the apps and portals read it: calendar dates travel as {"$d": "2026-11-2"} (1-based month,
 * no padding) and whole numbers are written without a decimal point.
 */
public final class Json {
    private Json() {}

    public static final ObjectMapper MAPPER = build();

    private static ObjectMapper build() {
        ObjectMapper m = new ObjectMapper();
        m.setVisibility(PropertyAccessor.ALL, JsonAutoDetect.Visibility.NONE);
        m.setVisibility(PropertyAccessor.FIELD, JsonAutoDetect.Visibility.PUBLIC_ONLY);
        SimpleModule mod = new SimpleModule("parkna");
        mod.addSerializer(LocalDate.class, new JsonSerializer<>() {
            @Override public void serialize(LocalDate d, JsonGenerator g, SerializerProvider p) throws IOException {
                g.writeStartObject();
                g.writeStringField("$d", d.getYear() + "-" + d.getMonthValue() + "-" + d.getDayOfMonth());
                g.writeEndObject();
            }
        });
        JsonSerializer<Double> dbl = new JsonSerializer<>() {
            @Override public void serialize(Double d, JsonGenerator g, SerializerProvider p) throws IOException {
                if (d == Math.rint(d) && Math.abs(d) < 9e15) g.writeNumber(d.longValue()); else g.writeNumber(d);
            }
        };
        mod.addSerializer(Double.class, dbl);
        mod.addSerializer(double.class, dbl);
        m.registerModule(mod);
        return m;
    }

    public static String write(Object o) {
        try { return MAPPER.writeValueAsString(o); }
        catch (JsonProcessingException e) { throw new IllegalStateException("Could not write JSON", e); }
    }

    /** An action posted by a screen. Throws IllegalArgumentException for anything that is not a JSON object. */
    public static Map<String, Object> readAction(String body) {
        try {
            Object v = MAPPER.readValue(body == null || body.isBlank() ? "{}" : body, Object.class);
            if (!(v instanceof Map)) throw new IllegalArgumentException("Bad JSON");
            return MAPPER.convertValue(v, new TypeReference<LinkedHashMap<String, Object>>() {});
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("Bad JSON", e);
        }
    }

    /** The whole state as the screens receive it (the newest 150 ledger lines and 80 SMS). */
    public static String snapshot(State s) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("v", s.ver);
        m.put("B", s.clock);
        m.put("PLATES", s.plates);
        m.put("NUMS", s.nums);
        m.put("LOG", s.log.subList(0, Math.min(State.LOG_SNAPSHOT, s.log.size())));
        m.put("OUT", s.out.subList(0, Math.min(State.OUT_SNAPSHOT, s.out.size())));
        m.put("CHECKS", s.checks);
        m.put("OFF", s.off);
        m.put("ORGA", s.orga);
        m.put("PARK", s.park);
        m.put("EXC", s.exc);
        m.put("ANN", s.ann);
        m.put("T", s.tariff);
        m.put("seq", s.seq);
        return write(m);
    }
}
