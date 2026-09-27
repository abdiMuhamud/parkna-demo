package com.innovii.parkna.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * One line of a phone number's SMS thread. Exactly one of the shapes is used:
 * a day header {d}, a message to the phone {i, tag, t}, or a message from the phone {o, t}.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class SmsEntry {
    public String d;
    public String i;
    public String o;
    public String tag;
    public String t;
    /** For messages from ParkNa: the outbox number. Stored, not sent to the screens. */
    @JsonIgnore public Long outId;

    public static SmsEntry dayHeader(String d) { SmsEntry e = new SmsEntry(); e.d = d; return e; }
    public static SmsEntry toPhone(String text, String tag, String t) { SmsEntry e = new SmsEntry(); e.i = text; e.tag = tag; e.t = t; return e; }
    public static SmsEntry fromPhone(String text, String t) { SmsEntry e = new SmsEntry(); e.o = text; e.t = t; return e; }
}
