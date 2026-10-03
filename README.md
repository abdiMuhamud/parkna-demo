# SUNU Park 1.0

SUNU Park, the road-side parking service for Banjul City Council, built by INNOVII.

| Part | What it is | Where it runs |
|---|---|---|
| **SUNU Park** (driver app) | Sign in with a phone number, add plates, see if a plate is covered, receipts, Council announcements. Paying by mobile money opens when the providers are connected | Android, Google Play (`com.innovii.parkna.driver`) |
| **SUNU Park Officer** | The parking attendant's app: start and end a shift, check a plate (PAID / NOT PAID), messages | Android, Google Play (`com.innovii.parkna.officer`) |
| **SMS and USSD** | Drivers text their plate to the short code or dial `*7275#`; attendants text START, a plate, END | Any phone |
| **Home page** | How to pay (app, SMS, USSD), prices from the tariff, and the three portal sign-ins | Browser: `https://<server>/` |
| **Back office** | Administrators: attendants, roads, organisations, payments, tariffs, announcements, terms, staff accounts and the audit log | Browser: `https://<server>/admin` |
| **Organisation portal** | Fleet plates, invoices, attendant checks for a business | Browser: `https://<server>/org` |
| **Police** | Fines tracking: unpaid warnings, overdue fines, repeat offenders (read-only) | Browser: `https://<server>/police` |

An attendant's check, an organisation's new plate or a Council announcement reaches every screen straight away.

**Sign-in.** Three kinds of people sign in to the web portal:

| Who | Where | How |
|---|---|---|
| Administrator | `/admin` | Username and password: everything, including staff accounts, tariffs, the terms, announcements and organisations |
| Organisation | `/org` | The billing contact's phone number and a 6-digit code sent by SMS: its own fleet only |
| Police | `/police` | Username and password: Fines tracking, read-only |

Drivers and parking attendants don't use the web: they sign in to the apps with their phone number and an SMS code, or
use SMS and USSD. Administrators make the administrator and police accounts in **Staff & audit**. (Supervisor, Finance
and Council accounts made before 1.3 keep working with their old pages; no new ones are made.)

Every sign-in and every change in the back office is written to the audit log with the person's name. Phones only ever
receive their own data: a driver sees their plates and receipts, an attendant their shift and checks, an organisation its fleet.

## How it is built

```
Phones and browsers ──HTTPS──► Nginx ── front end (static files)
                                  └── /api ──► Tomcat 10.1: parkna.war (Java 17) ──► MariaDB
                                                                  └──► Kannel (SMS, optional)
```

- **Front end on Nginx**: the home page, back office, police sign-in and organisation portal (`frontend/`).
- **Back end on Tomcat**: `parkna.war`, which holds the business rules and writes to Tomcat's logs (`catalina.out`, `parkna.log`, `parkna-sms.log`).
- **MariaDB** stores everything. The back end creates and upgrades its tables itself.
- **Two property files** outside the WAR: `database.properties` (MariaDB connection) and `config.properties`
  (production or demo mode, public address, SMS through Kannel, sign-in, support contacts, bank details for
  organisation invoices, later the payment providers). Templates are in `config/`.

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Server installation on Rocky Linux: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Getting a build

Every push builds and tests everything on GitHub (**Actions → Build SUNU Park**). Each push to `main` also publishes a
release (**Releases**) with its own, always higher, release number: the `VERSION` file plus the build number, e.g.
`1.1.23`. The apps (sign-in screen and Profile), the home page, the back office and `/api/health` show that number.

- `parkna-1.1.<build>.tar.gz`: the server package (WAR, front end, config templates, deploy scripts, SQL)
- `SUNU-Park-Driver-1.1.<build>.aab` and `SUNU-Park-Officer-1.1.<build>.aab`: for Google Play, and `.apk` files of the same builds to
  install directly on a phone. Until the Play upload key is added to the repository secrets, the build makes
  `...-test.apk` files instead (signed with the shared test key; they install over each other).
- `SUNU-Park-Driver.apk` and `SUNU-Park-Officer.apk`: the same apps under fixed names, so
  `.../releases/latest/download/SUNU-Park-Driver.apk` is always the newest (a demo server's home page links there;
  `apps.driver.url` / `apps.officer.url` in `config.properties` change it, a production server links to Google Play).

## Installing on a server

Follow [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): prepare Rocky Linux, install MariaDB, Java 17, Tomcat 10.1 and Nginx, fill in
the two property files, then run:

```bash
deploy/scripts/deploy.sh /home/sdf/deliverables/parkna-<version>.tar.gz
```

It backs up the database, keeps the running version for `rollback.sh`, puts the new front end and WAR live, and waits
until the server answers. A production server starts empty; the first administrator's password is written once to
`parkna.log`. The go-live checklist is section 11 of the runbook.

