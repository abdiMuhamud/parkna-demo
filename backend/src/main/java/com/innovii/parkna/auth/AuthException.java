package com.innovii.parkna.auth;

/** A sign-in or permission problem to show to the user, with the HTTP status to answer with. */
public class AuthException extends RuntimeException {
    public final int status;

    public AuthException(int status, String message) {
        super(message);
        this.status = status;
    }

    public static AuthException unauthorized() { return new AuthException(401, "Please sign in again."); }
    public static AuthException forbidden() { return new AuthException(403, "You are not allowed to do that."); }
    public static AuthException tooMany(String m) { return new AuthException(429, m); }
    public static AuthException bad(String m) { return new AuthException(400, m); }
}
