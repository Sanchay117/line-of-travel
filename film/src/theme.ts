import { continueRender, delayRender, staticFile } from "remotion";

// The website's own type and colours (web/src/styles.css), so the film and the page are one
// thing: a letter carrier's case, label stock, carrier ink, a graphite pencil, cancel red.

const FACES: [string, string, string, string][] = [
  ["Big Shoulders Display", "big-shoulders-display-latin-700-normal.woff2", "700", "normal"],
  ["Big Shoulders Display", "big-shoulders-display-latin-900-normal.woff2", "900", "normal"],
  ["Public Sans", "public-sans-latin-400-normal.woff2", "400", "normal"],
  ["Public Sans", "public-sans-latin-600-normal.woff2", "600", "normal"],
  ["Public Sans", "public-sans-latin-400-italic.woff2", "400", "italic"],
  ["IBM Plex Mono", "ibm-plex-mono-latin-400-normal.woff2", "400", "normal"],
  ["IBM Plex Mono", "ibm-plex-mono-latin-500-normal.woff2", "500", "normal"],
];

if (typeof document !== "undefined") {
  const handle = delayRender("fonts");
  Promise.all(
    FACES.map(([family, file, weight, style]) => {
      const face = new FontFace(family, `url(${staticFile(`fonts/${file}`)})`, { weight, style });
      return face.load().then(() => document.fonts.add(face));
    }),
  ).then(() => continueRender(handle));
}

export const fonts = {
  display: "'Big Shoulders Display', 'Arial Narrow', sans-serif",
  text: "'Public Sans', system-ui, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, monospace",
};

export const ink = {
  stock: "#eceee7",
  face: "#f7f7f2",
  rule: "#c9cec3",
  steel: "#56635a",
  steelDeep: "#3f4a43",
  steelSoft: "#dfe3da",
  ink: "#1b2230",
  ink2: "#485060",
  ink3: "#6b7280",
  night: "#121722",
  graphite: "#8b9098",
  cancel: "#c4352b",
  cancelInk: "#a32a21",
  manila: "#d9bd78",
};
