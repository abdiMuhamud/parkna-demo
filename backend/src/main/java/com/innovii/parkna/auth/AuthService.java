package com.innovii.parkna.auth;

import com.innovii.parkna.config.AppConfig;
import com.innovii.parkna.model.OutMessage;
import com.innovii.parkna.sms.SmsGateway;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

/**
 * Signing in and staying signed in.
 * <ul>
 *   <li>Drivers, attendants and organisation contacts: phone number + 6-digit code sent by SMS (5 minutes, 5 tries),
 *       limited to 3 codes per 10 minutes per number and 30 per hour per address.</li>
 *   <li>Staff: username + password (PBKDF2), locked for 15 minutes after 5 wrong passwords.</li>
 *   <li>Every sign-in gets a random bearer token; only its SHA-256 is stored (table auth_session).</li>
 * </ul>
 */
public final class AuthService {
    private static final Logger log = LoggerFactory.getLogger(AuthService.class);
    private static final Pattern USERNAME = Pattern.compile("^[a-z0-9._-]{3,40}$");
    private static final Duration CACHE = Duration.ofSeconds(30), TICKET = Duration.ofSeconds(60), LOCKOUT = Duration.ofMinutes(15);

    /** Who may sign in with a phone number; answered by the service from the live data. */
    public interface Directory {
        /** null if the number may sign in with this role, otherwise the reason to show. */
        String refuse(String num, Role role);
        /** The organisation this number is the billing contact of, or null. */
        String orgFor(String num);
    }

    private final AppConfig cfg;
    private final DataSource ds;
    private final SmsGateway sms;
    private final Directory directory;
    private final Map<String, Cached> cache = new ConcurrentHashMap<>();
    private final Map<String, Ticket> tickets = new ConcurrentHashMap<>();
    private final Map<String, Failures> staffFailures = new ConcurrentHashMap<>();

    private record Cached(Session session, Instant loaded, Instant lastSeenWritten) {}
    private record Ticket(Session session, Instant expires) {}
    private static final class Failures { int count; Instant first = Instant.now(); Instant lockedUntil; }

    public AuthService(AppConfig cfg, DataSource ds, SmsGateway sms, Directory directory) {
        this.cfg = cfg;
        this.ds = ds;
        this.sms = sms;
        this.directory = directory;
    }

    // ================================================================== phone sign-in

    /** A Gambian number as 7 digits: accepts 7012345, +220 701 2345, 2207012345. */
    public static String normalisePhone(String raw) {
        String d = raw == null ? "" : raw.replaceAll("[^0-9]", "");
        if (d.length() == 10 && d.startsWith("220")) d = d.substring(3);
        if (d.length() == 12 && d.startsWith("00220")) d = d.substring(5);
        if (d.length() != 7) throw AuthException.bad("Enter a 7-digit Gambian mobile number.");
        return d;
    }

