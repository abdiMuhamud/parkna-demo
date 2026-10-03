package com.innovii.parkna.auth;

/** Who someone is to SUNU Park. Phone roles sign in with an SMS code; staff roles with a username and password. */
public enum Role {
    /** Pays for parking, manages their plates. */
    DRIVER(false),
    /** Parking attendant: starts and ends shifts, checks plates. */
    OFFICER(false),
    /** Billing contact of an organisation with a fleet agreement. */
    ORG(false),
    /** Everything in the back office, including staff accounts, tariffs and announcements. */
    ADMIN(true),
    /** Attendants: registers and moves them, records exceptions. */
    SUPERVISOR(true),
    /** Payments: matches bank transfers, handles exceptions. */
    FINANCE(true),
    /** Police: follows up drivers with unpaid warnings and fines, and a plate's record of offences. Changes nothing. */
    POLICE(true),
    /** Banjul City Council: sees everything, changes nothing. */
    COUNCIL(true);

    public final boolean staff;

    Role(boolean staff) { this.staff = staff; }

    /** The phone role for the "as" field of a sign-in request, or null. */
    public static Role phoneRole(String as) {
        if (as == null) return null;
        return switch (as.trim().toLowerCase()) {
            case "driver" -> DRIVER;
            case "officer" -> OFFICER;
            case "org" -> ORG;
            default -> null;
        };
    }

    public static Role staffRole(String s) {
        try { Role r = Role.valueOf(String.valueOf(s).trim().toUpperCase()); return r.staff ? r : null; }
        catch (IllegalArgumentException e) { return null; }
    }

    /**
     * The role a new or changed back-office account may get. Three kinds of people sign in to the web portal:
     * administrators and the police (username and password) and organisations (an SMS code, not a staff account).
     * Supervisor, Finance and Council accounts made before keep working, but no new ones are made.
     */
    public static Role portalStaffRole(String s) {
        Role r = staffRole(s);
        return r == ADMIN || r == POLICE ? r : null;
    }
}
