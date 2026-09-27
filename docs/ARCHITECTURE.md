# ParkNa architecture

```
 Driver app (APK) ─┐                                   ┌──────────────── Tomcat 10.1 ─────────────────┐
 Officer app (APK)─┤  HTTPS   ┌──────── Nginx ───────┐ │ parkna.war                                   │
 Back office  ─────┼────────► │ static front end     │ │  ApiServlet  /api/ping state events act      │
 Org portal   ─────┘          │ /api/* ─────────────►├─┤  ParknaService  one action at a time         │
                              └──────────────────────┘ │    ParkingEngine  business rules              │
                                                       │    StateRepository ──JDBC──► MariaDB          │
                                                       │    SmsGateway ──HTTP──► Kannel ──► SMSC       │
                                                       └───────────────────────────────────────────────┘
```

## The parts

| Folder | What it is | Runs on |
|---|---|---|
| `frontend/portal/` | Landing page, back office (`admin.html`), organisation portal (`org.html`) and their JS/CSS | Nginx |
| `frontend/shared/` | `client.js` (server connection), `engine.js` (read-side rules the screens use), fonts, images | Nginx and inside the APKs |
| `apps/driver`, `apps/officer` | Capacitor apps: `www/` is the app, `res/` the icons and splash | Android |
| `backend/` | Java 17 Maven project, packaged as `parkna.war` | Tomcat 10.1 |
| `config/` | Templates for the two property files | copied to the server |
| `deploy/` | Nginx, Tomcat, Kannel files; deploy, rollback and backup scripts | the server |
| `scripts/` | `build-frontend.js`, `prepare-android.js`, `package-release.sh`, `parity/generate.js` | build machine / CI |

`scripts/build-frontend.js` builds `frontend/dist/` (the Nginx document root: portal pages, shared files, and the two apps
for use in a browser) and copies the shared files into `apps/*/www`. `scripts/package-release.sh` bundles the WAR, the
front end, the config templates, `deploy/`, the SQL and these docs into `dist/parkna-<version>.tar.gz`.

## How a request flows

Every screen talks to the server through four endpoints, unchanged since v0.1:

| Endpoint | Use |
|---|---|
| `GET /api/ping` | "Is this a ParkNa server?" (the apps' Connect button) |
| `GET /api/state` | The whole state as JSON |
| `GET /api/events` | Server-Sent Events: the whole state again after every change |
| `POST /api/act` | One action, e.g. `{"type":"driver.pay","num":"7012345","plate":"BJL1234","prov":"Wave"}` |
| `GET /api/health` | For monitoring: 200 when MariaDB answers, 503 if not |
| `GET /api/sms/mo` | Incoming SMS from Kannel (allowed IPs only; Nginx blocks it) |

For `POST /api/act`, `ParknaService`:
1. takes the lock (one action at a time, like the v0.1 server),
2. runs `ParkingEngine.act()`, which changes the in-memory state and records what it touched in `Changes`,
3. saves exactly those changes to MariaDB in one transaction (if the save fails, it reloads from the database, so the action is undone, and answers with an error),
4. hands new outgoing SMS to the SMS gateway and the new state to every open screen,
5. answers the screen that asked.

The whole state is loaded from MariaDB into memory at start-up (the pilot's data is small). MariaDB is the record; memory is the working copy.

## Business rules live in two places, on purpose

`backend/.../engine/ParkingEngine.java` is **the** rules engine: it decides and records everything. The screens also load
`frontend/shared/engine.js`, the original v0.1 engine, to *read* the state the same way (plate status, shift figures,
cover dates). The two must agree, so:

- **Parity tests** (`scripts/parity/generate.js` + `ParityTest`) run thousands of recorded actions through the JS engine and
  check that the Java engine gives the same answer and the same full state after every step.
- **Database round-trip test** (`DatabaseRoundTripTest`) replays the same runs, saves after every step and restarts from
  MariaDB every 25 steps; the results must still match. This catches any change that is not saved.

When you change a rule, change it in both engines and run the tests (see the README).

## Data

Tables (see `backend/src/main/resources/db/migration/`):

| Table | Holds |
|---|---|
| `system_state` | The service clock (day and minute), ticket counter, state version |
| `tariff`, `tariff_change` | Prices and their history |
| `subscriber`, `subscriber_plate`, `wallet`, `receipt` | Phone numbers (drivers, attendants, org contacts), their plates, simulated wallet balances, receipts |
| `sms_message` | Every SMS in (MO) and out (MT), plus thread day headers |
| `plate`, `plate_payer` | Plates, their daily/monthly passes, who paid |
| `ledger_entry` | Payments in, failed attempts, organisation invoice payments |
| `officer`, `officer_check` | Attendants, their shift, every plate check |
| `organisation`, `org_plate`, `org_topup`, `invoice`, `invoice_line` | Fleet accounts and billing |
| `park_bay`, `exception_case` | Back-office map, payment exceptions |
| `announcement` | Council events and notices shown on the driver app's home screen |
| `schema_version` | Which migrations have run |

Schema changes are new files `V<n>__description.sql` listed in `index.txt`. They run once, in order, at start-up
(`db.migrate=true`), or by hand.

## Configuration

Two property files outside the WAR, in the folder given by `-Dparkna.config.dir` (set in Tomcat's `setenv.sh`):
`database.properties` (MariaDB) and `config.properties` (public address, clock mode, demo controls, SMS gateway, and later
the payment providers). See `config/*.example` for every setting.

- **Clock.** `clock.mode=demo` runs the demo clock (it starts on 2 Nov 2026 and the back office can move it). `clock.mode=real` follows
  the time in `clock.timezone` and runs the end-of-day rules (pass reminders, invoices, grace periods) at midnight.
- **SMS.** `sms.gateway=simulated` shows SMS only on screens; `kannel` also sends them through Kannel's `sendsms` and takes
  incoming SMS on `/api/sms/mo`. New gateways implement `SmsGateway`.

## Logging

Log4j 2 (`backend/src/main/resources/log4j2.xml`) writes to the console (Tomcat's `catalina.out`) and to `parkna.log` and
`parkna-sms.log` in Tomcat's `logs` folder. Every action is one line: type, who, result and time taken.

## Council announcements

The back office's **Announcements** page creates banners (Event, Announcement or Notice; title, text, optional date line and
link; colour; show-from and until dates). The driver app shows the ones live today as a swipeable banner on the home
screen, under the payment buttons. Actions: `back.announce`, `back.announceStatus` (hide/show), `back.announceDelete`.

## Known gaps

- No sign-in for the back office and organisation portal, and no authentication on the API. Needed before real use.
- Payments are simulated wallets. Wave, Afrimoney, APS and QMoney integrations will need a `PaymentProvider` like `SmsGateway`.
- Announcement banners are text only (no uploaded images yet).
