// Films the real website, scene by scene, with Chrome's screencast, resampled to a constant
// 30 fps and encoded by ffmpeg. Every scene is acted to its narration: the script reads the word
// timings in public/vo/manifest.json and clicks, drags and scrolls on the words that call for it,
// so the edit plays the footage straight. Writes:
//
//   public/capture/run.mp4     the footage, 2560 × 1440 (a 1440 × 810 page at 16/9 scale)
//   public/capture/run.json    the second each scene and its narration start, where things were on
//                              screen at each look, and what the page said (to check the script)
//
//   node scripts/capture.ts [--url http://localhost:5191]

import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "capture");
mkdirSync(outDir, { recursive: true });

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const base = flag("--url", "http://localhost:5191/");

interface Take { seconds: number; words: { text: string; start: number; end: number }[] }
const manifest = JSON.parse(readFileSync(join(root, "public", "vo", "manifest.json"), "utf8")) as { lines: Record<string, Take> };

const FPS = 30;
const VIEW = { width: 1440, height: 810 };
const SCALE = 16 / 9; // 2560 × 1440 frames, so the edit can push in without going soft
const FRAME = { w: Math.round(VIEW.width * SCALE), h: Math.round(VIEW.height * SCALE) };

const ffmpeg = spawn(
  "nice",
  ["-n", "10", "ffmpeg", "-y", "-loglevel", "error", "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", String(FPS), "-i", "-",
   "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p", "-threads", "4", "-movflags", "+faststart",
   join(outDir, "run.mp4")],
  { stdio: ["pipe", "inherit", "inherit"] },
);
ffmpeg.stdin.on("error", (e) => console.log(`ffmpeg stdin: ${e.message}`));

// Constant-rate resampling: the screencast only sends a frame when the page changes, so each
// frame is repeated until the next one's timestamp.
let t0 = 0;
let clockOffset = 0;
let written = 0;
let last: Buffer | null = null;
const fill = (until: number) => {
  const target = Math.floor((until - t0) * FPS);
  while (last && written < target) {
    ffmpeg.stdin.write(last);
    written++;
  }
};

type Box = { x: number; y: number; w: number; h: number };
const marks: Record<string, number> = {};
const boxes: Record<string, Record<string, Box | Box[]>> = {};
const notes: Record<string, string> = {};
const now = () => Math.round((Date.now() / 1000 - clockOffset - t0) * 100) / 100;
const mark = (name: string) => {
  marks[name] = now();
  console.log(`${marks[name].toFixed(2).padStart(7)}s  ${name}`);
};
const hold = (ms: number) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ channel: "chrome", headless: true, args: [`--force-device-scale-factor=${SCALE}`, "--enable-gpu-rasterization", "--ignore-gpu-blocklist"] });
const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: SCALE, colorScheme: "light", reducedMotion: "no-preference" });
const page = await context.newPage();
page.on("pageerror", (error) => console.log("pageerror", error.message));
const cdp = await context.newCDPSession(page);

/** Width and height from a JPEG's start-of-frame marker. */
function jpegSize(buf: Buffer): { w: number; h: number } | null {
  for (let p = 2; p + 9 < buf.length; ) {
    if (buf[p] !== 0xff) return null;
    const marker = buf[p + 1];
    const len = buf.readUInt16BE(p + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return { h: buf.readUInt16BE(p + 5), w: buf.readUInt16BE(p + 7) };
    p += 2 + len;
  }
  return null;
}

let odd = 0;
cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
  await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  const jpeg = Buffer.from(data, "base64");
  // Frames sent before the viewport settles come at another size; the encoder needs one size.
  const size = jpegSize(jpeg);
  if (!size || size.w !== FRAME.w || size.h !== FRAME.h) {
    if (odd++ < 3) console.log(`skipped a ${size?.w}×${size?.h} frame`);
    return;
  }
  const ts = metadata.timestamp ?? Date.now() / 1000;
  if (!t0) {
    t0 = ts;
    clockOffset = Date.now() / 1000 - ts;
  }
  fill(ts);
  last = jpeg;
});

