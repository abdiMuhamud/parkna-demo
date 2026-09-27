package com.innovii.parkna.engine;

import com.innovii.parkna.model.Check;
import com.innovii.parkna.model.LedgerEntry;
import com.innovii.parkna.model.OutMessage;
import com.innovii.parkna.model.Receipt;
import com.innovii.parkna.model.SmsEntry;
import com.innovii.parkna.model.Tariff;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * What one unit of work (an action, a clock tick, a reset) changed, so the repository can write just that
 * to MariaDB in one transaction. The engine marks records generously: an extra write is harmless,
 * a missed one is not (the database round-trip test checks this).
 */
public class Changes {
    /** A reset replaces everything: the repository clears the tables and writes the whole state. */
    public boolean fullReset;
    public final Set<String> subscribers = new LinkedHashSet<>();
    public final Set<String> plates = new LinkedHashSet<>();
    public final Set<String> officers = new LinkedHashSet<>();
    public final Set<String> orgs = new LinkedHashSet<>();
    public final List<NewSms> sms = new ArrayList<>();
    public final List<NewReceipt> receipts = new ArrayList<>();
    public final List<LedgerEntry> ledger = new ArrayList<>();
    public final List<Check> checks = new ArrayList<>();
    public final List<Tariff.Change> tariffLog = new ArrayList<>();
    public boolean tariff;
    public boolean exceptions;
    public boolean announcements;

    /** A line added to a phone's SMS thread; {@code out} is set for messages ParkNa sends. */
    public record NewSms(String num, SmsEntry entry, OutMessage out) {}
    public record NewReceipt(String num, Receipt receipt) {}

    /** Messages ParkNa sent in this unit of work, for the SMS gateway once the data is saved. */
    public List<OutMessage> outgoing() {
        List<OutMessage> r = new ArrayList<>();
        for (NewSms s : sms) if (s.out() != null) r.add(s.out());
        return r;
    }

    public boolean isEmpty() {
        return !fullReset && subscribers.isEmpty() && plates.isEmpty() && officers.isEmpty() && orgs.isEmpty() && sms.isEmpty()
                && receipts.isEmpty() && ledger.isEmpty() && checks.isEmpty() && tariffLog.isEmpty() && !tariff && !exceptions && !announcements;
    }
}
