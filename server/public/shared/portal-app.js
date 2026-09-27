/* ParkNa portals v0.1 : wiring the portal screens to the demo server */
const $ = id => document.getElementById(id);
const IC = { checkD: '<svg width="14" height="14" viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="#0E0F14" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>' };
const ROLE = document.body.dataset.role;            /* "org" or "back" */
const STAGE = ROLE === "org" ? "stOrg" : "stBack";
OS = freshOS(); BS = freshBS();
let SESSION = PN.ls("parkna.org") || null;
let seenOut = null;

function renderAll(){ if(!PN.ready) return; if(ROLE === "org") renderOrg(); else { renderBack(); renderDemo(); } }
function afterState(){
  if(ROLE === "org"){
    for(const k in ORGA) ORGA[k].session = false;
    if(SESSION && ORGA[SESSION]){ ORGA[SESSION].session = true; OS.org = SESSION; }
    else if(!ORGA[OS.org]) OS.org = "ORG-014";
  }
  notesFromOut();
  renderAll();
}
function notesFromOut(){
  const ids = OUT.map(m => m.id);
  if(seenOut === null){ seenOut = new Set(ids); return; }
  const fresh = OUT.filter(m => !seenOut.has(m.id)).reverse();
  ids.forEach(i => seenOut.add(i));
  fresh.forEach(m => {
    if(ROLE === "org"){ const o = ORGA[OS.org]; if(!o || m.num !== o.contact.num) return; }
    note(m);
  });
}
function note(m){
  const box = $("notes"), d = document.createElement("div"); d.className = "note";
  d.innerHTML = `<span class="av">PN</span><div><small><span>SMS to ${esc(N(m.num).name)}${m.tag ? " · " + esc(m.tag) : ""}</span><span>${m.t}</span></small><p>${esc(m.text)}</p></div>`;
  box.prepend(d); while(box.children.length > 3) box.lastChild.remove();
  setTimeout(() => { d.classList.add("out"); setTimeout(() => d.remove(), 320); }, 7000);
}
async function call(a){ const r = await PN.act(a); return r || { err: "No answer from the server" }; }

/* ---------- organisation portal actions ---------- */
async function orgAct(a, v){
  const o = ORGA[OS.org];
  switch(a){
    case "sendcode": {
      const r = await call({ type: "org.sendCode", phone: OS.login.phone });
      if(r.err){ OS.login.err = r.err; return renderOrg(); }
      OS.login.err = ""; OS.login.sent = true; OS.org = r.org; renderOrg();
      return wtoast(STAGE, "Code sent by SMS to the contact’s phone");
    }
    case "signin": {
      const r = await call({ type: "org.login", phone: OS.login.phone, code: OS.login.code });
      if(r.err){ OS.login.err = r.err; return renderOrg(); }
      SESSION = r.org; PN.ls("parkna.org", r.org); OS.org = r.org; OS.login = freshOS().login; OS.view = "overview";
      afterState(); return wtoast(STAGE, "Signed in as " + ORGA[r.org].contact.name);
    }
    case "user": if(confirm("Sign out of the organisation portal?")){ SESSION = null; PN.ls("parkna.org", null); OS = freshOS(); afterState(); } return;
    case "addplate": {
      const r = await call({ type: "org.addPlate", org: o.id, plate: OS.add.plate, dept: OS.add.dept, driver: OS.add.driver });
      if(r.err){ OS.add.err = r.err; return renderOrg(); }
      OS.add = freshOS().add; renderOrg();
      return wtoast(STAGE, `${r.plate} covered from today · pro-rata GMD ${gmd(r.proRata)} on the next invoice`);
    }
    case "confirmup": {
      const rows = OS.upload.rows.filter(r => r.ok === "ready").map(r => ({ p: r.p, dept: r.dept, driver: r.driver }));
      await call({ type: "org.addPlates", org: o.id, rows }); OS.upload = null; renderOrg();
      return wtoast(STAGE, `${rows.length} plates added · covered from today`);
    }
    case "remove": await call({ type: "org.removePlate", org: o.id, plate: v }); return wtoast(STAGE, `${v}: cover stops at midnight`);
    case "uploadproof": await call({ type: "org.uploadProof", org: o.id, inv: OS.inv }); return wtoast(STAGE, "Proof uploaded · ParkNa Admin will match it");
    case "paywallet": { const r = await call({ type: "org.payWallet", org: o.id, inv: OS.inv }); if(r.err) return wtoast(STAGE, r.err); return wtoast(STAGE, "Paid · receipt sent by SMS"); }
    default: return orgActUI(a, v);
  }
}
/* ---------- back office actions ---------- */
async function backAct(a, v){
  switch(a){
    case "register": {
      const F = BS.reg, r = await call({ type: "back.register", name: F.name, staff: F.staff, phone: F.phone, road: F.road, shift: F.shift });
      if(r.err){ F.err = r.err; return renderBack(); }
      BS.reg = freshBS().reg; BS.view = "attendants"; renderBack();
      return wtoast(STAGE, `Attendant ${r.id} registered · welcome SMS sent`);
    }
    case "reassign": {
      const R = BS.re, r = await call({ type: "back.reassign", off: R.off, road: R.road });
      if(r.err){ R.err = r.err; return renderBack(); }
      R.err = ""; return wtoast(STAGE, `Attendant ${OFF[R.off].id} moved to ${ROADS[R.road].name} · SMS sent`);
    }
    case "createorg": {
      const F = BS.no, r = await call({ type: "back.createOrg", name: F.name, plates: F.plates, disc: F.disc, contact: F.contact, phone: F.phone, signed: F.signed });
      if(r.err){ F.err = r.err; return renderBack(); }
      BS.no = freshBS().no; BS.view = "orgs"; renderBack();
      return wtoast(STAGE, `${r.id} created · login SMS sent`);
    }
    case "match": { const [org, inv] = v.split("|"); await call({ type: "back.match", org, inv }); return wtoast(STAGE, `${inv} matched · the organisation is notified by SMS`); }
    case "refer": await call({ type: "back.refer", i: v }); return wtoast(STAGE, "Referred to Finance for the refund decision");
    case "publish": {
      const F = BS.tar, r = await call({ type: "back.publish", daily: F.daily === "" ? T.daily : F.daily, auth: F.auth });
      if(r.err){ F.err = r.err; return renderBack(); }
      BS.tar = freshBS().tar; renderBack();
      return wtoast(STAGE, "Published to SMS, app, portal and cards");
    }
    case "user": return;
    default: return backActUI(a, v);
  }
}

