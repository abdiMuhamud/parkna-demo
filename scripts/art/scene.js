/* Draws the Banjul scene of "SUNU Park Final Designs" as vector art, so it stays sharp on every screen:
   Arch 22 in front of a big sun, palms, birds, the city, the river and the road with its yellow and navy curb.
     frontend/shared/img/art/banjul-scene.svg         blue sky: the navy cards (home page hero, sign-in pages)
     frontend/shared/img/art/banjul-scene-light.svg   pale sky: the light pages (terms, privacy)
   Run:  node scripts/art/scene.js   (no packages needed; the SVGs are committed) */
const fs = require("fs"), path = require("path");
const OUT = path.join(__dirname, "..", "..", "frontend", "shared", "img", "art");
const W = 1600, H = 900, HORIZON = 618;
const C = {
  navy: "#01235D", arch: "#003983", archDeep: "#002E6E", archLine: "#04488D", sun: "#FFE98A", sunCore: "#FFF3B8",
  water: "#18A6FB", waterDeep: "#0E8FE8", ripple: "#8AD8FF", bush: "#004898", bushDark: "#013377", bushMid: "#0B5BB5",
  wallLight: "#DDF0FE", wallBlue: "#177AE6", wallTop: "#BFE3FD", curbY: "#FED444", curbN: "#00225A",
  road: "#1E66AC", roadDark: "#18579A", line: "#F7DC5B", dash: "#FFFFFF", lamp: "#02225C"
};

/* a small seeded random generator, so the drawing is the same every time */
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const f = n => Math.round(n * 10) / 10;
const pts = a => a.map(p => f(p[0]) + "," + f(p[1])).join(" ");

