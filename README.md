# ParkNa demo v0.1

A live demo of ParkNa, the road-side parking service for Banjul City Council, built by INNOVII.

It has four parts, and all of them share one live demo:

| Part | What it is | Where it runs |
|---|---|---|
| **Driver app** | Pay for a plate (daily or monthly) with Wave, Afrimoney, APS or QMoney | Android APK: `ParkNa-Driver-v0.1.apk` |
| **Officer app** | The parking officer's SMS line: START, a plate, END | Android APK: `ParkNa-Officer-v0.1.apk` |
| **Organisation portal** | Fleet plates, invoices and checks for a business | Browser: `http://<server>:4000/org` |
| **Back office** | Attendants, roads, organisations, payments, tariffs | Browser: `http://<server>:4000/admin` |

A payment made in the driver app shows up on the officer's line, in the organisation portal and in the back office straight away.

---

## 1. Get the APKs

Every push to `main` builds both apps on GitHub:

1. Open the repository on GitHub and go to **Releases**.
2. Open the newest **ParkNa demo v0.1** release.
3. Download `ParkNa-Driver-v0.1.apk` and `ParkNa-Officer-v0.1.apk`.

The same files are also under **Actions → Build demo APKs → (latest run) → Artifacts**.

On each Android phone, open the APK and allow **Install unknown apps** when Android asks. New builds install over old ones.

## 2. Start the demo server

On the laptop you will present from (Windows, Mac or Linux, with Node.js 18 or newer):

```bash
cd server
node server.js
```

It prints the addresses to use, for example:

```
  ParkNa demo server v0.1 is running

  Server address for the phones:  http://192.168.1.20:4000
     Back office:          http://192.168.1.20:4000/admin
     Organisation portal:  http://192.168.1.20:4000/org
```

Opening `http://localhost:4000` on the laptop also shows the address for the phones, with links to everything.

- Put the phones on the same Wi-Fi as the laptop, or turn on the laptop's hotspot and join it from the phones.
- If Windows asks about the firewall, allow Node.js on **private networks**.
- To use another port: `PORT=5000 node server.js` (on Windows PowerShell: `$env:PORT=5000; node server.js`).
- The demo state is saved in `server/demo-state.json`, so a restart keeps where you were.

## 3. Connect the apps

The first time each app opens, it asks for the **server address**. Type the "Server address for the phones" the server printed (for example `192.168.1.20:4000`) and tap **Connect**. You can change it later: **Account → Change server** in the driver app, or the **menu → Change server** on the officer line.

Open the portals in the laptop's browser:

- Back office: `http://localhost:4000/admin`
- Organisation portal: `http://localhost:4000/org`

## 4. Demo logins

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

## 5. Running the demo

The back office has a **Demo clock** bar at the bottom:

- `−1h`, `+1h`, `07:00`, `10:00`, `19:20`: move the time of day (paid hours are 7am to 7pm, Monday to Saturday).
- `Next day`: moves to the next day and resets the day's shifts.
- `Pause` / `Run`: stops or starts the clock.
- `+ Exception`: records a wrong-plate payment on the latest payment.
- `Reset demo`: returns every phone and portal to the starting story.

A suggested order:

1. **Driver** Musa pays BJL8080 with Afrimoney.
2. **Officer** Modou sends START, then BJL8080 (PAID), BJL9191 (UNPAID) and BJL7001 (organisation).
3. **Organisation portal**: Demo Bank sees BJL7001 checked at that time.
4. **Back office**: the payment, the checks and the attendant's shift are live; reassign Modou to another road and his line gets the SMS.
5. **Driver** Ebrima tries Wave with a low balance, then pays with another provider.

## Pilot rules shown in the demo

- One price for every plate: GMD 200 a day or GMD 4,420 a month.
- Paid hours: 7am to 7pm, Monday to Saturday.
- No fines and no clamping during the pilot.
- Organisations are invoiced on the 25th, due on the 1st, with 5 days' grace; after that their plates revert to normal pricing.
- Revenue share: 60% Council, 40% operator.
- Shortcode 7275 is a placeholder.

## Repository layout

```
server/            demo server (no dependencies) and the shared engine
  engine.js        the demo's rules and state, shared by every part
  public/          landing page, back office (/admin), organisation portal (/org)
apps/driver/       driver app (Capacitor): www/ is the app, res/ holds the icon and splash
apps/officer/      officer app (Capacitor)
assets/            fonts, the Banjul City Council crest, INNOVII and provider logos, client.js
scripts/prep.js    copies engine.js and assets/ into each app and the portals
build/             the shared demo signing key used by the APK build
.github/workflows/ the APK build
```

The server uses `server/engine.js` and `assets/` directly. The APK build runs `node scripts/prep.js` to copy them into each app before packaging.

### Building the APKs on your own computer (optional)

Needs Node.js 22, Java 21 and the Android SDK.

```bash
node scripts/prep.js
cd apps/driver            # or apps/officer
npm install
npx cap add android
cp -r res/. android/app/src/main/res/
npx cap sync android
cd android && ./gradlew assembleDebug
```

---

INNOVII · ParkNa demo v0.1
