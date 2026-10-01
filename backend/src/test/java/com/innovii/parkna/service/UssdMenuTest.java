package com.innovii.parkna.service;

import com.innovii.parkna.engine.ParkingEngine;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** The *7275# menu on the demo story: the same rules as the SMS line and the app. */
class UssdMenuTest {
    private final ParkingEngine e = ParkingEngine.seeded();
    private final UssdMenu menu = new UssdMenu(new UssdMenu.Backend() {
        @Override public boolean officer(String num) { return e.isOfficer(num); }
        @Override public String officerId(String num) { return e.state().off.get(num).id; }
        @Override public List<String> plates(String num) { var u = e.state().nums.get(num); return u == null ? List.of() : List.copyOf(u.plates); }
        @Override public List<String> warnedPlates(String num) { List<String> o = new ArrayList<>(); for (String p : plates(num)) if (!e.openWarnings(p).isEmpty()) o.add(p); return o; }
        @Override public Map<String, Object> quote(String num, String plate, String kind) { return e.quoteFor(num, plate, kind); }
        @Override public String describe(String plate) { return plate + ": " + e.stateOf(plate); }
        @Override public Map<String, Object> pay(String num, String plate, String kind, String prov) { return act("type", "driver.pay", "num", num, "plate", plate, "kind", kind, "prov", prov); }
        @Override public String officerLine(String num, String text) { return String.valueOf(act("type", "sms", "num", num, "text", text).get("reply")); }
        @Override public int daily() { return e.state().tariff.daily; }
        @Override public int monthly() { return e.state().tariff.monthly; }
        @Override public boolean payments() { return true; }
    });

    { e.setPaymentsEnabled(true); }

    private Map<String, Object> act(Object... kv) {
        Map<String, Object> a = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) a.put((String) kv[i], kv[i + 1]);
        return e.act(a);
    }

    @Test
    void driverPaysTodayFromTheMenu() {
        assertTrue(menu.handle("7055501", "").startsWith("CON SUNU Park\n1. Daily pass (200 GMD)"));
        assertEquals("CON Daily pass\nChoose a plate:\n1. BJL8080\n0. Another plate", menu.handle("7055501", "1"));
        assertTrue(menu.handle("7055501", "1*1").startsWith("CON Daily pass BJL8080: 200 GMD"));
        assertEquals("END Cancelled. Nothing was charged.", menu.handle("7055501", "1*1*0"));
        String paid = menu.handle("7055501", "1*1*1");
        assertTrue(paid.startsWith("END Paid 200 GMD with Wave. BJL8080 is PAID till 7pm today."), paid);
        assertEquals("DAILY", e.stateOf("BJL8080"));
        assertTrue(menu.handle("7055501", "1*1").startsWith("END BJL8080 is already paid"));
        assertTrue(menu.handle("7055501", "1*0*bjl 6006").startsWith("CON Daily pass BJL6006"));
        assertTrue(menu.handle("7055501", "1*0*hello").startsWith("END That is not a plate number"));
    }

    @Test
    void warningsAreSettledFirstAndAttendantsWorkTheirShift() {
        assertTrue(menu.handle("7300007", "").startsWith("CON SUNU Park · Attendant 07"));
        assertTrue(menu.handle("7300007", "1").startsWith("END SUNU Park: shift started"));
        assertTrue(menu.handle("7300007", "3*BJL2211").contains("WARNING W-00001"), "warning by USSD");
        assertTrue(menu.handle("3034567", "").contains("You have an unpaid warning"));
        String other = menu.handle("3034567", "2*1");
        assertTrue(other.startsWith("END Pay the unpaid warning on BJL2211 first"), other);
        assertTrue(menu.handle("3034567", "4").startsWith("CON Pay a warning\nChoose a plate:\n1. BJL2211"));
        assertTrue(menu.handle("3034567", "4*1").startsWith("CON Warning W-00001 on BJL2211: 200 GMD"));
        assertTrue(menu.handle("3034567", "4*1*1").contains("is clear of its warning"));
        assertTrue(menu.handle("3034567", "6").contains("sunupark.gm/terms"));
        assertTrue(menu.handle("3034567", "9").startsWith("END That is not on the menu"));
    }
}
