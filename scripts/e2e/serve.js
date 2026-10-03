/* What Nginx does on a SUNU Park server, for the browser tests: serves frontend/dist (with Nginx's
   try_files $uri $uri.html $uri/) and passes /api/... to Tomcat, unbuffered so the live updates stream.
     node scripts/e2e/serve.js <port> <tomcat app url, e.g. http://127.0.0.1:8190/parkna> */
const http = require("http"), fs = require("fs"), path = require("path"), url = require("url");
const PORT = +(process.argv[2] || 8188), API = url.parse(process.argv[3] || "http://127.0.0.1:8190/parkna");
const ROOT = path.join(__dirname, "..", "..", "frontend", "dist");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png",
  ".webp": "image/webp", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".ico": "image/x-icon", ".jpg": "image/jpeg" };

function file(req, res){
  const p = decodeURIComponent(url.parse(req.url).pathname).replace(/\.\.+/g, "");
  for(const c of [p, p + ".html", path.join(p, "index.html")]){
    const f = path.join(ROOT, c);
    if(f.startsWith(ROOT) && fs.existsSync(f) && fs.statSync(f).isFile()){
      res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream", "Cache-Control": "no-cache" });
      return fs.createReadStream(f).pipe(res);
    }
  }
  res.writeHead(404, { "Content-Type": "text/plain" }); res.end("Not found");
}

function proxy(req, res){
  const headers = Object.assign({}, req.headers, { "x-real-ip": "127.0.0.1", host: API.host });
  const up = http.request({ hostname: API.hostname, port: API.port, path: API.pathname + req.url, method: req.method, headers }, r => {
    res.writeHead(r.statusCode, r.headers);
    r.pipe(res);
  });
  up.on("error", () => { if(!res.headersSent) res.writeHead(502); res.end("Tomcat is not answering"); });
  req.pipe(up);
}

http.createServer((req, res) => req.url.startsWith("/api/") ? proxy(req, res) : file(req, res))
  .listen(PORT, "127.0.0.1", () => console.log("SUNU Park test front on http://127.0.0.1:" + PORT + " -> " + API.href));
