// Renders the postmark and the small mark as transparent PNGs for the deck, using the site's own
// SVG code and fonts, so the deck's stamp is the same object as the website's.
// Usage: node deck/assets.mjs   (needs docs/results/summary.json and Google Chrome)
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { postmarkSVG, markSVG } from "../web/src/postmark.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = path.join(ROOT, "deck", "build");
const IMG = path.join(ROOT, "deck", "img");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
fs.mkdirSync(BUILD, { recursive: true });
fs.mkdirSync(IMG, { recursive: true });

const s = JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "results", "summary.json"), "utf8"));
const font = (fam, file, weight) =>
  `@font-face{font-family:"${fam}";font-weight:${weight};src:url("${path.join(ROOT, "node_modules", "@fontsource", file)}") format("woff2");}`;
const fonts = [
  font("IBM Plex Mono", "ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2", 500),
  font("Public Sans", "public-sans/files/public-sans-latin-600-normal.woff2", 600),
].join("");

function render(name, svg, w, h) {
  const html = `<!doctype html><meta charset="utf-8"><style>${fonts}html,body{margin:0;background:transparent}svg{display:block;width:${w}px;height:${h}px}</style>${svg}`;
  const file = path.join(BUILD, `${name}.html`);
  fs.writeFileSync(file, html);
  execFileSync(CHROME, ["--headless=new", "--hide-scrollbars", "--force-device-scale-factor=3", `--window-size=${w},${h}`,
    "--default-background-color=00000000", "--virtual-time-budget=3000", `--screenshot=${path.join(IMG, `${name}.png`)}`,
    `file://${file}`], { stdio: "ignore" });
  console.log(path.join(IMG, `${name}.png`));
}

const pct = `−${s.stats_raw.saving.toFixed(1)}%`;
render("postmark", postmarkSVG({ top: "LINE OF TRAVEL", bottom: "DATANOVA · 2026", big: pct,
  small: `${s.stats_raw.eval_routes.toLocaleString("en-US")} ROUTES` }), 600, 320);
// a test stamp with the longest centre line the site produces, to check it fits inside the ring
render("postmark-test", postmarkSVG({ top: "LINE OF TRAVEL", bottom: "DBO3 · JUL 9, 2018", big: "−23 MIN", small: "21/24 ZONES KEPT" }), 600, 320);
render("mark", markSVG(), 256, 256);
render("mark-face", markSVG("#f7f7f2"), 256, 256);
