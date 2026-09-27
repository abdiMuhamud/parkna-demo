/* Parity fixtures: runs the original JavaScript engine (frontend/shared/engine.js) and records, for every step,
   the response and the full state. The Java engine must reproduce them exactly (ParityTest in the backend).

   node scripts/parity/generate.js <out-dir> [randomRuns] [stepsPerRun]

   Writes <out-dir>/story.jsonl (a scripted walk through every feature) and <out-dir>/random-<n>.jsonl.
   Each line: {"step": {...}, "res": <response JSON or null>, "snap": <state JSON>}; the first line is the
   starting state. A step is {"act": {...}} (an action, then the version bump the server does),
   {"tick": true} (one minute of the demo clock) or {"sync": {"date": "2026-11-5", "min": 600}}. */
const fs = require("fs"), path = require("path"), vm = require("vm");

const out = process.argv[2];
if(!out){ console.error("usage: node scripts/parity/generate.js <out-dir> [randomRuns] [stepsPerRun]"); process.exit(2); }
const RUNS = +(process.argv[3] || 6), STEPS = +(process.argv[4] || 1500);
fs.mkdirSync(out, { recursive: true });
const src = fs.readFileSync(path.join(__dirname, "..", "..", "frontend", "shared", "engine.js"), "utf8");

function engine(){
  const ctx = { console, Math, Date, JSON, Object, Array, String, Number, isNaN };
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: "engine.js" });
  vm.runInContext("function __bump(){ return ++VER; } function __state(){ return { B: B, OFF: OFF, ORGA: ORGA, NUMS: NUMS, PLATES: PLATES, EXC: EXC, T: T }; }", ctx);
  ctx.reset();
  return ctx;
}
const replacer = function(k, v){ const raw = this[k]; return raw instanceof Date ? { $d: raw.getFullYear()+"-"+(raw.getMonth()+1)+"-"+raw.getDate() } : v; };

function recorder(file){
  const E = engine(), lines = [];
  lines.push(JSON.stringify({ step: null, res: null, snap: E.snapshot() }));
  return {
    E,
    /* runs one step; returns false (and restores the state) if the JS engine crashed on it */
    run(step){
      const before = E.snapshot();
      let res = null;
      try {
        if(step.act){ res = JSON.stringify(E.act(step.act), replacer); vm.runInContext("__bump()", E); }
        else if(step.tick){ if(E.tickMinute()) vm.runInContext("__bump()", E); }
      } catch(e){ E.hydrate(before); return false; }
      lines.push(JSON.stringify({ step, res: res === undefined ? null : res, snap: E.snapshot() }));
      return true;
    },
    save(){ fs.writeFileSync(path.join(out, file), lines.join("\n") + "\n"); return lines.length - 1; },
  };
}

