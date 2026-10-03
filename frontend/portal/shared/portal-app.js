/* SUNU Park portals: sign-in, live data from the SUNU Park server, and the actions that change it.
   admin.html and police.html (data-role="back"): administrators and the police sign in with a username and password
     (police.html is the same page with the police sign-in). The pages each person sees follow their role (PAGES below);
     the server checks every action again.
   org.html (data-role="org"): an organisation's billing contact signs in with a code sent to their phone by SMS. */
const $ = id => document.getElementById(id);
const IC = { checkD: '<svg width="14" height="14" viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="#0B2E63" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>' };
const ROLE = document.body.dataset.role;            /* "org" or "back" */
const STAGE = ROLE === "org" ? "stOrg" : "stBack", WEB = ROLE === "org" ? "orgWeb" : "backWeb";
PN.init({ as: ROLE === "org" ? "org" : "staff" });
PN.server = location.origin;                        /* the portals are always served by the SUNU Park server itself */
OS = freshOS(); BS = freshBS();
let seenOut = null;

/* ---------- who is signed in, and what they may do ---------- */
const ME = () => PN.me || {};
const myRole = () => ME().role || "";
const isDemo = () => !!(PN.mode && PN.mode.demo);
const STAFF_ROLES = { admin: "Administrator", supervisor: "Supervisor", finance: "Finance", police: "Police · fines tracking", council: "Council · read-only" };
/* new accounts are administrators or police (organisations sign in with an SMS code); Supervisor, Finance and Council
   accounts made before keep working and keep their role until an administrator changes it */
const NEW_ROLES = ["admin", "police"];
const roleOpts = cur => NEW_ROLES.concat(cur && !NEW_ROLES.includes(cur) ? [cur] : []).map(k => [k, NEW_ROLES.includes(k) ? STAFF_ROLES[k] : (STAFF_ROLES[k] || k) + " (old role)"]);
const PAGES = { admin: ["dash", "attendants", "orgs", "fines", "police", "payments", "tariff", "ann", "terms", "council", "staff"], supervisor: ["dash", "attendants", "fines", "police", "terms", "council"],
  finance: ["dash", "orgs", "fines", "police", "payments", "terms", "council"], police: ["police"], council: ["council", "police", "terms"] };
const pageOf = v => v === "register" ? "attendants" : v === "neworg" ? "orgs" : v;
const canSee = v => (PAGES[myRole()] || []).includes(pageOf(v));
const can = what => ({ officers: ["admin", "supervisor"], orgs: ["admin"], money: ["admin", "finance"], payers: ["admin", "finance", "supervisor"], terms: ["admin"] }[what] || []).includes(myRole());
const initialsOf = s => String(s || "?").trim().split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
const firstName = s => String(s || "").trim().split(/\s+/)[0];

/* ---------- sign-in and password forms (their inputs use data-f="AU.x" / "PW.x", see setF in portal.js) ---------- */
const freshAuth = () => ({ phone: "", code: "", sent: false, user: "", pass: "", err: "", note: "", busy: false, test: null });
const freshPW = () => ({ cur: "", next: "", again: "", err: "", busy: false });
const freshStaff = () => ({ list: null, audit: null, me: "", sel: null, add: { name: "", username: "", role: "police", err: "" }, role: "", shown: null, err: "", busy: false });
const freshTerms = () => ({ cur: null, hist: null, title: "", body: "", note: "", notify: true, err: "", busy: false });
let AUTH = freshAuth(), PW = freshPW(), STAFF = freshStaff(), TERMS = freshTerms();

function renderAll(){
  const el = $(WEB);
  if(!PN.signedIn()){ renderDemo(); el.className = "ed"; return paint(el, ROLE === "org" ? orgSignIn() : staffSignIn()); }
  if(!PN.ready){ el.className = "ed"; return paint(el, `<div class="ewait"><span class="spin"></span>Connecting to the SUNU Park server…</div>`); }
  if(ROLE === "back" && ME().mustChangePassword){ renderDemo(); el.className = "ed"; return paint(el, choosePassword()); }
  if(ROLE === "org") renderOrg(); else renderBack();
  renderDemo();
}
function afterState(){
  if(ROLE === "org") OS.org = ME().org || null;
  else if(!canSee(BS.view)) BS.view = (PAGES[myRole()] || ["council"])[0];
  notesFromOut();
  renderAll();
}
function start(){
  seenOut = null;
  PN.connect(afterState, on => { $("conn").hidden = on || !PN.signedIn(); renderAll(); });
  renderAll();
}
PN.onSignOut = expired => {
  OS = freshOS(); BS = freshBS(); PW = freshPW(); STAFF = freshStaff(); AUTH = freshAuth(); TERMS = freshTerms();
  if(expired) AUTH.note = "You were signed out. Please sign in again.";
  $("conn").hidden = true;
  renderAll();
};

