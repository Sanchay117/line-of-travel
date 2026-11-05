// Evidence charts, hand-built SVG. Emphasis encoding: Line of Travel in cancel red, every
// baseline in graphite, each mark direct-labelled and shape-coded so colour is never the only cue.
// Each chart has a table twin inside <details>, and a hover tooltip that the table duplicates.

const RED = "#c4352b", GRAY = "#7b818a", INK = "#1b2230", RULE = "#dfe2da";

function tipFor(fig) {
  let tip = fig.querySelector(".tip");
  if (!tip) { tip = document.createElement("div"); tip.className = "tip"; fig.appendChild(tip); }
  return tip;
}

function wireTips(fig) {
  const tip = tipFor(fig);
  const svg = fig.querySelector("svg");
  const show = (el) => {
    const r = el.getBoundingClientRect(), f = fig.getBoundingClientRect();
    tip.innerHTML = el.dataset.tip;
    tip.style.left = `${r.left - f.left + r.width / 2}px`;
    tip.style.top = `${r.top - f.top}px`;
    tip.classList.add("on");
  };
  svg.querySelectorAll("[data-tip]").forEach((el) => {
    el.setAttribute("tabindex", "0");
    el.addEventListener("mouseenter", () => show(el));
    el.addEventListener("focus", () => show(el));
    el.addEventListener("mouseleave", () => tip.classList.remove("on"));
    el.addEventListener("blur", () => tip.classList.remove("on"));
  });
}

function table(head, rows) {
  return `<details><summary>Table view</summary><table><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></details>`;
}

const scale = (d0, d1, r0, r1) => (v) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);

function ticks(min, max, step) {
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(+v.toFixed(6));
  return out;
}

