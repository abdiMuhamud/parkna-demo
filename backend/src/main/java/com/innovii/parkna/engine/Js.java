package com.innovii.parkna.engine;

import java.text.NumberFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Small helpers that reproduce how the original JavaScript engine treats values, so the Java engine
 * gives the same answers for the same requests (see the parity tests).
 */
public final class Js {
    private Js() {}

    /** JavaScript String(v), with null/missing treated as "". */
    public static String str(Object v) {
        if (v == null) return "";
        if (v instanceof String s) return s;
        if (v instanceof Boolean b) return b.toString();
        if (v instanceof Number n) return numToString(n.doubleValue());
        if (v instanceof List<?> l) {
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < l.size(); i++) { if (i > 0) sb.append(','); sb.append(str(l.get(i))); }
            return sb.toString();
        }
        if (v instanceof Map) return "[object Object]";
        return v.toString();
    }

    /** JavaScript String(v || "") */
    public static String strOr(Object v, String fallback) { return truthy(v) ? str(v) : fallback; }

    public static boolean truthy(Object v) {
        if (v == null) return false;
        if (v instanceof Boolean b) return b;
        if (v instanceof Number n) { double d = n.doubleValue(); return d != 0 && !Double.isNaN(d); }
        if (v instanceof String s) return !s.isEmpty();
        return true;
    }

    private static final Pattern DECIMAL = Pattern.compile("[+-]?(\\d+\\.?\\d*([eE][+-]?\\d+)?|\\.\\d+([eE][+-]?\\d+)?)");

    /** JavaScript Number(v) / unary plus. */
    public static double num(Object v) {
        if (v == null) return 0;                         // +null === 0 (+undefined is NaN, but callers guard that)
        if (v instanceof Number n) return n.doubleValue();
        if (v instanceof Boolean b) return b ? 1 : 0;
        if (v instanceof String s) {
            String t = trim(s);
            if (t.isEmpty()) return 0;
            if (DECIMAL.matcher(t).matches()) return Double.parseDouble(t);
            if (t.matches("0[xX][0-9a-fA-F]+")) return Long.parseLong(t.substring(2), 16);
            if (t.equals("Infinity") || t.equals("+Infinity")) return Double.POSITIVE_INFINITY;
            if (t.equals("-Infinity")) return Double.NEGATIVE_INFINITY;
            return Double.NaN;
        }
        return Double.NaN;
    }

    /** Number(v) where a missing value is NaN, like +undefined. */
    public static double numOrNaN(Object v) { return v == null ? Double.NaN : num(v); }

    /** JavaScript Math.round: halves round towards +infinity. */
    public static long round(double d) { return (long) Math.floor(d + 0.5); }

    public static String numToString(double d) {
        if (d == Math.rint(d) && !Double.isInfinite(d) && Math.abs(d) < 1e21) return Long.toString((long) d);
        if (Double.isNaN(d)) return "NaN";
        if (Double.isInfinite(d)) return d > 0 ? "Infinity" : "-Infinity";
        return Double.toString(d);
    }

    private static final String WS = "[\\t\\n\\u000B\\f\\r \\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF]";
    private static final Pattern TRIM = Pattern.compile("^" + WS + "+|" + WS + "+$");
    public static final Pattern SPACES = Pattern.compile(WS + "+");

    /** JavaScript String.prototype.trim() */
    public static String trim(String s) { return TRIM.matcher(s).replaceAll(""); }

    /** Keep only the digits, like s.replace(/\D/g, "") */
    public static String digits(String s) { return s.replaceAll("[^0-9]", ""); }

    /** s.slice(-n) */
    public static String lastChars(String s, int n) { return s.length() <= n ? s : s.substring(s.length() - n); }

    /** String(n).padStart(2, "0") */
    public static String pad(long n) { return padStart(Long.toString(n), 2); }

    public static String padStart(String s, int len) { StringBuilder b = new StringBuilder(); for (int i = s.length(); i < len; i++) b.append('0'); return b.append(s).toString(); }

    /** Amount in GMD with thousands separators, like Math.round(n).toLocaleString("en-GB"). */
    public static String gmd(double n) { return NumberFormat.getIntegerInstance(Locale.UK).format(round(n)); }
}