    /** Sends a sign-in code. The answer includes the code itself only when auth.otp.showCodeInApp is on. */
    public Map<String, Object> requestOtp(String phoneRaw, String as, String ip) {
        Role role = Role.phoneRole(as);
        if (role == null) throw AuthException.bad("Choose driver, officer or org.");
        String num = normalisePhone(phoneRaw);
        String refusal = directory.refuse(num, role);
        if (refusal != null) {
            audit("+220 " + num, role, "auth.code", num, "refused", refusal, ip);
            throw new AuthException(403, refusal);
        }
        try (Connection c = ds.getConnection()) {
            if (count(c, "SELECT COUNT(*) FROM otp_challenge WHERE msisdn = ? AND created_at > ?", num, Instant.now().minusSeconds(30)) > 0)
                throw AuthException.tooMany("A code was just sent. Wait 30 seconds before asking for another.");
            if (count(c, "SELECT COUNT(*) FROM otp_challenge WHERE msisdn = ? AND created_at > ?", num, Instant.now().minus(Duration.ofMinutes(10))) >= 3)
                throw AuthException.tooMany("Too many codes for this number. Try again in 10 minutes.");
            if (ip != null && count(c, "SELECT COUNT(*) FROM otp_challenge WHERE ip = ? AND created_at > ?", ip, Instant.now().minus(Duration.ofHours(1))) >= 30)
                throw AuthException.tooMany("Too many sign-in attempts from this network. Try again later.");
            String review = cfg.auth.reviewNumbers().get(num);
            String code = review != null ? review : Passwords.otp();
            try (PreparedStatement ps = c.prepareStatement("UPDATE otp_challenge SET used = TRUE WHERE msisdn = ? AND role = ? AND used = FALSE")) {
                ps.setString(1, num); ps.setString(2, role.name()); ps.executeUpdate();
            }
            try (PreparedStatement ps = c.prepareStatement("INSERT INTO otp_challenge (msisdn, role, code_hash, expires_at, ip) VALUES (?, ?, ?, ?, ?)")) {
                ps.setString(1, num); ps.setString(2, role.name()); ps.setString(3, codeHash(num, role, code));
                ps.setTimestamp(4, Timestamp.from(Instant.now().plus(Duration.ofMinutes(cfg.auth.otpMinutes()))));
                ps.setString(5, ip);
                ps.executeUpdate();
            }
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("ok", true);
            r.put("expiresInMinutes", cfg.auth.otpMinutes());
            if (review != null) {
                log.info("Sign-in for review number +220 {} ({}): fixed code, no SMS (auth.reviewNumbers)", num, role.name().toLowerCase());
            } else if (cfg.auth.otpInApp()) {
                r.put("code", code);
                log.info("Sign-in code for +220 {} ({}) shown in the app (auth.otp.showCodeInApp)", num, role.name().toLowerCase());
            } else {
                OutMessage m = new OutMessage();
                m.num = num;
                m.tag = "Code";
                m.text = "SUNU Park code: " + code + ". It expires in " + cfg.auth.otpMinutes() + " minutes. Never share it with anyone.";
                sms.send(m);
                log.info("Sign-in code sent to +220 {} ({})", num, role.name().toLowerCase());
            }
            return r;
        } catch (SQLException e) {
            throw storage(e);
        }
    }

    /** Checks the code and signs in. */
    public Map<String, Object> verifyOtp(String phoneRaw, String as, String code, String ip, String ua) {
        Role role = Role.phoneRole(as);
        if (role == null) throw AuthException.bad("Choose driver, officer or org.");
        String num = normalisePhone(phoneRaw);
        String digits = code == null ? "" : code.replaceAll("[^0-9]", "");
        try (Connection c = ds.getConnection()) {
            long id;
            String hash;
            int attempts;
            try (PreparedStatement ps = c.prepareStatement("SELECT id, code_hash, attempts FROM otp_challenge WHERE msisdn = ? AND role = ? AND used = FALSE AND expires_at > ? ORDER BY id DESC LIMIT 1")) {
                ps.setString(1, num); ps.setString(2, role.name()); ps.setTimestamp(3, Timestamp.from(Instant.now()));
                try (ResultSet rs = ps.executeQuery()) {
                    if (!rs.next()) throw AuthException.bad("That code has expired. Ask for a new one.");
                    id = rs.getLong(1); hash = rs.getString(2); attempts = rs.getInt(3);
                }
            }
            if (attempts >= 5) throw AuthException.tooMany("Too many wrong codes. Ask for a new one.");
            if (!java.security.MessageDigest.isEqual(hash.getBytes(), codeHash(num, role, digits).getBytes())) {
                try (PreparedStatement ps = c.prepareStatement("UPDATE otp_challenge SET attempts = attempts + 1 WHERE id = ?")) { ps.setLong(1, id); ps.executeUpdate(); }
                audit("+220 " + num, role, "auth.verify", num, "refused", "wrong code", ip);
                throw AuthException.bad(attempts + 1 >= 5 ? "Too many wrong codes. Ask for a new one." : "That code is not right. Check the SMS and try again.");
            }
            try (PreparedStatement ps = c.prepareStatement("UPDATE otp_challenge SET used = TRUE WHERE id = ?")) { ps.setLong(1, id); ps.executeUpdate(); }
            String refusal = directory.refuse(num, role);
            if (refusal != null) throw new AuthException(403, refusal);
            String org = role == Role.ORG ? directory.orgFor(num) : null;
            String token = Passwords.token();
            Instant expires = Instant.now().plus(Duration.ofDays(cfg.auth.phoneSessionDays()));
            insertSession(c, Passwords.sha256(token), "PHONE", role, num, org, expires, ip, ua);
            audit("+220 " + num, role, "auth.signin", org != null ? org : num, "ok", null, ip);
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("ok", true);
            r.put("token", token);
            r.put("role", role.name().toLowerCase());
            r.put("num", num);
            if (org != null) r.put("org", org);
            return r;
        } catch (SQLException e) {
            throw storage(e);
        }
    }

