-- ParkNa schema v1 (MariaDB 10.5+). Applied by the back end at startup when db.migrate=true,
-- or by hand:  mysql -u root -p parkna < V1__initial_schema.sql
-- Calendar days are DATE columns; times of day are 'HH:MM' strings or minutes after midnight (0-1439).
-- Amounts are whole Gambian dalasi (GMD).

-- The service clock and counters (one row).
CREATE TABLE system_state (
  id              TINYINT     NOT NULL PRIMARY KEY,
  sim_date        DATE        NOT NULL,
  sim_minute      SMALLINT    NOT NULL,
  clock_running   BOOLEAN     NOT NULL,
  ticket_seq      INT         NOT NULL,
  state_version   BIGINT      NOT NULL,
  updated_at      TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Prices published by the Council (one row) and their history.
CREATE TABLE tariff (
  id               TINYINT NOT NULL PRIMARY KEY,
  daily_gmd        INT     NOT NULL,
  monthly_gmd      INT     NOT NULL,
  grace_days       INT     NOT NULL,
  wallet_limit_gmd INT     NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tariff_change (
  id            BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  changed_when  VARCHAR(40)  NOT NULL,
  description   VARCHAR(500) NOT NULL,
  authority     VARCHAR(255) NOT NULL,
  changed_by    VARCHAR(100) NOT NULL,
  recorded_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Every phone number ParkNa knows: drivers, attendants, organisation contacts.
CREATE TABLE subscriber (
  id                  BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  msisdn              VARCHAR(20)  NOT NULL,
  name                VARCHAR(120) NOT NULL,
  last_plate          VARCHAR(12)  NULL,
  pending_plate       VARCHAR(12)  NULL,
  pending_kind        VARCHAR(10)  NULL,
  last_sms_day        DATE         NULL,
  welcomed            BOOLEAN      NOT NULL,
  preferred_provider  VARCHAR(20)  NOT NULL,
  persona             BOOLEAN      NULL,
  persona_note        VARCHAR(120) NULL,
  created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_subscriber_msisdn (msisdn)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE subscriber_plate (
  msisdn    VARCHAR(20) NOT NULL,
  position  INT         NOT NULL,
  plate     VARCHAR(12) NOT NULL,
  PRIMARY KEY (msisdn, position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Simulated mobile-money balances (payments.mode=simulated). Real providers will replace this.
CREATE TABLE wallet (
  msisdn       VARCHAR(20) NOT NULL,
  position     INT         NOT NULL,
  provider     VARCHAR(20) NOT NULL,
  balance_gmd  INT         NOT NULL,
  PRIMARY KEY (msisdn, provider)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE receipt (
  id          BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  msisdn      VARCHAR(20)  NOT NULL,
  plate       VARCHAR(12)  NOT NULL,
  kind        VARCHAR(10)  NOT NULL,
  amount_gmd  INT          NOT NULL,
  provider    VARCHAR(20)  NOT NULL,
  when_label  VARCHAR(40)  NOT NULL,
  pay_day     DATE         NOT NULL,
  pay_time    CHAR(5)      NOT NULL,
  ticket      VARCHAR(20)  NOT NULL,
  valid_to    DATE         NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_receipt_msisdn (msisdn, id),
  KEY ix_receipt_ticket (ticket)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Every SMS in and out, plus the day headers of each phone's thread.
-- direction: MO = from the phone, MT = from ParkNa (out_id is its number in the outbox), DAY = thread day header.
CREATE TABLE sms_message (
  id          BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  msisdn      VARCHAR(20)  NOT NULL,
  direction   VARCHAR(3)   NOT NULL,
  body        TEXT         NULL,
  tag         VARCHAR(40)  NULL,
  sms_time    CHAR(5)      NULL,
  day_label   VARCHAR(20)  NULL,
  out_id      BIGINT       NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_sms_msisdn (msisdn, id),
  KEY ix_sms_out (out_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Number plates and their current passes.
CREATE TABLE plate (
  id                BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
  plate             VARCHAR(12) NOT NULL,
  daily_day         DATE        NULL,
  daily_ticket      VARCHAR(20) NULL,
  daily_time        CHAR(5)     NULL,
  daily_provider    VARCHAR(20) NULL,
  monthly_to        DATE        NULL,
  monthly_ticket    VARCHAR(20) NULL,
  monthly_provider  VARCHAR(20) NULL,
  updated_at        TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_plate (plate)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE plate_payer (
  plate     VARCHAR(12) NOT NULL,
  position  INT         NOT NULL,
  msisdn    VARCHAR(20) NOT NULL,
  PRIMARY KEY (plate, position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Money in: driver payments, failed attempts (failed=1, amount 0) and organisation invoice payments.
CREATE TABLE ledger_entry (
  id            BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  entry_day     DATE         NOT NULL,
  entry_time    CHAR(5)      NOT NULL,
  description   VARCHAR(255) NOT NULL,
  amount_label  VARCHAR(20)  NOT NULL,
  amount_gmd    INT          NOT NULL,
  source        VARCHAR(10)  NULL,
  plate         VARCHAR(12)  NULL,
  provider      VARCHAR(20)  NULL,
  ticket        VARCHAR(20)  NULL,
  msisdn        VARCHAR(20)  NULL,
  failed        BOOLEAN      NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_ledger_day (entry_day)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Parking attendants and their current shift.
CREATE TABLE officer (
  id               BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  msisdn           VARCHAR(20)  NOT NULL,
  attendant_id     VARCHAR(4)   NOT NULL,
  name             VARCHAR(120) NOT NULL,
  home_road        VARCHAR(3)   NOT NULL,
  shift_code       VARCHAR(2)   NOT NULL,
  staff_no         VARCHAR(40)  NOT NULL,
  supervisor       VARCHAR(120) NULL,
  active           BOOLEAN      NOT NULL,
  on_shift         BOOLEAN      NOT NULL,
  shift_start      SMALLINT     NULL,
  shift_day        DATE         NULL,
  last_sms_minute  SMALLINT     NULL,
  last_sms_day     DATE         NULL,
  stats_checked    INT          NULL,
  stats_paid       INT          NULL,
  stats_unpaid     INT          NULL,
  re_road          VARCHAR(3)   NULL,
  re_from          SMALLINT     NULL,
  re_day           DATE         NULL,
  summary_end      SMALLINT     NULL,
  summary_day      DATE         NULL,
  summary_checked  INT          NULL,
  summary_paid     INT          NULL,
  summary_unpaid   INT          NULL,
  summary_road     VARCHAR(3)   NULL,
  summary_auto     BOOLEAN      NULL,
  bg_rate          DOUBLE       NULL,
  bg_unpaid_rate   DOUBLE       NULL,
  bg_stop          SMALLINT     NULL,
  is_new           BOOLEAN      NULL,
  updated_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_officer_msisdn (msisdn)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE officer_check (
  id            BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
  check_day     DATE        NOT NULL,
  check_minute  SMALLINT    NOT NULL,
  plate         VARCHAR(12) NOT NULL,
  attendant_id  VARCHAR(4)  NOT NULL,
  road          VARCHAR(3)  NOT NULL,
  result        VARCHAR(10) NOT NULL,
  created_at    TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_check_day (check_day, road)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Organisations with fleet agreements, their plates, pending pro-rata charges and invoices.
CREATE TABLE organisation (
  id              BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  org_id          VARCHAR(10)  NOT NULL,
  name            VARCHAR(160) NOT NULL,
  contact_name    VARCHAR(120) NOT NULL,
  contact_msisdn  VARCHAR(20)  NOT NULL,
  discount        DOUBLE       NOT NULL,
  plates_agreed   DOUBLE       NOT NULL,
  status          VARCHAR(10)  NOT NULL,
  created_on      DATE         NOT NULL,
  grace_day       INT          NULL,
  updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_org (org_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE org_plate (
  org_id     VARCHAR(10)  NOT NULL,
  position   INT          NOT NULL,
  plate      VARCHAR(12)  NOT NULL,
  dept       VARCHAR(120) NOT NULL,
  driver     VARCHAR(120) NOT NULL,
  from_date  DATE         NOT NULL,
  to_date    DATE         NULL,
  PRIMARY KEY (org_id, position),
  KEY ix_org_plate (plate)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE org_topup (
  org_id       VARCHAR(10)  NOT NULL,
  position     INT          NOT NULL,
  description  VARCHAR(255) NOT NULL,
  amount_gmd   INT          NOT NULL,
  PRIMARY KEY (org_id, position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- position 0 is the newest invoice
CREATE TABLE invoice (
  org_id       VARCHAR(10) NOT NULL,
  position     INT         NOT NULL,
  invoice_no   VARCHAR(20) NOT NULL,
  month_label  VARCHAR(30) NOT NULL,
  issued_on    DATE        NOT NULL,
  due_on       DATE        NOT NULL,
  cover_end    DATE        NOT NULL,
  amount_gmd   INT         NOT NULL,
  status       VARCHAR(10) NOT NULL,
  method       VARCHAR(40) NULL,
  paid_on      DATE        NULL,
  proof_on     DATE        NULL,
  PRIMARY KEY (org_id, position),
  KEY ix_invoice_no (invoice_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE invoice_line (
  org_id            VARCHAR(10)  NOT NULL,
  invoice_position  INT          NOT NULL,
  position          INT          NOT NULL,
  description       VARCHAR(255) NOT NULL,
  amount_gmd        INT          NOT NULL,
  PRIMARY KEY (org_id, invoice_position, position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Cars shown in bays on the back-office map, and payment exceptions for finance.
CREATE TABLE park_bay (
  position       INT         NOT NULL PRIMARY KEY,
  road           VARCHAR(3)  NOT NULL,
  bay            VARCHAR(5)  NOT NULL,
  plate          VARCHAR(12) NOT NULL,
  driver_msisdn  VARCHAR(20) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE exception_case (
  position  INT          NOT NULL PRIMARY KEY,
  kind      VARCHAR(80)  NOT NULL,
  plate     VARCHAR(40)  NULL,
  detail    VARCHAR(500) NOT NULL,
  status    VARCHAR(20)  NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
