package com.innovii.parkna.model;

/** A car shown parked in a bay on the back-office map ("PARK"). */
public class ParkedCar {
    public String road;
    public String bay;
    public String plate;
    public String driver;

    public ParkedCar() {}
    public ParkedCar(String road, String bay, String plate, String driver) { this.road = road; this.bay = bay; this.plate = plate; this.driver = driver; }
}
