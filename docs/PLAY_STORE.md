# Publishing ParkNa on Google Play

Two apps, published separately:

| App | Package name (permanent) | For |
|---|---|---|
| **ParkNa** | `com.innovii.parkna.driver` | drivers |
| **ParkNa Officer** | `com.innovii.parkna.officer` | Banjul City Council parking attendants |

GitHub builds both on every push. Once the steps below are done, each release on GitHub has an `.aab` per app to
upload to Google Play (and an `.apk` of the same build for direct installs).

## 0. Before you start

- **The production server is live** on its domain over HTTPS, with real SMS through Kannel (`docs/DEPLOYMENT.md`,
  go-live checklist in section 11). The Play Store apps talk to that address only.
- `support.phone` and `support.email` are set in `config.properties`, and `https://<domain>/privacy.html` opens and
  shows them. Google asks for the privacy policy address and checks that it works.
- A **Google Play Console organisation account** for INNOVII (play.google.com/console, one-time USD 25). An organisation
  account needs a D-U-N-S number and takes a few days to verify. Personal accounts must first run a closed test with
  12 testers for 14 days before they may publish, so use the organisation account.
- **A letter from Banjul City Council** authorising INNOVII to publish ParkNa for the Council. The apps carry the
  Council's name and crest, and Google Play asks government-related apps for this proof (App content → Government apps).

## 1. The upload key (once)

Google Play signs the apps people download with its own key (Play App Signing). You sign what you upload with an
**upload key**. Make it once, on a trusted computer with Java installed:

```bash
keytool -genkeypair -v -keystore parkna-upload.jks -alias parkna-upload \
  -keyalg RSA -keysize 4096 -validity 10000 -dname "CN=INNOVII, O=INNOVII, L=Banjul, C=GM"
base64 -w0 parkna-upload.jks > parkna-upload.jks.b64          # macOS: base64 -i parkna-upload.jks -o parkna-upload.jks.b64
```

Keep `parkna-upload.jks` and its passwords in the company password vault, never in the repository. The same upload
key can sign both apps. If it is ever lost, Google can reset the upload key for you (Play Console → Setup → App signing).

## 2. Tell GitHub (once)

Repository **Settings → Secrets and variables → Actions**:

| Kind | Name | Value |
|---|---|---|
| Secret | `ANDROID_KEYSTORE_BASE64` | the contents of `parkna-upload.jks.b64` |
| Secret | `ANDROID_KEYSTORE_PASSWORD` | the keystore password |
| Secret | `ANDROID_KEY_ALIAS` | `parkna-upload` |
| Secret | `ANDROID_KEY_PASSWORD` | the key password (the same as the keystore password if you pressed Enter at that prompt) |
| Variable | `PARKNA_SERVER_URL` | `https://<your-domain>`, e.g. `https://parkna.gm` |

Then run **Actions → Build ParkNa → Run workflow** on `main` (or push to `main`). The release it publishes holds
`ParkNa-Driver-v1.0.aab`, `ParkNa-Officer-v1.0.aab` and the matching `.apk` files.

- The server address is built into the apps: people never type it. With `https://` the apps refuse plain HTTP.
- Every build gets a higher version code (the build number), which Google Play needs for each upload. The version
  name people see is `APP_VERSION` in `.github/workflows/build.yml`: change it to `1.1` and so on for new versions.
- A `.apk` from a release is signed with the upload key, not Google's key. It installs directly for testing, but a
  phone that has it must uninstall it before installing the app from Google Play.

## 3. Create the two apps in Play Console

For each app: **Create app** → name (`ParkNa` or `ParkNa Officer`), default language English (United Kingdom), *App*,
*Free*, accept the declarations. Then **Test and release → Setup → App signing**: keep Google's app signing (the default).

## 4. Store listing

**Grow users → Store presence → Main store listing**. The graphics are in this repository:

| Item | ParkNa | ParkNa Officer |
|---|---|---|
| App icon (512 × 512) | `store/driver/icon-512.png` | `store/officer/icon-512.png` |
| Feature graphic (1024 × 500) | `store/driver/feature-graphic.png` | `store/officer/feature-graphic.png` |
| Phone screenshots (1080 × 1920) | `store/driver/screenshots/` | `store/officer/screenshots/` |
| Category | Auto & Vehicles | Business |
| Tags | Parking, Payments | Productivity |

Contact details: the support email and phone from `config.properties`, website `https://<your-domain>`.

**ParkNa: short description** (80 characters at most)
> Street parking in Banjul: check your plate, keep receipts, get Council news.

