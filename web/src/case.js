// The route as a carrier case: one pigeonhole per planning zone, laid out in the driver's
// order (left to right, top to bottom, the way a carrier cases mail). Each slot shows the
// position Line of Travel visits it in. A slot turns red when the zone before it changed.

export function zoneOrder(route, tour) {
  const order = [];
  const seen = new Set();
  for (let i = 1; i < tour.length; i++) {
    const z = route.zone[tour[i]];
    if (!seen.has(z)) { seen.add(z); order.push(z); }
  }
  return order;
}

const short = (name) => String(name).replace(/^__STATION__$/, "STN");

// How many separate times a tour enters each zone.
export function visits(route, tour) {
  const v = new Map();
  let prev = -1;
  for (let i = 1; i < tour.length; i++) {
    const z = route.zone[tour[i]];
    if (z !== prev) v.set(z, (v.get(z) || 0) + 1);
    prev = z;
  }
  return v;
}

export function renderCase(el, route, lotTour) {
  const drv = zoneOrder(route, route.actual);
  const lot = lotTour ? zoneOrder(route, lotTour) : drv;
  const posLot = new Map(lot.map((z, i) => [z, i]));
  const prevDrv = new Map(drv.map((z, i) => [z, i ? drv[i - 1] : -1]));
  const prevLot = new Map(lot.map((z, i) => [z, i ? lot[i - 1] : -1]));
  const vDrv = visits(route, route.actual);
  const vLot = lotTour ? visits(route, lotTour) : vDrv;
  let moved = 0, merged = 0;
  el.innerHTML = drv.map((z, i) => {
    const isMoved = lotTour && prevLot.get(z) !== prevDrv.get(z);
    const isMerged = lotTour && vDrv.get(z) > 1 && vLot.get(z) < vDrv.get(z);
    if (isMoved) moved++;
    if (isMerged) merged++;
    const num = posLot.get(z) + 1;
    const stops = countStops(route, z);
    // Same slot but a new zone before it: name that zone, since "4, was 4" would read as no change.
    const movedTag = num !== i + 1 ? `was ${i + 1}` : `after ${short(route.zones[lot[num - 2]])}`;
    const tag = isMoved ? `<span class="was">${movedTag}</span>`
      : isMerged ? `<span class="was">${vDrv.get(z)} trips → ${vLot.get(z)}</span>`
      : !lotTour && vDrv.get(z) > 1 ? `<span class="was">${vDrv.get(z)} trips</span>` : "";
    const title = `Zone ${short(route.zones[z])}, ${stops} stops: driver visits it ${i + 1}${ordinal(i + 1)}` +
      (vDrv.get(z) > 1 ? ` in ${vDrv.get(z)} separate trips` : "") + (lotTour ? `; Line of Travel ${num}${ordinal(num)}` : "");
    return `<div class="slot${isMoved ? " moved" : ""}${isMerged ? " merged" : ""}" title="${title}">
      <span class="num">${num}</span>${tag}
      <span class="lbl"><span>${short(route.zones[z])}</span><span>${stops}</span></span>
    </div>`;
  }).join("");
  el.setAttribute("aria-label", `Carrier case of ${drv.length} zones in the driver's order.` +
    (lotTour ? ` ${drv.length - moved} keep the driver's sequence, ${moved} re-sequenced, ${merged} visited in one trip instead of several.` : ""));
  return { zones: drv.length, moved, merged };
}

const ordinal = (n) => (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");

function countStops(route, z) {
  let c = 0;
  for (let i = 1; i < route.n; i++) if (route.zone[i] === z) c++;
  return c;
}
