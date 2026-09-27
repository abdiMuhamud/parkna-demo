/* Copies the shared engine and assets into each app and the server's public folder.
   Run from the repo root:  node scripts/prep.js   (the GitHub build runs it too) */
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
function copyDir(src, dst){ fs.mkdirSync(dst, { recursive: true }); for(const f of fs.readdirSync(src)){ const s = path.join(src, f), d = path.join(dst, f); fs.statSync(s).isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d); } }
for(const app of ["driver", "officer"]){
  const www = path.join(root, "apps", app, "www");
  copyDir(path.join(root, "assets"), path.join(www, "assets"));
  fs.copyFileSync(path.join(root, "server", "engine.js"), path.join(www, "engine.js"));
}
copyDir(path.join(root, "assets"), path.join(root, "server", "public", "shared"));
console.log("Shared engine and assets copied into apps/driver, apps/officer and server/public/shared");
