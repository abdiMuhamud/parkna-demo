package com.innovii.parkna.service;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

/**
 * The USSD menu (*7275#), in the usual gateway convention: every request carries the whole session so far as
 * {@code text} ("" first, then "1", "1*2", "1*2*BJL1234"...), and the answer starts with "CON " (show and wait for
 * a reply) or "END " (show and close). Drivers pay, check plates and pay warnings; attendants start and end their
 * shift, check plates and issue warnings. The same rules as the app and the SMS line: everything goes through the
 * engine, payments send their SMS receipt, and an unpaid warning is settled first.
 */
final class UssdMenu {
    static final List<String> PROVIDERS = List.of("Wave", "Afrimoney", "APS", "QMoney");

    /** What the menu needs from the service (each call takes the service's lock). */
    interface Backend {
        boolean officer(String num);
        String officerId(String num);
        List<String> plates(String num);
        List<String> warnedPlates(String num);
        Map<String, Object> quote(String num, String plate, String kind);
        String describe(String plate);
        Map<String, Object> pay(String num, String plate, String kind, String prov);
        String officerLine(String num, String text);
        int daily();
        int monthly();
        boolean payments();
    }

    private final Backend b;

    UssdMenu(Backend b) { this.b = b; }

    String handle(String num, String text) {
        String t = text == null ? "" : text.trim();
        List<String> p = t.isEmpty() ? List.of() : Arrays.stream(t.split("\\*", -1)).map(String::trim).toList();
        return b.officer(num) ? officer(num, p) : driver(num, p);
    }

    // ------------------------------------------------------------------ drivers

    private String driver(String num, List<String> p) {
        if (p.isEmpty()) {
            boolean warned = !b.warnedPlates(num).isEmpty();
            return con("SUNU Park" + (warned ? "\nYou have an unpaid warning: pay it first (4)." : "")
                    + "\n1. Daily pass (" + gmd(b.daily()) + " GMD)\n2. Monthly pass (" + gmd(b.monthly()) + " GMD)\n3. Check a plate\n4. Pay a warning\n5. My plates\n6. Terms & conditions");
        }
        return switch (p.get(0)) {
            case "1" -> buy(num, p, "daily");
            case "2" -> buy(num, p, "monthly");
            case "3" -> check(num, p);
            case "4" -> buy(num, p, "fine");
            case "5" -> myPlates(num);
            case "6" -> end("SUNU Park terms and conditions: sunupark.gm/terms (also in the app and at the Council office). Daily "
                    + gmd(b.daily()) + " GMD, monthly " + gmd(b.monthly()) + " GMD; hourly parking is not offered yet. Using SUNU Park means you accept them.");
            default -> end("That is not on the menu. Dial the code again to start over.");
        };
    }

    /** The plate step: a numbered list of the phone's plates (0 for another plate), or typing one. Returns {plate, next index} or a screen. */
    private Object[] plate(List<String> p, List<String> list, String title) {
        if (p.size() == 1) {
            if (list.isEmpty()) return new Object[]{con(title + "\nEnter the plate number, e.g. BJL1234:")};
            StringBuilder s = new StringBuilder(title).append("\nChoose a plate:");
            for (int i = 0; i < list.size() && i < 6; i++) s.append('\n').append(i + 1).append(". ").append(list.get(i));
            return new Object[]{con(s.append("\n0. Another plate").toString())};
        }
        String sel = p.get(1);
        if (!list.isEmpty() && sel.equals("0")) {
            if (p.size() == 2) return new Object[]{con("Enter the plate number, e.g. BJL1234:")};
            return check(p.get(2), 3);
        }
        if (!list.isEmpty() && sel.matches("\\d")) {
            int i = Integer.parseInt(sel) - 1;
            if (i < 0 || i >= Math.min(6, list.size())) return new Object[]{end("That is not on the list. Dial the code again to start over.")};
            return new Object[]{null, list.get(i), 2};
        }
        return check(sel, 2);
    }

    private static Object[] check(String typed, int next) {
        String plate = typed.replaceAll("[\\s-]", "").toUpperCase(java.util.Locale.ROOT);
        if (!plate.matches("^[A-Z]{2,4}\\d{1,4}[A-Z]?$")) return new Object[]{end("That is not a plate number. Enter it like BJL1234.")};
        return new Object[]{null, plate, next};
    }

