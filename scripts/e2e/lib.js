/* Shared helpers for the SUNU Park browser tests (scripts/e2e/tests). Environment from run.sh: BASE, ADMIN_PW, OUT. */
const path = require("path"), fs = require("fs");
function playwright(){
  try { return require("playwright"); } catch(e){}
  const g = require("child_process").execSync("npm root -g").toString().trim();
  return require(path.join(g, "playwright"));
}
const BASE = process.env.BASE || "http://127.0.0.1:8188", OUT = process.env.OUT || ".", NEWPW = "banjul-parking-2026";
fs.mkdirSync(OUT, { recursive: true });

let failures = 0;
function check(ok, what, detail){
  if(ok) console.log("   ✓ " + what);
  else { failures++; console.log("   ✗ " + what + (detail ? "  →  " + String(detail).replace(/\s+/g, " ").slice(0, 220) : "")); }
}

/* runs a test: opens Chromium, collects page errors, fails the process on any failed check or error */
async function run(name, fn){
  const { chromium } = playwright();
  const b = await chromium.launch(), errs = [];
  const watch = (p, label) => { p.on("pageerror", e => errs.push(label + ": " + e.message)); p.on("dialog", d => d.accept()); return p; };
  try { await fn({ b, watch, shot: async (p, n) => { await p.waitForTimeout(400); await p.screenshot({ path: path.join(OUT, name + "-" + n + ".png") }); } }); }
  catch(e){ failures++; console.log("   ✗ " + name + " stopped: " + e.message.split("\n")[0]); }
  finally { await b.close(); }
  check(!errs.length, "no JavaScript errors on the pages", errs.join(" | "));
  process.exit(failures ? 1 : 0);
}

/* a phone: an app page, connected to the server, with the terms read and accepted if they show */
async function phone(b, watch, label){
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  return { ctx, page: async () => watch(await ctx.newPage(), label) };
}
async function acceptTerms(p){
  await p.waitForSelector("#tBox h3", { timeout: 15000 });
  await p.$eval("#tBox", x => { x.scrollTop = x.scrollHeight; });
  await p.waitForTimeout(400);
  await p.click("#tAgree");
  await p.click('[data-tg="agree"]');
}
async function openApp(p, app){
  await p.goto(BASE + "/" + app + "/");
  await p.waitForSelector("#srv, .onb, #siPhone, #tBox", { timeout: 20000 });
  if(await p.$("#srv")){ await p.fill("#srv", BASE); await p.click('[data-a="connect"]'); await p.waitForSelector(".onb, #siPhone, #tBox", { timeout: 20000 }); }
  if(await p.$(".onb")) await p.click('[data-si="skip"]');
  await p.waitForSelector("#siPhone, #tBox h3", { timeout: 20000 });
  if(await p.$("#tBox")) await acceptTerms(p);
  await p.waitForSelector("#siPhone", { timeout: 20000 });
}
async function signIn(p, app, num){
  await openApp(p, app);
  await p.fill("#siPhone", num); await p.click('[data-si="send"]');
  await p.waitForSelector(".otp", { timeout: 15000 }); await p.click('[data-si="verify"]');
  await p.waitForSelector(".tabs, #tBox", { timeout: 20000 });
  if(await p.$("#tBox")){ await acceptTerms(p); await p.waitForSelector(".tabs", { timeout: 20000 }); }
  await p.waitForFunction(() => !document.getElementById("splash"), null, { timeout: 20000 });
}
/* the back office as admin: the first sign-in chooses the password used from then on */
async function adminSignIn(p){
  await p.goto(BASE + "/admin"); await p.waitForSelector("#auUser");
  for(const pw of [process.env.ADMIN_PW, NEWPW]){
    if(!pw) continue;
    await p.fill("#auUser", "admin"); await p.fill("#auPass", pw); await p.keyboard.press("Enter");
    await p.waitForSelector(".eside, #pwNext, .eerr", { timeout: 15000 });
    if(await p.$("#pwNext")){ await p.fill("#pwCur", pw); await p.fill("#pwNext", NEWPW); await p.fill("#pwAgain", NEWPW); await p.click('[data-a="savepw"]'); await p.waitForSelector(".eside", { timeout: 15000 }); }
    if(await p.$(".eside")) return;
  }
  throw new Error("the admin account could not sign in");
}
async function api(p, method, route, body){
  return p.evaluate(async ([m, r, bd]) => (await fetch(r, { method: m, headers: { "Content-Type": "application/json" }, body: bd ? JSON.stringify(bd) : undefined })).json(), [method, route, body]);
}
module.exports = { BASE, OUT, check, run, phone, openApp, signIn, acceptTerms, adminSignIn, api };