## Google Play

[docs/PLAY_STORE.md](docs/PLAY_STORE.md): the upload key and repository secrets, the server address built into the
apps, the store listings (texts, icons, feature graphics and screenshots are in `store/`), Data safety answers and
sign-in details for Google's reviewers. The privacy policy is served at `https://<server>/privacy.html`.

## Demo servers

A server with `app.mode=demo` loads the demo story: sample drivers, attendants and Demo Bank, a movable clock and
pretend wallets (no money moves). Sign-in codes are shown on screen instead of being sent by SMS. Use it for training
and presentations, never for real data.

**Drivers** (tap a name under *Demo accounts* on the driver app sign-in screen):

| Number | Name | Story |
|---|---|---|
| 7012345 | Fatou | First time: adds her plate and pays |
| 3034567 | Isatou | Two plates: BJL5678, BJL2211 |
| 7023456 | Lamin | BJL1234, pays for a friend too |
| 3078901 | Omar | Monthly pass on BJL7777, due for renewal |
| 7055501 | Musa | BJL8080, not paid yet |
| 7045678 | Ebrima | BJL3030, low Wave balance (shows a failed payment) |
| 7089012 | Kebba | BJL7001, a Demo Bank work car |

**Parking attendants** (tap one on the SUNU Park Officer sign-in screen):

| Attendant | Name | Number | Road and shift |
|---|---|---|---|
| 07 | Modou Jallow | 7300007 | Wellington Road, 7am to 1pm |
| 12 | Awa Sarr | 7300012 | Wellington Road, 1pm to 7pm |

Start the shift, then check plates such as `BJL1234` (paid), `BJL9191` (unpaid) or `BJL7001` (organisation).

**Organisation portal:** contact phone `7101234` (Mariama S., Demo Bank); the code appears on screen.

**Back office:** `admin` and the password written to `parkna.log` at the first start; add staff accounts for the
other roles in **Staff & audit**.

## Running the demo

On a demo server, administrators get a **Demo clock** bar at the bottom of the back office:

- `−1h`, `+1h`, `07:00`, `10:00`, `19:20`: move the time of day (paid hours are 7am to 7pm, Monday to Saturday).
- `Next day`: moves to the next day and resets the day's shifts.
- `Pause` / `Run`: stops or starts the clock.
- `+ Exception`: records a wrong-plate payment on the latest payment.
- `Reset demo`: returns every phone and portal to the starting story (deletes all data; switch the demo controls off on a real server).

A suggested order:

1. **Driver** Musa pays BJL8080 with Afrimoney.
2. **Attendant** Modou starts his shift, then checks BJL8080 (PAID), BJL9191 (NOT PAID) and BJL7001 (organisation).
3. **Organisation portal**: Demo Bank sees BJL7001 checked at that time.
4. **Back office**: the payment, the checks and the attendant's shift are live; reassign Modou to another road and his line gets the SMS.
5. **Driver** Ebrima tries Wave with a low balance, then pays with another provider.
6. **Back office → Announcements**: publish an event (e.g. a clean-up day). It appears at once as a banner on the driver app's home screen; **Hide** takes it down.

## Pilot rules

SUNU Park ("our park / our parking", the platform name confirmed by BCC; called ParkNa before 1.2).

- One price for every plate: GMD 200 a day or GMD 4,000 a month (20 paid days: 5 days a week instead of 6). Hourly parking is in the terms but not offered yet.
- Paid hours: 7am to 7pm, Monday to Saturday.
- Warnings: an attendant issues a warning to a car parked without paying (in the Officer app, or `W BJL1234` by SMS).
  The driver gets an SMS and an in-app notice and pays the GMD 200 daily fee within 24 hours; after that it is
  GMD 2,080 (the GMD 1,880 fine for rule breakers is added). A warning is paid before any new pass, in the app or by
  texting the plate, and a driver with an unpaid warning on any of their plates settles it before paying for another.
  An administrator can record one paid at the Council office. No clamping. Attendants and the police see whether a plate is a
  first-time or repeat offender.
- Everyone accepts the terms and conditions (`/terms.html`, and in the apps, which must be read to the end before
  signing in). They list all fee models: hourly (not offered yet), daily and monthly.
- Organisations pay upfront for a year per car (GMD 48,000 less their discount). Cars are covered from the day the
  invoice is paid; cars added later pay the months left, so every car ends on the same date. The renewal invoice
  comes 30 days before the year ends, with 5 days' grace; after that the cars revert to normal pricing.
- The police follow up unpaid fines in the back office (*Fines tracking*, role Police): overdue warnings, repeat
  offenders and the phone linked to each plate.