/* ---------- pieces ---------- */
function bird(x, y, s, fill){
  return `<path transform="translate(${f(x)} ${f(y)}) scale(${s})" fill="${fill}" d="M0 0C9-9 20-11 29-3C38-11 49-9 58 0C48-4 39-3 29 6C19-3 10-4 0 0Z"/>`;
}
function building(x, w, h, fill, base){
  const top = base - h;
  let s = `<rect x="${f(x)}" y="${f(top)}" width="${f(w)}" height="${f(h + 4)}" fill="${fill}"/>`;
  if(h > 150 && w > 34) s += `<rect x="${f(x + w / 2 - 2)}" y="${f(top - 26)}" width="4" height="26" fill="${fill}"/>`;
  return s;
}
/* a palm: a curved, tapering trunk and fronds made of leaflets along a drooping midrib */
function palm(bx, by, h, lean, fill, opt = {}){
  const s = h / 300, cx = bx + lean, cy = by - h;
  const k = { x: bx + lean * 0.15 + (opt.bend || 18) * s, y: by - h * 0.55 };
  const w0 = (opt.w0 || 15) * s, w1 = (opt.w1 || 7) * s;
  /* trunk outline: offset the quadratic curve left and right */
  const L = [], R = [];
  for(let i = 0; i <= 16; i++){
    const t = i / 16, mt = 1 - t;
    const x = mt * mt * bx + 2 * mt * t * k.x + t * t * cx, y = mt * mt * by + 2 * mt * t * k.y + t * t * cy;
    const dx = 2 * mt * (k.x - bx) + 2 * t * (cx - k.x), dy = 2 * mt * (k.y - by) + 2 * t * (cy - k.y), d = Math.hypot(dx, dy) || 1;
    const w = (w0 + (w1 - w0) * t) / 2, nx = -dy / d * w, ny = dx / d * w;
    L.push([x + nx, y + ny]); R.unshift([x - nx, y - ny]);
  }
  let out = `<polygon fill="${fill}" points="${pts(L.concat(R))}"/>`;
  /* trunk rings */
  if(opt.rings !== false) for(let i = 3; i < 15; i += 2){
    const p = L[i], q = R[16 - i];
    out += `<line x1="${f(p[0])}" y1="${f(p[1])}" x2="${f(q[0])}" y2="${f(q[1])}" stroke="${opt.ring || "#0A3478"}" stroke-width="${f(1.6 * s)}" stroke-linecap="round" opacity=".55"/>`;
  }
  const angles = opt.angles || [-168, -142, -116, -92, -66, -40, -14, 10, 166, 194];
  let leaves = "";
  angles.forEach(deg => {
    const a = deg * Math.PI / 180, len = (opt.frond || 150) * s * (0.8 + 0.3 * Math.abs(Math.cos(a))) * (0.9 + rnd() * 0.2);
    const droop = (opt.droop || 0.6) * len * (0.45 + 0.55 * Math.abs(Math.cos(a)));
    const ex = cx + Math.cos(a) * len, ey = cy + Math.sin(a) * len * 0.6 + droop;
    const mx = cx + Math.cos(a) * len * 0.55, my = cy + Math.sin(a) * len * 0.6 * 0.6 - len * 0.16;
    const P = t => { const m = 1 - t; return [m * m * cx + 2 * m * t * mx + t * t * ex, m * m * cy + 2 * m * t * my + t * t * ey]; };
    const U = t => { const m = 1 - t, d = [2 * m * (mx - cx) + 2 * t * (ex - mx), 2 * m * (my - cy) + 2 * t * (ey - my)], n = Math.hypot(d[0], d[1]) || 1; return [d[0] / n, d[1] / n]; };
    const norm = v => { const n = Math.hypot(v[0], v[1]) || 1; return [v[0] / n, v[1] / n]; };
    /* a filled frond: the midrib with leaflets on both sides, hanging towards the ground, as one serrated outline */
    const K = opt.leaflets || 13, maxL = (opt.leaflet || 50) * s, up = [], down = [];
    for(let k = 1; k <= K; k++){
      const t = k / (K + 1), p = P(t), u = U(t), n1 = [-u[1], u[0]], nd = n1[1] >= 0 ? n1 : [-n1[0], -n1[1]], nu = [-nd[0], -nd[1]];
      const Lk = maxL * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15)), 0.6) * (1 - 0.3 * t) * (0.85 + rnd() * 0.3) + 4 * s;
      const dd = norm([nd[0] * 0.75 + u[0] * 0.3, nd[1] * 0.75 + 0.95 + u[1] * 0.3]), du = norm([nu[0] * 0.8 + u[0] * 0.45, nu[1] * 0.8 + 0.75 + u[1] * 0.45]);
      const q = P(Math.min(1, t + 0.5 / (K + 1))), w = (3.2 - 2 * t) * s;
      up.push([q[0] + nu[0] * w, q[1] + nu[1] * w], [p[0] + du[0] * Lk * 0.8, p[1] + du[1] * Lk * 0.8]);
      down.push([q[0] + nd[0] * w, q[1] + nd[1] * w], [p[0] + dd[0] * Lk, p[1] + dd[1] * Lk]);
    }
    leaves += `<polygon points="${pts([[cx, cy]].concat(up, [[ex, ey]], down.reverse()))}"/>`;
  });
  out += `<g fill="${fill}">${leaves}</g><circle cx="${f(cx)}" cy="${f(cy + 4 * s)}" r="${f(11 * s)}" fill="${fill}"/>`;
  return out;
}
/* a round, leafy bush made of overlapping circles */
function bush(x, y, w, h, fill, n){
  let s = "";
  const k = n || Math.max(3, Math.round(w / 26));
  for(let i = 0; i < k; i++){
    const t = k === 1 ? 0.5 : i / (k - 1), r = h * (0.55 + rnd() * 0.45) * (1 - Math.abs(t - 0.5) * 0.7);
    s += `<circle cx="${f(x + t * w)}" cy="${f(y - r * 0.6)}" r="${f(r)}"/>`;
  }
  return `<g fill="${fill}">${s}<rect x="${f(x)}" y="${f(y - h * 0.45)}" width="${f(w)}" height="${f(h * 0.45 + 6)}"/></g>`;
}
/* a leafy fern-like clump for the foreground corners */
function clump(x, y, size, fill){
  let s = "";
  for(let i = 0; i < 9; i++){
    const a = (-160 + i * 17.5) * Math.PI / 180, len = size * (0.65 + rnd() * 0.45);
    const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len * 0.9;
    const mx = x + Math.cos(a) * len * 0.5 - Math.sin(a) * len * 0.12, my = y + Math.sin(a) * len * 0.45 - len * 0.1;
    const wv = len * 0.16;
    s += `<path d="M${f(x - wv * Math.sin(a))} ${f(y + wv * Math.cos(a))}Q${f(mx)} ${f(my)} ${f(ex)} ${f(ey)}Q${f(mx + wv)} ${f(my + wv)} ${f(x + wv * Math.sin(a))} ${f(y - wv * Math.cos(a))}Z"/>`;
  }
  return `<g fill="${fill}">${s}</g>`;
}
function lamp(x, base, h){
  const top = base - h;
  return `<g fill="none" stroke="${C.lamp}" stroke-linecap="round"><path d="M${x} ${base}V${top + 18}" stroke-width="9"/>
    <path d="M${x} ${top + 30}C${x} ${top}  ${x - 18} ${top - 6} ${x - 46} ${top + 6}M${x} ${top + 30}C${x} ${top} ${x + 18} ${top - 6} ${x + 46} ${top + 6}" stroke-width="7"/></g>
    <g fill="${C.lamp}"><rect x="${x - 60}" y="${top + 2}" width="26" height="10" rx="5"/><rect x="${x + 34}" y="${top + 2}" width="26" height="10" rx="5"/></g>`;
}