const CURSOR_CSS = `
  html { scrollbar-width: none; scroll-behavior: auto !important; } ::-webkit-scrollbar { display: none; }
  #film-cursor { position: fixed; z-index: 10000; left: 0; top: 0; width: 24px; height: 24px; pointer-events: none;
    transition: transform 0.8s cubic-bezier(.65,0,.35,1); filter: drop-shadow(0 2px 3px rgba(27,34,48,.35)); }
  #film-cursor.fast { transition-duration: 0.12s; transition-timing-function: linear; }
  #film-cursor.press svg { transform: scale(.82); } #film-cursor svg { transition: transform .12s; }
`;
/** The film cursor and an eased scroll, added to the page. */
async function dress(from: { x: number; y: number }) {
  await page.addStyleTag({ content: CURSOR_CSS });
  await page.evaluate(({ x, y }) => {
    const c = document.createElement("div");
    c.id = "film-cursor";
    c.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24"><path d="M4 2l15 9.5-6.6 1.4L16 20l-2.6 1.3-3.6-7.3L4 18.6z" fill="#1b2230" stroke="#f7f7f2" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
    c.style.transition = "none";
    c.style.transform = `translate(${x}px, ${y}px)`;
    document.body.appendChild(c);
    requestAnimationFrame(() => (c.style.transition = ""));
    (window as unknown as Record<string, unknown>).__glide = (to: number, ms: number) =>
      new Promise<void>((done) => {
        const y0 = scrollY;
        const max = document.documentElement.scrollHeight - innerHeight;
        const goal = Math.max(0, Math.min(max, to));
        const start = performance.now();
        const step = (t: number) => {
          const p = Math.min(1, (t - start) / ms);
          const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
          scrollTo({ top: y0 + (goal - y0) * e, behavior: "instant" });
          if (p < 1) requestAnimationFrame(step);
          else done();
        };
        requestAnimationFrame(step);
      });
  }, from);
}

let cursor = { x: VIEW.width * 0.62, y: VIEW.height * 0.82 };
async function moveCursor(x: number, y: number, fast = false) {
  await page.evaluate(([px, py, f]) => {
    const c = document.getElementById("film-cursor")!;
    c.classList.toggle("fast", !!f);
    c.style.transform = `translate(${px}px, ${py}px)`;
  }, [x, y, fast] as const);
  cursor = { x, y };
}

/** Glides the film cursor onto an element (and leaves it there). */
async function point(selector: string, at = { x: 0.5, y: 0.55 }) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`nothing at ${selector}`);
  await moveCursor(box.x + Math.min(box.width * at.x, 200), box.y + box.height * at.y);
  await hold(850);
}

/** Moves the film cursor onto the element, presses, and clicks it. */
async function press(selector: string, name: string) {
  await point(selector);
  await page.evaluate(() => document.getElementById("film-cursor")!.classList.add("press"));
  await page.mouse.click(cursor.x, cursor.y);
  mark(name);
  await hold(160);
  await page.evaluate(() => document.getElementById("film-cursor")?.classList.remove("press"));
}

/** Drags a range input's thumb from one value to another, the way a hand would. */
async function slide(selector: string, from: number, to: number, max: number, name: string) {
  const box = (await page.locator(selector).boundingBox())!;
  const half = 9;
  const xOf = (v: number) => box.x + half + ((box.width - 2 * half) * v) / max;
  const y = box.y + box.height / 2;
  await moveCursor(xOf(from), y + 4);
  await hold(850);
  await page.mouse.move(xOf(from), y);
  await page.evaluate(() => document.getElementById("film-cursor")!.classList.add("press"));
  await page.mouse.down();
  const steps = 16;
  for (let s = 1; s <= steps; s++) {
    const x = xOf(from + ((to - from) * s) / steps);
    await page.mouse.move(x, y);
    await moveCursor(x, y + 4, true);
    await hold(34);
  }
  await page.mouse.up();
  mark(name);
  await page.evaluate(() => document.getElementById("film-cursor")?.classList.remove("press"));
}

/** Scrolls the page so the element's top sits `offset` px below the top of the viewport. */
async function glideTo(selector: string, ms = 1300, offset = 70) {
  await page.evaluate(
    async ([sel, dur, off]) => {
      const el = document.querySelector(sel as string);
      if (!el) return;
      const y = el.getBoundingClientRect().top + scrollY - (off as number);
      await (window as unknown as { __glide: (y: number, ms: number) => Promise<void> }).__glide(y, dur as number);
    },
    [selector, ms, offset] as const,
  );
}

/** Records where things are on screen now, in CSS pixels of the 1440 × 810 viewport. */
async function look(name: string, selectors: string[], all: string[] = []) {
  // Its own mark, so a look never moves the mark of the click it follows.
  mark(`look:${name}`);
  const found: Record<string, Box | Box[]> = {};
  const r = (b: { x: number; y: number; width: number; height: number }) => ({ x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) });
  for (const sel of selectors) {
    const b = await page.locator(sel).first().boundingBox().catch(() => null);
    if (b) found[sel] = r(b);
    else console.log(`  look ${name}: nothing at ${sel}`);
  }
  for (const sel of all) {
    const list = await page.locator(sel).all();
    const bs = [];
    for (const l of list) { const b = await l.boundingBox(); if (b) bs.push(r(b)); }
    found[sel] = bs;
  }
  boxes[name] = found;
}

