/* Draws the app icons, splash screens and Google Play graphics for both apps in the look of "SUNU Park Final Designs"
   (Plus Jakarta Sans, SUNU Park navy #0B2E63, sun yellow #FEDB46, pale blue #F6FBFE, the Banjul scene art). Output:
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
const NAVY = "#0B2E63", HERO = "#0D2F5D", INK = "#0A1B4D", YELLOW = "#FEDB46", BG = "#F6FBFE", MUTED = "#63709E";
const font = w => "data:font/woff2;base64," + fs.readFileSync(path.join(root, "frontend/shared/fonts/jakarta-" + w + ".woff2")).toString("base64");
const crest = "data:image/png;base64," + fs.readFileSync(path.join(root, "frontend/shared/img/crest.png")).toString("base64");
const art = n => "data:image/webp;base64," + fs.readFileSync(path.join(root, "frontend/shared/img/art/" + n + ".webp")).toString("base64");
const HEAD = `<style>@font-face{font-family:J;font-weight:800;src:url(${font(800)})}@font-face{font-family:J;font-weight:600;src:url(${font(600)})}@font-face{font-family:J;font-weight:700;src:url(${font(700)})}
  *{margin:0;box-sizing:border-box}html,body{background:transparent}body{font-family:J,sans-serif}</style>`;

const APPS = {
  driver: { name: "SUNU Park", bg: NAVY, fg: YELLOW, badge: false,
    title: "Park smarter in Banjul", line: "Pay for parking from your phone,<br>without cash or queues.", cta: "Pay for Parking" },
  officer: { name: "SUNU Park Officer", bg: YELLOW, fg: NAVY, badge: true,
    title: "Check plates, not cash", line: "Start your shift, check plates on<br>your road and end your shift.", cta: "Check a plate" }
};

/* the "P" mark on a 108 x 108 canvas (the adaptive icon grid: keep it inside the 66-unit safe circle) */
function mark(a, scale){
  const s = scale || 1, cx = 54, cy = 54;
  const badge = a.badge ? `<circle cx="${cx + 19 * s}" cy="${cy + 17 * s}" r="${10.5 * s}" fill="${NAVY}" stroke="${a.bg}" stroke-width="${3 * s}"/>
    <path d="M${cx + 14.5 * s} ${cy + 17 * s} l${3.4 * s} ${3.4 * s} l${6 * s} ${-6.6 * s}" fill="none" stroke="${YELLOW}" stroke-width="${2.8 * s}" stroke-linecap="round" stroke-linejoin="round"/>` : "";
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
/* the launch screen: the same mark, words and places as the apps' animated launch screen (#splash), so the hand-over
   from Android's splash to the app is seamless */
function splash(a, w, h){
  const u = Math.min(w, h) / 360;
  return `<div style="width:${w}px;height:${h}px;background:${BG};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${10 * u}px">
    <div style="width:${132 * u}px;height:${132 * u}px;display:grid;place-items:center;margin-bottom:${8 * u}px">
      <div style="width:${96 * u}px;height:${96 * u}px;border-radius:${26 * u}px;background:${a.bg};display:grid;place-items:center;box-shadow:0 ${14 * u}px ${30 * u}px -${14 * u}px rgba(10,27,77,.55)">
        <svg width="${92 * u}" height="${92 * u}" viewBox="0 0 108 108">${mark(Object.assign({}, a, { badge: false }), 1)}</svg></div></div>
    <div style="font-weight:700;font-size:${11 * u}px;color:${NAVY};letter-spacing:.24em;margin-top:${6 * u}px">BANJUL CITY COUNCIL</div>
    <div style="font-weight:800;font-size:${34 * u}px;color:${INK};letter-spacing:-.02em;line-height:1">SUNU Park</div>
    <div style="font-weight:600;font-size:${13 * u}px;color:${MUTED}">Our park · Our parking</div></div>`;
}
/* the home screen's navy card: Banjul scene on the right, big white title, yellow call to action */
function feature(a){
  return `<div style="width:1024px;height:500px;background:${HERO};color:#fff;position:relative;overflow:hidden;display:flex;align-items:center;padding:0 64px">
    <img src="${art("hero-scene")}" style="position:absolute;right:-6px;top:-6px;height:512px;width:590px;object-fit:cover;object-position:right top;-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 34%)">
    <div style="position:relative;max-width:560px"><div style="display:flex;align-items:center;gap:16px"><div style="width:74px;height:74px;border-radius:20px;background:#fff;display:grid;place-items:center"><img src="${crest}" style="width:58px"></div>
      <div><div style="font-size:13px;font-weight:700;letter-spacing:.24em;color:#E6ECF6">BANJUL CITY COUNCIL</div><div style="font-size:34px;font-weight:800;letter-spacing:-.02em;line-height:1.05">${a.name}</div></div></div>
      <div style="font-size:54px;font-weight:800;letter-spacing:-.04em;margin-top:30px;line-height:1.02">${a.title}</div>
      <div style="font-size:23px;font-weight:600;color:#E6ECF6;margin-top:16px;line-height:1.35">${a.line}</div>
      <div style="display:inline-flex;align-items:center;gap:18px;margin-top:26px;height:52px;padding:0 22px 0 26px;border-radius:999px;background:${YELLOW};color:${INK};font-size:19px;font-weight:700">${a.cta}
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></div></div></div>`;
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