// 1. Trade-off: drive time saved vs similarity to the driver, one point per method.
function frontier(fig, data) {
  const W = 560, H = 340, m = { l: 46, r: 18, t: 30, b: 44 };
  const xs = data.map((d) => d.score), ys = data.map((d) => d.saving);
  const x = scale(0, Math.max(...xs) * 1.08, m.l, W - m.r);
  const y = scale(Math.min(-3, Math.min(...ys) - 1), Math.max(...ys) + 1.2, H - m.b, m.t);
  const yTicks = ticks(Math.min(-3, Math.min(...ys) - 1), Math.max(...ys) + 1.2, 2);
  const xTicks = ticks(0, Math.max(...xs) * 1.08, 0.02);
  const lot = data.filter((d) => d.lot).sort((a, b) => a.score - b.score);
  const path = lot.map((d, i) => `${i ? "L" : "M"}${x(d.score)} ${y(d.saving)}`).join("");
  const marks = data.map((d) => {
    const cx = x(d.score), cy = y(d.saving);
    const tipTxt = `<b>${d.label}</b><br>${d.saving.toFixed(1)}% drive time saved · score ${d.score.toFixed(3)}<br>${d.reentries.toFixed(1)} zone re-entries per route`;
    const shape = d.lot
      ? `<circle cx="${cx}" cy="${cy}" r="${d.primary ? 7 : 5}" fill="${RED}" stroke="#f7f7f2" stroke-width="2"/>`
      : `<rect x="${cx - 5}" y="${cy - 5}" width="10" height="10" fill="#f7f7f2" stroke="${d.key === "driver" ? INK : GRAY}" stroke-width="2"/>`;
    const anchor = d.anchor || (cx > W - 140 ? "end" : "start");
    const dx = anchor === "end" ? -10 : 10;
    const label = d.showLabel === false ? "" :
      `<text class="${d.primary || d.key === "driver" ? "lab-strong" : "lab"}" x="${cx + dx}" y="${cy + (d.dy ?? -8)}" text-anchor="${anchor}">${d.label}</text>`;
    return `<g data-tip="${tipTxt.replace(/"/g, "&quot;")}"><circle cx="${cx}" cy="${cy}" r="14" fill="transparent"/>${shape}${label}</g>`;
  }).join("");
  fig.innerHTML = `<h3>The optimizer saves more on paper. Line of Travel stays close to the driver.</h3>
    <p class="chart-sub">Mean over ${data.n} held-out routes. Left means closer to the driver's real order.</p>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Scatter of drive time saved against Amazon score per method">
      ${yTicks.map((v) => `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="${v === 0 ? "#b9bfb5" : RULE}" stroke-width="1"/><text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${v > 0 ? "+" : ""}${v}%</text>`).join("")}
      ${xTicks.map((v) => `<text x="${x(v)}" y="${H - m.b + 18}" text-anchor="middle">${v.toFixed(2)}</text>`).join("")}
      <text x="${(m.l + W - m.r) / 2}" y="${H - 6}" text-anchor="middle">Amazon score (0 = the driver's own order)</text>
      <text x="${m.l - 38}" y="14">Drive time saved vs the driver</text>
      <path d="${path}" fill="none" stroke="${RED}" stroke-width="2" opacity="0.6"/>
      ${marks}
    </svg>
    ${table(["Method", "Saved", "Score", "Re-entries"], data.map((d) => [d.label, `${d.saving.toFixed(2)}%`, d.score.toFixed(4), d.reentries.toFixed(2)]))}`;
  wireTips(fig);
}

// 2. Distribution of per-route savings for the default setting.
// Routes beyond either end of the range sit in their own labelled bars, set off by a gap,
// so a clipped tail never reads as an ordinary bin.
function histogram(fig, h) {
  const W = 560, H = 300, m = { l: 46, r: 14, t: 14, b: 42 };
  const bins = h.bins;
  const lo = bins[0].x0, hi = bins[bins.length - 1].x1;
  const x = scale(lo - 2.2, hi + 2.2, m.l, W - m.r);
  const all = [
    { ...h.under, x0: lo - 2, x1: lo - 0.6, tail: "under" },
    ...bins,
    { ...h.over, x0: hi + 0.6, x1: hi + 2, tail: "over" },
  ];
  const ymax = Math.max(...all.map((b) => b.count));
  const y = scale(0, ymax * 1.1, H - m.b, m.t);
  const yTicks = ticks(0, ymax * 1.1, ymax > 600 ? 200 : 100);
  const range = (b) => b.tail === "under" ? `more than ${-lo}% longer` : b.tail === "over" ? `${hi}% or more saved` : `${b.x0}% to ${b.x1}%`;
  const bars = all.map((b) => {
    const x0 = x(b.x0) + 1, w = Math.max(1, x(b.x1) - x(b.x0) - 2), y0 = y(b.count);
    const neg = b.tail === "under" || b.x1 <= 0;
    const r = Math.min(4, w / 2, Math.max(0, (H - m.b - y0) / 2));
    return `<g data-tip="${b.count} routes: ${range(b)}"><rect x="${x0}" y="${m.t}" width="${w}" height="${H - m.b - m.t}" fill="transparent"/>
      <path d="M${x0} ${H - m.b} V${y0 + r} Q${x0} ${y0} ${x0 + r} ${y0} H${x0 + w - r} Q${x0 + w} ${y0} ${x0 + w} ${y0 + r} V${H - m.b} Z" fill="${neg ? GRAY : RED}" opacity="${neg ? 0.7 : 0.88}"/></g>`;
  }).join("");
  const med = x(h.median);
  const tickTxt = [
    ...ticks(lo, hi, 5).filter((v) => v > lo).map((v) => [x(v), `${v < 0 ? "−" : ""}${Math.abs(v)}%`]),
    [x(lo - 1.3), `&lt;${lo < 0 ? "−" : ""}${Math.abs(lo)}%`], [x(hi + 1.3), `${hi}%+`],
  ];
  fig.innerHTML = `<h3>Most routes save time. Few drive longer.</h3>
    <p class="chart-sub">Drive time saved per route at the default setting, ${h.n.toLocaleString()} held-out routes. Grey: the ${(h.worse * 100).toFixed(1)}% of routes where keeping the driver's habits costs time.</p>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Histogram of per-route drive time savings">
      ${yTicks.map((v) => `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="${RULE}"/><text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join("")}
      ${bars}
      ${tickTxt.map(([px, t]) => `<text x="${px}" y="${H - m.b + 18}" text-anchor="middle">${t}</text>`).join("")}
      <line x1="${med}" x2="${med}" y1="${m.t}" y2="${H - m.b}" stroke="${INK}" stroke-width="1.5"/>
      <text class="lab-strong" x="${med + 6}" y="${m.t + 12}">median ${h.median.toFixed(1)}%</text>
      <text x="${(m.l + W - m.r) / 2}" y="${H - 6}" text-anchor="middle">Drive time saved vs the driver</text>
    </svg>
    ${table(["Saved", "Routes"], all.map((b) => [range(b), b.count]))}`;
  wireTips(fig);
}

// Scenario analysis: a table, since each cell is a number a reader will want to compare exactly.
function scenarios(el, s) {
  if (!s) { el.hidden = true; return; }
  const pct = (v) => `${v >= 0 ? "−" : "+"}${Math.abs(v).toFixed(1)}%`;
  const rush = s.rows.find((r) => r.key === "rush");
  // The rush row is the one where Line of Travel drives more than the baseline, so say why, from the numbers.
  const note = rush ? `<p class="chart-note">Rush orders: slotting each one in by hand misses ${rush.driver.late.toLocaleString()} deadlines.
    Line of Travel makes ${rush.lot.late ? `all but ${rush.lot.late}` : "every one"} for ${pct(rush.lot.saving)} drive time. The shortest path drives less
    by re-entering ${rush.tsp.reentries.toFixed(1)} zones per route; on a day like this a dispatcher would turn the trust dial down.</p>` : "";
  el.innerHTML = `<h3>What if the day goes wrong?</h3>
    <p class="chart-sub">${s.routes} held-out routes, each solved three ways under each scenario. Drive time is the change against the driver's order for that scenario.</p>
    <table class="scen-table">
      <thead><tr><th scope="col">Scenario</th><th scope="col">Drive time, Line of Travel</th><th scope="col">Drive time, shortest path</th><th scope="col">Late stops: driver / Line of Travel / shortest</th><th scope="col">Zone re-entries per route: Line of Travel / shortest</th></tr></thead>
      <tbody>${s.rows.map((r) => `<tr><th scope="row">${r.label}</th><td class="lot">${pct(r.lot.saving)}</td><td>${pct(r.tsp.saving)}</td>
        <td>${r.driver.late.toLocaleString()} / <b class="lot">${r.lot.late.toLocaleString()}</b> / ${r.tsp.late.toLocaleString()}</td><td><b class="lot">${r.lot.reentries.toFixed(2)}</b> / ${r.tsp.reentries.toFixed(1)}</td></tr>`).join("")}</tbody>
    </table>${note}`;
}

// 3 & 4. Horizontal bars, one series, the highlighted bar in red.
function hbars(fig, { title, sub, rows, fmt, max, aria, head }) {
  const W = 560, rowH = 46, m = { l: 190, r: 70, t: 6, b: 8 };
  const H = m.t + m.b + rows.length * rowH;
  const x = scale(0, max, m.l, W - m.r);
  const bars = rows.map((r, i) => {
    const y0 = m.t + i * rowH + 10, h = 22, x1 = x(r.value);
    const rr = Math.min(4, h / 2);
    return `<g data-tip="${r.tip || `${r.label}: ${fmt(r.value)}`}"><rect x="0" y="${y0 - 8}" width="${W}" height="${rowH - 4}" fill="transparent"/>
      <text class="${r.hi ? "lab-strong" : "lab"}" x="${m.l - 12}" y="${y0 + 15}" text-anchor="end">${r.label}</text>
      ${r.note ? `<text x="${m.l - 12}" y="${y0 + 29}" text-anchor="end">${r.note}</text>` : ""}
      <path d="M${m.l} ${y0} H${x1 - rr} Q${x1} ${y0} ${x1} ${y0 + rr} V${y0 + h - rr} Q${x1} ${y0 + h} ${x1 - rr} ${y0 + h} H${m.l} Z" fill="${r.hi ? RED : GRAY}" opacity="${r.hi ? 0.9 : 0.75}"/>
      <text class="${r.hi ? "lab-strong" : "lab"}" x="${x1 + 8}" y="${y0 + 15}">${fmt(r.value)}</text></g>`;
  }).join("");
  fig.innerHTML = `<h3>${title}</h3><p class="chart-sub">${sub}</p>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${aria}">
      <line x1="${m.l}" x2="${m.l}" y1="${m.t}" y2="${H - m.b}" stroke="#b9bfb5"/>
      ${bars}
    </svg>
    ${table(head, rows.map((r) => [r.label + (r.note ? ` (${r.note})` : ""), fmt(r.value)]))}`;
  wireTips(fig);
}

export function renderCharts(s) {
  const fr = s.frontier;
  fr.n = s.stats_raw.eval_routes;
  frontier(document.getElementById("chart-frontier"), fr);
  histogram(document.getElementById("chart-hist"), s.hist);
  hbars(document.getElementById("chart-zone"), {
    title: "The model knows where drivers go next.",
    sub: `Top-1 accuracy predicting the driver's next zone, ${s.zone.n.toLocaleString()} held-out moves, about ${Math.round(s.zone.candidates)} choices each.`,
    rows: s.zone.rows, fmt: (v) => `${(v * 100).toFixed(1)}%`, max: 1, aria: "Next-zone accuracy by method", head: ["Method", "Top-1"],
  });
  hbars(document.getElementById("chart-quality"), {
    title: s.quality.title,
    sub: s.quality.sub,
    rows: s.quality.rows, fmt: (v) => `${v.toFixed(1)}%`, max: Math.max(...s.quality.rows.map((r) => r.value)) * 1.15,
    aria: "Recoverable drive time by Amazon route quality label", head: ["Amazon label", "Median saving"],
  });
  scenarios(document.getElementById("chart-scen"), s.scenarios);
  document.getElementById("checks").innerHTML = s.checks.map((c) => `<li>${c}</li>`).join("");
}