/* ---------- demo controls (back office) ---------- */
let demoMin = PN.ls("parkna.demo.min") === "1";
function renderDemo(){
  const el = $("demo"); if(!el) return;
  el.className = "demo" + (demoMin ? " min" : "");
  el.innerHTML = `<span class="dot${PN.online ? "" : " off"}"></span><span><small>Demo clock</small><b>${DOW[B.date.getDay()]} ${fmtD(B.date)} · ${hm(B.min)}</b></span>
    <span class="x" style="display:${demoMin ? "none" : "flex"};gap:6px">
      <button data-d="add" data-v="-60">−1h</button><button data-d="add" data-v="60">+1h</button>
      <button data-d="set" data-v="420">07:00</button><button data-d="set" data-v="600">10:00</button><button data-d="set" data-v="1160">19:20</button>
      <button data-d="next" class="y">Next day</button><button data-d="run">${B.run ? "Pause" : "Run"}</button>
      <button data-d="exc">+ Exception</button><button data-d="reset" class="r">Reset demo</button></span>
    <button data-d="min">${demoMin ? "Show" : "Hide"}</button>`;
}
document.addEventListener("click", async e => {
  const b = e.target.closest("[data-d]"); if(!b) return;
  const d = b.dataset.d, v = +b.dataset.v;
  if(d === "min"){ demoMin = !demoMin; PN.ls("parkna.demo.min", demoMin ? "1" : "0"); return renderDemo(); }
  if(d === "add") return call({ type: "clock.add", min: v });
  if(d === "set") return call({ type: "clock.set", min: v });
  if(d === "next") return call({ type: "clock.nextDay" });
  if(d === "run") return call({ type: "clock.run", on: !B.run });
  if(d === "exc"){
    const last = LOG.find(l => l.plate && !l.bad);
    if(!last) return wtoast(STAGE, "No payment yet to raise an exception on");
    await call({ type: "back.exception", kind: "Wrong-plate payment", plate: last.plate, detail: `${last.ticket} paid for ${last.plate} at ${last.t}. The driver called the call centre: it was the wrong plate.` });
    return wtoast(STAGE, "Exception recorded · see Payments");
  }
  if(d === "reset" && confirm("Reset the whole demo? All payments, checks and changes are cleared for every phone and portal.")) return call({ type: "demo.reset" });
});

/* ---------- start ---------- */
bindWeb(ROLE === "org" ? "orgWeb" : "backWeb", ROLE === "org" ? orgAct : backAct, ROLE === "org" ? renderOrg : renderBack);
if(!PN.server) PN.setServer(location.origin);
PN.connect(afterState, on => { $("conn").hidden = on; renderAll(); });
