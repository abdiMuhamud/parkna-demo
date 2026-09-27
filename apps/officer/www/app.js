/* ParkNa officer app v0.1
   The pilot officer line is SMS only: START, a plate, END to 7275 from the registered number.
   This app is that SMS line on the officer's phone, connected to the ParkNa demo server. */
(function(){
var APP = document.getElementById("app");
var VERSION = "0.2";
var V = { setup: { url: PN.server || "", err: "", busy: false }, login: { num: "", err: "", busy: false }, draft: "", sending: false, cars: false, menu: false, slow: false };
var ME = PN.ls("parkna.officer");
var IP = {
  send: '<path d="M4 12 20 4l-6 16-3-7Z"/><path d="m11 13 3-3"/>', menu: '<path d="M4 7h16M4 12h16M4 17h10"/>', car: '<path d="M5 16v-4l2-5h10l2 5v4M5 16h14M6 16v2.5M18 16v2.5"/><circle cx="8.5" cy="13" r=".9"/><circle cx="15.5" cy="13" r=".9"/>',
  wifi: '<path d="M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0"/><path d="M12 19.5v.1"/>',
};
function ic(n, s, w){ return '<svg width="'+(s||20)+'" height="'+(s||20)+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="'+(w||1.9)+'" stroke-linecap="round" stroke-linejoin="round">'+IP[n]+'</svg>'; }
var WAVES = '<svg class="wv" viewBox="0 0 390 70" preserveAspectRatio="none" fill="none" stroke="#fff" stroke-width="1.4">'+[[22,.08],[40,.1],[58,.06]].map(function(a){ var y = a[0]; return '<path opacity="'+a[1]+'" d="M0 '+y+' C 60 '+(y-12)+', 120 '+(y+12)+', 195 '+y+' S 330 '+(y-12)+', 390 '+y+'"/>'; }).join("")+'</svg>';

function render(){
  var h;
  if(!PN.server) h = setupScreen();
  else if(!PN.ready) h = loadingScreen();
  else if(!ME || !isOfficer(ME)) h = loginScreen();
  else h = lineScreen();
  var a = document.activeElement, id = a && a.id, s = null, e = null;
  try { if(id){ s = a.selectionStart; e = a.selectionEnd; } } catch(x){}
  var th = APP.querySelector(".thread"), atBottom = !th || th.scrollHeight - th.scrollTop - th.clientHeight < 60, top = th ? th.scrollTop : 0;
  APP.innerHTML = h;
  var th2 = APP.querySelector(".thread"); if(th2) th2.scrollTop = atBottom ? th2.scrollHeight : top;
  if(id){ var n = document.getElementById(id); if(n){ n.focus(); try { if(s != null) n.setSelectionRange(s, e); } catch(x){} } }
}
function setupScreen(){
  var S = V.setup;
  return '<div class="auth"><span class="crest"><img src="assets/img/crest.png" alt="Banjul City Council crest"></span><span class="stripe"></span>'
   + '<h1>Officer line<br><span>ParkNa server</span></h1><p>Enter the ParkNa server address your supervisor gave you, like <b>https://parkna.example.gm</b>.</p>'
   + '<label class="fld">Server address<input id="srv" value="'+esc(S.url)+'" placeholder="https://parkna.example.gm" autocomplete="off" autocapitalize="off" inputmode="url"></label>'
   + (S.err ? '<div class="err">'+esc(S.err)+'</div>' : "")
   + '<button class="btn" data-a="connect"'+(S.busy ? " disabled" : "")+'>'+(S.busy ? "Connecting…" : "Connect")+'</button>'
   + '<div class="pow"><img src="assets/img/innovii-white.png" alt="INNOVII">ParkNa officer app v'+VERSION+' · demo</div></div>';
}
function loadingScreen(){
  return '<div class="auth"><span class="crest"><img src="assets/img/crest.png" alt=""></span><span class="stripe"></span><h1>Connecting…</h1><p>'+esc(PN.server)+'</p>'
   + '<div class="spin" style="border-color:rgba(255,255,255,.15);border-top-color:#F9DD17"></div>'
   + (V.slow ? '<p>Can’t reach the ParkNa server yet. Check this phone’s internet connection and the server address.</p><button class="btn" data-a="chgsrv">Change server address</button>' : "")
   + '<div class="pow"><img src="assets/img/innovii-white.png" alt="INNOVII">ParkNa officer app v'+VERSION+'</div></div>';
}
function loginScreen(){
  var L = V.login;
  var offs = Object.keys(OFF).map(function(k){ return OFF[k]; }).filter(function(o){ return o.active && !o.bg; });
  return '<div class="auth"><span class="crest"><img src="assets/img/crest.png" alt="Banjul City Council crest"></span><span class="stripe"></span>'
   + '<h1>ParkNa<br><span>officer line</span></h1><p>Commands work only from the number registered in the back office: <b>START</b> to begin, a <b>plate</b> to check it, <b>END</b> to finish.</p>'
   + '<label class="fld">Registered number (+220)<input id="lgNum" value="'+esc(L.num)+'" placeholder="7300007" inputmode="numeric" autocomplete="off"></label>'
   + (L.err ? '<div class="err">'+esc(L.err)+'</div>' : "")
   + '<button class="btn" data-a="login"'+(L.busy ? " disabled" : "")+'>Open the officer line</button>'
   + '<div style="font-size:12px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#9CC3E6">Registered attendants</div>'
   + '<div class="olist">'+offs.map(function(o){ return '<button data-a="pick" data-v="'+o.num+'"><i>'+o.id+'</i><span><b>'+esc(o.name)+'</b><small>+220 '+o.num+' · '+ROADS[o.road].name+' · '+SHIFTS[o.shift].label+'</small></span></button>'; }).join("")+'</div>'
   + '<div class="pow"><img src="assets/img/innovii-white.png" alt="INNOVII">ParkNa officer app v'+VERSION+' · <a data-a="chgsrv" style="color:#9CC3E6">server</a></div></div>';
}
function lineScreen(){
  var o = OFF[ME], u = NUMS[ME] || { sms: [] }, road = roadOf(o), s = offStats(o), moved = road !== o.road;
  var status = o.on && o.day === dkey(B.date)
    ? '<div class="r1"><span><b>On shift since '+hm(o.start)+'</b><small>'+ROADS[road].name+' '+ROADS[road].bays.replace("-", "–")+(moved ? " · moved today" : "")+'</small></span><span class="pill '+(moved ? "move" : "live")+'"><i></i>'+(moved ? "Reassigned" : "On shift")+'</span></div>'
      + '<div class="stats"><span><b>'+s.checked+'</b>checked</span><span><b>'+(s.checked - s.unpaid)+'</b>paid</span><span class="u"><b>'+s.unpaid+'</b>unpaid</span></div>'
    : '<div class="r1"><span><b>Not on shift</b><small>'+ROADS[road].name+' · '+SHIFTS[o.shift].label+' · text START to begin</small></span><span class="pill idle"><i></i>Off</span></div>';
  var thread = u.sms.map(function(m){
    if(m.d) return '<div class="dt">'+esc(m.d)+'</div>';
    if(m.o) return '<div class="m o"><span class="st">'+m.t+'</span><div class="bub">'+esc(m.o)+'</div></div>';
    if(m.i){ var cls = /: UNPAID/.test(m.i) ? "unpaid" : /: PAID/.test(m.i) ? "paid" : "";
      return '<div class="m i"><div class="bub '+cls+'">'+(m.tag ? '<span class="tag">'+esc(m.tag)+'</span>' : "")+esc(m.i)+'</div><span class="st">'+m.t+'</span></div>'; }
    return "";
  }).join("") || '<div class="dt">No messages yet. Text START to begin your shift.</div>';
  if(V.sending) thread += '<div class="m i"><div class="typing"><i></i><i></i><i></i></div></div>';
  var d = dkey(B.date), cars = PARK.filter(function(c){ return c.road === road; }).map(function(c){ return c.plate; });
  var unchecked = cars.filter(function(p){ return !CHECKS.some(function(c){ return c.day === d && c.plate === p && c.off === o.id; }); });
  var chips = !(o.on && o.day === d) ? [["START", "k y"]] : (unchecked.length ? unchecked : cars).slice(0, 4).map(function(p){ return [p, ""]; }).concat([["END", "k"]]);
  var h = '<div class="wrap"><div class="top">'+WAVES+'<div class="hdr"><span class="crest"><img src="assets/img/crest.png" alt="Banjul City Council crest"></span><span><small>ParkNa officer line</small><b>Attendant '+o.id+' · '+esc(o.name.split(" ")[0])+'</b><div class="sub">SMS to 7275 · +220 '+o.num+'</div></span>'
    + (PN.online ? '<button class="menu" data-a="menu" aria-label="Menu">'+ic("menu", 20, 2.2)+'</button>' : '<span class="off">'+ic("wifi", 14, 2.2)+'Reconnecting</span>')+'</div></div>'
    + '<div class="shift">'+status+'</div>'
    + '<div class="thread">'+thread+'</div>'
    + '<div class="cmp"><div class="sugg">'+chips.map(function(c){ return '<button class="'+c[1]+'" data-a="chip" data-v="'+c[0]+'">'+c[0]+'</button>'; }).join("")+'<button class="k" data-a="cars">'+ic("car", 14, 2.2)+' Road</button></div>'
    + '<div class="row2"><input id="msg" value="'+esc(V.draft)+'" placeholder="START, a plate, or END" autocomplete="off" autocapitalize="characters" enterkeyhint="send"><button class="send" data-a="send" aria-label="Send">'+ic("send", 20, 2.2)+'</button></div></div></div>';
  if(V.cars) h += '<div class="sheetov" data-a="closeov"><div class="msheet" data-sheet="1"><h3>'+ROADS[road].name+'</h3><p>Demo cars parked on your road. Tap one to text its plate.</p><div class="cars">'
    + PARK.filter(function(c){ return c.road === road; }).map(function(c){ return '<button data-a="chip" data-v="'+c.plate+'"><span class="b">'+c.bay+'</span><b>'+c.plate+'</b><em>Check</em></button>'; }).join("")
    + '</div><button class="btn lt" data-a="closeov">Close</button></div></div>';
  if(V.menu) h += '<div class="sheetov" data-a="closeov"><div class="msheet" data-sheet="1"><h3>Officer line</h3><p>Attendant '+o.id+', '+esc(o.name)+' · +220 '+o.num+'<br>Server: '+esc(PN.server)+'</p>'
    + '<button class="btn lt" data-a="logout">Switch attendant</button><button class="btn lt" data-a="chgsrv">Change server</button><button class="btn" data-a="closeov">Close</button>'
    + '<div style="display:flex;align-items:center;gap:10px;justify-content:center;font-size:11.5px;color:var(--mute)"><img src="assets/img/innovii-navy.png" style="height:15px" alt="INNOVII">ParkNa officer app v'+VERSION+'</div></div></div>';
  return h;
}
function sendText(t){
  t = String(t || "").trim(); if(!t || V.sending) return;
  V.draft = ""; V.sending = true; V.cars = false;
  var u = NUMS[ME]; if(u){ u.sms.push({ o: t.toUpperCase(), t: hm(B.min) }); }
  render();
  setTimeout(function(){ PN.act({ type: "sms", num: ME, text: t }).then(function(){ V.sending = false; render(); }); }, 450);
}
APP.addEventListener("click", function(e){
  var t = e.target.closest("[data-a]"); if(!t) return;
  var a = t.dataset.a, v = t.dataset.v;
  if(a === "closeov" && t.classList.contains("sheetov") && e.target.closest("[data-sheet]")) return;
  switch(a){
    case "connect": {
      var url = (document.getElementById("srv") || {}).value || V.setup.url; V.setup.url = url; V.setup.busy = true; V.setup.err = ""; render();
      PN.ping(url).then(function(ok){ V.setup.busy = false; if(!ok){ V.setup.err = "Can’t reach a ParkNa server at that address. Check the address (start it with https://) and this phone’s internet connection."; return render(); } PN.setServer(ok); start(); });
      return;
    }
    case "chgsrv": PN.setServer(""); PN.ready = false; if(PN.es) PN.es.close(); V.menu = false; V.setup = { url: "", err: "", busy: false }; return render();
    case "pick": V.login.num = v; return login();
    case "login": V.login.num = (document.getElementById("lgNum") || {}).value || V.login.num; return login();
    case "logout": ME = null; PN.ls("parkna.officer", null); V.menu = false; return render();
    case "chip": return sendText(v);
    case "send": return sendText((document.getElementById("msg") || {}).value || V.draft);
    case "cars": V.cars = true; return render();
    case "menu": V.menu = true; return render();
    case "closeov": V.cars = false; V.menu = false; return render();
  }
});
APP.addEventListener("input", function(e){
  if(e.target.id === "srv") V.setup.url = e.target.value;
  if(e.target.id === "lgNum") V.login.num = e.target.value;
  if(e.target.id === "msg") V.draft = e.target.value;
});
APP.addEventListener("keydown", function(e){
  if(e.key !== "Enter") return;
  if(e.target.id === "msg"){ e.preventDefault(); sendText(e.target.value); }
  if(e.target.id === "srv") APP.querySelector('[data-a="connect"]').click();
  if(e.target.id === "lgNum") login();
});
function login(){
  var L = V.login; L.busy = true; L.err = ""; render();
  PN.act({ type: "officer.login", num: L.num }).then(function(r){
    L.busy = false;
    if(r.err) L.err = r.err; else { ME = r.num; PN.ls("parkna.officer", ME); V.login = { num: "", err: "", busy: false }; }
    render();
  });
}
function start(){
  PN.ready = false; V.slow = false; render();
  setTimeout(function(){ if(!PN.ready){ V.slow = true; render(); } }, 6000);
  PN.connect(function(){ if(!V.sending) render(); }, function(){ render(); });
}
if(PN.server) start(); else render();
})();
