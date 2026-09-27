package com.innovii.parkna.model;

import java.time.LocalDate;

/** A Council event or announcement shown as a banner on the driver app's home screen ("ANN"). */
public class Announcement {
    public String id;
    /** Event, Announcement or Notice */
    public String kind;
    public String title;
    public String text;
    /** Optional date line, e.g. "Sat 7 Nov · 8am at Arch 22" */
    public String when;
    /** Optional https link for "Learn more" */
    public String link;
    /** Banner colour: blue, yellow, green or red */
    public String theme;
    /** Shown from this day to this day (inclusive) while status is "live"; "hidden" takes it down. */
    public LocalDate from;
    public LocalDate to;
    public String status;
    public LocalDate created;
    public String by;
}
