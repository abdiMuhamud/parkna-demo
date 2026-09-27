package com.innovii.parkna.auth;

import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;

/**
 * Password hashing (PBKDF2-HMAC-SHA256, 600,000 iterations, 16-byte salt) and random secrets.
 * Stored format: pbkdf2$&lt;iterations&gt;$&lt;salt base64&gt;$&lt;hash base64&gt;
 */
public final class Passwords {
    private Passwords() {}

    static final int ITERATIONS = 600_000;
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final String READABLE = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    public static String hash(String password) { return hash(password, ITERATIONS); }

    static String hash(String password, int iterations) {
        byte[] salt = new byte[16];
        RANDOM.nextBytes(salt);
        byte[] h = pbkdf2(password.toCharArray(), salt, iterations);
        return "pbkdf2$" + iterations + "$" + Base64.getEncoder().encodeToString(salt) + "$" + Base64.getEncoder().encodeToString(h);
    }

    public static boolean verify(String password, String stored) {
        if (password == null || stored == null) return false;
        String[] p = stored.split("\\$");
        if (p.length != 4 || !p[0].equals("pbkdf2")) return false;
        byte[] salt = Base64.getDecoder().decode(p[2]), expected = Base64.getDecoder().decode(p[3]);
        byte[] actual = pbkdf2(password.toCharArray(), salt, Integer.parseInt(p[1]));
        return MessageDigest.isEqual(expected, actual);
    }

    private static byte[] pbkdf2(char[] password, byte[] salt, int iterations) {
        try {
            PBEKeySpec spec = new PBEKeySpec(password, salt, iterations, 256);
            return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("PBKDF2 is not available", e);
        }
    }

    /** A random bearer token (256 bits, URL-safe). */
    public static String token() {
        byte[] b = new byte[32];
        RANDOM.nextBytes(b);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(b);
    }

    /** A random password that is easy to read out and type (no 0/O, 1/l/I). */
    public static String readable(int length) {
        StringBuilder s = new StringBuilder();
        for (int i = 0; i < length; i++) s.append(READABLE.charAt(RANDOM.nextInt(READABLE.length())));
        return s.toString();
    }

    /** A 6-digit one-time code. */
    public static String otp() { return String.format("%06d", RANDOM.nextInt(1_000_000)); }

    public static String sha256(String s) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(s.getBytes(java.nio.charset.StandardCharsets.UTF_8))); }
        catch (GeneralSecurityException e) { throw new IllegalStateException(e); }
    }
}
