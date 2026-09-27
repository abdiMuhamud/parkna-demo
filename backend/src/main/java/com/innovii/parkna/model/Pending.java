package com.innovii.parkna.model;

/** A payment offer sent by SMS that waits for the driver's 1-4 provider reply. */
public class Pending {
    public String plate;
    public String kind;

    public Pending() {}
    public Pending(String plate, String kind) { this.plate = plate; this.kind = kind; }
}