**ParkNa: full description**
> ParkNa is the street parking service of Banjul City Council.
>
> • Sign in with your mobile number: we send you a code by SMS. No password to remember.
> • Add your car's number plate, or several: the pass follows the plate, not the phone.
> • See at a glance whether a plate is covered today and until when.
> • Keep every receipt and see when attendants checked your car.
> • Monthly passes for regular parkers, and cover for company and government fleets.
> • News and events from Banjul City Council on your home screen.
>
> Paid hours are 7am to 7pm, Monday to Saturday. Sundays and evenings are free. Attendants never take cash.
>
> Paying by mobile money (Wave, Afrimoney, APS, QMoney) opens soon: you will get an SMS when it does.
>
> No smartphone data? Text your plate to the ParkNa short code for the same service by SMS.

**ParkNa Officer: short description**
> For Banjul City Council parking attendants: run your shift and check plates.

**ParkNa Officer: full description**
> ParkNa Officer is the work app of Banjul City Council's parking attendants.
>
> • Sign in with the phone number your supervisor registered, with a code sent by SMS.
> • Start and end your shift on your road with one tap.
> • Check a plate and see at once: PAID (daily or monthly pass, or organisation cover) or NOT PAID.
> • See your checks for the day and messages from your supervisor.
>
> Only registered ParkNa attendants can sign in. Attendants never take money: drivers pay on their own phones.

## 5. App content (Policy → App content)

| Question | Answer |
|---|---|
| Privacy policy | `https://<your-domain>/privacy.html` |
| Ads | No, the app has no ads |
| App access | Some functions need sign-in: give the reviewers a number and code (below) |
| Content rating | Fill in the questionnaire (a utility with no violence, gambling or user-to-user chat): expected rating *Everyone* / PEGI 3 |
| Target audience | 18 and over |
| News app | No |
| Government apps | Yes, made for Banjul City Council: upload the Council's authorisation letter |
| Financial features | Version 1.0 takes no payments (payments are off): none. Update this declaration in the release that switches mobile money on |
| Data safety | Below |

**Sign-in for Google's reviewers.** Reviewers cannot receive SMS on a Gambian number. Give each app a review number
that always takes the same code and never sends an SMS:

1. Choose two numbers no real person has (for example `7000001` and `7000002`) and two 6-digit codes.
2. In `config.properties`: `auth.reviewNumbers=7000001:246810,7000002:135790`, then restart Tomcat. `parkna.log`
   shows a warning listing them.
3. In the back office, register `7000002` as an attendant (name "Play Review", any road and shift).
4. In Play Console → App access, for **ParkNa**: "Enter phone number 7000001, tap Send code, enter 246810."
   For **ParkNa Officer**: "Enter phone number 7000002, tap Send code, enter 135790. Tap Start shift, then check plate
   BJL1234. Outside 7am to 7pm Banjul time (GMT) the app answers that parking is free."
5. When the review is approved, remove the line, restart Tomcat, and switch the "Play Review" attendant off. Put both
   back before submitting an update for review.

**Data safety.** What ParkNa 1.0 collects (see the privacy policy):

| Data type | Collected | Shared | Why | Optional |
|---|---|---|---|---|
| Phone number | Yes | No | Account management, app functionality | No |
| Name | Yes (driver app) | No | App functionality | Yes |
| Purchase history (passes, receipts) | Yes (driver app) | No | App functionality | No |
| Other in-app messages (SMS replies) | Yes | No | App functionality | No |

- Location, contacts, photos, files, device IDs, health, web browsing: not collected.
- Sign-in records keep the IP address and device type, for security only. Google's guidance can count this under
  *App activity* or *Device or other IDs*; declare it if your reading of the guidance says so ("Fraud prevention, security").
- Data is encrypted in transit: **Yes** (the Play Store apps are HTTPS-only).
- People can ask for their data to be deleted: **Yes**. Deletion link: `https://<your-domain>/privacy.html#delete`.

## 6. Test, then publish

1. **Test and release → Testing → Internal testing → Create new release**: upload the `.aab`, add your team as testers,
   install from the opt-in link, and try sign-in with real SMS on real Gambian numbers.
2. **Production → Create new release**: add the same `.aab` (or promote the internal release), release notes, then
   **Send for review**. The first review of a new app can take several days.
3. For each update: new build on GitHub, new release in Play Console with the new `.aab`.

The server and the apps update separately. Keep the server's API compatible with the app versions people still have:
Google Play updates phones gradually.
