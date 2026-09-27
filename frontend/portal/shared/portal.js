/* ParkNa portals: the organisation portal and back office screens. portal-app.js signs people in and connects
   these screens to the ParkNa server.
   Look: grey canvas, white panels, lime highlight card, navy text and insight cards (the same brand as the apps). */
let OS, BS;
const freshOS = () => ({ org: null, view: "overview", seg: "plates", dept: null, q: "", sheet: null, bell: false, why: false, user: false,
  add: { open: false, plate: "", dept: "", driver: "", err: "" }, upload: null, inv: null, pay: { method: "transfer" } });
const freshBS = () => ({ view: "dash", seg: "roads", aseg: "all", road: "WEL", q: "", sheet: null, bell: false, why: false, user: false, pw: false,
  reg: { name: "", staff: "", phone: "", road: "RUS", shift: "AM", err: "" }, re: { off: "", road: "LEM", err: "" },
  no: { name: "", plates: "", disc: "0.15", contact: "", phone: "", signed: false, err: "" }, tar: { daily: "", auth: "", err: "" },
  ann: { kind: "Event", theme: "blue", title: "", text: "", when: "", link: "", from: "", to: "", err: "" } });
/* form fields name their state: data-f="OS.add.plate" (organisation), "BS.reg.name" (back office), "AU.phone" (sign-in),
   "PW.next" (password), "ST.add.name" (staff accounts) */
const ROOT = n => ({ OS, BS, AU: AUTH, PW, ST: STAFF })[n];
function setF(path, v){ const k = path.split("."), r = ROOT(k[0]); let o = r; for(let i = 1; i < k.length-1; i++) o = o[k[i]]; o[k[k.length-1]] = v; }
function paint(el, html){
  const a = document.activeElement; let id = null, s = null, e = null;
  if(a && el.contains(a) && a.id){ id = a.id; try { s = a.selectionStart; e = a.selectionEnd; } catch(_){} }
  const sc = el.querySelector(".emain"), top = sc ? sc.scrollTop : 0;
  el.innerHTML = html;
  const sc2 = el.querySelector(".emain"); if(sc2) sc2.scrollTop = top;
  if(id){ const n = $(id); if(n){ n.focus(); try { if(s != null) n.setSelectionRange(s, e); } catch(_){} } }
}
function wtoast(stage, text){
  $(stage).querySelectorAll(".wtoast").forEach(x => x.remove());
  const d = document.createElement("div"); d.className = "wtoast"; d.innerHTML = `<i>${IC.checkD}</i><span>${esc(text)}</span>`;
  $(stage).appendChild(d); setTimeout(() => d.remove(), 2800);
}

/* ---------- icons ---------- */
const IP = {
  grid: '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
  users: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19c.9-3 3-4.6 5.5-4.6s4.6 1.6 5.5 4.6"/><path d="M15.5 5.6a3 3 0 0 1 0 5.8M17.5 14.6c1.5.6 2.5 2 3 4.4"/>',
  building: '<rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M9 8h2M13 8h2M9 12h2M13 12h2M10 20.5v-4h4v4"/>',
  card: '<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10.5h18M7 15h4"/>',
  mega: '<path d="M4 10v4h3l8 4.5v-13L7 10Z"/><path d="M18 9.5a3.5 3.5 0 0 1 0 5"/>', info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8v.1"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  chart: '<path d="M5 20V11M11 20V5M17 20v-7M3 20h18"/>',
  car: '<path d="M5 16v-4l2-5h10l2 5v4M5 16h14M6 16v2.5M18 16v2.5"/><circle cx="8.5" cy="13" r=".9"/><circle cx="15.5" cy="13" r=".9"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z"/><path d="M9 8h6M9 12h6"/>',
  file: '<path d="M7 3h7l5 5v13H7Z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
  map: '<path d="M9 4 3 6.5V20l6-2.5 6 2.5 6-2.5V4l-6 2.5Z"/><path d="M9 4v13.5M15 6.5V20"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15Z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.4c-.7.3-1 .8-1 1.5v.6"/><path d="M12 16.9v.2"/>',
  cal: '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  chevR: '<path d="m10 6 6 6-6 6"/>', chevD: '<path d="m6 10 6 6 6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  ur: '<path d="M7 17 17 7M9 7h8v8"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>', down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  panel: '<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><path d="M9.5 4.5v15"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  shield: '<path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6Z"/><path d="m9 12 2 2 4-4"/>',
  sms: '<path d="M4 5h16v11H9l-5 4Z"/><path d="M8 10h8"/>',
};
const ic = (n, s = 18, w = 1.8) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${IP[n]}</svg>`;
const spark = s => `<svg width="${s}" height="${s}" viewBox="0 0 24 24"><path d="M12 2.5c.7 5 3 7.3 8 8-5 .7-7.3 3-8 8-.7-5-3-7.3-8-8 5-.7 7.3-3 8-8Z" fill="currentColor"/></svg>`;

/* ---------- components ---------- */
const A = (a, v) => `data-a="${a}"${v != null ? ` data-v="${esc(v)}"` : ""}`;
const eBtn = (label, a, v, cls = "", icon) => `<button class="eb ${cls}" ${A(a, v)}>${icon ? ic(icon, 16, 2.3) : ""}${label}</button>`;
const eChip = (cls, text, icon) => `<span class="ec ${cls}">${icon ? ic(icon, 12, 2.8) : ""}${esc(text)}</span>`;
const dots = (n, of, cls) => { of = Math.max(1, Math.min(of, 12)); n = Math.max(0, Math.min(of, Math.round(n))); return `<div class="edots ${cls}">${Array.from({ length: of }, (_, i) => `<i class="${i < n ? "on" : ""}"></i>`).join("")}</div>`; };
const stat = (o) => `<div class="est ${o.hi ? "hi" : ""}"><div class="t">${o.t}</div><div class="bg">${o.big}${o.unit ? `<small>${o.unit}</small>` : ""}</div>${o.dots || ""}${o.chip || ""}</div>`;
const seg = (a, cur, opts) => `<div class="eseg">${opts.map(([k, l]) => `<button class="${k === cur ? "on" : ""}" ${A(a, k)}>${l}</button>`).join("")}</div>`;
const row = (o) => `<div class="erow ${o.cls || ""} ${o.btn && /class="eb /.test(o.btn) ? "hb" : ""}"><span class="lead ${o.mono ? "mono" : ""}">${o.lead}</span><div class="tt"><b>${o.title}</b><small>${o.sub || ""}</small></div><div class="mid">${o.mid || ""}</div><div class="dur">${o.dur || ""}</div><div class="st">${o.chip || ""}</div>${o.btn || (o.a ? `<button class="ech" ${A(o.a, o.v)} aria-label="Open">${ic("chevR", 14, 2.4)}</button>` : "<span></span>")}</div>`;
const insight = (o) => `<div class="ein"><div class="etg"><span class="tag">${spark(11)}${esc(o.tag)}</span>${o.why ? `<button class="why" ${A(o.whyA || "why")}>Why this?</button>` : ""}</div>
  <h3>${o.title}</h3>${o.wx ? `<div class="wx">${o.wx}</div>` : ""}${o.body || ""}
  ${(o.items || []).map(it => `<button class="it" ${A(it.a, it.v)}><span><b>${esc(it.t)}</b><small>${esc(it.s)}</small></span>${ic("ur", 16, 2)}</button>`).join("")}
  ${o.btn ? `<button class="eb lm full ${o.btn.pri ? "pri" : ""}" ${A(o.btn.a, o.btn.v)}>${o.btn.l}</button>` : ""}</div>`;
const queue = (o) => `<div class="eq"><div class="hd"><b>${o.title}</b>${o.pill ? `<span class="pl ${o.pillCls || ""}">${esc(o.pill)}</span>` : ""}</div>
  ${o.items.length ? o.items.map(it => `<div class="eqi"><div class="r"><span><b>${esc(it.t)}</b><small>${esc(it.s)}</small></span>${it.btn || `<span class="v ${it.vc || ""}">${it.v}</span>`}</div>${it.of != null ? `<div class="bar"><i class="${it.bc || ""}" style="width:${Math.max(2, Math.min(100, 100 * it.n / Math.max(1, it.of)))}%"></i></div>` : ""}</div>`).join("") : `<div class="eqi"><small>${o.empty || "Nothing here yet."}</small></div>`}
  ${o.foot || ""}</div>`;
