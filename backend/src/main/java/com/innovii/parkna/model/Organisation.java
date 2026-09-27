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
        public LocalDate from;
        public LocalDate to;
    }

    /** A pro-rata charge for a plate added mid-month, billed on the next invoice. */
    public static class Topup {
        public String t;
        public int a;

        public Topup() {}
        public Topup(String t, int a) { this.t = t; this.a = a; }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class Invoice {
        public String no;
        public String month;
        public LocalDate issued;
        public LocalDate due;
        public LocalDate end;
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
