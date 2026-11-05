import "maplibre-gl/dist/maplibre-gl.css";
import "./styles.css";
import { loadIndex, loadRoute, TRUST, lateStart, rushOrders, cityOf } from "./data.js";
import { createMap, showRoute, driveLine } from "./map.js";
import { stamp, markSVG } from "./postmark.js";
import { renderCase, zoneOrder } from "./case.js";
import { renderTriptych } from "./triptych.js";
import { renderCharts } from "./charts.js";
import { roll, wireMotion } from "./motion.js";

// ?shot=<section id> : screenshot mode for the deck (no sticky header, no animation, scrolled to the section)
const SHOT = new URLSearchParams(location.search).get("shot");
if (SHOT) document.documentElement.classList.add("shot");
const shotReady = [];
function settleShot() {
  if (!SHOT) return;
  Promise.all(shotReady).then(() => setTimeout(() => {
    document.getElementById(SHOT)?.scrollIntoView({ block: "start" });
    window.__shotReady = true; // deck/shoot.mjs waits for this before taking the picture
  }, 600));
}

// ---------- engine in a worker ----------
const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
let jobSeq = 0;
const pending = new Map();
worker.onmessage = (e) => { const f = pending.get(e.data.job); pending.delete(e.data.job); f && f(e.data); };
function solve(r, cfg, { ms = 300, seed = 1, withDriver = false, scoreRef } = {}) {
  return new Promise((resolve) => {
    const job = ++jobSeq;
    pending.set(job, resolve);
    const { T, H, zone, service, twStart, twEnd, actual, n, k, lat, lng } = r;
    worker.postMessage({ job, cfg, ms, seed, withDriver, scoreRef, r: { T, H, zone, service, twStart, twEnd, actual, n, k, lat, lng } });
  });
}

// ---------- formatting ----------
const fmtH = (s) => `${Math.floor(s / 3600)}h ${String(Math.round((s % 3600) / 60)).padStart(2, "0")}m`;
const fmtDelta = (s) => `${s <= 0 ? "−" : "+"}${Math.abs(Math.round(s / 60))} min`;
const shortId = (id) => id.replace("RouteID_", "").slice(0, 8);
const fmtDate = (d) => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function kept(route, lotTour) {
  const drv = zoneOrder(route, route.actual), lot = zoneOrder(route, lotTour);
  const prev = (o) => new Map(o.map((z, i) => [z, i ? o[i - 1] : -1]));
  const pd = prev(drv), pl = prev(lot);
  let same = 0;
  for (const z of drv) if (pd.get(z) === pl.get(z)) same++;
  return { same, zones: drv.length };
}

function stampRoute(slot, route, lot, driver) {
  const kz = kept(route, lot.tour);
  stamp(slot, {
    top: "LINE OF TRAVEL",
    bottom: `${route.station} · ${fmtDate(route.date).toUpperCase()}`,
    big: fmtDelta(lot.m.travel - driver.travel).toUpperCase(),
    small: `${kz.same}/${kz.zones} ZONES KEPT`,
  });
}

// ---------- page ----------
async function main() {
  document.querySelectorAll('[data-mark="small"]').forEach((el) => (el.innerHTML = markSVG()));
  document.querySelectorAll('[data-mark="large"]').forEach((el) => (el.innerHTML = markSVG()));

  const { routes, summary } = await loadIndex();
  for (const el of document.querySelectorAll("[data-stat]")) {
    const v = summary.stats[el.dataset.stat];
    if (v != null) el.innerHTML = v;
  }
  for (const el of document.querySelectorAll("[data-link]")) {
    const v = summary.links?.[el.dataset.link];
    if (v) el.href = v;
  }
  renderCharts(summary);
  // The held-out results roll up like an odometer once the entrance has played.
  document.querySelectorAll(".ledger dd[data-stat]").forEach((el, i) => roll(el, 1250 + i * 120));
  wireMotion();

  const heroMeta = routes.find((r) => r.id === summary.hero) || routes[0];
  const hero = await loadRoute(heroMeta);
  document.getElementById("hero-route-id").textContent = `${hero.station} · ${fmtDate(hero.date)} · ${hero.n - 1} stops`;
  document.querySelectorAll("[data-route-id]").forEach((el) => (el.textContent = `${hero.station} ${shortId(hero.id)}`));
  renderCase(document.getElementById("case"), hero, null);

  const { map: hmap, ready: hready } = createMap(document.getElementById("hero-map"));
  const heroBtn = document.getElementById("hero-run");
  const heroSlot = document.getElementById("hero-postmark");
  const DEFAULT = TRUST[2].cfg;

  async function runHero(seed = 1) {
    heroBtn.disabled = true;
    stamp(heroSlot, { top: "LINE OF TRAVEL", bottom: "SORTING", big: "· · ·", small: "" }, "inking");
    const [lot, tsp] = await Promise.all([solve(hero, DEFAULT, { withDriver: true, seed }), solve(hero, null, { seed })]);
    // Solve time as measured on this visitor's machine, not a benchmark figure.
    const secs = `${(lot.ms / 1000).toFixed(1)} s`;
    document.querySelectorAll("[data-live='hero-ms']").forEach((el) => (el.textContent = secs));
    roll(document.querySelector(".ledger [data-live='hero-ms']"));
    const msNote = document.getElementById("hero-ms-note");
    if (msNote) msNote.textContent = `this ${hero.n - 1}-stop route, measured just now`;
    // Sections below the fold do not wait for the map animation.
    renderCase(document.getElementById("case"), hero, lot.tour);
    renderTriptych(document.getElementById("triptych"), hero, { driver: { tour: hero.actual, m: lot.driver }, tsp, lot });
    document.getElementById("turn-eyebrow").textContent = `Route ${hero.station} ${shortId(hero.id)}: the same ${hero.n - 1} stops, three ways`;
    await hready;
    showRoute(hmap, hero, { fit: false });
    await driveLine(hmap, hero, lot.tour);
    stampRoute(heroSlot, hero, lot, lot.driver);
    heroBtn.disabled = false;
  }
  hready.then(() => showRoute(hmap, hero));
  shotReady.push(runHero(1));
  heroBtn.addEventListener("click", () => runHero(1));

  shotReady.push(setupDesk(routes, summary));
  settleShot();
}

