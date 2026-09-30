package com.innovii.parkna.model;

/**
 * A warning an attendant issued to an unpaid car ("FINES"). The daily fee ({@link #base}) is due within 24 hours;
 * after that the {@link #fine} is added. Status: open, paid or cancelled.
 */
public class Fine {
    public String id;
    public String plate;
    /** Day key of the warning, and the minute it was issued. */
    public String day;
    public int t;
    public String road;
    /** The attendant's id. */
    public String off;
    public int base;
    public int fine;
    public String status;
    public Settled settled;
    /** Why it was cancelled. */
    public String note;

    /** How and when a warning was paid. */
    public static class Settled {
        public String day;
        public String t;
        public int amount;
        public boolean late;
        public String method;
        public String ticket;
        public String num;
    }
}
