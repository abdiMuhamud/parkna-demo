/* SUNU Park app UI kit (driver and officer apps), after "SUNU Park Final Designs": icons, formatting and the shared
   sign-in flow: onboarding (driver), log in, sign up (driver), one-time password, name. */
var UI = (function(){
  var P = {
    bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15Z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', plusc: '<circle cx="12" cy="12" r="8.5"/><path d="M12 8v8M8 12h8"/>',
    cal: '<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 10h16M8.5 3v4M15.5 3v4M8 14h4"/>',
    receipt: '<path d="M6.5 3.5h11v17l-2.2-1.4-2.1 1.4-2.2-1.4-2.2 1.4-2.3-1.4Z"/><path d="M9.5 8h5M9.5 11.5h5M9.5 15h3"/>',
    doc: '<rect x="5.5" y="3.5" width="13" height="17" rx="2.5"/><path d="M9 8.5h6M9 12h6M9 15.5h4"/>',
    car: '<path d="M5.5 11 7 7.3A2 2 0 0 1 8.9 6h6.2a2 2 0 0 1 1.9 1.3L18.5 11"/><rect x="3.5" y="11" width="17" height="6.5" rx="2.2"/><path d="M6 17.5v2M18 17.5v2M3.5 13.5H2M22 13.5h-1.5"/><circle cx="7.6" cy="14.2" r=".95" fill="currentColor"/><circle cx="16.4" cy="14.2" r=".95" fill="currentColor"/>',
    home: '<path d="M4 11 12 4.5l8 6.5v8.5a1.5 1.5 0 0 1-1.5 1.5H15v-5.5H9V21H5.5A1.5 1.5 0 0 1 4 19.5Z"/>',
    homef: '<path d="M4 11 12 4.5l8 6.5v8.5a1.5 1.5 0 0 1-1.5 1.5H15v-5.5H9V21H5.5A1.5 1.5 0 0 1 4 19.5Z" fill="currentColor"/>',
    user: '<circle cx="12" cy="8" r="3.8"/><path d="M4.5 20c1.1-3.7 4-5.6 7.5-5.6s6.4 1.9 7.5 5.6"/>',
    people: '<circle cx="12" cy="8" r="3" fill="currentColor" stroke="none"/><circle cx="5.8" cy="9.6" r="2.3" fill="currentColor" stroke="none"/><circle cx="18.2" cy="9.6" r="2.3" fill="currentColor" stroke="none"/><path d="M6.8 18.5c.4-3 2.6-4.8 5.2-4.8s4.8 1.8 5.2 4.8Z" fill="currentColor" stroke="none"/><path d="M1.8 17.8c.3-2.3 1.8-3.6 3.9-3.6 1 0 1.8.3 2.4.8-.7.8-1.2 1.8-1.4 2.8ZM22.2 17.8c-.3-2.3-1.8-3.6-3.9-3.6-1 0-1.8.3-2.4.8.7.8 1.2 1.8 1.4 2.8Z" fill="currentColor" stroke="none"/>',
    bank: '<path d="M3.5 9.5 12 4l8.5 5.5Z" fill="currentColor"/><path d="M4.5 20h15M5 17.5h14M6.5 11v6.5M10 11v6.5M14 11v6.5M17.5 11v6.5" stroke-width="2.2"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>', back: '<path d="M20 12H5M11 5l-7 7 7 7"/>', chevR: '<path d="m10 6 6 6-6 6"/>', chevD: '<path d="m6 9.5 6 6 6-6"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>', x: '<path d="M6 6l12 12M18 6 6 18"/>',
    pay: '<rect x="3.5" y="6" width="17" height="12" rx="2.5"/><path d="M3.5 10h17M7.5 14.5h3"/>',
    up: '<path d="M7 17 17 7M9 7h8v8"/>',
    shield: '<path d="M12 3.2 5.5 6v5c0 4.4 2.8 8 6.5 9.6 3.7-1.6 6.5-5.2 6.5-9.6V6Z"/><path d="m9 12 2.1 2.1L15.2 10"/>',
    bolt: '<path d="M13.5 2.5 5 13.5h6l-1 8 8.5-11h-6Z" fill="currentColor" stroke-linejoin="round"/>',
    tag: '<path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1.5 1.5 0 0 1 0 2.1l-6.1 6.1a1.5 1.5 0 0 1-2.1 0Z"/><circle cx="8" cy="8" r="1.6"/>',
    grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8"/>',
    phone: '<path d="M6.5 3.5h3l1.5 4-2 1.3a10.5 10.5 0 0 0 6.2 6.2l1.3-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2Z"/>',
    sms: '<path d="M4 5.5h16v10.5H9.5L5 20Z"/><path d="M8.5 10.5h7"/>',
    mega: '<path d="M4 10v4h3l8 4.5v-13L7 10Z"/><path d="M18 9.5a3.5 3.5 0 0 1 0 5"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8v.1"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>', lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
    out: '<path d="M14 5h4a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 18 19h-4"/><path d="M10 16l-4-4 4-4M6 12h9"/>',
    wifi: '<path d="M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0"/><path d="M12 19.5v.1"/>',
    scan: '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M4 12h16"/>',
    play: '<path d="M8 5.5v13l10.5-6.5Z"/>', stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2"/>',
    pin: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.3"/>',
    help: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.4a2.5 2.5 0 0 1 4.8 1c0 1.7-2.4 2.1-2.4 3.6M12 17v.1"/>',
    trash: '<path d="M5 7h14M10 11v6M14 11v6M6.5 7l1 12.5h9L17.5 7M9.5 7V4.5h5V7"/>',
    chart: '<rect x="5.5" y="3.5" width="13" height="17" rx="2.5"/><path d="M9 8.5h6M9 12h6M9 15.5h4"/>'
  };
  function ic(n, s, w){ return '<svg width="'+(s||22)+'" height="'+(s||22)+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="'+(w||1.9)+'" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(P[n]||"")+'</svg>'; }
  /* The Gambia: red, white, blue, white, green */
  var FLAG = '<svg class="flag" viewBox="0 0 30 20" aria-hidden="true"><rect width="30" height="20" fill="#3A7728"/><rect width="30" height="13" fill="#fff"/><rect width="30" height="6.3" fill="#CE1126"/><rect y="7.3" width="30" height="5.4" fill="#0C1C8C"/></svg>';

  function initials(name){ var p = String(name || "?").trim().split(/\s+/); return ((p[0] || "?")[0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase(); }
  function phone(num){ var n = String(num || ""); return "+220 " + n.slice(0, 3) + " " + n.slice(3); }
  function money(n){ return gmd(n) + " GMD"; }
  function greet(min){ return min < 720 ? "Good morning" : min < 1020 ? "Good afternoon" : "Good evening"; }
  function mmss(s){ s = Math.max(0, s); return pad(Math.floor(s / 60)) + ":" + pad(s % 60); }
  function crest(){ return '<span class="crest"><img src="assets/img/crest.png" alt="Banjul City Council crest"></span>'; }
  function bname(){ return '<span class="bname"><small>BANJUL CITY COUNCIL</small><b>SUNU Park</b></span>'; }

  /* ---------- the shared sign-in flow ---------- */
  function SignIn(o){
    /* o: { as, onboarding, signup, demo(), render(), onDone(), privacy() } */
    var driver = o.as === "driver";
    var S = { step: driver && PN.ls("parkna.onboarded") !== "1" ? "onb" : "login", slide: 0, from: "login", phone: "", code: "", name: "", plate: "", agree: true, err: "", busy: false, sentAt: 0, test: null };
    function privacy(){ return (PN.server || "") + "/privacy.html"; }
    function terms(){ return (PN.server || "") + "/terms.html"; }
    function head(back){ return '<div class="ahead">'+(back ? '<button class="back" data-si="to" data-v="'+back+'" aria-label="Back">'+ic("back", 26, 2.2)+'</button>' : "")+crest()+bname()+'</div>'; }
    function title(icon, eyebrow, h){ return '<div class="atitle"><span class="i">'+ic(icon, 24, 2)+'</span><div><div class="eyebrow">'+eyebrow+'</div><h1>'+h+'</h1></div></div>'; }
    function arrowBtn(si, label, off){ return '<button class="btn" data-si="'+si+'"'+(off ? " disabled" : "")+'>'+label+'<span class="ar">'+ic("arrow", 20, 2.3)+'</span></button>'; }
    function phoneBox(icon){
      return '<div class="box"><span class="cc">'+FLAG+'+220 '+ic("chevD", 18, 2.3)+'</span>'+(icon ? '<span class="lead">'+ic("phone", 21, 1.9)+'</span>' : "")
        + '<input id="siPhone" inputmode="numeric" autocomplete="tel" placeholder="XXX XXXX" value="'+esc(S.phone)+'"'+(icon ? "" : ' style="padding-left:16px"')+'></div>';
    }
    function err(){ return S.err ? '<div class="err">'+esc(S.err)+'</div>' : ""; }
    function paysup(){ return driver ? '<div class="paysup"><b>Payments supported</b><img src="assets/img/art/payments-strip.webp" alt="Wave, Afrimoney, QMoney, APS Wallet"></div>' : ""; }
    function secure(){ var v = window.PARKNA_CONFIG && window.PARKNA_CONFIG.version; return '<div class="secure">A secure service by Banjul City Council'+(v ? ' · v'+esc(v) : "")+'</div>'; }
    function demoList(){
      if(!(PN.info && PN.info.demo) || !o.demo) return "";
      return '<div class="fld" style="font-size:13px">Demo accounts<div class="demo">'+o.demo().map(function(d){ return '<button data-si="demo" data-v="'+d.num+'">'+esc(d.name)+'<small>'+esc(d.note)+'</small></button>'; }).join("")+'</div></div>';
    }
    function feat(icon, label, y){ return '<div class="feat"><span class="i'+(y ? " y" : "")+'">'+ic(icon, 22, 2)+'</span>'+label+'</div>'; }
    var SLIDES = [
      { img: 1, step: "EASY PARKING", h: "Park smarter in Banjul", lead: "Find, pay and manage parking from your phone—without cash or queues.",
        body: '<div class="feats">'+feat("bolt", "Faster parking")+feat("tag", "Clear prices", true)+feat("receipt", "Digital receipts")+'</div>' },
      { img: 2, step: "FLEXIBLE PAYMENTS", h: "Pay the way you prefer", lead: "Use Wave, Afrimoney, QMoney or APS for daily and monthly parking.",
        body: '<div class="feats">'+feat("grid", "Four trusted options").replace('class="i"', 'class="i" style="color:var(--navy)"')+feat("shield", "Secure confirmation", true)+feat("receipt", "Instant digital receipt").replace('class="i"', 'class="i" style="color:var(--navy)"')+'</div>' },
      { img: 3, step: "A BETTER BANJUL", h: "Better parking. Stronger city.", lead: "Every digital parking payment helps make Banjul easier to move through, fairer to park in and better able to serve its people.",
        body: '<div class="gains"><div class="gain"><div class="gh"><span class="i">'+ic("people", 24)+'</span>People gain</div><ul>'
          + ["Less waiting", "More payment choice", "Proof of payment"].map(function(t){ return '<li><i>'+ic("check", 13, 3)+'</i>'+t+'</li>'; }).join("")+'</ul></div>'
          + '<div class="gain y"><div class="gh"><span class="i y">'+ic("bank", 22)+'</span>The city gains</div><ul>'
          + ["Transparent revenue", "Better planning", "Stronger services"].map(function(t){ return '<li><i>'+ic("check", 13, 3)+'</i>'+t+'</li>'; }).join("")+'</ul></div></div>' }
    ];
    var view = {
      onb: function(){
        var k = S.slide, s = SLIDES[k], last = k === SLIDES.length - 1;
        return '<div class="onb"><div class="hdr">'+crest()+bname()+'<button class="skip" data-si="skip">Skip</button></div>'
          + '<img class="ill" src="assets/img/art/onboarding-'+s.img+'.webp" alt="">'
          + '<div class="body"><div class="step"><em>0'+(k + 1)+' —</em> '+s.step+'</div><h1>'+s.h+'</h1><p class="lead">'+s.lead+'</p>'+s.body+'</div>'
          + '<div class="odots">'+SLIDES.map(function(_, i){ return '<i class="'+(i === k ? "on" : "")+'"></i>'; }).join("")+'</div>'
          + '<div class="acts">'+arrowBtn(last ? "skip" : "next", last ? "Get started" : "Next")
          + (k > 0 ? '<button class="lnk2" data-si="prev" style="padding:6px 12px">Back</button>' : "")
          + '<div class="service">A service by Banjul City Council</div></div></div>';
      },
      login: function(){
        return '<div class="auth">'+head(driver ? "onb" : "")+'<div class="aform">'
          + title("shield", driver ? "SECURE ACCESS" : "ATTENDANT ACCESS", "Welcome back")
          + '<p class="alead">'+(driver ? "Enter your registered phone number and we’ll send you a one-time password."
                                       : "Enter the phone number your supervisor registered for you and we’ll send you a one-time password.")+'</p>'
          + '<label class="fld">Phone number'+phoneBox(false)+'</label>'
          + '<div class="hint"><span class="i">'+ic("shield", 17, 2)+'</span>Your OTP expires after 5 minutes.</div>'
          + err() + arrowBtn("send", S.busy ? "Sending…" : "Send OTP", S.busy)
          + (driver ? '<div class="or">or</div><button class="btn ghost" data-si="to" data-v="signup">Create a new account</button>' : "")
          + '<p style="font-size:13.5px;color:var(--mute);text-align:center">By continuing, you agree to SUNU Park’s <a class="lnk" style="font-weight:500" href="'+esc(terms())+'" target="_blank" rel="noopener">Terms</a> and <a class="lnk" style="font-weight:500" href="'+esc(privacy())+'" target="_blank" rel="noopener">Privacy Policy</a>.</p>'
          + demoList() + paysup() + secure() + '</div></div>';
      },
      signup: function(){
        return '<div class="auth">'+head("login")+'<div class="aform">'
          + title("user", "NEW ACCOUNT", "Join SUNU Park")
          + '<p class="alead">Create your account to pay for parking, manage your plates and keep digital receipts.</p>'
          + '<label class="fld">Full name<div class="box"><span class="lead">'+ic("user", 22, 1.9)+'</span><input id="siName" autocomplete="name" placeholder="Enter your full name" value="'+esc(S.name)+'"></div></label>'
          + '<label class="fld">Phone number'+phoneBox(true)+'</label>'
          + '<label class="fld">Plate number<div class="box"><span class="lead">'+ic("car", 22, 1.9)+'</span><input id="siPlate" autocapitalize="characters" autocomplete="off" placeholder="e.g. BJL 2222" value="'+esc(S.plate)+'"></div></label>'
          + '<div class="hint"><span class="i">'+ic("shield", 17, 2)+'</span>We’ll send an OTP to verify your phone number.</div>'
          + '<label class="chk"><input type="checkbox" id="siAgree"'+(S.agree ? " checked" : "")+'><span>I agree to the <a href="'+esc(terms())+'" target="_blank" rel="noopener">Terms</a> and <a href="'+esc(privacy())+'" target="_blank" rel="noopener">Privacy Policy</a>.</span></label>'
          + err() + arrowBtn("send", S.busy ? "Sending…" : "Continue to OTP", S.busy)
          + '<div class="or" style="margin-top:4px">Already registered? <button class="lnk" style="font-weight:500;margin-left:-6px" data-si="to" data-v="login">Log in</button></div>'
          + paysup() + secure() + '</div></div>';
      },
      code: function(){
        var resend = Math.max(0, 30 - Math.floor((Date.now() - S.sentAt) / 1000)), expires = Math.max(0, 300 - Math.floor((Date.now() - S.sentAt) / 1000));
        var boxes = ""; for(var i = 0; i < 6; i++) boxes += '<span class="'+(i === S.code.length ? "on" : "")+'">'+(S.code[i] || "")+'</span>';
        return '<div class="auth">'+head(S.from)+'<div class="aform">'
          + title("shield", "PHONE VERIFICATION", "Enter your OTP")
          + '<p class="alead">We sent a 6-digit code to '+phone(S.phone.replace(/\D/g, "").slice(-7))+'.</p>'
          + '<button class="pill" data-si="to" data-v="'+S.from+'">Change number</button>'
          + (S.test ? '<div class="testcode">Test server: SMS are not sent. Your code is <b>'+S.test+'</b>.</div>' : "")
          + '<label data-si="focus"><div class="otp">'+boxes+'</div><input class="otpin" id="siCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" value="'+esc(S.code)+'"></label>'
          + '<div class="hint"><span class="i">'+ic("clock", 17, 2)+'</span>'+(expires ? "Code expires in "+mmss(expires) : "The code has expired. Ask for a new one.")+'</div>'
          + err() + arrowBtn("verify", S.busy ? "Checking…" : "Verify and continue", S.busy || S.code.length !== 6)
          + '<div class="or">Didn’t receive the code?</div>'
          + (resend > 0 ? '<p class="lnk" style="text-align:center;font-weight:500;font-size:15.5px">Resend OTP in '+mmss(resend)+'</p>' : '<button class="lnk" style="font-weight:500;font-size:15.5px;align-self:center" data-si="resend">Resend OTP</button>')
          + '<div class="note" style="background:#EEF4FA;align-items:center;padding:14px 16px;gap:14px"><span class="hint"><span class="i" style="width:40px;height:40px">'+ic("shield", 20, 2)+'</span></span><span style="font-size:15px;color:var(--mute)">Never share your OTP with anyone.</span></div>'
          + secure() + '</div></div>';
      },
      name: function(){
        return '<div class="auth">'+head("")+'<div class="aform">'
          + title("user", "NEW ACCOUNT", "Your name")
          + '<p class="alead">So your receipts and messages greet you properly. Only you and SUNU Park staff see it.</p>'
          + '<label class="fld">Full name<div class="box"><span class="lead">'+ic("user", 22, 1.9)+'</span><input id="siName" autocomplete="name" placeholder="Enter your full name" value="'+esc(S.name)+'"></div></label>'
          + err() + arrowBtn("name", S.busy ? "Saving…" : "Continue", S.busy) + secure() + '</div></div>';
      }
    };
    function rd(){ o.render(); }
    function focusCode(){ setTimeout(function(){ var c = document.getElementById("siCode"); if(c) c.focus(); }, 60); }
    function tick(){ clearTimeout(tick.t); if(S.step === "code"){ tick.t = setTimeout(function(){ if(S.step === "code"){ rd(); tick(); } }, 1000); } }
    function send(){
      var digits = S.phone.replace(/\D/g, "");
      if(digits.length < 7){ S.err = "Enter your 7-digit phone number."; return rd(); }
      if(S.step === "signup"){
        if(!S.name.trim()){ S.err = "Enter your full name."; return rd(); }
        if(S.plate.trim() && !normPlate(S.plate)){ S.err = "Enter a plate like BJL 2222, or leave it empty."; return rd(); }
        if(!S.agree){ S.err = "Please agree to the Terms and Privacy Policy."; return rd(); }
      }
      if(S.step !== "code") S.from = S.step;
      S.busy = true; S.err = ""; rd();
      PN.requestCode(S.phone).then(function(r){
        S.busy = false;
        if(r.err){ S.err = r.err; return rd(); }
        S.step = "code"; S.code = r.code || ""; S.sentAt = Date.now(); S.test = r.code || null;
        rd(); tick(); focusCode();
      });
    }
    function verify(){
      S.busy = true; S.err = ""; rd();
      PN.verifyCode(S.phone, S.code).then(function(r){
        if(r.err){ S.busy = false; S.err = r.err; S.code = ""; rd(); return focusCode(); }
        S.test = null; clearTimeout(tick.t);
        if(S.from === "signup"){
          var plate = normPlate(S.plate);
          PN.act({ type: "driver.login", name: S.name.trim() })
            .then(function(){ return plate ? PN.act({ type: "driver.addPlate", plate: plate }) : null; })
            .then(function(){ S.busy = false; S.step = "wait"; o.onDone(); });
        } else { S.busy = false; S.step = "wait"; o.onDone(); }
      });
    }
    return {
      state: S,
      view: function(){ return view[S.step] ? view[S.step]() : '<div class="center"><div class="spin"></div></div>'; },
      askName: function(){ if(S.step !== "name"){ S.step = "name"; S.err = ""; S.busy = false; } },
      reset: function(){ S.step = "login"; S.phone = ""; S.code = ""; S.err = ""; S.busy = false; S.test = null; S.name = ""; S.plate = ""; },
      click: function(a, v){
        switch(a){
          case "next": S.slide = Math.min(SLIDES.length - 1, S.slide + 1); rd(); return true;
          case "prev": S.slide = Math.max(0, S.slide - 1); rd(); return true;
          case "skip": PN.ls("parkna.onboarded", "1"); S.step = "login"; S.err = ""; rd(); return true;
          case "to": S.step = v; S.err = ""; S.busy = false; if(v === "onb") S.slide = SLIDES.length - 1; clearTimeout(tick.t); rd(); return true;
          case "send": case "resend": send(); return true;
          case "demo": S.phone = v; S.from = "login"; send(); return true;
          case "focus": focusCode(); return true;
          case "verify": if(S.code.length === 6) verify(); return true;
          case "name":
            if(!S.name.trim()){ S.err = "Enter your full name."; rd(); return true; }
            S.busy = true; S.err = ""; rd();
            PN.act({ type: "driver.login", name: S.name.trim() }).then(function(r){ S.busy = false; if(r.err){ S.err = r.err; return rd(); } S.step = "wait"; o.onDone(); });
            return true;
        }
        return false;
      },
      input: function(t){
        if(t.id === "siPhone"){ S.phone = t.value; return true; }
        if(t.id === "siName"){ S.name = t.value; return true; }
        if(t.id === "siPlate"){ S.plate = t.value.toUpperCase(); return true; }
        if(t.id === "siAgree"){ S.agree = t.checked; return true; }
        if(t.id === "siCode"){ S.code = t.value.replace(/\D/g, "").slice(0, 6); S.err = ""; rd(); focusCode(); if(S.code.length === 6) verify(); return true; }
        return false;
      },
      enter: function(t){
        if(t.id === "siPhone" || t.id === "siPlate") { send(); return true; }
        if(t.id === "siName"){ if(S.step === "name") this.click("name"); else send(); return true; }
        return false;
      }
    };
  }

  /* ---------- terms and conditions: read to the end, then agree ----------
     Shown before signing in (accepted on this phone) and again after signing in whenever an administrator has
     published a new version (accepted on the account). The text comes from the server. */
  function Terms(o){
    /* o: { render() } */
    var S = { data: null, loading: false, err: "", read: false, agree: false, busy: false };
    function current(){ return (PN.mode && PN.mode.termsV) || (PN.info && PN.info.termsV) || null; }
    function load(){
      if(S.loading) return;
      S.loading = true; S.err = "";
      PN.terms().then(function(r){
        S.loading = false;
        if(r && r.ok){ if(!S.data || S.data.v !== r.v){ S.read = false; S.agree = false; } S.data = r; }
        else S.err = (r && r.err) || "Could not load the terms.";
        o.render();
      });
    }
    function fmtAt(iso){ var d = iso ? new Date(iso) : null; return d && !isNaN(d) ? d.getDate() + " " + MON[d.getMonth()] + " " + d.getFullYear() : ""; }
    var api = {
      state: S,
      /* the version to accept before signing in, if this phone has not accepted it yet */
      needLocal: function(){ var v = current(); return !!v && PN.ls("parkna.terms") !== v; },
      /* the version this account still has to accept, if any */
      needAccount: function(u){ var v = current(); return !!v && !!u && !(u.terms && u.terms.v === v); },
      /* accepted on this phone just before signing in: recorded on the account without asking again. True while saving. */
      autoAccept: function(){
        var v = current();
        if(!v || PN.ls("parkna.terms") !== v || S.auto === v) return S.saving === v;
        S.auto = v; S.saving = v;
        /* on success the screen waits for the account's record to arrive with the next update */
        PN.act({ type: "terms.accept", v: v }).then(function(r){ if(!r || r.err) S.saving = null; o.render(); });
        return true;
      },
      view: function(again){
        var v = current();
        if(!S.data || S.data.v !== v){ load(); }
        var d = S.data && S.data.v === v ? S.data : null;
        var body = d ? '<div class="tbox" id="tBox">'+PN.termsHtml(d.body)+'<div class="tend">End of the terms · version '+esc(d.v)+'</div></div>'
                     : '<div class="tbox center" id="tBox">'+(S.err ? '<p>'+esc(S.err)+'</p><button class="btn ghost" data-tg="retry" style="max-width:220px">Try again</button>' : '<div class="spin"></div>')+'</div>';
        return '<div class="auth terms"><div class="ahead">'+crest()+bname()+'</div><div class="aform">'
          + '<div class="atitle"><span class="i">'+ic("doc", 24, 2)+'</span><div><div class="eyebrow">'+(again ? "UPDATED TERMS" : "BEFORE YOU START")+'</div><h1>Terms &amp; Conditions</h1></div></div>'
          + '<p class="alead">'+(again ? "The terms have changed. Please read the new version to the end and accept it to continue." : "Please read the SUNU Park terms to the end. You need to accept them to continue.")
          + (d ? ' <small class="tver">Version '+esc(d.v)+(fmtAt(d.at) ? " · " + fmtAt(d.at) : "")+'</small>' : "")+'</p>'
          + body
          + (d && !S.read ? '<div class="hint"><span class="i">'+ic("chevD", 17, 2.4)+'</span>Scroll to the end of the terms to continue.</div>' : "")
          + '<label class="chk'+(S.read ? "" : " off")+'"><input type="checkbox" id="tAgree"'+(S.agree ? " checked" : "")+(S.read ? "" : " disabled")+'><span>I have read and I accept the SUNU Park Terms &amp; Conditions.</span></label>'
          + (S.err && d ? '<div class="err">'+esc(S.err)+'</div>' : "")
          + '<button class="btn" data-tg="agree"'+(!d || !S.read || !S.agree || S.busy ? " disabled" : "")+'>'+(S.busy ? "Saving…" : "Accept and continue")+'<span class="ar">'+ic("arrow", 20, 2.3)+'</span></button>'
          + '<div class="secure">Also at sunupark.gm/terms and at the Council office</div></div></div>';
      },
      /* after each paint: a short text that needs no scrolling counts as read */
      check: function(){
        var b = document.getElementById("tBox");
        if(b && S.data && !S.read && b.scrollHeight <= b.clientHeight + 8){ S.read = true; o.render(); }
      },
      scroll: function(el){
        if(el.id !== "tBox" || S.read || !S.data) return false;
        if(el.scrollTop + el.clientHeight >= el.scrollHeight - 12){ S.read = true; o.render(); }
        return true;
      },
      input: function(t){ if(t.id !== "tAgree") return false; S.agree = t.checked && S.read; o.render(); return true; },
      /* onAccept(v) returns a promise for an account, or nothing for this phone */
      click: function(a, onAccept){
        if(a === "retry"){ S.err = ""; load(); o.render(); return true; }
        if(a !== "agree" || !S.data || !S.read || !S.agree) return a === "agree";
        var v = S.data.v, p = onAccept ? onAccept(v) : null;
        if(!p){ PN.ls("parkna.terms", v); S.agree = false; S.read = false; o.render(); return true; }
        S.busy = true; S.err = ""; o.render();
        p.then(function(r){ S.busy = false; if(r && r.err){ S.err = r.err; if(/changed/.test(r.err)) load(); } else { PN.ls("parkna.terms", v); S.auto = v; S.agree = false; S.read = false; } o.render(); });
        return true;
      }
    };
    return api;
  }

  /* ---------- screen updates without flicker ----------
     The screens are rebuilt as HTML on every change (a keystroke, the OTP countdown, a live update from the server).
     Replacing the whole page would destroy the field being typed in (on Android the keyboard then closes and opens
     again) and replay the sheets' slide-in animations. morph() changes only what differs: the focused field, its
     text and the keyboard stay as they are, open sheets do not animate again, scroll positions are kept. */
  function same(a, b){ return a.nodeType === b.nodeType && a.nodeName === b.nodeName && (a.nodeType !== 1 || (a.id || "") === (b.id || "")); }
  function patchAttrs(a, b){
    var i, n;
    for(i = a.attributes.length - 1; i >= 0; i--){ n = a.attributes[i].name; if(!b.hasAttribute(n)) a.removeAttribute(n); }
    for(i = 0; i < b.attributes.length; i++){ n = b.attributes[i]; if(a.getAttribute(n.name) !== n.value) a.setAttribute(n.name, n.value); }
  }
  function patchNode(a, b){
    if(a.nodeType !== 1){ if(a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; return; }
    patchAttrs(a, b);
    var tag = a.nodeName;
    if(tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT"){
      /* never touch what the person is typing; other fields follow the new screen */
      if(a !== document.activeElement){
        if(a.type === "checkbox" || a.type === "radio") a.checked = b.hasAttribute("checked");
        else if(tag === "SELECT"){ var sel = b.querySelector("option[selected]"); if(sel && a.value !== sel.value) a.value = sel.value; }
        else { var v = b.getAttribute("value") || ""; if(a.value !== v) a.value = v; }
      }
      if(tag !== "SELECT") return;
    }
    patchChildren(a, b);
  }
  /* the screens themselves (children of the app root) are only reused for the same kind of screen: a new screen
     (sign-in to home, say) starts at the top instead of keeping the old one's scroll position */
  function sameScreen(a, b){ return same(a, b) && (a.nodeType !== 1 || a.className === b.className); }
  function patchChildren(parent, next, top){
    var a = parent.firstChild, b = next.firstChild, nb, eq = top ? sameScreen : same;
    while(b){
      nb = b.nextSibling;
      if(!a){ parent.appendChild(b); }
      else if(eq(a, b)){ patchNode(a, b); a = a.nextSibling; }
      else if(a.nextSibling && eq(a.nextSibling, b)){ var gone = a; a = a.nextSibling; parent.removeChild(gone); patchNode(a, b); a = a.nextSibling; }
      else { parent.insertBefore(b, a); }
      b = nb;
    }
    while(a){ var na = a.nextSibling; parent.removeChild(a); a = na; }
  }
  function morph(root, html){
    var t = document.createElement("template");
    t.innerHTML = html;
    patchChildren(root, t.content, true);
  }

  /* ---------- the on-screen keyboard ----------
     While it is open (the app area gets much shorter), <html> has the class "kb": the bottom bar and its raised
     button hide instead of jumping up above the keyboard. */
  (function(){
    var full = 0;
    function h(){ return window.visualViewport ? window.visualViewport.height : window.innerHeight; }
    function update(){
      var now = h();
      if(now > full) full = now;
      var f = document.activeElement, typing = !!f && (f.nodeName === "INPUT" || f.nodeName === "TEXTAREA") && f.type !== "checkbox";
      var open = typing && full - now > 120, el = document.documentElement;
      if(el.classList.contains("kb") !== open) el.classList.toggle("kb", open);
    }
    window.addEventListener("resize", update);
    document.addEventListener("focusin", function(){ setTimeout(update, 50); });
    document.addEventListener("focusout", function(){ setTimeout(update, 50); });
    if(window.visualViewport) window.visualViewport.addEventListener("resize", update);
    window.addEventListener("orientationchange", function(){ full = 0; setTimeout(update, 400); });
    update();
  })();

  /* ---------- launch screen ----------
     #splash (in index.html) shows from the first frame: the P mark on navy, then the name sweeps in (ui.css).
     splashDone() hands over once the app has something real to show, but not before the name has settled (about
     3.4 s). Then a yellow seam draws across, the screen splits into two halves that glide apart, and the first
     screen's parts rise into place. */
  var T0 = Date.now(), splashGone = false;
  function splashDone(){
    if(splashGone) return;
    var el = document.getElementById("splash");
    if(!el){ splashGone = true; return; }
    var wait = Math.max(0, 3400 - (Date.now() - T0));
    splashGone = true;
    setTimeout(function(){
      var html = document.documentElement;
      el.classList.add("out");
      setTimeout(function(){ html.classList.add("reveal"); }, 450);
      setTimeout(function(){ if(el.parentNode) el.parentNode.removeChild(el); }, 1700);
      setTimeout(function(){ html.classList.remove("reveal"); }, 3400);
    }, wait);
  }

  return { splashDone: splashDone, ic: ic, FLAG: FLAG, initials: initials, phone: phone, money: money, greet: greet, crest: crest, bname: bname, SignIn: SignIn, Terms: Terms, morph: morph };
})();
