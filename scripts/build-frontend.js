/* Builds everything Nginx serves, and copies the shared files into the Android apps.
   Run from the repo root:  node scripts/build-frontend.js   (the GitHub build runs it too)

   frontend/dist/            the Nginx document root
     index.html admin.html org.html    landing page, back office, organisation portal
     engine.js                          shared read-side rules (frontend/shared/engine.js)
     shared/                            portal JS/CSS + client.js, fonts, images
     driver/ officer/                   the two apps' screens, for use in a browser
   apps/<app>/www/assets/, apps/<app>/www/engine.js   copies used by the APK builds */
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const shared = path.join(root, "frontend", "shared");
const portal = path.join(root, "frontend", "portal");
const dist = path.join(root, "frontend", "dist");

function copyDir(src, dst, skip){
  fs.mkdirSync(dst, { recursive: true });
  for(const f of fs.readdirSync(src)){
    if(skip && skip.includes(f)) continue;
    const s = path.join(src, f), d = path.join(dst, f);
    fs.statSync(s).isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
  }
}
const SHARED_ASSETS = ["engine.js"];              /* everything else in frontend/shared is an asset */

/* 1. the APK projects. PARKNA_SERVER_URL (e.g. https://parkna.gm) is built into the apps so people never type a server
      address; without it the app asks for one on first start. */
const server = (process.env.PARKNA_SERVER_URL || "").trim().replace(/\/+$/, "");
/* the release number, e.g. 1.1.14 (VERSION file + build number, set by the GitHub build); shown in the apps */
const version = (process.env.PARKNA_VERSION || fs.readFileSync(path.join(root, "VERSION"), "utf8").trim() + "-dev").trim();
if(!/^[0-9A-Za-z.\-]+$/.test(version)){ console.error("PARKNA_VERSION must look like 1.1.14"); process.exit(1); }
if(server && !/^https?:\/\/[^\s"'<>]+$/.test(server)){ console.error("PARKNA_SERVER_URL must look like https://parkna.gm"); process.exit(1); }
for(const app of ["driver", "officer"]){
  const www = path.join(root, "apps", app, "www");
  fs.rmSync(path.join(www, "assets"), { recursive: true, force: true });
  copyDir(shared, path.join(www, "assets"), SHARED_ASSETS);
  fs.writeFileSync(path.join(www, "assets", "config.js"), "/* built by scripts/build-frontend.js */\nwindow.PARKNA_CONFIG = " + JSON.stringify(server ? { server, version } : { version }) + ";\n");
  fs.copyFileSync(path.join(shared, "engine.js"), path.join(www, "engine.js"));
}

/* 2. the Nginx document root */
fs.rmSync(dist, { recursive: true, force: true });
copyDir(portal, dist);
copyDir(shared, path.join(dist, "shared"), SHARED_ASSETS);
fs.copyFileSync(path.join(shared, "engine.js"), path.join(dist, "engine.js"));
for(const app of ["driver", "officer"]) copyDir(path.join(root, "apps", app, "www"), path.join(dist, app));

console.log("Built SUNU Park " + version + ": frontend/dist (Nginx document root) and the shared files in apps/driver and apps/officer" + (server ? " (server " + server + ")" : ""));
