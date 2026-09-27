/* ParkNa app UI kit: icons, illustrations, formatting and the shared sign-in screens (driver and officer apps). */
var UI = (function(){
  var P = {
    bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15Z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
    cal: '<rect x="4" y="5" width="16" height="15" rx="3.5"/><path d="M4 10h16M9 3v4M15 3v4"/>',
    receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z"/><path d="M9 8h6M9 12h6"/>',
    car: '<path d="M4.5 16v-3.6L6.8 7h10.4l2.3 5.4V16M4.5 16h15M6 16v2.5M18 16v2.5"/><circle cx="8.3" cy="12.8" r="1"/><circle cx="15.7" cy="12.8" r="1"/>',
    home: '<path d="M4 11.2 12 4.5l8 6.7V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19Z"/><path d="M9.5 20.5v-5h5v5"/>',
    chart: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8.5 15.5v-3M12 15.5v-7M15.5 15.5v-5"/>',
    user: '<circle cx="12" cy="8.2" r="3.7"/><path d="M4.8 20c1.2-3.7 3.9-5.6 7.2-5.6s6 1.9 7.2 5.6"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>', back: '<path d="M15 5l-7 7 7 7"/>', chevR: '<path d="m10 6 6 6-6 6"/>', chevD: '<path d="m6 9.5 6 6 6-6"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>', x: '<path d="M6 6l12 12M18 6 6 18"/>',
    pay: '<rect x="3.5" y="6" width="17" height="12" rx="3"/><path d="M3.5 10h17M7.5 14.5h3"/>',
    up: '<path d="M7 17 17 7M9 7h8v8"/>', down: '<path d="M17 7 7 17M15 17H7V9"/>',
    shield: '<path d="M12 3 5 6v5c0 4.6 3 8.3 7 10 4-1.7 7-5.4 7-10V6Z"/><path d="m9 12 2 2 4-4"/>',
    sms: '<path d="M4 5.5h16v10.5H9.5L5 20Z"/><path d="M8.5 10.5h7"/>',
    mega: '<path d="M4 10v4h3l8 4.5v-13L7 10Z"/><path d="M18 9.5a3.5 3.5 0 0 1 0 5"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8v.1"/>',
    more: '<circle cx="6" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18" cy="12" r="1.3"/>',
    menu: '<path d="M5 7h14M5 12h14M5 17h9"/>', pin: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.3"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>', lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
    out: '<path d="M14 5h4a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 18 19h-4"/><path d="M10 16l-4-4 4-4M6 12h9"/>',
    wifi: '<path d="M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0"/><path d="M12 19.5v.1"/>',
    scan: '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M4 12h16"/>',
    play: '<path d="M8 5.5v13l10.5-6.5Z"/>', stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2"/>',
    road: '<path d="M8 3 5 21M16 3l3 18M12 4v3M12 10.5v3M12 17v3"/>', help: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.4a2.5 2.5 0 0 1 4.8 1c0 1.7-2.4 2.1-2.4 3.6M12 17v.1"/>',
    doc: '<path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10.5A.5.5 0 0 1 6.5 20V4a.5.5 0 0 1 .5-.5Z"/><path d="M14 3.5V8h4M9.5 12h5M9.5 15.5h5"/>',
    trash: '<path d="M5 7h14M10 11v6M14 11v6M6.5 7l1 12.5h9L17.5 7M9.5 7V4.5h5V7"/>',
    star: '<path d="m12 4 2.3 4.8 5.2.7-3.8 3.6.9 5.2L12 15.8l-4.6 2.5.9-5.2-3.8-3.6 5.2-.7Z"/>'
  };
  function ic(n, s, w){ return '<svg width="'+(s||22)+'" height="'+(s||22)+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="'+(w||1.9)+'" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(P[n]||"")+'</svg>'; }

  /* Illustrations: soft shapes in the app's colours. */
  var ILL = {
    driver: '<svg viewBox="0 0 340 250" fill="none"><circle cx="170" cy="130" r="104" fill="#F1FBD2"/><circle cx="262" cy="56" r="22" fill="#D5F56E"/>'
      + '<rect x="222" y="58" width="10" height="150" rx="5" fill="#0B2540"/><rect x="196" y="36" width="62" height="62" rx="16" fill="#0B2540"/><path d="M216 82V52h14a10 10 0 0 1 0 20h-14" stroke="#D5F56E" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>'
      + '<path d="M58 176v-26l20-38h96l24 38v26Z" fill="#fff" stroke="#0B2540" stroke-width="5" stroke-linejoin="round"/><path d="M84 114h84l16 32H70Z" fill="#E8EEFD"/><rect x="50" y="150" width="156" height="36" rx="14" fill="#0B2540"/>'
      + '<circle cx="86" cy="190" r="17" fill="#0B2540"/><circle cx="86" cy="190" r="7" fill="#D5F56E"/><circle cx="172" cy="190" r="17" fill="#0B2540"/><circle cx="172" cy="190" r="7" fill="#D5F56E"/>'
      + '<rect x="92" y="157" width="72" height="18" rx="4" fill="#fff"/><text x="128" y="170" font-family="PlateMono,monospace" font-size="10" font-weight="700" fill="#0B2540" text-anchor="middle">BJL 1234</text>'
      + '<rect x="268" y="128" width="46" height="80" rx="11" fill="#fff" stroke="#0B2540" stroke-width="4"/><rect x="276" y="140" width="30" height="40" rx="5" fill="#D5F56E"/><path d="m283 160 5 5 10-11" stroke="#0B2540" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>'
      + '<path d="M30 214h280" stroke="#0B2540" stroke-width="4" stroke-linecap="round" stroke-dasharray="2 12"/></svg>',
    officer: '<svg viewBox="0 0 340 250" fill="none"><circle cx="170" cy="128" r="104" fill="#F1FBD2"/><circle cx="74" cy="62" r="18" fill="#D5F56E"/>'
      + '<rect x="104" y="50" width="132" height="168" rx="20" fill="#fff" stroke="#0B2540" stroke-width="5"/><rect x="140" y="38" width="60" height="26" rx="10" fill="#0B2540"/>'
      + '<rect x="126" y="86" width="88" height="30" rx="10" fill="#0B2540"/><text x="170" y="106" font-family="PlateMono,monospace" font-size="14" font-weight="700" fill="#fff" text-anchor="middle">BJL 1234</text>'
      + '<rect x="126" y="128" width="88" height="34" rx="17" fill="#D5F56E"/><text x="170" y="150" font-family="Jakarta,sans-serif" font-size="15" font-weight="800" fill="#0B2540" text-anchor="middle">PAID</text>'
      + '<path d="M130 182h80M130 198h52" stroke="#E3E7EC" stroke-width="7" stroke-linecap="round"/>'
      + '<path d="M252 118 280 106v26c0 20-12 34-28 40-16-6-28-20-28-40v-26Z" fill="#0B2540"/><path d="m241 138 8 8 15-16" stroke="#D5F56E" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    Event: '<svg viewBox="0 0 104 104" fill="none"><circle cx="58" cy="56" r="40" fill="#fff" opacity=".7"/><rect x="18" y="26" width="64" height="58" rx="14" fill="#fff" stroke="#0B2540" stroke-width="4"/><path d="M18 44h64" stroke="#0B2540" stroke-width="4"/><path d="M34 18v14M66 18v14" stroke="#0B2540" stroke-width="5" stroke-linecap="round"/><rect x="31" y="54" width="14" height="12" rx="4" fill="#D5F56E"/><rect x="55" y="54" width="14" height="12" rx="4" fill="#E3E7EC"/><path d="m82 14 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" fill="#D5F56E" stroke="#0B2540" stroke-width="2"/></svg>',
    Announcement: '<svg viewBox="0 0 104 104" fill="none"><circle cx="56" cy="54" r="40" fill="#fff" opacity=".7"/><path d="M20 44v18h12l34 18V26L32 44Z" fill="#fff" stroke="#0B2540" stroke-width="4" stroke-linejoin="round"/><rect x="20" y="44" width="12" height="18" fill="#D5F56E"/><path d="M33 62l5 20h10l-4-18" stroke="#0B2540" stroke-width="4" stroke-linejoin="round"/><path d="M76 42c6 3 6 19 0 22M84 34c11 7 11 31 0 38" stroke="#0B2540" stroke-width="4" stroke-linecap="round"/></svg>',
    Notice: '<svg viewBox="0 0 104 104" fill="none"><circle cx="54" cy="56" r="40" fill="#fff" opacity=".7"/><path d="M52 16 26 82h52Z" fill="#fff" stroke="#0B2540" stroke-width="4" stroke-linejoin="round"/><path d="M38 52h28M32 68h40" stroke="#E0473A" stroke-width="8"/><rect x="18" y="80" width="68" height="10" rx="5" fill="#0B2540"/></svg>'
  };

  function initials(name){ var p = String(name || "?").trim().split(/\s+/); return ((p[0] || "?")[0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase(); }
  function phone(num){ var n = String(num || ""); return "+220 " + n.slice(0, 3) + " " + n.slice(3); }
  function money(n){ return gmd(n) + " GMD"; }
  function greet(min){ return min < 720 ? "Good morning" : min < 1020 ? "Good afternoon" : "Good evening"; }

  /* ---------- the shared sign-in flow: welcome, phone number, code (and name for new drivers) ---------- */
  function SignIn(o){
    /* o: { as, app, title, lead, ill, needName(): bool, onDone(), render() } */
    var S = { step: "welcome", phone: "", code: "", name: "", err: "", busy: false, sentAt: 0, test: null };
    function wrap(inner){ return '<div class="auth">'+inner+'</div>'; }
    function brand(){ return '<div class="brand"><img src="assets/img/crest.png" alt="Banjul City Council crest"><span>'+o.app+'<small>Banjul City Council</small></span></div>'; }
    function foot(){ return '<div class="foot"><img src="assets/img/innovii-navy.png" alt="INNOVII">'+o.app+' · v'+o.version+'</div>'; }
    function demoList(){
      if(!(PN.info && PN.info.demo) || !o.demo) return "";
      return '<div class="fld">Demo accounts<div class="demo">'+o.demo().map(function(d){ return '<button data-si="demo" data-v="'+d.num+'">'+esc(d.name)+'<small>'+esc(d.note)+'</small></button>'; }).join("")+'</div></div>';
    }
    var view = {
      welcome: function(){
        return wrap(brand()+'<div class="hero-ill">'+o.ill+'</div><h2>'+o.title+'</h2><p class="lead">'+o.lead+'</p><div class="grow"></div>'
          + '<button class="btn" data-si="start">Get started '+ic("arrow", 20, 2.2)+'</button>'+foot());
      },
      phone: function(){
        return wrap('<button class="back" data-si="to" data-v="welcome" aria-label="Back">'+ic("back", 22, 2.2)+'</button>'
          + '<h2>Your mobile<br><em>number</em></h2><p class="lead">'+(o.as === "officer" ? "Use the number registered for you in the ParkNa back office." : "We’ll send you a 6-digit code by SMS to sign in.")+'</p>'
          + '<label class="fld">Mobile number<div class="phone"><span class="cc">+220</span><input class="inp num" id="siPhone" inputmode="numeric" autocomplete="tel" placeholder="701 2345" value="'+esc(S.phone)+'"></div></label>'
          + (S.err ? '<div class="err">'+esc(S.err)+'</div>' : "")
          + '<button class="btn" data-si="send"'+(S.busy ? " disabled" : "")+'>'+(S.busy ? "Sending…" : "Send code")+'</button>'+demoList()+'<div class="grow"></div>'+foot());
      },
      code: function(){
        var left = Math.max(0, 30 - Math.floor((Date.now() - S.sentAt) / 1000));
        var boxes = ""; for(var i = 0; i < 6; i++) boxes += '<span class="'+(i === S.code.length ? "on" : "")+'">'+(S.code[i] || "")+'</span>';
        return wrap('<button class="back" data-si="to" data-v="phone" aria-label="Back">'+ic("back", 22, 2.2)+'</button>'
          + '<h2>Enter the<br><em>code</em></h2><p class="lead">Sent by SMS to <b>'+phone(S.phone)+'</b>. It expires in 5 minutes.</p>'
          + (S.test ? '<div class="testcode">Test server: SMS are not sent yet. Your code is <b>'+S.test+'</b>.</div>' : "")
          + '<label data-si="focus"><div class="otp">'+boxes+'</div><input class="otpin" id="siCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" value="'+esc(S.code)+'"></label>'
          + (S.err ? '<div class="err">'+esc(S.err)+'</div>' : "")
          + '<button class="btn" data-si="verify"'+(S.busy || S.code.length !== 6 ? " disabled" : "")+'>'+(S.busy ? "Checking…" : "Sign in")+'</button>'
          + (left > 0 ? '<p class="lead" style="text-align:center;font-size:14px">Resend the code in '+left+' s</p>' : '<button class="lnk" data-si="resend" style="align-self:center">Resend the code</button>')
          + '<div class="grow"></div>'+foot());
      },
      name: function(){
        return wrap(brand()+'<h2>What’s your<br><em>name?</em></h2><p class="lead">So receipts and messages greet you properly. Only you and ParkNa staff see it.</p>'
          + '<label class="fld">Your name<input class="inp" id="siName" autocomplete="name" placeholder="e.g. Fatou Jallow" value="'+esc(S.name)+'"></label>'
          + (S.err ? '<div class="err">'+esc(S.err)+'</div>' : "")
          + '<button class="btn" data-si="name"'+(S.busy ? " disabled" : "")+'>Continue '+ic("arrow", 20, 2.2)+'</button><div class="grow"></div>'+foot());
      }
    };
    function send(){
      S.phone = (document.getElementById("siPhone") || {}).value || S.phone;
      S.busy = true; S.err = ""; o.render();
      PN.requestCode(S.phone).then(function(r){
        S.busy = false;
        if(r.err){ S.err = r.err; return o.render(); }
        S.step = "code"; S.code = ""; S.sentAt = Date.now(); S.test = r.code || null;
        if(r.code) S.code = r.code;
        o.render(); tick(); focusCode();
      });
    }
    function tick(){ clearTimeout(tick.t); if(S.step === "code" && Date.now() - S.sentAt < 31000){ tick.t = setTimeout(function(){ if(S.step === "code" && !document.activeElement.matches("input:not(.otpin)")) o.render(); tick(); }, 1000); } }
    function focusCode(){ setTimeout(function(){ var c = document.getElementById("siCode"); if(c) c.focus(); }, 60); }
    function verify(){
      S.busy = true; S.err = ""; o.render();
      PN.verifyCode(S.phone, S.code).then(function(r){
        S.busy = false;
        if(r.err){ S.err = r.err; S.code = ""; o.render(); return focusCode(); }
        S.step = "wait"; S.code = ""; S.test = null;
        o.onDone();
      });
    }
    return {
      state: S,
      view: function(){ return view[S.step] ? view[S.step]() : wrap('<div class="grow"></div><div class="spin" style="align-self:center"></div><div class="grow"></div>'); },
      askName: function(){ S.step = "name"; S.err = ""; S.busy = false; },
      reset: function(){ S.step = "welcome"; S.phone = ""; S.code = ""; S.err = ""; S.busy = false; S.test = null; },
      click: function(a, v){
        if(a === "start"){ S.step = "phone"; S.err = ""; o.render(); setTimeout(function(){ var p = document.getElementById("siPhone"); if(p) p.focus(); }, 60); return true; }
        if(a === "to"){ S.step = v; S.err = ""; o.render(); return true; }
        if(a === "send") { send(); return true; }
        if(a === "resend"){ send(); return true; }
        if(a === "demo"){ S.phone = v; send(); return true; }
        if(a === "focus"){ focusCode(); return true; }
        if(a === "verify"){ if(S.code.length === 6) verify(); return true; }
        if(a === "name"){
          S.name = (document.getElementById("siName") || {}).value || S.name;
          if(!S.name.trim()){ S.err = "Enter your name."; return o.render(); }
          S.busy = true; S.err = ""; o.render();
          PN.act({ type: "driver.login", name: S.name.trim() }).then(function(r){ S.busy = false; if(r.err){ S.err = r.err; return o.render(); } S.step = "wait"; o.onDone(); });
          return true;
        }
        return false;
      },
      input: function(t){
        if(t.id === "siPhone"){ S.phone = t.value; return true; }
        if(t.id === "siName"){ S.name = t.value; return true; }
        if(t.id === "siCode"){ S.code = t.value.replace(/\D/g, "").slice(0, 6); S.err = ""; o.render(); focusCode(); if(S.code.length === 6) verify(); return true; }
        return false;
      },
      enter: function(t){
        if(t.id === "siPhone"){ send(); return true; }
        if(t.id === "siName"){ this.click("name"); return true; }
        return false;
      }
    };
  }

  return { ic: ic, ILL: ILL, initials: initials, phone: phone, money: money, greet: greet, SignIn: SignIn };
})();