    private static String codeHash(String num, Role role, String code) { return Passwords.sha256(num + ":" + role.name() + ":" + code); }

    // ================================================================== staff sign-in

    public Map<String, Object> staffLogin(String usernameRaw, String password, String ip, String ua) {
        String username = usernameRaw == null ? "" : usernameRaw.trim().toLowerCase();
        Failures f = staffFailures.get(username);
        if (f != null && f.lockedUntil != null && f.lockedUntil.isAfter(Instant.now()))
            throw AuthException.tooMany("Too many wrong passwords. Try again in 15 minutes.");
        try (Connection c = ds.getConnection()) {
            String hash = null, name = null;
            Role role = null;
            boolean active = false, mustChange = false;
            try (PreparedStatement ps = c.prepareStatement("SELECT password_hash, display_name, role, active, must_change_password FROM staff_user WHERE username = ?")) {
                ps.setString(1, username);
                try (ResultSet rs = ps.executeQuery()) {
                    if (rs.next()) { hash = rs.getString(1); name = rs.getString(2); role = Role.staffRole(rs.getString(3)); active = rs.getBoolean(4); mustChange = rs.getBoolean(5); }
                }
            }
            boolean ok = hash != null && Passwords.verify(password == null ? "" : password, hash);
            if (!ok || !active || role == null) {
                Failures nf = staffFailures.computeIfAbsent(username, k -> new Failures());
                synchronized (nf) {
                    if (Duration.between(nf.first, Instant.now()).compareTo(LOCKOUT) > 0) { nf.count = 0; nf.first = Instant.now(); }
                    if (++nf.count >= 5) nf.lockedUntil = Instant.now().plus(LOCKOUT);
                }
                audit(username, null, "auth.staff", username, "refused", ok && !active ? "account disabled" : "wrong username or password", ip);
                throw new AuthException(401, ok && !active ? "This account is switched off. Ask an administrator." : "Wrong username or password.");
            }
            staffFailures.remove(username);
            String token = Passwords.token();
            insertSession(c, Passwords.sha256(token), "STAFF", role, username, null, Instant.now().plus(Duration.ofHours(cfg.auth.staffSessionHours())), ip, ua);
            try (PreparedStatement ps = c.prepareStatement("UPDATE staff_user SET last_login_at = CURRENT_TIMESTAMP WHERE username = ?")) { ps.setString(1, username); ps.executeUpdate(); }
            audit(name, role, "auth.staff", username, "ok", null, ip);
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("ok", true);
            r.put("token", token);
            r.put("role", role.name().toLowerCase());
            r.put("name", name);
            r.put("username", username);
            r.put("mustChangePassword", mustChange);
            return r;
        } catch (SQLException e) {
            throw storage(e);
        }
    }

