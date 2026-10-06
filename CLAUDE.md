# SUNU Park (repo: parkna-demo)

Street parking for Banjul City Council, run by INNOVII: a driver app and an attendant (officer) app for Android
(Capacitor), an SMS line and a USSD menu (short code 7275), a web portal, a Java back end on Tomcat 10.1 with MariaDB.
The portal has exactly four kinds of users: Administrator (`/admin`), Organisation (`/org`, SMS code), Police
(`/police`, read-only fines tracking) and Council (`/council`, read-only revenue report). Drivers and parking attendants use the apps, SMS and USSD only (the browser
copies in `frontend/dist/driver|officer` are for the tests and are not shipped). New staff accounts are Administrator, Police or
Council (`Role.portalStaffRole`); older Supervisor/Finance accounts still work. Demo servers have `police` / `police-demo`
and `council` / `council-demo`. Called ParkNa before 1.2: internal names (`parkna`
database, `parkna.war`, `/home/sdf/parkna`, the `tomcat-parkna` service, the Android app IDs) stay as they are;
everything people see says SUNU Park.

## Layout
- `frontend/shared/engine.js`: the business rules in JavaScript (reads in every client, and the parity reference).
- `backend/.../engine/ParkingEngine.java`: the same rules on the server. **Both engines must change together**:
  `scripts/parity/generate.js` records JS runs (add story steps for new rules) and `ParityTest` replays them in Java.
- `backend/.../service/`: `ParknaService` (actions, roles in `ALLOWED`, simulator, USSD), `Views` (what each role may
  see: privacy), `UssdMenu`, `TermsService`. Migrations: `backend/src/main/resources/db/migration` (+ `index.txt`);
  never edit an applied migration, add `V<n+1>__...sql`.
- `frontend/shared/ui.js|ui.css|client.js`: the apps' UI kit (sign-in, terms gate, launch screen, `UI.morph`).
- `apps/driver|officer/www/app.js`: the two apps. `frontend/portal/`: home page (`index.html`, prices and app links
  from `/api/ping`), back office (`admin.html`; `police.html` and `council.html` are the same page with their own sign-in), org portal,
  `/sms`, `/terms`.
- `scripts/build-frontend.js` builds `frontend/dist` and copies shared files into the apps (never edit `apps/*/www/assets`).
- Art: `scripts/art/scene.js` draws the Banjul scene as vector SVG (`banjul-scene.svg` for navy cards,
  `banjul-scene-light.svg` for pale pages), sharp on every screen; use it rather than the small raster crops.
  The home page is landscape on wide screens (hero beside the portal sign-ins) and stacks on phones.

## Checks (run before every push)
- `scripts/qa.sh`: JS syntax, parity runs, all back-end tests with MariaDB (about 40 s).
- `scripts/e2e/run.sh`: the real server + browser tests in `scripts/e2e/tests/` (simulator use cases, apps, keyboard;
  about 3 min). `scripts/e2e/run.sh 2-simulator` runs one file; `SKIP_BUILD=1` reuses the last build.
- In a Claude web session, `.claude/hooks/session-start.sh` has already started MariaDB (user `parkna_test`,
  password `test-pass`), cached Maven and downloaded Tomcat. If MariaDB stopped (container restart):
  `nohup mysqld_safe --user=mysql >/dev/null 2>&1 &`.
- UI changes: also look at the screenshots in `backend/target/e2e/shots`, and extend the e2e tests for new flows.

## Rules
- Work on the branch the session names; commit as `abdiMuhamud <a.abdi.muhamud@gmail.com>`; no model names in
  commits, PRs or code. Don't open PRs unless asked; when the user says "open the pr and merge", use `/release`.
- Release numbers: `VERSION` (e.g. 1.2) + the GitHub build number = `1.2.<run>`; every merge to main publishes a
  GitHub release (server package + both APKs). Raise `VERSION` for a bigger change.
- Write for the people using it: plain words in the UI, SMS texts under 160 characters where possible, prices from
  the tariff (`T.daily`, `T.monthly`, `T.fine`), never hard-coded.
- Documents (Word, PDF, decks): the INNOVII logo always at the top right (cover and every page header);
  SUNU Park / Banjul City Council branding on the left; soft brand colours, no loud colours. Copies in `docs/`.
- Keep the look: pale blue `#F6FBFE`, navy `#0B2E63`, SUNU yellow `#FEDB46`, Plus Jakarta Sans.
- Privacy: a new field on a model is sent to drivers/attendants/organisations/police only through `Views`; add a
  `ViewsTest` when a role starts seeing something new.

## The server (innovii-test001)
Tomcat at `/opt/tomcat-parkna/current` (service `tomcat-parkna`, port 8081), config `/home/sdf/parkna`, packages in
`/home/sdf/deliverables`, web root `/usr/share/nginx/html/parkna-web`. The SDF Tomcat (`tomcat`, `/opt/tomcat/current`)
is someone else's: never touch it. Upgrade commands for a release `<v>`:
```bash
cd /home/sdf/deliverables
wget https://github.com/abdiMuhamud/parkna-demo/releases/download/v<v>/parkna-<v>.tar.gz && tar -xzf parkna-<v>.tar.gz
TOMCAT=/opt/tomcat-parkna/current TOMCAT_STOP="systemctl stop tomcat-parkna" TOMCAT_START="systemctl start tomcat-parkna" \
HEALTH_URL=http://127.0.0.1:8081/parkna/api/health \
/home/sdf/deliverables/parkna-<v>/deploy/scripts/deploy.sh /home/sdf/deliverables/parkna-<v>.tar.gz
```
Mention a new migration (database change) and any new `config.properties` setting with the commands.
