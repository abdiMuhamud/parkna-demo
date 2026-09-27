package com.innovii.parkna.engine;

import com.innovii.parkna.model.Tariff;

import java.time.LocalDate;
import java.util.function.Supplier;

import static com.innovii.parkna.engine.Cal.fmtD;

/** SMS texts sent to drivers. Attendant and organisation texts are next to their rules in {@link ParkingEngine}. */
final class Messages {
    private final Supplier<Tariff> tariff;

    Messages(Supplier<Tariff> tariff) { this.tariff = tariff; }

    String welcome() { return "Welcome to ParkNa, Banjul City parking. Text your plate number to pay, e.g. BJL1234. " + tariff.get().daily + " GMD a day, 7am-7pm Mon-Sat."; }
    String help() { return "ParkNa: text your plate to pay for today, M for a monthly pass. 7am-7pm Mon-Sat. Pay by Wave, Afrimoney, APS or QMoney. Park in any marked ParkNa bay."; }
    String free() { return "Parking is free now. Paid hours 7am-7pm Mon-Sat."; }
    String bad() { return "Enter your plate e.g. BJL1234"; }
    String officerOnly(String w) { return w + " is for registered ParkNa attendants. To pay for parking, text your plate e.g. BJL1234"; }
    String offer(String p) { return "Daily pass " + p + ": " + tariff.get().daily + " GMD, valid till 7pm today.\n1 Wave 2 Afrimoney 3 APS 4 QMoney"; }
    String org(String p, String orgName, String orgId) { return p + " is covered by " + orgName + " fleet (" + orgId + "). Nothing to pay."; }
    String mcov(String p, LocalDate to) { return p + " has a monthly pass to " + fmtD(to) + ". Nothing to pay today."; }
    String dcov(String p, String ticket) { return p + " is already paid till 7pm today. Ticket " + ticket + ". Nothing to pay."; }
    String moffer(String p, LocalDate to) { return "Monthly " + p + ": " + tariff.get().monthly + " GMD, valid to " + fmtD(to) + ".\n1 Wave 2 Afrimoney 3 APS 4 QMoney"; }
    String okD(String p, String ticket, String prov) { return "Paid " + tariff.get().daily + " GMD with " + prov + ". " + p + " is PAID till 7pm today. Ticket " + ticket + ". Park in any marked ParkNa bay."; }
    String okM(String p, LocalDate to, String ticket, String prov) { return "Paid " + tariff.get().monthly + " GMD with " + prov + ". " + p + " monthly pass valid to " + fmtD(to) + ". Ticket " + ticket + ". We will remind you 3 days before it ends."; }
    String remind(String p, LocalDate to) { return "Your ParkNa monthly pass for " + p + " ends " + fmtD(to) + ". Text M to renew."; }
}