async function signInAct(a){
  const F = AUTH;
  if(F.busy) return;
  const busy = on => { F.busy = on; if(on) F.err = ""; renderAll(); };
  if(a === "staffin"){
    if(!F.user.trim() || !F.pass){ F.err = "Enter your username and password."; return renderAll(); }
    busy(true);
    const r = await PN.staffLogin(F.user.trim().toLowerCase(), F.pass);
    F.pass = ""; F.busy = false;
    if(!r.ok){ F.err = r.err || "Could not sign in."; return renderAll(); }
    AUTH = freshAuth(); return start();
  }
  if(a === "sendcode" || a === "resend"){
    if(F.phone.replace(/\D/g, "").length < 7){ F.err = "Enter the contact’s 7-digit phone number."; return renderAll(); }
    busy(true);
    const r = await PN.requestCode(F.phone);
    F.busy = false;
    if(!r.ok){ F.err = r.err || "Could not send the code."; return renderAll(); }
    F.sent = true; F.code = ""; F.test = r.code || null; F.note = a === "resend" ? "A new code is on its way." : "";
    renderAll(); const c = $("auCode"); if(c) c.focus(); return;
  }
  if(a === "verify"){
    if(F.code.replace(/\D/g, "").length !== 6){ F.err = "Enter the 6-digit code from the SMS."; return renderAll(); }
    busy(true);
    const r = await PN.verifyCode(F.phone, F.code.replace(/\D/g, ""));
    F.busy = false;
    if(!r.ok){ F.err = r.err || "That code did not work."; return renderAll(); }
    AUTH = freshAuth(); return start();
  }
  if(a === "otherphone"){ const p = F.phone; AUTH = freshAuth(); AUTH.phone = p; renderAll(); const i = $("auPhone"); if(i) i.focus(); }
}
async function savePassword(){
  if(PW.busy) return;
  if(PW.next.length < 10){ PW.err = "Use at least 10 characters for the new password."; return renderAll(); }
  if(PW.next !== PW.again){ PW.err = "The two new passwords are not the same."; return renderAll(); }
  PW.busy = true; PW.err = ""; renderAll();
  const r = await PN.changePassword(PW.cur, PW.next);
  PW.busy = false;
  if(!r.ok){ PW.err = r.err || "Could not change the password."; PW.cur = ""; return renderAll(); }
  PW = freshPW(); BS.pw = false; BS.user = false;
  if(PN.me) PN.me.mustChangePassword = false;
  PN.connect();                       /* the live stream picks up the updated account */
  renderAll();
  wtoast(STAGE, "Password changed · any other browser was signed out");
}
async function signOut(){
  if(!confirm(ROLE === "org" ? "Sign out of the organisation portal?" : "Sign out of the back office?")) return;
  await PN.logout();
}
/* actions every signed-in screen shares; returns true when handled */
async function commonAct(a){
  const S = ROLE === "org" ? OS : BS;
  if(a === "user"){ S.user = !S.user; S.bell = false; S.help = false; S.pw = false; renderAll(); return true; }
  if(a === "userx"){ S.user = false; S.pw = false; PW = freshPW(); renderAll(); return true; }
  if(a === "pwopen"){ S.user = false; S.pw = true; PW = freshPW(); renderAll(); const i = $("pwCur"); if(i) i.focus(); return true; }
  if(a === "savepw"){ await savePassword(); return true; }
  if(a === "signout"){ await signOut(); return true; }
  if(a === "print"){ S.user = false; renderAll(); setTimeout(() => window.print(), 50); return true; }
  return false;
}

