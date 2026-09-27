package com.innovii.parkna.model;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** A phone number known to ParkNa: drivers, attendants and organisation contacts ("NUMS" in the snapshot). */
public class Subscriber {
    public String num;
    public String name;
    public List<String> plates = new ArrayList<>();
    public String last;
    public Pending pending;
    public List<SmsEntry> sms = new ArrayList<>();
    public String lastD;
    /** Simulated mobile-money balances per provider, in GMD. */
    public Map<String, Integer> wallet = new LinkedHashMap<>();
    public List<Receipt> receipts = new ArrayList<>();
    public boolean welcomed;
    public String prov = "Wave";
    @JsonInclude(JsonInclude.Include.NON_NULL) public Boolean persona;
    @JsonInclude(JsonInclude.Include.NON_NULL) public String note;
}
