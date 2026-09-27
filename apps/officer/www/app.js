/* ParkNa Officer: the parking attendant's app. Start and end the shift, check plates, see today's work.
   Signs in with a one-time SMS code on the number registered in the back office. Every action is the same
   as the SMS line (START, a plate, END to the short code), so the SMS line keeps working on phones without data. */
(function(){
var APP = document.getElementById("app");
var VERSION = "1.0";
var ic = UI.ic;
PN.init({ as: "officer" });

var V = { tab: "home", sheet: null, toast: null, seg: "today", setup: { url: "", err: "", busy: false }, check: { plate: "", busy: false, res: null }, busy: false };

var SI = UI.SignIn({
  as: "officer", app: "ParkNa Officer", version: VERSION, ill: UI.ILL.officer,
  title: "Check plates,<br><em>not cash</em>",
  lead: "Start your shift, check plates on your road and end your shift. For ParkNa attendants of Banjul City Council.",
  demo: function(){ return OFFSEED.filter(function(o){ return !o.bg; }).map(function(o){ return { num: o.num, name: o.name, note: "Attendant " + o.id }; }); },
  render: render, onDone: function(){ start(); }
});

/* ---------- helpers ---------- */
function me(){ return PN.me && OFF[PN.me.num]; }
function thread(){ var u = PN.me && NUMS[PN.me.num]; return u ? u.sms : []; }
function onShift(o){ return o.on && o.day === dkey(B.date); }
function plateTxt(p){ return p.replace(/^([A-Z]+)(\d)/, "$1 $2"); }
function shortcode(){ return (PN.mode && PN.mode.shortcode) || (PN.info && PN.info.shortcode) || SC; }
function fromKey(k){ var p = k.split("-").map(Number); return new Date(p[0], p[1], p[2]); }
function dayLabel(d){ var n = daysBetween(d, B.date); return n === 0 ? "Today" : n === 1 ? "Yesterday" : DOW[d.getDay()] + " " + fmtD(d); }
function notices(){ return thread().filter(function(m){ return m.i && m.tag; }); }
function seenKey(){ return "parkna.seen.o." + (PN.me ? PN.me.num : ""); }
function unread(){ return Math.max(0, notices().length - (+PN.ls(seenKey()) || 0)); }
function myChecks(o){ return CHECKS.filter(function(c){ return c.off === o.id; }); }

/* ---------- render ---------- */
function render(){
  var h;
  if(!PN.server) h = setupView();
  else if(!PN.signedIn()) h = SI.view();
  else if(!PN.ready || !PN.me || !me()) h = loadingView();
  else h = mainView();
  paint(h);
}
function paint(h){
  var a = document.activeElement, id = a && a.id, s = null, e = null;
  try { if(id){ s = a.selectionStart; e = a.selectionEnd; } } catch(x){}
  var sc = APP.querySelector(".scr"), top = sc ? sc.scrollTop : 0;
  APP.innerHTML = h;
  var sc2 = APP.querySelector(".scr"); if(sc2) sc2.scrollTop = top;
  if(id){ var n = document.getElementById(id); if(n){ n.focus(); try { if(s != null) n.setSelectionRange(s, e); } catch(x){} } }
}
function loadingView(){
  var off = PN.ready && PN.me && !me();
  return '<div class="auth"><div class="grow"></div>'+(off ? '<h2>Account<br><em>switched off</em></h2><p class="lead">This number is no longer an active ParkNa attendant. Ask your supervisor.</p><button class="btn ghost" data-a="signout">Sign out</button>'
    : '<div class="spin" style="align-self:center"></div><p class="lead" style="text-align:center">'+(V.slow ? "Can’t reach ParkNa yet. Check your internet connection. The SMS line still works: text START to " + shortcode() + "." : "Loading your shift…")+'</p>'
      + (V.slow ? '<button class="btn ghost" data-a="signout">Sign out</button>' : ""))+'<div class="grow"></div></div>';
}
function setupView(){
  var S = V.setup;
  return '<div class="auth"><div class="brand"><img src="assets/img/crest.png" alt=""><span>ParkNa Officer<small>Banjul City Council</small></span></div>'
    + '<h2>Connect to<br><em>ParkNa</em></h2><p class="lead">Enter the ParkNa server address your supervisor gave you.</p>'
    + '<label class="fld">Server address<input class="inp" id="srv" inputmode="url" autocapitalize="off" placeholder="https://parkna.gm" value="'+esc(S.url)+'"></label>'
    + (S.err ? '<div class="err">'+esc(S.err)+'</div>' : "")
    + '<button class="btn" data-a="connect"'+(S.busy ? " disabled" : "")+'>'+(S.busy ? "Connecting…" : "Connect")+'</button><div class="grow"></div></div>';
}
function mainView(){
  var h = ({ home: homeView, checks: checksView, msgs: msgsView, profile: profileView })[V.tab]();
  h += tabbar();
  if(V.sheet) h += sheetView();
  if(V.toast) h += '<div class="toast">'+ic("check", 18, 2.6)+'<span>'+esc(V.toast)+'</span></div>';
  return h;
}
function tabbar(){
  function t(k, l, i, badge){ return '<button class="'+(V.tab === k ? "on" : "")+'" data-a="tab" data-v="'+k+'">'+ic(i, 23, V.tab === k ? 2.2 : 1.8)+l+'</button>'; }
  return '<nav class="tabs">'+t("home", "Home", "home")+t("checks", "Checks", "shield")
    + '<button class="fab" data-a="check" aria-label="Check a plate">'+ic("scan", 28, 2.2)+'</button>'
    + t("msgs", "Messages", "sms")+t("profile", "Profile", "user")+'</nav>';
}
function topbar(title, left){
  var o = me(), n = unread();
  return '<div class="top">'+(left || '<button class="cb" data-a="tab" data-v="profile" aria-label="Profile"><span class="av">'+o.id+'</span></button>')
    + '<h1>'+title+'</h1><button class="cb" data-a="tab" data-v="msgs" aria-label="Messages">'+ic("bell", 22, 2)+(n ? '<span class="bd">'+n+'</span>' : "")+'</button></div>'
    + (PN.online ? "" : '<span class="offl">'+ic("wifi", 14, 2.2)+'Reconnecting… The SMS line still works.</span>');
}

/* ---------- home ---------- */
function homeView(){
  var o = me(), road = roadOf(o), moved = road !== o.road, s = offStats(o), on = onShift(o), sh = SHIFTS[o.shift];
  var hero;
  if(on){
    var el = Math.max(0, B.min - o.start);
    hero = '<div class="hero"><span class="lb">On shift since '+hm(o.start)+'</span><span class="big">'+Math.floor(el/60)+'<small>h</small> '+pad(el%60)+'<small>m</small></span><span class="chip lime">'+ic("clock", 15, 2.3)+sh.label+(moved ? " · moved today" : "")+'</span></div>';
  } else if(o.summary && o.summary.day === dkey(B.date)){
    hero = '<div class="hero"><span class="lb">Shift ended '+hm(o.summary.end)+'</span><span class="big">Done</span><span class="chip ok">'+ic("check", 15, 2.6)+(o.summary.checked || 0)+' checked · '+(o.summary.unpaid || 0)+' not paid</span></div>';
  } else {
    hero = '<div class="hero"><span class="lb">'+UI.greet(B.min)+', '+esc(o.name.split(" ")[0])+'</span><span class="big">Off shift</span><span class="chip">'+ic("clock", 15, 2.3)+'Your shift: '+sh.label+'</span></div>';
  }
  var acts = '<div class="acts">'
    + (on ? act("end", "End shift", "stop", true) : act("start", "Start shift", "play", true))
    + act("check", "Check", "scan") + act("checks", "Checks", "shield") + act("help", "Help", "help") + '</div>';
  var unp = s.checked ? Math.round(s.unpaid * 100 / s.checked) : 0;
  var stats = '<div class="two"><div class="stat"><small>Checked today</small><b>'+s.checked+'</b></div><div class="stat"><small>Not paid'+(s.checked ? '<i class="down">'+unp+'%</i>' : "")+'</small><b>'+s.unpaid+'</b></div></div>';
  var recent = myChecks(o).filter(function(c){ return c.day === dkey(B.date); }).slice(-5).reverse();
  return '<div class="scr">'+topbar("Attendant "+o.id)
    + '<span class="sel"><span class="ch">'+ic("pin", 13, 2.4)+'</span>'+esc(ROADS[road].name)+'<small style="color:var(--mute);font-weight:600">'+ROADS[road].bays.replace("-", "–")+'</small></span>'
    + hero + acts + stats
    + '<div class="sh"><h2>Recent checks</h2><button data-a="tab" data-v="checks">View all'+ic("chevR", 16, 2.2)+'</button></div>'
    + '<div class="card tight">'+(recent.length ? '<div class="rows">'+recent.map(checkRow).join("")+'</div>' : '<div class="empty">'+(on ? "Tap the green button to check your first plate." : "Start your shift, then check plates on your road.")+'</div>')+'</div></div>';
}
function act(a, label, icon, pri){ return '<button class="'+(pri ? "pri" : "")+'" data-a="'+a+'"'+(V.busy && pri ? " disabled" : "")+'><span class="ico">'+ic(icon, 22, 2.1)+'</span>'+label+'</button>'; }
function checkRow(c){
  var st = PLATES[c.plate] ? state(c.plate) : null, un = c.st === "UNPAID", paidNow = un && st && st !== "UNPAID";
  return '<div class="row"><span class="av '+(un ? "ic-bad" : c.st === "ORG" ? "ic-org" : "ic-ok")+'">'+ic("car", 20, 2)+'</span>'
    + '<span class="t"><b style="font-family:PlateMono,monospace;letter-spacing:.06em">'+plateTxt(c.plate)+'</b><small>'+hm(c.t)+(c.road !== roadOf(me()) ? ' · '+esc(ROADS[c.road].name) : "")+(paidNow ? " · paid since" : "")+'</small></span>'
    + '<span class="r"><span class="st '+(un ? "unpaid" : c.st === "ORG" ? "org" : "paid")+'">'+(un ? "Not paid" : c.st === "ORG" ? "Organisation" : c.st === "MONTHLY" ? "Monthly" : "Paid")+'</span></span></div>';
}

/* ---------- checks ---------- */
function checksView(){
  var o = me(), all = myChecks(o).slice().reverse(), today = dkey(B.date);
  var list = V.seg === "today" ? all.filter(function(c){ return c.day === today; }) : all;
  var paid = list.filter(function(c){ return c.st !== "UNPAID"; }).length, unp = list.length - paid;
  var body = "", last = null;
  list.forEach(function(c){ if(c.day !== last){ body += '<div class="day">'+dayLabel(fromKey(c.day))+'</div>'; last = c.day; } body += checkRow(c); });
  return '<div class="scr">'+topbar("Checks", '<button class="cb" data-a="tab" data-v="home" aria-label="Back">'+ic("back", 22, 2.2)+'</button>')
    + '<div class="seg"><button class="'+(V.seg === "today" ? "on" : "")+'" data-a="seg" data-v="today">Today</button><button class="'+(V.seg === "week" ? "on" : "")+'" data-a="seg" data-v="week">Last 14 days</button></div>'
    + '<div class="two"><div class="stat"><small>Paid</small><b>'+paid+'</b></div><div class="stat"><small>Not paid'+(list.length ? '<i class="down">'+Math.round(unp*100/list.length)+'%</i>' : "")+'</small><b>'+unp+'</b></div></div>'
    + '<div class="card tight">'+(list.length ? '<div class="rows">'+body+'</div>' : '<div class="empty">No checks yet.</div>')+'</div></div>';
}

/* ---------- messages ---------- */
function msgsView(){
  var list = notices().slice().reverse();
  PN.ls(seenKey(), String(notices().length));
  return '<div class="scr">'+topbar("Messages", '<button class="cb" data-a="tab" data-v="home" aria-label="Back">'+ic("back", 22, 2.2)+'</button>')
    + (typeof ANN !== "undefined" && ANN && ANN.length ? '<div class="promos">'+liveAnnouncements().map(function(x){ return '<div class="promo t-'+esc(x.theme)+'"><div class="tx"><span class="k">'+esc(x.kind)+'</span><b>'+esc(x.title)+'</b>'+(x.text ? '<p>'+esc(x.text)+'</p>' : "")+'</div><span class="ill">'+(UI.ILL[x.kind] || UI.ILL.Announcement)+'</span></div>'; }).join("")+'</div>' : "")
    + '<div class="card tight">'+(list.length ? '<div class="rows">'+list.map(function(m){
        return '<div class="row" style="align-items:flex-start"><span class="av '+(m.tag === "Reassigned" ? "ic-bad" : "ic-ink")+'">'+ic(m.tag === "Shift" ? "clock" : m.tag === "Reassigned" ? "road" : "sms", 20, 2)+'</span><span class="t"><b style="white-space:normal;font-size:14.5px;font-weight:500;line-height:1.45">'+esc(m.i)+'</b><small>'+esc(m.tag)+' · '+m.t+'</small></span><span></span></div>'; }).join("")+'</div>'
      : '<div class="empty">Messages from your supervisor and the back office appear here.</div>')+'</div></div>';
}

/* ---------- profile ---------- */
function profileView(){
  var o = me();
  function kv(icon, k, v){ return '<div class="row"><span class="av ic-soft">'+ic(icon, 20, 2)+'</span><span class="t"><small>'+k+'</small><b>'+v+'</b></span><span></span></div>'; }
  return '<div class="scr">'+topbar("Profile", '<button class="cb" data-a="tab" data-v="home" aria-label="Back">'+ic("back", 22, 2.2)+'</button>')
    + '<div class="prof"><span class="av">'+o.id+'</span><b>'+esc(o.name)+'</b><small>Attendant '+o.id+' · '+UI.phone(o.num)+'</small></div>'
    + '<div class="card tight"><div class="rows">'+kv("road", "Road", esc(ROADS[o.road].name)+" "+ROADS[o.road].bays.replace("-", "–"))+kv("clock", "Shift", SHIFTS[o.shift].label)
    + kv("doc", "Staff number", esc(o.staff))+kv("user", "Supervisor", esc(o.super || "—"))+'</div></div>'
    + '<div class="card tight"><div class="menu">'
    + '<button data-a="help"><span class="mi">'+ic("help", 20, 2)+'</span><span>How checks work<small>Paid, not paid, organisation plates</small></span>'+ic("chevR", 18, 2)+'</button>'
    + '<a href="'+esc(PN.server + "/privacy.html")+'" target="_blank" rel="noopener"><span class="mi">'+ic("lock", 20, 2)+'</span><span>Privacy</span>'+ic("chevR", 18, 2)+'</a>'
    + '<button data-a="signout"><span class="mi">'+ic("out", 20, 2)+'</span><span class="red">Sign out</span>'+ic("chevR", 18, 2)+'</button></div></div>'
    + '<div class="foot"><img src="assets/img/innovii-navy.png" alt="INNOVII">ParkNa Officer v'+VERSION+'</div></div>';
}

/* ---------- sheets ---------- */
function sheetView(){
  var body = V.sheet === "check" ? checkSheet() : helpSheet();
  return '<div class="ov" data-a="close"><div class="sheet" data-keep="1"><span class="hd"></span>'+body+'</div></div>';
}
function head(t){ return '<div class="sht"><h3>'+t+'</h3><button class="x" data-a="close" aria-label="Close">'+ic("x", 18, 2.4)+'</button></div>'; }
function checkSheet(){
  var o = me(), C = V.check, on = onShift(o), r = C.res;
  var h = head("Check a plate");
  if(!on) return h + '<div class="note">'+ic("info", 18, 2)+'<span>Start your shift first. Checks are recorded on your road with the time.</span></div><button class="btn" data-a="start">'+ic("play", 20, 2.2)+'Start shift</button>';
  h += '<label class="fld">Plate number<input class="inp pl" id="chkPlate" autocapitalize="characters" autocomplete="off" placeholder="BJL 1234" value="'+esc(C.plate)+'"></label>';
  var cars = PARK.filter(function(c){ return c.road === roadOf(o); });
  if(cars.length) h += '<div class="demo" style="margin-top:-6px">'+cars.map(function(c){ return '<button data-a="fill" data-v="'+c.plate+'" style="font-family:PlateMono,monospace;letter-spacing:.05em">'+plateTxt(c.plate)+'<small>Bay '+c.bay+'</small></button>'; }).join("")+'</div>';
  if(r) h += result(r);
  h += '<button class="btn" data-a="docheck"'+(C.busy || !normPlate(C.plate) ? " disabled" : "")+'>'+(C.busy ? "Checking…" : ic("scan", 20, 2.2)+"Check")+'</button>';
  return h;
}
/* the answer is the same text the SMS line sends: "BJL1234: PAID. Daily pass till 7pm." */
function result(txt){
  var m = /^([A-Z0-9]+): (PAID|UNPAID)\.\s*([\s\S]*)$/.exec(txt);
  if(!m) return '<div class="note">'+ic("info", 18, 2)+'<span>'+esc(txt)+'</span></div>';
  var paid = m[2] === "PAID", org = paid && /Organisation/.test(m[3]);
  var bg = paid ? (org ? "var(--ink)" : "var(--lime)") : "var(--bad)", fg = paid && !org ? "var(--limeink)" : "#fff";
  var lines = m[3].split("\n").filter(Boolean);
  return '<div style="background:'+bg+';color:'+fg+';border-radius:26px;padding:20px;display:flex;flex-direction:column;gap:8px">'
    + '<div style="display:flex;justify-content:space-between;align-items:center"><span class="plate" style="border-color:'+(paid && !org ? "var(--ink)" : "#fff")+'">'+plateTxt(m[1])+'</span>'+ic(paid ? "check" : "x", 30, 3)+'</div>'
    + '<div style="font-size:34px;font-weight:800;letter-spacing:-.02em">'+(paid ? (org ? "PAID · Organisation" : "PAID") : "NOT PAID")+'</div>'
    + lines.map(function(l){ return '<div style="font-size:14.5px;font-weight:600;line-height:1.45;opacity:.95">'+esc(l)+'</div>'; }).join("")+'</div>';
}
function helpSheet(){
  return head("How checks work") + '<div class="rows">'
    + [["play", "Start your shift", "Tap Start shift when you arrive on your road. Checks only count during your shift."],
       ["scan", "Check each car", "Tap the green button and enter the plate. ParkNa answers PAID or NOT PAID at once."],
       ["x", "Not paid?", "If the driver is there, show the Park & Pay card. If not, leave a card on the windscreen. Never take money."],
       ["shield", "Organisation plates", "Company cars are covered by their organisation. Nothing to do."],
       ["stop", "End your shift", "Tap End shift when you leave. Your supervisor sees your checks live."],
       ["sms", "No data?", "The SMS line does the same: text START, a plate, or END to " + shortcode() + " from your registered number."]].map(function(r){
        return '<div class="row" style="align-items:flex-start"><span class="av ic-soft">'+ic(r[0], 20, 2)+'</span><span class="t"><b>'+r[1]+'</b><small style="line-height:1.5">'+esc(r[2])+'</small></span><span></span></div>'; }).join("")+'</div>';
}

/* ---------- actions ---------- */
function toast(t){ V.toast = t; render(); clearTimeout(toast.t); toast.t = setTimeout(function(){ V.toast = null; render(); }, 2800); }
function nav(){ try { history.pushState({ pn: 1 }, ""); } catch(e){} }
window.addEventListener("popstate", function(){
  if(V.sheet){ V.sheet = null; return render(); }
  if(V.tab !== "home"){ V.tab = "home"; return render(); }
});
function line(text){ return PN.act({ type: "sms", text: text }); }
function shift(cmd){
  V.busy = true; render();
  line(cmd).then(function(r){
    V.busy = false;
    if(r.err) return toast(r.err);
    toast(cmd === "START" ? "Shift started. Good luck!" : "Shift ended. Thank you.");
    if(V.sheet === "check" && cmd === "START") setTimeout(focusPlate, 60);
  });
}
function focusPlate(){ var i = document.getElementById("chkPlate"); if(i) i.focus(); }
function doCheck(){
  var C = V.check, p = normPlate(C.plate);
  if(!p) return;
  C.busy = true; C.res = null; render();
  line(p).then(function(r){
    C.busy = false;
    C.res = r.err || String(r.reply || "");
    C.plate = "";
    render(); focusPlate();
  });
}
APP.addEventListener("click", function(e){
  var si = e.target.closest("[data-si]");
  if(si && SI.click(si.dataset.si, si.dataset.v)) return;
  var t = e.target.closest("[data-a]"); if(!t) return;
  var a = t.dataset.a, v = t.dataset.v;
  if(a === "close" && t.classList.contains("ov") && e.target.closest("[data-keep]")) return;
  switch(a){
    case "tab": V.tab = v; V.sheet = null; if(v !== "home") nav(); return render();
    case "checks": V.tab = "checks"; nav(); return render();
    case "seg": V.seg = v; return render();
    case "close": V.sheet = null; return render();
    case "check": V.sheet = "check"; V.check = { plate: "", busy: false, res: null }; nav(); render(); return setTimeout(focusPlate, 80);
    case "help": V.sheet = "help"; nav(); return render();
    case "fill": V.check.plate = v; return render();
    case "docheck": return doCheck();
    case "start": return shift("START");
    case "end": if(!confirm("End your shift now?")) return; return shift("END");
    case "signout": if(!confirm("Sign out of ParkNa Officer on this phone?")) return; return PN.logout();
    case "connect": {
      var S = V.setup; S.url = (document.getElementById("srv") || {}).value || S.url; S.busy = true; S.err = ""; render();
      PN.ping(S.url).then(function(info){ S.busy = false; if(!info){ S.err = "No ParkNa server at that address."; return render(); } PN.setServer(info.url); boot(); });
      return;
    }
  }
});
APP.addEventListener("input", function(e){
  var t = e.target;
  if(SI.input(t)) return;
  if(t.id === "chkPlate"){ V.check.plate = t.value.toUpperCase(); var b = APP.querySelector('[data-a="docheck"]'); if(b) b.disabled = !normPlate(V.check.plate) || V.check.busy; }
  else if(t.id === "srv") V.setup.url = t.value;
});
APP.addEventListener("keydown", function(e){
  if(e.key !== "Enter") return;
  var t = e.target;
  if(SI.enter(t)) return;
  if(t.id === "chkPlate"){ e.preventDefault(); doCheck(); }
  if(t.id === "srv") APP.querySelector('[data-a="connect"]').click();
});

/* ---------- start ---------- */
PN.onSignOut = function(expired){ SI.reset(); V.tab = "home"; V.sheet = null; render(); if(expired) setTimeout(function(){ alert("You were signed out. Sign in again with your registered number."); }, 50); };
function start(){
  V.slow = false; render();
  clearTimeout(start.t); start.t = setTimeout(function(){ if(!PN.ready){ V.slow = true; render(); } }, 8000);
  PN.connect(function(){ if(!V.check.busy) render(); }, function(){ render(); });
}
function boot(){
  if(!PN.server) return render();
  PN.ping().then(function(){ if(PN.signedIn()) start(); else render(); });
  render();
}
boot();
})();
