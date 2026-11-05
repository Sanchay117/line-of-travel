// Renders single frames of the film for checking, from one bundle: out/check/<frame>.jpg
//
//   node scripts/stills.ts 30 94 330 600        frames of the film
//   node scripts/stills.ts --scale 0.5 600      at half size
//   node scripts/stills.ts Thumbnail            the thumbnail

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "out", "check");
mkdirSync(out, { recursive: true });

const args = process.argv.slice(2);
const at = args.indexOf("--scale");
const scale = at >= 0 ? Number(args.splice(at, 2)[1]) : 0.5;
const id = args[0] === "Thumbnail" ? args.shift()! : "LineOfTravel";
const frames = args.map(Number);

const serveUrl = await bundle({ entryPoint: join(root, "src", "index.ts"), publicDir: join(root, "public") });
const onBrowserLog = (log: { type: string; text: string }) => {
  if (log.type === "error" || log.type === "warning") console.log(`[browser ${log.type}] ${log.text.slice(0, 800)}`);
};
// Remotion's own headless shell never paints a frame on this machine; the installed Chrome does.
const browser = { browserExecutable: process.env.REMOTION_CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", chromeMode: "chrome-for-testing" as const };
const composition = await selectComposition({ serveUrl, id, inputProps: {}, onBrowserLog, ...browser });
for (const frame of frames.length ? frames : [0]) {
  const output = join(out, `${id === "LineOfTravel" ? frame : id}.jpg`);
  await renderStill({ serveUrl, composition, frame, output, scale, imageFormat: "jpeg", jpegQuality: 88, inputProps: composition.props, ...browser });
  console.log(output);
}
console.log(`${composition.durationInFrames} frames, ${(composition.durationInFrames / composition.fps).toFixed(1)} s`);
