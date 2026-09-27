/* Adjusts the Android project that "npx cap add android" generates, for both apps (CI and local builds).
   Run inside apps/<app> after "npx cap add android":
     node ../../scripts/prepare-android.js <versionName> <versionCode>
   - icons and splash from res/
   - version name and code
   - plain-HTTP access to a server on the local network (cleartext)
   - splash background colour
   - text size: the WebView follows the phone's Font size setting only up to 100%, so a large system
     font no longer blows up the layout (see MAX_TEXT_ZOOM in the generated MainActivity) */
const fs = require("fs"), path = require("path");
const [versionName, versionCode] = process.argv.slice(2);
if(!versionName || !versionCode){ console.error("usage: node prepare-android.js <versionName> <versionCode>"); process.exit(2); }

const app = process.cwd(), main = path.join(app, "android", "app", "src", "main");
if(!fs.existsSync(main)){ console.error("No Android project here: run npx cap add android first"); process.exit(1); }
const appId = JSON.parse(fs.readFileSync(path.join(app, "capacitor.config.json"), "utf8")).appId;

function copyDir(src, dst){ fs.mkdirSync(dst, { recursive: true }); for(const f of fs.readdirSync(src)){ const s = path.join(src, f), d = path.join(dst, f); fs.statSync(s).isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d); } }
function edit(file, fn){ const before = fs.readFileSync(file, "utf8"), after = fn(before); if(after === before) throw new Error("No change made to " + file); fs.writeFileSync(file, after); }

copyDir(path.join(app, "res"), path.join(main, "res"));

edit(path.join(main, "AndroidManifest.xml"), s => s.replace("<application", '<application android:usesCleartextTraffic="true"'));

edit(path.join(app, "android", "app", "build.gradle"), s => s
  .replace(/versionName "[^"]*"/, 'versionName "' + versionName + '"')
  .replace(/versionCode \d+/, "versionCode " + versionCode));

edit(path.join(main, "res", "values", "styles.xml"), s => s.replace(
  '<item name="android:background">@drawable/splash</item>',
  '<item name="android:background">@drawable/splash</item><item name="windowSplashScreenBackground">#0C2D4E</item>'));

const pkg = appId.split(".");
const activity = path.join(main, "java", ...pkg, "MainActivity.java");
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
console.log("Prepared " + appId + " " + versionName + " (" + versionCode + "): icons, cleartext, version, splash colour, text size cap " + path.relative(app, activity));