/* ---------------- the scripted story ---------------- */
function story(){
  const r = recorder("story.jsonl"), A = a => r.run({ act: a });
  const DRV = ["7012345","3034567","7023456","3078901","7055501","7045678","7089012"];
  A({ type: "driver.login", num: "7012345" });
  A({ type: "driver.login", num: "+220 701 2345" });
  A({ type: "driver.login", num: "7300007" });
  A({ type: "driver.login", num: "12" });
  A({ type: "driver.login", num: "7999999" });
  A({ type: "driver.login", num: "7999999", name: "  Awa New  " });
  A({ type: "driver.addPlate", num: "7012345", plate: "bjl 4242" });
  A({ type: "driver.addPlate", num: "7012345", plate: "not a plate" });
  A({ type: "driver.addPlate", num: "7012345", plate: "BJL-4243" });
  A({ type: "driver.focus", num: "7012345", plate: "BJL4242" });
  A({ type: "driver.removePlate", num: "7012345", plate: "BJL4242" });
  A({ type: "driver.pay", num: "7012345", plate: "BJL4243", prov: "Wave" });
  A({ type: "driver.pay", num: "7012345", plate: "BJL4243", prov: "Wave" });
  A({ type: "driver.pay", num: "7012345", plate: "BJL4243", kind: "monthly", prov: "APS" });
  A({ type: "driver.pay", num: "7045678", plate: "BJL3030", prov: "Wave" });
  A({ type: "driver.pay", num: "7045678", plate: "BJL3030", prov: "Bitcoin" });
  A({ type: "driver.pay", num: "7045678", plate: "BJL3030", prov: "QMoney" });
  A({ type: "driver.pay", num: "7089012", plate: "BJL7001", prov: "Wave" });
  A({ type: "driver.pay", num: "3078901", plate: "BJL7777", prov: "Wave" });
  A({ type: "driver.pay", num: "3078901", plate: "BJL7777", kind: "monthly", prov: "Wave" });
  A({ type: "driver.pay", num: "3078901", plate: "BJL7777", kind: "monthly", prov: "Afrimoney" });
  for(const t of ["", "  ", "hello", "HELP", "info", "START", "END", "BJL8080", "7", "2", "BJL8080", "M", "m bjl8080", "M XX", "1", "BJL7001", "BJL7777", "12", "bjl 5678", "5", "3"]) A({ type: "sms", num: "7055501", text: t });
  for(const t of ["M", "1", "BJL1234", "9", "4"]) A({ type: "sms", num: "3034567", text: t });
  A({ type: "sms", num: "7099999", text: "Hi" });
  A({ type: "sms", num: "7099999", text: "BJL9191" });
  A({ type: "sms", num: "7099999", text: "2" });
  A({ type: "officer.login", num: "7300007" });
  A({ type: "officer.login", num: "7012345" });
  for(const t of ["BJL9191", "hello", "12", "START", "START", "BJL9191", "BJL8080", "BJL7001", "BJL7777", "BJL4545", "junk1", "BJL9191"]) A({ type: "sms", num: "7300007", text: t });
  A({ type: "sms", num: "7012345", text: "BJL9191" });
  A({ type: "sms", num: "7012345", text: "1" });
  A({ type: "sms", num: "7300007", text: "BJL9191" });
  A({ type: "back.reassign", off: "7300007", road: "WEL" });
  A({ type: "back.reassign", off: "7300007", road: "LEM" });
  A({ type: "back.reassign", off: "7300099", road: "LEM" });
  A({ type: "sms", num: "7300007", text: "BJL6006" });
  A({ type: "sms", num: "7300012", text: "START" });
  A({ type: "sms", num: "7300012", text: "BJL9191" });
  A({ type: "sms", num: "7300012", text: "BJL5555" });
  A({ type: "sms", num: "7300012", text: "bjl5555" });
  A({ type: "sms", num: "7300012", text: "BJL5556" });
  A({ type: "sms", num: "7300007", text: "END" });
  A({ type: "sms", num: "7300007", text: "END" });
  A({ type: "back.register", name: "Kaddy Njie", phone: "7300052", road: "WEL", shift: "AM" });
  A({ type: "sms", num: "7300052", text: "START" });
  A({ type: "sms", num: "7300052", text: "BJL5555" });
  A({ type: "back.register", name: "", phone: "7300050" });
  A({ type: "back.register", name: "Fatou Ceesay", phone: "73" });
  A({ type: "back.register", name: "Fatou Ceesay", phone: "7300007" });
  A({ type: "back.register", name: " Fatou  Ceesay ", phone: "730-0050", road: "IND", shift: "PM", staff: "BCC-0450" });
  A({ type: "back.register", name: "Ousman", phone: "7300051" });
  A({ type: "sms", num: "7300050", text: "start" });
  A({ type: "org.sendCode", phone: "7101234" });
  A({ type: "org.sendCode", phone: "7000000" });
  A({ type: "org.login", phone: "7101234", code: "000000" });
  A({ type: "org.login", phone: "7101234", code: " 482913 " });
  A({ type: "org.addPlate", org: "ORG-014", plate: "BJL7010", dept: "Ops", driver: "Sainabou" });
  A({ type: "org.addPlate", org: "ORG-014", plate: "BJL7010" });
  A({ type: "org.addPlate", org: "ORG-014", plate: "?" });
  A({ type: "org.addPlates", org: "ORG-014", rows: [{ p: "BJL7011", dept: "A" }, { p: "bad" }, { p: "BJL7001" }, { p: "BJL7012", driver: "Lamin" }] });
  A({ type: "org.removePlate", org: "ORG-014", plate: "BJL7003" });
  A({ type: "sms", num: "7300012", text: "BJL7011" });
  A({ type: "back.createOrg", name: "", plates: 3, contact: "X", phone: "7200001", signed: true });
  A({ type: "back.createOrg", name: "Gambia Ports", plates: 0, contact: "X", phone: "7200001", signed: true });
  A({ type: "back.createOrg", name: "Gambia Ports", plates: "3", contact: "", phone: "7200001", signed: true });
  A({ type: "back.createOrg", name: "Gambia Ports", plates: "3", contact: "Musa", phone: "7200001" });
  A({ type: "back.createOrg", name: " Gambia Ports ", plates: "3", contact: " Musa J. ", phone: "720 0001", signed: true, disc: "0.2" });
  A({ type: "back.createOrg", name: "Kairaba Hotel", plates: 2, contact: "Aji", phone: "7200002", signed: true });
  A({ type: "org.addPlate", org: "ORG-015", plate: "BJL8001" });
  A({ type: "back.publish", daily: "abc", auth: "x" });
  A({ type: "back.publish", daily: 200, auth: "x" });
  A({ type: "back.publish", daily: 250, auth: " " });
  A({ type: "back.publish", daily: "249.6", auth: "BCC resolution 12/2026" });
  A({ type: "back.exception", plate: "BJL4545", detail: "Wrong plate typed" });
  A({ type: "back.exception", kind: "Double payment" });
  A({ type: "back.refer", i: 0 });
  A({ type: "back.refer", i: "7" });
  A({ type: "clock.set", min: 1150 });
  A({ type: "sms", num: "7055501", text: "BJL8080" });
  A({ type: "sms", num: "7300012", text: "BJL8080" });
  A({ type: "driver.pay", num: "7055501", plate: "BJL8080", prov: "Wave" });
  A({ type: "clock.add", min: -500 });
  A({ type: "clock.add", min: 5000 });
  A({ type: "clock.run", on: false });
  r.run({ tick: true });
  A({ type: "clock.run", on: true });
  A({ type: "clock.set", min: 1437 });
  for(let i = 0; i < 4; i++) r.run({ tick: true });
  /* run the calendar through invoicing (25 Nov), the due date (1 Dec), grace and reverting */
  for(let d = 0; d < 45; d++){
    A({ type: "clock.nextDay" });
    A({ type: "clock.set", min: 600 + d * 7 % 400 });
    const who = DRV[d % DRV.length];
    A({ type: "sms", num: who, text: d % 3 ? "BJL7002" : "M" });
    A({ type: "sms", num: who, text: String(1 + d % 4) });
    if(d % 5 === 0){ A({ type: "sms", num: "7300007", text: "START" }); A({ type: "sms", num: "7300007", text: "BJL7002" }); A({ type: "sms", num: "7300007", text: "BJL7009" }); }
    if(d === 30) A({ type: "org.uploadProof", org: "ORG-014", inv: "INV-2612-014" });
    if(d === 36) A({ type: "back.match", org: "ORG-015", inv: "INV-2612-015" });
    if(d === 37) A({ type: "org.payWallet", org: "ORG-016", inv: "INV-2612-016" });
    if(d === 38) A({ type: "org.payWallet", org: "ORG-014", inv: "INV-2612-014" });
    if(d === 40) A({ type: "back.match", org: "ORG-014", inv: "INV-2612-014" });
  }
  A({ type: "nothing.here" });
  A({ type: "demo.reset" });
  A({ type: "sms", num: "7055501", text: "BJL8080" });
  return r.save();
}