const text = async (selector: string) => ((await page.locator(selector).first().innerText().catch(() => "")) || "").replace(/\s+/g, " ").trim();
/** Waits for the desk to finish a solve; the busy flag goes up a moment after the input changes. */
const deskIdle = async () => {
  await hold(200);
  await page.waitForFunction(() => !document.querySelector(".desk.busy"), null, { timeout: 30_000 });
};

// ---------- acting to the narration ----------

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
let voiceAt = 0;
let take: Take = { seconds: 0, words: [] };
/** Seconds into the current line at which the narrator starts the `nth` word beginning with `word`. */
function cue(word: string, nth = 0) {
  const hit = take.words.filter((w) => norm(w.text).startsWith(word))[nth];
  if (!hit) throw new Error(`"${word}" is not in the line`);
  return hit.start;
}
/** Waits until the narrator reaches a word, less `early` seconds. */
async function on(word: string, nth = 0, early = 0) {
  const t = voiceAt + cue(word, nth) - early;
  while (now() < t) await hold(15);
}

async function scene(id: string, before: () => Promise<void>, during: () => Promise<void>, tail = 0.45) {
  take = manifest.lines[id];
  if (!take) throw new Error(`no voice for ${id}: run npm run voice`);
  mark(id);
  await before();
  mark(`${id}:voice`);
  voiceAt = now();
  await during();
  while (now() < voiceAt + take.seconds + tail) await hold(15);
}

// ---------- the film ----------

// Load once so the fonts, tiles and route data are cached, then film from a blank page of the
// site's own stock colour, so the entrance plays in full.
await page.goto(base, { waitUntil: "load" });
await page.waitForFunction(() => document.querySelector("#hero-postmark .postmark.stamp-in"), null, { timeout: 60_000 });
await page.goto("about:blank");
await page.setContent(`<html><body style="margin:0;background:#eceee7"></body></html>`);
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 90, maxWidth: FRAME.w, maxHeight: FRAME.h, everyNthFrame: 1 });
while (!t0) await hold(20);
await hold(400);

