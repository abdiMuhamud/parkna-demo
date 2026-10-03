/* The SMS & USSD simulator (/sms, no sign-in) runs all 18 use cases on a fresh demo; each must end with the right
   reply. Then the USSD menu directly, the home page with its three portal doors, and the police sign-in. */
const { run, check, api, BASE, OUT } = require("../lib");
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
  /* the home page: three portal doors (administrator, organisation, police); drivers and attendants get the apps and SMS */
  const w = watch(await b.newPage({ viewport: { width: 1280, height: 900 } }), "web");
  await w.goto(BASE + "/"); await w.waitForSelector(".door .demo:not([hidden])", { timeout: 15000 });
  const doors = await w.$$eval("a.door", x => x.map(y => y.getAttribute("href")).join(" "));
  check(doors === "/admin /org /police", "the home page has the three portal doors", doors);
  check(!(await w.$('a[href^="/driver"], a[href^="/officer"]')), "no browser copies of the driver and attendant apps");
  check((await w.textContent("#pMonthly")).includes("4,000") && (await w.textContent("#pFine")).includes("1,880") && (await w.textContent("#pAnnual")).includes("48,000"), "prices come from the tariff");
  check((await w.getAttribute("#getDriver", "href")).endsWith("/SUNU-Park-Driver.apk") && (await w.getAttribute("#getOfficer", "href")).endsWith("/SUNU-Park-Officer.apk"), "a demo server offers the newest Android apps");
  check((await w.textContent("#portal + .g")).includes("police-demo"), "the demo sign-ins are on the portal cards");
  await w.screenshot({ path: require("path").join(OUT, "simulator-home.png"), fullPage: true });
  await w.setViewportSize({ width: 390, height: 844 }); await w.waitForTimeout(300);
  check(await w.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "the home page fits a phone screen");
  await w.screenshot({ path: require("path").join(OUT, "simulator-home-phone.png"), fullPage: true });
  await w.setViewportSize({ width: 1280, height: 900 });
  await w.click('a.door[href="/org"]'); await w.waitForSelector("#auPhone");
  check((await w.textContent(".etest")).includes("7101234"), "the organisation sign-in names the demo organisation");
  await w.goto(BASE + "/"); await w.click('a.door[href="/admin"]'); await w.waitForSelector("#auUser");
  check((await w.textContent("h1")).includes("Administrator sign-in"), "the Administrator card opens the administrator sign-in");
  await w.click('.edoors a[href="/police"]'); await w.waitForURL(/\/police$/); await w.waitForSelector("#auUser");
  check((await w.textContent("h1")).includes("Police sign-in"), "the police sign-in is one click away (/police)");
  await shot(w, "police-signin");
  await w.fill("#auUser", "police"); await w.fill("#auPass", "police-demo"); await w.keyboard.press("Enter");
  await w.waitForSelector(".eside", { timeout: 15000 });
  check((await w.textContent("h1")).includes("Fines tracking"), "the demo police account opens Fines tracking");
  const nav = await w.$$eval(".eside .enav", x => x.map(y => y.textContent.trim()).join("|"));
  check(!/Dashboard|Payments|Tariffs/.test(nav), "the police see no other back-office pages", nav);
  await shot(w, "police");
});