    public void changePassword(Session s, String current, String next) {
        if (!s.staff()) throw AuthException.forbidden();
        checkPasswordRules(next);
        try (Connection c = ds.getConnection()) {
            String hash;
            try (PreparedStatement ps = c.prepareStatement("SELECT password_hash FROM staff_user WHERE username = ?")) {
                ps.setString(1, s.subject());
                try (ResultSet rs = ps.executeQuery()) { if (!rs.next()) throw AuthException.unauthorized(); hash = rs.getString(1); }
            }
            if (!Passwords.verify(current == null ? "" : current, hash)) throw AuthException.bad("Your current password is not right.");
            if (Passwords.verify(next, hash)) throw AuthException.bad("Choose a password you have not used here before.");
            try (PreparedStatement ps = c.prepareStatement("UPDATE staff_user SET password_hash = ?, must_change_password = FALSE WHERE username = ?")) {
                ps.setString(1, Passwords.hash(next)); ps.setString(2, s.subject()); ps.executeUpdate();
            }
            // sign out every other browser of this user
            try (PreparedStatement ps = c.prepareStatement("DELETE FROM auth_session WHERE kind = 'STAFF' AND subject = ? AND token_hash <> ?")) {
                ps.setString(1, s.subject()); ps.setString(2, s.tokenHash()); ps.executeUpdate();
            }
            cache.clear();
            audit(s.name(), s.role(), "auth.password", s.subject(), "ok", null, null);
        } catch (SQLException e) {
            throw storage(e);
        }
    }

    static void checkPasswordRules(String p) {
        if (p == null || p.length() < 10) throw AuthException.bad("Use at least 10 characters for the password.");
        if (p.length() > 200) throw AuthException.bad("That password is too long.");
    }

    // ================================================================== sessions