/* ---------- SMS notes (demo only: on a real service the SMS reach real phones) ---------- */
function notesFromOut(){
  const ids = OUT.map(m => m.id);
  if(seenOut === null || !isDemo()){ seenOut = new Set(ids); return; }
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
  if(!PN.signedIn()) return signInAct(a, v);
  if(await commonAct(a)) return;
  const o = ORGA[OS.org];
  if(!o) return;
  switch(a){
    case "addplate": {
      const r = await call({ type: "org.addPlate", org: o.id, plate: OS.add.plate, dept: OS.add.dept, driver: OS.add.driver });
      if(r.err){ OS.add.err = r.err; return renderOrg(); }
      OS.add = freshOS().add; renderOrg();
      return wtoast(STAGE, `${r.plate} added to invoice ${r.inv} · covered once it is paid`);
    }
    case "upload": { const f = $("csvFile"); if(f){ f.value = ""; f.click(); } return; }
    case "confirmup": {
      const rows = OS.upload.rows.filter(r => r.ok === "ready").map(r => ({ p: r.p, dept: r.dept, driver: r.driver }));
      const r = await call({ type: "org.addPlates", org: o.id, rows });
      if(r.err) return wtoast(STAGE, r.err);
      OS.upload = null; renderOrg();
      return wtoast(STAGE, r.inv ? `${plural(r.added, "car")} added to invoice ${r.inv} · covered once it is paid` : "No new cars to add");
    }
    case "remove":
      { const x = o.plates.find(y => y.plate === v && !y.to), waiting = x && !x.from;
        if(!confirm(waiting ? `Remove ${v}? It comes off its unpaid invoice.` : `Remove ${v} from the fleet? Cover stops at midnight, with no refund for the rest of the year.`)) return;
        await call({ type: "org.removePlate", org: o.id, plate: v }); return wtoast(STAGE, waiting ? `${v} removed from the invoice` : `${v}: cover stops at midnight`); }
    case "uploadproof": {
      const r = await call({ type: "org.uploadProof", org: o.id, inv: OS.inv });
      return wtoast(STAGE, r.err || "Thank you · SUNU Park Finance will match your transfer and confirm by SMS");
    }
    case "paywallet": { const r = await call({ type: "org.payWallet", org: o.id, inv: OS.inv }); if(r.err) return wtoast(STAGE, r.err); return wtoast(STAGE, "Paid · receipt sent by SMS"); }
    case "download": { OS.inv = v; OS.view = "invoices"; OS.sheet = null; renderOrg(); setTimeout(() => window.print(), 50); return; }
    default: return orgActUI(a, v);
  }
}
/* fleet list upload: a CSV file with plate, department, driver (a header row is fine) */
function parseCsv(text){
  const rows = [];
  for(const line of String(text).replace(/^﻿/, "").split(/\r?\n/)){
    if(!line.trim()) continue;
    const sep = line.includes(";") && !line.includes(",") ? ";" : line.includes("\t") && !line.includes(",") ? "\t" : ",";
    const cells = []; let cur = "", q = false;
    for(let i = 0; i < line.length; i++){
      const ch = line[i];
      if(q){ if(ch === '"' && line[i + 1] === '"'){ cur += '"'; i++; } else if(ch === '"') q = false; else cur += ch; }
      else if(ch === '"') q = true; else if(ch === sep){ cells.push(cur.trim()); cur = ""; } else cur += ch;
    }
    cells.push(cur.trim());
    rows.push(cells);
  }
  if(rows.length && !normPlate(rows[0][0]) && /plate|reg/i.test(rows[0][0] || "")) rows.shift();
  return rows.slice(0, 500).map(c => [c[0] || "", c[1] || "", c[2] || ""]);
}
async function readCsv(f){
  const o = ORGA[OS.org]; if(!o || !f) return;
  if(f.size > 512 * 1024) return wtoast(STAGE, "That file is too big. Use a CSV of up to 500 plates.");
  if(!/\.(csv|txt)$/i.test(f.name) && !/csv|text/.test(f.type)) return wtoast(STAGE, "Choose a CSV file (plate, department, driver). Save Excel sheets as CSV first.");
  const rows = parseCsv(await f.text());
  if(!rows.length) return wtoast(STAGE, "No rows found. Use one plate a line: plate, department, driver.");
  OS.view = "fleet"; OS.inv = null; OS.upload = { name: f.name, rows: uploadRows(o, rows) }; renderOrg();
}
document.addEventListener("change", e => { const t = e.target; if(t.id === "csvFile" && t.files && t.files[0]) readCsv(t.files[0]); });
document.addEventListener("dragover", e => { const z = e.target.closest && e.target.closest(".edrop"); if(!z) return; e.preventDefault(); z.classList.add("over"); });
document.addEventListener("dragleave", e => { const z = e.target.closest && e.target.closest(".edrop"); if(z) z.classList.remove("over"); });
document.addEventListener("drop", e => { const z = e.target.closest && e.target.closest(".edrop"); if(!z) return; e.preventDefault(); z.classList.remove("over"); readCsv(e.dataTransfer.files[0]); });

