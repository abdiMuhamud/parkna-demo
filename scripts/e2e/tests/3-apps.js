/* The apps and the back office together: the launch screen, the terms gate, first-time and repeat offenders,
   fines first, the police page, new terms published by an administrator that the driver must accept again, and the
   staff accounts (administrators and police). */
const { run, check, phone, signIn, openApp, adminSignIn, api, BASE } = require("../lib");
run("apps", async ({ b, watch, shot }) => {
  const actx = await b.newContext({ viewport: { width: 1440, height: 900 } }), adm = watch(await actx.newPage(), "admin");
  await adminSignIn(adm);
  await api(adm, "POST", "/api/sim/clock", { what: "reset" });
  await api(adm, "POST", "/api/sim/clock", { what: "morning" });

  /* the launch screen and the terms before signing in */
  const ph = await phone(b, watch, "phone"), off = await ph.page();
  await off.goto(BASE + "/officer/"); await off.waitForTimeout(500);
  check(!!(await off.$("#splash .sp-tile")) && !!(await off.$("#splash .sp-top")) && !!(await off.$("#splash .sp-bot")), "the launch screen shows the mark on its two halves");
  await shot(off, "launch");
  await openApp(off, "officer");
  check(await off.waitForFunction(() => !document.getElementById("splash"), null, { timeout: 10000 }).then(() => true, () => false), "the launch screen hands over to the app");

  /* attendant: a first-time warning */
  await signIn(off, "officer", "7300007");
  await off.click('.tiles [data-a="start"]'); await off.waitForSelector('.tiles [data-a="end"]', { timeout: 15000 });
  const check1 = async plate => { await off.click(".tabs .fab"); await off.waitForSelector("#chkPlate"); await off.fill("#chkPlate", plate); await off.click('[data-a="docheck"]'); await off.waitForSelector(".res", { timeout: 15000 }); await off.waitForTimeout(400); };
  await check1("BJL2211");
  await off.click('[data-a="warn"]'); await off.waitForSelector(".res h2:has-text('WARNING')", { timeout: 15000 });
  check((await off.textContent(".offb")).includes("First-time offender"), "the warning says first-time offender");
  await shot(off, "warning");
  await off.click(".sheet .x");

  /* driver: an unpaid warning on one plate blocks paying for the other */
  const drv = await ph.page();
  await signIn(drv, "driver", "3034567");
  await drv.click(".tabs .fab"); await drv.waitForSelector("#payPlate");
  await drv.fill("#payPlate", "BJL5678"); await drv.waitForTimeout(1200);
  check((await drv.textContent(".sheet")).includes("Settle your warning first"), "fines first: the other plate's warning is offered first");
  check(await drv.$eval('[data-a="dopay"]', x => x.disabled), "fines first: paying for the other plate is blocked");
  await shot(drv, "fines-first");
  await drv.click(".sheet .x");

  /* the next day the same plate is a repeat offender */
  await api(adm, "POST", "/api/sim/clock", { what: "nextDay" }); await api(adm, "POST", "/api/sim/clock", { what: "morning" });
  await off.waitForTimeout(1500);
  await off.click('.tiles [data-a="start"]'); await off.waitForSelector('.tiles [data-a="end"]', { timeout: 15000 });
  await check1("BJL2211");
  check((await off.textContent(".offb")).includes("Repeat offender"), "the next day the plate is a repeat offender");

  /* the police page lists the overdue fine (more than 24 hours after the warning) */
  await api(adm, "POST", "/api/sim/clock", { what: "hour" });
  const pol = watch(await b.newPage({ viewport: { width: 1440, height: 900 } }), "police");
  await pol.goto(BASE + "/police"); await pol.waitForSelector("#auUser");
  await pol.fill("#auUser", "police"); await pol.fill("#auPass", "police-demo"); await pol.keyboard.press("Enter");
  await pol.waitForSelector(".eside", { timeout: 15000 }); await pol.waitForTimeout(800);
  check((await pol.textContent(".emain")).includes("BJL2211"), "the police see the overdue plate");
  check(((await api(pol, "POST", "/api/act", { type: "back.settleFine", id: "W-00001", ref: "x" })).err || "").length > 0, "the police cannot change anything");
  await shot(pol, "police");

  /* new terms: published in the back office, accepted again in the app, shown on /terms */
  await adm.goto(BASE + "/admin"); await adm.waitForSelector(".eside");
  await adm.click('[data-a="nav"][data-v="terms"]'); await adm.waitForSelector("#trBody");
  await adm.fill("#trBody", (await adm.inputValue("#trBody")) + "\n\n## 9. Test section\n- Added by the browser test.");
  await adm.fill("#trNote", "Browser test"); await adm.click('[data-a="termspub"]'); await adm.waitForTimeout(2000);
  await drv.waitForSelector("#tBox h3", { timeout: 20000 });
  check((await drv.textContent(".auth")).includes("UPDATED TERMS"), "the driver is asked to accept the new terms");
  await drv.$eval("#tBox", x => { x.scrollTop = x.scrollHeight; }); await drv.waitForTimeout(400); await drv.click("#tAgree"); await drv.click('[data-tg="agree"]');
  await drv.waitForSelector(".tabs", { timeout: 15000 });
  check(true, "the driver is back in the app after accepting");
  const web = watch(await b.newPage(), "web");
  await web.goto(BASE + "/terms"); await web.waitForSelector("#body h3", { timeout: 15000 });
  check((await web.textContent("#body")).includes("Test section"), "/terms shows the new version");

  /* staff accounts: the portal's staff are administrators and police (organisations sign in with an SMS code) */
  await adm.click('[data-a="nav"][data-v="staff"]'); await adm.waitForSelector("#stNewRole");
  const roles = await adm.$$eval("#stNewRole option", x => x.map(y => y.value).join(" "));
  check(roles === "admin police council", "new staff accounts are Administrator, Police or Council", roles);
  await adm.fill("#stName", "Awa Ceesay"); await adm.fill("#stUser", "awa.ceesay"); await adm.click('[data-a="staffadd"]');
  await adm.waitForSelector(".epw", { timeout: 15000 });
  check((await adm.textContent(".emain")).includes("Police · fines tracking"), "a police account is created, with a temporary password shown once");
  await shot(adm, "staff");
});
