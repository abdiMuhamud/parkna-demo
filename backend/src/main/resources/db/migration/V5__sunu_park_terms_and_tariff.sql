-- SUNU Park 1.2: the agreed points with Banjul City Council, and the terms and conditions in the apps.

-- The terms and conditions a phone number accepted in the app: which version, and when.
ALTER TABLE subscriber
  ADD COLUMN terms_version VARCHAR(20) NULL AFTER persona_note,
  ADD COLUMN terms_day     DATE        NULL AFTER terms_version,
  ADD COLUMN terms_time    CHAR(5)     NULL AFTER terms_day;

-- Agreed points: monthly 4,000 GMD (20 paid days), a 1,880 GMD fine for rule breakers, and organisations at twelve
-- months of the monthly price. Only a tariff still at the 1.1 starting prices changes; one the Council already
-- changed in the back office stays as it is. The change goes into the tariff history like any other.
INSERT INTO tariff_change (changed_when, description, authority, changed_by)
SELECT DATE_FORMAT(NOW(), '%e %b %Y %H:%i'),
       'Agreed points: monthly 4,420 → 4,000 GMD (20 paid days: 5 days a week instead of 6); fine 100 → 1,880 GMD for rule breakers; organisations 53,040 → 48,000 GMD a car a year. Platform name: SUNU Park.',
       'Agreed points with Banjul City Council', 'System (upgrade to SUNU Park 1.2)'
  FROM tariff WHERE id = 1 AND daily_gmd = 200 AND monthly_gmd = 4420 AND fine_gmd = 100 AND annual_gmd = 53040;

UPDATE tariff SET monthly_gmd = 4000, fine_gmd = 1880, annual_gmd = 48000
 WHERE id = 1 AND daily_gmd = 200 AND monthly_gmd = 4420 AND fine_gmd = 100 AND annual_gmd = 53040;

-- The terms and conditions, as administrators publish them in the back office. The newest version is the one in
-- force: the apps ask everyone to read and accept it again. With no row yet, the built-in first version applies.
CREATE TABLE terms_version (
  id            BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  version       INT          NOT NULL,
  title         VARCHAR(120) NOT NULL,
  body          MEDIUMTEXT   NOT NULL,
  change_note   VARCHAR(300) NULL,
  published_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_by  VARCHAR(100) NOT NULL,
  UNIQUE KEY uk_terms_version (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
