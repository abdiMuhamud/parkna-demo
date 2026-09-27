-- Sign-in: back-office staff accounts, sessions for everyone, one-time SMS codes, and the audit log.

-- Back-office and Council accounts. role: ADMIN, SUPERVISOR, FINANCE or COUNCIL (read-only).
CREATE TABLE staff_user (
  id                    BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  username              VARCHAR(60)  NOT NULL,
  display_name          VARCHAR(120) NOT NULL,
  role                  VARCHAR(20)  NOT NULL,
  password_hash         VARCHAR(255) NOT NULL,
  must_change_password  BOOLEAN      NOT NULL DEFAULT TRUE,
  active                BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_login_at         TIMESTAMP    NULL,
  UNIQUE KEY uk_staff_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per signed-in device or browser. Only a SHA-256 of the token is stored.
-- kind: PHONE (driver, attendant, organisation contact) or STAFF. subject: phone number or staff username.
CREATE TABLE auth_session (
  token_hash    CHAR(64)     NOT NULL PRIMARY KEY,
  kind          VARCHAR(10)  NOT NULL,
  role          VARCHAR(20)  NOT NULL,
  subject       VARCHAR(60)  NOT NULL,
  org_id        VARCHAR(10)  NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at    TIMESTAMP    NOT NULL,
  last_seen_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip            VARCHAR(64)  NULL,
  user_agent    VARCHAR(255) NULL,
  KEY ix_session_subject (kind, subject),
  KEY ix_session_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One-time sign-in codes sent by SMS. Only a SHA-256 of the code is stored.
CREATE TABLE otp_challenge (
  id          BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  msisdn      VARCHAR(20)  NOT NULL,
  role        VARCHAR(20)  NOT NULL,
  code_hash   CHAR(64)     NOT NULL,
  expires_at  TIMESTAMP    NOT NULL,
  attempts    INT          NOT NULL DEFAULT 0,
  used        BOOLEAN      NOT NULL DEFAULT FALSE,
  ip          VARCHAR(64)  NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_otp_msisdn (msisdn, created_at),
  KEY ix_otp_ip (ip, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Who did what: every back-office action and every sign-in.
CREATE TABLE audit_log (
  id          BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actor       VARCHAR(120) NOT NULL,
  role        VARCHAR(20)  NOT NULL,
  action      VARCHAR(40)  NOT NULL,
  target      VARCHAR(160) NULL,
  result      VARCHAR(10)  NOT NULL,
  detail      VARCHAR(500) NULL,
  ip          VARCHAR(64)  NULL,
  KEY ix_audit_at (at),
  KEY ix_audit_actor (actor, at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
