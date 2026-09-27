/* ParkNa demo client v0.1 : connection to the demo server (shared by apps and portals) */
var PN = (function(){
  function ls(k, v){ try { if(v === undefined) return localStorage.getItem(k); if(v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch(e){ return null; } }
  var here = (location.protocol === "http:" || location.protocol === "https:") && location.port && location.hostname !== "localhost" ? location.origin : "";
  if((location.protocol === "http:" || location.protocol === "https:") && location.pathname.match(/^\/(driver|officer|admin|org)/)) here = location.origin;
  var api = {
    server: ls("parkna.server") || here || "",
    online: false, ready: false,
    setServer: function(u){ u = String(u || "").trim().replace(/\/+$/, ""); if(u && !/^https?:\/\//i.test(u)) u = "http://" + u; api.server = u; ls("parkna.server", u || null); return u; },
    ls: ls,
    ping: function(u){
      u = String(u || api.server).replace(/\/+$/, ""); if(u && !/^https?:\/\//i.test(u)) u = "http://" + u;
      var ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
      var to = setTimeout(function(){ if(ctl) ctl.abort(); }, 5000);
      return fetch(u + "/api/ping", ctl ? { signal: ctl.signal } : {}).then(function(r){ clearTimeout(to); return r.json(); }).then(function(j){ return j && j.ok ? u : null; }).catch(function(){ clearTimeout(to); return null; });
    },
    act: function(a){
      return fetch(api.server + "/api/act", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(a) })
        .then(function(r){ return r.text(); })
        .then(function(t){ return JSON.parse(t, function(k, v){ if(v && typeof v === "object" && typeof v.$d === "string"){ var p = v.$d.split("-").map(Number); return new Date(p[0], p[1]-1, p[2]); } return v; }); })
        .catch(function(){ return { err: "Can’t reach the demo server. Check the Wi-Fi and the server address." }; });
    },
    es: null,
    connect: function(onState, onStatus){
      if(api.es){ try { api.es.close(); } catch(e){} }
      if(!api.server) return;
      var es = api.es = new EventSource(api.server + "/api/events");
      es.addEventListener("state", function(e){ hydrate(e.data); api.ready = true; if(!api.online){ api.online = true; onStatus && onStatus(true); } onState && onState(); });
      es.onerror = function(){ if(api.online){ api.online = false; onStatus && onStatus(false); } };
    },
  };
  return api;
})();