// ---------- dispatch desk ----------
function setupDesk(routes, summary) {
  const $ = (id) => document.getElementById(id);
  const citySel = $("city"), routeSel = $("route"), trust = $("trust"), trustOut = $("trust-out");
  const desk = document.querySelector(".desk");
  const slot = $("desk-postmark");
  const byCity = new Map();
  for (const r of routes) {
    const c = cityOf(r.station);
    if (!byCity.has(c)) byCity.set(c, []);
    byCity.get(c).push(r);
  }
  citySel.innerHTML = [...byCity.keys()].map((c) => `<option>${c}</option>`).join("");
  const fillRoutes = () => {
    routeSel.innerHTML = byCity.get(citySel.value).map((r) =>
      `<option value="${r.id}">${r.station} · ${fmtDate(r.date)} · ${r.n - 1} stops · ${shortId(r.id)}</option>`).join("");
  };
  fillRoutes();
  // Open the desk on a different route from the hero, so the page shows two cities.
  const heroCity = cityOf(routes.find((r) => r.id === summary.hero)?.station || "");
  const other = [...byCity.keys()].find((c) => c !== heroCity);
  if (other) { citySel.value = other; fillRoutes(); }

  let mapObj = null;
  const ensureMap = () => (mapObj ||= createMap($("desk-map")));
  let token = 0;

  async function run() {
    const my = ++token;
    const meta = routes.find((r) => r.id === routeSel.value);
    const base = await loadRoute(meta);
    const scen = document.querySelector('input[name="scen"]:checked').value;
    const r = scen === "late" ? lateStart(base, 45) : scen === "rush" ? rushOrders(base, 8, 4) : base;
    $("scen-note").textContent = scen === "late"
      ? "Every delivery window now closes 45 minutes earlier, relative to when the van leaves."
      : scen === "rush"
        ? `${r.added} new stops near existing ones, each due within 4 hours. The driver column inserts them by hand where they add the least time.`
        : "";
    const level = TRUST[+trust.value];
    desk.classList.add("busy");
    stamp(slot, { top: "LINE OF TRAVEL", bottom: "SORTING", big: "· · ·", small: "" }, "inking");
    const [lot, tsp] = await Promise.all([
      solve(r, level.cfg, { withDriver: true }),
      solve(r, null),
    ]);
    if (my !== token) return;
    renderTable(r, lot.driver, lot, tsp, scen);
    desk.classList.remove("busy");
    const { map, ready } = ensureMap();
    await ready;
    if (my !== token) return;
    showRoute(map, r);
    await driveLine(map, r, lot.tour, 1100);
    if (my !== token) return;
    stampRoute(slot, r, lot, lot.driver);
  }

  function renderTable(r, d, lot, tsp, scen) {
    const rows = [
      ["Drive time", (m) => fmtH(m.travel), "travel"],
      ["Day length", (m) => fmtH(m.duration), "duration"],
      ["Late stops", (m) => String(m.lateStops), "lateStops"],
      ["Zone re-entries", (m) => String(m.reentries), "reentries"],
      ["Amazon score", (m) => m.score.toFixed(3), "score"],
    ];
    const cols = [d, lot.m, tsp.m];
    $("cmp").querySelector("thead th:nth-child(2)").textContent = scen === "rush" ? "Driver + inserts" : "Driver";
    $("cmp").querySelector("tbody").innerHTML = rows.map(([label, f, key]) => {
      const vals = cols.map((m) => m[key]);
      const best = Math.min(...vals);
      return `<tr><th scope="row">${label}</th>${cols.map((m, i) =>
        `<td class="${i === 1 ? "lot" : ""} ${m[key] === best ? "win" : ""}">${f(m)}</td>`).join("")}</tr>`;
    }).join("") + `<tr><th scope="row">Solve time</th><td>n/a</td><td class="lot">${Math.round(lot.ms)} ms</td><td>${Math.round(tsp.ms)} ms</td></tr>`;
  }

  citySel.addEventListener("change", () => { fillRoutes(); run(); });
  routeSel.addEventListener("change", run);
  trust.addEventListener("input", () => { trustOut.textContent = TRUST[+trust.value].label; });
  trust.addEventListener("change", run);
  document.querySelectorAll('input[name="scen"]').forEach((el) => el.addEventListener("change", run));
  $("run").addEventListener("click", run);

  // Solve the first desk route right away; the worker queues it behind the hero's solves.
  return run();
}

main();
