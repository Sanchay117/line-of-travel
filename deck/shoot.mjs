// Screenshots of the running site for the deck. Drives headless Chrome over the DevTools
// protocol, waits until the page reports the map and the solver have finished
// (window.__shotReady), then clips each element exactly.
// Usage: node deck/shoot.mjs http://localhost:5191           the deck's images
//        node deck/shoot.mjs http://localhost:5191 gallery   3:2 screens for the Devpost gallery
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "deck", "img");
const URL0 = process.argv[2] || "http://localhost:5191";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9333;
fs.mkdirSync(OUT, { recursive: true });

// name, section id to open at, CSS selector to clip (null = the viewport), viewport width, viewport
// height, padding (px), device scale, output folder
const PUB = path.join(ROOT, "web", "public");
const GALLERY = path.join(ROOT, "docs", "devpost");
const SETS = {
  deck: [
    ["hero", "hero", "#hero", 1440, 860, 0, 2, OUT],
    ["triptych", "triptych", "#triptych", 1440, 900, 12, 2, OUT],
    ["case", "case", "#case", 1440, 900, 12, 2, OUT],
    ["desk", "desk", ".desk-grid", 1440, 900, 16, 2, OUT],
    ["og", "hero", null, 1200, 630, 0, 1, PUB], // link preview image for the site
  ],
  // Whole screens at 3:2 (1440 x 960 at 1.25x = 1800 x 1200), each opened at its section.
  gallery: [
    ["02-hero", "hero", null, 1440, 960, 0, 1.25, GALLERY],
    ["03-turn", "turn", null, 1440, 960, 0, 1.25, GALLERY],
    ["04-thread", "thread", null, 1440, 960, 0, 1.25, GALLERY],
    ["05-desk", "desk", null, 1440, 960, 0, 1.25, GALLERY],
    ["06-proof", "proof", null, 1440, 960, 0, 1.25, GALLERY],
  ],
};
const SHOTS = SETS[process.argv[3] || "deck"];
for (const dir of new Set(SHOTS.map((s) => s[7]))) fs.mkdirSync(dir, { recursive: true });

const profile = fs.mkdtempSync(path.join(os.tmpdir(), "lot-shoot-"));
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--hide-scrollbars", "--no-first-run", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function target() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(200);
  }
  throw new Error("Chrome did not start");
}

function client(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const waiting = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const k = ++id;
    waiting.set(k, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
    ws.send(JSON.stringify({ id: k, method, params }));
  });
  return new Promise((resolve) => { ws.onopen = () => resolve({ send, close: () => ws.close() }); });
}

try {
  const cdp = await client(await target());
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  const evaluate = async (expr) => (await cdp.send("Runtime.evaluate", { expression: expr, returnByValue: true })).result.value;
  for (const [name, id, sel, w, h, pad, dpr, dir] of SHOTS) {
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: dpr, mobile: false });
    await cdp.send("Page.navigate", { url: `${URL0}/?shot=${id}` });
    let ready = false;
    for (let i = 0; i < 150 && !ready; i++) { await sleep(200); ready = await evaluate("window.__shotReady === true").catch(() => false); }
    if (!ready) throw new Error(`${name}: page never reported ready`);
    const measure = () => evaluate(`(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();
      return { x: b.left + scrollX, y: b.top + scrollY, w: b.width, h: b.height }; })()`);
    let r = sel ? await measure() : null;
    // Capture inside the viewport: capturing beyond it resizes the page, which clears the map's
    // WebGL canvas mid-capture. So grow the viewport to fit the element, then scroll it to the top.
    if (r && r.h + 2 * pad > h) {
      await cdp.send("Emulation.setDeviceMetricsOverride", { width: w, height: Math.ceil(r.h + 2 * pad), deviceScaleFactor: dpr, mobile: false });
      await sleep(800);
    }
    if (r) { await evaluate(`window.scrollTo(0, ${Math.max(0, r.y - pad)})`); r = await measure(); }
    // Let the map redraw after any resize or scroll, and tiles finish loading.
    await sleep(2500);
    const clip = r ? { x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad), width: r.w + 2 * pad, height: r.h + 2 * pad, scale: 1 }
      : { x: 0, y: await evaluate("scrollY"), width: w, height: h, scale: 1 };
    const shot = await cdp.send("Page.captureScreenshot", { format: "png", clip, captureBeyondViewport: false });
    const file = path.join(dir, `${name}.png`);
    fs.writeFileSync(file, Buffer.from(shot.data, "base64"));
    console.log(file);
  }
  cdp.close();
} finally {
  // Chrome keeps writing to its profile while it shuts down, so wait for it to exit first.
  const exited = new Promise((r) => chrome.once("exit", r));
  chrome.kill();
  await Promise.race([exited, sleep(5000)]);
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
