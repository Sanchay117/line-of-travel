// Three small maps of one route: the driver's order, the shortest path, Line of Travel.
// Zone re-entries (the van coming back into a zone it already left) are marked in red.

// Fit the delivery stops only; the station is usually far away and would shrink the route.
function project(route, w, h, pad = 12) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const k = Math.cos((route.lat[0] * Math.PI) / 180);
  for (let i = 1; i < route.n; i++) {
    const x = route.lng[i] * k, y = route.lat[i];
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  const s = Math.min((w - 2 * pad) / (x1 - x0 || 1), (h - 2 * pad) / (y1 - y0 || 1));
  const ox = (w - s * (x1 - x0)) / 2, oy = (h - s * (y1 - y0)) / 2;
  return (i) => [ox + (route.lng[i] * k - x0) * s, h - (oy + (route.lat[i] - y0) * s)];
}

function reentryStops(route, tour) {
  const seen = new Set(), marks = [];
  let prev = -1;
  for (let i = 1; i < tour.length; i++) {
    const z = route.zone[tour[i]];
    if (z !== prev) { if (seen.has(z)) marks.push(tour[i]); seen.add(z); prev = z; }
  }
  return marks;
}

function panelSVG(route, tour, { color, dashed, w = 360, h = 300 }) {
  const P = project(route, w, h);
  const pts = Array.from(tour.slice(1), (i) => P(i));
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join("");
  const dots = [];
  for (let i = 1; i < route.n; i++) { const [x, y] = P(i); dots.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.6" fill="#1b2230" opacity="0.55"/>`); }
  const re = reentryStops(route, tour).map((i) => { const [x, y] = P(i); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="none" stroke="#c4352b" stroke-width="1.6"/>`; });
  const [fx, fy] = pts[0];
  return `<svg viewBox="0 0 ${w} ${h}" role="img">
    ${dots.join("")}
    <path d="${d}" fill="none" stroke="${color}" stroke-width="${dashed ? 1.3 : 1.8}" ${dashed ? 'stroke-dasharray="4 3"' : ""} stroke-linejoin="round"/>
    ${re.join("")}
    <circle cx="${fx}" cy="${fy}" r="4.5" fill="#f7f7f2" stroke="#1b2230" stroke-width="2"/>
  </svg>`;
}

const fmtH = (s) => `${Math.floor(s / 3600)}h ${String(Math.round((s % 3600) / 60)).padStart(2, "0")}m`;

export function renderTriptych(el, route, sets) {
  const base = sets.driver.m.travel;
  el.innerHTML = [
    { key: "driver", title: "Driver's order", cls: "", color: "#6b7280", dashed: true },
    { key: "tsp", title: "Shortest path", cls: "is-tsp", color: "#1b2230", dashed: false },
    { key: "lot", title: "Line of Travel", cls: "is-lot", color: "#c4352b", dashed: false },
  ].map((p) => {
    const m = sets[p.key].m;
    const pct = (100 * (m.travel - base)) / base;
    const delta = p.key === "driver" ? "" : `<small> ${pct < 0 ? "−" : "+"}${Math.abs(pct).toFixed(1)}%</small>`;
    return `<div class="panel ${p.cls}">
      <h3><span>${p.title}</span></h3>
      ${panelSVG(route, sets[p.key].tour, p)}
      <dl>
        <div><dt>Drive time</dt><dd>${fmtH(m.travel)}${delta}</dd></div>
        <div><dt>Zone re-entries</dt><dd class="${p.key === "tsp" ? "bad" : ""}">${m.reentries}</dd></div>
        <div><dt>Amazon score</dt><dd>${m.score.toFixed(3)}</dd></div>
      </dl>
    </div>`;
  }).join("");
}
