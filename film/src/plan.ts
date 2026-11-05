import { staticFile } from "remotion";
import { TEASER_ANCHORS, TEASER_S } from "./beats.ts";
import { DEMO, TEASER } from "./script.ts";

export const FPS = 30;
/** Frames by which the site fades up over the teaser, and the end card over the site. */
export const OVERLAP = 12;
export const TEASER_FRAMES = TEASER_S * FPS;
export const CLOSE_FRAMES = Math.round(7.5 * FPS);

export interface Word {
  text: string;
  start: number;
  end: number;
}
export interface Take {
  file: string;
  seconds: number;
  words: Word[];
}
export type Box = { x: number; y: number; w: number; h: number };
export interface Capture {
  fps: number;
  width: number;
  height: number;
  view: { width: number; height: number };
  seconds: number;
  marks: Record<string, number>;
  boxes: Record<string, Record<string, Box | Box[]>>;
  notes: Record<string, string>;
}

export interface Shot {
  id: string;
  /** First frame of the scene in the film. */
  from: number;
  frames: number;
  /** Frame, relative to the scene, where the narrator starts. */
  voiceAt: number;
  /** Capture second the scene's footage starts at. */
  footage: number;
  take?: Take;
  text: string;
}

export interface Voice {
  id: string;
  from: number;
  frames: number;
  file: string;
}

export interface Plan {
  shots: Shot[];
  voices: Voice[];
  teaser: Record<string, Take>;
  capture: Capture;
  total: number;
}

async function load<T>(path: string): Promise<T | undefined> {
  try {
    const res = await fetch(staticFile(path));
    return res.ok ? ((await res.json()) as T) : undefined;
  } catch {
    return undefined;
  }
}

const bare = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Seconds into a take at which the narrator starts the `nth` word beginning with `word`. */
export function wordAt(take: Take, word: string, nth = 0, id = "") {
  const hit = take.words.filter((w) => bare(w.text).startsWith(word))[nth];
  if (!hit) throw new Error(`"${word}" is not in the ${id} narration`);
  return hit.start;
}

/** Seconds into the teaser at which a teaser line starts, so its anchor word lands on its hit. */
export const teaserStart = (take: Take, id: string) => TEASER_ANCHORS[id].at - wordAt(take, TEASER_ANCHORS[id].word, 0, id);

export async function makePlan(): Promise<Plan> {
  const manifest = await load<{ voice: string; lines: Record<string, Take> }>("vo/manifest.json");
  const capture = await load<Capture>("capture/run.json");
  if (!manifest || !capture) throw new Error("Run npm run voice and npm run capture first.");

  const teaser: Record<string, Take> = {};
  const voices: Voice[] = [];
  for (const line of TEASER) {
    const take = manifest.lines[line.id];
    teaser[line.id] = take;
    voices.push({ id: line.id, from: Math.round(teaserStart(take, line.id) * FPS), frames: Math.ceil(take.seconds * FPS) + 2, file: take.file });
  }

  // The demo plays the capture straight: each scene starts where the capture marked it, and the
  // narrator where the capture started acting to the line.
  const m = capture.marks;
  const shots: Shot[] = [{ id: "teaser", from: 0, frames: TEASER_FRAMES, voiceAt: 0, footage: 0, text: "" }];
  const start = TEASER_FRAMES - OVERLAP;
  DEMO.forEach((line, i) => {
    const take = manifest.lines[line.id];
    const next = DEMO[i + 1]?.id ?? "end";
    if (m[line.id] === undefined || m[next] === undefined) throw new Error(`the capture has no ${line.id} scene`);
    const from = start + Math.round((m[line.id] - m[DEMO[0].id]) * FPS);
    const frames = Math.round((m[next] - m[line.id]) * FPS);
    const voiceAt = Math.round((m[`${line.id}:voice`] - m[line.id]) * FPS);
    shots.push({ id: line.id, from, frames, voiceAt, footage: m[line.id], take, text: line.text });
    voices.push({ id: line.id, from: from + voiceAt, frames: Math.ceil(take.seconds * FPS) + 2, file: take.file });
  });
  const last = shots.at(-1)!;
  const closeFrom = last.from + last.frames - OVERLAP;
  shots.push({ id: "close", from: closeFrom, frames: CLOSE_FRAMES, voiceAt: 0, footage: 0, text: "" });
  return { shots, voices, teaser, capture, total: closeFrom + CLOSE_FRAMES };
}

/** Frame, relative to the scene, at which the narrator starts the `nth` word beginning with `word`. */
export function cue(shot: Shot, word: string, nth = 0): number {
  return shot.voiceAt + Math.round(wordAt(shot.take!, word, nth, shot.id) * FPS);
}

/** Film frame at which a teaser line reaches `word`. */
export function said(plan: Plan, id: string, word: string, nth = 0): number {
  const take = plan.teaser[id];
  return Math.round((teaserStart(take, id) + wordAt(take, word, nth, id)) * FPS);
}