/* Arch 22: the body with the great arch, a row of arched windows, two domed towers and a parapet */
function arch(cx, base){
  const bw = 352, x0 = cx - bw / 2, x1 = cx + bw / 2, top = base - 262;
  const ow = 172, oy = base - 112;                                      /* the opening: width and spring line */
  const body = `M${x0} ${base}V${top}H${x1}V${base}H${cx + ow / 2}V${oy}A${ow / 2} ${ow / 2} 0 0 0 ${cx - ow / 2} ${oy}V${base}Z`;
  let s = `<path fill="${C.arch}" d="${body}"/>`;
  /* depth inside the opening and columns at the sides */
  s += `<path fill="${C.archDeep}" d="M${cx - ow / 2} ${base}V${oy}A${ow / 2} ${ow / 2} 0 0 1 ${cx + ow / 2} ${oy}V${base}H${cx + ow / 2 - 12}V${oy}A${ow / 2 - 12} ${ow / 2 - 12} 0 0 0 ${cx - ow / 2 + 12} ${oy}V${base}Z"/>`;
  for(const px of [x0, x0 + 62, x1 - 80, x1 - 18]) s += `<rect x="${px}" y="${top + 74}" width="18" height="${base - top - 74}" fill="${C.archDeep}" opacity=".55"/>`;
  /* cornices */
  s += `<rect x="${x0 - 12}" y="${top - 12}" width="${bw + 24}" height="16" rx="2" fill="${C.archDeep}"/>`;
  s += `<rect x="${x0 - 6}" y="${top + 62}" width="${bw + 12}" height="10" fill="${C.archDeep}"/>`;
  /* the row of arched windows (the sun shows through) */
  const nwin = 9, gap = (bw - 40) / nwin;
  for(let i = 0; i < nwin; i++){
    const wx = x0 + 20 + i * gap + gap / 2 - 10;
    s += `<path fill="${C.sun}" d="M${f(wx)} ${top + 50}V${top + 24}A10 10 0 0 1 ${f(wx + 20)} ${top + 24}V${top + 50}Z"/>`;
  }
  /* parapet between the towers */
  const tw = 74, tl = x0 + 14, tr = x1 - 14 - tw;
  s += `<rect x="${tl + tw}" y="${top - 34}" width="${tr - tl - tw}" height="24" fill="${C.arch}"/>`;
  for(let px = tl + tw + 10; px < tr - 12; px += 22) s += `<rect x="${px}" y="${top - 28}" width="12" height="14" rx="6" fill="${C.sun}" opacity=".9"/>`;
  s += `<rect x="${tl + tw - 4}" y="${top - 42}" width="${tr - tl - tw + 8}" height="9" fill="${C.archDeep}"/>`;
  /* the towers with their domes and finials */
  for(const x of [tl, tr]){
    const ty = top - 118, mid = x + tw / 2;
    s += `<rect x="${x}" y="${ty}" width="${tw}" height="${top - ty}" fill="${C.arch}"/>`;
    s += `<rect x="${x - 6}" y="${ty - 8}" width="${tw + 12}" height="11" rx="2" fill="${C.archDeep}"/>`;
    s += `<path fill="${C.sun}" d="M${mid - 11} ${top - 22}V${ty + 40}A11 11 0 0 1 ${mid + 11} ${ty + 40}V${top - 22}Z"/>`;
    s += `<path fill="${C.arch}" d="M${x + 4} ${ty - 8}C${x + 2} ${ty - 44} ${mid - 22} ${ty - 52} ${mid} ${ty - 70}C${mid + 22} ${ty - 52} ${x + tw - 2} ${ty - 44} ${x + tw - 4} ${ty - 8}Z"/>`;
    s += `<rect x="${mid - 2.5}" y="${ty - 96}" width="5" height="28" fill="${C.arch}"/><circle cx="${mid}" cy="${ty - 98}" r="6" fill="${C.arch}"/>`;
    s += `<path d="M${x + 10} ${ty - 10}C${x + 12} ${ty - 34} ${mid - 14} ${ty - 44} ${mid - 4} ${ty - 58}" fill="none" stroke="${C.archLine}" stroke-width="5" stroke-linecap="round" opacity=".8"/>`;
  }
  /* the plinth */
  s += `<rect x="${x0 - 18}" y="${base - 14}" width="${bw + 36}" height="16" fill="${C.archDeep}"/>`;
  return s;
}

