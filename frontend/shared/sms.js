/* SUNU Park SMS & USSD simulator (/sms). No sign-in: open while the server has sms.simulator.enabled (on by default on a
   demo server, or while SMS are simulated). Every text and every USSD step goes through the server exactly like a real
   phone's (the same rules, payments, receipts and warnings); only the replies to the numbers used here stay here.
     left    SMS channel: the phone's Messages thread with the short code
     middle  USSD channel: the dialer and the *7275# session
     right   the subscriber (who the number is, plates, wallets), demo controls, the charging ledger, use cases */
(function(){
  var $ = function(id){ return document.getElementById(id); };
  var root = $("root"), B = null, NUM = "", INFO = null, lastSig = "", U = { dial: "", path: null, screen: "", end: false, busy: false }, RUN = null, DONE = {};
  try { DONE = JSON.parse(localStorage.getItem("sunu.sim.done") || "{}"); NUM = localStorage.getItem("sunu.sim.num") || ""; } catch(e){}
  var e = function(s){ return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); };
  var money = function(n){ return Math.round(n).toLocaleString("en-GB"); };
  var phone = function(n){ return "+220 " + String(n).slice(0, 3) + " " + String(n).slice(3); };
  var wait = function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); };
  function api(method, path, body){
    return fetch(path, { method: method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined })
      .then(function(r){ return r.json(); }).catch(function(){ return { err: "Can’t reach the SUNU Park server." }; });
  }
  function toast(t){ var el = $("toast"); el.textContent = t; el.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(function(){ el.classList.remove("on"); }, 2600); }
  function code(){ return "*" + ((B && B.shortcode) || "7275") + "#"; }
  function clock(){ return B ? B.time : "09:41"; }
  var ICONS = '<i><svg width="16" height="12" viewBox="0 0 16 12"><path d="M1 11h2V8H1zM5 11h2V6H5zM9 11h2V3H9zM13 11h2V0h-2z" fill="#111"/></svg><svg width="16" height="12" viewBox="0 0 24 18"><path d="M12 18 0 5a17 17 0 0 1 24 0Z" fill="#111"/></svg><svg width="24" height="12" viewBox="0 0 26 12"><rect x=".5" y=".5" width="22" height="11" rx="3" fill="none" stroke="#111"/><rect x="2" y="2" width="17" height="8" rx="1.5" fill="#111"/><rect x="23.5" y="4" width="2" height="4" rx="1" fill="#111"/></svg></i>';

  /* ---------------- the use cases: one click runs the whole flow on the right phone ---------------- */
  var SC = [
    { id: "01", t: "Pay today by SMS", s: "Lamin texts his plate, 1 for a daily pass, 1 for Wave. Receipt by SMS, plate PAID till 7pm.", num: "7023456", steps: [["sms", "BJL1234"], ["sms", "1"], ["sms", "1"]] },
    { id: "02", t: "Monthly pass by SMS", s: "Isatou texts her plate, 2 for a monthly pass, pays with Afrimoney: 4,000 GMD, 30 days.", num: "3034567", steps: [["sms", "BJL5678"], ["sms", "2"], ["sms", "2"]] },
    { id: "03", t: "Pay today by USSD", s: "Fatou dials *7275#, Daily pass, types a plate, pays with APS.", num: "7012345", steps: [["ussd", ["1", "BJL6006", "3"]]] },
    { id: "04", t: "Not enough balance", s: "Ebrima tries Wave (100 GMD left): nothing charged; then pays with QMoney.", num: "7045678", steps: [["sms", "BJL3030"], ["sms", "1"], ["sms", "1"], ["sms", "BJL3030"], ["sms", "1"], ["sms", "4"]] },
    { id: "05", t: "Already covered", s: "Omar’s monthly pass and Kebba’s organisation car: nothing to pay.", num: "3078901", steps: [["sms", "BJL7777"], ["sms", "BJL7001"]] },
    { id: "06", t: "Wrong input", s: "Fatou texts hello, a bad plate, then a wrong menu digit.", num: "7012345", steps: [["sms", "hello"], ["sms", "BJL123456"], ["sms", "9"]] },
    { id: "07", t: "Attendant shift by SMS", s: "Modou texts START, checks a paid and an unpaid plate.", num: "7300007", steps: [["sms", "START"], ["sms", "BJL7777"], ["sms", "BJL8080"]] },
    { id: "08", t: "Warning to an unpaid car", s: "Modou texts W BJL8080: first-time offender; Musa gets the warning SMS.", num: "7300007", steps: [["sms", "START"], ["sms", "W BJL8080"]] },
    { id: "09", t: "Pay a warning within 24 hours", s: "Musa texts his plate: the warning is offered first, 200 GMD.", num: "7055501", steps: [["sms", "BJL8080"], ["sms", "1"]] },
    { id: "10", t: "Fines first", s: "Awa warns BJL2211; Isatou then tries to pay for BJL5678 and is asked to settle the warning.", num: "3034567", steps: [["as", "7300012"], ["sms", "START"], ["sms", "W BJL2211"], ["as", "3034567"], ["sms", "BJL5678"]] },
    { id: "11", t: "After 24 hours: with the fine", s: "Next day: Isatou’s warning now costs 2,080 GMD (200 + 1,880 fine). Demo clock.", num: "3034567", demo: true, steps: [["clock", "nextDay"], ["clock", "morning"], ["clock", "hour"], ["sms", "BJL2211"], ["sms", "1"]] },
    { id: "12", t: "Repeat offender", s: "Awa warns BJL2211 again the next day: the reply says repeat offender.", num: "7300012", steps: [["sms", "START"], ["sms", "BJL2211"], ["sms", "W BJL2211"]] },
    { id: "13", t: "Attendant by USSD", s: "Awa dials *7275#: start shift, check a plate, issue a warning.", num: "7300012", steps: [["ussd", ["1"]], ["ussd", ["2", "BJL9191"]], ["ussd", ["3", "BJL9191"]]] },
    { id: "14", t: "My plates and status by USSD", s: "Isatou dials *7275# → My plates, then checks a plate.", num: "3034567", steps: [["ussd", ["5"]], ["ussd", ["3", "1"]]] },
    { id: "15", t: "Terms and help", s: "TERMS and HELP by SMS; Terms & conditions by USSD.", num: "7012345", steps: [["sms", "TERMS"], ["sms", "HELP"], ["ussd", ["6"]]] },
    { id: "16", t: "Free hours", s: "After 7pm a plate texted is free. Demo clock.", num: "7023456", demo: true, steps: [["clock", "evening"], ["sms", "BJL1234"], ["clock", "morning"]] },
    { id: "17", t: "A new number", s: "A first-time phone says hi (welcome with the terms link), then pays.", num: "7444444", steps: [["sms", "Hi"], ["sms", "BJL4545"], ["sms", "BJL2468"], ["sms", "1"], ["sms", "1"]] },
    { id: "18", t: "Organisation contact", s: "Mariama (Demo Bank) checks a fleet car by SMS: covered.", num: "7101234", steps: [["sms", "BJL7002"]] }
  ];

  /* ---------------- layout ---------------- */
  function shell(){
    root.innerHTML = '<div class="top"><span class="mk">P</span><div><b>SUNU Park · SMS &amp; USSD simulator</b><small>Every text and USSD step goes through the real SUNU Park rules. Replies to these numbers stay on this page.</small></div><span class="sp"></span><span id="pills"></span></div>'
      + '<div class="bench">'
      + '<div><div class="ch">SMS CHANNEL<em>MO/MT · <span class="sc0"></span></em></div><div class="dev"><div class="scr">'
      + '<div class="sb"><span class="clk"></span>' + ICONS + '</div>'
      + '<div class="mh"><span style="color:#444;font-size:22px">‹</span><span class="av">SP</span><div><b>SUNU Park</b><small><span class="sc0"></span> · SMS</small></div></div>'
      + '<div class="th" id="th"></div><div class="typing" id="typing"><i></i><i></i><i></i></div>'
      + '<div class="qr" id="qr"></div>'
      + '<form class="cmp" id="cmp"><span class="pl">+</span><input id="msg" maxlength="160" autocomplete="off" placeholder="Text message"><button class="go" id="go" aria-label="Send"><svg width="20" height="20" viewBox="0 0 24 24"><path d="M3 20.5 21 12 3 3.5l2.5 8.5L3 20.5Zm2.5-8.5H13" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg></button></form>'
      + '</div></div></div>'
      + '<div><div class="ch">USSD CHANNEL<em>session · <span class="code0"></span></em></div><div class="dev"><div class="scr">'
      + '<div class="sb"><span class="clk"></span>' + ICONS + '</div>'
      + '<div class="dial"><div class="num ph" id="dnum"></div><div class="net" id="dnet"></div>'
      + '<div class="pad">' + [["1", ""], ["2", "ABC"], ["3", "DEF"], ["4", "GHI"], ["5", "JKL"], ["6", "MNO"], ["7", "PQRS"], ["8", "TUV"], ["9", "WXYZ"], ["*", ""], ["0", "+"], ["#", ""]].map(function(k){ return '<button data-k="' + k[0] + '">' + k[0] + '<small>' + k[1] + '</small></button>'; }).join("") + '</div>'
      + '<div class="call"><span class="sh"></span><button class="c" id="callb" aria-label="Call"><svg width="26" height="26" viewBox="0 0 24 24"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1l-2.3 2.2Z" fill="#fff"/></svg></button><button class="x" id="bksp" aria-label="Delete">⌫</button></div></div>'
      + '<div class="ov" id="uov"><div class="dlg" id="udlg"></div></div>'
      + '</div></div></div>'
      + '<div class="side">'
      + '<div class="pn"><h3>SUBSCRIBER<span id="clockline"></span></h3><div class="pb">'
      + '<form class="ld" id="ldf"><input id="msisdn" inputmode="numeric" placeholder="Enter MSISDN, e.g. 7055501" autocomplete="off"><button class="btn">Load</button></form>'
      + '<div class="hint" id="whohint"></div><div class="ppl" id="ppl"></div><div id="who"></div><div class="plates" id="plates"></div><div class="tiles" id="tiles"></div></div></div>'
      + '<div class="pn" id="ctlp"><h3>DEMO CONTROLS<span>demo clock</span></h3><div class="pb"><div class="ctl">'
      + '<button class="pri" data-c="hour"><b>+1 hour</b><small>Move the clock on</small></button><button data-c="nextDay"><b>Next day, 7am</b><small>24 hours pass: fines, reminders, renewals</small></button>'
      + '<button data-c="morning"><b>10:00 (paid hours)</b><small>Mon–Sat 7am–7pm</small></button><button data-c="evening"><b>19:20 (free)</b><small>Outside paid hours</small></button>'
      + '<button data-c="reset" style="grid-column:1/-1"><b>Reset the demo</b><small>Back to the sample drivers, attendants and Demo Bank; clears the use-case ticks</small></button></div></div></div>'
      + '<div class="pn"><h3>CHARGING LEDGER<span id="lgn"></span></h3><div class="lg" id="lg"></div></div>'
      + '<div class="pn" id="scp"><h3>USE CASES<span id="scn"></span></h3><div class="sc" id="sc"></div></div>'
      + '</div></div>';
    var cs = document.querySelectorAll(".sc0"); for(var i = 0; i < cs.length; i++) cs[i].textContent = (B && B.shortcode) || "7275";
    var c2 = document.querySelectorAll(".code0"); for(var j = 0; j < c2.length; j++) c2[j].textContent = code();
    bind();
  }

  /* ---------------- painting ---------------- */
  function paintTop(){
    if(!B || !$("pills")) return;
    $("pills").innerHTML = '<span class="pill y">' + e(["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][B.dow] + " " + B.date + " · " + B.time) + '</span> '
      + '<span class="pill ' + (B.paidHours ? "g" : "") + '">' + (B.paidHours ? "Paid hours" : "Free now") + '</span> '
      + '<span class="pill ' + (B.payments ? "g" : "r") + '">' + (B.payments ? "Payments: simulated wallets" : "Mobile money off") + '</span> '
      + '<span class="pill">' + e(B.mode) + ' · ' + e(B.version || "") + '</span>';
    var cl = document.querySelectorAll(".clk"); for(var i = 0; i < cl.length; i++) cl[i].textContent = B.time;
    $("clockline").textContent = "D " + money(B.daily) + " a day · D " + money(B.monthly) + " a month · fine D " + money(B.fine);
    $("ctlp").style.display = B.demoControls ? "" : "none";
    $("dnet").textContent = "SUNU Park · " + (NUM ? phone(NUM) : "no number loaded");
    paintDial();
    var ppl = B.people || [];
    $("ppl").innerHTML = ppl.map(function(p){ return '<button type="button" class="' + (p.role === "officer" ? "o" : p.role === "org" ? "g" : "") + (p.num === NUM ? " on" : "") + '" data-n="' + p.num + '" title="' + e(p.note) + '"><i></i>' + e(p.name) + '</button>'; }).join("");
    $("whohint").textContent = ppl.length ? "Pick someone from the demo story, or load any 7-digit number (a new number is a new driver)." : "Load any 7-digit number. A number SUNU Park does not know yet is a new driver; attendants and organisation contacts are recognised.";
    paintScen();
  }
  function paintDial(){ var d = $("dnum"); if(!d) return; d.textContent = U.dial || "Dial " + code(); d.className = "num" + (U.dial ? "" : " ph"); }
  function paintWho(){
    var I = INFO;
    if(!I){ $("who").innerHTML = ""; $("plates").innerHTML = ""; $("tiles").innerHTML = ""; return; }
    var cls = I.role === "officer" ? "o" : I.role === "org" ? "g" : I.role === "new" ? "n" : "";
    $("who").innerHTML = '<div class="who"><div><b>' + phone(I.num) + '</b><small>' + e(I.name) + ' · ' + e(I.label) + (I.terms ? " · terms v" + e(I.terms.v) + " accepted" : "") + '</small></div><span class="badge ' + cls + '">' + ({ officer: "Attendant", org: "Organisation", "new": "New number", driver: "Driver" })[I.role] + '</span></div>';
    $("plates").innerHTML = (I.plates || []).map(function(p){
      var w = p.warnings || [], owed = w.reduce(function(s, x){ return s + x.owed; }, 0);
      return '<div class="pc"><span class="p">' + e(p.plate) + '</span><span class="s">' + (w.length ? '<b>Warning ' + e(w.map(function(x){ return x.id; }).join(", ")) + ': D ' + money(owed) + '</b> · ' + (w.some(function(x){ return x.late; }) ? "with the fine" : "by " + e(w[0].due)) + "<br>" : "")
        + ({ UNPAID: "No pass today", DAILY: "Paid till 7pm", MONTHLY: "Monthly pass to " + e(p.until), ORG: "Covered by " + e(p.until) })[p.st] + (p.offences > 1 ? " · repeat offender (" + p.offences + ")" : p.offences === 1 ? " · 1 warning on record" : "") + '</span>'
        + (w.length ? '<span class="st W">Warning</span>' : '<span class="st ' + p.st + '">' + ({ UNPAID: "Unpaid", DAILY: "Daily", MONTHLY: "Monthly", ORG: "Fleet" })[p.st] + '</span>') + '</div>';
    }).join("");
    var wal = I.wallet || {};
    $("tiles").innerHTML = I.role === "officer" ? "" : ["Wave", "Afrimoney", "APS", "QMoney"].map(function(k){ return '<div class="tile"><small>' + k + '</small><b>D ' + money(wal[k] == null ? 5000 : wal[k]) + '</b></div>'; }).join("");
    var rc = I.receipts || [];
    $("lgn").textContent = rc.length + (rc.length === 1 ? " event" : " events");
    $("lg").innerHTML = rc.length ? rc.map(function(r){ return '<div><code>' + e(r.t) + '</code><span>' + ({ daily: "Daily pass", monthly: "Monthly pass", fine: "Warning paid" })[r.kind] + ' — ' + e(r.plate) + ' <small>' + e(r.prov) + ' · ' + e(r.ticket) + '</small></span><em>−D ' + money(r.amount) + '</em></div>'; }).join("")
      : '<div style="grid-template-columns:1fr"><span class="hint">No charges on this number yet.</span></div>';
  }
  function paintThread(force){
    var I = INFO, list = I ? I.sms : [], sig = (I ? I.num : "") + ":" + list.length + ":" + (list.length ? JSON.stringify(list[list.length - 1]) : "");
    if(!force && sig === lastSig) return;
    lastSig = sig;
    var th = $("th"), atEnd = th.scrollHeight - th.scrollTop - th.clientHeight < 60;
    if(!I){ th.innerHTML = '<div class="empty">Load a number on the right to start.</div>'; }
    else if(!list.length){ th.innerHTML = '<div class="empty">No messages yet with ' + e((B && B.shortcode) || "7275") + '. Try HELP, a plate like BJL1234' + (I.role === "officer" ? ", or START" : "") + '.</div>'; }
    else th.innerHTML = list.map(function(m){
      if(m.d) return '<div class="dd">' + e(m.d) + ' · ' + phone(I.num) + '</div>';
      if(m.o != null) return '<div class="row o"><span class="tm">' + e(m.t) + '</span><div class="bb">' + e(m.o) + '</div></div>';
      return '<div class="row i"><div class="bb">' + (m.tag ? '<span class="tg">' + e(m.tag) + '</span><br>' : "") + e(m.i) + '</div><span class="tm">' + e(m.t) + '</span></div>';
    }).join("");
    if(atEnd || force) th.scrollTop = th.scrollHeight;
    paintQuick();
  }
  function paintQuick(){
    var I = INFO, q = [];
    if(I){
      var mine = (I.plates || []).map(function(p){ return p.plate; });
      if(I.role === "officer") q = ["START", "BJL8080", "BJL7777", "BJL9191", "W BJL8080", "W BJL9191", "END", "HELP"];
      else q = mine.slice(0, 3).concat(mine.length ? ["M"] : ["BJL1234"]).concat(["1", "2", "3", "4", "HELP", "TERMS"]);
    }
    $("qr").innerHTML = q.map(function(x){ return '<button type="button" data-q="' + e(x) + '">' + e(x) + '</button>'; }).join("");
  }
  function paintScen(){
    var demo = B && B.demo, list = SC.filter(function(s){ return !s.demo || (B && B.demoControls); });
    $("scp").style.display = demo ? "" : "none";
    if(!demo) return;
    $("scn").textContent = list.filter(function(s){ return DONE[s.id]; }).length + " / " + list.length;
    $("sc").innerHTML = list.map(function(s){ var on = RUN === s.id;
      return '<div class="' + (on ? "busy" : DONE[s.id] ? "done" : "") + '"><code>' + s.id + '</code><span><b>' + e(s.t) + '</b><small>' + e(s.s) + '</small></span><button type="button" data-s="' + s.id + '"' + (RUN && !on ? " disabled" : "") + '>' + (on ? "Running…" : DONE[s.id] ? "✓ Run again" : "Run") + '</button></div>'; }).join("");
  }

  /* ---------------- data ---------------- */
  function bench(){ return api("GET", "/api/sim/bench").then(function(r){ if(r && r.ok){ B = r; paintTop(); } return r; }); }
  function info(){
    if(!NUM) return Promise.resolve(null);
    var n = NUM;
    return api("GET", "/api/sim/info?num=" + encodeURIComponent(n)).then(function(r){ if(n !== NUM) return; if(r && r.ok){ INFO = r; paintWho(); paintThread(); } return r; });
  }
  function load(n){
    n = String(n || "").replace(/\D/g, "").slice(-7);
    if(n.length !== 7){ toast("Enter a 7-digit Gambian number."); return Promise.resolve(); }
    NUM = n; INFO = null; lastSig = ""; try { localStorage.setItem("sunu.sim.num", n); } catch(x){}
    $("msisdn").value = n; closeUssd();
    paintTop(); paintThread(true);
    return info().then(function(){ paintThread(true); });
  }
  function sendSms(text){
    text = String(text || "").trim();
    if(!NUM) return Promise.resolve(toast("Load a number first."));
    if(!text) return Promise.resolve();
    var before = INFO ? INFO.sms.length : 0;
    $("typing").classList.add("on");
    return api("POST", "/api/sim/sms", { from: NUM, text: text }).then(function(r){
      if(r && r.err) toast(r.err);
      return info().then(function(){ return info(); });
    }).then(function(){ $("typing").classList.remove("on"); $("th").scrollTop = $("th").scrollHeight; return bench(); });
  }

  /* ---------------- USSD ---------------- */
  function dlg(html){ $("udlg").innerHTML = html; $("uov").classList.add("on"); var i = $("uin"); if(i) setTimeout(function(){ i.focus(); }, 30); }
  function closeUssd(){ U.path = null; U.busy = false; U.dial = ""; var o = $("uov"); if(o) o.classList.remove("on"); paintDial(); }
  function ussdStep(input){
    if(!NUM){ toast("Load a number first."); return Promise.resolve(); }
    var text = U.path === null ? "" : (U.path ? U.path + "*" : "") + input;
    U.busy = true;
    dlg('<div class="run"><span class="spin"></span>USSD code running…</div>');
    return api("POST", "/api/sim/ussd", { from: NUM, text: text }).then(function(r){
      U.busy = false;
      if(!r || r.err){ dlg('<div class="tx">' + e((r && r.err) || "Connection problem or invalid MMI code.") + '</div><div class="bt"><button type="button" data-u="ok">OK</button></div>'); U.path = null; return r; }
      U.path = text; U.end = r.end; U.screen = r.text;
      dlg('<div class="tx">' + e(r.text) + '</div>' + (r.end ? '<div class="bt"><button type="button" data-u="ok">OK</button></div>'
        : '<form id="uf"><input id="uin" autocomplete="off" inputmode="text"><div class="bt"><button type="button" data-u="cancel">Cancel</button><button>Send</button></div></form>'));
      if(r.end){ U.path = null; info(); bench(); }
      return r;
    });
  }
  function startUssd(){
    var d = U.dial || code();
    U.dial = d; paintDial();
    if(d.replace(/\s/g, "") !== code()){ dlg('<div class="tx">Connection problem or invalid MMI code.</div><div class="bt"><button type="button" data-u="ok">OK</button></div>'); return Promise.resolve(); }
    U.path = null;
    return ussdStep("");
  }

  /* ---------------- use cases ---------------- */
  function typeInto(text){
    var m = $("msg"); m.value = "";
    return text.split("").reduce(function(p, ch){ return p.then(function(){ m.value += ch; return wait(28); }); }, Promise.resolve()).then(function(){ m.value = ""; });
  }
  function runScen(id){
    var s = SC.filter(function(x){ return x.id === id; })[0];
    if(!s || RUN) return;
    RUN = id; paintScen();
    var p = load(s.num);
    s.steps.forEach(function(st){
      p = p.then(function(){ return wait(500); }).then(function(){
        if(st[0] === "as") return load(st[1]);
        if(st[0] === "clock") return api("POST", "/api/sim/clock", { what: st[1] }).then(function(r){ if(r && r.err) toast(r.err); return bench(); });
        if(st[0] === "sms") return typeInto(st[1]).then(function(){ return sendSms(st[1]); }).then(function(){ return wait(700); });
        if(st[0] === "ussd"){
          var q = Promise.resolve().then(function(){ U.dial = ""; var c = code(); return c.split("").reduce(function(pp, ch){ return pp.then(function(){ U.dial += ch; paintDial(); return wait(70); }); }, Promise.resolve()); })
            .then(function(){ return startUssd(); }).then(function(){ return wait(1100); });
          st[1].forEach(function(inp){ q = q.then(function(){ var i = $("uin"); if(!i) return; return inp.split("").reduce(function(pp, ch){ return pp.then(function(){ i.value += ch; return wait(60); }); }, Promise.resolve()).then(function(){ return wait(250); }).then(function(){ return ussdStep(inp); }).then(function(){ return wait(1300); }); }); });
          return q.then(function(){ return wait(900); }).then(closeUssd);
        }
      });
    });
    p.then(function(){ DONE[id] = 1; try { localStorage.setItem("sunu.sim.done", JSON.stringify(DONE)); } catch(x){} }).catch(function(){}).then(function(){ RUN = null; paintScen(); });
  }

  /* ---------------- events ---------------- */
  function bind(){
    $("ldf").addEventListener("submit", function(ev){ ev.preventDefault(); load($("msisdn").value); });
    $("cmp").addEventListener("submit", function(ev){ ev.preventDefault(); var t = $("msg").value; $("msg").value = ""; $("go").classList.remove("on"); sendSms(t); });
    $("msg").addEventListener("input", function(){ $("go").classList.toggle("on", !!this.value.trim()); });
    document.addEventListener("click", function(ev){
      var b = ev.target.closest("button"); if(!b) return;
      if(b.dataset.n) return load(b.dataset.n);
      if(b.dataset.q) return sendSms(b.dataset.q);
      if(b.dataset.k){ if(U.dial.length < 20){ U.dial += b.dataset.k; paintDial(); } return; }
      if(b.id === "bksp"){ U.dial = U.dial.slice(0, -1); return paintDial(); }
      if(b.id === "callb") return startUssd();
      if(b.dataset.u === "ok" || b.dataset.u === "cancel") return closeUssd();
      if(b.dataset.c){ if(b.dataset.c === "reset" && !confirm("Reset the whole demo for everyone using this server?")) return; return api("POST", "/api/sim/clock", { what: b.dataset.c }).then(function(r){ if(r && r.err) return toast(r.err); if(b.dataset.c === "reset"){ DONE = {}; try { localStorage.removeItem("sunu.sim.done"); } catch(x){} } toast("Done"); bench(); info(); }); }
      if(b.dataset.s) return runScen(b.dataset.s);
    });
    document.addEventListener("submit", function(ev){ if(ev.target.id !== "uf") return; ev.preventDefault(); var v = $("uin").value.trim(); if(v) ussdStep(v); });
    document.addEventListener("keydown", function(ev){
      if(ev.target.tagName === "INPUT" || $("uov").classList.contains("on")) return;
      if(/^[0-9*#]$/.test(ev.key) && document.activeElement === document.body){ U.dial += ev.key; paintDial(); }
    });
  }

  /* ---------------- start ---------------- */
  bench().then(function(r){
    if(!r || r.err || !r.ok){ root.innerHTML = '<div class="off"><b>Can’t reach the SUNU Park server</b>Check the address and try again.</div>'; return; }
    if(!r.simulator){ root.innerHTML = '<div class="off"><b>The SMS &amp; USSD simulator is switched off on this server</b>It is on by default on a demo server or while SMS are simulated. An administrator can switch it on with <code>sms.simulator.enabled=true</code> in config.properties (only on a test server: anyone with the address can use it).</div>'; return; }
    shell(); paintTop();
    if(!NUM && r.people && r.people.length) NUM = (r.people.filter(function(p){ return p.num === "7055501"; })[0] || r.people[0]).num;
    if(NUM) load(NUM); else paintThread(true);
    setInterval(function(){ if(!document.hidden) info(); }, 1500);
    setInterval(function(){ if(!document.hidden) bench(); }, 6000);
  });
})();
