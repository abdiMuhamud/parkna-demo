/* ParkNa demo server v0.1
   One small Node server (no dependencies) that holds the shared demo state.
   - Driver and officer APKs, the organisation portal and the back office all connect here.
   - Every change is pushed live to every connected screen.
   Run:  node server.js          (Node 18 or newer)   Port: PORT env or 4000
*/
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const vm = require("vm");

const PORT = +process.env.PORT || 4000;
const ROOT = __dirname;
const DATA = process.env.PARKNA_DATA || path.join(ROOT, "demo-state.json");

/* load the shared engine into a sandbox so the same file also runs in browsers */
const ctx = { console, Math, Date, JSON, Object, Array, String, Number, isNaN };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, "engine.js"), "utf8"), ctx, { filename: "engine.js" });
const E = {
  reset: () => ctx.reset(),
  act: a => ctx.act(a),
  snapshot: () => ctx.snapshot(),
  hydrate: s => ctx.hydrate(s),
  tick: () => ctx.tickMinute(),
};
vm.runInContext("function __bump(){ return ++VER; }", ctx);

/* restore the last state so a restart doesn't lose the demo */
try { if(fs.existsSync(DATA)) { E.hydrate(fs.readFileSync(DATA, "utf8")); console.log("Restored demo state from", path.basename(DATA)); } else E.reset(); }
catch(e){ console.warn("Could not restore state, starting fresh:", e.message); E.reset(); }

let saveTimer = null;
function save(){ clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { fs.writeFileSync(DATA, E.snapshot()); } catch(e){} }, 400); }

/* live updates: Server-Sent Events */
const clients = new Set();
function broadcast(){
  vm.runInContext("__bump()", ctx);
  const snap = E.snapshot();
  for(const res of clients){ try { res.write("event: state\ndata: " + snap + "\n\n"); } catch(e){} }
  save();
}
setInterval(() => { if(E.tick()) broadcast(); }, 60000);            /* the demo clock runs in real time */
setInterval(() => { for(const res of clients){ try { res.write(": keep-alive\n\n"); } catch(e){} } }, 20000);

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };
const MOUNTS = [
  ["/driver/", path.join(ROOT, "..", "apps", "driver", "www")],
  ["/officer/", path.join(ROOT, "..", "apps", "officer", "www")],
  ["/", path.join(ROOT, "public")],
  /* fall back to the shared files, so the server runs without "node scripts/prep.js" */
  ["/driver/assets/", path.join(ROOT, "..", "assets")],
  ["/officer/assets/", path.join(ROOT, "..", "assets")],
  ["/shared/", path.join(ROOT, "..", "assets")],
];
function cors(res){
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
function send(res, code, body, type){ res.writeHead(code, { "Content-Type": type || "application/json", "Cache-Control": "no-store" }); res.end(body); }
function serveStatic(req, res, urlPath){
  if(urlPath === "/engine.js" || urlPath === "/driver/engine.js" || urlPath === "/officer/engine.js") return fileOut(res, path.join(ROOT, "engine.js"));
  if(urlPath === "/" ) urlPath = "/index.html";
  if(urlPath === "/admin" || urlPath === "/org") urlPath += ".html";
  if(urlPath === "/driver" || urlPath === "/officer") { res.writeHead(302, { Location: urlPath + "/" }); return res.end(); }
  for(const [prefix, dir] of MOUNTS){
    if(!urlPath.startsWith(prefix)) continue;
    let rel = urlPath.slice(prefix.length) || "index.html";
    if(rel.endsWith("/")) rel += "index.html";
    const file = path.normalize(path.join(dir, rel));
    if(!file.startsWith(dir)) return send(res, 403, "Forbidden", "text/plain");
    if(fs.existsSync(file) && fs.statSync(file).isFile()) return fileOut(res, file);
  }
  send(res, 404, "Not found", "text/plain");
}
function fileOut(res, file){
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
  fs.createReadStream(file).pipe(res);
}

function lanIPs(){ const ips = []; for(const list of Object.values(os.networkInterfaces())) for(const n of list || []) if(n.family === "IPv4" && !n.internal) ips.push(n.address); return ips; }
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if(url.pathname.startsWith("/api/")){
    cors(res);
    if(req.method === "OPTIONS"){ res.writeHead(204); return res.end(); }
    if(url.pathname === "/api/ping") return send(res, 200, JSON.stringify({ ok: true, name: "ParkNa demo server", version: "0.1", addresses: lanIPs().map(ip => `http://${ip}:${PORT}`) }));
    if(url.pathname === "/api/state") return send(res, 200, E.snapshot());
    if(url.pathname === "/api/events"){
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", "Connection": "keep-alive", "X-Accel-Buffering": "no" });
      res.write("retry: 2000\n\n");
      res.write("event: state\ndata: " + E.snapshot() + "\n\n");
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }
    if(url.pathname === "/api/act" && req.method === "POST"){
      let body = "";
      req.on("data", c => { body += c; if(body.length > 1e6) req.destroy(); });
      req.on("end", () => {
        let a; try { a = JSON.parse(body || "{}"); } catch(e){ return send(res, 400, JSON.stringify({ err: "Bad JSON" })); }
        let r;
        try { r = E.act(a); } catch(e){ console.error(e); return send(res, 500, JSON.stringify({ err: "Server error: " + e.message })); }
        const out = JSON.stringify(r, function(k, v){ const raw = this[k]; return raw instanceof Date ? { $d: raw.getFullYear()+"-"+(raw.getMonth()+1)+"-"+raw.getDate() } : v; });
        send(res, 200, out);
        broadcast();
      });
      return;
    }
    return send(res, 404, JSON.stringify({ err: "Unknown endpoint" }));
  }
  if(req.method !== "GET") return send(res, 405, "Method not allowed", "text/plain");
  serveStatic(req, res, decodeURIComponent(url.pathname));
});

server.listen(PORT, "0.0.0.0", () => {
  const ips = [];
  for(const list of Object.values(os.networkInterfaces())) for(const n of list || []) if(n.family === "IPv4" && !n.internal) ips.push(n.address);
  console.log("\n  ParkNa demo server v0.1 is running\n");
  const base = ips.length ? ips.map(ip => `http://${ip}:${PORT}`) : [`http://localhost:${PORT}`];
  base.forEach(b => {
    console.log("  Server address for the phones:  " + b);
    console.log("     Back office:          " + b + "/admin");
    console.log("     Organisation portal:  " + b + "/org");
    console.log("     Driver app in a browser:   " + b + "/driver/");
    console.log("     Officer app in a browser:  " + b + "/officer/\n");
  });
  console.log("  Phones and laptop must be on the same Wi-Fi. Press Ctrl+C to stop.\n");
});
