// Frames of the finished film for the Devpost gallery, at 3:2 (1800 x 1200), into docs/devpost/.
// A frame is either cropped to 3:2 or, when its content fills the width, extended to 3:2 by
// stretching its own top and bottom rows (smoothed), so the background carries on without a seam.
//
//   node scripts/gallery.ts        after npm run render && npm run master

import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const film = join(root, "out", "line-of-travel.mp4");
const out = join(root, "..", "docs", "devpost");
mkdirSync(out, { recursive: true });

const crop = (x: number) => `[0:v]crop=1620:1080:${x}:0,scale=1800:1200:flags=lanczos`;
const extend =
  "[0:v]split=3[a][b][c];" +
  "[a]crop=1920:6:0:0,scale=48:1:flags=area,scale=1920:100:flags=bilinear[top];" +
  "[c]crop=1920:6:0:1074,scale=48:1:flags=area,scale=1920:100:flags=bilinear[bot];" +
  "[top][b][bot]vstack=inputs=3,scale=1800:1200:flags=lanczos";

const FRAMES: [string, number, string][] = [
  ["07-teaser-case", 7.9, crop(100)],
  ["08-teaser-rings", 15.95, extend],
  ["09-teaser-figures", 25.6, extend],
];

for (const [name, at, filter] of FRAMES) {
  const file = join(out, `${name}.png`);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(at), "-i", film, "-frames:v", "1", "-filter_complex", filter, file]);
  console.log(file);
}
