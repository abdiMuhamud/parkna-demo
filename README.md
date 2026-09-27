# ParkNa v0.2

ParkNa, the road-side parking service for Banjul City Council, built by INNOVII.

| Part | What it is | Where it runs |
|---|---|---|
| **Driver app** | Pay for a plate (daily or monthly) with Wave, Afrimoney, APS or QMoney; Council announcements on the home screen | Android APK `ParkNa-Driver-v0.2.apk` |
| **Officer app** | The parking attendant's SMS line: START, a plate, END | Android APK `ParkNa-Officer-v0.2.apk` |
| **Organisation portal** | Fleet plates, invoices and checks for a business | Browser: `https://<server>/org` |
| **Back office** | Attendants, roads, organisations, payments, tariffs, announcements | Browser: `https://<server>/admin` |

A payment in the driver app shows up on the attendant's line, in the organisation portal and in the back office straight away.

## How it is built

```
Phones and browsers ──HTTPS──► Nginx ── front end (static files)
                                  └── /api ──► Tomcat 10.1: parkna.war (Java 17) ──► MariaDB
                                                                  └──► Kannel (SMS, optional)
```

- **Front end on Nginx**: the landing page, back office and organisation portal (`frontend/`).
- **Back end on Tomcat**: `parkna.war`, which holds the business rules and writes to Tomcat's logs (`catalina.out`, `parkna.log`, `parkna-sms.log`).
- **MariaDB** stores everything. The back end creates and upgrades its tables itself.
- **Two property files** outside the WAR: `database.properties` (MariaDB connection) and `config.properties`
  (public address, clock, SMS through Kannel, later the payment providers). Templates are in `config/`.

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Server installation on Rocky Linux: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Getting a build

Every push builds and tests everything on GitHub (**Actions → Build ParkNa**). Each push to `main` also publishes a
release (**Releases**) with:

- `parkna-0.2.0-b<build>.tar.gz`: the server package (WAR, front end, config templates, deploy scripts, SQL)
- `ParkNa-Driver-v0.2.apk` and `ParkNa-Officer-v0.2.apk`

On each Android phone, open the APK and allow **Install unknown apps**. New builds install over old ones.

## Installing on a server

Follow [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): prepare Rocky Linux, install MariaDB, Java 17, Tomcat 10.1 and Nginx, fill in
the two property files, then run:

```bash
deploy/scripts/deploy.sh /home/sdf/deliverables/parkna-<version>.tar.gz
```

It backs up the database, keeps the running version for `rollback.sh`, puts the new front end and WAR live, and waits until the server answers.

## Connecting the apps

The first time each app opens, it asks for the **server address**. Enter the address with `https://`, e.g.
`https://parkna.example.gm`, and tap **Connect**. To change it later: **Account → Change server** in the driver app, or
**menu → Change server** on the officer line.

## Demo logins

**Drivers** (tap a name on the driver app sign-in screen, or type the number). Any 4 digits work as the wallet PIN.

| Number | Name | Story |
|---|---|---|
| 7012345 | Fatou | First time: adds her plate and pays |
| 3034567 | Isatou | Two plates: BJL5678, BJL2211 |
| 7023456 | Lamin | BJL1234, pays for a friend too |
| 3078901 | Omar | Monthly pass on BJL7777, due for renewal |
| 7055501 | Musa | BJL8080, not paid yet |
| 7045678 | Ebrima | BJL3030, low Wave balance (shows a failed payment) |
| 7089012 | Kebba | BJL7001, a Demo Bank work car |

**Parking officers** (pick one on the officer app sign-in screen):

| Attendant | Name | Number | Road and shift |
|---|---|---|---|
| 07 | Modou Jallow | 7300007 | Wellington Road, 7am to 1pm |
| 12 | Awa Sarr | 7300012 | Wellington Road, 1pm to 7pm |

On the line, send `START`, then plates such as `BJL1234` (paid), `BJL9191` (unpaid) or `BJL7001` (organisation), then `END`.

**Organisation portal:** contact phone `7101234` (Mariama S., Demo Bank), code `482913`.

**Back office:** opens signed in as Aisha K., ParkNa Admin.

## Running the demo

The back office has a **Demo clock** bar at the bottom:

- `−1h`, `+1h`, `07:00`, `10:00`, `19:20`: move the time of day (paid hours are 7am to 7pm, Monday to Saturday).
- `Next day`: moves to the next day and resets the day's shifts.
- `Pause` / `Run`: stops or starts the clock.
- `+ Exception`: records a wrong-plate payment on the latest payment.
- `Reset demo`: returns every phone and portal to the starting story (deletes all data; switch the demo controls off on a real server).

A suggested order:

1. **Driver** Musa pays BJL8080 with Afrimoney.
2. **Officer** Modou sends START, then BJL8080 (PAID), BJL9191 (UNPAID) and BJL7001 (organisation).
3. **Organisation portal**: Demo Bank sees BJL7001 checked at that time.
4. **Back office**: the payment, the checks and the attendant's shift are live; reassign Modou to another road and his line gets the SMS.
5. **Driver** Ebrima tries Wave with a low balance, then pays with another provider.
6. **Back office → Announcements**: publish an event (e.g. a clean-up day). It appears at once as a banner on the driver app's home screen; **Hide** takes it down.

## Pilot rules

- One price for every plate: GMD 200 a day or GMD 4,420 a month.
- Paid hours: 7am to 7pm, Monday to Saturday.
- No fines and no clamping during the pilot.
- Organisations are invoiced on the 25th, due on the 1st, with 5 days' grace; after that their plates revert to normal pricing.
- Revenue share: 60% Council, 40% operator.
- Shortcode 7275 is a placeholder.

## Repository layout

```
frontend/portal/      landing page, back office (admin.html), organisation portal (org.html)
frontend/shared/      engine.js (read-side rules the screens use), client.js, fonts, images
apps/driver/          driver app (Capacitor): www/ is the app, res/ the icon and splash
apps/officer/         officer app (Capacitor)
backend/              Java back end (Maven, WAR for Tomcat 10.1): rules engine, MariaDB, API, SMS gateway
config/               database.properties and config.properties templates
deploy/               Nginx, Tomcat and Kannel files; deploy, rollback and backup scripts
docs/                 ARCHITECTURE.md, DEPLOYMENT.md
scripts/              build-frontend.js, prepare-android.js, package-release.sh, parity/ (engine parity tests)
build/                the shared signing key used by the APK builds
.github/workflows/    the build
```

## Developing

Needs Node.js 22, Java 17 and Maven. For the database tests, a MariaDB with an empty test database.

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

### Building the APKs on your own computer

Needs Node.js 22, Java 21 and the Android SDK.

```bash
node scripts/build-frontend.js
cd apps/driver                                         # or apps/officer
npm install
npx cap add android
node ../../scripts/prepare-android.js 0.2 1            # icons, version, text size cap
npx cap sync android
cd android && ./gradlew assembleDebug
```

The apps follow the phone's font size setting only up to 100%, because the screens are laid out for that size.
To allow bigger text, raise `MAX_TEXT_ZOOM` in `scripts/prepare-android.js`.

---

INNOVII · ParkNa v0.2