    private String buy(String num, List<String> p, String kind) {
        boolean fine = kind.equals("fine");
        List<String> list = fine ? b.warnedPlates(num) : b.plates(num);
        if (fine && list.isEmpty() && p.size() == 1) return end("You have no unpaid warning on your plates. To pay one for another plate, text the plate to the short code.");
        Object[] r = plate(p, list, fine ? "Pay a warning" : kind.equals("monthly") ? "Monthly pass" : "Daily pass");
        if (r[0] != null) return (String) r[0];
        String plate = (String) r[1];
        int at = (Integer) r[2];
        Map<String, Object> q = b.quote(num, plate, fine ? "daily" : kind);
        if (q.get("err") != null) return end(String.valueOf(q.get("err")));
        String qk = String.valueOf(q.get("kind"));
        if (fine && !qk.equals("fine")) return end(plate + " has no unpaid warning.");
        int amount = ((Number) q.get("amount")).intValue();
        String offer = qk.equals("fine")
                ? "Warning " + String.join(", ", ids(q)) + " on " + plate + ": " + gmd(amount) + " GMD" + (Boolean.TRUE.equals(q.get("late")) ? " (with the fine)" : "") + ". It is paid before any new pass."
                : qk.equals("monthly") ? "Monthly pass " + plate + ": " + gmd(amount) + " GMD, valid to " + com.innovii.parkna.engine.Cal.fmtD((java.time.LocalDate) q.get("to")) + "."
                : "Daily pass " + plate + ": " + gmd(amount) + " GMD, valid till 7pm today.";
        if (!b.payments()) return end(offer + " Paying by mobile money opens soon. We will send you an SMS when it does." + (qk.equals("fine") ? " Warnings can also be paid at the Council office." : ""));
        if (p.size() == at) return con(offer + "\nPay with:\n1. Wave\n2. Afrimoney\n3. APS\n4. QMoney\n0. Cancel");
        String c = p.get(at);
        if (c.equals("0")) return end("Cancelled. Nothing was charged.");
        if (!c.matches("[1-4]")) return end("Choose 1 to 4. Nothing was charged. Dial the code again to start over.");
        Map<String, Object> res = b.pay(num, plate, fine ? "daily" : kind, PROVIDERS.get(Integer.parseInt(c) - 1));
        if (res.get("err") != null) return end(String.valueOf(res.get("err")));
        return end("Paid " + gmd(((Number) res.get("amount")).intValue()) + " GMD with " + res.get("prov") + ". " + plate
                + (qk.equals("fine") ? " is clear of its warning." : qk.equals("monthly") ? " has a monthly pass." : " is PAID till 7pm today.")
                + " Ticket " + res.get("ticket") + ". Your receipt is on its way by SMS.");
    }

    @SuppressWarnings("unchecked")
    private static List<String> ids(Map<String, Object> q) { Object o = q.get("ids"); return o instanceof List ? (List<String>) o : List.of(); }

    private String check(String num, List<String> p) {
        Object[] r = plate(p, b.plates(num), "Check a plate");
        if (r[0] != null) return (String) r[0];
        return end(b.describe((String) r[1]));
    }

    private String myPlates(String num) {
        List<String> list = b.plates(num);
        if (list.isEmpty()) return end("No plates on this number yet. Pay for a plate once (1) and it is added.");
        StringBuilder s = new StringBuilder("Your plates:");
        for (String x : list) s.append('\n').append(b.describe(x));
        return end(s.toString());
    }

    // ------------------------------------------------------------------ attendants

    private String officer(String num, List<String> p) {
        if (p.isEmpty()) return con("SUNU Park · Attendant " + b.officerId(num) + "\n1. Start shift\n2. Check a plate\n3. Issue a warning\n4. End shift");
        return switch (p.get(0)) {
            case "1" -> end(b.officerLine(num, "START"));
            case "4" -> end(b.officerLine(num, "END"));
            case "2", "3" -> {
                if (p.size() == 1) yield con(p.get(0).equals("2") ? "Check a plate\nEnter the plate number:" : "Issue a warning\nEnter the plate number:");
                Object[] r = check(p.get(1), 2);
                if (r[0] != null) yield (String) r[0];
                yield end(b.officerLine(num, (p.get(0).equals("3") ? "W " : "") + r[1]));
            }
            default -> end("That is not on the menu. Dial the code again to start over.");
        };
    }

    private static String con(String s) { return "CON " + s; }
    private static String end(String s) { return "END " + s; }
    private static String gmd(int n) { return String.format(java.util.Locale.UK, "%,d", n); }
}
