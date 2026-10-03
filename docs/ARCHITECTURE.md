# SUNU Park architecture

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
| `frontend/portal/` | Home page, back office (`admin.html`), police sign-in (`police.html`, the same page), organisation portal (`org.html`), SMS & USSD simulator (`sms.html`), terms, and their JS/CSS | Nginx |
| `frontend/shared/` | `client.js` (server connection and sign-in), `engine.js` (read-side rules the screens use), `ui.css` / `ui.js` (the apps' design system), fonts, images | Nginx and inside the apps |
| `apps/driver`, `apps/officer` | Capacitor apps: `www/` is the app, `res/` the icons and splash | Android |
| `backend/` | Java 17 Maven project, packaged as `parkna.war` | Tomcat 10.1 |
| `config/` | Templates for the two property files | copied to the server |
| `deploy/` | Nginx, Tomcat, Kannel files; deploy, rollback and backup scripts | the server |
| `scripts/` | `build-frontend.js`, `prepare-android.js`, `package-release.sh`, `parity/generate.js` | build machine / CI |

`scripts/build-frontend.js` builds `frontend/dist/` (the Nginx document root: portal pages, shared files, and the two apps
for use in a browser) and copies the shared files into `apps/*/www`. `scripts/package-release.sh` bundles the WAR, the
front end, the config templates, `deploy/`, the SQL and these docs into `dist/parkna-<version>.tar.gz`.

## How a request flows

| Endpoint | Signed in? | Use |
|---|---|---|
| `GET /api/ping` | no | "Is this a SUNU Park server?", its version, mode and public settings (shortcode, daily price, support contact) |
| `GET /api/health` | no | For monitoring: 200 when MariaDB answers, 503 if not |
| `POST /api/auth/code`, `/api/auth/verify` | no | Phone sign-in: send a 6-digit SMS code, check it, get a session token |
| `POST /api/auth/staff` | no | Back-office sign-in with username and password |
| `GET /api/state` | yes | This person's view of the state as JSON |
| `POST /api/auth/ticket`, `GET /api/events?ticket=` | yes | Server-Sent Events: this person's view again after every change (a one-time ticket, because EventSource cannot send headers) |
| `POST /api/act` | yes | One action, e.g. `{"type":"driver.addPlate","plate":"BJL1234"}` |
| `GET/POST /api/staff`, `/api/staff/update`, `GET /api/audit` | administrators | Staff accounts and the audit log |
| `POST /api/auth/password`, `/api/auth/logout` | yes | Change password, sign out |
| `GET /api/sms/mo` | Kannel's address | Incoming SMS (allowed IPs only; Nginx blocks it) |

**Sign-in and sessions** (`auth/AuthService`). Phones (drivers, attendants, organisation contacts) sign in with a code sent
by SMS: 6 digits, valid 5 minutes, 5 tries, at most one code per 30 seconds and 3 per 10 minutes for a number, 30 an hour
from one address. Attendants must be registered and organisation contacts must be on an account before a code is sent.
Staff passwords are PBKDF2-SHA256 (600,000 rounds); 5 wrong passwords lock the account for 15 minutes; a new account
or a reset gives a temporary password that must be changed at the first sign-in. The session token is a random 256-bit
value kept on the device; the database stores only its SHA-256. Phone sessions last 180 days and renew while used; staff
sessions end after 12 hours. Changing a staff member's role, switching them off or resetting their password signs them
out everywhere; open screens are disconnected within a minute. Every sign-in and back-office change goes to `audit_log`.

**Who sees what** (`service/Views`). Staff receive the full state. A driver receives only their own number, plates,
receipts, messages and the checks on their plates; an attendant their own shift, checks and road; an organisation its own
account, fleet and invoices. Nobody but staff receives other people's phone numbers (`payers` are removed). Every view
starts with `ME` (who is signed in) and `MODE` (production or demo, payments on or off, ...).

**Who may do what** (`ParknaService.ALLOWED`). The server fills in the phone number or organisation from the session, so
a person can only act as themselves: drivers `driver.*`, attendants the SMS line, organisations `org.*` on their own
account; staff actions follow the role. The portal has three kinds of users: administrators (`/admin`), the police
(`/police`, read-only) and organisations (`/org`, an SMS code); new staff accounts are administrators or police
(`Role.portalStaffRole`). Supervisor, Finance and Council accounts made earlier keep their old pages and rights.

For `POST /api/act`, `ParknaService`:
1. checks the session and the role, then takes the lock (one action at a time, like the v0.1 server),
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
`database.properties` (MariaDB) and `config.properties` (mode, public address, SMS gateway, sign-in, payments, support
contact, bank details, and later the payment providers). See `config/*.example` for every setting.

- **Mode.** `app.mode=production` starts from an empty database on the real clock, with payments off and no demo
  controls, and creates the first `admin` account (password written once to `parkna.log`). `app.mode=demo` loads the demo
  story with the demo clock and simulated wallets.
- **Clock.** Real time in `clock.timezone` (production): the end-of-day rules (pass reminders, invoices, grace periods)
  run at midnight. The demo clock starts on 2 Nov 2026 and administrators can move it from the back office.
- **Payments.** `payments.mode=off` (production default): the apps say mobile money opens soon; organisations pay invoices
  by bank transfer, which an administrator matches. `simulated`: pretend wallets, for demo and test servers.
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

- Mobile-money payments are not connected yet. Wave, Afrimoney, APS and QMoney will need a `PaymentProvider` like
  `SmsGateway`, with their payment confirmations (callbacks) checked on the server.
- Roads and bays are fixed in the engine (the five pilot roads). Adding a road is a code change.
- Organisations report a bank transfer; there is no upload of a proof document yet.
- Announcement banners are text only (no uploaded images yet).
