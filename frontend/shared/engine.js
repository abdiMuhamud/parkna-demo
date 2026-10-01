/* ============================================================
   SUNU Park demo engine v0.1  (shared: runs on the demo server and in every client)
   Rules follow the v1.2 journey documents:
   - one price for every plate: 200 GMD a day (till 7pm) or 4,000 GMD a month (20 paid days: 5 days a week paid instead of 6)
   - paid hours 7am-7pm Mon-Sat; the pass follows the plate
   - unpaid car: the attendant issues a warning; the daily fee is due within 24 hours, then with a 1,880 GMD fine
   - a phone with an unpaid warning on one of its plates settles it before buying any new pass
   - organisations pay upfront per car per year; cars added later pay the months left; renewal
     invoice 30 days before the year ends, 5 days' grace
   - officers use START, a plate, END from their registered number
   The server owns the state and runs the mutators (act). Clients receive a
   snapshot, call hydrate(), and use the read helpers to render.
   ============================================================ */
var SC = "7275", CODE = "482913", TERMS_URL = "sunupark.gm/terms";
var MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"], MONL = ["January","February","March","April","May","June","July","August","September","October","November","December"], DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
var PROVIDERS = ["Wave", "Afrimoney", "APS", "QMoney"];
function pad(n){ return String(n).padStart(2, "0"); }
function gmd(n){ return Math.round(n).toLocaleString("en-GB"); }
function esc(s){ return String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function dayOnly(d){ return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function dkey(d){ return d.getFullYear()+"-"+d.getMonth()+"-"+d.getDate(); }
function addDays(d, n){ return new Date(d.getFullYear(), d.getMonth(), d.getDate()+n); }
function addMonth(d){ return new Date(d.getFullYear(), d.getMonth()+1, d.getDate()); }
function addYear(d){ return new Date(d.getFullYear()+1, d.getMonth(), d.getDate()); }
function fromKey(k){ var p = k.split("-").map(Number); return new Date(p[0], p[1], p[2]); }
function daysBetween(a, b){ return Math.round((dayOnly(b)-dayOnly(a))/864e5); }
function dim(d){ return new Date(d.getFullYear(), d.getMonth()+1, 0).getDate(); }
function fmtD(d){ return d.getDate()+" "+MON[d.getMonth()]; }
function fmtY(d){ return fmtD(d)+" "+d.getFullYear(); }
function hm(m){ return pad(Math.floor(m/60)%24)+":"+pad(m%60); }
function normPlate(s){ var x = String(s || "").replace(/[\s-]/g,"").toUpperCase(); return /^[A-Z]{2,4}\d{1,4}[A-Z]?$/.test(x) ? x : null; }
function monthlyFor(d){ return Math.round(d*20); }
function annualFor(d){ return monthlyFor(d)*12; }

var ROADS = { WEL: { name: "Wellington Road", bays: "A1-A48" }, LIB: { name: "Liberation Avenue", bays: "A1-A44" }, IND: { name: "Independence Drive", bays: "B1-B40" }, LEM: { name: "Leman Street", bays: "A1-A50" }, RUS: { name: "Russell Street", bays: "B1-B46" } };
var BG_DAILY = { WEL: 88, LIB: 76, IND: 60, LEM: 45, RUS: 90 };
var SHIFTS = { AM: { label: "7am-1pm", s: 420, e: 780 }, PM: { label: "1pm-7pm", s: 780, e: 1140 } };
var PERSONAS = [
  { num: "7012345", name: "Fatou", note: "first time", plates: [] },
  { num: "3034567", name: "Isatou", note: "two plates", plates: ["BJL5678","BJL2211"] },
  { num: "7023456", name: "Lamin", note: "pays for a friend", plates: ["BJL1234"] },
  { num: "3078901", name: "Omar", note: "monthly pass", plates: ["BJL7777"], monthlyTo: 4 },
  { num: "7055501", name: "Musa", note: "unpaid car", plates: ["BJL8080"] },
  { num: "7045678", name: "Ebrima", note: "low Wave balance", plates: ["BJL3030"], low: "Wave" },
  { num: "7089012", name: "Kebba", note: "work car", plates: ["BJL7001"] },
];
var OFFSEED = [
  { id: "07", name: "Modou Jallow", num: "7300007", road: "WEL", shift: "AM", staff: "BCC-0407" },
  { id: "12", name: "Awa Sarr", num: "7300012", road: "WEL", shift: "PM", staff: "BCC-0412" },
  { id: "03", name: "Binta Touray", num: "7300003", road: "LIB", shift: "AM", staff: "BCC-0403", bg: { rate: .42, unp: .14 } },
  { id: "09", name: "Saikou Bah", num: "7300009", road: "IND", shift: "AM", staff: "BCC-0409", bg: { rate: .34, unp: .13 } },
  { id: "11", name: "Alieu Ceesay", num: "7300011", road: "LEM", shift: "AM", staff: "BCC-0411", bg: { rate: .34, unp: .2, stop: 580 } },
  { id: "14", name: "Haddy Sowe", num: "7300014", road: "RUS", shift: "AM", staff: "BCC-0414", bg: { rate: .49, unp: .18 } },
];
var PARKSEED = [
  ["WEL","A3","BJL1234","7023456"], ["WEL","A5","BJL7777","3078901"], ["WEL","A8","BJL7001","7089012"], ["WEL","A11","BJL8080","7055501"],
  ["WEL","A14","BJL9191",null], ["WEL","A17","BJL5678","3034567"], ["WEL","A20","BJL3030","7045678"],
  ["LEM","A2","BJL4545",null], ["LEM","A6","BJL6006",null], ["LEM","A9","BJL7002",null],
];

/* ---------------- state ---------------- */
var B, PLATES, NUMS, LOG, OUT, CHECKS, OFF, ORGA, PARK, EXC, ANN, FINES, T, seq, VER = 0;
function P(p){ return PLATES[p] || (PLATES[p] = { plate: p, daily: null, monthly: null, payers: [] }); }
function N(num, name){
  if(!NUMS[num]) NUMS[num] = { num: num, name: name || "+220 "+num, plates: [], last: null, pending: null, sms: [], lastD: null, wallet: { Wave: 5000, Afrimoney: 5000, APS: 5000, QMoney: 5000 }, receipts: [], welcomed: false, prov: "Wave", terms: null };
  return NUMS[num];
}
function today(){ return dayOnly(B.date); }
function paidHours(){ return B.date.getDay() !== 0 && B.min >= 420 && B.min < 1140; }
function paidDay(){ return B.date.getDay() !== 0; }
/* an organisation covers its paid plates while its year runs, and during the grace days of an unpaid renewal */
function covering(o){ return (o.status === "active" || o.status === "grace") && !!o.coverTo && (today() <= o.coverTo || o.status === "grace"); }
function orgOf(p){
  var t = today();
  for(var k in ORGA){ var o = ORGA[k];
    if(!covering(o)) continue;
    if(o.plates.some(function(x){ return x.plate === p && x.from && x.from <= t && (!x.to || t < x.to); })) return o;
  }
  return null;
}
function state(p){
  var r = PLATES[p];
  if(orgOf(p)) return "ORG";
  if(r && r.monthly && daysBetween(B.date, r.monthly.to) >= 0) return "MONTHLY";
  if(r && r.daily && r.daily.day === dkey(B.date)) return "DAILY";
  return "UNPAID";
}
function orgCoverEnd(o){ return o.coverTo; }
function untilOf(p){ var st = state(p), r = PLATES[p]; return st === "DAILY" ? "19:00" : st === "MONTHLY" ? fmtD(r.monthly.to) : st === "ORG" ? fmtD(orgCoverEnd(orgOf(p))) : "—"; }
function roadOf(o){ return o.re && o.re.day === dkey(B.date) && B.min >= o.re.from ? o.re.road : o.road; }
function roadLine(k){ return ROADS[k].name+" "+ROADS[k].bays; }
function isOfficer(num){ return !!(OFF[num] && OFF[num].active); }
function activePlates(o, at){ var t = at || today(); return o.plates.filter(function(x){ return x.from && x.from <= t && (!x.to || t < x.to); }); }
function pendingPlates(o){ return o.plates.filter(function(x){ return !x.from && !x.to; }); }
/* months left in the organisation's year, counting the current month in full (1 to 12) */
function monthsLeft(o, at){ var t = at || today(), e = o.coverTo; var m = (e.getFullYear() - t.getFullYear()) * 12 + e.getMonth() - t.getMonth() + (e.getDate() >= t.getDate() ? 1 : 0); return Math.max(1, Math.min(12, m)); }
function carYear(o){ return Math.round(T.annual * (1 - o.disc)); }
/* what one more car costs now: the months left in the current year, or a full year before the first payment */
function proRata(o){ return o.coverTo && covering(o) ? Math.round(carYear(o) * monthsLeft(o) / 12) : carYear(o); }
function bgStats(o){
  var sh = SHIFTS[o.shift], z = { checked: 0, unpaid: 0, last: null, on: false };
  if(!paidDay() || B.min < sh.s - 2) return z;
  var endT = Math.min(B.min, sh.e, o.bg.stop || 1e9), el = Math.max(0, endT - sh.s);
  var checked = Math.floor(el * o.bg.rate);
  return { checked: checked, unpaid: Math.round(checked * o.bg.unp), last: B.min < sh.s ? sh.s - 2 : endT, on: B.min < sh.e };
}
function offStats(o){
  if(o.bg) return bgStats(o);
  var d = dkey(B.date), mine = CHECKS.filter(function(c){ return c.day === d && c.off === o.id; });
  return { checked: mine.length, unpaid: mine.filter(function(c){ return c.st === "UNPAID"; }).length, last: o.lastDay === d ? o.last : null, on: o.on && o.day === d };
}
function quote(num, plate, kind){
  /* what paying this plate would cost right now, or why it can't be paid */
  var p = normPlate(plate);
  if(!p) return { err: "Enter a plate like BJL1234" };
  var st = state(p), r = PLATES[p], fs = openFines(p);
  if(fs.length){
    /* an open warning is paid first: the daily fee within 24 hours, with the fine after that */
    return { plate: p, st: st, kind: "fine", amount: fs.reduce(function(s, f){ return s + fineOwed(f); }, 0), ids: fs.map(function(f){ return f.id; }), late: fs.some(fineLate) };
  }
  var ff = fineFirst(num, p);
  if(ff) return { err: "Pay the unpaid warning on "+ff+" first ("+openFines(ff).reduce(function(s, f){ return s + fineOwed(f); }, 0)+" GMD). A warning is settled before any new pass.", plate: p, st: st, first: ff };
  if(st === "ORG") return { err: p+" is covered by "+orgOf(p).name+" fleet. Nothing to pay.", plate: p, st: st };
  if(kind === "monthly"){
    var from = B.date;
    if(r && r.monthly && daysBetween(B.date, r.monthly.to) >= 0){
      if(daysBetween(B.date, r.monthly.to) > 3) return { err: "Monthly pass to "+fmtD(r.monthly.to)+". Renewal opens 3 days before it ends.", plate: p, st: st };
      from = r.monthly.to;
    }
    return { plate: p, st: st, kind: "monthly", amount: T.monthly, to: addMonth(from) };
  }
  if(st === "DAILY") return { err: p+" is already paid till 7pm today.", plate: p, st: st };
  if(st === "MONTHLY") return { err: p+" has a monthly pass to "+fmtD(r.monthly.to)+". Nothing to pay today.", plate: p, st: st };
  if(!paidHours()) return { err: "Parking is free now. Paid hours 7am–7pm, Mon–Sat.", plate: p, st: st };
  return { plate: p, st: st, kind: "daily", amount: T.daily };
}

/* ---------------- warnings and fines ---------------- */
function openFines(p){ return FINES.filter(function(f){ return f.plate === p && f.status === "open"; }); }
/* more than 24 hours after the warning: the fine is added */
function fineLate(f){ var n = daysBetween(fromKey(f.day), B.date); return n > 1 || (n === 1 && B.min > f.t); }
function fineOwed(f){ return f.base + (fineLate(f) ? f.fine : 0); }
function fineDue(f){ return hm(f.t)+" on "+fmtD(addDays(fromKey(f.day), 1)); }
/* another of this phone's plates with an unpaid warning: it is paid before any new pass */
function fineFirst(num, p){
  var u = num && NUMS[num];
  if(!u) return null;
  for(var i = 0; i < u.plates.length; i++) if(u.plates[i] !== p && openFines(u.plates[i]).length) return u.plates[i];
  return null;
}
/* the plate's record: every warning that was not cancelled, oldest first */
function offences(p){ return FINES.filter(function(f){ return f.plate === p && f.status !== "cancelled"; }); }
function nth(n){ var t = n % 100, s = t >= 11 && t <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" })[n % 10] || "th"; return n+s; }
/* first-time or repeat offender, as the attendant and the police read it */
function offenderLine(p){
  var n = offences(p).length;
  return n <= 1 ? "First-time offender." : "Repeat offender: "+nth(n)+" warning for this plate.";
}
/* the phones to tell about a plate: the numbers that paid for it, then the numbers that added it */
function plateNums(p){
  var r = PLATES[p], out = r ? r.payers.slice() : [], more = [];
  for(var k in NUMS) if(NUMS[k].plates.indexOf(p) >= 0 && out.indexOf(k) < 0) more.push(k);
  more.sort();
  return out.concat(more).filter(function(n){ return !isOfficer(n); });
}

/* ---------------- messages ---------------- */
var MSG = {
  welcome: function(){ return "Welcome to SUNU Park, Banjul City parking. Text your plate number to pay, e.g. BJL1234. "+T.daily+" GMD a day, 7am-7pm Mon-Sat. Paying means you accept the terms: "+TERMS_URL; },
  help: function(){ return "SUNU Park: text your plate to pay for today, M for a monthly pass. 7am-7pm Mon-Sat. Pay by Wave, Afrimoney, APS or QMoney. Park in any marked SUNU Park bay. Text TERMS for the terms."; },
  terms: function(){ return "SUNU Park terms and conditions: "+TERMS_URL+" (also in the app and at the Council office). Daily "+T.daily+" GMD, monthly "+T.monthly+" GMD; hourly parking is not offered yet. Using SUNU Park means you accept them."; },
  termsNew: function(v){ return "SUNU Park terms and conditions are updated (version "+v+"). Read them at "+TERMS_URL+" or in the app. Using SUNU Park means you accept them."; },
  free: function(){ return "Parking is free now. Paid hours 7am-7pm Mon-Sat."; },
  bad: function(){ return "Enter your plate e.g. BJL1234"; },
  officerOnly: function(w){ return w+" is for registered SUNU Park attendants. To pay for parking, text your plate e.g. BJL1234"; },
  offer: function(p){ return "Daily pass "+p+": "+T.daily+" GMD, valid till 7pm today.\n1 Wave 2 Afrimoney 3 APS 4 QMoney"; },
  org: function(p){ var o = orgOf(p); return p+" is covered by "+o.name+" fleet ("+o.id+"). Nothing to pay."; },
  mcov: function(p, to){ return p+" has a monthly pass to "+fmtD(to)+". Nothing to pay today."; },
  dcov: function(p, t){ return p+" is already paid till 7pm today. Ticket "+t+". Nothing to pay."; },
  moffer: function(p, to){ return "Monthly "+p+": "+T.monthly+" GMD, valid to "+fmtD(to)+".\n1 Wave 2 Afrimoney 3 APS 4 QMoney"; },
  okD: function(p, t, prov){ return "Paid "+T.daily+" GMD with "+prov+". "+p+" is PAID till 7pm today. Ticket "+t+". Park in any marked SUNU Park bay."; },
  okM: function(p, to, t, prov){ return "Paid "+T.monthly+" GMD with "+prov+". "+p+" monthly pass valid to "+fmtD(to)+". Ticket "+t+". We will remind you 3 days before it ends."; },
  remind: function(p, to){ return "Your SUNU Park monthly pass for "+p+" ends "+fmtD(to)+". Text M to renew."; },
  warn: function(f){ return "SUNU Park WARNING "+f.id+": "+f.plate+" was parked on "+ROADS[f.road].name+" at "+hm(f.t)+" on "+fmtD(fromKey(f.day))+" without paying. Pay the "+f.base+" GMD daily fee within 24 hours (by "+fineDue(f)+"). After that it is "+(f.base+f.fine)+" GMD with the "+f.fine+" GMD fine. Text "+f.plate+" to "+SC+" or use the SUNU Park app."; },
  foffer: function(q){ return q.plate+" has an unpaid warning ("+q.ids.join(", ")+"): "+q.amount+" GMD"+(q.late ? " including the "+T.fine+" GMD fine" : "")+". Pay it first.\n1 Wave 2 Afrimoney 3 APS 4 QMoney"; },
  okF: function(p, amt, ids, today, t, prov){ return "Paid "+amt+" GMD with "+prov+" for warning "+ids.join(", ")+". "+p+" is clear"+(today ? " and PAID till 7pm today" : "")+". Ticket "+t+"."; },
  fremind: function(f){ return "SUNU Park reminder: pay "+f.base+" GMD for warning "+f.id+" ("+f.plate+") by "+hm(f.t)+" today. After that it is "+(f.base+f.fine)+" GMD. Text "+f.plate+" to "+SC+"."; },
};

/* ---------------- SMS plumbing ---------------- */
function smsPush(num, m){
  var u = N(num), k = dkey(B.date);
  if(u.lastD !== k){ u.sms.push({ d: DOW[B.date.getDay()]+" "+fmtD(B.date) }); u.lastD = k; }
  u.sms.push(m);
  if(u.sms.length > 300) u.sms.splice(0, u.sms.length - 300);
}
function mt(num, text, tag){ OUT.unshift({ t: hm(B.min), d: fmtD(B.date), num: num, text: text, tag: tag, id: ++VER }); if(OUT.length > 200) OUT.length = 200; smsPush(num, { i: text, tag: tag, t: hm(B.min) }); return text; }
function mo(num, text){ smsPush(num, { o: text, t: hm(B.min) }); }
function link(num, p){ var u = N(num), r = P(p); if(u.plates.indexOf(p) < 0) u.plates.push(p); if(r.payers.indexOf(num) < 0) r.payers.push(num); u.last = p; }

function recordPay(num, prov, it){
  var u = N(num), ticket = "PN-" + String(seq++).padStart(5, "0"), r = P(it.plate), amt = it.kind === "fine" ? it.amount : it.kind === "monthly" ? T.monthly : T.daily;
  link(num, it.plate); u.welcomed = true; u.prov = prov;
  if(it.kind === "fine") settleFines(it.plate, prov, ticket, num);
  else if(it.kind === "monthly") r.monthly = { to: it.to, ticket: ticket, prov: prov }; else r.daily = { day: dkey(B.date), ticket: ticket, t: hm(B.min), prov: prov };
  u.receipts.unshift({ plate: it.plate, kind: it.kind, amount: amt, prov: prov, when: DOW[B.date.getDay()]+" "+fmtD(B.date)+" "+hm(B.min), day: dkey(B.date), t: hm(B.min), ticket: ticket, to: it.to || null });
  LOG.unshift({ t: hm(B.min), day: dkey(B.date), text: prov+" · "+it.plate+" "+(it.kind === "fine" ? "warning "+it.ids.join(", ") : it.kind)+" · "+ticket, amt: "+"+gmd(amt), amount: amt, src: it.kind, plate: it.plate, prov: prov, ticket: ticket, num: num });
  return ticket;
}
/* one warning paid at the Council office (no phone involved) */
function settleOne(f, method){
  var d = dkey(B.date), late = fineLate(f);
  f.status = "paid"; f.settled = { day: d, t: hm(B.min), amount: fineOwed(f), late: late, method: method, ticket: null, num: null };
  if(f.day === d && state(f.plate) === "UNPAID") P(f.plate).daily = { day: d, ticket: f.id, t: hm(B.min), prov: "Council office" };
  return f.day === d;
}
/* marks the plate's open warnings paid; one issued today also counts as today's daily pass */
function settleFines(p, method, ticket, num){
  var r = P(p), d = dkey(B.date), cov = false;
  openFines(p).forEach(function(f){
    var late = fineLate(f);
    f.status = "paid"; f.settled = { day: d, t: hm(B.min), amount: fineOwed(f), late: late, method: method, ticket: ticket, num: num || null };
    if(f.day === d) cov = true;
  });
  if(cov && state(p) === "UNPAID") r.daily = { day: d, ticket: ticket, t: hm(B.min), prov: method };
  return cov;
}
function pay(num, plate, kind, prov){
  var q = quote(num, plate, kind);
  if(q.err) return { err: q.err };
  if(PROVIDERS.indexOf(prov) < 0) return { err: "Choose a payment provider" };
  var u = N(num);
  if(u.wallet[prov] < q.amount){
    LOG.unshift({ t: hm(B.min), day: dkey(B.date), text: prov+" insufficient balance · "+q.plate, amt: "failed", bad: true, amount: 0 });
    mt(num, "Payment failed ("+prov+": insufficient balance). Nothing was charged. Try another provider.");
    return { err: prov+": insufficient balance. Nothing was charged." };
  }
  u.wallet[prov] -= q.amount;
  var tk = recordPay(num, prov, { plate: q.plate, kind: q.kind, to: q.to, amount: q.amount, ids: q.ids });
  mt(num, q.kind === "fine" ? MSG.okF(q.plate, q.amount, q.ids, state(q.plate) === "DAILY" && PLATES[q.plate].daily.ticket === tk, tk, prov)
        : q.kind === "monthly" ? MSG.okM(q.plate, q.to, tk, prov) : MSG.okD(q.plate, tk, prov), "Receipt");
  return { ok: true, ticket: tk, plate: q.plate, kind: q.kind, amount: q.amount, to: q.to || null, prov: prov };
}

/* driver SMS line (for numbers that are not officers) */
function smsIn(num, raw){
  var t = String(raw || "").trim(), U = t.toUpperCase().replace(/\s+/g, " ");
  if(!t) return;
  mo(num, t);
  if(isOfficer(num)) return officerIn(num, U);
  var u = N(num);
  if(/^[0-9]$/.test(U) && u.pending) return answer(num, U);
  u.pending = null;
  if(U === "START" || U === "END") return mt(num, MSG.officerOnly(U));
  if(U === "HELP" || U === "INFO") return mt(num, MSG.help());
  if(U === "TERMS" || U === "T&C" || U === "TC") return mt(num, MSG.terms());
  if(U === "M" || /^M\s+\S/.test(U)){
    var mp = U === "M" ? (u.last || u.plates[0]) : normPlate(U.slice(2));
    if(!mp) return mt(num, U === "M" ? "Text M and your plate, e.g. M BJL1234" : MSG.bad());
    var qm = quote(num, mp, "monthly");
    if(qm.first) return fineFirstOffer(num, qm.first, qm.plate);
    if(qm.err) return mt(num, qm.err);
    link(num, qm.plate); u.pending = { plate: qm.plate, kind: qm.kind };
    return mt(num, qm.kind === "fine" ? MSG.foffer(qm) : MSG.moffer(qm.plate, qm.to));
  }
  var p = normPlate(U) || (!/\d/.test(U) && (u.last || u.plates[0])) || null;
  if(!p) return mt(num, /\d/.test(U) ? MSG.bad() : MSG.welcome());
  var st = state(p);
  if(openFines(p).length){ var qf = quote(num, p, "daily"); link(num, p); u.welcomed = true; u.pending = { plate: p, kind: "fine" }; return mt(num, MSG.foffer(qf)); }
  var f1 = fineFirst(num, p);
  if(f1) return fineFirstOffer(num, f1, p);
  if(!paidHours()) return mt(num, MSG.free());
  if(st === "ORG") return mt(num, MSG.org(p));
  link(num, p); u.welcomed = true;
  if(st === "MONTHLY") return mt(num, MSG.mcov(p, PLATES[p].monthly.to));
  if(st === "DAILY") return mt(num, MSG.dcov(p, PLATES[p].daily.ticket));
  u.pending = { plate: p, kind: "daily" };
  return mt(num, MSG.offer(p));
}
/* asked about one plate while another of the phone's plates has an unpaid warning: the warning is offered first */
function fineFirstOffer(num, first, p){
  var u = N(num), q = quote(num, first, "daily");
  u.pending = { plate: first, kind: "fine" };
  return mt(num, "Settle your warning before paying for "+p+". "+MSG.foffer(q));
}
function answer(num, U){
  var u = N(num), pe = u.pending, i = parseInt(U, 10);
  if(!(i >= 1 && i <= 4)) return mt(num, "Reply 1 Wave, 2 Afrimoney, 3 APS or 4 QMoney.");
  u.pending = null;
  return pay(num, pe.plate, pe.kind, PROVIDERS[i-1]);
}

/* ---------------- officer line ---------------- */
function unpaidEarlier(road, id){
  var d = dkey(B.date), s = {};
  CHECKS.forEach(function(c){ if(c.day === d && c.road === road && c.off !== id && c.st === "UNPAID") s[c.plate] = 1; });
  return Object.keys(s).length;
}
function officerIn(num, U){
  var o = OFF[num];
  o.last = B.min; o.lastDay = dkey(B.date);
  if(U === "START"){
    if(o.on) return mt(num, "Your shift is already running since "+hm(o.start)+". Text a plate to check it, or END.");
    o.on = true; o.start = B.min; o.day = dkey(B.date); o.stats = { checked: 0, paid: 0, unpaid: 0 }; o.summary = null;
    var road = roadOf(o), h = unpaidEarlier(road, o.id);
    return mt(num, "SUNU Park: shift started "+hm(B.min)+". Attendant "+o.id+", "+roadLine(road)+", "+SHIFTS[o.shift].label+"."+(h ? " "+h+" plate"+(h > 1 ? "s were" : " was")+" unpaid earlier today." : "")+" Text a plate to check it. Text END to finish.", "Shift");
  }
  if(U === "END"){
    if(!o.on) return mt(num, "No shift running. Text START to begin.");
    o.on = false; var s = o.stats;
    o.summary = { end: B.min, day: dkey(B.date), checked: s.checked, paid: s.paid, unpaid: s.unpaid, road: roadOf(o) };
    return mt(num, "Shift ended "+hm(B.min)+". Attendant "+o.id+", "+ROADS[roadOf(o)].name+".\nChecked "+s.checked+": paid "+s.paid+", unpaid "+s.unpaid+".\nCash handled: none. Thank you.", "Shift");
  }
  if(/^(W|WARN)\s/.test(U)){
    var wp = normPlate(U.replace(/^(W|WARN)\s+/, ""));
    if(!wp) return mt(num, "Text W and the plate, e.g. W BJL1234");
    if(!o.on) return mt(num, "Text START to begin your shift first.");
    if(!paidHours()) return mt(num, "Outside paid hours. Parking is free now.");
    return mt(num, warn(o, wp));
  }
  var p = normPlate(U);
  if(!p){
    if(/\d/.test(U)) return mt(num, o.on ? "Plate not recognised. Text the plate e.g. BJL1234" : "Text START to begin your shift first.");
    return mt(num, "Officer commands: START, END, or a plate e.g. BJL1234");
  }
  if(!o.on) return mt(num, "Text START to begin your shift first.");
  if(!paidHours()) return mt(num, "Outside paid hours. Parking is free now.");
  return mt(num, doCheck(o, p));
}
function doCheck(o, p){
  var road = roadOf(o), st = state(p), d = dkey(B.date);
  var prev = CHECKS.filter(function(c){ return c.day === d && c.plate === p && c.road === road; });
  CHECKS.push({ day: d, t: B.min, plate: p, off: o.id, road: road, st: st });
  o.stats.checked++; if(st === "UNPAID") o.stats.unpaid++; else o.stats.paid++;
  var msg;
  if(st === "UNPAID"){
    var pu = prev.filter(function(c){ return c.st === "UNPAID"; });
    var fs = openFines(p), wd = fs.filter(function(f){ return f.day === d; });
    msg = wd.length ? p+": UNPAID. Warning "+wd[0].id+" already issued at "+hm(wd[0].t)+". Move on."
        : pu.length ? p+": UNPAID. Also unpaid at "+pu.map(function(c){ return hm(c.t); }).join(", ")+" on your road. Card already left? Move on."
                    : p+": UNPAID. No pass today.\nDriver there: show the Park & Pay card.\nNot there: issue a warning (text W "+p+").";
    if(fs.length && !wd.length) msg += "\nOpen warning "+fs.map(function(f){ return f.id; }).join(", ")+" from "+fmtD(fromKey(fs[0].day))+".";
    var k = offences(p).filter(function(f){ return f.day !== d; }).length;
    msg += k ? "\nRecord: "+k+" earlier warning"+(k > 1 ? "s" : "")+" (repeat offender)." : "\nRecord: no earlier warnings.";
  }
  else if(st === "DAILY") msg = p+": PAID. Daily pass till 7pm"+(prev.some(function(c){ return c.st === "UNPAID"; }) ? " (paid "+PLATES[p].daily.t+")" : "")+".";
  else if(st === "MONTHLY") msg = p+": PAID. Monthly pass to "+fmtD(PLATES[p].monthly.to)+".";
  else msg = p+": PAID. Organisation "+orgOf(p).id+".";
  if(road !== o.road) msg += " Recorded on "+ROADS[road].name+".";
  return msg;
}
function warn(o, p){
  var road = roadOf(o), st = state(p), d = dkey(B.date);
  if(st !== "UNPAID") return p+": "+(st === "ORG" ? "covered by an organisation" : "PAID")+". No warning needed.";
  var same = openFines(p).filter(function(f){ return f.day === d; })[0];
  if(same) return p+": warning "+same.id+" was already issued at "+hm(same.t)+".";
  var f = { id: "W-"+String(FINES.length + 1).padStart(5, "0"), plate: p, day: d, t: B.min, road: road, off: o.id, base: T.daily, fine: T.fine, status: "open", settled: null, note: null };
  FINES.push(f);
  var nums = plateNums(p);
  nums.forEach(function(n){ mt(n, MSG.warn(f), "Warning"); });
  return p+": WARNING "+f.id+" issued at "+hm(B.min)+". "+offenderLine(p)+" "+(nums.length ? "The driver has been told by SMS." : "No phone is linked to this plate yet: the warning waits on the plate.")+"\nLeave a Park & Pay card on the windscreen.";
}
function reassign(num, road){
  var o = OFF[num];
  if(!o) return { err: "Unknown officer" };
  if(roadOf(o) === road) return { err: "Attendant "+o.id+" is already on "+ROADS[road].name+"." };
  o.re = { road: road, from: B.min, day: dkey(B.date) };
  mt(num, "SUNU Park: Admin moved you to "+roadLine(road)+" from "+hm(B.min)+" today, until the end of your shift. Your next checks are recorded there.", "Reassigned");
  return { ok: true };
}
function registerOfficer(f){
  var ph = String(f.phone || "").replace(/\D/g, "");
  if(!String(f.name || "").trim()) return { err: "Enter the officer’s full name." };
  if(ph.length !== 7) return { err: "Enter the 7-digit registered phone number." };
  if(OFF[ph]) return { err: "That number is already registered to Attendant "+OFF[ph].id+"." };
  var ids = Object.keys(OFF).map(function(k){ return +OFF[k].id; }), id = pad(Math.max.apply(null, ids) + 1);
  var o = OFF[ph] = { id: id, name: f.name.trim(), num: ph, road: f.road || "RUS", shift: f.shift || "AM", staff: f.staff || "—", active: true, on: false, start: null, stats: null, re: null, last: null, summary: null, super: "Supervisor Jobe", isNew: true };
  N(ph, o.name).name = o.name;
  mt(ph, "SUNU Park: welcome "+o.name.split(" ")[0]+". You are Attendant "+id+" on "+roadLine(o.road)+", "+SHIFTS[o.shift].label+". Text START to begin, a plate to check it, END to finish. Never take money.", "Welcome");
  return { ok: true, id: id };
}

/* ---------------- organisations: paid upfront per car per year ---------------- */
function unpaidInv(i){ return i.status === "open" || i.status === "proof"; }
function cars(n){ return n+(n === 1 ? " car" : " cars"); }
function invNo(o){ return "INV-"+o.id.slice(4)+"-"+String(o.invoices.length + 1).padStart(3, "0"); }
/* the lines of an invoice, from its plates: a year per car (opening and renewal) or the months left (cars added later) */
function invLines(o, inv){
  var n = inv.plates.length;
  if(inv.kind === "addon"){
    var m = monthsLeft(o, inv.issued), each = Math.round(carYear(o) * m / 12);
    return inv.plates.map(function(p){ return { t: p+" · "+m+(m === 1 ? " month" : " months")+" to "+fmtY(o.coverTo), a: each }; });
  }
  return [{ t: n+(n === 1 ? " car" : " cars")+" × "+gmd(T.annual)+" GMD a year", a: n*T.annual }, { t: "Discount "+Math.round(o.disc*100)+"%", a: -Math.round(n*T.annual*o.disc) }];
}
function fillInvoice(o, inv){ inv.lines = invLines(o, inv); inv.amount = inv.lines.reduce(function(s, l){ return s + l.a; }, 0); }
function newInvoice(o, kind, plates, due, end, label){
  var t = today(), inv = { no: invNo(o), kind: kind, month: label, issued: t, due: due, end: end, plates: plates.slice(), lines: [], amount: 0, status: "open" };
  fillInvoice(o, inv);
  o.invoices.unshift(inv);
  return inv;
}
/* new cars wait on an invoice: the months left if the year is running, else the opening invoice for a full year */
function invoiceCars(o, plates){
  if(!plates.length) return null;
  var t = today(), c = o.contact.num;
  if(o.coverTo && covering(o)){
    var ni = newInvoice(o, "addon", plates, t, o.coverTo, "To "+fmtY(o.coverTo));
    mt(c, "SUNU Park: invoice "+ni.no+" for "+plates.length+" more "+(plates.length === 1 ? "car" : "cars")+" to "+fmtY(o.coverTo)+": GMD "+gmd(ni.amount)+". The cars are covered once it is paid. Pay in the portal or by bank transfer quoting "+ni.no+".", "Invoice");
    return ni;
  }
  var open = o.invoices.find(function(i){ return i.kind === "annual" && unpaidInv(i); });
  if(open){ plates.forEach(function(p){ if(open.plates.indexOf(p) < 0) open.plates.push(p); }); fillInvoice(o, open); return open; }
  var ai = newInvoice(o, "annual", plates, t, addDays(addYear(t), -1), "12 months from payment");
  mt(c, "SUNU Park: invoice "+ai.no+" for "+cars(plates.length)+", one year paid upfront: GMD "+gmd(ai.amount)+". The cars are covered for 12 months from the day it is paid. Pay by bank transfer quoting "+ai.no+".", "Invoice");
  return ai;
}
function orgDay(o){
  if(o.status === "new" || !o.coverTo) return;
  var d = today(), c = o.contact.num;
  /* the renewal invoice: 30 days before the year ends (or at once for an account from 1.0 with less time left) */
  if(daysBetween(d, o.coverTo) <= 30 && !o.invoices.some(function(i){ return i.kind === "renewal" && unpaidInv(i); })){
    /* the renewal takes the covered cars and any car still waiting on an add-on invoice (which is cancelled) */
    var list = activePlates(o, o.coverTo).map(function(x){ return x.plate; });
    o.invoices.forEach(function(i){ if(i.kind === "addon" && unpaidInv(i)){ i.plates.forEach(function(q){ if(list.indexOf(q) < 0) list.push(q); }); i.status = "void"; } });
    if(list.length){
      var start = addDays(o.coverTo, 1), end = addDays(addYear(start), -1);
      var ri = newInvoice(o, "renewal", list, start, end, fmtY(start)+" – "+fmtY(end));
      mt(c, "SUNU Park: your fleet cover ends "+fmtY(o.coverTo)+". Renewal invoice "+ri.no+" for "+cars(list.length)+": GMD "+gmd(ri.amount)+", due "+fmtY(start)+". Pay in the portal, or by bank transfer quoting "+ri.no+".", "Invoice");
    }
  }
  var inv = o.invoices.find(function(i){ return i.kind === "renewal" && unpaidInv(i) && daysBetween(i.due, d) >= 0; });
  if(inv){
    var g = daysBetween(inv.due, d) + 1;
    if(g <= T.grace){ o.status = "grace"; o.graceDay = g;
      mt(c, "SUNU Park: "+inv.no+" is overdue. Grace day "+g+" of "+T.grace+": your cars stay covered. Pay now to keep them covered.", "Grace"); }
    else if(o.status !== "reverted"){ o.status = "reverted";
      mt(c, "SUNU Park: "+inv.no+" is still unpaid after "+T.grace+" days of grace. Your "+cars(activePlates(o).length)+" are now UNPAID and drivers must pay daily. Pay the invoice to restore cover.", "Plates reverted"); }
  }
}
function payInvoice(o, inv, method){
  if(inv.status === "paid") return { err: inv.no+" is already paid." };
  if(inv.status === "void") return { err: inv.no+" was cancelled." };
  var t = today();
  inv.status = "paid"; inv.method = method; inv.paidOn = t;
  var wasOff = o.status === "grace" || o.status === "reverted";
  if(inv.kind === "annual"){ o.coverFrom = t; o.coverTo = addDays(addYear(t), -1); inv.end = o.coverTo; inv.month = fmtY(t)+" – "+fmtY(o.coverTo); }
  else if(inv.kind === "renewal"){ o.coverFrom = inv.due; o.coverTo = inv.end; }
  o.plates.forEach(function(x){ if(!x.from && !x.to && inv.plates.indexOf(x.plate) >= 0) x.from = t; });
  o.status = "active"; o.graceDay = 0;
  LOG.unshift({ t: hm(B.min), day: dkey(B.date), text: method+" · "+o.id+" "+inv.no, amt: "+"+gmd(inv.amount), amount: inv.amount, src: "org" });
  mt(o.contact.num, "SUNU Park: payment received for "+inv.no+", GMD "+gmd(inv.amount)+". Thank you."+(wasOff ? " Cover is restored:" : "")+" Your "+cars(activePlates(o).length)+" "+(activePlates(o).length === 1 ? "is" : "are")+" covered to "+fmtY(o.coverTo)+".", "Payment received");
  return { ok: true };
}
function createOrg(f){
  var ph = String(f.phone || "").replace(/\D/g, "");
  if(!String(f.name || "").trim()) return { err: "Enter the organisation name." };
  if(!(+f.plates > 0)) return { err: "Enter the number of cars agreed." };
  if(!String(f.contact || "").trim() || ph.length !== 7) return { err: "Enter the billing contact and a 7-digit phone number." };
  if(!f.signed) return { err: "Tick when the signed agreement is received." };
  var id = "ORG-" + pad(Math.max.apply(null, Object.keys(ORGA).map(function(k){ return +k.slice(4); }).concat([0])) + 1).padStart(3, "0");
  var o = ORGA[id] = { id: id, name: f.name.trim(), contact: { name: f.contact.trim(), num: ph }, disc: +f.disc || .15, agreed: +f.plates, status: "new", created: today(), coverFrom: null, coverTo: null, plates: [], topups: [], invoices: [] };
  N(ph, o.contact.name);
  mt(ph, "Welcome to SUNU Park, "+o.name+" ("+id+"). Sign in to the SUNU Park organisation portal with this number to add your cars. Cars are paid upfront for a year. Your account manager will help you.", "Welcome");
  return { ok: true, id: id };
}
function addFleetPlate(o, p, dept, driver){
  o.plates.push({ plate: p, dept: dept || "—", driver: driver || "—", from: null, to: null });
}
/* a car leaves the account: a waiting car also leaves its unpaid invoice (cancelled when empty); a covered car stops tomorrow (no refund) */
function removeFleetPlate(o, p){
  var x = o.plates.find(function(y){ return y.plate === p && !y.to; });
  if(!x) return;
  if(!x.from){
    o.plates.splice(o.plates.indexOf(x), 1);
  } else x.to = addDays(today(), 1);
  for(var i = o.invoices.length - 1; i >= 0; i--){ var inv = o.invoices[i];
    if(!unpaidInv(inv) || inv.plates.indexOf(p) < 0) continue;
    inv.plates = inv.plates.filter(function(q){ return q !== p; });
    if(inv.plates.length) fillInvoice(o, inv); else inv.status = "void";
  }
}

/* ---------------- Council announcements (banner on the driver app's home screen) ---------------- */
var ANN_KINDS = ["Event", "Announcement", "Notice"], ANN_THEMES = ["blue", "yellow", "green", "red"];
function parseDay(s){ var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "").trim()); if(!m) return null; var y = +m[1], mo = +m[2], d = +m[3]; if(mo < 1 || mo > 12 || d < 1 || d > 31) return null; return new Date(y, mo - 1, d); }
function annLive(x){ var t = today(); return x.status === "live" && x.from <= t && t <= x.to; }
function liveAnnouncements(){ return ANN.filter(annLive); }
function announce(f){
  var title = String(f.title || "").trim(), text = String(f.text || "").trim(), link = String(f.link || "").trim(), when = String(f.when || "").trim();
  var kind = ANN_KINDS.indexOf(f.kind) >= 0 ? f.kind : "Announcement", theme = ANN_THEMES.indexOf(f.theme) >= 0 ? f.theme : "blue";
  if(!title) return { err: "Add a title." };
  if(title.length > 60) return { err: "Keep the title to 60 characters." };
  if(text.length > 180) return { err: "Keep the text to 180 characters." };
  if(when.length > 40) return { err: "Keep the date line to 40 characters." };
  if(link.length > 200) return { err: "The link is too long." };
  if(link && !/^https?:\/\/\S+$/i.test(link)) return { err: "The link must start with https://" };
  var from = f.from ? parseDay(f.from) : today(), to = f.to ? parseDay(f.to) : (from ? addDays(from, 14) : null);
  if(!from || !to) return { err: "Enter the dates like 2026-11-07." };
  if(to < from) return { err: "The end date is before the start date." };
  var id = "AN-" + String(ANN.reduce(function(m, x){ return Math.max(m, +x.id.slice(3)); }, 0) + 1).padStart(3, "0");
  ANN.unshift({ id: id, kind: kind, title: title, text: text, when: when, link: link, theme: theme, from: from, to: to, status: "live", created: today(), by: "Aisha K." });
  return { ok: true, id: id, live: annLive(ANN[0]) };
}

/* ---------------- clock ---------------- */
function nextDay(){
  for(var k in OFF){ var o = OFF[k]; if(o.on){ o.on = false; var s = o.stats || {}; o.summary = { end: SHIFTS[o.shift].e, day: o.day, checked: s.checked, paid: s.paid, unpaid: s.unpaid, road: roadOf(o), auto: true }; } o.re = null; }
  B.date = addDays(B.date, 1); B.min = 7*60;
  for(var p in PLATES){ var r = PLATES[p];
    if(r.monthly && daysBetween(B.date, r.monthly.to) === 3 && r.payers.length) mt(r.payers[r.payers.length-1], MSG.remind(p, r.monthly.to), "Reminder"); }
  FINES.forEach(function(f){ if(f.status === "open" && daysBetween(fromKey(f.day), B.date) === 1) plateNums(f.plate).forEach(function(n){ mt(n, MSG.fremind(f), "Reminder"); }); });
  for(var id in ORGA) orgDay(ORGA[id]);
}

/* ---------------- reset / seed ---------------- */
function resetTariff(){
  T = { daily: 200, monthly: 4000, annual: 48000, fine: 1880, grace: 5, walletLimit: 10000,
    log: [{ when: "28 Oct 2026", what: "Pilot tariff published: 200 GMD a day, 4,000 GMD a month, 48,000 GMD a car a year for organisations; 1,880 GMD fine for rule breakers (a warning not paid within 24 hours). Paid hours 7am–7pm, Mon–Sat.", auth: "Agreed points with BCC", by: "Aisha K." }] };
}
function reset(){
  B = { date: new Date(2026, 10, 2), min: 9*60, run: true };
  PLATES = {}; NUMS = {}; seq = 12; LOG = []; OUT = []; CHECKS = []; EXC = []; FINES = [];
  resetTariff();
  PERSONAS.forEach(function(p){
    var u = N(p.num, p.name); u.plates = p.plates.slice(); u.last = p.plates[0] || null; u.welcomed = p.plates.length > 0; u.persona = true; u.note = p.note;
    if(p.low) u.wallet[p.low] = 100;
    p.plates.forEach(function(x){ var r = P(x); r.payers.push(p.num); if(p.monthlyTo) r.monthly = { to: addDays(B.date, p.monthlyTo), ticket: "PN-00007", prov: "Wave" }; });
  });
  OFF = {};
  OFFSEED.forEach(function(s){ OFF[s.num] = Object.assign({ active: true, on: false, start: null, stats: null, re: null, last: null, summary: null, super: "Supervisor Jobe" }, JSON.parse(JSON.stringify(s))); N(s.num, s.name); });
  PARK = PARKSEED.map(function(a){ return { road: a[0], bay: a[1], plate: a[2], driver: a[3] }; });
  ORGA = {};
  var o = ORGA["ORG-014"] = { id: "ORG-014", name: "Demo Bank", contact: { name: "Mariama S.", num: "7101234" }, disc: .15, agreed: 4, status: "active", created: new Date(2026, 8, 20),
    coverFrom: new Date(2026, 9, 1), coverTo: new Date(2027, 8, 30),
    plates: [
      { plate: "BJL7001", dept: "Branch ops", driver: "Kebba J.", from: new Date(2026, 9, 1), to: null },
      { plate: "BJL7002", dept: "Cash logistics", driver: "Fatima N.", from: new Date(2026, 9, 1), to: null },
      { plate: "BJL7003", dept: "Facilities", driver: "Ousman B.", from: new Date(2026, 9, 1), to: null },
      { plate: "BJL7009", dept: "Branch ops", driver: "Lamin D.", from: new Date(2026, 9, 1), to: null } ],
    topups: [], invoices: [] };
  o.invoices.push({ no: "INV-014-001", kind: "annual", month: "1 Oct 2026 – 30 Sep 2027", issued: new Date(2026, 8, 25), due: new Date(2026, 8, 25), end: new Date(2027, 8, 30),
    plates: ["BJL7001", "BJL7002", "BJL7003", "BJL7009"], lines: [{ t: "4 cars × 48,000 GMD a year", a: 192000 }, { t: "Discount 15%", a: -28800 }], amount: 163200, status: "paid", method: "Bank transfer", paidOn: new Date(2026, 9, 1) });
  N("7101234", "Mariama S.");
  /* a car already paid on Leman Street this morning */
  var keep = B.min; B.min = 8*60+15; recordPay("7066000", "Wave", { plate: "BJL4545", kind: "daily" }); B.min = keep;
  N("7066000").name = "A driver";
  ANN = [
    { id: "AN-002", kind: "Event", title: "Banjul Day clean-up", text: "Join the Council and your neighbours to clean the city centre. Gloves and bags provided.", when: "Sat 7 Nov · 8am at Arch 22", link: "", theme: "green",
      from: new Date(2026, 10, 1), to: new Date(2026, 10, 7), status: "live", created: new Date(2026, 9, 30), by: "Aisha K." },
    { id: "AN-001", kind: "Announcement", title: "Pay for parking from your phone", text: "SUNU Park is live on Wellington Road, Liberation Avenue, Independence Drive, Leman Street and Russell Street.", when: "", link: "", theme: "blue",
      from: new Date(2026, 9, 28), to: new Date(2026, 11, 31), status: "live", created: new Date(2026, 9, 28), by: "Aisha K." }];
  VER++;
}

/* ---------------- actions (server side) ---------------- */
function act(a){
  var type = a.type, r;
  switch(type){
    case "driver.login": {
      var num = String(a.num || "").replace(/\D/g, "").slice(-7);
      if(num.length !== 7) return { err: "Enter a 7-digit Gambian number." };
      if(isOfficer(num)) return { err: "That number is registered to a SUNU Park attendant." };
      var u = NUMS[num];
      if(!u || u.name === "+220 "+num){ if(!String(a.name || "").trim()) return { need: "name" }; u = N(num); u.name = String(a.name).trim(); }
      return { ok: true, num: num };
    }
    case "driver.addPlate": {
      var p = normPlate(a.plate); if(!p) return { err: "Enter a plate like BJL1234" };
      link(a.num, p); return { ok: true, plate: p };
    }
    case "driver.removePlate": { var du = N(a.num); du.plates = du.plates.filter(function(x){ return x !== a.plate; }); if(du.last === a.plate) du.last = du.plates[0] || null; return { ok: true }; }
    case "driver.focus": { var fu = N(a.num); if(fu.plates.indexOf(a.plate) >= 0) fu.last = a.plate; return { ok: true }; }
    case "driver.pay": return pay(a.num, a.plate, a.kind || "daily", a.prov);
    /* the terms and conditions, read and accepted in the app (driver or attendant) */
    case "terms.accept": {
      var tv = String(a.v || "").trim().slice(0, 20);
      if(!tv) return { err: "Which terms?" };
      N(a.num).terms = { v: tv, day: dkey(B.date), t: hm(B.min) };
      return { ok: true };
    }
    /* new terms published in the back office: an SMS with the link to every phone that uses SUNU Park */
    case "terms.notify": {
      var nv = String(a.v || "").trim().slice(0, 20);
      if(!nv) return { err: "Which terms?" };
      var to = Object.keys(NUMS).filter(function(k){ var x = NUMS[k]; return x.welcomed || x.plates.length > 0 || isOfficer(k); }).sort();
      to.forEach(function(k){ mt(k, MSG.termsNew(nv), "Terms"); });
      return { ok: true, sent: to.length };
    }
    case "sms": return { ok: true, reply: smsIn(String(a.num).replace(/\D/g, "").slice(-7), a.text) };
    case "officer.login": {
      var on = String(a.num || "").replace(/\D/g, "").slice(-7);
      if(!isOfficer(on)) return { err: "This number is not a registered SUNU Park attendant. Ask your supervisor to register it in the back office." };
      return { ok: true, num: on };
    }
    case "org.sendCode": {
      var ph = String(a.phone || "").replace(/\D/g, "").slice(-7), org = null;
      for(var k in ORGA) if(ORGA[k].contact.num === ph) org = ORGA[k];
      if(!org) return { err: "This number is not the contact on a SUNU Park organisation account." };
      mt(ph, "SUNU Park portal code: "+CODE+". It expires in 10 minutes. Do not share it.", "Code");
      return { ok: true, org: org.id };
    }
    case "org.login": {
      var lp = String(a.phone || "").replace(/\D/g, "").slice(-7), lo = null;
      for(var lk in ORGA) if(ORGA[lk].contact.num === lp) lo = ORGA[lk];
      if(!lo) return { err: "This number is not the contact on a SUNU Park organisation account." };
      if(String(a.code).trim() !== CODE) return { err: "That code is not right. Check the SMS and try again." };
      return { ok: true, org: lo.id };
    }
    case "org.addPlate": {
      var oa = ORGA[a.org], ap = normPlate(a.plate);
      if(!oa) return { err: "Unknown organisation" };
      if(!ap) return { err: "Enter a plate like BJL7010" };
      if(oa.plates.some(function(x){ return x.plate === ap && !x.to; })) return { err: ap+" is already on this account" };
      var pr = proRata(oa); addFleetPlate(oa, ap, a.dept, a.driver); var ia = invoiceCars(oa, [ap]); return { ok: true, plate: ap, proRata: pr, inv: ia.no };
    }
    case "org.addPlates": {
      var ob = ORGA[a.org], added = [];
      (a.rows || []).forEach(function(x){ var q = normPlate(x.p); if(q && !ob.plates.some(function(y){ return y.plate === q && !y.to; })){ addFleetPlate(ob, q, x.dept, x.driver); added.push(q); } });
      var ib = invoiceCars(ob, added);
      return { ok: true, added: added.length, inv: ib ? ib.no : null };
    }
    case "org.removePlate": { removeFleetPlate(ORGA[a.org], a.plate); return { ok: true }; }
    case "org.uploadProof": { var od = ORGA[a.org], iv = od.invoices.find(function(i){ return i.no === a.inv; }); if(!unpaidInv(iv)) return { err: iv.no+" is "+(iv.status === "paid" ? "already paid." : "cancelled.") }; iv.status = "proof"; iv.proofOn = today(); return { ok: true }; }
    case "org.payWallet": { var oe = ORGA[a.org], iw = oe.invoices.find(function(i){ return i.no === a.inv; }); if(iw.amount > T.walletLimit) return { err: "Above the wallet limit. Pay by bank transfer." }; return payInvoice(oe, iw, "Wave Business"); }
    case "back.register": return registerOfficer(a);
    case "back.reassign": return reassign(a.off, a.road);
    case "back.createOrg": return createOrg(a);
    case "back.match": { var om = ORGA[a.org], im = om.invoices.find(function(i){ return i.no === a.inv; }); return payInvoice(om, im, "Bank transfer"); }
    case "back.refer": { if(EXC[+a.i]) EXC[+a.i].status = "finance"; return { ok: true }; }
    case "back.publish": {
      var v2 = a.daily == null ? T.daily : Math.round(+a.daily), va = a.annual == null ? T.annual : Math.round(+a.annual), vf = a.fine == null ? T.fine : Math.round(+a.fine);
      if(!(v2 >= 50 && v2 <= 2000)) return { err: "Enter a daily price between 50 and 2,000 GMD." };
      if(!(va >= 1000 && va <= 1000000)) return { err: "Enter a yearly price per car between 1,000 and 1,000,000 GMD." };
      if(!(vf >= 0 && vf <= 5000)) return { err: "Enter a fine between 0 and 5,000 GMD." };
      if(v2 === T.daily && va === T.annual && vf === T.fine) return { err: "No change to publish." };
      if(!String(a.auth || "").trim()) return { err: "Add the Council authority reference. Tariff changes need one." };
      var what = [];
      if(v2 !== T.daily) what.push("Daily "+T.daily+" → "+v2+" GMD; monthly "+gmd(T.monthly)+" → "+gmd(monthlyFor(v2))+" GMD");
      if(va !== T.annual) what.push("Organisations "+gmd(T.annual)+" → "+gmd(va)+" GMD a car a year");
      if(vf !== T.fine) what.push("Fine "+T.fine+" → "+vf+" GMD");
      T.daily = v2; T.monthly = monthlyFor(v2); T.annual = va; T.fine = vf;
      T.log.push({ when: fmtD(B.date)+" "+B.date.getFullYear()+" "+hm(B.min), what: what.join("; "), auth: String(a.auth).trim(), by: "Aisha K." });
      return { ok: true };
    }
    case "back.settleFine": {
      var fs = FINES.find(function(f){ return f.id === a.id; });
      if(!fs) return { err: "Unknown warning" };
      if(fs.status !== "open") return { err: fs.id+" is not open." };
      var ref = String(a.ref || "").trim();
      if(!ref) return { err: "Add the receipt or reference number of the payment." };
      var amt = fineOwed(fs), today2 = settleOne(fs, "Council office · "+ref);
      LOG.unshift({ t: hm(B.min), day: dkey(B.date), text: "Council office · "+fs.plate+" warning "+fs.id+" · "+ref, amt: "+"+gmd(amt), amount: amt, src: "fine", plate: fs.plate });
      plateNums(fs.plate).forEach(function(n){ mt(n, "SUNU Park: payment of "+amt+" GMD for warning "+fs.id+" ("+fs.plate+") was received at the Council office. Thank you."+(today2 ? " "+fs.plate+" is PAID till 7pm today." : ""), "Receipt"); });
      return { ok: true, amount: amt };
    }
    case "back.cancelFine": {
      var fc = FINES.find(function(f){ return f.id === a.id; });
      if(!fc) return { err: "Unknown warning" };
      if(fc.status !== "open") return { err: fc.id+" is not open." };
      var why = String(a.reason || "").trim();
      if(!why) return { err: "Say why the warning is cancelled." };
      fc.status = "cancelled"; fc.note = why;
      plateNums(fc.plate).forEach(function(n){ mt(n, "SUNU Park: warning "+fc.id+" for "+fc.plate+" is cancelled. Nothing to pay.", "Warning"); });
      return { ok: true };
    }
    case "back.announce": return announce(a);
    case "back.announceStatus": { var ax = ANN.find(function(x){ return x.id === a.id; }); if(!ax) return { err: "Unknown announcement" }; ax.status = a.status === "hidden" ? "hidden" : "live"; return { ok: true }; }
    case "back.announceDelete": { var ai = ANN.findIndex(function(x){ return x.id === a.id; }); if(ai < 0) return { err: "Unknown announcement" }; ANN.splice(ai, 1); return { ok: true }; }
    case "back.exception": { EXC.push({ type: a.kind || "Wrong-plate payment", plate: a.plate, detail: a.detail || "", status: "open" }); return { ok: true }; }
    case "clock.set": { var m = Math.max(0, Math.min(1439, Math.round(+a.min))); B.min = m; return { ok: true }; }
    case "clock.add": { B.min = Math.max(0, Math.min(1439, B.min + Math.round(+a.min))); return { ok: true }; }
    case "clock.nextDay": nextDay(); return { ok: true };
    case "clock.run": B.run = !!a.on; return { ok: true };
    case "demo.reset": reset(); return { ok: true };
    default: return { err: "Unknown action "+type };
  }
}
function tickMinute(){ if(B.run && B.min < 23*60+59){ B.min++; return true; } return false; }

/* ---------------- snapshot / hydrate ---------------- */
function snapshot(){
  var s = { v: VER, B: B, PLATES: PLATES, NUMS: NUMS, LOG: LOG.slice(0, 150), OUT: OUT.slice(0, 80), CHECKS: CHECKS, OFF: OFF, ORGA: ORGA, PARK: PARK, EXC: EXC, ANN: ANN, FINES: FINES, T: T, seq: seq };
  return JSON.stringify(s, function(k, v){ var raw = this[k]; return raw instanceof Date ? { $d: raw.getFullYear()+"-"+(raw.getMonth()+1)+"-"+raw.getDate() } : v; });
}
function hydrate(json){
  var s = typeof json === "string" ? JSON.parse(json, function(k, v){ if(v && typeof v === "object" && typeof v.$d === "string"){ var a = v.$d.split("-").map(Number); return new Date(a[0], a[1]-1, a[2]); } return v; }) : json;
  VER = s.v; B = s.B; PLATES = s.PLATES; NUMS = s.NUMS; LOG = s.LOG; OUT = s.OUT; CHECKS = s.CHECKS; OFF = s.OFF; ORGA = s.ORGA; PARK = s.PARK; EXC = s.EXC; ANN = s.ANN || []; FINES = s.FINES || []; T = s.T; seq = s.seq;
  return s;
}
if(typeof module !== "undefined") module.exports = { reset: reset, act: act, snapshot: snapshot, hydrate: hydrate, tickMinute: tickMinute, bump: function(){ return ++VER; } };
