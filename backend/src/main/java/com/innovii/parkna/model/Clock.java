package com.innovii.parkna.model;

import java.time.LocalDate;

/** The service clock ("B" in the snapshot): the current day, the minute of the day, and whether it runs. */
public class Clock {
    public LocalDate date;
    public int min;
    public boolean run;
}
