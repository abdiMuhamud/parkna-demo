package com.innovii.parkna.engine;

import com.innovii.parkna.model.Fine;
import com.innovii.parkna.model.Tariff;

import java.time.LocalDate;
import java.util.List;
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
    String warn(Fine f, String roadName, String due, String sc) {
        return "ParkNa WARNING " + f.id + ": " + f.plate + " was parked on " + roadName + " at " + Cal.hm(f.t) + " on " + fmtD(Cal.fromDkey(f.day)) + " without paying. Pay the "
                + f.base + " GMD daily fee within 24 hours (by " + due + "). After that it is " + (f.base + f.fine) + " GMD with the " + f.fine + " GMD fine. Text " + f.plate + " to " + sc + " or use the ParkNa app.";
    }
    String foffer(String p, List<String> ids, int amount, boolean late) {
        return p + " has an unpaid warning (" + String.join(", ", ids) + "): " + amount + " GMD" + (late ? " including the " + tariff.get().fine + " GMD fine" : "") + ". Pay it first.\n1 Wave 2 Afrimoney 3 APS 4 QMoney";
    }
    String okF(String p, int amt, List<String> ids, boolean today, String ticket, String prov) {
        return "Paid " + amt + " GMD with " + prov + " for warning " + String.join(", ", ids) + ". " + p + " is clear" + (today ? " and PAID till 7pm today" : "") + ". Ticket " + ticket + ".";
    }
    String fremind(Fine f, String sc) {
        return "ParkNa reminder: pay " + f.base + " GMD for warning " + f.id + " (" + f.plate + ") by " + Cal.hm(f.t) + " today. After that it is " + (f.base + f.fine) + " GMD. Text " + f.plate + " to " + sc + ".";
    }
}
