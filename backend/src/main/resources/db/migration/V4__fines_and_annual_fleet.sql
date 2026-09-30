-- ParkNa 1.1: warnings and fines for unpaid cars, organisations paying upfront per car per year.

-- Warnings attendants issue to unpaid cars. The daily fee (base_gmd) is due within 24 hours of
-- fine_day + fine_minute; after that fine_gmd is added. status: open, paid or cancelled.
CREATE TABLE fine (
  id              BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  fine_id         VARCHAR(12)  NOT NULL,
  plate           VARCHAR(12)  NOT NULL,
  fine_day        DATE         NOT NULL,
  fine_minute     SMALLINT     NOT NULL,
  road            VARCHAR(3)   NOT NULL,
  attendant_id    VARCHAR(4)   NOT NULL,
  base_gmd        INT          NOT NULL,
  fine_gmd        INT          NOT NULL,
  status          VARCHAR(10)  NOT NULL,
  settled_day     DATE         NULL,
  settled_time    CHAR(5)      NULL,
  settled_gmd     INT          NULL,
  settled_late    BOOLEAN      NULL,
  settled_method  VARCHAR(120) NULL,
  settled_ticket  VARCHAR(20)  NULL,
  settled_msisdn  VARCHAR(20)  NULL,
  note            VARCHAR(255) NULL,
  updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_fine (fine_id),
  KEY ix_fine_plate (plate, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Organisation cars for a year, and the fine added to the daily fee after 24 hours.
ALTER TABLE tariff
  ADD COLUMN annual_gmd INT NOT NULL DEFAULT 53040 AFTER monthly_gmd,
  ADD COLUMN fine_gmd   INT NOT NULL DEFAULT 100 AFTER annual_gmd;

-- The paid year of an organisation: every covered car ends on cover_to.
ALTER TABLE organisation
  ADD COLUMN cover_from DATE NULL AFTER created_on,
  ADD COLUMN cover_to   DATE NULL AFTER cover_from;

-- A car waiting on an unpaid invoice has no from_date yet.
ALTER TABLE org_plate MODIFY from_date DATE NULL;

-- kind: annual (opening year), addon (cars added later), renewal; monthly for invoices from before 1.1.
-- plate_list: the cars the invoice pays for, comma-separated.
ALTER TABLE invoice
  ADD COLUMN kind       VARCHAR(10) NOT NULL DEFAULT 'monthly' AFTER invoice_no,
  ADD COLUMN plate_list TEXT        NULL AFTER cover_end,
  MODIFY status VARCHAR(10) NOT NULL;

-- Organisations from before 1.1 stay covered to the end of their last paid month.
UPDATE organisation o
   SET cover_to   = (SELECT MAX(i.cover_end) FROM invoice i WHERE i.org_id = o.org_id AND i.status = 'paid'),
       cover_from = o.created_on;
