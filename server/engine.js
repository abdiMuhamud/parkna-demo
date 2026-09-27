/* ============================================================
   ParkNa demo engine v0.1  (shared: runs on the demo server and in every client)
   Rules follow the v1.2 journey documents:
   - one pilot price for every plate: 200 GMD a day (till 7pm) or 4,420 GMD a month
   - paid hours 7am-7pm Mon-Sat; no fines in the pilot; the pass follows the plate
   - organisation plates are covered; invoice on the 25th, due the 1st, 5 days' grace
   - officers use START, a plate, END from their registered number
   The server owns the state and runs the mutators (act). Clients receive a
   snapshot, call hydrate(), and use the read helpers to render.
   ============================================================ */
var SC = "7275", CODE = "482913";
var MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"], MONL = ["January","February","March","April","May","June","July","August","September","October","November","December"], DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
var PROVIDERS = ["Wave", "Afrimoney", "APS", "QMoney"];
function pad(n){ return String(n).padStart(2, "0"); }
function gmd(n){ return Math.round(n).toLocaleString("en-GB"); }
function esc(s){ return String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function dayOnly(d){ return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function dkey(d){ return d.getFullYear()+"-"+d.getMonth()+"-"+d.getDate(); }
function addDays(d, n){ return new Date(d.getFullYear(), d.getMonth(), d.getDate()+n); }
function addMonth(d){ return new Date(d.getFullYear(), d.getMonth()+1, d.getDate()); }
function daysBetween(a, b){ return Math.round((dayOnly(b)-dayOnly(a))/864e5); }
function dim(d){ return new Date(d.getFullYear(), d.getMonth()+1, 0).getDate(); }
function fmtD(d){ return d.getDate()+" "+MON[d.getMonth()]; }
function hm(m){ return pad(Math.floor(m/60)%24)+":"+pad(m%60); }
function normPlate(s){ var x = String(s || "").replace(/[\s-]/g,"").toUpperCase(); return /^[A-Z]{2,4}\d{1,4}[A-Z]?$/.test(x) ? x : null; }
function monthlyFor(d){ return Math.round(d*26*0.85); }

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
var B, PLATES, NUMS, LOG, OUT, CHECKS, OFF, ORGA, PARK, EXC, T, seq, VER = 0;
function P(p){ return PLATES[p] || (PLATES[p] = { plate: p, daily: null, monthly: null, payers: [] }); }
function N(num, name){
  if(!NUMS[num]) NUMS[num] = { num: num, name: name || "+220 "+num, plates: [], last: null, pending: null, sms: [], lastD: null, wallet: { Wave: 5000, Afrimoney: 5000, APS: 5000, QMoney: 5000 }, receipts: [], welcomed: false, prov: "Wave" };
  return NUMS[num];
}
function today(){ return dayOnly(B.date); }
function paidHours(){ return B.date.getDay() !== 0 && B.min >= 420 && B.min < 1140; }
function paidDay(){ return B.date.getDay() !== 0; }
function orgOf(p){
  var t = today();
  for(var k in ORGA){ var o = ORGA[k];
    if(o.status === "reverted" || o.status === "new") continue;
    if(o.plates.some(function(x){ return x.plate === p && x.from <= t && (!x.to || t < x.to); })) return o;
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
function orgCoverEnd(o){ var paid = o.invoices.filter(function(i){ return i.status === "paid"; }).map(function(i){ return i.end; }).sort(function(a,b){ return b-a; })[0]; return paid && paid >= today() ? paid : new Date(B.date.getFullYear(), B.date.getMonth()+1, 0); }
function untilOf(p){ var st = state(p), r = PLATES[p]; return st === "DAILY" ? "19:00" : st === "MONTHLY" ? fmtD(r.monthly.to) : st === "ORG" ? fmtD(orgCoverEnd(orgOf(p))) : "—"; }
function roadOf(o){ return o.re && o.re.day === dkey(B.date) && B.min >= o.re.from ? o.re.road : o.road; }
function roadLine(k){ return ROADS[k].name+" "+ROADS[k].bays; }
function isOfficer(num){ return !!(OFF[num] && OFF[num].active); }
function activePlates(o, at){ var t = at || today(); return o.plates.filter(function(x){ return x.from <= t && (!x.to || t < x.to); }); }
function proRata(o){ var t = today(), n = dim(t); return Math.round((n - t.getDate() + 1) / n * T.monthly * (1 - o.disc)); }
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
  var st = state(p), r = PLATES[p];
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

/* ---------------- messages ---------------- */
var MSG = {
  welcome: function(){ return "Welcome to ParkNa, Banjul City parking. Text your plate number to pay, e.g. BJL1234. "+T.daily+" GMD a day, 7am-7pm Mon-Sat."; },
  help: function(){ return "ParkNa: text your plate to pay for today, M for a monthly pass. 7am-7pm Mon-Sat. Pay by Wave, Afrimoney, APS or QMoney. Park in any marked ParkNa bay."; },
  free: function(){ return "Parking is free now. Paid hours 7am-7pm Mon-Sat."; },
  bad: function(){ return "Enter your plate e.g. BJL1234"; },
  officerOnly: function(w){ return w+" is for registered ParkNa attendants. To pay for parking, text your plate e.g. BJL1234"; },
  offer: function(p){ return "Daily pass "+p+": "+T.daily+" GMD, valid till 7pm today.\n1 Wave 2 Afrimoney 3 APS 4 QMoney"; },
  org: function(p){ var o = orgOf(p); return p+" is covered by "+o.name+" fleet ("+o.id+"). Nothing to pay."; },
  mcov: function(p, to){ return p+" has a monthly pass to "+fmtD(to)+". Nothing to pay today."; },
  dcov: function(p, t){ return p+" is already paid till 7pm today. Ticket "+t+". Nothing to pay."; },
  moffer: function(p, to){ return "Monthly "+p+": "+T.monthly+" GMD, valid to "+fmtD(to)+".\n1 Wave 2 Afrimoney 3 APS 4 QMoney"; },
  okD: function(p, t, prov){ return "Paid "+T.daily+" GMD with "+prov+". "+p+" is PAID till 7pm today. Ticket "+t+". Park in any marked ParkNa bay."; },
  okM: function(p, to, t, prov){ return "Paid "+T.monthly+" GMD with "+prov+". "+p+" monthly pass valid to "+fmtD(to)+". Ticket "+t+". We will remind you 3 days before it ends."; },
  remind: function(p, to){ return "Your ParkNa monthly pass for "+p+" ends "+fmtD(to)+". Text M to renew."; },
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
  var u = N(num), ticket = "PN-" + String(seq++).padStart(5, "0"), r = P(it.plate), amt = it.kind === "monthly" ? T.monthly : T.daily;
  link(num, it.plate); u.welcomed = true; u.prov = prov;
  if(it.kind === "monthly") r.monthly = { to: it.to, ticket: ticket, prov: prov }; else r.daily = { day: dkey(B.date), ticket: ticket, t: hm(B.min), prov: prov };
  u.receipts.unshift({ plate: it.plate, kind: it.kind, amount: amt, prov: prov, when: DOW[B.date.getDay()]+" "+fmtD(B.date)+" "+hm(B.min), day: dkey(B.date), t: hm(B.min), ticket: ticket, to: it.to || null });
  LOG.unshift({ t: hm(B.min), day: dkey(B.date), text: prov+" · "+it.plate+" "+it.kind+" · "+ticket, amt: "+"+gmd(amt), amount: amt, src: it.kind, plate: it.plate, prov: prov, ticket: ticket, num: num });
  return ticket;
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
  var tk = recordPay(num, prov, { plate: q.plate, kind: q.kind, to: q.to });
  mt(num, q.kind === "monthly" ? MSG.okM(q.plate, q.to, tk, prov) : MSG.okD(q.plate, tk, prov), "Receipt");
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
  if(U === "M" || /^M\s+\S/.test(U)){
    var mp = U === "M" ? (u.last || u.plates[0]) : normPlate(U.slice(2));
    if(!mp) return mt(num, U === "M" ? "Text M and your plate, e.g. M BJL1234" : MSG.bad());
    var qm = quote(num, mp, "monthly");
    if(qm.err) return mt(num, qm.err);
    link(num, qm.plate); u.pending = { plate: qm.plate, kind: "monthly" };
    return mt(num, MSG.moffer(qm.plate, qm.to));
  }
  var p = normPlate(U) || (!/\d/.test(U) && (u.last || u.plates[0])) || null;
  if(!p) return mt(num, /\d/.test(U) ? MSG.bad() : MSG.welcome());
  var st = state(p);
  if(!paidHours()) return mt(num, MSG.free());
  if(st === "ORG") return mt(num, MSG.org(p));
  link(num, p); u.welcomed = true;
  if(st === "MONTHLY") return mt(num, MSG.mcov(p, PLATES[p].monthly.to));
  if(st === "DAILY") return mt(num, MSG.dcov(p, PLATES[p].daily.ticket));
  u.pending = { plate: p, kind: "daily" };
  return mt(num, MSG.offer(p));
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
    return mt(num, "ParkNa: shift started "+hm(B.min)+". Attendant "+o.id+", "+roadLine(road)+", "+SHIFTS[o.shift].label+"."+(h ? " "+h+" plate"+(h > 1 ? "s were" : " was")+" unpaid earlier today." : "")+" Text a plate to check it. Text END to finish.", "Shift");
  }
  if(U === "END"){
    if(!o.on) return mt(num, "No shift running. Text START to begin.");
    o.on = false; var s = o.stats;
    o.summary = { end: B.min, day: dkey(B.date), checked: s.checked, paid: s.paid, unpaid: s.unpaid, road: roadOf(o) };
    return mt(num, "Shift ended "+hm(B.min)+". Attendant "+o.id+", "+ROADS[roadOf(o)].name+".\nChecked "+s.checked+": paid "+s.paid+", unpaid "+s.unpaid+".\nCash handled: none. Thank you.", "Shift");
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
    msg = pu.length ? p+": UNPAID. Also unpaid at "+pu.map(function(c){ return hm(c.t); }).join(", ")+" on your road. Card already left? Move on."
                    : p+": UNPAID. No pass today.\nDriver there: show the Park & Pay card.\nNot there: leave a card on the windscreen.";
  }
  else if(st === "DAILY") msg = p+": PAID. Daily pass till 7pm"+(prev.some(function(c){ return c.st === "UNPAID"; }) ? " (paid "+PLATES[p].daily.t+")" : "")+".";
  else if(st === "MONTHLY") msg = p+": PAID. Monthly pass to "+fmtD(PLATES[p].monthly.to)+".";
  else msg = p+": PAID. Organisation "+orgOf(p).id+".";
  if(road !== o.road) msg += " Recorded on "+ROADS[road].name+".";
  return msg;
}
function reassign(num, road){
  var o = OFF[num];
  if(!o) return { err: "Unknown officer" };
  if(roadOf(o) === road) return { err: "Attendant "+o.id+" is already on "+ROADS[road].name+"." };
  o.re = { road: road, from: B.min, day: dkey(B.date) };
  mt(num, "ParkNa: Admin moved you to "+roadLine(road)+" from "+hm(B.min)+" today, until the end of your shift. Your next checks are recorded there.", "Reassigned");
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
  mt(ph, "ParkNa: welcome "+o.name.split(" ")[0]+". You are Attendant "+id+" on "+roadLine(o.road)+", "+SHIFTS[o.shift].label+". Text START to begin, a plate to check it, END to finish. Never take money.", "Welcome");
  return { ok: true, id: id };
}

/* ---------------- organisations ---------------- */
function issueInvoice(o){
  var t = today(), start = new Date(t.getFullYear(), t.getMonth()+1, 1), end = new Date(t.getFullYear(), t.getMonth()+2, 0);
  var n = activePlates(o, start).length;
  var lines = [{ t: n+" plates × "+gmd(T.monthly)+" GMD", a: n*T.monthly }, { t: "Bulk discount "+Math.round(o.disc*100)+"%", a: -Math.round(n*T.monthly*o.disc) }]
    .concat(o.topups.map(function(x){ return { t: x.t, a: x.a }; }));
  o.topups = [];
  var inv = { no: "INV-"+String(start.getFullYear()).slice(2)+pad(start.getMonth()+1)+"-"+o.id.slice(4), month: MONL[start.getMonth()]+" "+start.getFullYear(), issued: t, due: start, end: end,
    lines: lines, amount: lines.reduce(function(s, l){ return s + l.a; }, 0), status: "open" };
  o.invoices.unshift(inv);
  return inv;
}
function orgDay(o){
  if(o.status === "new") return;
  var d = today(), c = o.contact.num;
  if(d.getDate() === 25 && o.plates.length){
    var ni = issueInvoice(o);
    mt(c, "ParkNa: invoice "+ni.no+" for "+ni.month+" is ready. GMD "+gmd(ni.amount)+", due "+fmtD(ni.due)+". Pay in the portal, or by bank transfer quoting "+ni.no+".", "Invoice");
  }
  var inv = o.invoices.find(function(i){ return i.status !== "paid" && daysBetween(i.due, d) >= 1; });
  if(inv){
    var g = daysBetween(inv.due, d);
    if(g <= T.grace){ o.status = "grace"; o.graceDay = g;
      mt(c, "ParkNa: "+inv.no+" is overdue. Grace day "+g+" of "+T.grace+": your plates stay covered. Pay now to keep them covered.", "Grace"); }
    else if(o.status !== "reverted"){ o.status = "reverted";
      mt(c, "ParkNa: "+inv.no+" is still unpaid after "+T.grace+" days of grace. Your "+activePlates(o).length+" plates are now UNPAID and drivers must pay daily. Pay the invoice to restore cover.", "Plates reverted"); }
  }
}
function payInvoice(o, inv, method){
  inv.status = "paid"; inv.method = method; inv.paidOn = today();
  var wasOff = o.status !== "active";
  o.status = "active"; o.graceDay = 0;
  LOG.unshift({ t: hm(B.min), day: dkey(B.date), text: method+" · "+o.id+" "+inv.no, amt: "+"+gmd(inv.amount), amount: inv.amount, src: "org" });
  mt(o.contact.num, "ParkNa: payment received for "+inv.no+", GMD "+gmd(inv.amount)+". Thank you."+(wasOff ? " Cover is restored:" : "")+" Your "+activePlates(o).length+" plates are covered to "+fmtD(inv.end)+".", "Payment received");
  return { ok: true };
}
function createOrg(f){
  var ph = String(f.phone || "").replace(/\D/g, "");
  if(!String(f.name || "").trim()) return { err: "Enter the organisation name." };
  if(!(+f.plates > 0)) return { err: "Enter the number of plates agreed." };
  if(!String(f.contact || "").trim() || ph.length !== 7) return { err: "Enter the billing contact and a 7-digit phone number." };
  if(!f.signed) return { err: "Tick when the signed agreement is received." };
  var id = "ORG-" + pad(Math.max.apply(null, Object.keys(ORGA).map(function(k){ return +k.slice(4); })) + 1).padStart(3, "0");
  var o = ORGA[id] = { id: id, name: f.name.trim(), contact: { name: f.contact.trim(), num: ph }, disc: +f.disc || .15, agreed: +f.plates, status: "new", created: today(), plates: [], topups: [], invoices: [] };
  N(ph, o.contact.name);
  mt(ph, "Welcome to ParkNa, "+o.name+" ("+id+"). Sign in to the ParkNa organisation portal with this number to add your plates. Your account manager will help you.", "Welcome");
  return { ok: true, id: id };
}
function addFleetPlate(o, p, dept, driver){
  o.plates.push({ plate: p, dept: dept || "—", driver: driver || "—", from: today(), to: null });
  o.topups.push({ t: p+" from "+fmtD(today())+" (pro-rata)", a: proRata(o) });
  if(o.status === "new") o.status = "active";
}

/* ---------------- clock ---------------- */
function nextDay(){
  for(var k in OFF){ var o = OFF[k]; if(o.on){ o.on = false; var s = o.stats || {}; o.summary = { end: SHIFTS[o.shift].e, day: o.day, checked: s.checked, paid: s.paid, unpaid: s.unpaid, road: roadOf(o), auto: true }; } o.re = null; }
  B.date = addDays(B.date, 1); B.min = 7*60;
  for(var p in PLATES){ var r = PLATES[p];
    if(r.monthly && daysBetween(B.date, r.monthly.to) === 3 && r.payers.length) mt(r.payers[r.payers.length-1], MSG.remind(p, r.monthly.to), "Reminder"); }
  for(var id in ORGA) orgDay(ORGA[id]);
}

/* ---------------- reset / seed ---------------- */
function resetTariff(){
  T = { daily: 200, monthly: 4420, grace: 5, walletLimit: 10000,
    log: [{ when: "28 Oct 2026", what: "Pilot tariff published: 200 GMD a day, 4,420 GMD a month. Paid hours 7am–7pm, Mon–Sat.", auth: "BCC pilot resolution (reference to confirm)", by: "Aisha K." }] };
}
function reset(){
  B = { date: new Date(2026, 10, 2), min: 9*60, run: true };
  PLATES = {}; NUMS = {}; seq = 12; LOG = []; OUT = []; CHECKS = []; EXC = [];
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
  var o = ORGA["ORG-014"] = { id: "ORG-014", name: "Demo Bank", contact: { name: "Mariama S.", num: "7101234" }, disc: .15, agreed: 4, status: "active", created: new Date(2026, 9, 20),
    plates: [
      { plate: "BJL7001", dept: "Branch ops", driver: "Kebba J.", from: new Date(2026, 9, 1), to: null },
      { plate: "BJL7002", dept: "Cash logistics", driver: "Fatima N.", from: new Date(2026, 9, 1), to: null },
      { plate: "BJL7003", dept: "Facilities", driver: "Ousman B.", from: new Date(2026, 9, 1), to: null },
      { plate: "BJL7009", dept: "Branch ops", driver: "Lamin D.", from: new Date(2026, 9, 1), to: null } ],
    topups: [], invoices: [] };
  o.invoices.push({ no: "INV-2611-014", month: "November 2026", issued: new Date(2026, 9, 25), due: new Date(2026, 10, 1), end: new Date(2026, 10, 30),
    lines: [{ t: "4 plates × 4,420 GMD", a: 17680 }, { t: "Bulk discount 15%", a: -2652 }], amount: 15028, status: "paid", method: "Bank transfer", paidOn: new Date(2026, 9, 30) });
  N("7101234", "Mariama S.");
  /* a car already paid on Leman Street this morning */
  var keep = B.min; B.min = 8*60+15; recordPay("7066000", "Wave", { plate: "BJL4545", kind: "daily" }); B.min = keep;
  N("7066000").name = "A driver";
  VER++;
}

/* ---------------- actions (server side) ---------------- */
function act(a){
  var type = a.type, r;
  switch(type){
    case "driver.login": {
      var num = String(a.num || "").replace(/\D/g, "").slice(-7);
      if(num.length !== 7) return { err: "Enter a 7-digit Gambian number." };
      if(isOfficer(num)) return { err: "That number is registered to a ParkNa attendant." };
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
    case "sms": return { ok: true, reply: smsIn(String(a.num).replace(/\D/g, "").slice(-7), a.text) };
    case "officer.login": {
      var on = String(a.num || "").replace(/\D/g, "").slice(-7);
      if(!isOfficer(on)) return { err: "This number is not a registered ParkNa attendant. Ask your supervisor to register it in the back office." };
      return { ok: true, num: on };
    }
    case "org.sendCode": {
      var ph = String(a.phone || "").replace(/\D/g, "").slice(-7), org = null;
      for(var k in ORGA) if(ORGA[k].contact.num === ph) org = ORGA[k];
      if(!org) return { err: "This number is not the contact on a ParkNa organisation account." };
      mt(ph, "ParkNa portal code: "+CODE+". It expires in 10 minutes. Do not share it.", "Code");
      return { ok: true, org: org.id };
    }
    case "org.login": {
      var lp = String(a.phone || "").replace(/\D/g, "").slice(-7), lo = null;
      for(var lk in ORGA) if(ORGA[lk].contact.num === lp) lo = ORGA[lk];
      if(!lo) return { err: "This number is not the contact on a ParkNa organisation account." };
      if(String(a.code).trim() !== CODE) return { err: "That code is not right. Check the SMS and try again." };
      return { ok: true, org: lo.id };
    }
    case "org.addPlate": {
      var oa = ORGA[a.org], ap = normPlate(a.plate);
      if(!oa) return { err: "Unknown organisation" };
      if(!ap) return { err: "Enter a plate like BJL7010" };
      if(oa.plates.some(function(x){ return x.plate === ap && !x.to; })) return { err: ap+" is already on this account" };
      var pr = proRata(oa); addFleetPlate(oa, ap, a.dept, a.driver); return { ok: true, plate: ap, proRata: pr };
    }
    case "org.addPlates": {
      var ob = ORGA[a.org]; (a.rows || []).forEach(function(x){ var q = normPlate(x.p); if(q && !ob.plates.some(function(y){ return y.plate === q && !y.to; })) addFleetPlate(ob, q, x.dept, x.driver); });
      return { ok: true };
    }
    case "org.removePlate": { var oc = ORGA[a.org], x = oc.plates.find(function(y){ return y.plate === a.plate && !y.to; }); if(x) x.to = addDays(today(), 1); return { ok: true }; }
    case "org.uploadProof": { var od = ORGA[a.org], iv = od.invoices.find(function(i){ return i.no === a.inv; }); iv.status = "proof"; iv.proofOn = today(); return { ok: true }; }
    case "org.payWallet": { var oe = ORGA[a.org], iw = oe.invoices.find(function(i){ return i.no === a.inv; }); if(iw.amount > T.walletLimit) return { err: "Above the wallet limit. Pay by bank transfer." }; return payInvoice(oe, iw, "Wave Business"); }
    case "back.register": return registerOfficer(a);
    case "back.reassign": return reassign(a.off, a.road);
    case "back.createOrg": return createOrg(a);
    case "back.match": { var om = ORGA[a.org], im = om.invoices.find(function(i){ return i.no === a.inv; }); return payInvoice(om, im, "Bank transfer"); }
    case "back.refer": { if(EXC[+a.i]) EXC[+a.i].status = "finance"; return { ok: true }; }
    case "back.publish": {
      var v2 = Math.round(+a.daily);
      if(!(v2 >= 50 && v2 <= 2000)) return { err: "Enter a daily price between 50 and 2,000 GMD." };
      if(v2 === T.daily) return { err: "No change to publish." };
      if(!String(a.auth || "").trim()) return { err: "Add the Council authority reference. Tariff changes need one." };
      var old = T.daily; T.daily = v2; T.monthly = monthlyFor(v2);
      T.log.push({ when: fmtD(B.date)+" "+B.date.getFullYear()+" "+hm(B.min), what: "Daily "+old+" → "+v2+" GMD; monthly "+gmd(monthlyFor(old))+" → "+gmd(T.monthly)+" GMD", auth: String(a.auth).trim(), by: "Aisha K." });
      return { ok: true };
    }
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
  var s = { v: VER, B: B, PLATES: PLATES, NUMS: NUMS, LOG: LOG.slice(0, 150), OUT: OUT.slice(0, 80), CHECKS: CHECKS, OFF: OFF, ORGA: ORGA, PARK: PARK, EXC: EXC, T: T, seq: seq };
  return JSON.stringify(s, function(k, v){ var raw = this[k]; return raw instanceof Date ? { $d: raw.getFullYear()+"-"+(raw.getMonth()+1)+"-"+raw.getDate() } : v; });
}
function hydrate(json){
  var s = typeof json === "string" ? JSON.parse(json, function(k, v){ if(v && typeof v === "object" && typeof v.$d === "string"){ var a = v.$d.split("-").map(Number); return new Date(a[0], a[1]-1, a[2]); } return v; }) : json;
  VER = s.v; B = s.B; PLATES = s.PLATES; NUMS = s.NUMS; LOG = s.LOG; OUT = s.OUT; CHECKS = s.CHECKS; OFF = s.OFF; ORGA = s.ORGA; PARK = s.PARK; EXC = s.EXC; T = s.T; seq = s.seq;
  return s;
}
if(typeof module !== "undefined") module.exports = { reset: reset, act: act, snapshot: snapshot, hydrate: hydrate, tickMinute: tickMinute, bump: function(){ return ++VER; } };