/* the road: its far edge is a curve; the wall sits on it, the curb runs along it, the lines follow it */
const edge = x => { const t = x / W; return 812 - 132 * t + 40 * t * t; };           /* y of the road's far edge */
function road(){
  const xs = []; for(let x = -20; x <= W + 20; x += 20) xs.push(x);
  const wallH = x => 92 - 66 * (x / W), lineOff = x => 150 - 112 * (x / W), dashOff = x => 330 - 262 * (x / W);
  let s = "";
  /* the promenade wall: light and blue panels */
  const top = xs.map(x => [x, edge(x) - wallH(x)]), bot = xs.map(x => [x, edge(x) - 10]);
  s += `<polygon fill="${C.wallLight}" points="${pts(top.concat(bot.slice().reverse()))}"/>`;
  for(let i = 0; i < xs.length - 1; i++){
    if(i % 4 !== 1 && i % 4 !== 2) continue;
    s += `<polygon fill="${C.wallBlue}" points="${pts([top[i], top[i + 1], bot[i + 1], bot[i]])}"/>`;
  }
  s += `<polyline fill="none" stroke="${C.wallTop}" stroke-width="8" points="${pts(top)}"/>`;
  /* the road surface */
  const far = xs.map(x => [x, edge(x)]);
  s += `<polygon fill="${C.road}" points="${pts(far.concat([[W + 20, H + 20], [-20, H + 20]]))}"/>`;
  s += `<polygon fill="${C.roadDark}" opacity=".5" points="${pts(xs.map(x => [x, edge(x) + lineOff(x) * 0.45]).concat([[W + 20, H + 20], [-20, H + 20]]))}"/>`;
  /* the curb: yellow and navy blocks along the far edge */
  const curb = pts(xs.map(x => [x, edge(x) - 2]));
  s += `<polyline fill="none" stroke="${C.curbY}" stroke-width="20" points="${curb}"/>`;
  s += `<polyline fill="none" stroke="${C.curbN}" stroke-width="20" stroke-dasharray="56 56" points="${curb}"/>`;
  /* the centre line and the lane dashes */
  s += `<polyline fill="none" stroke="${C.line}" stroke-width="11" stroke-linecap="round" points="${pts(xs.map(x => [x, edge(x) + lineOff(x)]))}"/>`;
  s += `<polyline fill="none" stroke="${C.dash}" stroke-width="9" stroke-dasharray="70 64" opacity=".95" points="${pts(xs.map(x => [x, edge(x) + dashOff(x)]))}"/>`;
  return s;
}

