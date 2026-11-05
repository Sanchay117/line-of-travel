// MapLibre map in the page's palette: zones as pale hulls, the driver's line in graphite
// pencil, the re-sequenced line in cancel red, drawn as the van would drive it.
import maplibregl from "maplibre-gl";

const STYLE = "https://tiles.openfreemap.org/styles/positron";
const C = { face: "#f7f7f2", water: "#d5ddd7", hull: "#56635a", ink: "#1b2230", graphite: "#8b9098", cancel: "#c4352b", manila: "#d9bd78" };
const empty = () => ({ type: "FeatureCollection", features: [] });

function hull(points) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

// Pad tiny hulls so one- or two-stop zones still show as a patch.
function zonePolygon(pts) {
  const h = hull(pts);
  if (h.length >= 3) return [...h, h[0]];
  const [x, y] = h[0];
  const r = 0.0006;
  return [[x - r, y - r], [x + r, y - r], [x + r, y + r], [x - r, y + r], [x - r, y - r]];
}

// The delivery part of a tour: first stop to last stop. The legs to and from the station
// are drawn separately as a faint stem (stemCoords), since stations sit far from the zones.
export function lineCoords(route, tour, upTo = tour.length) {
  const c = [];
  for (let i = 1; i < Math.min(upTo, tour.length); i++) c.push([route.lng[tour[i]], route.lat[tour[i]]]);
  return c;
}

function stemCoords(route, tour) {
  const s = [route.lng[tour[0]], route.lat[tour[0]]];
  const first = tour[1], last = tour[tour.length - 1];
  return [[s, [route.lng[first], route.lat[first]]], [[route.lng[last], route.lat[last]], s]];
}

export function createMap(container, { interactive = true } = {}) {
  const map = new maplibregl.Map({
    container, style: STYLE, attributionControl: { compact: true }, interactive,
    center: [-118.3, 34.05], zoom: 11, cooperativeGestures: interactive, fadeDuration: 0,
    // Screenshot mode for the deck keeps the last frame so headless Chrome can capture it whole.
    canvasContextAttributes: { preserveDrawingBuffer: document.documentElement.classList.contains("shot") },
  });
  if (interactive) map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
  const ready = new Promise((resolve) => {
    map.on("load", () => {
      for (const l of map.getStyle().layers) {
        try {
          if (l.type === "background") map.setPaintProperty(l.id, "background-color", C.face);
          else if (l.type === "fill" && /water/.test(l.id)) map.setPaintProperty(l.id, "fill-color", C.water);
          else if (l.type === "symbol" && /poi|housenum/.test(l.id)) map.setLayoutProperty(l.id, "visibility", "none");
        } catch { /* layer without that property */ }
      }
      map.addSource("zones", { type: "geojson", data: empty() });
      map.addSource("driver", { type: "geojson", data: empty() });
      map.addSource("lot", { type: "geojson", data: empty() });
      map.addSource("stops", { type: "geojson", data: empty() });
      map.addSource("station", { type: "geojson", data: empty() });
      map.addSource("stem", { type: "geojson", data: empty() });
      map.addLayer({ id: "stem", type: "line", source: "stem", paint: { "line-color": C.ink, "line-opacity": 0.35, "line-width": 1, "line-dasharray": [1, 3] } });
      map.addLayer({ id: "zones-fill", type: "fill", source: "zones", paint: { "fill-color": C.hull, "fill-opacity": 0.07 } });
      map.addLayer({ id: "zones-line", type: "line", source: "zones", paint: { "line-color": C.hull, "line-opacity": 0.35, "line-width": 0.8 } });
      map.addLayer({ id: "driver", type: "line", source: "driver", layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": C.graphite, "line-width": 1.6, "line-dasharray": [2, 1.6] } });
      map.addLayer({ id: "lot", type: "line", source: "lot", layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": C.cancel, "line-width": 2.6 } });
      map.addLayer({ id: "stops", type: "circle", source: "stops", paint: {
        "circle-radius": ["case", ["get", "added"], 5.5, ["get", "window"], 4, 2.6],
        "circle-color": ["case", ["get", "added"], C.cancel, ["get", "late"], C.cancel, ["get", "window"], C.manila, C.ink],
        "circle-stroke-color": C.face, "circle-stroke-width": ["case", ["get", "added"], 2, 1] } });
      map.addLayer({ id: "station", type: "circle", source: "station", paint: {
        "circle-radius": 7, "circle-color": C.face, "circle-stroke-color": C.ink, "circle-stroke-width": 3 } });
      resolve(map);
    });
  });
  return { map, ready };
}

export function showRoute(map, route, { fit = true, late = new Set() } = {}) {
  const byZone = new Map();
  for (let i = 1; i < route.n; i++) {
    const z = route.zone[i];
    if (!byZone.has(z)) byZone.set(z, []);
    byZone.get(z).push([route.lng[i], route.lat[i]]);
  }
  map.getSource("zones").setData({ type: "FeatureCollection", features: [...byZone.values()].map((pts) => ({
    type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [zonePolygon(pts)] } })) });
  const n0 = route.added ? route.n - route.added : route.n;
  map.getSource("stops").setData({ type: "FeatureCollection", features: Array.from({ length: route.n - 1 }, (_, k) => {
    const i = k + 1;
    return { type: "Feature", properties: { window: Number.isFinite(route.twEnd[i]), added: i >= n0, late: late.has(i) },
      geometry: { type: "Point", coordinates: [route.lng[i], route.lat[i]] } };
  }) });
  map.getSource("station").setData({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [route.lng[0], route.lat[0]] } });
  map.getSource("driver").setData({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: lineCoords(route, route.actual) } });
  map.getSource("stem").setData({ type: "Feature", properties: {}, geometry: { type: "MultiLineString", coordinates: stemCoords(route, route.actual) } });
  map.getSource("lot").setData(empty());
  if (fit) {
    // Fit the delivery stops. Amazon stations are often 10 to 30 km away, so the stem from
    // the station runs off the edge rather than shrinking the route to a dot.
    const b = new maplibregl.LngLatBounds();
    for (let i = 1; i < route.n; i++) b.extend([route.lng[i], route.lat[i]]);
    // Keep the route clear of the map key (top left) and the postmark (top right): the stamp
    // lands beside the route, the way a postmark sits beside the address, never on top of it.
    const w = map.getContainer().clientWidth;
    const narrow = w < 600;
    map.fitBounds(b, { padding: narrow ? { top: 120, bottom: 30, left: 24, right: 24 } : { top: 150, bottom: 40, left: 40, right: 40 }, duration: 0 });
  }
}

export function setLate(map, route, late) {
  showRoute(map, route, { fit: false, late });
}

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.classList.contains("shot");

/** Draw the re-sequenced line the way the van drives it: stop by stop, about 1.4 s in total. */
export function driveLine(map, route, tour, ms = 1400) {
  const src = map.getSource("lot");
  map.getSource("stem").setData({ type: "Feature", properties: {}, geometry: { type: "MultiLineString", coordinates: stemCoords(route, tour) } });
  if (reduced()) { src.setData({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: lineCoords(route, tour) } }); return Promise.resolve(); }
  return new Promise((resolve) => {
    const t0 = performance.now();
    const total = tour.length + 1;
    const frame = (now) => {
      const f = Math.min(1, (now - t0) / ms);
      const eased = 1 - Math.pow(1 - f, 2.2);
      const upTo = Math.max(3, Math.round(eased * total));
      src.setData({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: lineCoords(route, tour, upTo) } });
      if (f < 1) requestAnimationFrame(frame); else resolve();
    };
    requestAnimationFrame(frame);
  });
}
