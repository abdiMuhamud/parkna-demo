package com.innovii.parkna.model;

import com.fasterxml.jackson.annotation.JsonInclude;

/** One line of the payments ledger ("LOG"): driver payments, failed attempts and organisation invoices. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class LedgerEntry {
    public String t;
    public String day;
    public String text;
    public String amt;
    @JsonInclude(JsonInclude.Include.ALWAYS) public int amount;
    public String src;
    public String plate;
    public String prov;
    public String ticket;
    public String num;
    public Boolean bad;
}
