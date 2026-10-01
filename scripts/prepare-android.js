/* Adjusts the Android project that "npx cap add android" generates, for both apps (CI and local builds).
   Run inside apps/<app> after "npx cap add android" and "npx cap sync android" (and again after any later sync):
     node ../../scripts/prepare-android.js <versionName> <versionCode>
   - icons and splash screens from res/ (drawn by scripts/art/make-art.js)
   - version name and code (Google Play needs a higher code for every upload)
   - network: when the server address built into the app (PARKNA_SERVER_URL) starts with https://, the app only
     talks HTTPS. Otherwise plain HTTP is allowed, for a test server on the local network.
   - release signing for Google Play, when these environment variables are set at build time (docs/PLAY_STORE.md):
       PARKNA_KEYSTORE (path to the upload key), PARKNA_KEYSTORE_PASSWORD, PARKNA_KEY_ALIAS, PARKNA_KEY_PASSWORD
   - splash background colour
   - text size: the WebView follows the phone's Font size setting only up to 100%, so a large system
     font no longer blows up the layout (see MAX_TEXT_ZOOM in the generated MainActivity) */
const fs = require("fs"), path = require("path");
const [versionName, versionCode] = process.argv.slice(2);
if(!versionName || !/^\d+$/.test(versionCode || "")){ console.error("usage: node prepare-android.js <versionName> <versionCode>"); process.exit(2); }

const app = process.cwd(), main = path.join(app, "android", "app", "src", "main");
if(!fs.existsSync(main)){ console.error("No Android project here: run npx cap add android first"); process.exit(1); }
const appId = JSON.parse(fs.readFileSync(path.join(app, "capacitor.config.json"), "utf8")).appId;
const server = (process.env.PARKNA_SERVER_URL || "").trim(), secure = /^https:\/\//i.test(server);

function copyDir(src, dst){ fs.mkdirSync(dst, { recursive: true }); for(const f of fs.readdirSync(src)){ const s = path.join(src, f), d = path.join(dst, f); fs.statSync(s).isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d); } }
/* changes a generated file; "must" is a pattern the Capacitor template has to contain, so a template change is noticed */
function edit(file, must, fn){
  const before = fs.readFileSync(file, "utf8");
  if(must && !must.test(before)) throw new Error(path.relative(app, file) + " no longer contains " + must + ": check the Capacitor template");
  const after = fn(before);
  if(after !== before) fs.writeFileSync(file, after);
}

copyDir(path.join(app, "res"), path.join(main, "res"));

/* keyboard: the app area shrinks above the keyboard (adjustResize) and no keyboard pops up on its own at start */
edit(path.join(main, "AndroidManifest.xml"), /<activity/, s => {
  s = s.replace(/ android:windowSoftInputMode="[^"]*"/g, "");
  return s.replace(/<activity/, '<activity android:windowSoftInputMode="adjustResize|stateHidden"');
});

/* network */
edit(path.join(main, "AndroidManifest.xml"), /<application/, s => {
  s = s.replace(/ android:usesCleartextTraffic="true"/g, "");
  return secure ? s : s.replace("<application", '<application android:usesCleartextTraffic="true"');
});
const synced = path.join(main, "assets", "capacitor.config.json");
if(fs.existsSync(synced)){
  const c = JSON.parse(fs.readFileSync(synced, "utf8"));
  if(secure){
    c.server = Object.assign({}, c.server, { androidScheme: "https" }); delete c.server.cleartext;
    c.android = Object.assign({}, c.android, { allowMixedContent: false });
  }
  fs.writeFileSync(synced, JSON.stringify(c, null, 2) + "\n");
} else if(secure) console.warn("warning: run npx cap sync android before this script, or the app keeps its plain-HTTP settings");

/* version and release signing */
edit(path.join(app, "android", "app", "build.gradle"), /versionCode \d+/, s => {
  s = s.replace(/versionName "[^"]*"/, 'versionName "' + versionName + '"').replace(/versionCode \d+/, "versionCode " + versionCode);
  if(s.includes("SUNU Park: release signing")) return s;
  return s + `
// SUNU Park: release signing for Google Play, from environment variables (see docs/PLAY_STORE.md).
// Without them "gradlew bundleRelease" makes an unsigned bundle.
if (System.getenv("PARKNA_KEYSTORE")) {
    android {
        signingConfigs {
            parkna {
                storeFile file(System.getenv("PARKNA_KEYSTORE"))
                storePassword System.getenv("PARKNA_KEYSTORE_PASSWORD")
                keyAlias System.getenv("PARKNA_KEY_ALIAS")
                keyPassword System.getenv("PARKNA_KEY_PASSWORD")
            }
        }
        buildTypes {
            release {
                signingConfig signingConfigs.parkna
            }
        }
    }
}
`;
});

/* splash background (Android 12 and later show the icon on this colour) */
edit(path.join(main, "res", "values", "styles.xml"), /<item name="android:background">@drawable\/splash<\/item>/, s => {
  s = s.replace(/<item name="windowSplashScreenBackground">[^<]*<\/item>/g, "");
  return s.replace('<item name="android:background">@drawable/splash</item>', '<item name="android:background">@drawable/splash</item><item name="windowSplashScreenBackground">#F6FBFE</item>');
});

const activity = path.join(main, "java", ...appId.split("."), "MainActivity.java");
fs.writeFileSync(activity, `package ${appId};

import android.webkit.WebSettings;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    /** Largest text size in percent. The screens are laid out for 100%; the phone's Font size setting is followed up to this. */
    private static final int MAX_TEXT_ZOOM = 100;

    @Override
    public void onResume() {
        super.onResume();
        if (getBridge() == null || getBridge().getWebView() == null) return;
        WebSettings settings = getBridge().getWebView().getSettings();
        int phone = Math.round(getResources().getConfiguration().fontScale * 100);
        settings.setTextZoom(Math.min(phone, MAX_TEXT_ZOOM));
    }
}
`);
console.log("Prepared " + appId + " " + versionName + " (" + versionCode + "): icons, " + (secure ? "HTTPS only (" + server + ")" : "plain HTTP allowed") + ", version, release signing "
  + (process.env.PARKNA_KEYSTORE ? "on" : "off (no PARKNA_KEYSTORE)") + ", splash colour, text size cap");