- SMS & USSD simulator at `/sms` (no sign-in; demo and test servers): text the short code or dial `*7275#` as any
  driver, attendant or organisation contact, with 18 ready-made use cases (`sms.simulator.enabled`). Real USSD
  gateways call `POST /api/ussd`.
- Police sign in at `/police` (the Police card on the home page); on a demo server as `police` / `police-demo`.
- Revenue share: 60% Council, 40% operator.
- SMS shortcode: `sms.shortcode` in `config.properties` (7275 until the operator confirms the number).

## Repository layout

```
frontend/portal/      home page, back office (admin.html), police sign-in (police.html), organisation portal (org.html)
frontend/shared/      engine.js (read-side rules the screens use), client.js, fonts, images
frontend/shared/      also ui.css / ui.js: the apps' design system (Plus Jakarta Sans, pale blue, SUNU Park navy, sun yellow; Banjul art in img/art)
apps/driver/          driver app (Capacitor): www/ is the app, res/ the icon and splash
apps/officer/         attendant app (Capacitor)
store/                Google Play graphics: icons, feature graphics, phone screenshots
backend/              Java back end (Maven, WAR for Tomcat 10.1): rules engine, MariaDB, API, SMS gateway
config/               database.properties and config.properties templates
deploy/               Nginx, Tomcat and Kannel files; deploy, rollback and backup scripts
docs/                 ARCHITECTURE.md, DEPLOYMENT.md, PLAY_STORE.md
scripts/              build-frontend.js, prepare-android.js, package-release.sh, parity/ (engine parity tests),
                      art/make-art.js (draws the icons, splash screens and Play graphics)
build/                the shared test signing key (test builds only; Play builds use the upload key from the secrets)
.github/workflows/    the build
```

## Developing

Needs Node.js 22, Java 17 and Maven. For the database tests, a MariaDB with an empty test database.

The quick way (the same checks as GitHub; a MariaDB user `parkna_test` / `test-pass` with rights on `parkna_%`):

```bash
scripts/qa.sh             # JavaScript syntax, parity runs, every back-end test (about 40 s)
scripts/e2e/run.sh        # the real server + the browser tests in scripts/e2e/tests (about 3 min, Playwright needed)
```

Automations:
- **GitHub, every push**: back end and parity tests, both apps, and the browser tests (simulator use cases, apps,
  back office, police, terms; screenshots kept as the `browser-tests` artifact). A failure blocks the release; every
  merge to `main` publishes a release.
- **CodeQL** security scanning (Java and JavaScript) on pull requests, on `main` and every Monday; **Dependabot**
  opens weekly update PRs for Maven, Capacitor and the GitHub actions.
- **Claude Code on the web**: `.claude/hooks/session-start.sh` installs and starts MariaDB, caches Maven and Tomcat;
  `CLAUDE.md` has the project rules and `/release` ships work (checks, PR, merge, release, upgrade commands).

```bash
node scripts/build-frontend.js                         # frontend/dist and the apps' shared files
cd backend && mvn package                              # parkna.war (unit tests only)

# the full tests, as on GitHub:
node scripts/parity/generate.js backend/target/parity 3 1000
cd backend && mvn verify -Dparity.dir=target/parity \
  -Dtest.db.url=jdbc:mariadb://127.0.0.1:3306/parkna_test -Dtest.db.username=parkna_test -Dtest.db.password=<password>

scripts/package-release.sh                             # dist/parkna-<version>.tar.gz
```

A business rule lives in the Java engine (`backend/.../engine/ParkingEngine.java`), which decides, and in
`frontend/shared/engine.js`, which the screens use to read the state. Change both, add the new case to
`scripts/parity/generate.js`, and the parity tests check that they agree. A database change is a new
`backend/src/main/resources/db/migration/V<n>__name.sql`, added to `index.txt`.

### Building the apps on your own computer

Needs Node.js 22, Java 21 and the Android SDK.

```bash
PARKNA_SERVER_URL=https://parkna.example.gm node scripts/build-frontend.js   # leave it out to ask on first start
cd apps/driver                                         # or apps/officer
npm install
npx cap add android
npx cap sync android
PARKNA_SERVER_URL=https://parkna.example.gm node ../../scripts/prepare-android.js 1.0 1   # after every sync
cd android && ./gradlew assembleDebug                  # or bundleRelease with the PARKNA_KEY* variables, see docs/PLAY_STORE.md
```

The apps follow the phone's font size setting only up to 100%, because the screens are laid out for that size.
To allow bigger text, raise `MAX_TEXT_ZOOM` in `scripts/prepare-android.js`.

---

INNOVII · SUNU Park 1.0
