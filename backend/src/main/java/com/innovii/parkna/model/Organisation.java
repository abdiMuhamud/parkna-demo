package com.innovii.parkna.model;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/** A business with a fleet agreement ("ORGA", keyed by id such as ORG-014). */
public class Organisation {
    public String id;
    public String name;
    public Contact contact;
    public double disc;
    public double agreed;
    public String status;
    public LocalDate created;
    /** The paid year: every covered car ends on {@link #coverTo}. Null until the first invoice is paid. */
    public LocalDate coverFrom;
    public LocalDate coverTo;
    public List<FleetPlate> plates = new ArrayList<>();
    public List<Topup> topups = new ArrayList<>();
    public List<Invoice> invoices = new ArrayList<>();
    @JsonInclude(JsonInclude.Include.NON_NULL) public Integer graceDay;

    public static class Contact {
        public String name;
        public String num;

        public Contact() {}
        public Contact(String name, String num) { this.name = name; this.num = num; }
    }

    public static class FleetPlate {
        public String plate;
        public String dept;
        public String driver;
        /** The day its invoice was paid; null while the car waits on an unpaid invoice. */
        public LocalDate from;
        public LocalDate to;
    }

    /** Kept for old data; cars are now invoiced when they are added. */
    public static class Topup {
        public String t;
        public int a;

        public Topup() {}
        public Topup(String t, int a) { this.t = t; this.a = a; }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class Invoice {
        public String no;
        /** annual (opening year, starts on payment), addon (cars added later, to the end of the year) or renewal. */
        public String kind;
        /** The period, e.g. "1 Oct 2026 – 30 Sep 2027". */
        public String month;
        public LocalDate issued;
        public LocalDate due;
        public LocalDate end;
        /** The cars this invoice pays for. */
        public List<String> plates = new ArrayList<>();
        public List<Line> lines = new ArrayList<>();
        @JsonInclude(JsonInclude.Include.ALWAYS) public int amount;
        public String status;
        public String method;
        public LocalDate paidOn;
        public LocalDate proofOn;
    }

    public static class Line {
        public String t;
        public int a;

        public Line() {}
        public Line(String t, int a) { this.t = t; this.a = a; }
    }
}
