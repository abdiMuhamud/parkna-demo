/* Draws the app icons, splash screens and Google Play graphics for both apps from the brand (Plus Jakarta Sans,
   lime #D5F56E, navy #0B2540, grey #EDEFF2). Output:
     apps/<app>/res/...                launcher icons (legacy, round, adaptive foreground) and splash screens
     store/<app>/icon-512.png          Google Play high-res icon
     store/<app>/feature-graphic.png   Google Play feature graphic (1024 x 500)
   Needs Playwright with Chromium:  npm install -g playwright   then   node scripts/art/make-art.js
   The PNGs are committed, so this only runs again when the brand changes. */
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..", "..");
function playwright(){
  try { return require("playwright"); } catch(e){}
  const g = require("child_process").execSync("npm root -g").toString().trim();
  return require(path.join(g, "playwright"));
}
const NAVY = "#0B2540", LIME = "#D5F56E", GREY = "#EDEFF2", MUTED = "#5E6B7D";
const font = w => "data:font/woff2;base64," + fs.readFileSync(path.join(root, "frontend/shared/fonts/jakarta-" + w + ".woff2")).toString("base64");
const crest = "data:image/png;base64," + fs.readFileSync(path.join(root, "frontend/shared/img/crest.png")).toString("base64");
const HEAD = `<style>@font-face{font-family:J;font-weight:800;src:url(${font(800)})}@font-face{font-family:J;font-weight:600;src:url(${font(600)})}
  *{margin:0;box-sizing:border-box}html,body{background:transparent}body{font-family:J,sans-serif}</style>`;

const APPS = {
  driver: { name: "ParkNa", bg: NAVY, fg: LIME, badge: false,
    title: "ParkNa", line: "Pay for parking in Banjul<br>from your phone.", card: { k: "Daily pass · till 7pm", big: "200 GMD", plate: "BJL 1234" } },
  officer: { name: "ParkNa Officer", bg: LIME, fg: NAVY, badge: true,
    title: "ParkNa Officer", line: "Check plates on your road.<br>Never take cash.", card: { k: "BJL 1234 · checked 09:41", big: "PAID", plate: "Daily pass" } }
};