const callout = (icon, t, s) => `<div class="ecall"><span class="ico">${ic(icon, 17, 2)}</span><span><b>${t}</b><small>${s}</small></span></div>`;
const inp = (id, path, val, ph, type = "text", extra = "") => `<input id="${id}" data-f="${path}" value="${esc(val)}" placeholder="${esc(ph || "")}" type="${type}" autocomplete="off" ${extra}>`;
const sel = (id, path, val, opts) => `<select id="${id}" data-f="${path}">${opts.map(([v, l]) => `<option value="${v}" ${String(v) === String(val) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
const partOfDay = () => B.min < 720 ? "morning" : B.min < 1020 ? "afternoon" : "evening";
const kfmt = n => n >= 10000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k" : gmd(n);
const plural = (n, s, p) => n + " " + (n === 1 ? s : (p || s + "s"));
const monthStart = () => new Date(B.date.getFullYear(), B.date.getMonth(), 1);
const next25 = () => { const t = today(); return t.getDate() < 25 ? new Date(t.getFullYear(), t.getMonth(), 25) : new Date(t.getFullYear(), t.getMonth() + 1, 25); };
const dstr = d => DOW[d.getDay()] + " " + fmtD(d);
const pct = (u, c) => c ? Math.round(100 * (c - u) / c) : 0;

function topbar(ph, q, bellOn, user, sub, initials, kind){
  return `<header class="etop"><div class="elogo"><i>P</i><span>ParkNa<small>${kind}</small></span></div>
   <label class="esrch">${ic("search", 17, 2)}<input id="${kind === "Back office" || kind === "Council view" ? "bSearch" : "oSearch"}" data-f="${kind === "Organisation portal" ? "OS" : "BS"}.q" value="${esc(q)}" placeholder="${ph}" autocomplete="off"><kbd>⌘K</kbd></label>
   <div class="etr"><span class="epill">${ic("cal", 16, 2)}${dstr(B.date)} · ${hm(B.min)} · ${paidHours() ? "Paid hours" : "Free now"}</span>
    <button class="eic" ${A("help")} aria-label="Help">${ic("help", 19, 1.9)}</button>
    <button class="eic" ${A("bell")} aria-label="Notifications">${ic("bell", 19, 1.9)}${bellOn ? '<span class="rd"></span>' : ""}</button>
    <button class="euser" data-a="user" aria-label="Account"><span class="av">${esc(initials)}</span><span><b>${esc(user)}</b><small>${esc(sub)}</small></span>${ic("chevD", 15, 2)}</button></div></header>`;
}
function sidebar(items, on, secT, secItems, secOn){
  return `<aside class="eside"><div class="hd"><span>Workspace</span>${ic("panel", 16, 1.8)}</div>
   ${items.map(it => `<button class="enav ${it.k === on ? "on" : ""}" ${A("nav", it.k)}><span class="ico">${ic(it.i, 17, 1.9)}</span>${it.l}${it.n !== "" && it.n != null ? `<span class="n ${it.hot ? "hot" : ""}">${it.n}</span>` : ""}</button>`).join("")}
   <div class="esep"></div><div class="sec"><span>${secT}</span><span>${secItems.length}</span></div>
   ${secItems.map(s => `<button class="emine ${s.k === secOn ? "on" : ""}" ${A(s.a, s.k)}><span class="cd">${s.code}</span><span><b>${esc(s.t)}</b><small>${esc(s.s)}</small></span></button>`).join("")}
   <div class="foot"><button class="enav" ${A("help")}><span class="ico">${ic("help", 17, 1.9)}</span>Help</button><button class="enav" ${A("user")}><span class="ico">${ic("gear", 17, 1.9)}</span>Account</button></div></aside>`;
}
function frame(top, side, main, right, overlay){
  return top + `<div class="ebody">${side}<main class="emain ${right ? "two" : ""}"><div class="ecol">${main}</div>${right ? `<div class="ecol">${right}</div>` : ""}</main></div>${overlay || ""}`;
}
function plateSheet(p, scope){
  const st = state(p), r = PLATES[p], o = orgOf(p), d = dkey(B.date);
  const pays = LOG.filter(l => l.plate === p && !l.bad).slice(0, 4), chks = CHECKS.filter(c => c.plate === p && c.day === d).slice(-4).reverse();
  const known = r || o || PARK.some(c => c.plate === p) || Object.values(ORGA).some(x => x.plates.some(y => y.plate === p));
  const chipC = { UNPAID: "bad", DAILY: "ok", MONTHLY: "vio", ORG: "org" }[st];
  return `<div class="esheet" ${A("sheetx")}><div class="card"><div class="eh"><span class="eplate">${p}</span><button class="x" ${A("sheetx")} aria-label="Close">${ic("x", 15, 2.2)}</button></div>
   ${known ? `<div style="display:flex;gap:8px;align-items:center">${eChip(chipC, st === "DAILY" ? "PAID · DAILY" : st === "MONTHLY" ? "PAID · MONTHLY" : st === "ORG" ? "PAID · ORGANISATION" : "UNPAID")}<small style="color:var(--em)">${st === "UNPAID" ? "No pass today" : "Until " + untilOf(p)}</small></div>
   <div class="emini">${o ? `<div><span>Covered by</span><b>${esc(o.name)} · ${o.id}</b></div>` : ""}${r && r.monthly ? `<div><span>Monthly pass</span><b>to ${fmtD(r.monthly.to)}</b></div>` : ""}
    ${scope === "back" && can("payers") ? `<div><span>Drivers on ParkNa</span><b>${r && r.payers.length ? r.payers.map(n => esc(N(n).name)).join(", ") : "—"}</b></div>` : ""}
    <div><span>Payments</span><b>${pays.length ? pays.map(l => l.ticket || "invoice").join(", ") : "none recorded"}</b></div>
    <div><span>Checks today</span><b>${chks.length ? chks.map(c => hm(c.t) + " " + (c.st === "UNPAID" ? "unpaid" : "paid")).join(" · ") : "none yet"}</b></div></div>`
   : `<div class="eban vio">No record for this plate yet. It shows here as soon as it is paid, checked or added to a fleet.</div>`}</div></div>`;
}
function bellSheet(items){
  return `<div class="esheet" ${A("bellx")}><div class="card"><div class="eh"><h2>Notifications</h2><button class="x" ${A("bellx")} aria-label="Close">${ic("x", 15, 2.2)}</button></div>
   ${items.length ? items.map(it => `<button class="erow" style="grid-template-columns:1fr 32px;text-align:left;border:none;width:100%" ${A(it.a, it.v)}><div class="tt"><b>${esc(it.t)}</b><small>${esc(it.s)}</small></div><span class="ech">${ic("chevR", 14, 2.4)}</span></button>`).join("") : `<div class="eban vio">All clear. Nothing needs you right now.</div>`}</div></div>`;
}
function helpSheet(text){
  return `<div class="esheet" ${A("helpx")}><div class="card"><div class="eh"><h2>About this screen</h2><button class="x" ${A("helpx")} aria-label="Close">${ic("x", 15, 2.2)}</button></div><div style="font-size:12.8px;line-height:1.55;color:#3A3D4A">${text}</div></div></div>`;
}

/* ================= account: sign-in, password, user menu ================= */
const brand = sub => `<div class="elogo" style="padding:0"><i>P</i><span>ParkNa<small>${sub}</small></span></div>`;
const testBanner = () => PN.info && PN.info.otpInApp ? `<div class="etest">${ic("info", 15, 2.2)}<span>Test server: sign-in codes are shown here instead of being sent by SMS.</span></div>` : "";
function signInFrame(left, box){
  return `<div class="elog"><div class="l">${left}</div><div class="r"><div class="box">${box}</div></div></div>`;
}
function staffSignIn(){
  const F = AUTH;
  return signInFrame(`<div><span class="tag">${spark(11)}ParkNa back office</span>
      <h2>Parking for Banjul, run from one place.</h2><p>For ParkNa and Banjul City Council staff. Sign in with your own account: everything you do is recorded in the audit log.</p></div>
    <div class="chips"><span>${ic("users", 16, 2.2)}Attendants and roads, live</span><span>${ic("building", 16, 2.2)}Organisations and invoices</span><span>${ic("chart", 16, 2.2)}Revenue for the Council</span></div>`,
    `${brand("Back office · Banjul City Council")}
    <div><h1>Sign in</h1><p>With the username and password your ParkNa administrator gave you.</p></div>
    ${F.note ? `<div class="eban vio">${esc(F.note)}</div>` : ""}
    <label class="ef">Username${inp("auUser", "AU.user", F.user, "e.g. fatou.jallow", "text", 'autocapitalize="none" spellcheck="false" autocomplete="username"')}</label>
    <label class="ef">Password${inp("auPass", "AU.pass", F.pass, "", "password", 'autocomplete="current-password"')}</label>
    ${F.err ? `<div class="eerr">${esc(F.err)}</div>` : ""}
    <button class="eb pri full" style="height:46px" ${A("staffin")} ${F.busy ? "disabled" : ""}>${F.busy ? "Signing in…" : "Sign in"}</button>
    <p style="font-size:11.5px">Forgot your password? Ask a ParkNa administrator to reset it. After 5 wrong tries the account waits 15 minutes.</p>`);
}
function orgSignIn(){
  const F = AUTH;
  return signInFrame(`<div><span class="tag">${spark(11)}ParkNa for organisations</span>
      <h2>One invoice.<br>Every plate covered.</h2><p>Banks, ministries, telcos and NGOs cover their fleets with one monthly pass per plate, paid on one invoice.</p></div>
    <div class="chips"><span>${ic("check", 16, 2.4)}PAID for attendants, nothing to pay for drivers</span><span>${ic("check", 16, 2.4)}Add or remove plates any time</span><span>${ic("check", 16, 2.4)}Statements and attendant checks, monthly</span></div>`,
    `${brand("Organisation portal · Banjul City Council")}
    <div><h1>Sign in</h1><p>${F.sent ? `We sent a 6-digit code by SMS to +220 ${esc(F.phone.replace(/\D/g, "").slice(-7))}. It expires in 5 minutes.` : "With the billing contact’s phone number. We send a code by SMS."}</p></div>
    ${F.note ? `<div class="eban vio">${esc(F.note)}</div>` : ""}${F.sent ? "" : testBanner()}
    ${F.sent ? `<label class="ef">Code from the SMS${inp("auCode", "AU.code", F.code, "6 digits", "text", 'inputmode="numeric" maxlength="6" autocomplete="one-time-code"')}</label>
      ${F.test ? `<div class="etest">${ic("info", 15, 2.2)}<span>Test server: your code is <b>${esc(F.test)}</b></span></div>` : ""}`
    : `<label class="ef">Phone number (+220)${inp("auPhone", "AU.phone", F.phone, "7 digits", "tel", 'autocomplete="tel"')}</label>`}
    ${F.err ? `<div class="eerr">${esc(F.err)}</div>` : ""}
    <button class="eb pri full" style="height:46px" ${A(F.sent ? "verify" : "sendcode")} ${F.busy ? "disabled" : ""}>${F.busy ? "One moment…" : F.sent ? "Sign in" : "Send code"}</button>
    ${F.sent ? `<div class="elinks"><button ${A("resend")}>Send the code again</button><button ${A("otherphone")}>Use another number</button></div>` : ""}
    <p style="font-size:11.5px">New organisations are set up by the ParkNa account manager after the agreement is signed. There is no self sign-up.</p>`);
}
const pwFields = () => `<label class="ef">${ME().mustChangePassword ? "Temporary password" : "Current password"}${inp("pwCur", "PW.cur", PW.cur, "", "password", 'autocomplete="current-password"')}</label>
    <label class="ef">New password (10 characters or more)${inp("pwNext", "PW.next", PW.next, "", "password", 'autocomplete="new-password"')}</label>
    <label class="ef">New password again${inp("pwAgain", "PW.again", PW.again, "", "password", 'autocomplete="new-password"')}</label>
    ${PW.err ? `<div class="eerr">${esc(PW.err)}</div>` : ""}
    <button class="eb pri full" style="height:44px" ${A("savepw")} ${PW.busy ? "disabled" : ""}>${PW.busy ? "Saving…" : "Save new password"}</button>`;
function choosePassword(){
  const m = ME();
  return signInFrame(`<div><span class="tag">${spark(11)}Welcome, ${esc(firstName(m.name))}</span>
      <h2>Choose your own password.</h2><p>You signed in with a temporary password. Choose one only you know before you start. A long phrase is easier to remember and harder to guess.</p></div>
    <div class="chips"><span>${ic("shield", 16, 2.2)}At least 10 characters</span><span>${ic("shield", 16, 2.2)}Never share it, even with colleagues</span><span>${ic("shield", 16, 2.2)}Other browsers are signed out</span></div>`,
    `${brand("Back office · " + esc(STAFF_ROLES[m.role] || ""))}
    <div><h1>New password</h1><p>Signed in as <b>${esc(m.username)}</b>.</p></div>
    ${pwFields()}
    <div class="elinks"><button ${A("signout")}>Sign out</button></div>`);
}
function userSheet(){
  const m = ME(), o = ROLE === "org" ? ORGA[OS.org] : null;
  const name = o ? o.contact.name : m.name || "", sub = o ? "+220 " + m.num + " · " + o.name : m.username + " · " + (STAFF_ROLES[m.role] || "");
  return `<div class="esheet" ${A("userx")}><div class="card">
    <div class="eh"><div class="euh"><span class="av">${esc(initialsOf(name))}</span><span><b>${esc(name)}</b><small>${esc(sub)}</small></span></div><button class="x" ${A("userx")} aria-label="Close">${ic("x", 15, 2.2)}</button></div>
    ${ROLE === "back" ? `<button class="emenu" ${A("pwopen")}>${ic("shield", 17, 2)}<span><b>Change password</b><small>Signs out your other browsers</small></span></button>` : ""}
    <button class="emenu" ${A("print")}>${ic("file", 17, 2)}<span><b>Print this page</b><small>Or save it as a PDF</small></span></button>
    <button class="emenu" ${A("signout")}>${ic("x", 17, 2)}<span><b>Sign out</b><small>On this browser</small></span></button>
    <small class="efine">ParkNa ${esc(PN.info && PN.info.version || "")}${isDemo() ? " · demo server" : ""}</small></div></div>`;
}
function pwSheet(){
  return `<div class="esheet" ${A("userx")}><div class="card"><div class="eh"><h2>Change password</h2><button class="x" ${A("userx")} aria-label="Close">${ic("x", 15, 2.2)}</button></div>${pwFields()}</div></div>`;
}

/* ================= organisation portal ================= */
function orgChecks(o){ const plates = new Set(o.plates.map(x => x.plate)), ms = monthStart();
  return CHECKS.filter(c => plates.has(c.plate) && new Date(...c.day.split("-").map(Number)) >= ms); }
function invChipE(inv){ if(inv.status === "paid") return eChip("ok", "Paid", "check"); if(inv.status === "proof") return eChip("vio", "Awaiting match"); return daysBetween(inv.due, B.date) >= 1 ? eChip("bad", "Overdue") : eChip("warn", "Open"); }
function plateInfo(o, x){
  const t = today(), gone = x.to && x.to <= t, leaving = x.to && x.to > t;
  if(gone) return { chip: eChip("grey", "Removed"), cover: "stopped " + fmtD(addDays(x.to, -1)), cls: "dim" };
  if(o.status === "reverted") return { chip: eChip("bad", "Unpaid"), cover: "invoice overdue" };
  if(leaving) return { chip: eChip("warn", "Removing"), cover: "at midnight" };
  return { chip: eChip("org", "Covered", "check"), cover: x.from > monthStart() ? "from " + fmtD(x.from) : "to " + fmtD(orgCoverEnd(o)) };
}
function orgAlerts(o){
  const a = [], un = o.invoices.find(i => i.status !== "paid");
  if(o.status === "grace" && un) a.push({ t: un.no + " is overdue", s: `Grace day ${o.graceDay} of ${T.grace} · plates still covered`, a: "openinv", v: un.no });
  if(o.status === "reverted" && un) a.push({ t: "Plates reverted to UNPAID", s: un.no + " unpaid after " + T.grace + " days of grace", a: "openinv", v: un.no });
  if(un && un.status === "open" && o.status === "active") a.push({ t: un.no + " is ready", s: "GMD " + gmd(un.amount) + " · due " + fmtD(un.due), a: "openinv", v: un.no });
  if(un && un.status === "proof") a.push({ t: "Transfer reported", s: un.no + " · ParkNa Finance is matching it", a: "openinv", v: un.no });
  o.plates.filter(x => x.to && x.to > today()).forEach(x => a.push({ t: x.plate + " stops at midnight", s: "Removed from the fleet today", a: "nav", v: "fleet" }));
  if(!o.plates.length) a.push({ t: "Add your plates", s: "Cover starts the moment a plate is added", a: "addgo" });
  return a;
}
function renderOrg(){
  const o = ORGA[OS.org], el = $("orgWeb");
  el.className = "ed";
  if(!o) return paint(el, signInFrame(`<div><span class="tag">${spark(11)}ParkNa for organisations</span><h2>Account not found.</h2></div>`,
    `${brand("Organisation portal")}<div><h1>No organisation</h1><p>This number is no longer the contact on a ParkNa organisation account. Ask your ParkNa account manager.</p></div>
     <button class="eb pri full" style="height:46px" ${A("signout")}>Sign out</button>`));
  const open = o.invoices.filter(i => i.status !== "paid").length, act = activePlates(o);
  const depts = {}; o.plates.filter(x => !x.to || x.to > today()).forEach(x => { depts[x.dept] = (depts[x.dept] || 0) + 1; });
  const view = OS.inv ? "invoices" : OS.view;
  const side = sidebar([{ k: "overview", l: "Overview", i: "grid" }, { k: "fleet", l: "Fleet", i: "car", n: act.length }, { k: "invoices", l: "Invoices", i: "receipt", n: open || "", hot: open > 0 }, { k: "reports", l: "Reports", i: "file" }], view,
    "Departments", Object.keys(depts).map(d => ({ k: d, code: d.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase(), t: d, s: plural(depts[d], "plate"), a: "dept" })), OS.dept);
  const alerts = orgAlerts(o), first = o.contact.name.split(" ")[0];
  const top = topbar("Search plate or invoice", OS.q, alerts.length > 0, o.contact.name, "Fleet admin · " + o.name, o.contact.name.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase(), "Organisation portal");
  let main, right;
  if(OS.inv) [main, right] = orgInvoice(o, o.invoices.find(i => i.no === OS.inv));
  else if(view === "fleet") [main, right] = orgFleet(o);
  else if(view === "invoices") [main, right] = orgInvoices(o);
  else if(view === "reports") [main, right] = orgReports(o);
  else [main, right] = orgOverview(o, first);
  const ov = OS.user ? userSheet() : OS.sheet ? plateSheet(OS.sheet, "org") : OS.bell ? bellSheet(alerts) : OS.help ? helpSheet("This is the organisation portal: <b>one monthly pass per plate</b>, billed on one invoice. Invoices are issued on the 25th and due by the 1st, with " + T.grace + " days of grace. Plates added mid-month are charged pro-rata; removed plates stop at midnight. Fleet cars park in any marked ParkNa bay: there are no reserved bays.") : "";
  paint(el, frame(top, side, main, right, ov));
}
function orgStats(o){
  const act = activePlates(o), ch = orgChecks(o), inv = o.invoices[0], rev = o.status === "reverted";
  const todayN = ch.filter(c => c.day === dkey(B.date)).length;
  return `<div class="est4">${stat({ hi: 1, t: "Plates covered", big: rev ? 0 : act.length, unit: "/ " + o.agreed + " agreed", dots: dots(rev ? 0 : act.length, Math.max(o.agreed, act.length, 1), "k"), chip: rev ? eChip("bad", "Unpaid now") : eChip("ink", act.length ? "PAID if checked" : "Add plates", act.length ? "check" : "plus") })}
   ${stat({ t: "Checked by attendants", big: ch.length, unit: "this month", dots: dots(Math.min(10, ch.length), 10, "v"), chip: eChip("vio", "+ " + todayN + " today") })}
   ${stat({ t: inv ? inv.month.split(" ")[0] + " invoice" : "First invoice", big: inv ? (inv.status === "paid" ? "Paid" : inv.status === "proof" ? "Matching" : daysBetween(inv.due, B.date) >= 1 ? "Overdue" : "Open") : fmtD(next25()), unit: "", dots: dots(inv ? (inv.status === "paid" ? 10 : inv.status === "proof" ? 7 : 3) : 0, 10, "l"), chip: inv ? invChipE(inv) : eChip("grey", "for " + MONL[(next25().getMonth() + 1) % 12]) })}
   ${stat({ t: "Next invoice", big: fmtD(next25()), unit: "", dots: dots(Math.round(10 * Math.min(1, today().getDate() / 25)), 10, "k"), chip: eChip("ok", "for " + MONL[(next25().getMonth() + 1) % 12], "cal") })}</div>`;
}
function orgInsight(o){
  const un = o.invoices.find(i => i.status !== "paid"), n = activePlates(o).length;
  if(!o.plates.length) return insight({ tag: "Setup", title: "Add your plates to start cover", items: [{ t: "Upload your fleet list", s: "Plate, department, driver · every row is checked", a: "upload" }, { t: "Add one plate", s: "Covered from today, charged pro-rata", a: "addgo" }], btn: { l: "Add plates", a: "addgo" } });
  if(o.status === "reverted" && un) return insight({ tag: "Billing", title: "Your plates are UNPAID", body: `<div class="wx">${un.no} was not paid after ${T.grace} days of grace. Fleet drivers must pay daily until it is paid.</div>`, items: [{ t: un.no + " · GMD " + gmd(un.amount), s: "Due " + fmtD(un.due) + " · pay to restore cover at once", a: "openinv", v: un.no }], btn: { l: "Pay now", a: "openinv", v: un.no } });
  if(o.status === "grace" && un) return insight({ tag: "Billing", title: `Grace day ${o.graceDay} of ${T.grace}`, body: `<div class="wx">Plates stay covered during grace. After day ${T.grace} every plate reverts to UNPAID.</div>`, items: [{ t: un.no + " · GMD " + gmd(un.amount), s: "Was due " + fmtD(un.due), a: "openinv", v: un.no }], btn: { l: "Pay now", a: "openinv", v: un.no } });
  if(un) return insight({ tag: "Billing", title: `${un.month.split(" ")[0]} invoice is ${un.status === "proof" ? "being matched" : "ready"}`, items: [{ t: un.no + " · GMD " + gmd(un.amount), s: un.status === "proof" ? "Transfer reported · Finance is matching it" : "Due " + fmtD(un.due) + " · by bank transfer", a: "openinv", v: un.no }], btn: { l: "Open invoice", a: "openinv", v: un.no } });
  const topN = o.topups.length, nx = next25();
  return insight({ tag: "Billing", why: 1, title: `All ${plural(n, "plate")} covered`, wx: OS.why ? `Each plate on the account has a monthly pass at ${gmd(T.monthly)} GMD less your ${Math.round(o.disc * 100)}% discount. Attendants see PAID; drivers are told there is nothing to pay.` : "",
    items: [{ t: "Next invoice on " + fmtD(nx), s: "For " + MONL[(nx.getMonth() + 1) % 12] + " · " + plural(n, "plate") + (topN ? " + " + plural(topN, "pro-rata line") : ""), a: "nav", v: "invoices" }, { t: "Fleet list", s: "Add or remove plates any time", a: "nav", v: "fleet" }], btn: { l: "View invoices", a: "nav", v: "invoices" } });
}
function orgOverview(o, first){
  const act = activePlates(o), un = o.invoices.find(i => i.status !== "paid");
  const sub = !o.plates.length ? "Welcome to ParkNa. Add your plates to start cover. Cars park in any marked ParkNa bay."
    : o.status === "reverted" ? `Your plates reverted to UNPAID. Pay ${un ? un.no : "the invoice"} to restore cover.`
    : o.status === "grace" ? `${un.no} is overdue: grace day ${o.graceDay} of ${T.grace}. Your plates are still covered.`
    : `All ${plural(act.length, "plate")} are covered. ${un ? un.no + " is " + (un.status === "proof" ? "being matched." : "due " + fmtD(un.due) + ".") : MONL[(next25().getMonth() + 1) % 12] + "’s invoice is issued on " + fmtD(next25()) + "."}`;
  const ch = orgChecks(o), lastC = p => { const c = ch.filter(x => x.plate === p); return c.length ? c[c.length - 1] : null; };
  const segs = [["plates", "Plates"], ["checks", "Checks"], ["invoices", "Invoices"]];
  let rows = "";
  if(OS.seg === "checks") rows = ch.slice().reverse().slice(0, 6).map(c => row({ lead: hm(c.t), title: c.plate, sub: "Attendant " + c.off + " · " + ROADS[c.road].name, mid: c.day.split("-")[2] + " " + MON[+c.day.split("-")[1]], chip: c.st === "UNPAID" ? eChip("warn", "Unpaid") : eChip("ok", "Paid") })).join("") || `<div class="erow" style="grid-template-columns:1fr"><small style="color:var(--em)">No attendant checks on your plates yet this month.</small></div>`;
  else if(OS.seg === "invoices") rows = o.invoices.map(i => row({ lead: MON[i.due.getMonth()], title: i.no, sub: "Issued " + fmtD(i.issued) + " · due " + fmtD(i.due), mid: i.month, dur: "GMD " + gmd(i.amount), chip: invChipE(i), a: "openinv", v: i.no })).join("") || `<div class="erow" style="grid-template-columns:1fr"><small style="color:var(--em)">No invoices yet. The first is issued on ${fmtD(next25())}.</small></div>`;
  else rows = o.plates.filter(x => !OS.dept || x.dept === OS.dept).map(x => { const pi = plateInfo(o, x), c = lastC(x.plate); return row({ lead: x.plate, mono: 1, cls: pi.cls, title: esc(x.driver), sub: esc(x.dept), mid: c ? "Checked " + hm(c.t) : "Not checked", dur: pi.cover, chip: pi.chip, a: "plate", v: x.plate }); }).join("") || `<div class="erow" style="grid-template-columns:1fr"><small style="color:var(--em)">No plates yet. Upload your list or add one plate.</small></div>`;
  const depts = {}; o.plates.filter(x => !x.to || x.to > today()).forEach(x => { (depts[x.dept] = depts[x.dept] || []).push(x.plate); });
  const dk = Object.keys(depts);
  const glance = dk.length ? `<div class="eglh"><b>Departments at a glance</b><span class="lg"><span><i></i>Checked</span><span><i class="o"></i>Not yet</span></span></div>
    <div class="egl">${dk.slice(0, 5).map(d => { const ps = depts[d], chk = ps.filter(p => ch.some(c => c.plate === p)).length; return `<button class="egc ${OS.dept === d ? "on" : ""}" ${A("dept", d)}><span class="r">${esc(d.split(" ")[0])}<span>${ps.length}</span></span><span class="bg">${ps.length}</span><small>${ps.length === 1 ? "plate" : "plates"}</small>${dots(chk, ps.length, "k")}</button>`; }).join("")}</div>` : "";
  const main = `<div class="ep"><div class="eh"><div><h1>Good ${partOfDay()}, ${esc(first)}</h1><p>${sub}</p></div><div class="btns">${eBtn("View invoices", "nav", "invoices", "ol")}${eBtn("Add plate", "addgo", null, "", "plus")}</div></div>${orgStats(o)}</div>
   <div class="ep"><div class="eh"><div><h2>Fleet today</h2><p style="margin-top:2px">${dstr(B.date)}${OS.dept ? " · " + esc(OS.dept) : ""}</p></div>${seg("seg", OS.seg, segs)}</div><div class="erows">${rows}</div>${OS.seg === "plates" ? glance : ""}</div>`;
  const top = act.map(x => ({ p: x.plate, d: x.driver, n: ch.filter(c => c.plate === x.plate).length }));
  const mx = Math.max(4, ...top.map(t => t.n));
  const right = orgInsight(o) + queue({ title: "Checks this month", pill: plural(ch.length, "check"), pillCls: "ok", items: top.slice(0, 4).map(t => ({ t: t.p, s: t.d, v: t.n + " / " + mx, n: t.n, of: mx, bc: t.n >= mx ? "g" : "", vc: t.n >= mx ? "g" : "" })), empty: "No plates yet." })
    + callout("shield", "No reserved bays", "Fleet cars park in any marked ParkNa bay, like everyone else.");
  return [main, right];
}
function orgFleet(o){
  const act = activePlates(o), ms = monthStart(), added = o.plates.filter(x => x.from >= ms && (!x.to || x.to > today())).length, rem = o.plates.filter(x => x.to && x.to > today()).length;
  const pr = o.topups.reduce((s, x) => s + x.a, 0);
  const stats = `<div class="est4">${stat({ hi: 1, t: "Plates covered", big: o.status === "reverted" ? 0 : act.length, unit: "/ " + o.agreed, dots: dots(act.length, Math.max(o.agreed, act.length, 1), "k"), chip: eChip("ink", "any bay", "check") })}
   ${stat({ t: "Added this month", big: added, unit: "plates", dots: dots(added, Math.max(4, added), "v"), chip: eChip("vio", "from day one", "plus") })}
   ${stat({ t: "Pro-rata on next invoice", big: kfmt(pr), unit: "GMD", dots: dots(o.topups.length, Math.max(4, o.topups.length), "l"), chip: eChip("grey", plural(o.topups.length, "line")) })}
   ${stat({ t: "Removing tonight", big: rem, unit: "plates", dots: dots(rem, 4, "k"), chip: rem ? eChip("warn", "at midnight") : eChip("ok", "none", "check") })}</div>`;
  let review = "";
  if(OS.upload){
    const U = OS.upload, ready = U.rows.filter(r => r.ok === "ready").length;
    review = `<div class="ep"><div class="eh"><div><h2>${esc(U.name)}</h2><p style="margin-top:2px">${plural(U.rows.length, "row")} checked · covered from today, pro-rata GMD ${gmd(proRata(o))} a plate</p></div><div class="btns">${eBtn("Cancel", "cancelup", null, "ol")}<button class="eb pri" ${A("confirmup")} ${ready ? "" : "disabled"}>${ic("check", 16, 2.4)}Confirm ${plural(ready, "plate")}</button></div></div>
     <div class="erows">${U.rows.map(r => row({ lead: esc(r.raw), mono: 1, title: esc(r.dept), sub: esc(r.driver), mid: r.ok === "ready" ? "Ready to add" : esc(r.why), chip: r.ok === "ready" ? eChip("ok", "Ready", "check") : r.ok === "flag" ? eChip("warn", "Flagged") : eChip("bad", "Rejected"), cls: r.ok === "ready" ? "" : "dim" })).join("")}</div></div>`;
  }
  const list = o.plates.filter(x => !OS.dept || x.dept === OS.dept);
  const main = `<div class="ep"><div class="eh"><div><h1>Fleet</h1><p>${esc(o.name)} fleet · ${o.id} · one pass per plate, billed monthly</p></div><div class="btns">${eBtn("Upload list", "upload", null, "ol", "upload")}${eBtn("Add plate", "addopen", null, "", "plus")}</div></div>${stats}</div>
   ${review}<div class="ep"><div class="eh"><div><h2>Fleet plates</h2><p style="margin-top:2px">${plural(act.length, "active plate")}${OS.dept ? " · " + esc(OS.dept) : ""}</p></div></div>
   <div class="erows">${list.map(x => { const pi = plateInfo(o, x); return row({ lead: x.plate, mono: 1, cls: pi.cls, title: esc(x.driver), sub: esc(x.dept), mid: pi.cover, chip: pi.chip, btn: !x.to ? `<button class="ech" ${A("remove", x.plate)} title="Remove" aria-label="Remove ${x.plate}">${ic("x", 13, 2.4)}</button>` : "<span></span>" }); }).join("") || `<div class="erow" style="grid-template-columns:1fr"><small style="color:var(--em)">No plates yet.</small></div>`}</div></div>`;
  const Ad = OS.add;
  const addCard = `<div class="ep tight"><div class="eh"><h2>Add a plate</h2></div>
    ${Ad.open ? `<div style="display:flex;flex-direction:column;gap:9px;margin-top:12px"><label class="ef">Plate${inp("adPlate", "OS.add.plate", Ad.plate, "BJL7010")}</label><label class="ef">Department${inp("adDept", "OS.add.dept", Ad.dept, "Branch ops")}</label><label class="ef">Driver${inp("adDrv", "OS.add.driver", Ad.driver, "Name")}</label>
      ${Ad.err ? `<div class="eerr">${esc(Ad.err)}</div>` : ""}<div style="font-size:11.5px;color:var(--em)">Covered from today · pro-rata GMD ${gmd(proRata(o))}</div>
      <div style="display:flex;gap:8px">${eBtn("Add plate", "addplate", null, "pri", "plus")}${eBtn("Cancel", "addcancel", null, "ol")}</div></div>`
    : `<div class="edrop" style="margin-top:12px">${ic("upload", 20, 2)}<span><b>Drop a CSV file here</b><br>one plate a line: plate, department, driver</span>${eBtn("Choose a file", "upload", null, "gh sm")}</div><div style="margin-top:10px">${eBtn("Add one plate", "addopen", null, "full", "plus")}</div>`}</div>`;
  const right = addCard + insight({ tag: "Rules", title: "How fleet cover works", items: [{ t: "One pass per plate", s: "Park in any marked ParkNa bay", a: "help" }, { t: "Added mid-month", s: "Covered at once, charged pro-rata", a: "help" }, { t: "Removed", s: "Cover stops at midnight", a: "help" }] })
    + callout("shield", "No reserved bays", "Requests for reserved bays go to the Council.");
  return [main, right];
}
function orgInvoices(o){
  const paid = o.invoices.filter(i => i.status === "paid"), open = o.invoices.filter(i => i.status !== "paid");
  const stats = `<div class="est4">${stat({ hi: 1, t: "Paid to ParkNa", big: kfmt(paid.reduce((s, i) => s + i.amount, 0)), unit: "GMD", dots: dots(paid.length, Math.max(4, o.invoices.length), "k"), chip: eChip("ink", plural(paid.length, "invoice"), "check") })}
   ${stat({ t: "Open invoices", big: open.length, unit: open.length ? "GMD " + gmd(open.reduce((s, i) => s + i.amount, 0)) : "", dots: dots(open.length, 4, "v"), chip: open.length ? invChipE(open[0]) : eChip("ok", "All paid", "check") })}
   ${stat({ t: "Next invoice", big: fmtD(next25()), dots: dots(Math.round(10 * Math.min(1, today().getDate() / 25)), 10, "l"), chip: eChip("grey", "due the 1st") })}
   ${stat({ t: "Bulk discount", big: Math.round(o.disc * 100), unit: "%", dots: dots(Math.round(o.disc * 50), 10, "k"), chip: eChip("ok", T.grace + " days’ grace") })}</div>`;
  const main = `<div class="ep"><div class="eh"><div><h1>Invoices</h1><p>Issued on the 25th for the next month · due by the 1st · ${T.grace} days’ grace, then plates revert</p></div></div>${stats}</div>
   <div class="ep"><div class="eh"><h2>All invoices</h2></div><div class="erows">${o.invoices.map(i => row({ lead: MON[i.due.getMonth()], title: i.no, sub: "Issued " + fmtD(i.issued) + " · due " + fmtD(i.due), mid: i.month, dur: "GMD " + gmd(i.amount), chip: invChipE(i), a: "openinv", v: i.no })).join("") || `<div class="erow" style="grid-template-columns:1fr"><small style="color:var(--em)">No invoices yet.</small></div>`}</div></div>`;
  return [main, orgInsight(o) + callout("card", "Wallet limit", "Wave Business pays invoices up to " + gmd(T.walletLimit) + " GMD. Above that, bank transfer.")];
}
function orgInvoice(o, inv){
  const main = `<div class="ep"><div class="eh"><div><h1>${inv.no}</h1><p>${inv.month} · issued ${fmtD(inv.issued)} · due ${fmtD(inv.due)}</p></div><div class="btns">${invChipE(inv)}${eBtn("All invoices", "nav", "invoices", "ol")}</div></div>
    <div class="erows">${inv.lines.map((l, i) => row({ lead: String(i + 1).padStart(2, "0"), title: esc(l.t), sub: l.a < 0 ? "Discount" : /pro-rata/.test(l.t) ? "Added mid-month" : "Monthly pass per plate", dur: (l.a < 0 ? "−" : "") + gmd(Math.abs(l.a)) })).join("")}
     <div class="erow sel" style="grid-template-columns:66px 1fr auto"><span class="lead">Total</span><div class="tt"><b>GMD ${gmd(inv.amount)}</b><small>One monthly pass per plate at ${gmd(T.monthly)} GMD, less ${Math.round(o.disc * 100)}%</small></div><span>${invChipE(inv)}</span></div></div></div>`;
  let right;
  if(inv.status === "paid") right = insight({ tag: "Paid", title: "Paid " + fmtD(inv.paidOn), body: `<div class="kvw"><span>Method</span><b>${esc(inv.method)}</b><span>Amount</span><b>GMD ${gmd(inv.amount)}</b><span>Covered to</span><b>${fmtD(inv.end)}</b></div>`, btn: { l: "Download statement", a: "download", v: inv.no } });
  else if(inv.status === "proof") right = insight({ tag: "Awaiting match", title: "Transfer reported " + fmtD(inv.proofOn), body: `<div class="wx">ParkNa Finance matches your transfer to ${inv.no} when it reaches the account. You get an SMS when it is matched. Plates stay covered meanwhile.</div>` });
  else {
    const wallet = !!(PN.mode && PN.mode.payments), over = inv.amount > T.walletLimit, m = !wallet || over ? "transfer" : OS.pay.method;
    const bank = PN.bank || (isDemo() ? { bank: "Demo Commercial Bank", accountName: "ParkNa Collections", accountNumber: "0012 3456 789" } : null);
    right = insight({ tag: "Pay invoice", title: `<span class="big">GMD ${gmd(inv.amount)}</span><div class="insub">Due ${fmtD(inv.due)}</div>`,
      body: `<div class="opt3"><button class="${m === "wallet" ? "on" : ""}" ${A("paymethod", "wallet")} ${!wallet || over ? "disabled" : ""}><b>Wave Business</b><small>${!wallet ? "opens soon" : over ? "above " + gmd(T.walletLimit) + " limit" : "business wallet"}</small></button><button class="${m === "transfer" ? "on" : ""}" ${A("paymethod", "transfer")}><b>Bank transfer</b><small>quote the invoice</small></button></div>
        ${m !== "transfer" ? "" : bank ? `<div class="kvw"><span>Account</span><b>${esc(bank.accountName)}</b><span>Bank</span><b>${esc(bank.bank)}</b><span>Account no.</span><b>${esc(bank.accountNumber)}</b><span>Reference</span><b>${inv.no}</b></div>`
          : `<div class="wx">Pay by bank transfer to the ParkNa account named in your agreement and quote <b>${inv.no}</b> as the reference. Your account manager can send the bank details again.</div>`}`,
      btn: m === "transfer" ? { l: "I have paid by transfer", a: "uploadproof", pri: 1 } : { l: "Pay with Wave Business", a: "paywallet", pri: 1 } });
  }
  return [main, right + callout("clock", "Grace", T.grace + " days after the due date, with a daily SMS. Then plates revert to UNPAID.")];
}
function orgReports(o){
  const ch = orgChecks(o), plates = [...new Set(o.plates.map(x => x.plate))], paid = o.invoices.filter(i => i.status === "paid");
  const unp = ch.filter(x => x.st === "UNPAID").length;
  const stats = `<div class="est4">${stat({ hi: 1, t: "Checked by attendants", big: ch.length, unit: "this month", dots: dots(Math.min(10, ch.length), 10, "k"), chip: eChip("ink", "all logged", "check") })}
   ${stat({ t: "Checked unpaid", big: unp, unit: "times", dots: dots(unp, Math.max(4, unp), "r"), chip: eChip("grey", "info only") })}
   ${stat({ t: "Plates active", big: o.status === "reverted" ? 0 : activePlates(o).length, dots: dots(activePlates(o).length, Math.max(o.agreed, 1), "v"), chip: eChip("vio", "of " + o.agreed + " agreed") })}
   ${stat({ t: "Paid to ParkNa", big: kfmt(paid.reduce((s, i) => s + i.amount, 0)), unit: "GMD", dots: dots(paid.length, 6, "l"), chip: eChip("ok", plural(paid.length, "invoice"), "check") })}</div>`;
  const rows = plates.map(p => { const c = ch.filter(x => x.plate === p), l = c[c.length - 1], u = c.filter(x => x.st === "UNPAID").length, x = o.plates.find(y => y.plate === p);
    return row({ lead: p, mono: 1, title: esc(x.driver), sub: esc(x.dept), mid: l ? "Last " + l.day.split("-")[2] + " " + MON[+l.day.split("-")[1]] + " " + hm(l.t) + " · " + ROADS[l.road].name.split(" ")[0] : "Not checked yet", dur: plural(c.length, "check"), chip: u ? eChip("warn", u + " unpaid · before joining") : eChip("ok", "All paid", "check") }); }).join("");
  const main = `<div class="ep"><div class="eh"><div><h1>Reports</h1><p>${esc(o.name)} · statements and every attendant check on a fleet plate</p></div></div>${stats}</div>
   <div class="ep"><div class="eh"><h2>Attendant checks on fleet plates</h2></div><div class="erows">${rows || `<div class="erow" style="grid-template-columns:1fr"><small style="color:var(--em)">No plates yet.</small></div>`}</div></div>`;
  const right = queue({ title: "Statements", pill: plural(o.invoices.length, "month"), pillCls: "ok", items: o.invoices.map(i => ({ t: i.month, s: i.no + " · GMD " + gmd(i.amount), btn: `<button class="eb gh sm" ${A("download", i.no)}>PDF</button>` })), empty: "No statements yet." })
    + callout("shield", "No fines in the pilot", "Unpaid checks are shown for information only.");
  return [main, right];
}
function uploadRows(o, list){
  const seen = new Set();
  return list.map(([raw, dept, driver]) => {
    const p = normPlate(raw);
    if(!p) return { raw, dept, driver, ok: "rej", why: "Not a valid plate" };
    if(seen.has(p)) return { raw, dept, driver, p, ok: "flag", why: "Twice in this file" };
    seen.add(p);
    const r = PLATES[p], other = Object.values(ORGA).find(x => x.plates.some(y => y.plate === p && !y.to));
    if(other && other.id === o.id) return { raw, dept, driver, p, ok: "flag", why: "Already on this account" };
    if(other) return { raw, dept, driver, p, ok: "flag", why: "On another organisation" };
    if(r && r.monthly && daysBetween(B.date, r.monthly.to) >= 0) return { raw, dept, driver, p, ok: "flag", why: "Personal monthly pass to " + fmtD(r.monthly.to) };
    return { raw, dept, driver, p, ok: "ready" };
  });
}
/* screen-only organisation actions (the ones that change data are in portal-app.js) */
function orgActUI(a, v){
  const o = ORGA[OS.org];
  if(a === "nav"){ OS.view = v; OS.inv = null; OS.sheet = null; OS.bell = false; return renderOrg(); }
  if(a === "seg"){ OS.seg = v; return renderOrg(); }
  if(a === "dept"){ OS.dept = OS.dept === v ? null : v; if(OS.view !== "fleet"){ OS.view = "overview"; OS.inv = null; OS.seg = "plates"; } return renderOrg(); }
  if(a === "why"){ OS.why = !OS.why; return renderOrg(); }
  if(a === "plate"){ OS.sheet = v; return renderOrg(); }
  if(a === "sheetx"){ OS.sheet = null; return renderOrg(); }
  if(a === "bell"){ OS.bell = !OS.bell; OS.help = false; OS.user = false; return renderOrg(); }
  if(a === "bellx"){ OS.bell = false; return renderOrg(); }
  if(a === "help"){ OS.help = true; OS.bell = false; OS.user = false; return renderOrg(); }
  if(a === "helpx"){ OS.help = false; return renderOrg(); }
  if(a === "addgo" || a === "addopen"){ OS.view = "fleet"; OS.inv = null; OS.add.open = true; OS.bell = false; renderOrg(); const i = $("adPlate"); if(i) i.focus(); return; }
  if(a === "addcancel"){ OS.add = freshOS().add; return renderOrg(); }
  if(a === "cancelup"){ OS.upload = null; return renderOrg(); }
  if(a === "openinv"){ OS.inv = v; OS.view = "invoices"; OS.bell = false; return renderOrg(); }
  if(a === "paymethod"){ OS.pay.method = v; return renderOrg(); }
  if(a === "search"){ const q = OS.q.trim(), p = normPlate(q);
    const inv = o.invoices.find(i => i.no.toUpperCase() === q.toUpperCase());
    if(inv) return orgActUI("openinv", inv.no);
    if(p && o.plates.some(x => x.plate === p)){ OS.sheet = p; return renderOrg(); }
    return wtoast("stOrg", q ? `${q.toUpperCase()} is not on this account` : "Type a plate or an invoice number"); }
}

/* ================= back office ================= */
function revenueToday(){
  const d = dkey(B.date), f = paidDay() ? Math.max(0, Math.min(1, (B.min - 420) / 720)) : 0;
  const bg = isDemo() ? BG_DAILY : {};           /* demo servers add simulated background passes on the five roads */
  const R = {}; Object.keys(ROADS).forEach(k => R[k] = { n: Math.floor((bg[k] || 0) * f), m: 0, amt: 0 });
  R.OTH = { n: 0, m: 0, amt: 0 };
  Object.keys(ROADS).forEach(k => R[k].amt = R[k].n * T.daily);
  const src = { daily: Object.values(R).reduce((s, r) => s + r.amt, 0), monthly: 0, org: 0 };
  LOG.filter(l => l.day === d && !l.bad).forEach(l => {
    if(l.src === "org"){ src.org += l.amount; return; }
    const pk = PARK.find(c => c.plate === l.plate), k = pk ? pk.road : "OTH";
    if(l.src === "monthly"){ R[k].m++; src.monthly += l.amount; } else { R[k].n++; src.daily += l.amount; }
    R[k].amt += l.amount;
  });
  return { R, src, total: src.daily + src.monthly + src.org };
}
function checksByRoad(){
  const d = dkey(B.date), C = {}; Object.keys(ROADS).forEach(k => C[k] = { c: 0, u: 0 });
  Object.values(OFF).filter(o => o.bg && o.active).forEach(o => { const s = bgStats(o); C[o.road].c += s.checked; C[o.road].u += s.unpaid; });
  CHECKS.filter(c => c.day === d).forEach(c => { C[c.road].c++; if(c.st === "UNPAID") C[c.road].u++; });
  return C;
}
function offStatus(o){
  const s = offStats(o), sh = SHIFTS[o.shift], d = dkey(B.date);
  if(!o.active) return ["grey", "Off", s];
  if(s.on && s.last != null && B.min - s.last > 40) return ["warn", "Quiet", s];
  if(s.on) return ["ok", "Active", s];
  if(!o.bg && o.summary && o.summary.day === d) return ["grey", "Ended", s];
  if(paidDay() && B.min >= sh.s && B.min < sh.e) return ["bad", "Not started", s];
  return ["grey", "Off shift", s];
}
function needs(){
  const out = [];
  Object.values(OFF).filter(o => o.active).forEach(o => { const [, l, s] = offStatus(o);
    if(l === "Quiet") out.push({ t: `Attendant ${o.id} · ${ROADS[roadOf(o)].name}`, s: `Quiet: no SMS since ${hm(s.last)}`, a: "cover", v: o.num });
    if(l === "Not started") out.push({ t: `Attendant ${o.id} · ${ROADS[roadOf(o)].name}`, s: "Has not sent START", a: "nav", v: "attendants" }); });
  Object.values(ORGA).forEach(o => { o.invoices.forEach(i => { if(i.status === "proof") out.push({ t: `${i.no} · ${o.name}`, s: `Bank transfer to match · GMD ${gmd(i.amount)}`, a: "nav", v: "payments" }); });
    if(o.status === "grace") out.push({ t: o.name + " in grace", s: `Day ${o.graceDay} of ${T.grace} · invoice unpaid`, a: "nav", v: "orgs" });
    if(o.status === "reverted") out.push({ t: o.name + " plates reverted", s: "Invoice unpaid after grace", a: "nav", v: "orgs" }); });
  EXC.filter(e => e.status === "open").forEach(e => out.push({ t: e.type + " · " + e.plate, s: "Reported to the call centre", a: "nav", v: "payments" }));
  return out;
}
const shortRoad = k => ROADS[k].name.replace(" Road", " Rd").replace(" Street", " St").replace(" Avenue", " Ave").replace(" Drive", " Dr");
function shiftQueue(){
  const on = Object.values(OFF).filter(o => o.active).map(o => [o, offStatus(o)]).filter(([, s]) => s[1] === "Active" || s[1] === "Quiet");
  const target = 150;
  return queue({ title: "Shift progress", pill: on.length + " on shift", items: on.slice(0, 5).map(([o, s]) => ({ t: `Attendant ${o.id} · ${shortRoad(roadOf(o))}`, s: `${o.name} · ${s[1] === "Quiet" ? "quiet since " + hm(s[2].last) : "last SMS " + (s[2].last != null ? hm(s[2].last) : "—")}`, v: s[2].checked + " / " + target, n: s[2].checked, of: target, bc: s[1] === "Quiet" ? "r" : s[2].checked >= target ? "g" : "", vc: s[2].checked >= target ? "g" : "" })), empty: "Nobody is on shift right now." });
}
function renderBack(){
  if(!canSee(BS.view)) BS.view = (PAGES[myRole()] || ["council"])[0];
  const el = $("backWeb"), V = BS.view, council = myRole() === "council", m = ME();
  el.className = "ed";
  const proofs = []; Object.values(ORGA).forEach(o => o.invoices.forEach(i => { if(i.status === "proof") proofs.push([o, i]); }));
  const exc = EXC.filter(e => e.status === "open").length, C = checksByRoad();
  const onRoad = k => Object.values(OFF).filter(o => o.active && roadOf(o) === k && offStats(o).on).map(o => o.id);
  const side = sidebar([{ k: "dash", l: "Dashboard", i: "grid" }, { k: "attendants", l: "Attendants", i: "users", n: Object.values(OFF).filter(o => o.active).length }, { k: "orgs", l: "Organisations", i: "building", n: Object.keys(ORGA).length },
    { k: "payments", l: "Payments", i: "card", n: (proofs.length + exc) || "", hot: 1 }, { k: "tariff", l: "Tariffs & rules", i: "sliders" }, { k: "ann", l: "Announcements", i: "mega", n: (typeof ANN !== "undefined" && ANN ? ANN.filter(annLive).length : 0) || "" }, { k: "council", l: "Revenue report", i: "chart" },
    { k: "staff", l: "Staff & audit", i: "shield" }].filter(it => canSee(it.k)),
    pageOf(V), "Pilot roads", Object.keys(ROADS).map(k => ({ k, code: k, t: ROADS[k].name, s: (onRoad(k).length ? "Att. " + onRoad(k).join(", ") : "No attendant") + " · " + C[k].c + " checks", a: "road" })), BS.road);
  const nd = needs().filter(x => x.a === "cover" ? can("officers") : canSee(x.v));
  const top = topbar("Search plate, e.g. BJL1234", BS.q, nd.length > 0, m.name || m.username || "", STAFF_ROLES[m.role] || "", initialsOf(m.name || m.username), council ? "Council view" : "Back office");
  const [main, right] = { dash: backDash, attendants: backAtt, register: backReg, orgs: backOrgs, neworg: backNewOrg, payments: () => backPay(proofs), tariff: backTariff, ann: backAnn, council: backCouncil, staff: backStaff }[V]();
  const ov = BS.user ? userSheet() : BS.pw ? pwSheet() : BS.sheet ? plateSheet(BS.sheet, "back") : BS.bell ? bellSheet(nd) : BS.help ? helpSheet("The ParkNa back office. <b>Administrators</b> register attendants and set their fixed road, create organisation accounts, apply the tariff adopted by the Council, publish announcements and manage staff accounts. <b>Supervisors</b> look after attendants and roads. <b>Finance</b> matches organisation bank transfers and handles payment exceptions. The <b>Revenue report</b> is the Council’s read-only view. Every change is recorded in the audit log with the name of the person who made it." + (isDemo() ? " On this demo server, roads and attendants other than 07 and 12 run simulated background activity." : "")) : "";
  paint(el, frame(top, side, main, right, ov));
}
function backDash(){
  const offs = Object.values(OFF).filter(o => o.active), st = offs.map(o => offStatus(o));
  const on = st.filter(x => x[1] === "Active" || x[1] === "Quiet").length, quiet = st.filter(x => x[1] === "Quiet").length;
  const C = checksByRoad(), tc = Object.values(C).reduce((s, x) => s + x.c, 0), tu = Object.values(C).reduce((s, x) => s + x.u, 0), rv = revenueToday(), nd = needs().filter(x => x.a === "cover" ? can("officers") : canSee(x.v));
  const frac = paidDay() ? Math.max(0, Math.min(1, (B.min - 420) / 720)) : 0;
  const p1 = nd.filter(x => x.a === "cover").length, p2 = nd.filter(x => /transfer/i.test(x.s)).length;
  const sub = `GMD ${gmd(rv.total)} collected so far today. ` + (nd.length ? [p1 ? plural(p1, "attendant is", "attendants are") + " quiet" : "", p2 ? plural(p2, "transfer is", "transfers are") + " waiting" : "", nd.length - p1 - p2 > 0 ? plural(nd.length - p1 - p2, "other item") + " to review" : ""].filter(Boolean).join(" and ") + "." : "Nothing needs you right now.");
  const stats = `<div class="est4">${stat({ hi: 1, t: "Collected today", big: kfmt(rv.total), unit: "GMD", dots: dots(Math.round(frac * 10), 10, "k"), chip: eChip("ink", "60% Council", "up") })}
   ${stat({ t: "On shift now", big: on, unit: "of " + offs.length + " attendants", dots: dots(on, offs.length, "v"), chip: !offs.length ? eChip("grey", "none registered") : quiet ? eChip("warn", quiet + " quiet") : eChip("ok", "All covered", "check") })}
   ${stat({ t: "Plates checked", big: tc, unit: "today", dots: dots(Math.round(pct(tu, tc) / 10), 10, "l"), chip: eChip("vio", pct(tu, tc) + "% paid", "plus") })}
   ${stat({ t: "Unpaid when checked", big: tc ? 100 - pct(tu, tc) : 0, unit: "%", dots: dots(Math.round((tc ? 100 - pct(tu, tc) : 0) / 10), 10, "k"), chip: eChip("ok", "No fines yet", "down") })}</div>`;
  let rows;
  if(BS.seg === "attendants") rows = offs.map((o, i) => { const [c, l, s] = st[i]; return row({ lead: o.id, title: esc(o.name), sub: shortRoad(roadOf(o)) + (roadOf(o) !== o.road ? " · moved" : "") + " · " + SHIFTS[o.shift].label, mid: s.last != null ? "Last SMS " + hm(s.last) : "No SMS yet", dur: s.checked + " checks", chip: eChip(c, l), a: can("officers") ? "pick" : null, v: o.num }); }).join("")
    || `<div class="erow" style="grid-template-columns:1fr"><small style="color:var(--em)">No attendants registered yet.${can("officers") ? " Register the first one from Attendants." : ""}</small></div>`;
  else if(BS.seg === "payments"){ const d = dkey(B.date), w = LOG.filter(l => l.day === d && !l.bad).slice(0, 6);
    rows = w.map(l => row({ lead: l.t, title: l.src === "org" ? esc(l.text.split("·")[1] || l.text) : l.plate, sub: l.src === "org" ? "Organisation invoice" : (l.ticket || "") + " · " + (l.prov || ""), mid: l.src === "monthly" ? "Monthly pass" : l.src === "org" ? "Bank transfer" : "Daily pass", dur: "GMD " + gmd(l.amount), chip: eChip("ok", "Matched", "check"), a: "nav", v: "payments" })).join("") || `<div class="erow" style="grid-template-columns:1fr"><small style="color:var(--em)">No live payments yet today. Background totals are in the Revenue report.</small></div>`; }
  else rows = Object.keys(ROADS).map(k => { const ids = Object.values(OFF).filter(o => o.active && roadOf(o) === k && offStats(o).on), q = ids.some(o => offStatus(o)[1] === "Quiet");
    return row({ lead: k, cls: BS.road === k ? "sel" : "", title: ROADS[k].name, sub: "Bays " + ROADS[k].bays.replace("-", "–") + " · " + (ids.length ? "Attendant " + ids.map(o => o.id).join(", ") : "no attendant"), mid: plural(C[k].c, "check"), dur: pct(C[k].u, C[k].c) + "% paid", chip: !ids.length ? eChip("grey", "Uncovered") : q ? eChip("warn", "Quiet") : eChip("ok", "Active"), a: "road", v: k }); }).join("");
  const glance = `<div class="eglh"><b>Roads at a glance</b><span class="lg"><span><i></i>Paid</span><span><i class="o"></i>Unpaid</span></span></div>
   <div class="egl">${Object.keys(ROADS).map(k => `<button class="egc ${BS.road === k ? "on" : ""}" ${A("road", k)}><span class="r">${k}<span>${kfmt(rv.R[k].amt)}</span></span><span class="bg">${C[k].c}</span><small>checks</small>${dots(Math.round(pct(C[k].u, C[k].c) / 20), 5, "k")}</button>`).join("")}</div>`;
  const warn = PN.mode && PN.mode.demoData && myRole() === "admin" ? `<div class="eban warn" style="margin-bottom:12px">${ic("info", 18, 2.2)}<span><b>This production server still holds the demo data</b> (sample drivers, attendants and Demo Bank). Empty the database before real use: docs/DEPLOYMENT.md, section 11. For a demo server, set app.mode=demo instead.</span></div>` : "";
  const main = `${warn}<div class="ep"><div class="eh"><div><h1>Good ${partOfDay()}, ${esc(firstName(ME().name))}</h1><p>${sub}</p></div><div class="btns">${eBtn("Revenue report", "nav", "council", "ol")}${can("officers") ? eBtn("Register officer", "nav", "register", "", "plus") : ""}</div></div>${stats}</div>
   <div class="ep"><div class="eh"><div><h2>Live across the pilot</h2><p style="margin-top:2px">${dstr(B.date)} · ${hm(B.min)}</p></div>${seg("seg", BS.seg, [["roads", "Roads"], ["attendants", "Attendants"], ["payments", "Payments"]])}</div><div class="erows">${rows}</div>${BS.seg === "roads" ? glance : ""}</div>`;
  const k = BS.road, ids = Object.values(OFF).filter(o => o.active && roadOf(o) === k && offStats(o).on);
  const right = insight({ tag: "Needs attention", why: 1, title: nd.length ? `${plural(nd.length, "thing")} need${nd.length === 1 ? "s" : ""} you now` : "All clear right now", wx: BS.why ? "ParkNa flags attendants with no SMS for 40 minutes, officers who have not sent START, bank transfers waiting to be matched, organisations in grace and payment exceptions." : "",
      items: nd.slice(0, 3), btn: nd.length ? { l: "Review " + (nd.length > 1 ? "all" : "it"), a: nd[0].a, v: nd[0].v } : canSee("attendants") ? { l: "Open attendants", a: "nav", v: "attendants" } : { l: "Open payments", a: "nav", v: "payments" } })
    + shiftQueue()
    + callout("map", `${ROADS[k].name}: ${plural(C[k].c, "check")}`, `${C[k].u} unpaid · GMD ${gmd(rv.R[k].amt)} collected · ${ids.length ? "Attendant " + ids.map(o => o.id).join(", ") : "no attendant on shift"}`);
  return [main, right];
}
function backAtt(){
  const offs = Object.values(OFF), st = offs.map(o => offStatus(o)), C = checksByRoad();
  const tc = Object.values(C).reduce((s, x) => s + x.c, 0), tu = Object.values(C).reduce((s, x) => s + x.u, 0);
  const on = st.filter(x => x[1] === "Active" || x[1] === "Quiet").length, quietN = st.filter(x => x[1] === "Quiet").length, act = offs.filter(o => o.active).length;
  const R = BS.re, eligible = offs.filter(o => o.active && !o.bg);
  if(!eligible.some(o => o.num === R.off)) R.off = eligible.length ? eligible[0].num : "";
  const ro = OFF[R.off];
  const sums = offs.filter(o => o.summary && o.summary.day === dkey(B.date));
  const stats = `<div class="est4">${stat({ hi: 1, t: "On shift now", big: on, unit: "of " + act, dots: dots(on, act, "k"), chip: eChip("ink", "START sent", "check") })}
   ${stat({ t: "Plates checked", big: tc, unit: "today", dots: dots(Math.min(10, Math.round(tc / 50)), 10, "v"), chip: eChip("vio", "all roads", "plus") })}
   ${stat({ t: "Paid when checked", big: pct(tu, tc), unit: "%", dots: dots(Math.round(pct(tu, tc) / 10), 10, "l"), chip: eChip("ok", (tc - tu) + " of " + tc, "check") })}
   ${stat({ t: "Quiet", big: quietN, unit: "attendants", dots: dots(quietN, 4, "r"), chip: quietN ? eChip("warn", "40+ min idle") : eChip("ok", "all checking", "check") })}</div>`;
  const list = offs.map((o, i) => [o, st[i]]).filter(([o, s]) => BS.aseg === "all" || (BS.aseg === "on" ? s[1] === "Active" || s[1] === "Quiet" : s[1] === "Quiet"));
  const main = `<div class="ep"><div class="eh"><div><h1>Attendants & roads</h1><p>${act} attendants · 5 pilot roads · two shifts · fixed road for each officer</p></div><div class="btns">${eBtn("Register officer", "nav", "register", "", "plus")}</div></div>${stats}</div>
   <div class="ep"><div class="eh"><div><h2>Today</h2><p style="margin-top:2px">Tap an attendant to reassign</p></div>${seg("aseg", BS.aseg, [["all", "All"], ["on", "On shift"], ["quiet", "Quiet"]])}</div>
   <div class="erows">${list.map(([o, [c, l, s]]) => row({ lead: o.id, cls: o.num === R.off ? "sel" : "", title: esc(o.name) + (o.isNew ? " " + eChip("lime", "New") : ""), sub: shortRoad(roadOf(o)) + (roadOf(o) !== o.road ? " · moved" : "") + " · " + SHIFTS[o.shift].label, mid: plural(s.checked, "check") + " · " + (s.last != null ? hm(s.last) : "no SMS"), dur: s.unpaid + " unpaid", chip: eChip(c, l), a: !o.bg ? "pick" : null, v: o.num })).join("")
     || `<div class="erow" style="grid-template-columns:1fr"><small style="color:var(--em)">${offs.length ? "Nobody in this list right now." : "No attendants yet. Register each attendant with the phone number they will use for ParkNa."}</small></div>`}</div></div>
   ${sums.length ? `<div class="ep"><div class="eh"><h2>Shift summaries today</h2></div><div class="erows">${sums.map(o => row({ lead: o.id, title: esc(o.name), sub: ROADS[o.summary.road].name, mid: "Ended " + hm(o.summary.end) + (o.summary.auto ? " (auto)" : ""), dur: (o.summary.checked || 0) + " checked", chip: eChip("grey", "Cash: none") })).join("")}</div></div>` : ""}`;
  const right = (ro ? insight({ tag: "Reassign officer", title: `Move Attendant ${ro.id}`, body: `<label class="fld2">Officer${sel("reOff", "BS.re.off", R.off, eligible.map(o => [o.num, `Attendant ${o.id} · ${shortRoad(roadOf(o))}`]))}</label>
      <label class="fld2">Move to${sel("reRoad", "BS.re.road", R.road, Object.keys(ROADS).map(k => [k, ROADS[k].name + " " + ROADS[k].bays.replace("-", "–")]))}</label>
      <div class="kvw"><span>From</span><b>Today ${hm(B.min)}</b><span>Until</span><b>End of shift</b></div>${R.err ? `<div class="err">${esc(R.err)}</div>` : ""}`,
      btn: { l: "Reassign · notify by SMS", a: "reassign", pri: 1 } })
      : insight({ tag: "Get started", title: "Register your attendants", body: `<div class="wx">Each attendant gets a number (01, 02…), a fixed road and a shift. They sign in to the ParkNa Officer app with their registered phone number, or text START to ${esc(PN.mode && PN.mode.shortcode || SC)}.</div>`, btn: { l: "Register officer", a: "nav", v: "register", pri: 1 } }))
    + shiftQueue() + callout("clock", "Fixed road for the pilot", "Tomorrow every officer returns to their fixed road.");
  return [main, right];
}
function backReg(){
  const F = BS.reg, first = (F.name || "Name").split(" ")[0], nextId = pad(Object.values(OFF).reduce((m, o) => Math.max(m, +o.id || 0), 0) + 1);
  const main = `<div class="ep"><div class="eh"><div><h1>Register officer</h1><p>Each attendant texts from one registered number, with a fixed road and shift for the pilot. This will be Attendant ${nextId}.</p></div><div class="btns">${eBtn("Back", "nav", "attendants", "ol")}</div></div>
    <div class="efg" style="margin-top:18px"><label class="ef">Full name${inp("rgName", "BS.reg.name", F.name, "e.g. Ousman Colley", "text", 'data-rr="1"')}</label><label class="ef">Staff ID${inp("rgStaff", "BS.reg.staff", F.staff, "BCC-0415")}</label>
     <label class="ef">Registered phone (+220)${inp("rgPhone", "BS.reg.phone", F.phone, "7300015", "tel")}</label><label class="ef">Registered by<input value="${esc(ME().name || "")}" disabled></label>
     <label class="ef">Fixed road${sel("rgRoad", "BS.reg.road", F.road, Object.keys(ROADS).map(k => [k, ROADS[k].name + " " + ROADS[k].bays.replace("-", "–")]))}</label><label class="ef">Shift${sel("rgShift", "BS.reg.shift", F.shift, [["AM", "Morning 7am–1pm"], ["PM", "Afternoon 1pm–7pm"]])}</label></div>
    ${F.err ? `<div class="eerr" style="margin-top:10px">${esc(F.err)}</div>` : ""}
    <div style="display:flex;gap:8px;margin-top:16px">${eBtn("Register · send welcome SMS", "register", null, "pri", "check")}${eBtn("Cancel", "nav", "attendants", "ol")}</div></div>`;
  const right = insight({ tag: "Welcome SMS", title: "What the officer receives", body: `<div class="bub">ParkNa: welcome ${esc(first)}. You are Attendant ${nextId} on ${roadLine(F.road)}, ${SHIFTS[F.shift].label}. Text START to begin, a plate to check it, END to finish. Never take money.</div>` })
    + queue({ title: "Rules", items: [{ t: "START replies with this road", s: "Exactly the road and shift set here", v: "✓" }, { t: "Registered number only", s: "Other numbers cannot use officer commands", v: "✓" }, { t: "Deactivate at once", s: "Stops the number immediately", v: "✓" }, { t: "Never take money", s: "Drivers pay on their own phones", v: "✓" }] });
  return [main, right];
}
function backOrgs(){
  const orgs = Object.values(ORGA), plates = orgs.reduce((s, o) => s + (o.status === "reverted" ? 0 : activePlates(o).length), 0);
  const open = orgs.reduce((s, o) => s + o.invoices.filter(i => i.status !== "paid").length, 0), paid = orgs.reduce((s, o) => s + o.invoices.filter(i => i.status === "paid").reduce((a, i) => a + i.amount, 0), 0);
  const stats = `<div class="est4">${stat({ hi: 1, t: "Organisation plates", big: plates, unit: "covered", dots: dots(plates, Math.max(10, plates), "k"), chip: eChip("ink", "1 pass a plate", "check") })}
   ${stat({ t: "Accounts", big: orgs.length, dots: dots(orgs.length, 6, "v"), chip: eChip("vio", "monthly", "plus") })}
   ${stat({ t: "Invoices open", big: open, dots: dots(open, 4, "l"), chip: open ? eChip("warn", "due the 1st") : eChip("ok", "all paid", "check") })}
   ${stat({ t: "Collected from organisations", big: kfmt(paid), unit: "GMD", dots: dots(Math.min(10, orgs.length * 2), 10, "k"), chip: eChip("ok", "matched", "check") })}</div>`;
  const stc = o => o.status === "active" ? eChip("ok", "Active") : o.status === "grace" ? eChip("warn", "Grace " + o.graceDay + "/" + T.grace) : o.status === "reverted" ? eChip("bad", "Reverted") : eChip("vio", "New");
  const main = `<div class="ep"><div class="eh"><div><h1>Organisations</h1><p>Created by an administrator after the account manager’s visit and a signed agreement. Never self-service.</p></div><div class="btns">${can("orgs") ? eBtn("New organisation", "nav", "neworg", "", "plus") : ""}</div></div>${stats}</div>
   <div class="ep"><div class="eh"><h2>Accounts</h2></div><div class="erows">${orgs.map(o => { const i = o.invoices[0]; return row({ lead: o.id.slice(4), title: esc(o.name), sub: esc(o.contact.name) + " · +220 " + o.contact.num, mid: activePlates(o).length + " / " + o.agreed + " plates · " + Math.round(o.disc * 100) + "%", dur: i ? i.no.slice(4) : "no invoice", chip: stc(o) }); }).join("")
     || `<div class="erow" style="grid-template-columns:1fr"><small style="color:var(--em)">No organisation accounts yet.</small></div>`}</div></div>`;
  const alert = orgs.filter(o => o.status !== "active" && o.status !== "new" || o.invoices.some(i => i.status === "proof"));
  const right = insight({ tag: "Billing", title: alert.length ? plural(alert.length, "account") + " to watch" : "All accounts in good standing", items: alert.map(o => ({ t: o.name, s: o.status === "grace" ? "Grace day " + o.graceDay : o.status === "reverted" ? "Plates reverted" : "Transfer waiting to be matched", a: "nav", v: o.invoices.some(i => i.status === "proof") ? "payments" : "orgs" })), btn: can("orgs") ? { l: "New organisation", a: "nav", v: "neworg" } : null })
    + callout("shield", "No reserved bays", "Organisation plates park in any marked ParkNa bay. Requests go to the Council.");
  return [main, right];
}
function backNewOrg(){
  const F = BS.no;
  const main = `<div class="ep"><div class="eh"><div><h1>New organisation</h1><p>After the account manager’s visit. The billing contact gets a portal login by SMS.</p></div><div class="btns">${eBtn("Back", "nav", "orgs", "ol")}</div></div>
    <div class="efg" style="margin-top:18px"><label class="ef" style="grid-column:1/-1">Organisation name${inp("noName", "BS.no.name", F.name, "e.g. Demo Utilities Co.")}</label>
     <label class="ef">Plates agreed${inp("noPlates", "BS.no.plates", F.plates, "6", "number")}</label><label class="ef">Bulk discount${sel("noDisc", "BS.no.disc", F.disc, [["0.15", "15%"], ["0.2", "20%"]])}</label>
     <label class="ef">Billing contact${inp("noContact", "BS.no.contact", F.contact, "Name")}</label><label class="ef">Contact phone (+220)${inp("noPhone", "BS.no.phone", F.phone, "7102345", "tel")}</label></div>
    <label class="echk" style="margin-top:14px"><input type="checkbox" id="noSigned" data-f="BS.no.signed" ${F.signed ? "checked" : ""}> Signed agreement received</label>
    ${F.err ? `<div class="eerr" style="margin-top:10px">${esc(F.err)}</div>` : ""}
    <div style="display:flex;gap:8px;margin-top:16px">${eBtn("Create account · send login", "createorg", null, "pri", "check")}${eBtn("Cancel", "nav", "orgs", "ol")}</div></div>`;
  const n = +F.plates || 0, amt = Math.round(n * T.monthly * (1 - +F.disc));
  const right = insight({ tag: "What they get", title: n ? `GMD ${gmd(amt)} a month` : "One pass per plate", body: `<div class="kvw"><span>Plates</span><b>${n || "—"}</b><span>Price</span><b>${gmd(T.monthly)} less ${Math.round(+F.disc * 100)}%</b><span>Invoice</span><b>on the 25th, due the 1st</b><span>Grace</span><b>${T.grace} days, then revert</b><span>Bays</span><b>any marked ParkNa bay</b></div>` })
    + callout("sms", "Login by SMS", "The contact signs in with their phone number and a one-time code.");
  return [main, right];
}
function backPay(proofs){
  const d = dkey(B.date), wal = LOG.filter(l => l.day === d && !l.bad && l.src !== "org"), rv = revenueToday(), openExc = EXC.filter(e => e.status === "open").length;
  const stats = `<div class="est4">${stat({ hi: 1, t: "Collected today", big: kfmt(rv.total), unit: "GMD", dots: dots(Math.round((paidDay() ? Math.max(0, Math.min(1, (B.min - 420) / 720)) : 0) * 10), 10, "k"), chip: eChip("ink", "all sources", "up") })}
   ${stat({ t: "Wallet payments", big: wal.length, unit: "live today", dots: dots(Math.min(10, wal.length), 10, "v"), chip: eChip("ok", "by callback", "check") })}
   ${stat({ t: "Transfers to match", big: proofs.length, dots: dots(proofs.length, 4, "l"), chip: proofs.length ? eChip("warn", "by invoice no.") : eChip("ok", "none waiting", "check") })}
   ${stat({ t: "Exceptions", big: openExc, unit: "open", dots: dots(openExc, 4, "r"), chip: openExc ? eChip("bad", "to decide") : eChip("ok", "none open", "check") })}</div>`;
  const wallets = !!(PN.mode && PN.mode.payments);
  const main = `<div class="ep"><div class="eh"><div><h1>Payments</h1><p>${wallets ? "Wallet payments match by callback. " : ""}Organisation bank transfers are matched to invoices by their reference.</p></div></div>${stats}</div>
   <div class="ep"><div class="eh"><h2>Bank transfers to match</h2></div><div class="erows">${proofs.map(([o, i]) => row({ lead: fmtD(i.proofOn), cls: "sel", title: i.no, sub: esc(o.name) + " · says it has paid", mid: "Reference " + i.no, dur: "GMD " + gmd(i.amount), chip: eChip("vio", "Awaiting"), btn: can("money") ? `<button class="eb sm pri" ${A("match", o.id + "|" + i.no)}>Match</button>` : "<span></span>" })).join("") || `<div class="erow" style="grid-template-columns:1fr"><small style="color:var(--em)">Nothing to match.</small></div>`}</div></div>
   <div class="ep"><div class="eh"><h2>Wallet payments today</h2>${wallets ? `<span class="ec ok">${ic("check", 12, 2.8)}matched by callback</span>` : `<span class="ec grey">not switched on yet</span>`}</div><div class="erows">${wal.slice(0, 8).map(l => row({ lead: l.t, title: l.plate, sub: l.ticket + " · " + N(l.num).name, mid: l.prov + " · " + (l.src === "monthly" ? "monthly" : "daily"), dur: "GMD " + gmd(l.amount), chip: eChip("ok", "Matched", "check"), a: "plate", v: l.plate })).join("")
     || `<div class="erow" style="grid-template-columns:1fr"><small style="color:var(--em)">${wallets ? "No wallet payments yet today." : "Mobile money payments (Wave, Afrimoney, APS, QMoney) are added when the provider agreements are in place. Until then drivers see “opens soon”."}</small></div>`}</div></div>`;
  const right = insight({ tag: "Revenue share", title: `<span class="big">GMD ${gmd(rv.total)}</span><div style="font-size:12px;color:#CFC8FF;margin-top:6px;font-weight:500">collected today</div>`,
      body: `<div class="br2"><span>Council 60%</span><i style="width:100%"></i><span>${gmd(rv.total * .6)}</span></div><div class="br2"><span>Operator 40%</span><i class="l" style="width:66%"></i><span>${gmd(rv.total * .4)}</span></div>` })
    + queue({ title: "Exceptions", pill: openExc ? openExc + " open" : "clear", pillCls: openExc ? "" : "ok", items: EXC.map((e, i) => ({ t: e.type + " · " + e.plate, s: e.detail, btn: e.status === "open" ? (can("money") ? `<button class="eb gh sm" ${A("refer", i)}>Refer</button>` : `<span class="ec warn">Open</span>`) : `<span class="ec grey">With Finance</span>` })), empty: "No exceptions." });
  return [main, right];
}
function backTariff(){
  const F = BS.tar, v = F.daily === "" ? T.daily : +F.daily, mo = monthlyFor(v || 0);
  const main = `<div class="ep"><div class="eh"><div><h1>Tariffs & rules</h1><p>Decided by Banjul City Council. Admin applies them and publishes to every channel at once.</p></div><div class="btns">${eChip("ok", "Live · one price for every plate", "check")}</div></div>
    <div class="efg" style="margin-top:18px"><label class="ef big">Daily pass (GMD)${inp("tDaily", "BS.tar.daily", F.daily === "" ? String(T.daily) : F.daily, "200", "number", 'data-rr="1"')}</label><label class="ef big">Monthly pass (GMD)<input value="${gmd(mo)}" disabled></label></div>
    <div class="ekv" style="margin-top:14px"><span>Monthly</span><b>26 paid days less 15%</b><span>Paid hours</span><b>7am–7pm, Monday to Saturday</b><span>Organisations</span><b>15–20% bulk discount · ${T.grace} days’ grace</b><span>Officer line</span><b>START, a plate, END · fixed road per officer</b><span>Shortcode</span><b>${esc(PN.mode && PN.mode.shortcode || SC)}</b></div>
    <label class="ef" style="margin-top:14px">Council authority reference${inp("tAuth", "BS.tar.auth", F.auth, "e.g. BCC resolution number")}</label>
    ${F.err ? `<div class="eerr" style="margin-top:8px">${esc(F.err)}</div>` : ""}
    <div style="margin-top:14px">${eBtn("Publish to all channels", "publish", null, "pri", "up")}</div></div>
   <div class="ep"><div class="eh"><h2>Change log</h2></div><div class="erows">${T.log.slice().reverse().map((l, i) => row({ lead: l.when.split(" ").slice(0, 2).join(" "), title: esc(l.what), sub: esc(l.auth), mid: "", dur: esc(l.by), chip: i === 0 ? eChip("ok", "Live") : eChip("grey", "Earlier") })).join("")}</div></div>`;
  const right = insight({ tag: "Preview", title: "Drivers will see", body: `<div class="bub">${PN.mode && PN.mode.payments ? `Daily pass BJL1234: ${v || "?"} GMD, valid till 7pm today.\n1 Wave 2 Afrimoney` : `BJL1234 is not paid today (${v || "?"} GMD till 7pm). Paying by mobile money opens soon.`}</div><div class="wx">Also the driver app, the Park &amp; Pay card and the organisation portal.</div>` })
    + queue({ title: "Not in the pilot", pill: "off", items: [{ t: "Tariffs by vehicle type", s: "One price for every plate", v: "Off" }, { t: "Fines and violations", s: "Unpaid checks counted for the Council", v: "Off" }, { t: "Clamping", s: "No clamping journey", v: "Off" }] });
  return [main, right];
}
/* Council events and announcements: shown as a banner on the driver app's home screen */
const dayInput = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const ANN_ICON = { Event: "cal", Announcement: "mega", Notice: "info" };
const annCard = x => `<div class="annc ${esc(x.theme)}"><span class="annk">${ic(ANN_ICON[x.kind] || "mega", 13, 2.2)}${esc(x.kind)} · Banjul City Council</span><b>${esc(x.title || "Your title")}</b>${x.text ? `<p>${esc(x.text)}</p>` : ""}${x.when || x.link ? `<div class="annf">${x.when ? `<span>${ic("cal", 13, 2.2)}${esc(x.when)}</span>` : "<span></span>"}${x.link ? `<a>Learn more${ic("arrow", 13, 2.4)}</a>` : ""}</div>` : ""}</div>`;
function backAnn(){
  const F = BS.ann, list = typeof ANN !== "undefined" && ANN ? ANN : [], live = list.filter(annLive), t = today();
  const status = x => annLive(x) ? eChip("ok", "Live", "check") : x.status === "hidden" ? eChip("grey", "Hidden") : x.to < t ? eChip("grey", "Ended") : eChip("vio", "Scheduled");
  const main = `<div class="ep"><div class="eh"><div><h1>Announcements</h1><p>Council events and notices for the banner on the driver app’s home screen. Drivers see the ones live today.</p></div><div class="btns">${eChip(live.length ? "ok" : "grey", plural(live.length, "live today", "live today"), live.length ? "check" : undefined)}</div></div>
    <div class="efg" style="margin-top:18px"><label class="ef">Type${sel("aKind", "BS.ann.kind", F.kind, [["Event", "Event"], ["Announcement", "Announcement"], ["Notice", "Notice"]])}</label><label class="ef">Colour${sel("aTheme", "BS.ann.theme", F.theme, [["blue", "Blue"], ["green", "Green"], ["yellow", "Yellow"], ["red", "Red (urgent)"]])}</label></div>
    <label class="ef" style="margin-top:12px">Title${inp("aTitle", "BS.ann.title", F.title, "e.g. Banjul Day clean-up", "text", 'maxlength="60" data-rr="1"')}</label>
    <label class="ef" style="margin-top:12px">Text${inp("aText", "BS.ann.text", F.text, "One or two short sentences (up to 180 characters)", "text", 'maxlength="180" data-rr="1"')}</label>
    <div class="efg" style="margin-top:12px"><label class="ef">Date line (optional)${inp("aWhen", "BS.ann.when", F.when, "Sat 7 Nov · 8am at Arch 22", "text", 'maxlength="40" data-rr="1"')}</label><label class="ef">Link (optional)${inp("aLink", "BS.ann.link", F.link, "https://", "url", 'maxlength="200" data-rr="1"')}</label></div>
    <div class="efg" style="margin-top:12px"><label class="ef">Show from${inp("aFrom", "BS.ann.from", F.from || dayInput(B.date), "", "date")}</label><label class="ef">Until${inp("aTo", "BS.ann.to", F.to || dayInput(addDays(B.date, 14)), "", "date")}</label></div>
    ${F.err ? `<div class="eerr" style="margin-top:10px">${esc(F.err)}</div>` : ""}
    <div style="margin-top:14px">${eBtn("Publish to the driver app", "announce", null, "pri", "up")}</div></div>
   <div class="ep"><div class="eh"><h2>All announcements</h2></div><div class="erows">${list.map(x => row({ cls: "hb2", lead: fmtD(x.from), title: esc(x.title), sub: esc(x.kind) + " · " + fmtD(x.from) + " to " + fmtD(x.to), mid: esc(x.when || ""), dur: "", chip: status(x),
      btn: `<span style="display:flex;gap:6px"><button class="eb gh sm" ${A("annstatus", x.id + "|" + (x.status === "hidden" ? "live" : "hidden"))}>${x.status === "hidden" ? "Show" : "Hide"}</button><button class="eb gh sm" ${A("anndel", x.id)}>Delete</button></span>` })).join("")
      || `<div class="erow" style="grid-template-columns:1fr"><small style="color:var(--em)">No announcements yet.</small></div>`}</div></div>`;
  const right = insight({ tag: "Preview", title: "Drivers will see", body: annCard(F) + `<div class="wx">On the home screen of the driver app, under the payment buttons. Several live ones can be swiped.</div>` })
    + callout("cal", "Scheduled", "Set the dates and it goes live and comes down by itself. Hide takes it down at once.");
  return [main, right];
}
function backCouncil(){
  const rv = revenueToday(), C = checksByRoad(), tc = Object.values(C).reduce((s, x) => s + x.c, 0), tu = Object.values(C).reduce((s, x) => s + x.u, 0);
  const mx = Math.max(1, ...Object.keys(ROADS).map(k => rv.R[k].amt)), sm = Math.max(1, rv.src.daily, rv.src.monthly, rv.src.org);
  const un = tc ? 100 - pct(tu, tc) : 0;
  const stats = `<div class="est4">${stat({ hi: 1, t: "Collected today", big: kfmt(rv.total), unit: "GMD", dots: dots(Math.round((paidDay() ? Math.max(0, Math.min(1, (B.min - 420) / 720)) : 0) * 10), 10, "k"), chip: eChip("ink", "all sources", "check") })}
   ${stat({ t: "Council share 60%", big: kfmt(rv.total * .6), unit: "GMD", dots: dots(6, 10, "v"), chip: eChip("vio", "to the Council", "up") })}
   ${stat({ t: "Operator share 40%", big: kfmt(rv.total * .4), unit: "GMD", dots: dots(4, 10, "l"), chip: eChip("grey", "operator") })}
   ${stat({ t: "Unpaid when checked", big: un, unit: "%", dots: dots(Math.round(un / 10), 10, "k"), chip: eChip("ok", tu + " / " + tc, "down") })}</div>`;
  const main = `${callout("shield", "Council view · read-only", "Banjul City Council revenue office: what was collected, where, and how often checked cars were unpaid.")}
   <div class="ep"><div class="eh"><div><h1>Revenue report</h1><p>${dstr(B.date)} · to ${hm(B.min)}${isDemo() ? " · includes simulated background activity for the five pilot roads" : ""}</p></div><div class="btns">${eBtn("Print or save as PDF", "print", null, "ol")}</div></div>${stats}</div>
   <div class="ep"><div class="eh"><h2>By road</h2></div><div class="erows">${Object.keys(ROADS).map(k => { const u = C[k].c ? 100 - pct(C[k].u, C[k].c) : 0;
     return row({ lead: k, title: ROADS[k].name, sub: rv.R[k].n + " daily · " + rv.R[k].m + " monthly · " + plural(C[k].c, "check"), mid: `<div class="emin"><i style="width:${100 * rv.R[k].amt / mx}%"></i></div>`, dur: "GMD " + gmd(rv.R[k].amt), chip: u >= 18 ? eChip("warn", u + "% unpaid") : eChip("grey", u + "% unpaid") }); }).join("")}
     ${rv.R.OTH.amt ? row({ lead: "—", title: "Other roads", sub: rv.R.OTH.n + " daily", dur: "GMD " + gmd(rv.R.OTH.amt) }) : ""}</div></div>`;
  const right = insight({ tag: "By source", title: `<span class="big">GMD ${gmd(rv.total)}</span>`, body: `<div class="br2"><span>Daily passes</span><i style="width:${100 * rv.src.daily / sm}%"></i><span>${kfmt(rv.src.daily)}</span></div><div class="br2"><span>Monthly</span><i class="l" style="width:${100 * rv.src.monthly / sm}%"></i><span>${kfmt(rv.src.monthly)}</span></div><div class="br2"><span>Organisations</span><i class="g" style="width:${100 * rv.src.org / sm}%"></i><span>${kfmt(rv.src.org)}</span></div>` })
    + queue({ title: "Unpaid rate by road", pill: un + "% overall", items: Object.keys(ROADS).map(k => { const u = C[k].c ? 100 - pct(C[k].u, C[k].c) : 0; return { t: ROADS[k].name, s: C[k].u + " of " + C[k].c + " checks unpaid", v: u + "%", n: u, of: 40, bc: "r", vc: u >= 18 ? "r" : "" }; }) })
    + callout("chart", "Evidence for the fines decision", "The unpaid rate by road informs when and how fines start after the pilot.");
  return [main, right];
}
/* staff accounts and the audit log (administrators only; the data comes from /api/staff and /api/audit) */
const AUDIT_WHAT = { "auth.staff": "Signed in", "auth.signin": "Signed in with an SMS code", "auth.code": "Asked for a sign-in code", "auth.verify": "Entered a sign-in code",
  "auth.password": "Changed their password", "staff.create": "Created a staff account", "staff.update": "Changed a staff account", "back.register": "Registered an attendant",
  "back.reassign": "Moved an attendant", "back.createOrg": "Created an organisation", "back.match": "Matched a bank transfer", "back.refer": "Referred to Finance",
  "back.publish": "Published a tariff", "back.announce": "Published an announcement", "back.announceStatus": "Showed or hid an announcement", "back.announceDelete": "Deleted an announcement",
  "back.exception": "Recorded a payment exception", "demo.reset": "Reset the demo" };
/* "SUPERVISOR", "role=finance active=false password reset" -> "Supervisor", "role Finance · switched off · password reset" */
const auditDetail = e => { const d = String(e.detail || "").trim(); if(!d) return "";
  if(e.action === "staff.create") return STAFF_ROLES[d.toLowerCase()] || d;
  if(e.action === "staff.update") return d.replace(/role=(\w+)/, (m, r) => "role " + (STAFF_ROLES[r.toLowerCase()] || r)).replace("active=false", "switched off").replace("active=true", "switched on").split(/\s+(?=role|switched|password)/).join(" · ");
  return d; };
const whenOf = iso => { const d = new Date(iso); return isNaN(d) ? "" : fmtD(d) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()); };
function backStaff(){
  const S = STAFF, list = S.list || [], u = list.find(x => x.username === S.sel);
  const active = list.filter(x => x.active), admins = active.filter(x => x.role === "admin").length, due = active.filter(x => x.mustChangePassword).length;
  const week = active.filter(x => x.lastLogin && Date.now() - new Date(x.lastLogin) < 7 * 864e5).length;
  const stats = `<div class="est4">${stat({ hi: 1, t: "Active accounts", big: active.length, unit: "people", dots: dots(active.length, Math.max(active.length, 6), "k"), chip: eChip("ink", plural(admins, "administrator"), "shield") })}
   ${stat({ t: "Signed in this week", big: week, unit: "of " + active.length, dots: dots(week, Math.max(active.length, 1), "v"), chip: eChip("vio", "12-hour sessions", "clock") })}
   ${stat({ t: "New password due", big: due, unit: due === 1 ? "person" : "people", dots: dots(due, 4, "l"), chip: due ? eChip("warn", "first sign-in") : eChip("ok", "none", "check") })}
   ${stat({ t: "Switched off", big: list.length - active.length, unit: "accounts", dots: dots(list.length - active.length, 4, "r"), chip: eChip("grey", "kept for the audit log") })}</div>`;
  const rows = S.list == null ? `<div class="erow" style="grid-template-columns:1fr"><small style="color:var(--em)">${S.err ? esc(S.err) : "Loading…"}</small></div>`
    : list.map(x => row({ lead: initialsOf(x.name), cls: x.username === S.sel ? "sel" : x.active ? "" : "dim", title: esc(x.name) + (x.username === S.me ? " " + eChip("lime", "You") : ""),
        sub: esc(x.username) + " · " + (STAFF_ROLES[x.role] || x.role), mid: x.lastLogin ? "Last sign-in " + whenOf(x.lastLogin) : "Never signed in", dur: "",
        chip: !x.active ? eChip("grey", "Switched off") : x.mustChangePassword ? eChip("warn", "New password due") : eChip("ok", "Active", "check"), a: "staffsel", v: x.username })).join("");
  const audit = (S.audit || []).filter(e => S.auditAll || !/^(driver|officer|org)$/.test(e.role || "")).map(e => row({ lead: whenOf(e.at).split(" ").pop(), title: esc(AUDIT_WHAT[e.action] || e.action) + (e.target ? " · " + esc(e.target) : ""),
      sub: whenOf(e.at).split(" ").slice(0, 2).join(" ") + " · " + esc(e.actor || "—") + (e.role ? " · " + esc(STAFF_ROLES[e.role] || e.role) : ""), mid: esc(auditDetail(e)), dur: "",
      chip: e.result === "ok" ? eChip("ok", "Done", "check") : eChip("bad", e.result === "refused" ? "Refused" : e.result || "Failed") })).join("");
  const main = `<div class="ep"><div class="eh"><div><h1>Staff & audit</h1><p>Everyone who can sign in to the back office, with their role. Temporary passwords are shown once, when they are set, and must be changed at the first sign-in.</p></div><div class="btns">${eBtn("Add staff", "staffnew", null, "", "plus")}</div></div>${stats}</div>
   <div class="ep"><div class="eh"><h2>Accounts</h2></div><div class="erows">${rows}</div></div>
   <div class="ep"><div class="eh"><div><h2>Audit log</h2><p style="margin-top:2px">Sign-ins and every change made in the back office, newest first. It cannot be edited.</p></div>${seg("auditall", S.auditAll ? "all" : "staff", [["staff", "Staff"], ["all", "Everyone"]])}</div><div class="erows">${audit || `<div class="erow" style="grid-template-columns:1fr"><small style="color:var(--em)">No entries yet.</small></div>`}</div>
     ${(S.audit || []).length >= (S.limit || 60) ? `<div style="margin-top:10px">${eBtn("Show older entries", "auditmore", null, "gh sm")}</div>` : ""}</div>`;
  let right;
  if(S.shown) right = insight({ tag: S.shown.fresh ? "Account created" : "Password reset", title: esc(S.shown.name), body: `<div class="wx">Give this temporary password to ${esc(firstName(S.shown.name))} in person or by phone, never by email or chat. They must choose their own password when they first sign in.</div>
      <div class="kvw"><span>Username</span><b>${esc(S.shown.username)}</b></div><div class="epw" title="Temporary password">${esc(S.shown.password)}</div>`, btn: { l: "Done, I have given it", a: "shownx", pri: 1 } });
  else if(u) right = insight({ tag: "Manage account", title: esc(u.name), body: `<div class="kvw"><span>Username</span><b>${esc(u.username)}</b><span>Created</span><b>${esc(whenOf(u.created))}</b><span>Status</span><b>${u.active ? "Active" : "Switched off"}</b></div>
      <label class="fld2">Role${sel("stRole", "ST.role", S.role, Object.keys(STAFF_ROLES).map(k => [k, STAFF_ROLES[k]]))}</label>
      ${S.role !== u.role ? `<button class="eb lm full" ${A("staffrole")}>Save role · signs them out</button>` : ""}
      <div class="opt3"><button ${A("staffreset")} ${u.active ? "" : "disabled"}><b>Reset password</b><small>new temporary one</small></button><button ${A(u.active ? "staffoff" : "staffon")} ${u.username === S.me ? "disabled" : ""}><b>${u.active ? "Switch off" : "Switch on"}</b><small>${u.active ? "signs them out now" : "they can sign in again"}</small></button></div>
      ${S.err ? `<div class="err">${esc(S.err)}</div>` : ""}` });
  else { const F = S.add;
    right = insight({ tag: "Add staff", title: "New back-office account", body: `<label class="fld2">Full name${inp("stName", "ST.add.name", F.name, "e.g. Fatou Jallow")}</label>
      <label class="fld2">Username${inp("stUser", "ST.add.username", F.username, "e.g. fatou.jallow", "text", 'autocapitalize="none" spellcheck="false"')}</label>
      <label class="fld2">Role${sel("stNewRole", "ST.add.role", F.role, Object.keys(STAFF_ROLES).map(k => [k, STAFF_ROLES[k]]))}</label>
      ${F.err ? `<div class="err">${esc(F.err)}</div>` : ""}`, btn: { l: "Create account", a: "staffadd", pri: 1 } }); }
  right += queue({ title: "Roles", items: [{ t: "Administrator", s: "Everything, including staff accounts and tariffs", v: "All" }, { t: "Supervisor", s: "Attendants, roads and the dashboard", v: "Ops" },
    { t: "Finance", s: "Organisations, transfers and exceptions", v: "Money" }, { t: "Council", s: "The revenue report, read-only", v: "Read" }] });
  return [main, right];
}
/* screen-only back-office actions (the ones that change data are in portal-app.js) */
function backActUI(a, v){
  if(a === "nav"){ if((v === "register" && !can("officers")) || (v === "neworg" && !can("orgs"))) return; BS.view = v; BS.sheet = null; BS.bell = false; BS.user = false; return renderBack(); }
  if(a === "seg"){ BS.seg = v; return renderBack(); }
  if(a === "aseg"){ BS.aseg = v; return renderBack(); }
  if(a === "road"){ BS.road = v; if(BS.view !== "dash" && canSee("dash")){ BS.view = "dash"; BS.seg = "roads"; } return renderBack(); }
  if(a === "pick"){ if(!can("officers")) return; BS.re.off = v; BS.re.err = ""; if(BS.view !== "attendants") BS.view = "attendants"; return renderBack(); }
  if(a === "cover"){
    const q = OFF[v]; if(!q || !can("officers")) return;
    const road = roadOf(q), free = o => o.active && !o.bg && o.num !== v;
    const helper = Object.values(OFF).find(o => free(o) && offStats(o).on && roadOf(o) !== road) || Object.values(OFF).find(free);
    if(!helper){ BS.view = "attendants"; renderBack(); return wtoast("stBack", "No other attendant to send. Register another attendant first."); }
    BS.re = { off: helper.num, road, err: "" }; BS.view = "attendants"; BS.bell = false; return renderBack(); }
  if(a === "why"){ BS.why = !BS.why; return renderBack(); }
  if(a === "plate"){ BS.sheet = v; return renderBack(); }
  if(a === "sheetx"){ BS.sheet = null; return renderBack(); }
  if(a === "bell"){ BS.bell = !BS.bell; BS.help = false; BS.user = false; return renderBack(); }
  if(a === "bellx"){ BS.bell = false; return renderBack(); }
  if(a === "help"){ BS.help = true; BS.bell = false; BS.user = false; return renderBack(); }
  if(a === "helpx"){ BS.help = false; return renderBack(); }
  if(a === "search"){ const p = normPlate(BS.q); if(p){ BS.sheet = p; return renderBack(); } return wtoast("stBack", BS.q.trim() ? "Enter a plate like BJL1234" : "Type a plate to look it up"); }
}
function bindWeb(id, act, rer){
  const el = $(id);
  el.addEventListener("click", e => {
    const b = e.target.closest("[data-a]"); if(!b || b.disabled || !el.contains(b)) return;
    if(b.classList.contains("esheet") && e.target !== b) return;      /* a card closes from its backdrop, not from clicks inside it */
    act(b.dataset.a, b.dataset.v);
  });
  el.addEventListener("input", e => { const t = e.target; if(!t.dataset.f) return; setF(t.dataset.f, t.type === "checkbox" ? t.checked : t.value); if(t.dataset.rr) rer(); });
  el.addEventListener("change", e => { const t = e.target; if(!t.dataset.f) return; setF(t.dataset.f, t.type === "checkbox" ? t.checked : t.value); if(t.tagName === "SELECT") rer(); });
  el.addEventListener("keydown", e => {
    if(e.key !== "Enter" || e.target.tagName !== "INPUT") return;
    if(e.target.id === "oSearch" || e.target.id === "bSearch"){ e.preventDefault(); return act("search"); }
    const b = el.querySelector(".pri[data-a]"); if(b) b.click();
  });
}
document.addEventListener("keydown", e => { if((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k"){ e.preventDefault(); const s = $(ROLE === "org" ? "oSearch" : "bSearch"); if(s) s.focus(); } });

