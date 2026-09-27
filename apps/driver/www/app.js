/* ParkNa driver app v0.1  (Banjul City Council design v1.3)
   Thin client: all state lives on the demo server; this app renders it and sends actions. */
(function(){
var APP = document.getElementById("app");
var VERSION = "0.2";
var LOGO = { Wave: "wave", Afrimoney: "afrimoney", APS: "aps", QMoney: "qmoney" };
var V = { view: "home", ov: null, pin: null, done: null, focus: null, prov: null, toast: null, dragging: false, pending: false,
  sheet: { plate: "", kind: "daily", prov: null }, add: { plate: "", err: "" },
  login: { num: "", name: "", need: false, err: "", busy: false }, setup: { url: PN.server || "", err: "", busy: false }, slow: false };
var ME = PN.ls("parkna.driver");

/* ---------- icons ---------- */
var IP = {
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15Z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', cal: '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z"/><path d="M9 8h6M9 12h6"/>', car: '<path d="M5 16v-4l2-5h10l2 5v4M5 16h14M6 16v2.5M18 16v2.5"/><circle cx="8.5" cy="13" r=".9"/><circle cx="15.5" cy="13" r=".9"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20c1.2-3.6 3.8-5.5 7-5.5s5.8 1.9 7 5.5"/>', arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>', chev: '<path d="m10 6 6 6-6 6"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>', x: '<path d="M6 6l12 12M18 6 6 18"/>', del: '<path d="M9 6h11v12H9l-6-6Z"/><path d="m12 10 4 4M16 10l-4 4"/>',
  shield: '<path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6Z"/><path d="m9 12 2 2 4-4"/>', sms: '<path d="M4 5h16v11H9l-5 4Z"/><path d="M8 10h8"/>',
  mega: '<path d="M4 10v4h3l8 4.5v-13L7 10Z"/><path d="M18 9.5a3.5 3.5 0 0 1 0 5"/>', info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8v.1"/>',
  wifi: '<path d="M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0"/><path d="M12 19.5v.1"/>',
};
function ic(n, s, w){ return '<svg width="'+(s||20)+'" height="'+(s||20)+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="'+(w||1.9)+'" stroke-linecap="round" stroke-linejoin="round">'+IP[n]+'</svg>'; }
var WAVES = '<svg viewBox="0 0 390 120" height="120" preserveAspectRatio="none" fill="none" stroke="#fff" stroke-width="1.4">'+[[40,.07],[62,.1],[84,.07],[106,.05]].map(function(a){ var y = a[0]; return '<path opacity="'+a[1]+'" d="M0 '+y+' C 60 '+(y-14)+', 120 '+(y+14)+', 195 '+y+' S 330 '+(y-14)+', 390 '+y+'"/>'; }).join("")+'</svg>';
var WV_T = '<svg class="wv" width="170" height="120" viewBox="0 0 170 120" fill="none" stroke="#fff" stroke-width="2">'+[30,52,74,96].map(function(y){ return '<path d="M0 '+y+' C 30 '+(y-10)+', 60 '+(y+10)+', 85 '+y+' S 140 '+(y-10)+', 170 '+y+'"/>'; }).join("")+'</svg>';
function pv(name, s, on){ return '<span class="pv'+(on ? " on" : "")+'" style="--s:'+s+'px"><span class="lg"><img src="assets/img/logos/'+LOGO[name]+'.png" alt="'+name+' logo"></span>'+(on ? '<span class="ck">'+ic("check", 12, 3.2)+'</span>' : "")+'</span>'; }
function slide(key, label, dis){ return '<div class="slide'+(dis ? " dis" : "")+'" data-slide="'+key+'"><span class="sh"></span><span class="k">'+ic("arrow", 22, 2.6)+'</span><span class="lb">'+label+'</span><span class="ch">'+ic("chev", 16, 2.4)+ic("chev", 16, 2.4)+'</span></div>'; }
function part(){ return B.min < 720 ? "morning" : B.min < 1020 ? "afternoon" : "evening"; }
function me(){ return NUMS[ME]; }
function provOf(u){ return V.prov || (u && u.prov) || "Wave"; }

/* ---------- render ---------- */
function render(){
  if(V.dragging){ V.pending = true; return; }
  var h;
  if(!PN.server) h = setupScreen();
  else if(!PN.ready) h = loadingScreen();
  else if(!ME || !NUMS[ME]) h = loginScreen();
  else h = mainScreen();
  paint(h);
}
function paint(h){
  var a = document.activeElement, id = a && a.id, s = null, e = null;
  try { if(id){ s = a.selectionStart; e = a.selectionEnd; } } catch(x){}
  var sc = APP.querySelector(".scroll"), top = sc ? sc.scrollTop : 0, ovs = APP.querySelector(".sheet"), otop = ovs ? ovs.scrollTop : 0;
  APP.innerHTML = h;
  var sc2 = APP.querySelector(".scroll"); if(sc2) sc2.scrollTop = top;
  var an = APP.querySelector(".annrow"); if(an && V.annX) an.scrollLeft = V.annX;
  var ov2 = APP.querySelector(".sheet"); if(ov2) ov2.scrollTop = otop;
  if(id){ var n = document.getElementById(id); if(n){ n.focus(); try { if(s != null) n.setSelectionRange(s, e); } catch(x){} } }
  bindSlides();
}

function setupScreen(){
  var S = V.setup;
  return '<div class="auth"><span class="crest"><img src="assets/img/crest.png" alt="Banjul City Council crest"></span><span class="stripe"></span>'
   + '<h1>Connect to the <span>ParkNa server</span></h1><p>Enter the ParkNa server address your supervisor gave you, like <b>https://parkna.example.gm</b>.</p>'
   + '<label class="fld">Server address<input id="srv" value="'+esc(S.url)+'" placeholder="https://parkna.example.gm" autocomplete="off" autocapitalize="off" inputmode="url"></label>'
   + (S.err ? '<div class="err">'+esc(S.err)+'</div>' : "")
   + '<button class="btn" data-a="connect"'+(S.busy ? " disabled" : "")+'>'+(S.busy ? "Connecting…" : "Connect")+'</button>'
   + '<div class="pow"><img src="assets/img/innovii-white.png" alt="INNOVII">ParkNa driver app v'+VERSION+' · demo</div></div>';
}
function loadingScreen(){
  return '<div class="auth"><span class="crest"><img src="assets/img/crest.png" alt=""></span><span class="stripe"></span><h1>Connecting…</h1><p>'+esc(PN.server)+'</p>'
   + '<div class="spin" style="border-color:rgba(255,255,255,.15);border-top-color:#F9DD17"></div>'
   + (V.slow ? '<p>Can’t reach the ParkNa server yet. Check this phone’s internet connection and the server address.</p><button class="btn" data-a="chgsrv">Change server address</button>' : "")
   + '<div class="pow"><img src="assets/img/innovii-white.png" alt="INNOVII">ParkNa driver app v'+VERSION+'</div></div>';
}
function loginScreen(){
  var L = V.login;
  return '<div class="auth"><span class="crest"><img src="assets/img/crest.png" alt="Banjul City Council crest"></span><span class="stripe"></span>'
   + '<h1>Pay for parking<br><span>in Banjul</span></h1><p>Sign in with your mobile number. Your passes and receipts follow your number, in the app or by SMS to 7275.</p>'
   + '<label class="fld">Mobile number (+220)<input id="lgNum" value="'+esc(L.num)+'" placeholder="7012345" inputmode="numeric" autocomplete="off"></label>'
   + (L.need ? '<label class="fld">Your name<input id="lgName" value="'+esc(L.name)+'" placeholder="First name" autocomplete="off"></label>' : "")
   + (L.err ? '<div class="err">'+esc(L.err)+'</div>' : "")
   + '<button class="btn" data-a="login"'+(L.busy ? " disabled" : "")+'>Continue</button>'
   + '<div style="font-size:12px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#9CC3E6">Demo drivers</div>'
   + '<div class="pers">'+PERSONAS.map(function(p){ return '<button data-a="persona" data-v="'+p.num+'"><b>'+esc(p.name)+'</b><small>'+esc(p.note)+'</small></button>'; }).join("")+'</div>'
   + '<div class="pow"><img src="assets/img/innovii-white.png" alt="INNOVII">ParkNa driver app v'+VERSION+' · <a data-a="chgsrv" style="color:#9CC3E6">server</a></div></div>';
}

function header(){
  return '<div class="hdr"><span class="crest"><img src="assets/img/crest.png" alt="Banjul City Council crest"></span><span><small>Banjul City Council</small><b>ParkNa</b></span>'
   + (PN.online ? '<button class="glass" data-a="tab" data-v="receipts" aria-label="Receipts">'+ic("bell", 20)+(me().receipts.length ? "<i></i>" : "")+'</button>' : '<span class="off" style="margin-left:auto">'+ic("wifi", 14, 2.2)+'Reconnecting</span>')+'</div>';
}
function tabbar(){
  return '<div class="fade"></div><nav class="tab">'+[["home","Home","grid"],["plates","Plates","car"],["receipts","Receipts","receipt"],["account","Account","user"]].map(function(t){ return '<button class="'+(V.view === t[0] ? "on" : "")+'" data-a="tab" data-v="'+t[0]+'">'+ic(t[2], V.view === t[0] ? 20 : 21)+t[1]+'</button>'; }).join("")+'</nav>';
}
function mainScreen(){
  var h = V.view === "plates" ? platesView() : V.view === "receipts" ? receiptsView() : V.view === "account" ? accountView() : homeView();
  h += tabbar();
  if(V.ov === "pay") h += paySheet();
  if(V.pin) h += pinView();
  if(V.done) h += doneView();
  if(V.toast) h += '<div class="toast"><i>'+ic("check", 15, 3)+'</i><span>'+esc(V.toast)+'</span></div>';
  return h;
}

/* ---------- home ---------- */
function focusPlate(u){ return V.focus && u.plates.indexOf(V.focus) >= 0 ? V.focus : (u.last && u.plates.indexOf(u.last) >= 0 ? u.last : u.plates[0]); }
function homeView(){
  var u = me(), p = focusPlate(u);
  var sub = paidHours() ? DOW[B.date.getDay()]+" "+fmtD(B.date)+" · paid hours until 7 pm" : B.date.getDay() === 0 ? "Sunday "+fmtD(B.date)+" · parking is free all day" : DOW[B.date.getDay()]+" "+fmtD(B.date)+" · parking is free now";
  var h = '<div class="scroll"><div class="hz">'+WAVES+'</div><div class="ct">'+header()
    + '<div class="greet"><h2>Good '+part()+', '+esc(u.name.split(" ")[0])+'</h2><p><span class="d'+(paidHours() ? "" : " free")+'"></span>'+sub+'</p></div>';
  if(u.plates.length > 1) h += '<div class="chips">'+u.plates.map(function(x){ return '<button class="'+(x === p ? "on" : "")+'" data-a="focus" data-v="'+x+'">'+x+'</button>'; }).join("")+'</div>';
  h += passCard(u, p) + bento(u) + annBanner() + todayCard(u) + '</div></div>';
  return h;
}
/* Council events and announcements from the back office: the ones live today, swipe for more */
var ANN_ICON = { Event: "cal", Announcement: "mega", Notice: "info" };
function annBanner(){
  var list = typeof liveAnnouncements === "function" && typeof ANN !== "undefined" && ANN ? liveAnnouncements() : [];
  if(!list.length) return "";
  var on = Math.min(V.annI || 0, list.length - 1);
  return '<div class="ann"><div class="annrow" onscroll="annScroll(this)">'+list.map(function(x){
    return '<div class="annc '+esc(x.theme)+'"><span class="annk">'+ic(ANN_ICON[x.kind] || "mega", 13, 2.2)+esc(x.kind)+' · Banjul City Council</span><b>'+esc(x.title)+'</b>'
      + (x.text ? '<p>'+esc(x.text)+'</p>' : "")
      + (x.when || x.link ? '<div class="annf">'+(x.when ? '<span>'+ic("cal", 13, 2.2)+esc(x.when)+'</span>' : "<span></span>")+(x.link ? '<a href="'+esc(x.link)+'" target="_blank" rel="noopener">Learn more'+ic("arrow", 13, 2.4)+'</a>' : "")+'</div>' : "")
      + '</div>';
  }).join("")+'</div>'+(list.length > 1 ? '<div class="annd">'+list.map(function(_, k){ return '<i class="'+(k === on ? "on" : "")+'"></i>'; }).join("")+'</div>' : "")+'</div>';
}
function annScroll(el){
  var i = Math.round(el.scrollLeft / el.clientWidth);
  V.annX = el.scrollLeft;
  if(i === V.annI) return;
  V.annI = i;
  var d = el.parentNode.querySelectorAll(".annd i");
  for(var k = 0; k < d.length; k++) d[k].className = k === i ? "on" : "";
}
function passCard(u, p){
  if(!p){
    return '<div class="pass"><div class="pa"><span class="pill info"><i></i>Get started</span><div class="big2">Add your car</div><div class="psub">Enter your plate number. You can pay for it straight away.</div>'
      + '<label class="fld" style="margin-top:14px"><input id="addPlate" class="pl" value="'+esc(V.add.plate)+'" placeholder="BJL1234" autocomplete="off" autocapitalize="characters"></label>'
      + (V.add.err ? '<div class="err" style="margin-top:8px">'+esc(V.add.err)+'</div>' : "")
      + '<button class="btn" style="margin-top:12px" data-a="addplate" data-v="addPlate">'+ic("plus", 18, 2.4)+'Add plate</button></div></div>';
  }
  var st = state(p), r = PLATES[p] || {};
  if(st === "DAILY"){
    var left = Math.max(0, 19*60 - B.min), paidAt = r.daily.t ? r.daily.t.split(":") : ["7","0"], pm = (+paidAt[0])*60 + (+paidAt[1]);
    var nowp = Math.max(0, Math.min(100, (B.min - 420)/720*100)), paidp = Math.max(0, Math.min(100, (pm - 420)/720*100));
    return '<div class="pass"><div class="pa"><div class="row"><span class="plate">'+p+'</span><span class="pill live"><i></i>Active pass</span></div>'
      + '<div class="cd"><div class="n">'+Math.floor(left/60)+'<em>h</em>'+pad(left%60)+'<em>m</em></div><div class="r"><b>left today</b>until 7:00 pm</div></div>'
      + '<div class="tl"><span class="w" style="left:'+paidp.toFixed(1)+'%"></span><span class="rm" style="left:'+nowp.toFixed(1)+'%"></span><span class="now" style="left:'+nowp.toFixed(1)+'%"></span></div>'
      + '<div class="tll"><span>7 am</span><span><b>Now '+hm(B.min)+'</b></span><span>7 pm</span></div></div>'
      + '<div class="perf"></div><div class="pb"><span>Ticket <b>'+r.daily.ticket+'</b></span><span style="display:flex;align-items:center;gap:8px">'+(r.daily.prov ? pv(r.daily.prov, 24)+'<b>'+r.daily.prov+'</b> · ' : "")+gmd(T.daily)+' GMD</span></div></div>';
  }
  if(st === "MONTHLY"){
    var dl = daysBetween(B.date, r.monthly.to), frac = Math.max(0, Math.min(100, (30 - dl)/30*100));
    return '<div class="pass"><div class="pa"><div class="row"><span class="plate">'+p+'</span><span class="pill '+(dl <= 3 ? "due" : "live")+'"><i></i>Monthly pass</span></div>'
      + '<div class="cd"><div class="n">'+dl+'<em>'+(dl === 1 ? "day" : "days")+'</em></div><div class="r"><b>left on your pass</b>until '+fmtD(r.monthly.to)+'</div></div>'
      + '<div class="tl"><span class="rm" style="left:'+frac.toFixed(1)+'%"></span><span class="now" style="left:'+frac.toFixed(1)+'%"></span></div>'
      + (dl <= 3 ? '<button class="btn" style="margin-top:16px" data-a="renew" data-v="'+p+'">Renew · '+gmd(T.monthly)+' GMD, no gap</button>' : '<div class="tll"><span>Paid hours 7 am–7 pm, Mon–Sat</span><span>Any ParkNa bay</span></div>')+'</div>'
      + '<div class="perf"></div><div class="pb"><span>Ticket <b>'+r.monthly.ticket+'</b></span><span>Reminder 3 days before it ends</span></div></div>';
  }
  if(st === "ORG"){
    var o = orgOf(p);
    return '<div class="pass"><div class="pa"><div class="row"><span class="plate">'+p+'</span><span class="pill org"><i></i>Organisation</span></div><div class="big2">Nothing to pay</div>'
      + '<div class="psub">Covered by '+esc(o.name)+' fleet ('+o.id+') until '+fmtD(orgCoverEnd(o))+'. Park in any marked ParkNa bay.</div></div></div>';
  }
  if(!paidHours()){
    return '<div class="pass"><div class="pa"><div class="row"><span class="plate">'+p+'</span><span class="pill info"><i></i>Free now</span></div><div class="big2">Parking is free</div>'
      + '<div class="psub">Paid hours are 7 am to 7 pm, Monday to Saturday. Nothing to pay right now.</div></div></div>';
  }
  var prov = provOf(u);
  return '<div class="pass"><div class="pa"><div class="row"><span class="plate">'+p+'</span><span class="pill due"><i></i>Not paid today</span></div>'
    + '<div class="lbl">Daily pass</div><div class="price"><b>'+gmd(T.daily)+'</b><span>GMD</span></div><div class="psub">Valid until 7:00 pm in any marked ParkNa bay</div>'
    + '<div class="pvh"><span class="lbl">Pay with</span></div><div class="pvr">'+PROVIDERS.map(function(n){ return '<button class="'+(n === prov ? "on" : "")+'" data-a="prov" data-v="'+n+'">'+pv(n, 54, n === prov)+n+'</button>'; }).join("")+'</div>'
    + slide("main", "Slide to pay with "+prov)+'</div></div>';
}
function bento(u){
  var m = MON[B.date.getMonth()], n = u.receipts.filter(function(rc){ return rc.when.indexOf(" "+m+" ") > 0; }).length;
  return '<div class="bento"><button class="tile t1" data-a="paysheet">'+WV_T+'<span class="ti">'+ic("plus", 20, 2.3)+'</span><span class="go">'+ic("arrow", 18, 2.4)+'</span><b>Pay for a plate</b><small>Yours or a friend’s</small></button>'
    + '<button class="tile t2" data-a="paymonthly"><span class="ti">'+ic("cal", 18)+'</span><span><div class="bigt">Save 15%</div><small>Monthly pass</small></span></button>'
    + '<button class="tile" data-a="tab" data-v="receipts"><span class="ti">'+ic("receipt", 18)+'</span><span><b>Receipts</b><small>'+(n ? n+" this month" : "None yet")+'</small></span></button></div>';
}
function todayCard(u){
  var d = dkey(B.date), ev = [];
  CHECKS.forEach(function(c){ if(c.day === d && u.plates.indexOf(c.plate) >= 0) ev.push({ t: c.t, u: c.st === "UNPAID", title: c.st === "UNPAID" ? "Checked: not paid" : "Checked by an attendant", sub: c.plate+" · "+ROADS[c.road].name+" · "+(c.st === "UNPAID" ? "UNPAID" : "PAID") }); });
  u.receipts.forEach(function(rc){ if(rc.day === d){ var a = rc.t.split(":"); ev.push({ t: (+a[0])*60 + (+a[1]), title: "Paid "+gmd(rc.amount)+" GMD", sub: rc.plate+" · "+rc.prov+" · "+rc.ticket }); } });
  ev.sort(function(a, b){ return b.t - a.t; });
  return '<div class="card"><div class="h"><b>Today</b><a data-a="tab" data-v="receipts">Receipts</a></div>'
    + (ev.length ? ev.slice(0, 5).map(function(e){ return '<div class="ev"><i class="'+(e.u ? "u" : "")+'"></i><span><b>'+e.title+'</b><small>'+esc(e.sub)+'</small></span><em>'+hm(e.t)+'</em></div>'; }).join("")
       : '<div class="empty">Nothing yet today. Payments and attendant checks on your plates appear here.</div>')+'</div>';
}

/* ---------- other tabs ---------- */
function topShort(title, sub){ return '<div class="hz short">'+WAVES+'</div><div class="ct">'+header()+'<div class="ttl">'+title+'<small>'+sub+'</small></div>'; }
function stateText(p){
  var st = state(p), r = PLATES[p];
  if(st === "DAILY") return "Paid till 7 pm · "+r.daily.ticket;
  if(st === "MONTHLY") return "Monthly pass to "+fmtD(r.monthly.to);
  if(st === "ORG") return "Covered by "+orgOf(p).name;
  return paidHours() ? "Not paid today · "+T.daily+" GMD" : "Free now";
}
function platesView(){
  var u = me();
  return '<div class="scroll">'+topShort("My plates", u.plates.length+" plate"+(u.plates.length === 1 ? "" : "s")+" on this number")
    + '<div class="list">'+(u.plates.map(function(p){ var st = state(p);
        return '<div class="li"><span class="ic2">'+ic("car", 21)+'</span><span class="tx"><b>'+p+'</b><small>'+stateText(p)+'</small></span>'
          + (st === "UNPAID" && paidHours() ? '<button class="sbtn" data-a="payplate" data-v="'+p+'">Pay</button>' : '<span class="pill '+(st === "UNPAID" ? "info" : st === "ORG" ? "org" : "live")+'"><i></i>'+(st === "UNPAID" ? "Free" : st === "ORG" ? "Org" : "Paid")+'</span>')
          + '<button class="sbtn x" data-a="rmplate" data-v="'+p+'" aria-label="Remove '+p+'">'+ic("x", 15, 2.4)+'</button></div>'; }).join("") || '<div class="card empty">No plates yet. Add one below.</div>')+'</div>'
    + '<div class="card"><div class="h"><b>Add a plate</b></div><label class="fld"><input id="addPlate2" class="pl" value="'+esc(V.add.plate)+'" placeholder="BJL1234" autocomplete="off" autocapitalize="characters"></label>'
    + (V.add.err ? '<div class="err" style="margin-top:8px">'+esc(V.add.err)+'</div>' : "")
    + '<button class="btn" style="margin-top:12px" data-a="addplate" data-v="addPlate2">'+ic("plus", 18, 2.4)+'Add plate</button></div>'
    + '<div class="note"><i>i</i><span>The pass follows the plate, not the payer. You can pay for any plate: a friend’s, a relative’s or a work car.</span></div></div></div>';
}
function receiptsView(){
  var u = me(), m = MON[B.date.getMonth()], sum = u.receipts.filter(function(rc){ return rc.when.indexOf(" "+m+" ") > 0; }).reduce(function(s, rc){ return s + rc.amount; }, 0);
  return '<div class="scroll">'+topShort("Receipts", u.receipts.length+" payment"+(u.receipts.length === 1 ? "" : "s"))
    + '<div class="pass"><div class="pa"><div class="lbl" style="margin:0">Spent in '+MONL[B.date.getMonth()]+'</div><div class="price" style="margin-top:6px"><b>'+gmd(sum)+'</b><span>GMD</span></div><div class="psub">Every receipt also arrives by SMS with its ticket number.</div></div></div>'
    + '<div class="list">'+(u.receipts.map(function(rc){ return '<div class="li">'+pv(rc.prov, 44)+'<span class="tx"><b>'+rc.plate+'</b><small>'+(rc.kind === "monthly" ? "Monthly pass" : "Daily pass")+' · '+rc.when+'<br>'+rc.prov+' · '+rc.ticket+'</small></span><span class="amt">'+gmd(rc.amount)+'</span></div>'; }).join("") || '<div class="card empty">No receipts yet. Pay for a plate and the receipt appears here.</div>')+'</div></div></div>';
}
function accountView(){
  var u = me();
  return '<div class="scroll">'+topShort("Account", "+220 "+u.num)
    + '<div class="li"><span class="ic2" style="background:linear-gradient(135deg,#F9DD17,#44B0F1);font-weight:700;color:#0C2D4E">'+esc(u.name.slice(0, 2).toUpperCase())+'</span><span class="tx"><b class="nm">'+esc(u.name)+'</b><small>+220 '+u.num+' · '+u.plates.length+' plate'+(u.plates.length === 1 ? "" : "s")+'</small></span></div>'
    + '<div class="card"><div class="h"><b>Wallets</b><span style="font-size:11.5px;color:var(--mute)">demo balances</span></div>'+PROVIDERS.map(function(n){ return '<div class="ev" style="grid-template-columns:40px 1fr auto;align-items:center"><span>'+pv(n, 36)+'</span><span><b>'+n+'</b><small>Approve with your PIN</small></span><b>'+gmd(u.wallet[n])+' GMD</b></div>'; }).join("")+'</div>'
    + '<div class="card"><div class="h"><b>Demo server</b></div><div class="empty" style="word-break:break-all">'+esc(PN.server)+(PN.online ? " · connected" : " · reconnecting")+'</div><button class="btn lt" style="margin-top:12px" data-a="chgsrv">Change server</button></div>'
    + '<button class="btn lt" data-a="logout">Sign out</button>'
    + '<div class="note"><i>'+ic("sms", 13, 2.4)+'</i><span>No data? Text your plate to <b>7275</b>. Same pass, same price, and it shows here too.</span></div>'
    + '<div style="display:flex;align-items:center;gap:10px;justify-content:center;font-size:11.5px;color:var(--mute);padding:6px 0 10px"><img src="assets/img/innovii-navy.png" style="height:15px" alt="INNOVII">ParkNa driver app v'+VERSION+' · Banjul City Council</div></div></div>';
}

/* ---------- pay sheet, PIN, success ---------- */
function paySheet(){
  var u = me(), S = V.sheet, prov = S.prov || provOf(u), q = S.plate ? quote(ME, S.plate, S.kind) : { err: "Enter the plate number" };
  var bad = !!q.err;
  return '<div class="ov" data-a="closeov"><div class="sheet" data-stop="1"><div class="hd"></div>'
    + '<div class="row" style="align-items:flex-start"><div><h3>'+(S.kind === "monthly" ? "Monthly pass" : "Pay for a plate")+'</h3><div class="sub">Yours or someone else’s. The pass follows the plate.</div></div><button class="x" data-a="closeov" aria-label="Close">'+ic("x", 16, 2.4)+'</button></div>'
    + '<label class="fld">Plate number<input id="sPlate" class="pl" value="'+esc(S.plate)+'" placeholder="BJL1234" autocomplete="off" autocapitalize="characters"></label>'
    + '<div class="seg"><button class="'+(S.kind === "daily" ? "on" : "")+'" data-a="kind" data-v="daily"><small>Daily</small><b>'+gmd(T.daily)+'</b><em>till 7 pm today</em></button><button class="'+(S.kind === "monthly" ? "on" : "")+'" data-a="kind" data-v="monthly"><small>Monthly</small><b>'+gmd(T.monthly)+'</b><em>26 paid days less 15%</em></button></div>'
    + '<div class="pvg">'+PROVIDERS.map(function(n){ return '<button class="pvc'+(n === prov ? " on" : "")+'" data-a="sprov" data-v="'+n+'">'+pv(n, 42)+'<span><b>'+n+'</b><small>PIN on your phone</small></span><span class="rd">'+(n === prov ? ic("check", 12, 3.2) : "")+'</span></button>'; }).join("")+'</div>'
    + (S.plate ? '<div class="note'+(bad ? " warn" : "")+'"><i>'+(bad ? "!" : ic("check", 13, 3))+'</i><span>'+(bad ? esc(q.err) : q.kind === "monthly" ? "Valid to <b>"+fmtD(q.to)+"</b>. Park in any marked ParkNa bay." : "Valid until 7:00 pm today in any marked ParkNa bay.")+'</span></div>' : "")
    + '<div class="tot"><span>Total</span><b>'+gmd(S.kind === "monthly" ? T.monthly : T.daily)+' GMD</b></div>'
    + slide("sheet", "Slide to pay with "+prov, bad)+'</div></div>';
}
function pinView(){
  var P0 = V.pin;
  var body = P0.busy ? '<div class="spin"></div><p>'+P0.prov+' is processing your payment…</p>'
    : '<div class="dots">'+[0,1,2,3].map(function(i){ return '<i class="'+(i < P0.digits.length ? "f" : "")+'"></i>'; }).join("")+'</div>'
      + (P0.err ? '<div class="err">'+esc(P0.err)+'</div><button class="lnk" data-a="pinother">Choose another provider</button>' : "")
      + '<div class="keys">'+["1","2","3","4","5","6","7","8","9","","0","del"].map(function(k){ return k === "" ? '<span></span>' : '<button class="'+(k === "del" ? "nb" : "")+'" data-a="key" data-v="'+k+'">'+(k === "del" ? ic("del", 24, 1.9) : k)+'</button>'; }).join("")+'</div>'
      + '<button class="lnk" data-a="pincancel">Cancel</button>';
  return '<div class="ov"><div class="pin">'+pv(P0.prov, 64)+'<h4>'+P0.prov+'</h4><p>Pay <b>'+gmd(P0.amount)+' GMD</b> to <b>PARKNA – BANJUL CITY COUNCIL</b><br>'+P0.plate+' · '+(P0.kind === "monthly" ? "monthly pass" : "daily pass")+'<br>Enter your '+P0.prov+' PIN. ParkNa never sees it.</p>'+body+'</div></div>';
}
function doneView(){
  var D = V.done;
  return '<div class="done"><div class="ring"><span>'+ic("check", 44, 3)+'</span></div><h2>Paid</h2><p><b style="color:#fff">'+D.plate+'</b> is covered '+(D.kind === "monthly" ? "until "+fmtD(D.to) : "until 7:00 pm today")+'.<br>A receipt is on its way by SMS.</p>'
    + '<div class="tk"><span>Ticket <b>'+D.ticket+'</b></span><span>'+D.prov+' · <b>'+gmd(D.amount)+' GMD</b></span></div><button class="btn" data-a="donex">Done</button></div>';
}

/* ---------- slide to pay ---------- */
function bindSlides(){
  Array.prototype.forEach.call(APP.querySelectorAll(".slide"), function(el){
    var k = el.querySelector(".k"), lb = el.querySelector(".lb"), x0 = 0, dx = 0, max = 0, on = false;
    if(el.classList.contains("dis")) return;
    k.addEventListener("pointerdown", function(e){ on = true; V.dragging = true; x0 = e.clientX; max = el.clientWidth - k.offsetWidth - 12; k.style.transition = "none"; try { k.setPointerCapture(e.pointerId); } catch(x){} });
    k.addEventListener("pointermove", function(e){ if(!on) return; dx = Math.max(0, Math.min(max, e.clientX - x0)); k.style.transform = "translateX("+dx+"px)"; lb.style.opacity = String(1 - dx/max*.9); });
    function end(){
      if(!on) return; on = false; V.dragging = false; k.style.transition = "";
      if(dx >= max * .82){ k.style.transform = "translateX("+max+"px)"; var key = el.dataset.slide; dx = 0; setTimeout(function(){ onSlide(key); }, 120); }
      else { k.style.transform = ""; lb.style.opacity = ""; dx = 0; if(V.pending){ V.pending = false; render(); } }
    }
    k.addEventListener("pointerup", end); k.addEventListener("pointercancel", end);
    el.addEventListener("click", function(e){ if(e.target.closest(".k")) return; k.classList.remove("hint"); void k.offsetWidth; k.classList.add("hint"); });
  });
}
function onSlide(key){
  var u = me();
  if(key === "main"){
    var p = focusPlate(u), q = quote(ME, p, "daily");
    if(q.err){ toast(q.err); return render(); }
    startPin({ plate: q.plate, kind: "daily", amount: q.amount, prov: provOf(u) });
  } else {
    var S = V.sheet, q2 = quote(ME, S.plate, S.kind);
    if(q2.err) return render();
    startPin({ plate: q2.plate, kind: S.kind, amount: q2.amount, prov: S.prov || provOf(u) });
  }
}
function startPin(p){ V.ov = null; V.pin = { plate: p.plate, kind: p.kind, amount: p.amount, prov: p.prov, digits: "", busy: false, err: "" }; pushNav(); render(); }
function pinKey(k){
  var P0 = V.pin; if(!P0 || P0.busy) return;
  if(k === "del"){ P0.digits = P0.digits.slice(0, -1); P0.err = ""; return render(); }
  if(P0.digits.length >= 4) return;
  P0.digits += k; P0.err = "";
  render();
  if(P0.digits.length === 4){
    P0.busy = true; setTimeout(render, 150);
    setTimeout(function(){
      PN.act({ type: "driver.pay", num: ME, plate: P0.plate, kind: P0.kind, prov: P0.prov }).then(function(r){
        if(!V.pin) return;
        if(r && r.ok){ V.pin = null; V.done = r; V.prov = null; V.focus = r.plate; }
        else { P0.busy = false; P0.digits = ""; P0.err = (r && r.err) || "Payment failed. Nothing was charged."; }
        render();
      });
    }, 1100);
  }
}

/* ---------- actions ---------- */
function toast(t){ V.toast = t; render(); clearTimeout(toast.t); toast.t = setTimeout(function(){ V.toast = null; render(); }, 2600); }
function pushNav(){ try { history.pushState({ pn: 1 }, ""); } catch(e){} }
window.addEventListener("popstate", function(){
  if(V.pin && !V.pin.busy){ V.pin = null; return render(); }
  if(V.done){ V.done = null; return render(); }
  if(V.ov){ V.ov = null; return render(); }
  if(V.view !== "home"){ V.view = "home"; return render(); }
});
function openSheet(plate, kind){ V.sheet = { plate: plate || "", kind: kind || "daily", prov: null }; V.ov = "pay"; pushNav(); render(); }
function doLogin(){
  var L = V.login; L.busy = true; L.err = ""; render();
  PN.act({ type: "driver.login", num: L.num, name: L.name }).then(function(r){
    L.busy = false;
    if(r.need === "name"){ L.need = true; L.err = L.name ? "" : "Welcome! What’s your name?"; }
    else if(r.err) L.err = r.err;
    else { ME = r.num; PN.ls("parkna.driver", ME); V.view = "home"; V.login = { num: "", name: "", need: false, err: "", busy: false }; }
    render();
  });
}
function addPlate(id){
  var val = (document.getElementById(id) || {}).value || V.add.plate, p = normPlate(val);
  if(!p){ V.add.err = "Enter a plate like BJL1234"; return render(); }
  V.add = { plate: "", err: "" };
  PN.act({ type: "driver.addPlate", num: ME, plate: p }).then(function(r){ if(r.err){ V.add.err = r.err; render(); } else { V.focus = p; toast(p+" added"); } });
}
APP.addEventListener("click", function(e){
  var t = e.target.closest("[data-a]");
  if(!t){ return; }
  if(t.dataset.stop && !e.target.closest("[data-a]:not([data-stop])")) return;
  var a = t.dataset.a, v = t.dataset.v;
  if(a === "closeov"){ if(e.target.closest(".sheet") && t.classList.contains("ov")) return; V.ov = null; return render(); }
  switch(a){
    case "connect": {
      var url = (document.getElementById("srv") || {}).value || V.setup.url; V.setup.url = url; V.setup.busy = true; V.setup.err = ""; render();
      PN.ping(url).then(function(ok){ V.setup.busy = false; if(!ok){ V.setup.err = "Can’t reach a ParkNa server at that address. Check the address (start it with https://) and this phone’s internet connection."; return render(); } PN.setServer(ok); start(); });
      return;
    }
    case "chgsrv": PN.setServer(""); PN.ready = false; if(PN.es) PN.es.close(); V.setup = { url: "", err: "", busy: false }; return render();
    case "persona": V.login.num = v; V.login.need = false; return doLogin();
    case "login": V.login.num = (document.getElementById("lgNum") || {}).value || V.login.num; if(document.getElementById("lgName")) V.login.name = document.getElementById("lgName").value; return doLogin();
    case "logout": ME = null; PN.ls("parkna.driver", null); V.view = "home"; return render();
    case "tab": V.view = v; V.ov = null; if(v !== "home") pushNav(); return render();
    case "focus": V.focus = v; PN.act({ type: "driver.focus", num: ME, plate: v }); return render();
    case "prov": V.prov = v; return render();
    case "addplate": return addPlate(v);
    case "rmplate": PN.act({ type: "driver.removePlate", num: ME, plate: v }); return toast(v+" removed from your plates");
    case "paysheet": return openSheet("", "daily");
    case "paymonthly": return openSheet(focusPlate(me()) || "", "monthly");
    case "payplate": return openSheet(v, "daily");
    case "renew": return openSheet(v, "monthly");
    case "kind": V.sheet.kind = v; return render();
    case "sprov": V.sheet.prov = v; return render();
    case "key": return pinKey(v);
    case "pincancel": V.pin = null; return render();
    case "pinother": { var P0 = V.pin; V.pin = null; V.sheet = { plate: P0.plate, kind: P0.kind, prov: null }; V.ov = "pay"; return render(); }
    case "donex": V.done = null; V.view = "home"; return render();
  }
});
APP.addEventListener("input", function(e){
  var t = e.target, id = t.id;
  if(id === "srv") V.setup.url = t.value;
  else if(id === "lgNum") V.login.num = t.value;
  else if(id === "lgName") V.login.name = t.value;
  else if(id === "addPlate" || id === "addPlate2"){ V.add.plate = t.value.toUpperCase(); V.add.err = ""; }
  else if(id === "sPlate"){ V.sheet.plate = t.value.toUpperCase(); render(); }
});
APP.addEventListener("keydown", function(e){
  if(e.key !== "Enter") return;
  var id = e.target.id;
  if(id === "srv") APP.querySelector('[data-a="connect"]').click();
  else if(id === "lgNum" || id === "lgName") APP.querySelector('[data-a="login"]').click();
  else if(id === "addPlate" || id === "addPlate2") addPlate(id);
});

function start(){
  PN.ready = false; V.slow = false; render();
  setTimeout(function(){ if(!PN.ready){ V.slow = true; render(); } }, 6000);
  PN.connect(render, function(){ render(); });
}
if(PN.server) start(); else render();
})();