    private void insertSession(Connection c, String hash, String kind, Role role, String subject, String org, Instant expires, String ip, String ua) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO auth_session (token_hash, kind, role, subject, org_id, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")) {
            ps.setString(1, hash); ps.setString(2, kind); ps.setString(3, role.name()); ps.setString(4, subject); ps.setString(5, org);
            ps.setTimestamp(6, Timestamp.from(expires)); ps.setString(7, ip); ps.setString(8, ua == null ? null : ua.substring(0, Math.min(255, ua.length())));
            ps.executeUpdate();
        }
    }

    /** The session for a bearer token, or null if it is unknown, expired or signed out. */
    public Session authenticate(String token) {
        if (token == null || token.isBlank() || token.length() > 100) return null;
        String hash = Passwords.sha256(token.trim());
        Instant now = Instant.now();
        Cached c = cache.get(hash);
        if (c != null && Duration.between(c.loaded(), now).compareTo(CACHE) < 0 && c.session().expiresAt().isAfter(now)) return c.session();
        try (Connection con = ds.getConnection()) {
            Session s = null;
            try (PreparedStatement ps = con.prepareStatement("SELECT s.role, s.subject, s.org_id, s.expires_at, s.kind, u.display_name, u.must_change_password, u.active, u.role "
                    + "FROM auth_session s LEFT JOIN staff_user u ON s.kind = 'STAFF' AND u.username = s.subject WHERE s.token_hash = ?")) {
                ps.setString(1, hash);
                try (ResultSet rs = ps.executeQuery()) {
                    if (rs.next()) {
                        Instant exp = rs.getTimestamp(4).toInstant();
                        boolean staff = "STAFF".equals(rs.getString(5));
                        Role role = Role.valueOf(rs.getString(1));
                        if (staff) {
                            // a staff member's current role and status always win over what the session was created with
                            if (!rs.getBoolean(8)) exp = Instant.EPOCH;
                            Role current = Role.staffRole(rs.getString(9));
                            if (current != null) role = current;
                        }
                        if (exp.isAfter(now)) s = new Session(hash, role, rs.getString(2), rs.getString(3), staff ? rs.getString(6) : null, exp, staff && rs.getBoolean(7));
                    }
                }
            }
            if (s == null) { cache.remove(hash); return null; }
            Instant lastWritten = c != null ? c.lastSeenWritten() : Instant.EPOCH;
            if (Duration.between(lastWritten, now).toMinutes() >= 10) {
                // phone sessions stay valid while in use; staff sessions have a fixed end
                String sql = s.staff() ? "UPDATE auth_session SET last_seen_at = CURRENT_TIMESTAMP WHERE token_hash = ?"
                        : "UPDATE auth_session SET last_seen_at = CURRENT_TIMESTAMP, expires_at = ? WHERE token_hash = ?";
                try (PreparedStatement ps = con.prepareStatement(sql)) {
                    int i = 1;
                    if (!s.staff()) ps.setTimestamp(i++, Timestamp.from(now.plus(Duration.ofDays(cfg.auth.phoneSessionDays()))));
                    ps.setString(i, hash);
                    ps.executeUpdate();
                }
                lastWritten = now;
            }
            cache.put(hash, new Cached(s, now, lastWritten));
            return s;
        } catch (SQLException e) {
            log.error("Could not check a session", e);
            return null;
        }
    }

    public void logout(Session s) {
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement("DELETE FROM auth_session WHERE token_hash = ?")) {
            ps.setString(1, s.tokenHash());
            ps.executeUpdate();
        } catch (SQLException e) {
            throw storage(e);
        } finally {
            cache.remove(s.tokenHash());
        }
    }

    /** A one-time, 60-second ticket to open the live-update stream (EventSource cannot send the token in a header). */
    public String ticket(Session s) {
        tickets.values().removeIf(t -> t.expires().isBefore(Instant.now()));
        String t = Passwords.token();
        tickets.put(t, new Ticket(s, Instant.now().plus(TICKET)));
        return t;
    }

    public Session redeemTicket(String t) {
        if (t == null) return null;
        Ticket x = tickets.remove(t);
        if (x == null || x.expires().isBefore(Instant.now())) return null;
        return authenticate0(x.session());
    }

    /** Re-checks a session (it may have been signed out since the ticket was issued). */
    private Session authenticate0(Session s) {
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement("SELECT 1 FROM auth_session WHERE token_hash = ? AND expires_at > ?")) {
            ps.setString(1, s.tokenHash()); ps.setTimestamp(2, Timestamp.from(Instant.now()));
            try (ResultSet rs = ps.executeQuery()) { return rs.next() ? s : null; }
        } catch (SQLException e) {
            return null;
        }
    }

    /** Is this session still valid? Used by the live-update stream every minute. */
    public boolean stillValid(Session s) {
        Cached c = cache.get(s.tokenHash());
        if (c != null && Duration.between(c.loaded(), Instant.now()).compareTo(CACHE) < 0) return true;
        return authenticate0(s) != null;
    }

    /** Signs out every session of a phone number (e.g. an attendant who was switched off). */
    public void signOutPhone(String num) {
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement("DELETE FROM auth_session WHERE kind = 'PHONE' AND subject = ?")) {
            ps.setString(1, num);
            ps.executeUpdate();
        } catch (SQLException e) {
            log.error("Could not sign out +220 {}", num, e);
        }
        cache.clear();
    }

    /** Removes expired sessions and old codes. Runs every hour. */
    public void cleanup() {
        try (Connection c = ds.getConnection()) {
            try (PreparedStatement ps = c.prepareStatement("DELETE FROM auth_session WHERE expires_at < ?")) { ps.setTimestamp(1, Timestamp.from(Instant.now())); ps.executeUpdate(); }
            try (PreparedStatement ps = c.prepareStatement("DELETE FROM otp_challenge WHERE created_at < ?")) { ps.setTimestamp(1, Timestamp.from(Instant.now().minus(Duration.ofDays(2)))); ps.executeUpdate(); }
        } catch (SQLException e) {
            log.warn("Could not clean up old sessions: {}", e.getMessage());
        }
        for (Iterator<Map.Entry<String, Failures>> it = staffFailures.entrySet().iterator(); it.hasNext(); ) {
            Failures f = it.next().getValue();
            if (Duration.between(f.first, Instant.now()).compareTo(LOCKOUT.multipliedBy(2)) > 0) it.remove();
        }
    }

    // ================================================================== staff accounts

    /** On the very first start, creates the "admin" account with a random password written once to the log. */
    public void bootstrap() {
        try (Connection c = ds.getConnection()) {
            if (count(c, "SELECT COUNT(*) FROM staff_user") > 0) return;
            String password = Passwords.readable(14);
            try (PreparedStatement ps = c.prepareStatement("INSERT INTO staff_user (username, display_name, role, password_hash, must_change_password) VALUES ('admin', 'Administrator', 'ADMIN', ?, TRUE)")) {
                ps.setString(1, Passwords.hash(password));
                ps.executeUpdate();
            }
            log.warn("==================================================================");
            log.warn(" First start: created the back-office account 'admin'");
            log.warn(" Password: {}   (shown only this once)", password);
            log.warn(" Sign in at /admin, then choose your own password.");
            log.warn("==================================================================");
        } catch (SQLException e) {
            throw storage(e);
        }
    }

    public List<Map<String, Object>> listStaff() {
        List<Map<String, Object>> out = new ArrayList<>();
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement("SELECT username, display_name, role, active, must_change_password, last_login_at, created_at FROM staff_user ORDER BY active DESC, display_name")) {
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Map<String, Object> u = new LinkedHashMap<>();
                    u.put("username", rs.getString(1)); u.put("name", rs.getString(2)); u.put("role", rs.getString(3).toLowerCase());
                    u.put("active", rs.getBoolean(4)); u.put("mustChangePassword", rs.getBoolean(5));
                    Timestamp ll = rs.getTimestamp(6);
                    u.put("lastLogin", ll == null ? null : ll.toInstant().toString());
                    u.put("created", rs.getTimestamp(7).toInstant().toString());
                    out.add(u);
                }
            }
        } catch (SQLException e) {
            throw storage(e);
        }
        return out;
    }

    /** Creates a staff account with a temporary password (returned once; the person must change it). */
    public Map<String, Object> createStaff(Session by, String usernameRaw, String name, String roleRaw) {
        requireAdmin(by);
        String username = usernameRaw == null ? "" : usernameRaw.trim().toLowerCase();
        if (!USERNAME.matcher(username).matches()) throw AuthException.bad("Username: 3 to 40 lowercase letters, digits, dots, dashes or underscores.");
        if (name == null || name.isBlank() || name.trim().length() > 120) throw AuthException.bad("Enter the person's full name.");
        Role role = Role.staffRole(roleRaw);
        if (role == null) throw AuthException.bad("Choose a role: admin, supervisor, finance or council.");
        String password = Passwords.readable(12);
        try (Connection c = ds.getConnection()) {
            if (count(c, "SELECT COUNT(*) FROM staff_user WHERE username = ?", username) > 0) throw AuthException.bad("That username is taken.");
            try (PreparedStatement ps = c.prepareStatement("INSERT INTO staff_user (username, display_name, role, password_hash, must_change_password) VALUES (?, ?, ?, ?, TRUE)")) {
                ps.setString(1, username); ps.setString(2, name.trim()); ps.setString(3, role.name()); ps.setString(4, Passwords.hash(password));
                ps.executeUpdate();
            }
        } catch (SQLException e) {
            throw storage(e);
        }
        audit(by.name(), by.role(), "staff.create", username, "ok", role.name(), null);
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("ok", true);
        r.put("username", username);
        r.put("password", password);
        return r;
    }

    /** Changes role, switches an account on or off, or resets its password (returns the new temporary one). */
    public Map<String, Object> updateStaff(Session by, String usernameRaw, String roleRaw, Boolean active, boolean resetPassword) {
        requireAdmin(by);
        String username = usernameRaw == null ? "" : usernameRaw.trim().toLowerCase();
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("ok", true);
        try (Connection c = ds.getConnection()) {
            if (count(c, "SELECT COUNT(*) FROM staff_user WHERE username = ?", username) == 0) throw AuthException.bad("No such account.");
            Role role = roleRaw == null ? null : Role.staffRole(roleRaw);
            if (roleRaw != null && role == null) throw AuthException.bad("Choose a role: admin, supervisor, finance or council.");
            boolean removesAdmin = (role != null && role != Role.ADMIN) || Boolean.FALSE.equals(active);
            if (removesAdmin && count(c, "SELECT COUNT(*) FROM staff_user WHERE role = 'ADMIN' AND active = TRUE AND username <> ?", username) == 0
                    && count(c, "SELECT COUNT(*) FROM staff_user WHERE role = 'ADMIN' AND active = TRUE AND username = ?", username) > 0)
                throw AuthException.bad("There must always be at least one active administrator.");
            if (role != null) exec(c, "UPDATE staff_user SET role = ? WHERE username = ?", role.name(), username);
            if (active != null) exec(c, "UPDATE staff_user SET active = ? WHERE username = ?", active, username);
            if (resetPassword) {
                String password = Passwords.readable(12);
                exec(c, "UPDATE staff_user SET password_hash = ?, must_change_password = TRUE WHERE username = ?", Passwords.hash(password), username);
                r.put("password", password);
            }
            if (resetPassword || Boolean.FALSE.equals(active) || role != null)
                exec(c, "DELETE FROM auth_session WHERE kind = 'STAFF' AND subject = ?", username);
            cache.clear();
        } catch (SQLException e) {
            throw storage(e);
        }
        audit(by.name(), by.role(), "staff.update", username, "ok",
                (roleRaw != null ? "role=" + roleRaw + " " : "") + (active != null ? "active=" + active + " " : "") + (resetPassword ? "password reset" : ""), null);
        return r;
    }

    private static void requireAdmin(Session s) { if (s == null || s.role() != Role.ADMIN) throw AuthException.forbidden(); }

    // ================================================================== audit log

    /** Records who did what (never passwords or codes). Failures to write are logged, never thrown. */
    public void audit(String actor, Role role, String action, String target, String result, String detail, String ip) {
        log.info("AUDIT {} [{}] {} {} -> {}{}", actor, role == null ? "-" : role.name().toLowerCase(), action, target == null ? "" : target, result, detail == null ? "" : " (" + detail + ")");
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement("INSERT INTO audit_log (actor, role, action, target, result, detail, ip) VALUES (?, ?, ?, ?, ?, ?, ?)")) {
            ps.setString(1, cut(actor, 120)); ps.setString(2, role == null ? "-" : role.name()); ps.setString(3, cut(action, 40)); ps.setString(4, cut(target, 160));
            ps.setString(5, cut(result, 10)); ps.setString(6, cut(detail, 500)); ps.setString(7, cut(ip, 64));
            ps.executeUpdate();
        } catch (SQLException e) {
            log.warn("Could not write the audit log: {}", e.getMessage());
        }
    }

    public List<Map<String, Object>> recentAudit(int limit) {
        List<Map<String, Object>> out = new ArrayList<>();
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement("SELECT at, actor, role, action, target, result, detail FROM audit_log ORDER BY id DESC LIMIT ?")) {
            ps.setInt(1, Math.max(1, Math.min(500, limit)));
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("at", rs.getTimestamp(1).toInstant().toString()); m.put("actor", rs.getString(2)); m.put("role", rs.getString(3).toLowerCase());
                    m.put("action", rs.getString(4)); m.put("target", rs.getString(5)); m.put("result", rs.getString(6)); m.put("detail", rs.getString(7));
                    out.add(m);
                }
            }
        } catch (SQLException e) {
            throw storage(e);
        }
        return out;
    }

    // ================================================================== helpers

    private static String cut(String s, int n) { return s == null ? null : s.length() <= n ? s : s.substring(0, n); }

    private static long count(Connection c, String sql, Object... args) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            bind(ps, args);
            try (ResultSet rs = ps.executeQuery()) { return rs.next() ? rs.getLong(1) : 0; }
        }
    }

    private static void exec(Connection c, String sql, Object... args) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(sql)) { bind(ps, args); ps.executeUpdate(); }
    }

    private static void bind(PreparedStatement ps, Object... args) throws SQLException {
        for (int i = 0; i < args.length; i++) {
            Object a = args[i];
            if (a instanceof Instant t) ps.setTimestamp(i + 1, Timestamp.from(t));
            else if (a instanceof Boolean b) ps.setBoolean(i + 1, b);
            else ps.setString(i + 1, String.valueOf(a));
        }
    }

    private static AuthException storage(SQLException e) {
        log.error("Sign-in database error", e);
        return new AuthException(503, "The server could not complete that. Try again in a moment.");
    }
}
