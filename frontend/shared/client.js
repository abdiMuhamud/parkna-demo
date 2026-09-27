/* ParkNa client: talks to the ParkNa server for the apps and the portals.
   PN.init({ as: "driver" | "officer" | "org" | "staff" }) first. Then:
     PN.requestCode(phone) / PN.verifyCode(phone, code)   phone sign-in (drivers, attendants, organisation contacts)
     PN.staffLogin(username, password)                    back-office sign-in
     PN.connect(onState, onStatus)                        live updates: onState() after each change (globals via hydrate)
     PN.act({ type: ... })                                 one action
   The session token is kept in this device's storage, one per role. */
var PN = (function(){
  function ls(k, v){ try { if(v === undefined) return localStorage.getItem(k); if(v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch(e){ return null; } }
  var CFG = (typeof window !== "undefined" && window.PARKNA_CONFIG) || {};
  var web = typeof location !== "undefined" && (location.protocol === "http:" || location.protocol === "https:") && location.hostname !== "localhost" && location.hostname !== "127.0.0.1";
  function reviver(k, v){ if(v && typeof v === "object" && typeof v.$d === "string"){ var p = v.$d.split("-").map(Number); return new Date(p[0], p[1]-1, p[2]); } return v; }
  function clean(u){ u = String(u || "").trim().replace(/\/+$/, ""); if(u && !/^https?:\/\//i.test(u)) u = "https://" + u; return u; }

  var api = {
    as: "driver",
    server: "",
    token: null,
    me: null, mode: null, info: null,
    online: false, ready: false,
    onSignOut: null,
    ls: ls,
    init: function(o){
      api.as = (o && o.as) || "driver";
      api.server = ls("parkna.server") || CFG.server || (web ? location.origin : "");
      api.token = ls("parkna.token." + api.as);
      return api;
    },
    signedIn: function(){ return !!api.token; },
    setServer: function(u){ u = clean(u); api.server = u; ls("parkna.server", u || null); return u; },

    /* Is there a ParkNa server at this address? Resolves to its info, or null. */
    ping: function(u){
      u = clean(u || api.server);
      var ctl = typeof AbortController !== "undefined" ? new AbortController() : null, to = setTimeout(function(){ if(ctl) ctl.abort(); }, 8000);
      return fetch(u + "/api/ping", ctl ? { signal: ctl.signal } : {}).then(function(r){ clearTimeout(to); return r.json(); })
        .then(function(j){ if(!j || !j.ok) return null; j.url = u; api.info = j; return j; })
        .catch(function(){ clearTimeout(to); return null; });
    },

    /* A request to the server. Resolves to the answer ({err: "..."} on problems); a 401 signs this device out. */
    call: function(method, path, body){
      var h = { "Content-Type": "application/json" };
      if(api.token) h.Authorization = "Bearer " + api.token;
      return fetch(api.server + path, { method: method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) })
        .then(function(r){ return r.text().then(function(t){
          var j; try { j = JSON.parse(t, reviver); } catch(e){ j = { err: "Unexpected answer from the server." }; }
          if(r.status === 401 && api.token && path !== "/api/auth/staff" && path !== "/api/auth/verify") api.signOut(true);
          return j;
        }); })
        .catch(function(){ return { err: "Can’t reach ParkNa. Check your internet connection and try again.", offline: true }; });
    },
    act: function(a){ return api.call("POST", "/api/act", a); },

    requestCode: function(phone){ return api.call("POST", "/api/auth/code", { phone: phone, as: api.as }); },
    verifyCode: function(phone, code){
      return api.call("POST", "/api/auth/verify", { phone: phone, as: api.as, code: code }).then(function(r){ if(r.ok) api.keep(r.token); return r; });
    },
    staffLogin: function(username, password){
      return api.call("POST", "/api/auth/staff", { username: username, password: password }).then(function(r){ if(r.ok) api.keep(r.token); return r; });
    },
    changePassword: function(current, next){ return api.call("POST", "/api/auth/password", { current: current, next: next }); },
    keep: function(token){ api.token = token; ls("parkna.token." + api.as, token); },
    logout: function(){ var p = api.token ? api.call("POST", "/api/auth/logout", {}) : Promise.resolve({}); return p.then(function(){ api.signOut(false); }); },
    signOut: function(expired){
      api.token = null; ls("parkna.token." + api.as, null);
      api.me = null; api.ready = false; api.online = false;
      if(api.es){ try { api.es.close(); } catch(e){} api.es = null; }
      clearTimeout(api.retry);
      if(api.onSignOut) api.onSignOut(expired);
    },

    /* Live updates. Each change arrives as this person's own view of the data. */
    es: null, retry: null, wait: 1000,
    connect: function(onState, onStatus){
      api.onState = onState || api.onState; api.onStatus = onStatus || api.onStatus;
      if(api.es){ try { api.es.close(); } catch(e){} api.es = null; }
      clearTimeout(api.retry);
      if(!api.server || !api.token) return;
      api.call("POST", "/api/auth/ticket", {}).then(function(r){
        if(!api.token) return;
        if(!r.ok){ api.status(false); return api.later(); }
        var es = api.es = new EventSource(api.server + "/api/events?ticket=" + encodeURIComponent(r.ticket));
        es.addEventListener("state", function(e){
          var s = hydrate(e.data);
          api.me = s.ME || null; api.mode = s.MODE || null;
          api.ready = true; api.wait = 1000; api.status(true);
          if(api.onState) api.onState();
        });
        es.addEventListener("signout", function(){ api.signOut(true); });
        /* a ticket works once, so after any error open a new stream with a new ticket (backing off up to 30 s) */
        es.onerror = function(){
          api.status(false);
          try { es.close(); } catch(x){}
          if(api.es === es){ api.es = null; api.later(); }
        };
      });
    },
    later: function(){ clearTimeout(api.retry); api.retry = setTimeout(function(){ api.connect(); }, api.wait); api.wait = Math.min(30000, api.wait * 2); },
    status: function(on){ if(api.online !== on){ api.online = on; if(api.onStatus) api.onStatus(on); } }
  };
  return api;
})();