try {
  await scene(
    "d-hero",
    async () => {
      await page.goto(base, { waitUntil: "domcontentloaded" });
      await dress(cursor);
      await hold(700);
    },
    async () => {
      await page.waitForFunction(() => !(document.getElementById("hero-run") as HTMLButtonElement).disabled, null, { timeout: 30_000 });
      await look("hero", [".hero-copy", "#hero-map", ".ledger", "#hero-run", ".wordmark"]);
      await on("resequences", 0, 0.9);
      await press("#hero-run", "hero-run");
    },
    0.2,
  );

  await scene(
    "d-stamp",
    async () => {
      await page.waitForFunction(() => document.querySelector("#hero-postmark .postmark.stamp-in"), null, { timeout: 30_000 });
      await hold(250);
      notes.postmark = (await page.locator("#hero-postmark svg").getAttribute("aria-label")) ?? "";
      await moveCursor(cursor.x - 120, cursor.y + 90);
    },
    async () => {
      await look("stamp", ["#hero-postmark", "#hero-map"]);
    },
  );

  await scene(
    "d-ledger",
    async () => {
      notes.ledger = await text(".ledger");
      // At this size the ledger's second row is below the fold: bring all four tiles up.
      await glideTo(".ledger", 1100, 330);
      await look("ledger", [".ledger", ".ledger > div:nth-child(1)", ".ledger > div:nth-child(2)", ".ledger > div:nth-child(3)", ".ledger > div:nth-child(4)"]);
    },
    async () => {
      await on("59", 0, 0.5);
      await point(".ledger > div:nth-child(1) dd", { x: 0.3, y: 0.9 });
      await on("almost", 0, 0.5);
      await point(".ledger > div:nth-child(2) dd", { x: 0.3, y: 0.9 });
      await on("one", 0, 0.5);
      await point(".ledger > div:nth-child(3) dd", { x: 0.3, y: 0.9 });
    },
  );

  await scene(
    "d-turn",
    async () => {
      await moveCursor(VIEW.width * 0.9, VIEW.height * 0.9);
      await glideTo("#turn", 1400, 40);
    },
    async () => {
      await hold(200);
      await look("turn", ["#turn-title", "#triptych"]);
      // The panels' figures are below the fold under the headline: bring the panels up whole.
      await on("here", 0, 1.2);
      await glideTo("#triptych", 1100, 70);
      await look("panels", ["#triptych", "#triptych .panel:nth-child(1)", "#triptych .panel:nth-child(2)", "#triptych .panel:nth-child(3)", "#triptych .panel:nth-child(2) dl", "#triptych .panel:nth-child(3) dl"]);
      notes.triptych = await text("#triptych");
    },
  );

  await scene(
    "d-case",
    async () => {
      await glideTo("#thread", 1400, 40);
    },
    async () => {
      await hold(200);
      await look("case", ["#thread", ".thread-copy", "#case", ".case-key"], ["#case .slot.moved", "#case .slot.merged"]);
      notes.case = `${await page.locator("#case .slot").count()} slots, ${await page.locator("#case .slot.moved:not(.merged)").count()} red, ${await page.locator("#case .slot.merged").count()} manila`;
      await on("red", 0, 0.6);
      await point("#case .slot.moved .lbl", { x: 0.5, y: 0.6 });
      await on("manila", 0, 0.6);
      await point("#case .slot.merged .lbl", { x: 0.5, y: 0.6 });
    },
  );

  await scene(
    "d-how",
    async () => {
      await moveCursor(VIEW.width * 0.92, VIEW.height * 0.9);
      await glideTo("#how", 1400, 40);
    },
    async () => {
      await hold(200);
      await look("how", ["#how", ".steps", ".steps li:nth-child(1)", ".steps li:nth-child(2)", ".steps li:nth-child(3)", ".steps li:nth-child(4)"]);
      notes.steps = await text(".steps");
    },
  );

  await scene(
    "d-desk",
    async () => {
      await glideTo("#desk", 1400, 30);
    },
    async () => {
      await hold(200);
      await look("desk", ["#desk", ".desk-grid", "#controls", "#city", "#route", "#trust", "#desk-map", "#cmp", ".readout"]);
      notes.desk = `${await page.locator("#city").inputValue()} · ${await text("#route option:checked")} · ${await text("#cmp tbody")}`;
      await on("five", 0, 0.7);
      await point("#city", { x: 0.4, y: 0.6 });
      await on("austin", 0, 0.7);
      await point("#route", { x: 0.4, y: 0.6 });
    },
  );

  await scene(
    "d-trust",
    async () => {},
    async () => {
      await on("turn", 0, 0.9);
      await slide("#trust", 2, 0, 4, "trust-off");
      await deskIdle();
      await hold(150);
      notes.trustOff = await text("#cmp tbody");
      await look("trust-off", ["#cmp", "#cmp tbody tr:nth-child(4)", "#desk-map", "#trust"]);
      await on("turn", 1, 0.9);
      await slide("#trust", 0, 2, 4, "trust-on");
      await deskIdle();
      await hold(150);
      notes.trustOn = await text("#cmp tbody");
      await look("trust-on", ["#cmp", "#cmp tbody tr:nth-child(4)", "#cmp tbody tr:nth-child(1)"]);
    },
  );

  await scene(
    "d-rush",
    async () => {},
    async () => {
      await on("add", 0, 0.9);
      await press('label:has(input[value="rush"])', "rush");
      await deskIdle();
      await hold(150);
      notes.rush = await text("#cmp");
      await look("rush", ["#cmp", "#cmp tbody tr:nth-child(3)", "#cmp tbody tr:nth-child(1)", "#scen-note", "#desk-map"]);
    },
    0.8,
  );

  await scene(
    "d-proof",
    async () => {
      await moveCursor(VIEW.width * 0.92, VIEW.height * 0.9);
      await glideTo("#proof", 1400, 40);
    },
    async () => {
      await hold(200);
      await look("proof", ["#proof", ".proof-grid", "#chart-frontier", "#chart-hist"]);
      await on("amazons", 0, 0.4);
      await glideTo("#checks", 2600, 120);
      await look("checks", ["#checks"]);
    },
  );

  await scene(
    "d-close",
    async () => {
      await glideTo(".close", 1400, 90);
    },
    async () => {
      await hold(200);
      await look("close", [".close", ".close .links"]);
      await on("code", 0, 0.8);
      await point('.close .links a[data-link="repo"]', { x: 0.5, y: 0.6 });
    },
    1.2,
  );
  mark("end");
} finally {
  await cdp.send("Page.stopScreencast").catch(() => {});
  fill(Date.now() / 1000 - clockOffset);
  ffmpeg.stdin.end();
  await new Promise((r) => ffmpeg.on("close", r));
  await browser.close();
  writeFileSync(
    join(outDir, "run.json"),
    JSON.stringify({ fps: FPS, width: FRAME.w, height: FRAME.h, view: VIEW, scale: SCALE, seconds: written / FPS, marks, boxes, notes }, null, 2) + "\n",
  );
  console.log(`\n${(written / FPS).toFixed(1)}s of footage`);
  for (const [k, v] of Object.entries(notes)) console.log(`${k}: ${v}`);
}