/* the "P" mark on a 108 x 108 canvas (the adaptive icon grid: keep it inside the 66-unit safe circle) */
function mark(a, scale){
  const s = scale || 1, cx = 54, cy = 54;
  const badge = a.badge ? `<circle cx="${cx + 19 * s}" cy="${cy + 17 * s}" r="${10.5 * s}" fill="${NAVY}" stroke="${a.bg}" stroke-width="${3 * s}"/>
    <path d="M${cx + 14.5 * s} ${cy + 17 * s} l${3.4 * s} ${3.4 * s} l${6 * s} ${-6.6 * s}" fill="none" stroke="${LIME}" stroke-width="${2.8 * s}" stroke-linecap="round" stroke-linejoin="round"/>` : "";
  return `<text x="${cx - 1.5 * s}" y="${cy + 19 * s}" text-anchor="middle" font-family="J" font-weight="800" font-size="${56 * s}" fill="${a.fg}">P</text>
    <rect x="${cx - 16 * s}" y="${cy + 24 * s}" width="${a.badge ? 20 * s : 29 * s}" height="${4.5 * s}" rx="${2.25 * s}" fill="${a.fg}"/>${badge}`;
}
const svg = (size, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 108 108">${body}</svg>`;
const icon = {
  legacy: (a, n) => svg(n, `<rect x="6" y="6" width="96" height="96" rx="22" fill="${a.bg}"/>${mark(a, .92)}`),
  round: (a, n) => svg(n, `<circle cx="54" cy="54" r="48" fill="${a.bg}"/>${mark(a, .92)}`),
  foreground: (a, n) => svg(n, mark(a, .82)),
  play: (a, n) => svg(n, `<rect width="108" height="108" fill="${a.bg}"/>${mark(a, 1.08)}`)
};
function splash(a, w, h){
  const u = Math.min(w, h) / 320;
  return `<div style="width:${w}px;height:${h}px;background:${GREY};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${14 * u}px">
    <div style="width:${86 * u}px;height:${86 * u}px;border-radius:${24 * u}px;background:#fff;display:grid;place-items:center;box-shadow:0 ${8 * u}px ${24 * u}px -${10 * u}px rgba(11,37,64,.35)">
      <img src="${crest}" style="width:${62 * u}px"></div>
    <div style="width:${34 * u}px;height:${5 * u}px;border-radius:${3 * u}px;background:${LIME};margin-top:${2 * u}px"></div>
    <div style="font-weight:800;font-size:${28 * u}px;color:${NAVY};letter-spacing:-.02em">${a.name}</div>
    <div style="font-weight:600;font-size:${8.5 * u}px;color:${MUTED};letter-spacing:.24em;margin-top:-${8 * u}px">BANJUL CITY COUNCIL</div></div>`;
}
function feature(a){
  return `<div style="width:1024px;height:500px;background:${NAVY};color:#fff;position:relative;overflow:hidden;display:flex;align-items:center;padding:0 70px;
      background-image:radial-gradient(70% 90% at 100% 0,rgba(213,245,110,.22) 0,transparent 60%)">
    <div style="flex:1"><div style="display:flex;align-items:center;gap:16px"><div style="width:74px;height:74px;border-radius:20px;background:#fff;display:grid;place-items:center"><img src="${crest}" style="width:54px"></div>
      <div style="font-size:15px;font-weight:600;letter-spacing:.2em;color:#AFC3DA">BANJUL CITY COUNCIL</div></div>
      <div style="font-size:66px;font-weight:800;letter-spacing:-.035em;margin-top:26px;line-height:1">${a.title}</div>
      <div style="font-size:27px;font-weight:600;color:#C9D6E6;margin-top:18px;line-height:1.3">${a.line}</div></div>
    <div style="width:300px;background:${LIME};color:${NAVY};border-radius:30px;padding:30px;transform:rotate(-4deg);box-shadow:0 30px 50px -24px rgba(0,0,0,.7)">
      <div style="font-size:17px;font-weight:600;opacity:.75">${a.card.k}</div>
      <div style="font-size:52px;font-weight:800;letter-spacing:-.03em;margin:8px 0 14px">${a.card.big}</div>
      <div style="display:inline-block;border:3px solid ${NAVY};border-radius:12px;padding:5px 14px;font-size:20px;font-weight:800;letter-spacing:.08em">${a.card.plate}</div></div></div>`;
}

(async () => {
  const { chromium } = playwright();
  const browser = await chromium.launch(), page = await browser.newPage();
  async function render(file, html, w, h, transparent){
    await page.setViewportSize({ width: w, height: h });
    await page.setContent(`<!doctype html><html><head>${HEAD}</head><body>${html}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(30);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await page.screenshot({ path: file, omitBackground: !!transparent, clip: { x: 0, y: 0, width: w, height: h } });
  }
  const DENS = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  const SPLASH = { mdpi: [480, 320], hdpi: [800, 480], xhdpi: [1280, 720], xxhdpi: [1600, 960], xxxhdpi: [1920, 1280] };
  for(const [app, a] of Object.entries(APPS)){
    const res = path.join(root, "apps", app, "res");
    for(const [d, k] of Object.entries(DENS)){
      const n = Math.round(48 * k), f = Math.round(108 * k);
      await render(path.join(res, "mipmap-" + d, "ic_launcher.png"), icon.legacy(a, n), n, n, true);
      await render(path.join(res, "mipmap-" + d, "ic_launcher_round.png"), icon.round(a, n), n, n, true);
      await render(path.join(res, "mipmap-" + d, "ic_launcher_foreground.png"), icon.foreground(a, f), f, f, true);
      const [lw, lh] = SPLASH[d];
      await render(path.join(res, "drawable-land-" + d, "splash.png"), splash(a, lw, lh), lw, lh);
      await render(path.join(res, "drawable-port-" + d, "splash.png"), splash(a, lh, lw), lh, lw);
    }
    await render(path.join(res, "drawable", "splash.png"), splash(a, 480, 320), 480, 320);
    fs.writeFileSync(path.join(res, "values", "ic_launcher_background.xml"),
      `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${a.bg}</color>\n</resources>\n`);
    await render(path.join(root, "store", app, "icon-512.png"), icon.play(a, 512), 512, 512);
    await render(path.join(root, "store", app, "feature-graphic.png"), feature(a), 1024, 500);
    console.log("Drew " + a.name + ": icons, splash screens, Play icon and feature graphic");
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