function scene(light){
  seed = 7;
  const sky = light ? [["0", "#FFFFFF"], [".55", "#F2FAFD"], ["1", "#C6E9FE"]] : [["0", "#1B6ED0"], [".42", "#3A95EE"], [".78", "#7CCBFD"], ["1", "#A8E0FE"]];
  const city = light ? ["#8FD3FE", "#5CC0FE"] : ["#4FB4FE", "#2398F5"];
  let s = `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">${sky.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join("")}</linearGradient>
    <radialGradient id="sun" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="${C.sunCore}"/><stop offset=".75" stop-color="${C.sun}"/><stop offset="1" stop-color="#FEDF6A"/></radialGradient>
    <radialGradient id="glow" cx=".5" cy=".5" r=".5"><stop offset=".6" stop-color="#FFF3B8" stop-opacity=".55"/><stop offset="1" stop-color="#FFF3B8" stop-opacity="0"/></radialGradient>
    <linearGradient id="water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${light ? "#3CC0FD" : C.water}"/><stop offset="1" stop-color="${C.waterDeep}"/></linearGradient></defs>`;
  s += `<rect width="${W}" height="${H}" fill="url(#sky)"/>`;
  /* the sun and its glow */
  s += `<circle cx="1190" cy="352" r="360" fill="url(#glow)"/><circle cx="1190" cy="352" r="292" fill="url(#sun)"/>`;
  /* birds */
  s += [[560, 150, 1.05], [654, 214, 0.8], [780, 112, 0.62], [880, 262, 0.95], [452, 250, 0.55], [1450, 120, 0.7]].map(([x, y, k]) => bird(x, y, k, C.navy)).join("");
  /* the city: two rows of buildings */
  const back = [[0, 60, 170], [56, 44, 120], [96, 70, 236], [170, 50, 150], [222, 40, 196], [268, 76, 128], [350, 46, 214], [400, 64, 156], [470, 36, 250],
    [512, 58, 176], [576, 44, 132], [626, 70, 204], [700, 40, 150], [744, 56, 238], [806, 60, 164], [870, 40, 120], [1400, 50, 150], [1456, 64, 200], [1526, 74, 140]];
  s += back.map(([x, w, h]) => building(x, w, h, city[0], HORIZON)).join("");
  const front = [[20, 54, 96], [80, 40, 140], [130, 62, 80], [250, 44, 120], [300, 58, 90], [420, 50, 132], [540, 62, 104], [660, 48, 120], [760, 70, 92], [860, 52, 110], [1420, 60, 96], [1500, 46, 120]];
  s += front.map(([x, w, h]) => building(x, w, h, city[1], HORIZON)).join("");
  /* trees on the far shore */
  s += bush(-20, HORIZON + 6, 260, 46, C.bushMid) + bush(210, HORIZON + 6, 300, 40, C.bush) + bush(480, HORIZON + 6, 240, 50, C.bushMid) + bush(700, HORIZON + 6, 300, 44, C.bush);
  s += palm(330, HORIZON - 10, 150, 6, "#0B3F8C", { frond: 120, rings: false }) + palm(612, HORIZON - 8, 190, -10, "#0B3F8C", { frond: 130, rings: false });
  s += palm(880, HORIZON - 4, 250, 16, C.navy, { frond: 150 }) + palm(940, HORIZON - 2, 170, -8, C.navy, { frond: 120 });
  /* Arch 22 */
  s += arch(1190, HORIZON + 22);
  s += bush(960, HORIZON + 24, 90, 44, C.bushDark) + bush(1360, HORIZON + 24, 110, 46, C.bushDark) + bush(1460, HORIZON + 10, 160, 40, C.bush);
  s += palm(1448, HORIZON - 2, 200, 12, C.navy, { frond: 140 }) + palm(1540, HORIZON + 4, 290, -14, C.navy, { frond: 160 });
  /* the river, with ripples and the sun's reflection */
  s += `<rect x="0" y="${HORIZON + 18}" width="${W}" height="${H - HORIZON}" fill="url(#water)"/>`;
  for(let i = 0; i < 26; i++){
    const y = HORIZON + 34 + rnd() * 52, x = rnd() * W, w = 30 + rnd() * 90;
    s += `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="4" rx="2" fill="${C.ripple}" opacity="${f(0.45 + rnd() * 0.4)}"/>`;
  }
  for(let i = 0; i < 6; i++) s += `<rect x="${f(1120 + rnd() * 120)}" y="${f(HORIZON + 30 + i * 10)}" width="${f(40 + rnd() * 60)}" height="4" rx="2" fill="${C.sun}" opacity=".75"/>`;
  /* street lamps, the road and the near bushes */
  s += lamp(250, 760, 330) + lamp(520, 735, 300);
  s += road();
  s += bush(-30, 800, 220, 70, C.bushDark) + clump(40, 830, 170, C.bushDark) + clump(150, 900, 130, C.navy);
  s += palm(70, 880, 590, 70, C.navy, { frond: 205, leaflet: 46, leaflets: 26, w0: 26, w1: 12, bend: 30, droop: 0.5,
    angles: [-164, -138, -112, -86, -60, -34, -8, 16, 172, 198] });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" preserveAspectRatio="xMaxYMax slice">${s}</svg>\n`;
}

fs.writeFileSync(path.join(OUT, "banjul-scene.svg"), scene(false));
fs.writeFileSync(path.join(OUT, "banjul-scene-light.svg"), scene(true));
console.log("Drew frontend/shared/img/art/banjul-scene.svg and banjul-scene-light.svg");
