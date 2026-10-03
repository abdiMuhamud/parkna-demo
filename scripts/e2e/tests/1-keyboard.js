/* The apps do not flicker while typing: the field keeps its node and focus, sheets do not re-animate, the bottom
   bar hides while the keyboard is open (html.kb). */
const { run, phone, signIn, check } = require("../lib");
run("keyboard", async ({ b, watch, shot }) => {
  const ph = await phone(b, watch, "driver"), p = await ph.page();
  await signIn(p, "driver", "7055501");
  await p.click(".tabs .fab"); await p.waitForSelector("#payPlate"); await p.waitForTimeout(800);   /* the sheet's own opening animation */
  await p.evaluate(() => { window.__i = document.getElementById("payPlate"); window.__s = document.querySelector(".sheet"); window.__anim = 0;
    document.addEventListener("animationstart", e => { if(e.target.classList && e.target.classList.contains("sheet")) window.__anim++; }); });
  await p.click("#payPlate"); await p.fill("#payPlate", ""); await p.keyboard.type("BJL1234", { delay: 60 });
  await p.waitForTimeout(800);
  const same = await p.evaluate(() => document.getElementById("payPlate") === window.__i && document.querySelector(".sheet") === window.__s && document.activeElement === window.__i);
  check(same, "the plate field and the sheet stay the same while typing (no rebuild)");
  check(await p.evaluate(() => window.__anim) === 0, "the sheet does not animate again while typing");
  check((await p.inputValue("#payPlate")).replace(/\s/g, "") === "BJL1234", "the typed plate is kept");
  await p.setViewportSize({ width: 390, height: 480 }); await p.waitForTimeout(400);
  check(await p.evaluate(() => document.documentElement.classList.contains("kb")), "keyboard open: the bottom bar steps aside (html.kb)");
  await shot(p, "pay-sheet");
  await p.setViewportSize({ width: 390, height: 844 }); await p.click(".sheet .x"); await p.waitForTimeout(400);
  check(!(await p.$(".sheet")), "the sheet closes");
});
