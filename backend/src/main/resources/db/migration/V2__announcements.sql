-- Council events and announcements shown as a banner on the driver app's home screen.
-- position 0 is the newest.
CREATE TABLE announcement (
  announcement_id  VARCHAR(10)  NOT NULL PRIMARY KEY,
  position         INT          NOT NULL,
  kind             VARCHAR(20)  NOT NULL,
  title            VARCHAR(60)  NOT NULL,
  body             VARCHAR(180) NOT NULL,
  when_label       VARCHAR(40)  NOT NULL,
  link             VARCHAR(200) NOT NULL,
  theme            VARCHAR(10)  NOT NULL,
  show_from        DATE         NOT NULL,
  show_to          DATE         NOT NULL,
  status           VARCHAR(10)  NOT NULL,
  created_on       DATE         NOT NULL,
  created_by       VARCHAR(120) NOT NULL,
  KEY ix_announcement_position (position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
