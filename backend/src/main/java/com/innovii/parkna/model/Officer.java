package com.innovii.parkna.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

/** A parking attendant ("OFF", keyed by registered phone number). */
public class Officer {
    public boolean active;
    public boolean on;
    public Integer start;
    public ShiftStats stats;
    public Reassignment re;
    public Integer last;
    public ShiftSummary summary;
    @JsonProperty("super") public String supervisor;
    public String id;
    public String name;
    public String num;
    public String road;
    public String shift;
    public String staff;
    /** Simulated background activity for attendants that are not driven by a phone in the demo. */
    @JsonInclude(JsonInclude.Include.NON_NULL) public Background bg;
    @JsonInclude(JsonInclude.Include.NON_NULL) public Boolean isNew;
    @JsonInclude(JsonInclude.Include.NON_NULL) public String day;
    @JsonInclude(JsonInclude.Include.NON_NULL) public String lastDay;

    public static class ShiftStats {
        public int checked, paid, unpaid;
    }

    public static class Reassignment {
        public String road;
        public int from;
        public String day;
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class ShiftSummary {
        @JsonInclude(JsonInclude.Include.ALWAYS) public int end;
        public String day;
        public Integer checked, paid, unpaid;
        public String road;
        public Boolean auto;
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class Background {
        @JsonInclude(JsonInclude.Include.ALWAYS) public double rate;
        @JsonInclude(JsonInclude.Include.ALWAYS) public double unp;
        public Integer stop;

        public Background() {}
        public Background(double rate, double unp, Integer stop) { this.rate = rate; this.unp = unp; this.stop = stop; }
    }
}
