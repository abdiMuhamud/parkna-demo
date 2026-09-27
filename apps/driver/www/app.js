/* ParkNa driver app: pay for street parking in Banjul, keep receipts, get Council news.
   Signs in with a one-time SMS code; the server sends this driver their own data only. */
(function(){
var APP = document.getElementById("app");
var VERSION = "1.0";
var ic = UI.ic;
PN.init({ as: "driver" });

var V = {
  tab: "home", sheet: null, done: null, toast: null, focus: null, act: "pay", range: "M", booting: true, setup: { url: "", err: "", busy: false },
  pay: { plate: "", kind: "daily", prov: null, status: null, busy: false, err: "" },
  add: { plate: "", err: "", busy: false }, annX: 0, annI: 0
};
var LOGO = { Wave: "wave", Afrimoney: "afrimoney", APS: "aps", QMoney: "qmoney" };

var SI = UI.SignIn({
  as: "driver", app: "ParkNa", version: VERSION, ill: UI.ILL.driver,
  title: "Park smarter<br>in <em>Banjul</em>",
  lead: "Pay for street parking, keep every receipt, and get Banjul City Council news, all from your phone.",
  demo: function(){ return PERSONAS.map(function(p){ return { num: p.num, name: p.name, note: p.note }; }); },
  render: render, onDone: function(){ start(); }
});

/* ---------- helpers ---------- */
function me(){ return PN.me && NUMS[PN.me.num]; }
function payOn(){ return !!(PN.mode && PN.mode.payments); }
function focusPlate(u){ return V.focus && u.plates.indexOf(V.focus) >= 0 ? V.focus : (u.last && u.plates.indexOf(u.last) >= 0 ? u.last : u.plates[0]); }
function fromKey(k){ var p = k.split("-").map(Number); return new Date(p[0], p[1], p[2]); }
function dayLabel(d){ var n = daysBetween(d, B.date); return n === 0 ? "Today" : n === 1 ? "Yesterday" : DOW[d.getDay()] + " " + fmtD(d); }
function plateTxt(p){ return p.replace(/^([A-Z]+)(\d)/, "$1 $2"); }
function inbox(u){ return (u.sms || []).filter(function(m){ return m.i; }); }
function seenKey(){ return "parkna.seen." + (PN.me ? PN.me.num : ""); }
function unread(u){ return Math.max(0, inbox(u).length - (+PN.ls(seenKey()) || 0)); }
function provOf(u){ return V.pay.prov || (u && u.prov) || "Wave"; }
function logo(n){ return '<img src="assets/img/logos/'+LOGO[n]+'.png" alt="">'; }

/* ---------- render ---------- */
function render(){
  var h;
  if(!PN.server) h = setupView();
  else if(!PN.signedIn()) h = SI.view();
  else if(SI.state.step === "name") h = SI.view();
  else if(!PN.ready || !PN.me) h = loadingView();
  else if(PN.me.needName){ SI.askName(); h = SI.view(); }
  else if(!me()) h = loadingView();
  else h = mainView();
  paint(h);
}
function paint(h){
  var a = document.activeElement, id = a && a.id, s = null, e = null;
  try { if(id){ s = a.selectionStart; e = a.selectionEnd; } } catch(x){}
  var sc = APP.querySelector(".scr"), top = sc ? sc.scrollTop : 0, sh = APP.querySelector(".sheet"), stop = sh ? sh.scrollTop : 0;
  APP.innerHTML = h;
  var sc2 = APP.querySelector(".scr"); if(sc2) sc2.scrollTop = top;
  var sh2 = APP.querySelector(".sheet"); if(sh2) sh2.scrollTop = stop;
  var pr = APP.querySelector(".promos"); if(pr && V.annX) pr.scrollLeft = V.annX;
  if(id){ var n = document.getElementById(id); if(n){ n.focus(); try { if(s != null) n.setSelectionRange(s, e); } catch(x){} } }
}
function loadingView(){
  return '<div class="auth"><div class="grow"></div><div class="spin" style="align-self:center"></div><p class="lead" style="text-align:center">'
    + (V.slow ? "Can’t reach ParkNa yet. Check your internet connection." : "Loading your account…") + '</p><div class="grow"></div>'
    + (V.slow ? '<button class="btn ghost" data-a="signout">Sign out</button>' : "") + '</div>';
}
function setupView(){
  var S = V.setup;
  return '<div class="auth"><div class="brand"><img src="assets/img/crest.png" alt=""><span>ParkNa<small>Banjul City Council</small></span></div>'
    + '<h2>Connect to<br><em>ParkNa</em></h2><p class="lead">Enter the ParkNa server address, for example <b>https://parkna.gm</b>.</p>'
    + '<label class="fld">Server address<input class="inp" id="srv" inputmode="url" autocapitalize="off" placeholder="https://parkna.gm" value="'+esc(S.url)+'"></label>'
    + (S.err ? '<div class="err">'+esc(S.err)+'</div>' : "")
    + '<button class="btn" data-a="connect"'+(S.busy ? " disabled" : "")+'>'+(S.busy ? "Connecting…" : "Connect")+'</button><div class="grow"></div></div>';
}
function mainView(){
  var h = ({ home: homeView, activity: activityView, plates: platesView, profile: profileView })[V.tab]();
  h += tabbar();
  if(V.sheet) h += sheetView();
  if(V.done) h += doneView();
  if(V.toast) h += '<div class="toast">'+ic("check", 18, 2.6)+'<span>'+esc(V.toast)+'</span></div>';
  return h;
}
function tabbar(){
  function t(k, l, i){ return '<button class="'+(V.tab === k ? "on" : "")+'" data-a="tab" data-v="'+k+'">'+ic(i, 23, V.tab === k ? 2.2 : 1.8)+l+'</button>'; }
  return '<nav class="tabs">'+t("home", "Home", "home")+t("activity", "Activity", "chart")
    + '<button class="fab" data-a="pay" aria-label="Pay for parking">'+ic("pay", 28, 2.2)+'</button>'
    + t("plates", "Plates", "car")+t("profile", "Profile", "user")+'</nav>';
}
function topbar(title, left){
  var u = me(), n = unread(u);
  return '<div class="top">'+(left || '<button class="cb" data-a="tab" data-v="profile" aria-label="Profile"><span class="av">'+esc(UI.initials(u.name))+'</span></button>')
    + '<h1>'+title+'</h1><button class="cb" data-a="sheet" data-v="inbox" aria-label="Messages">'+ic("bell", 22, 2)+(n ? '<span class="bd">'+(n > 9 ? "9+" : n)+'</span>' : "")+'</button></div>'
    + (PN.online ? "" : '<span class="offl">'+ic("wifi", 14, 2.2)+'Reconnecting…</span>');
}

/* ---------- home ---------- */
function homeView(){
  var u = me(), p = focusPlate(u);
  var sel = p ? '<button class="sel" data-a="sheet" data-v="plates"><span class="ch">'+ic("car", 13, 2.4)+'</span><span class="pl">'+plateTxt(p)+'</span>'+ic("chevD", 16, 2.2)+'</button>'
              : '<button class="sel" data-a="sheet" data-v="addplate"><span class="ch">'+ic("plus", 13, 2.8)+'</span>Add your plate</button>';
  var acts = '<div class="acts">'
    + act("pay", "Pay", "up", true) + act("monthly", "Monthly", "cal") + act("addplate", "Add plate", "plus") + act("receipts", "Receipts", "receipt") + '</div>';
  return '<div class="scr">'+topbar("ParkNa")+sel+hero(u, p)+acts+announcements()+recent(u)+'</div>';
}
function act(a, label, icon, pri){ return '<button class="'+(pri ? "pri" : "")+'" data-a="'+a+'"><span class="ico">'+ic(icon, 22, 2.1)+'</span>'+label+'</button>'; }
function hero(u, p){
  var first = esc(u.name.split(" ")[0]);
  function h(lb, big, chip){ return '<div class="hero"><span class="lb">'+lb+'</span><span class="big">'+big+'</span>'+(chip || "")+'</div>'; }
  if(!p) return h(UI.greet(B.min)+", "+first, "Add your car", '<button class="chip lime" data-a="sheet" data-v="addplate">'+ic("plus", 15, 2.4)+'Takes ten seconds'+ic("chevR", 14, 2.4)+'</button>');
  var st = state(p), r = PLATES[p] || {};
  if(st === "DAILY"){
    var left = Math.max(0, 19*60 - B.min);
    return h("Paid today · valid until 7:00 pm", Math.floor(left/60)+'<small>h</small> '+pad(left%60)+'<small>m</small>', '<span class="chip ok">'+ic("check", 15, 2.6)+'Ticket '+r.daily.ticket+'</span>');
  }
  if(st === "MONTHLY"){
    var dl = daysBetween(B.date, r.monthly.to);
    return h("Monthly pass", dl+'<small>'+(dl === 1 ? " day" : " days")+'</small>',
      dl <= 3 ? '<button class="chip bad" data-a="renew" data-v="'+p+'">'+ic("clock", 15, 2.4)+'Ends '+fmtD(r.monthly.to)+' · renew now'+ic("chevR", 14, 2.4)+'</button>'
              : '<span class="chip lime">'+ic("cal", 15, 2.3)+'Until '+fmtD(r.monthly.to)+'</span>');
  }
  if(st === "ORG"){ var o = orgOf(p); return h("Covered by "+esc(o.name), "Covered", '<span class="chip org">'+ic("shield", 15, 2.3)+'Organisation plate · until '+fmtD(orgCoverEnd(o))+'</span>'); }
  if(!paidHours()) return h(UI.greet(B.min)+", "+first, "Free now", '<span class="chip">'+ic("clock", 15, 2.3)+'Paid hours 7am–7pm, Mon–Sat</span>');
  return h("Parking today · "+plateTxt(p), "Not paid", '<button class="chip bad" data-a="pay">'+ic("pay", 15, 2.3)+gmd(T.daily)+' GMD · valid till 7 pm'+ic("chevR", 14, 2.4)+'</button>');
}
function announcements(){
  var list = typeof ANN !== "undefined" && ANN ? liveAnnouncements() : [];
  if(!list.length) return "";
  var on = Math.min(V.annI || 0, list.length - 1);
  return '<div class="sh"><h2>From the Council</h2><button data-a="sheet" data-v="news">View all'+ic("chevR", 16, 2.2)+'</button></div>'
    + '<div class="promos" data-scroll="ann">'+list.map(promo).join("")+'</div>'
    + (list.length > 1 ? '<div class="dots">'+list.map(function(_, k){ return '<i class="'+(k === on ? "on" : "")+'"></i>'; }).join("")+'</div>' : "");
}
function promo(x){
  return '<div class="promo t-'+esc(x.theme)+'"><div class="tx"><span class="k">'+esc(x.kind)+'</span><b>'+esc(x.title)+'</b>'
    + (x.text ? '<p>'+esc(x.text)+'</p>' : "") + (x.when ? '<span class="when">'+ic("cal", 14, 2.2)+esc(x.when)+'</span>' : "")
    + (x.link ? '<a class="go" href="'+esc(x.link)+'" target="_blank" rel="noopener">Learn more'+ic("arrow", 14, 2.4)+'</a>' : "")
    + '</div><span class="ill">'+(UI.ILL[x.kind] || UI.ILL.Announcement)+'</span></div>';
}

/* activity: payments and attendant checks on my plates, newest first */
function feed(u){
  var ev = [];
  u.receipts.forEach(function(rc){ var a = rc.t.split(":"); ev.push({ d: fromKey(rc.day), t: (+a[0])*60 + (+a[1]), k: "pay", rc: rc }); });
  CHECKS.forEach(function(c){ if(u.plates.indexOf(c.plate) >= 0) ev.push({ d: fromKey(c.day), t: c.t, k: "check", c: c }); });
  ev.sort(function(a, b){ return (b.d - a.d) || (b.t - a.t); });
  return ev;
}
function evRow(e){
  if(e.k === "pay"){
    var rc = e.rc;
    return '<div class="row"><span class="av ic-pay">'+ic(rc.kind === "monthly" ? "cal" : "pay", 21, 2.1)+'</span><span class="t"><b>'+(rc.kind === "monthly" ? "Monthly pass" : "Daily pass")+' · '+plateTxt(rc.plate)+'</b><small>'+esc(rc.prov)+' · '+rc.t+'</small></span>'
      + '<span class="r"><b>−'+gmd(rc.amount)+'</b><small>GMD · '+rc.ticket+'</small></span></div>';
  }
  var c = e.c, un = c.st === "UNPAID";
  return '<div class="row"><span class="av '+(un ? "ic-bad" : "ic-ok")+'">'+ic("shield", 21, 2.1)+'</span><span class="t"><b>Checked on '+esc(ROADS[c.road].name)+'</b><small>'+plateTxt(c.plate)+' · '+hm(c.t)+'</small></span>'
    + '<span class="r"><span class="st '+(un ? "unpaid" : "paid")+'">'+(un ? "Not paid" : "Paid")+'</span></span></div>';
}
function grouped(list){
  var out = "", last = null;
  list.forEach(function(e){ var k = e.d.getTime(); if(k !== last){ out += '<div class="day">'+dayLabel(e.d)+'</div>'; last = k; } out += evRow(e); });
  return out;
}
function recent(u){
  var list = feed(u).slice(0, 6);
  return '<div class="sh"><h2>Recent activity</h2><button data-a="tab" data-v="activity">View all'+ic("chevR", 16, 2.2)+'</button></div>'
    + '<div class="card tight">'+(list.length ? '<div class="rows">'+grouped(list)+'</div>' : '<div class="empty">Payments and attendant checks on your plates will show here.</div>')+'</div>';
}

/* ---------- activity (statistics) ---------- */
function activityView(){
  var u = me();
  var h = '<div class="scr">'+topbar("Activity", '<button class="cb" data-a="tab" data-v="home" aria-label="Back">'+ic("back", 22, 2.2)+'</button>')
    + '<div class="seg"><button class="'+(V.act === "pay" ? "on" : "")+'" data-a="actseg" data-v="pay">Payments</button><button class="'+(V.act === "check" ? "on" : "")+'" data-a="actseg" data-v="check">Checks</button></div>';
  if(V.act === "check"){
    var cs = feed(u).filter(function(e){ return e.k === "check"; }), unp = cs.filter(function(e){ return e.c.st === "UNPAID"; }).length;
    h += '<div class="two"><div class="stat"><small>Checks</small><b>'+cs.length+'</b></div><div class="stat"><small>Not paid'+(unp ? '<i class="down">'+Math.round(unp*100/Math.max(1, cs.length))+'%</i>' : "")+'</small><b>'+unp+'</b></div></div>'
      + '<div class="note">'+ic("info", 18, 2)+'<span>Attendants check plates in ParkNa bays during paid hours. There are no fines in the pilot: an unpaid check means a Park &amp; Pay card was left.</span></div>'
      + '<div class="card tight">'+(cs.length ? '<div class="rows">'+grouped(cs)+'</div>' : '<div class="empty">No checks on your plates yet.</div>')+'</div>';
    return h + '</div>';
  }
  var ch = chart(u), pays = feed(u).filter(function(e){ return e.k === "pay"; });
  h += '<div class="card"><div style="display:flex;justify-content:space-between;align-items:flex-start"><div><div style="font-size:14.5px;color:var(--ink2)">'+ch.label+'</div>'
    + '<div class="num" style="font-size:36px;font-weight:800;letter-spacing:-.03em;margin-top:4px">'+gmd(ch.total)+' <span style="font-size:18px;color:var(--ink2);font-weight:700">GMD</span></div></div>'
    + '<span class="cb flat" style="background:var(--fill)">'+ic("up", 22, 2.2)+'</span></div>'
    + '<div class="rng" style="margin-top:16px">'+["D","W","M","Y"].map(function(k){ return '<button class="'+(V.range === k ? "on" : "")+'" data-a="range" data-v="'+k+'">'+k+'</button>'; }).join("")+'</div>'
    + ch.html + '</div>'
    + '<div class="tip"><span class="ti">'+ic("cal", 24, 2)+'</span><span><b>Save 15% with a monthly pass</b><small>'+gmd(T.monthly)+' GMD for 30 days, any ParkNa bay.</small></span><button class="go" data-a="monthly">Get pass</button></div>'
    + '<div class="two"><div class="stat"><small>Daily passes</small><b>'+ch.daily+'</b></div><div class="stat"><small>Monthly passes</small><b>'+ch.monthly+'</b></div></div>'
    + '<div class="sh"><h2>Receipts</h2><span></span></div>'
    + '<div class="card tight">'+(pays.length ? '<div class="rows">'+grouped(pays)+'</div>' : '<div class="empty">No payments yet. Every receipt also arrives by SMS.</div>')+'</div>';
  return h + '</div>';
}
/* spending chart: D = last 7 days, W = last 6 weeks, M = last 6 months, Y = this year by month */
function chart(u){
  var today = new Date(B.date.getFullYear(), B.date.getMonth(), B.date.getDate()), buckets = [], i;
  if(V.range === "D") for(i = 6; i >= 0; i--){ var d = addDays(today, -i); buckets.push({ s: d, e: addDays(d, 1), l: DOW[d.getDay()].slice(0, 2) }); }
  else if(V.range === "W") for(i = 5; i >= 0; i--){ var ws = addDays(today, -today.getDay() - 7*i); buckets.push({ s: ws, e: addDays(ws, 7), l: fmtD(ws).split(" ")[0] + " " + fmtD(ws).split(" ")[1].slice(0, 1) }); }
  else if(V.range === "M") for(i = 5; i >= 0; i--){ var ms = new Date(today.getFullYear(), today.getMonth() - i, 1); buckets.push({ s: ms, e: new Date(ms.getFullYear(), ms.getMonth() + 1, 1), l: MON[ms.getMonth()] }); }
  else for(i = 0; i < 12; i++){ var ys = new Date(today.getFullYear(), i, 1); buckets.push({ s: ys, e: new Date(today.getFullYear(), i + 1, 1), l: MON[i].slice(0, 1) }); }
  var total = 0, daily = 0, monthly = 0;
  buckets.forEach(function(b){ b.v = 0; });
  u.receipts.forEach(function(rc){
    var d = fromKey(rc.day);
    buckets.forEach(function(b){ if(d >= b.s && d < b.e){ b.v += rc.amount; total += rc.amount; if(rc.kind === "monthly") monthly++; else daily++; } });
  });
  var max = Math.max.apply(null, buckets.map(function(b){ return b.v; }).concat([1])), top = niceTop(max), cur = buckets.findIndex(function(b){ return today >= b.s && today < b.e; });
  var html = '<div class="chart"><div class="ya">'+[top, top*2/3, top/3, 0].map(function(v){ return '<span>'+kfmt(v)+'</span>'; }).join("")+'</div>'
    + '<div class="pl">'+buckets.map(function(b, k){ var hgt = Math.max(4, b.v / top * 100); return '<span class="bar'+(k === cur ? " on" : "")+'" style="height:'+hgt.toFixed(1)+'%">'+(k === cur && b.v ? '<em>'+gmd(b.v)+'</em>' : "")+'</span>'; }).join("")+'</div>'
    + '<div class="xa">'+buckets.map(function(b){ return '<span>'+b.l+'</span>'; }).join("")+'</div></div>';
  var label = { D: "Spent in the last 7 days", W: "Spent in the last 6 weeks", M: "Spent in the last 6 months", Y: "Spent in " + today.getFullYear() }[V.range];
  return { html: html, total: total, daily: daily, monthly: monthly, label: label };
}
function niceTop(v){ var steps = [600, 1500, 3000, 6000, 15000, 30000, 60000, 150000]; for(var i = 0; i < steps.length; i++) if(v <= steps[i]) return steps[i]; return Math.ceil(v / 100000) * 100000; }
function kfmt(v){ return v >= 1000 ? (Math.round(v / 100) / 10) + "k" : String(Math.round(v)); }

/* ---------- plates ---------- */
function platesView(){
  var u = me();
  var cards = u.plates.map(function(p){
    var st = state(p), r = PLATES[p] || {}, chip, sub, btn = "";
    if(st === "DAILY"){ chip = '<span class="st paid">Paid today</span>'; sub = "Until 7:00 pm · ticket " + r.daily.ticket; }
    else if(st === "MONTHLY"){ var dl = daysBetween(B.date, r.monthly.to); chip = '<span class="st '+(dl <= 3 ? "due" : "month")+'">Monthly</span>'; sub = "Until " + fmtD(r.monthly.to) + (dl <= 3 ? " · renew now" : ""); if(dl <= 3) btn = '<button class="go" data-a="renew" data-v="'+p+'">Renew</button>'; }
    else if(st === "ORG"){ var o = orgOf(p); chip = '<span class="st org">Organisation</span>'; sub = "Covered by " + esc(o.name); }
    else if(paidHours()){ chip = '<span class="st unpaid">Not paid</span>'; sub = gmd(T.daily) + " GMD for today, valid till 7 pm"; btn = '<button class="go" data-a="payplate" data-v="'+p+'">Pay</button>'; }
    else { chip = '<span class="st free">Free now</span>'; sub = "Paid hours 7am–7pm, Mon–Sat"; }
    return '<div class="card" style="display:flex;flex-direction:column;gap:12px"><div style="display:flex;justify-content:space-between;align-items:center"><span class="plate">'+plateTxt(p)+'</span>'+chip+'</div>'
      + '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><small style="color:var(--mute);font-size:13.5px">'+sub+'</small>'
      + '<span style="display:flex;gap:8px;align-items:center">'+btn.replace('class="go"', 'class="btn" style="height:40px;width:auto;padding:0 16px;font-size:14px"')
      + '<button class="cb flat" style="width:40px;height:40px;background:var(--fill)" data-a="rmplate" data-v="'+p+'" aria-label="Remove '+p+'">'+ic("trash", 18, 2)+'</button></span></div></div>';
  }).join("");
  return '<div class="scr">'+topbar("My plates", '<button class="cb" data-a="sheet" data-v="addplate" aria-label="Add a plate">'+ic("plus", 22, 2.4)+'</button>')
    + (cards || '<div class="card"><div class="empty">No plates yet. Add your car to see if it is paid and to pay in one tap.</div></div>')
    + '<button class="btn ghost" data-a="sheet" data-v="addplate">'+ic("plus", 20, 2.4)+'Add a plate</button>'
    + '<div class="note">'+ic("info", 18, 2)+'<span>The pass follows the plate, not the payer. You can pay for any plate: a friend’s, a relative’s or a work car.</span></div></div>';
}

/* ---------- profile ---------- */
function profileView(){
  var u = me(), n = unread(u);
  function item(a, v, icon, title, sub, cls){ return '<button data-a="'+a+'"'+(v ? ' data-v="'+v+'"' : "")+'><span class="mi">'+ic(icon, 20, 2)+'</span><span class="'+(cls || "")+'">'+title+(sub ? '<small>'+sub+'</small>' : "")+'</span>'+ic("chevR", 18, 2)+'</button>'; }
  var privacy = PN.server + "/privacy.html";
  return '<div class="scr">'+topbar("Profile", '<button class="cb" data-a="tab" data-v="home" aria-label="Back">'+ic("back", 22, 2.2)+'</button>')
    + '<div class="prof"><span class="av">'+esc(UI.initials(u.name))+'</span><b>'+esc(u.name)+'</b><small>'+UI.phone(u.num)+' · '+u.plates.length+' plate'+(u.plates.length === 1 ? "" : "s")+'</small></div>'
    + '<div class="card tight"><div class="menu">'
    + item("sheet", "inbox", "sms", "Messages from ParkNa", n ? n + " new" : "Receipts, reminders and news")
    + item("sheet", "news", "mega", "Council announcements", "Events and notices from Banjul City Council")
    + item("sheet", "help", "help", "How ParkNa works", "Paid hours, prices, passes")
    + '<a href="'+esc(privacy)+'" target="_blank" rel="noopener"><span class="mi">'+ic("lock", 20, 2)+'</span><span>Privacy<small>How ParkNa uses your number and data</small></span>'+ic("chevR", 18, 2)+'</a>'
    + '</div></div>'
    + '<div class="card tight"><div class="menu">'+item("signout", null, "out", "Sign out", "", "red")+'</div></div>'
    + '<div class="foot"><img src="assets/img/innovii-navy.png" alt="INNOVII">ParkNa v'+VERSION+' · Banjul City Council'+(PN.mode && PN.mode.demo ? " · demo" : "")+'</div></div>';
}

/* ---------- sheets ---------- */
function sheetView(){
  var body = ({ pay: paySheet, plates: platesSheet, addplate: addSheet, inbox: inboxSheet, news: newsSheet, help: helpSheet })[V.sheet]();
  return '<div class="ov" data-a="close"><div class="sheet" data-keep="1"><span class="hd"></span>'+body+'</div></div>';
}
function head(t){ return '<div class="sht"><h3>'+t+'</h3><button class="x" data-a="close" aria-label="Close">'+ic("x", 18, 2.4)+'</button></div>'; }
function paySheet(){
  var u = me(), S = V.pay, prov = provOf(u), on = payOn(), st = S.status;
  var plateOk = !!normPlate(S.plate), amount = S.kind === "monthly" ? T.monthly : T.daily, blocked = false, note = "";
  if(st && st.plate === normPlate(S.plate)){
    if(st.err) { note = '<div class="err">'+esc(st.err)+'</div>'; blocked = true; }
    else if(st.st === "ORG"){ note = '<div class="note">'+ic("shield", 18, 2)+'<span>'+plateTxt(st.plate)+' is covered by <b>'+esc(st.org)+'</b>. Nothing to pay.</span></div>'; blocked = true; }
    else if(st.st === "DAILY" && S.kind === "daily"){ note = '<div class="note lime">'+ic("check", 18, 2.4)+'<span>'+plateTxt(st.plate)+' is already paid until 7:00 pm today.</span></div>'; blocked = true; }
    else if(st.st === "MONTHLY"){ var dl = daysBetween(B.date, st.to); note = '<div class="note lime">'+ic("check", 18, 2.4)+'<span>'+plateTxt(st.plate)+' has a monthly pass to <b>'+fmtD(st.to)+'</b>.'+(S.kind === "monthly" && dl <= 3 ? " You can renew it now, with no gap." : " Nothing to pay.")+'</span></div>'; blocked = !(S.kind === "monthly" && dl <= 3); }
    else if(S.kind === "daily" && !st.paidHours){ note = '<div class="note">'+ic("clock", 18, 2)+'<span>Parking is free now. Paid hours are 7am to 7pm, Monday to Saturday.</span></div>'; blocked = true; }
  }
  return head(S.kind === "monthly" ? "Monthly pass" : "Pay for parking")
    + '<label class="fld">Plate number<input class="inp pl" id="payPlate" autocapitalize="characters" autocomplete="off" placeholder="BJL 1234" value="'+esc(S.plate)+'"></label>'
    + (u.plates.length ? '<div class="demo" style="margin-top:-6px">'+u.plates.map(function(p){ return '<button data-a="payfill" data-v="'+p+'" style="font-family:PlateMono,monospace;letter-spacing:.06em">'+plateTxt(p)+'</button>'; }).join("")+'</div>' : "")
    + '<div class="seg"><button class="'+(S.kind === "daily" ? "on" : "")+'" data-a="kind" data-v="daily">Daily · '+gmd(T.daily)+'</button><button class="'+(S.kind === "monthly" ? "on" : "")+'" data-a="kind" data-v="monthly">Monthly · '+gmd(T.monthly)+'</button></div>'
    + note
    + '<div class="fld">Pay with<div class="provs">'+PROVIDERS.map(function(n){ return '<button class="prov'+(on && n === prov ? " on" : "")+'" data-a="prov" data-v="'+n+'"'+(on ? "" : " disabled")+'><span class="lg">'+logo(n)+'</span>'+n+(on ? "" : '<span class="soon">Soon</span>')+'</button>'; }).join("")+'</div></div>'
    + (on ? "" : '<div class="note lime">'+ic("info", 18, 2)+'<span>Paying by mobile money opens soon. We will send you an SMS when you can pay in the app.</span></div>')
    + (S.err ? '<div class="err">'+esc(S.err)+'</div>' : "")
    + '<button class="btn'+(on ? "" : " dark")+'" data-a="dopay"'+(!on || S.busy || !plateOk || blocked ? " disabled" : "")+'>'
    + (!on ? "Payments open soon" : S.busy ? "Paying…" : "Pay "+gmd(amount)+" GMD with "+prov)+'</button>'
    + (S.kind === "daily" ? '<p style="font-size:12.5px;color:var(--mute);text-align:center">Valid until 7:00 pm today in any marked ParkNa bay.</p>' : '<p style="font-size:12.5px;color:var(--mute);text-align:center">30 days in any marked ParkNa bay. We remind you 3 days before it ends.</p>');
}
function platesSheet(){
  var u = me(), p = focusPlate(u);
  return head("Your plates") + '<div class="rows">'+u.plates.map(function(x){ var st = state(x);
      return '<button class="row" data-a="focus" data-v="'+x+'"><span class="av '+(x === p ? "ic-pay" : "ic-soft")+'">'+ic("car", 21, 2)+'</span><span class="t"><b style="font-family:PlateMono,monospace;letter-spacing:.06em">'+plateTxt(x)+'</b><small>'+({ DAILY: "Paid today", MONTHLY: "Monthly pass", ORG: "Organisation", UNPAID: paidHours() ? "Not paid today" : "Free now" })[st]+'</small></span><span class="r">'+(x === p ? ic("check", 20, 2.6) : "")+'</span></button>'; }).join("")+'</div>'
    + '<button class="btn ghost" data-a="sheet" data-v="addplate">'+ic("plus", 20, 2.4)+'Add a plate</button>';
}
function addSheet(){
  var A = V.add;
  return head("Add a plate") + '<label class="fld">Plate number<input class="inp pl" id="addPlate" autocapitalize="characters" autocomplete="off" placeholder="BJL 1234" value="'+esc(A.plate)+'"></label>'
    + (A.err ? '<div class="err">'+esc(A.err)+'</div>' : "")
    + '<button class="btn" data-a="doadd"'+(A.busy ? " disabled" : "")+'>'+ic("plus", 20, 2.4)+'Add plate</button>'
    + '<div class="note">'+ic("info", 18, 2)+'<span>Add every car you drive or pay for. Its status shows on your home screen.</span></div>';
}
function inboxSheet(){
  var u = me(), list = inbox(u).slice().reverse();
  PN.ls(seenKey(), String(inbox(u).length));
  return head("Messages") + (list.length ? '<div class="rows">'+list.slice(0, 60).map(function(m){
      return '<div class="row" style="align-items:flex-start"><span class="av ic-ink">'+ic(m.tag === "Receipt" ? "receipt" : m.tag === "Reminder" ? "clock" : "sms", 20, 2)+'</span><span class="t"><b style="white-space:normal;font-size:14.5px;font-weight:500;line-height:1.45">'+esc(m.i)+'</b><small>'+(m.tag ? esc(m.tag)+" · " : "")+m.t+'</small></span><span></span></div>'; }).join("")+'</div>'
    : '<div class="empty">No messages yet. Receipts and reminders arrive here and by SMS.</div>');
}
function newsSheet(){
  var list = typeof ANN !== "undefined" && ANN ? liveAnnouncements() : [];
  return head("From the Council") + (list.length ? list.map(function(x){ return promo(x).replace('class="promo', 'style="flex-basis:auto" class="promo'); }).join("") : '<div class="empty">No announcements right now.</div>');
}
function helpSheet(){
  return head("How ParkNa works") + '<div class="rows">'
    + [["clock", "Paid hours", "7am to 7pm, Monday to Saturday. Sundays and evenings are free."],
       ["pay", "Daily pass", gmd(T.daily) + " GMD, valid until 7pm the same day in any marked ParkNa bay."],
       ["cal", "Monthly pass", gmd(T.monthly) + " GMD for 30 days (26 paid days less 15%). Renew up to 3 days before it ends, with no gap."],
       ["car", "The pass follows the plate", "Pay for your own car or anyone else’s. Attendants check the plate, not the phone."],
       ["shield", "Attendants", "Attendants never take cash. If a car is not paid they leave a Park & Pay card; there are no fines in the pilot."],
       ["sms", "No data?", "Text your plate to " + ((PN.mode && PN.mode.shortcode) || SC) + " to check it, the same pass and price."]]
      .concat(PN.mode && (PN.mode.supportPhone || PN.mode.supportEmail) ? [["help", "Need help?", "ParkNa support: " + [PN.mode.supportPhone, PN.mode.supportEmail].filter(Boolean).join(" · ")]] : []).map(function(r){
        return '<div class="row" style="align-items:flex-start"><span class="av ic-soft">'+ic(r[0], 20, 2)+'</span><span class="t"><b>'+r[1]+'</b><small style="line-height:1.5">'+esc(r[2])+'</small></span><span></span></div>'; }).join("")+'</div>';
}
function doneView(){
  var D = V.done;
  return '<div class="done"><span class="ring">'+ic("check", 52, 3)+'</span><h2>Paid</h2><p><b>'+plateTxt(D.plate)+'</b> is covered '+(D.kind === "monthly" ? "until " + fmtD(D.to) : "until 7:00 pm today")+'. A receipt is on its way by SMS.</p>'
    + '<div class="tk"><span>Ticket <b>'+D.ticket+'</b></span><span>'+esc(D.prov)+' · <b>'+gmd(D.amount)+' GMD</b></span></div><button class="btn" data-a="donex">Done</button></div>';
}

/* ---------- actions ---------- */
function toast(t){ V.toast = t; render(); clearTimeout(toast.t); toast.t = setTimeout(function(){ V.toast = null; render(); }, 2600); }
function nav(){ try { history.pushState({ pn: 1 }, ""); } catch(e){} }
window.addEventListener("popstate", function(){
  if(V.done){ V.done = null; return render(); }
  if(V.sheet){ V.sheet = null; return render(); }
  if(V.tab !== "home"){ V.tab = "home"; return render(); }
});
function openSheet(k){ V.sheet = k; if(k === "addplate") V.add = { plate: "", err: "", busy: false }; nav(); render(); setTimeout(function(){ var i = document.getElementById(k === "addplate" ? "addPlate" : k === "pay" && !V.pay.plate ? "payPlate" : ""); if(i) i.focus(); }, 80); }
function openPay(plate, kind){ V.pay = { plate: plate || "", kind: kind || "daily", prov: null, status: null, busy: false, err: "" }; if(plate) status(); openSheet("pay"); }
function status(){
  var p = normPlate(V.pay.plate); clearTimeout(status.t);
  if(!p){ V.pay.status = null; return; }
  status.t = setTimeout(function(){ PN.act({ type: "driver.status", plate: p }).then(function(r){ if(normPlate(V.pay.plate) === p){ V.pay.status = r.ok ? r : { plate: p, err: r.err }; render(); } }); }, 250);
}
function addPlate(){
  var A = V.add, p = normPlate(A.plate);
  if(!p){ A.err = "Enter a plate like BJL 1234"; return render(); }
  A.busy = true; render();
  PN.act({ type: "driver.addPlate", plate: p }).then(function(r){
    A.busy = false;
    if(r.err){ A.err = r.err; return render(); }
    V.sheet = null; V.focus = p; toast(plateTxt(p) + " added");
  });
}
function doPay(){
  var S = V.pay, u = me(); S.busy = true; S.err = ""; render();
  PN.act({ type: "driver.pay", plate: S.plate, kind: S.kind, prov: provOf(u) }).then(function(r){
    S.busy = false;
    if(r.ok){ V.sheet = null; V.done = r; V.focus = r.plate; }
    else S.err = r.err || "Payment failed. Nothing was charged.";
    render();
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
    case "sheet": return openSheet(v);
    case "close": V.sheet = null; return render();
    case "pay": return openPay(focusPlate(me()) && state(focusPlate(me())) === "UNPAID" ? focusPlate(me()) : "", "daily");
    case "monthly": return openPay(focusPlate(me()) || "", "monthly");
    case "renew": return openPay(v, "monthly");
    case "payplate": return openPay(v, "daily");
    case "payfill": V.pay.plate = v; V.pay.status = null; status(); return render();
    case "kind": V.pay.kind = v; return render();
    case "prov": V.pay.prov = v; return render();
    case "dopay": return doPay();
    case "addplate": return openSheet("addplate");
    case "doadd": return addPlate();
    case "receipts": V.tab = "activity"; V.act = "pay"; nav(); return render();
    case "focus": V.focus = v; V.sheet = null; PN.act({ type: "driver.focus", plate: v }); return render();
    case "rmplate": if(!confirm("Remove " + plateTxt(v) + " from your plates?")) return; PN.act({ type: "driver.removePlate", plate: v }); return toast(plateTxt(v) + " removed");
    case "actseg": V.act = v; return render();
    case "range": V.range = v; return render();
    case "donex": V.done = null; V.tab = "home"; return render();
    case "signout": if(!confirm("Sign out of ParkNa on this phone?")) return; return PN.logout();
    case "connect": {
      var S = V.setup; S.url = (document.getElementById("srv") || {}).value || S.url; S.busy = true; S.err = ""; render();
      PN.ping(S.url).then(function(info){ S.busy = false; if(!info){ S.err = "No ParkNa server at that address. Check it and your internet connection."; return render(); } PN.setServer(info.url); boot(); });
      return;
    }
  }
});
APP.addEventListener("input", function(e){
  var t = e.target;
  if(SI.input(t)) return;
  if(t.id === "payPlate"){ V.pay.plate = t.value.toUpperCase(); V.pay.err = ""; status(); render(); }
  else if(t.id === "addPlate"){ V.add.plate = t.value.toUpperCase(); V.add.err = ""; }
  else if(t.id === "srv") V.setup.url = t.value;
});
APP.addEventListener("keydown", function(e){
  if(e.key !== "Enter") return;
  var t = e.target;
  if(SI.enter(t)) return;
  if(t.id === "addPlate") addPlate();
  if(t.id === "srv") APP.querySelector('[data-a="connect"]').click();
});
APP.addEventListener("scroll", function(e){
  var el = e.target;
  if(!el.classList || !el.classList.contains("promos")) return;
  V.annX = el.scrollLeft;
  var i = Math.round(el.scrollLeft / (el.firstChild ? el.firstChild.offsetWidth + 12 : 1));
  if(i !== V.annI){ V.annI = i; var d = APP.querySelectorAll(".dots i"); for(var k = 0; k < d.length; k++) d[k].className = k === i ? "on" : ""; }
}, true);

/* ---------- start ---------- */
PN.onSignOut = function(expired){ SI.reset(); V.tab = "home"; V.sheet = null; V.done = null; render(); if(expired) setTimeout(function(){ alert("You were signed out. Sign in again with your number."); }, 50); };
function start(){
  V.slow = false; render();
  clearTimeout(start.t); start.t = setTimeout(function(){ if(!PN.ready){ V.slow = true; render(); } }, 8000);
  PN.connect(function(){ render(); }, function(){ render(); });
}
function boot(){
  if(!PN.server) return render();
  PN.ping().then(function(){ if(PN.signedIn()) start(); else render(); });
  render();
}
boot();
})();
