package com.innovii.parkna.engine;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;

/** Date helpers with the same results as the JavaScript engine (including its day keys). */
public final class Cal {
    private Cal() {}

    public static final String[] MON = {"Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"};
    public static final String[] MONL = {"January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"};
    public static final String[] DOW = {"Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"};

    /** JavaScript new Date(y, m0, d) with its overflow rules (m0 is 0-based, d may be 0 or past the month end). */
    public static LocalDate date(int y, int m0, int d) { return LocalDate.of(y, 1, 1).plusMonths(m0).plusDays(d - 1L); }

    /** Day key used throughout the state: year-(0-based month)-day, e.g. 2 Nov 2026 is "2026-10-2". */
    public static String dkey(LocalDate d) { return d.getYear() + "-" + (d.getMonthValue() - 1) + "-" + d.getDayOfMonth(); }

    public static LocalDate fromDkey(String k) {
        String[] p = k.split("-");
        return date(Integer.parseInt(p[0]), Integer.parseInt(p[1]), Integer.parseInt(p[2]));
    }

    public static LocalDate addDays(LocalDate d, int n) { return d.plusDays(n); }

    /** new Date(y, m+1, d): 31 Jan + 1 month is 3 March, as in JavaScript. */
    public static LocalDate addMonth(LocalDate d) { return date(d.getYear(), d.getMonthValue(), d.getDayOfMonth()); }

    public static long daysBetween(LocalDate a, LocalDate b) { return ChronoUnit.DAYS.between(a, b); }

    /** Days in the month. */
    public static int dim(LocalDate d) { return d.lengthOfMonth(); }

    public static String fmtD(LocalDate d) { return d.getDayOfMonth() + " " + MON[d.getMonthValue() - 1]; }

    /** 0 = Sunday, as Date.getDay(). */
    public static int dow(LocalDate d) { return d.getDayOfWeek().getValue() % 7; }

    public static String hm(int m) { return Js.pad(Math.floorDiv(m, 60) % 24) + ":" + Js.pad(m % 60); }
}
