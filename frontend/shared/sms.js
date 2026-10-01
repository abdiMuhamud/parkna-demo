/* SUNU Park SMS simulator (/sms.html): administrators and supervisors text the short code as any phone (a driver, an
   attendant, an organisation contact or a new number) and see the replies, exactly as the SMS line answers real
   phones. Each text goes through the server like an SMS from Kannel ("sim.sms"); the threads follow the live state. */
(function(){
  var root = document.getElementById("root");
  PN.init({ as: "staff" });
  PN.server = location.origin;
  var open = [], err = {}, L = { user: "", pass: "", err: "", busy: false }, newNum = "";
  try { open = JSON.parse(PN.ls("parkna.sim.open") || "[]").filter(function(n){ return /^\d{7}$/.test(n); }); } catch(e){ open = []; }
  function keep(){ PN.ls("parkna.sim.open", JSON.stringify(open)); }
  function e(s){ return esc(s); }
  function phoneTxt(n){ return "+220 " + n.slice(0, 3) + " " + n.slice(3); }

  /* who a number is: an attendant, an organisation contact, a driver, or nobody yet */
  function kind(n){
    if(OFF[n]) return { k: "o", label: "Attendant " + OFF[n].id, name: OFF[n].name };
    for(var id in ORGA) if(ORGA[id].contact.num === n) return { k: "g", label: id, name: ORGA[id].contact.name + " · " + ORGA[id].name };
    var u = NUMS[n];
    return { k: "", label: "Driver", name: u && u.name !== "+220 " + n ? u.name : "New number" };
  }
  function chips(n){
    var k = kind(n).k, u = NUMS[n], plates = u ? u.plates.slice(0, 3) : [];
    if(k === "o") return ["START", "END"].concat(Object.keys(PLATES).slice(0, 3)).concat(Object.keys(PLATES).slice(0, 2).map(function(p){ return "W " + p; })).concat(["HELP"]);
    return ["HELP", "TERMS"].concat(plates.length ? plates : ["BJL1234"]).concat(["M", "1", "2", "3", "4"]);
  }

  function thread(n){
    var u = NUMS[n], list = u ? u.sms : [];
    if(!list.length) return '<div class="d">No messages yet. Text the short code: try HELP, a plate, or START for an attendant.</div>';
    return list.slice(-120).map(function(m){
      if(m.d) return '<div class="d">' + e(m.d) + '</div>';
      if(m.o != null) return '<div class="m out">' + e(m.o) + '<small>' + e(m.t || "") + '</small></div>';
      return '<div class="m in">' + (m.tag ? '<span class="tag">' + e(m.tag) + '</span><br>' : "") + e(m.i) + '<small>' + e(m.t || "") + '</small></div>';
    }).join("");
  }
  function phone(n){
    var w = kind(n);
    return '<div class="phone" data-n="' + n + '"><div class="scr"><div class="ph"><div><b>' + e(w.name) + '</b><small>' + phoneTxt(n) + '</small></div><span class="sp"></span><span class="role ' + w.k + '">' + e(w.label) + '</span><button class="x" data-close="' + n + '" aria-label="Close">×</button></div>'
      + '<div class="th" id="th' + n + '">' + thread(n) + '</div>'
      + '<div class="chips">' + chips(n).map(function(c){ return '<button data-q="' + e(c) + '" data-n="' + n + '">' + e(c) + '</button>'; }).join("") + '</div>'
      + '<div class="err" id="er' + n + '">' + e(err[n] || "") + '</div>'
      + '<form class="bar" data-n="' + n + '"><input id="in' + n + '" maxlength="160" autocomplete="off" placeholder="Text to ' + e((PN.mode && PN.mode.shortcode) || SC) + '"><button aria-label="Send">➤</button></form></div></div>';
  }
  function who(n, w){ return '<button class="who' + (open.indexOf(n) >= 0 ? " on" : "") + '" data-open="' + n + '"><span class="av ' + w.k + '">' + e((w.name || "?").split(" ").map(function(x){ return x[0]; }).join("").slice(0, 2).toUpperCase()) + '</span><span><b>' + e(w.name) + '</b><small>' + phoneTxt(n) + ' · ' + e(w.label) + '</small></span></button>'; }
  function side(){
    var offs = Object.keys(OFF).filter(function(n){ return OFF[n].active; }), orgs = Object.keys(ORGA).map(function(id){ return ORGA[id].contact.num; });
    var drivers = Object.keys(NUMS).filter(function(n){ return !OFF[n] && orgs.indexOf(n) < 0 && /^\d{7}$/.test(n); })
      .sort(function(a, b){ return (NUMS[b].plates.length - NUMS[a].plates.length) || a.localeCompare(b); }).slice(0, 60);
    function group(t, list){ return list.length ? '<h3>' + t + '</h3>' + list.map(function(n){ return who(n, kind(n)); }).join("") : ""; }
    return '<aside class="side"><h3>Any number</h3><form class="new" id="newf"><input id="newNum" inputmode="numeric" maxlength="12" placeholder="7-digit number" value="' + e(newNum) + '"><button class="btn y">Open</button></form>'
      + group("Attendants", offs) + group("Organisation contacts", orgs) + group("Drivers", drivers)
      + '<div class="flows"><b>Flows to try.</b> Driver: a plate, then 1–4 to pay; M for monthly; TERMS. Attendant: START, a plate, W and a plate for a warning, END. A warned driver texting any plate is asked to settle the warning first.</div></aside>';
  }
  function header(){
    var m = PN.mode || {};
    return '<header><span class="logo">P</span><div><b>SMS simulator</b><small>SUNU Park short code ' + e(m.shortcode || SC) + ' · signed in as ' + e((PN.me && PN.me.name) || "") + '</small></div><span class="sp"></span>'
      + (m.payments ? '<span class="pill">Payments: simulated wallets</span>' : '<span class="pill warn">Mobile money is off: payment replies say it opens soon</span>')
      + (m.mode === "production" ? '<span class="pill off">Live server: replies to these numbers stay here for 2 hours; other SMS (e.g. warnings to a plate’s driver) go out as usual</span>' : '<span class="pill">' + e(m.mode || "") + ' server</span>')
      + '<a class="link" href="/admin.html">Back office</a><button class="link" id="out">Sign out</button></header>';
  }
  function render(){
    if(!PN.signedIn()) return loginView();
    if(!PN.ready){ root.innerHTML = '<div class="empty">Connecting to the SUNU Park server…</div>'; return; }
    var role = PN.me && PN.me.role;
    if(role !== "admin" && role !== "supervisor"){ root.innerHTML = header() + '<div class="empty">The SMS simulator is for administrators and supervisors.</div>'; return; }
    if(PN.mode && !PN.mode.smsSimulator){ root.innerHTML = header() + '<div class="empty">The SMS simulator is switched off on this server. An administrator can switch it on with sms.simulator.enabled=true in config.properties.</div>'; return; }
    var focus = document.activeElement && document.activeElement.id, vals = {};
    open.forEach(function(n){ var i = document.getElementById("in" + n); if(i) vals[n] = i.value; });
    var scroll = {};
    open.forEach(function(n){ var t = document.getElementById("th" + n); if(t) scroll[n] = t.scrollHeight - t.scrollTop - t.clientHeight < 40; });
    root.innerHTML = header() + '<div class="wrap">' + side() + '<div class="phones">' + (open.length ? open.map(phone).join("") : '<div class="empty">Pick a phone on the left (up to 4 side by side), or open any number.</div>') + '</div></div>';
    open.forEach(function(n){
      var i = document.getElementById("in" + n); if(i && vals[n]) i.value = vals[n];
      var t = document.getElementById("th" + n); if(t && scroll[n] !== false) t.scrollTop = t.scrollHeight;
    });
    if(focus){ var f = document.getElementById(focus); if(f){ f.focus(); try { f.setSelectionRange(f.value.length, f.value.length); } catch(x){} } }
  }
  function loginView(){
    root.innerHTML = '<form class="login" id="lf"><span class="logo" style="width:44px;height:44px;border-radius:12px;background:#0B2E63;color:#FEDB46;display:grid;place-items:center;font-weight:800;font-size:24px">P</span>'
      + '<h1>SMS simulator</h1><p>Sign in with your SUNU Park back-office account (administrator or supervisor).</p>'
      + '<input id="lu" autocomplete="username" placeholder="Username" value="' + e(L.user) + '"><input id="lp" type="password" autocomplete="current-password" placeholder="Password">'
      + (L.err ? '<div class="err" style="padding:0">' + e(L.err) + '</div>' : "") + '<button class="btn"' + (L.busy ? " disabled" : "") + '>' + (L.busy ? "Signing in…" : "Sign in") + '</button></form>';
  }
  function openNum(n){
    n = String(n || "").replace(/\D/g, "").slice(-7);
    if(n.length !== 7) return false;
    if(open.indexOf(n) < 0){ open.push(n); if(open.length > 4) open.shift(); keep(); }
    render();
    var i = document.getElementById("in" + n); if(i) i.focus();
    return true;
  }
  function send(n, text){
    text = String(text || "").trim();
    if(!text) return;
    err[n] = "";
    PN.act({ type: "sim.sms", from: n, text: text }).then(function(r){
      err[n] = r && r.err ? r.err : "";
      var x = document.getElementById("er" + n); if(x) x.textContent = err[n];
    });
  }

  root.addEventListener("submit", function(ev){
    ev.preventDefault();
    var f = ev.target;
    if(f.id === "lf"){
      L.user = document.getElementById("lu").value.trim(); L.busy = true; L.err = ""; loginView();
      PN.staffLogin(L.user, (document.getElementById("lp") || {}).value || "").then(function(r){ L.busy = false; if(r.err){ L.err = r.err; return loginView(); } start(); });
      return;
    }
    if(f.id === "newf"){ newNum = document.getElementById("newNum").value; if(!openNum(newNum)) alert("Enter a 7-digit Gambian number."); else newNum = ""; return; }
    var n = f.dataset.n, i = document.getElementById("in" + n);
    if(n && i){ send(n, i.value); i.value = ""; i.focus(); }
  });
  root.addEventListener("click", function(ev){
    var b = ev.target.closest("button"); if(!b) return;
    if(b.dataset.open){ openNum(b.dataset.open); return; }
    if(b.dataset.close){ open = open.filter(function(x){ return x !== b.dataset.close; }); keep(); render(); return; }
    if(b.dataset.q){ send(b.dataset.n, b.dataset.q); return; }
    if(b.id === "out"){ PN.logout(); return; }
  });
  PN.onSignOut = function(){ render(); };
  function start(){ PN.connect(render, render); render(); }
  if(PN.signedIn()) start(); else render();
})();