/* ---------------- random runs ---------------- */
function rng(seed){ return function(){ seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function randomRun(n){
  const R = rng(1000 + n), r = recorder("random-" + n + ".jsonl"), E = r.E;
  const pick = a => a[Math.floor(R() * a.length)], chance = p => R() < p, int = (a, b) => a + Math.floor(R() * (b - a + 1));
  const S = () => vm.runInContext("__state()", E);
  const PLATES = ["BJL1234","BJL5678","BJL2211","BJL7777","BJL8080","BJL3030","BJL7001","BJL7002","BJL7003","BJL7009","BJL9191","BJL4545","BJL6006"];
  const plate = () => chance(0.8) ? pick(PLATES) : pick(["bjl " + int(1, 9999), "KMC" + int(1, 999), "BJL" + int(1000, 1100) + "A", "X1", "", "BJL-" + int(10, 99), "ABCDE12"]);
  const driverNum = () => chance(0.7) ? pick(Object.keys(S().NUMS).filter(k => !S().OFF[k])) || "7012345" : pick(["7" + int(100000, 999999), "3" + int(100000, 999999), "12345", "+220 7" + int(100000, 999999)]);
  const officerNum = () => pick(Object.keys(S().OFF));
  const orgId = () => chance(0.95) ? pick(Object.keys(S().ORGA)) : "ORG-999";
  const invOf = id => { const o = S().ORGA[id]; return o && o.invoices.length ? pick(o.invoices).no : "INV-NONE"; };
  const smsText = () => pick([plate(), plate(), String(int(0, 5)), String(int(0, 5)), "START", "END", "HELP", "INFO", "M", "M " + plate(), "m " + pick(PLATES), "hello", "  ", "12", "stop"]);
  const acts = [
    [8, () => ({ type: "sms", num: driverNum(), text: smsText() })],
    [8, () => ({ type: "sms", num: officerNum(), text: pick(["START", "END", plate(), plate(), plate(), "x", "9"]) })],
    [5, () => ({ type: "driver.pay", num: driverNum(), plate: plate(), kind: chance(0.25) ? "monthly" : undefined, prov: chance(0.95) ? pick(["Wave", "Afrimoney", "APS", "QMoney"]) : "Cash" })],
    [2, () => ({ type: "driver.login", num: driverNum(), name: chance(0.5) ? pick(["Ali", " Binta ", ""]) : undefined })],
    [2, () => ({ type: "driver.addPlate", num: driverNum(), plate: plate() })],
    [1, () => ({ type: "driver.removePlate", num: driverNum(), plate: pick(PLATES) })],
    [1, () => ({ type: "driver.focus", num: driverNum(), plate: pick(PLATES) })],
    [1, () => ({ type: "officer.login", num: chance(0.8) ? officerNum() : driverNum() })],
    [1, () => ({ type: "org.sendCode", phone: chance(0.8) ? pick(Object.values(S().ORGA)).contact.num : "7000001" })],
    [1, () => ({ type: "org.login", phone: pick(Object.values(S().ORGA)).contact.num, code: chance(0.7) ? "482913" : "1" })],
    [2, () => ({ type: "org.addPlate", org: orgId(), plate: plate(), dept: chance(0.5) ? "Ops" : undefined })],
    [1, () => ({ type: "org.addPlates", org: pick(Object.keys(S().ORGA)), rows: [{ p: plate() }, { p: plate(), driver: "D" }] })],
    [1, () => ({ type: "org.removePlate", org: pick(Object.keys(S().ORGA)), plate: pick(PLATES) })],
    [1, () => { const id = pick(Object.keys(S().ORGA)); return { type: "org.uploadProof", org: id, inv: invOf(id) }; }],
    [1, () => { const id = pick(Object.keys(S().ORGA)); return { type: "org.payWallet", org: id, inv: invOf(id) }; }],
    [1, () => { const id = pick(Object.keys(S().ORGA)); return { type: "back.match", org: id, inv: invOf(id) }; }],
    [1, () => ({ type: "back.register", name: pick(["Lamin Bojang", "", "Isatou"]), phone: chance(0.8) ? "73" + int(10000, 99999) : "1", road: pick(["WEL", "LIB", "IND", "LEM", "RUS"]), shift: pick(["AM", "PM"]) })],
    [1, () => ({ type: "back.reassign", off: officerNum(), road: pick(["WEL", "LIB", "IND", "LEM", "RUS"]) })],
    [0.5, () => ({ type: "back.createOrg", name: pick(["Acme", "", "Serrekunda Motors"]), plates: pick([0, 2, "5", 1.5]), contact: pick(["Ama", ""]), phone: "72" + int(10000, 99999), signed: chance(0.8), disc: pick([undefined, 0.1, "0.25", 0]) })],
    [0.5, () => ({ type: "back.publish", daily: pick([int(40, 400), "300", 2100, "x"]), auth: chance(0.8) ? "Ref " + int(1, 99) : "" })],
    [0.5, () => ({ type: "back.exception", plate: chance(0.7) ? pick(PLATES) : undefined, detail: chance(0.5) ? "note" : undefined })],
    [0.5, () => ({ type: "back.refer", i: int(0, 3) })],
    [2, () => ({ type: "clock.set", min: int(300, 1300) })],
    [1, () => ({ type: "clock.add", min: pick([-60, 60, 30, -600, 900]) })],
    [2.5, () => ({ type: "clock.nextDay" })],
    [0.5, () => ({ type: "clock.run", on: chance(0.7) })],
    [0.1, () => ({ type: "demo.reset" })],
  ];
  const total = acts.reduce((s, a) => s + a[0], 0);
  let done = 0;
  while(done < STEPS){
    if(chance(0.05)){ r.run({ tick: true }); done++; continue; }
    let x = R() * total, f = acts[acts.length - 1][1];
    for(const [w, g] of acts){ if(x < w){ f = g; break; } x -= w; }
    if(r.run({ act: f() })) done++;
  }
  return r.save();
}

console.log("story: " + story() + " steps");
for(let n = 1; n <= RUNS; n++) console.log("random-" + n + ": " + randomRun(n) + " steps");
