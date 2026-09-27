package com.innovii.parkna.model;

import com.fasterxml.jackson.annotation.JsonInclude;

/** An SMS sent by ParkNa ("OUT"), newest first. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class OutMessage {
    public String t;
    public String d;
    public String num;
    public String text;
    public String tag;
    @JsonInclude(JsonInclude.Include.ALWAYS) public long id;
}