/* ---------- back office actions ---------- */
async function backAct(a, v){
  if(!PN.signedIn()) return signInAct(a, v);
  if(await commonAct(a)) return;
  if(ME().mustChangePassword) return;
  switch(a){
    case "nav":
      if(!canSee(v)) return;
      if(v === "staff" && BS.view !== "staff"){ BS.view = "staff"; BS.sheet = null; BS.bell = false; renderBack(); return loadStaff(); }
      if(v === "terms" && BS.view !== "terms"){ BS.view = "terms"; BS.sheet = null; BS.bell = false; renderBack(); return loadTerms(); }
      return backActUI(a, v);
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
      return wtoast(STAGE, `${r.id} created · welcome SMS sent to the contact`);
    }
    case "match": {
      const [org, inv] = v.split("|");
      if(!confirm(`Match the bank transfer to ${inv}? Only do this once the money is in the SUNU Park account.`)) return;
      const r = await call({ type: "back.match", org, inv });
      return wtoast(STAGE, r.err || `${inv} matched · the organisation is told by SMS`);
    }
    case "finepaid": {
      if(!confirm(`Record that warning ${v} was paid at the Council office?`)) return;
      const r = await call({ type: "back.settleFine", id: v, ref: BS.fref });
      if(r.err){ BS.ferr = r.err; return renderBack(); }
      BS.fref = ""; BS.ferr = ""; renderBack();
      return wtoast(STAGE, `${v} paid · GMD ${gmd(r.amount)} · the driver is told by SMS`);
    }
    case "finecancel": {
      if(!confirm(`Cancel warning ${v}? The driver is told there is nothing to pay.`)) return;
      const r = await call({ type: "back.cancelFine", id: v, reason: BS.freason });
      if(r.err){ BS.ferr = r.err; return renderBack(); }
      BS.freason = ""; BS.ferr = ""; renderBack();
      return wtoast(STAGE, `${v} cancelled · the driver is told by SMS`);
    }
    case "refer": { const r = await call({ type: "back.refer", i: v }); return wtoast(STAGE, r.err || "Referred to Finance for the refund decision"); }
    case "publish": {
      const F = BS.tar, r = await call({ type: "back.publish", daily: F.daily === "" ? T.daily : F.daily, annual: F.annual === "" ? T.annual : F.annual, fine: F.fine === "" ? T.fine : F.fine, auth: F.auth });
      if(r.err){ F.err = r.err; return renderBack(); }
      BS.tar = freshBS().tar; renderBack();
      return wtoast(STAGE, "Published to SMS, app, portal and cards");
    }
    case "announce": {
      const F = BS.ann, r = await call({ type: "back.announce", kind: F.kind, theme: F.theme, title: F.title, text: F.text, when: F.when, link: F.link,
        from: F.from || dayInput(B.date), to: F.to || dayInput(addDays(B.date, 14)) });
      if(r.err){ F.err = r.err; return renderBack(); }
      BS.ann = freshBS().ann; renderBack();
      return wtoast(STAGE, r.live ? "Live on the driver app now" : "Saved · it goes live on its start date");
    }
    case "annstatus": {
      const [id, status] = v.split("|"), r = await call({ type: "back.announceStatus", id, status });
      if(r.err) return wtoast(STAGE, r.err);
      return wtoast(STAGE, status === "hidden" ? "Hidden from the driver app" : "Back on the driver app");
    }
    case "anndel": {
      if(!confirm("Delete this announcement? Drivers stop seeing it at once.")) return;
      const r = await call({ type: "back.announceDelete", id: v });
      return wtoast(STAGE, r.err || "Announcement deleted");
    }
    case "psel": BS.psel = v; return renderBack();
    case "pseg": BS.pseg = v; BS.psel = null; return renderBack();
    case "termsreset": TERMS.title = TERMS.cur.title; TERMS.body = TERMS.cur.body; TERMS.note = ""; TERMS.err = ""; return renderBack();
    case "termspub": {
      const F = TERMS;
      if(F.busy || !F.cur) return;
      if(!confirm(`Publish version ${+F.cur.v + 1} of the terms? Everyone has to accept it again in the apps${F.notify ? ", and an SMS with the link goes to everyone who uses SUNU Park" : ""}.`)) return;
      F.busy = true; F.err = ""; renderBack();
      const r = await PN.call("POST", "/api/terms", { title: F.title, body: F.body, note: F.note, notify: !!F.notify });
      F.busy = false;
      if(!r.ok){ F.err = r.err || "Could not publish the terms."; return renderBack(); }
      await loadTerms(true);
      return wtoast(STAGE, `Version ${r.v} published · ${r.sent != null ? plural(r.sent, "SMS") + " sent" : "shown in the apps"}`);
    }
    case "staffsel": { const u = (STAFF.list || []).find(x => x.username === v); STAFF.sel = v; STAFF.role = u ? u.role : ""; STAFF.shown = null; STAFF.err = ""; return renderBack(); }
    case "staffnew": STAFF.sel = null; STAFF.shown = null; STAFF.err = ""; renderBack(); { const i = $("stName"); if(i) i.focus(); } return;
    case "staffadd": {
      const F = STAFF.add;
      if(STAFF.busy) return;
      STAFF.busy = true;
      const r = await PN.call("POST", "/api/staff", { username: F.username.trim().toLowerCase(), name: F.name.trim(), role: F.role });
      STAFF.busy = false;
      if(!r.ok){ F.err = r.err || "Could not create the account."; return renderBack(); }
      STAFF.shown = { username: r.username, name: F.name.trim(), password: r.password, fresh: true };
      STAFF.add = freshStaff().add; STAFF.sel = null;
      return loadStaff();
    }
    case "staffrole": return staffUpdate({ role: STAFF.role }, "Role changed · they sign in again to use it");
    case "staffreset": {
      const u = (STAFF.list || []).find(x => x.username === STAFF.sel);
      if(!u || !confirm(`Give ${u.name} a new temporary password? They are signed out and must choose a new password when they next sign in.`)) return;
      return staffUpdate({ resetPassword: true });
    }
    case "staffoff": {
      const u = (STAFF.list || []).find(x => x.username === STAFF.sel);
      if(!u || !confirm(`Switch off ${u.name}’s account? They are signed out at once and cannot sign in until it is switched on again.`)) return;
      return staffUpdate({ active: false }, "Account switched off");
    }
    case "staffon": return staffUpdate({ active: true }, "Account switched on");
    case "shownx": STAFF.shown = null; return renderBack();
    case "auditmore": return loadStaff(Math.min(500, (STAFF.limit || 60) * 3));
    case "auditall": STAFF.auditAll = v === "all"; return renderBack();
    default: return backActUI(a, v);
  }
}
async function loadStaff(limit){
  if(limit) STAFF.limit = limit;
  const [s, a] = await Promise.all([PN.call("GET", "/api/staff"), PN.call("GET", "/api/audit?limit=" + (STAFF.limit || 60))]);
  if(s.ok){ STAFF.list = s.staff; STAFF.me = s.me; STAFF.err = ""; } else STAFF.err = s.err || "Could not load the staff list.";
  if(a.ok) STAFF.audit = a.entries;
  if(BS.view === "staff") renderBack();
}
async function loadTerms(fresh){
  const [c, h] = await Promise.all([PN.terms(), can("terms") ? PN.call("GET", "/api/terms/history") : Promise.resolve({ ok: true, versions: null })]);
  if(c.ok){ const keep = TERMS.cur && !fresh && (TERMS.body !== TERMS.cur.body || TERMS.title !== TERMS.cur.title);
    TERMS.cur = c; if(!keep){ TERMS.title = c.title; TERMS.body = c.body; TERMS.note = ""; } }
  TERMS.hist = h.ok && h.versions ? h.versions : c.ok ? [c] : [];
  if(BS.view === "terms") renderBack();
}
/* the preview follows the text as it is typed (without redrawing the page, so the cursor stays put) */
document.addEventListener("input", e => { if(e.target.id === "trBody"){ const p = $("trPrev"); if(p) p.innerHTML = PN.termsHtml(e.target.value); } });
async function staffUpdate(change, done){
  const u = (STAFF.list || []).find(x => x.username === STAFF.sel);
  if(!u || STAFF.busy) return;
  STAFF.busy = true;
  const r = await PN.call("POST", "/api/staff/update", Object.assign({ username: u.username }, change));
  STAFF.busy = false;
  if(!r.ok){ STAFF.err = r.err || "Could not change the account."; return renderBack(); }
  STAFF.err = "";
  if(r.password) STAFF.shown = { username: u.username, name: u.name, password: r.password, fresh: false };
  if(u.username === STAFF.me && change.role) return;          /* changing your own role signs you out */
  await loadStaff();
  if(done) wtoast(STAGE, done);
}

/* ---------- demo controls (back office, demo servers only) ---------- */
let demoMin = PN.ls("parkna.demo.min") === "1";
function renderDemo(){
  const el = $("demo"); if(!el) return;
  const on = PN.signedIn() && PN.ready && PN.mode && PN.mode.demoControls && myRole() === "admin" && !ME().mustChangePassword;
  el.hidden = !on;
  document.body.classList.toggle("hasdemo", !!on);
  if(!on) return;
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
bindWeb(WEB, ROLE === "org" ? orgAct : backAct, renderAll);
PN.ping().then(() => { if(!PN.signedIn()) renderAll(); });       /* server version and test-server hints */
if(PN.signedIn()) start(); else renderAll();
