/* The SMS & USSD simulator (/sms, no sign-in) runs all 18 use cases on a fresh demo; each must end with the right
   reply. Then the USSD menu directly, the landing page and the police sign-in. */
const { run, check, api, BASE } = require("../lib");
const EXPECT = {
  "01": "BJL1234 is PAID till 7pm today", "02": "monthly pass valid to", "03": "BJL6006 is PAID till 7pm", "04": "BJL3030 is PAID till 7pm",
  "05": "covered by Demo Bank fleet", "06": "Enter your plate", "07": "BJL8080: UNPAID", "08": "First-time offender",
  "09": "for warning W-00001", "10": "Settle your warning before paying for BJL5678", "11": "Paid 2080 GMD", "12": "Repeat offender: 2nd warning",
  "13": "BJL9191: WARNING", "14": "", "15": "Text TERMS for the terms", "16": "Parking is free now", "17": "BJL2468 is PAID", "18": "BJL7002 is covered by Demo Bank"
};
run("simulator", async ({ b, watch, shot }) => {
  const p = watch(await b.newPage({ viewport: { width: 1820, height: 1000 } }), "sms");
  await p.goto(BASE + "/sms"); await p.waitForSelector("[data-s]", { timeout: 20000 });
  await api(p, "POST", "/api/sim/clock", { what: "reset" }); await p.reload(); await p.waitForSelector("[data-s]", { timeout: 20000 });
  await shot(p, "bench");
  const ids = await p.$$eval("[data-s]", x => x.map(y => y.dataset.s));
  check(ids.length === 18, "18 use cases are listed", ids.length);
  for(const id of ids){
    await p.click(`[data-s="${id}"]`);
    await p.waitForFunction(i => { const x = document.querySelector(`[data-s="${i}"]`); return x && /Run again/.test(x.textContent); }, id, { timeout: 120000 });
    const last = await p.$$eval("#th .row.i .bb", x => (x[x.length - 1] || {}).textContent || "");
    check(last.includes(EXPECT[id]), "use case " + id + (EXPECT[id] ? ": " + EXPECT[id] : ""), last);
  }
  await shot(p, "done");
  /* the USSD menu, straight through the API */
  const u = async (from, text) => (await api(p, "POST", "/api/sim/ussd", { from, text })).text || "";
  const menu = await u("3034567", "");
  check(menu.startsWith("SUNU Park") && menu.includes("1. Daily pass") && menu.includes("You have an unpaid warning"), "USSD: the driver menu, with the unpaid warning first", menu);
  check((await u("3034567", "5")).startsWith("Your plates:"), "USSD: my plates");
  check((await u("3034567", "6")).includes("sunupark.gm/terms"), "USSD: terms");
  check((await u("7300007", "")).includes("Attendant 07"), "USSD: the attendant menu");
  check((await u("7055501", "1*0*hello")).includes("not a plate number"), "USSD: a wrong plate is refused");
  /* landing page: the police sign in from their own card */
  const w = watch(await b.newPage({ viewport: { width: 1200, height: 900 } }), "web");
  await w.goto(BASE + "/"); await w.waitForSelector('a[href="/admin?police"]');
  await w.click('a[href="/admin?police"]'); await w.waitForSelector("#auUser");
  check((await w.textContent("h1")).includes("Police sign-in"), "the Police card opens the police sign-in");
  await w.fill("#auUser", "police"); await w.fill("#auPass", "police-demo"); await w.keyboard.press("Enter");
  await w.waitForSelector(".eside", { timeout: 15000 });
  check((await w.textContent("h1")).includes("Fines tracking"), "the demo police account opens Fines tracking");
  const nav = await w.$$eval(".eside .enav", x => x.map(y => y.textContent.trim()).join("|"));
  check(!/Dashboard|Payments|Tariffs/.test(nav), "the police see no other back-office pages", nav);
  await shot(w, "police");
});
