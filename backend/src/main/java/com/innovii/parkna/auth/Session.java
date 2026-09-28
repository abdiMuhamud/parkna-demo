package com.innovii.parkna.auth;

import java.time.Instant;

/**
 * A signed-in device or browser.
 *
 * @param tokenHash SHA-256 of the bearer token (the token itself is never stored)
 * @param role      what the session may do
 * @param subject   the phone number (7 digits) for phone roles, the username for staff
 * @param orgId     the organisation, for ORG sessions
 * @param name      display name for staff (used in the audit log and as the author of tariff changes, announcements...)
 */
public record Session(String tokenHash, Role role, String subject, String orgId, String name, Instant expiresAt, boolean mustChangePassword) {
    public boolean staff() { return role.staff; }

    public String who() { return (staff() ? subject : "+220 " + subject) + " (" + role.name().toLowerCase() + ")"; }
}
