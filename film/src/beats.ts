// The teaser's grid, shared by the score (scripts/music.ts) and the picture (scenes/Teaser.tsx),
// in seconds. 120 BPM: a beat is 0.5 s (15 frames), a bar 2 s (60 frames).

export const BEAT = 0.5;
export const BAR = 4 * BEAT;
const SIXTEENTH = BEAT / 4;
const THIRTYSECOND = BEAT / 8;

/** Sixteen letters flicked into the case on the eighths. */
export const LETTERS_S = Array.from({ length: 16 }, (_, i) => 0.5 + i * 2 * SIXTEENTH);
/** The line of travel drawn through the case, as the narrator says its name. */
export const THREAD_S: [number, number] = [6.5, 7.75];
/** The route's stops landing on the map. */
export const DOTS_S = Array.from({ length: 16 }, (_, i) => 8 + i * SIXTEENTH / 2);
/** Zone re-entries on the hero route's shortest path (scripts/route.ts prints it). */
export const RINGS = 23;
/** One ring for each, on the thirty-seconds, from "doubling back". */
export const RINGS_S = Array.from({ length: RINGS }, (_, i) => 14.5 + i * THIRTYSECOND);
/** The site's 36 sample routes, one tile each, on the thirty-seconds. */
export const TILES_S = Array.from({ length: 36 }, (_, i) => 16.5 + i * THIRTYSECOND);
export const DROP_S = 20;
/** The two figures stamped on after the drop. */
export const FIGURES_S = [22, 24];
export const STRIKE_S = 28;
/** The teaser's length; the demo fades up over its last frames. */
export const TEASER_S = 30;

/** Where each teaser line sits: the word that lands on a hit, and when. */
export const TEASER_ANCHORS: Record<string, { word: string; at: number }> = {
  "t-case": { word: "every", at: 0.3 },
  "t-name": { word: "line", at: THREAD_S[0] },
  "t-amazon": { word: "amazon", at: 8.3 },
  "t-tsp": { word: "doubling", at: RINGS_S[0] },
  "t-learn": { word: "so", at: 16 },
  "t-drop": { word: "line", at: DROP_S },
  "t-less": { word: "six", at: FIGURES_S[0] - 0.1 },
  "t-whole": { word: "zones", at: FIGURES_S[1] },
  "t-close": { word: "detours", at: STRIKE_S },
};
