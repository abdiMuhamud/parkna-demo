package com.innovii.parkna.model;

import java.util.ArrayList;
import java.util.List;

/** Prices and rules published by the Council ("T"). Amounts in GMD. */
public class Tariff {
    public int daily;
    public int monthly;
    /** An organisation car for a year, before the organisation's discount. */
    public int annual;
    /** Added to the daily fee when a warning is not paid within 24 hours. */
    public int fine;
    public int grace;
    public int walletLimit;
    public List<Change> log = new ArrayList<>();

    public static class Change {
        public String when;
        public String what;
        public String auth;
        public String by;

        public Change() {}
        public Change(String when, String what, String auth, String by) { this.when = when; this.what = what; this.auth = auth; this.by = by; }
    }
}
