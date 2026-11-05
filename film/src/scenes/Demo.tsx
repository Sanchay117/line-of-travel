import { AbsoluteFill, interpolate, OffthreadVideo, staticFile, useCurrentFrame } from "remotion";
import type { SceneProps } from "../Film.tsx";
import { cue, FPS, type Box, type Plan, type Shot } from "../plan.ts";
import { fonts, ink } from "../theme.ts";
import { clamp, easeInOut, easeOut, ramp } from "../ui/kit.tsx";
import { Sfx, type SfxName } from "../ui/Sfx.tsx";

// The real website, filmed by scripts/capture.ts and played straight: every scene starts where
// the capture marked it. The camera and the rings are placed on the boxes the capture recorded,
// in the page's own CSS pixels (1440 × 810); the footage is 2560 × 1440, shown at 1920 × 1080.

const PAGE = { w: 1440, h: 810 };
const K = 1920 / PAGE.w;
const ZOOM_MAX = 1.9;

interface View {
  x: number;
  y: number;
  w: number;
}
interface Key {
  at: number;
  dur?: number;
  box?: Box;
  view?: View;
}
interface Spot {
  from: number;
  to?: number;
  box: Box;
}
interface Ctx {
  word: (w: string, nth?: number) => number;
  mark: (name: string) => number;
  box: (look: string, selector: string) => Box;
  boxes: (look: string, selector: string) => Box[];
}
interface Def {
  /** The chapter chip, top left; empty for none. */
  label: string;
  keys: (c: Ctx) => Key[];
  spots?: (c: Ctx) => Spot[];
  sounds?: (c: Ctx) => [number, SfxName, number][];
}

const FULL: View = { x: 0, y: 0, w: PAGE.w };

const union = (...bs: Box[]): Box => {
  const x = Math.min(...bs.map((b) => b.x));
  const y = Math.min(...bs.map((b) => b.y));
  return { x, y, w: Math.max(...bs.map((b) => b.x + b.w)) - x, h: Math.max(...bs.map((b) => b.y + b.h)) - y };
};

/** A box with extra page below it, so the captions land on empty page rather than on what is framed. */
const room = (box: Box, below = 70): Box => ({ ...box, h: box.h + below });

/** The view that frames a box with a little room, no closer than ZOOM_MAX, kept on the page. */
function frame(box: Box): View {
  const w = Math.min(PAGE.w, Math.max(PAGE.w / ZOOM_MAX, box.w * 1.14, ((box.h * 1.22) / PAGE.h) * PAGE.w));
  const h = (w / PAGE.w) * PAGE.h;
  const x = Math.min(PAGE.w - w, Math.max(0, box.x + box.w / 2 - w / 2));
  const y = Math.min(PAGE.h - h, Math.max(0, box.y + box.h / 2 - h / 2));
  return { x, y, w };
}

function camera(f: number, keys: Key[]): View {
  let v = keys[0]?.view ?? (keys[0]?.box ? frame(keys[0].box) : FULL);
  for (const key of keys.slice(1)) {
    const to = key.view ?? (key.box ? frame(key.box) : FULL);
    const p = interpolate(f, [key.at, key.at + (key.dur ?? 24)], [0, 1], { ...clamp, easing: easeInOut });
    v = { x: v.x + (to.x - v.x) * p, y: v.y + (to.y - v.y) * p, w: v.w + (to.w - v.w) * p };
  }
  // A slow push, so a held view still breathes.
  const push = 1 + f * 0.0001;
  const w = v.w / push;
  const h = (w / PAGE.w) * PAGE.h;
  const cx = v.x + v.w / 2;
  const cy = v.y + ((v.w / PAGE.w) * PAGE.h) / 2;
  return { x: Math.min(PAGE.w - w, Math.max(0, cx - w / 2)), y: Math.min(PAGE.h - h, Math.max(0, cy - h / 2)), w };
}

/** A ring drawn round something on the page, with the rest of the page dimmed behind it. */
function Ring({ spot, zoom }: { spot: Spot; zoom: number }) {
  const f = useCurrentFrame();
  const end = spot.to ?? Infinity;
  const o = Math.min(ramp(f, spot.from, 8), end === Infinity ? 1 : 1 - ramp(f, end - 6, 6));
  if (o <= 0) return null;
  const draw = ramp(f, spot.from, 14, easeOut);
  const pad = 7 * K;
  const b = { x: spot.box.x * K - pad, y: spot.box.y * K - pad, w: spot.box.w * K + pad * 2, h: spot.box.h * K + pad * 2 };
  const len = 2 * (b.w + b.h);
  return (
    <>
      <div style={{ position: "absolute", left: b.x, top: b.y, width: b.w, height: b.h, borderRadius: 5 / zoom, boxShadow: `0 0 0 4000px rgba(27,34,48,${0.3 * o})`, pointerEvents: "none" }} />
      <svg style={{ position: "absolute", left: b.x, top: b.y, overflow: "visible", opacity: o }} width={b.w} height={b.h}>
        <rect x={0} y={0} width={b.w} height={b.h} rx={5 / zoom} fill="none" stroke={ink.cancel} strokeWidth={3.4 / zoom} strokeDasharray={len} strokeDashoffset={len * (1 - draw)} />
      </svg>
    </>
  );
}

const mono = (size: number, color: string) => ({ fontFamily: fonts.mono, fontWeight: 500, fontSize: size, letterSpacing: size * 0.1, textTransform: "uppercase" as const, color, whiteSpace: "nowrap" as const });

/** The chapter in the top-left corner, wiped on when it changes. */
function Chapter({ label, fresh }: { label: string; fresh: boolean }) {
  const f = useCurrentFrame();
  const e = fresh ? ramp(f, 2, 14, easeOut) : 1;
  return (
    <div style={{ position: "absolute", left: 36, top: 92, display: "flex", alignItems: "center", padding: "10px 18px 10px 14px", background: "rgba(27,34,48,0.9)", borderLeft: `4px solid ${ink.cancel}`, clipPath: `inset(0 ${100 - 100 * e}% 0 0)`, zIndex: 40 }}>
      <span style={mono(16, ink.face)}>{label}</span>
    </div>
  );
}

/** What the footage is, top right: the real site, solving in the browser. */
function Tag() {
  const f = useCurrentFrame();
  const pulse = 0.55 + 0.45 * Math.abs(Math.sin(f / 9));
  return (
    <div style={{ position: "absolute", right: 36, top: 92, display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: "rgba(27,34,48,0.9)", zIndex: 40 }}>
      <span style={{ width: 9, height: 9, borderRadius: 5, background: ink.cancel, opacity: pulse }} />
      <span style={mono(14, "#c9ced6")}>Real footage · the site, solving in the browser</span>
    </div>
  );
}

const DEFS: Record<string, Def> = {
  "d-hero": {
    label: "",
    keys: () => [{ at: 0, view: FULL }],
    spots: (c) => [{ from: c.mark("hero-run") - 24, to: c.mark("hero-run") + 34, box: c.box("hero", "#hero-run") }],
    sounds: (c) => [[c.mark("hero-run"), "press", 0.4]],
  },
  "d-stamp": {
    label: "Route DBO3 · Boston · 154 stops",
    keys: (c) => [{ at: 0, view: FULL }, { at: 0, dur: 26, box: c.box("stamp", "#hero-map") }, { at: c.word("twentythree") - 8, dur: 22, box: c.box("stamp", "#hero-postmark") }],
    spots: (c) => [{ from: c.word("twenty") + 2, box: c.box("stamp", "#hero-postmark") }],
    sounds: (c) => [[c.mark("d-stamp:voice") - 8, "stamp", 0.45]],
  },
  "d-ledger": {
    label: "Held-out results · 3,052 routes",
    keys: (c) => [{ at: 0, view: FULL }, { at: c.mark("look:ledger") - 4, dur: 26, box: c.box("ledger", ".ledger") }],
    spots: (c) => [
      { from: c.word("59") - 2, to: c.word("almost") - 2, box: c.box("ledger", ".ledger > div:nth-child(1)") },
      { from: c.word("almost"), to: c.word("one") - 2, box: c.box("ledger", ".ledger > div:nth-child(2)") },
      { from: c.word("one"), box: c.box("ledger", ".ledger > div:nth-child(3)") },
    ],
  },
  "d-turn": {
    label: "The same stops, three ways",
    keys: (c) => [
      { at: 0, view: FULL },
      { at: c.mark("look:panels") - 6, dur: 26, box: room(c.box("panels", "#triptych .panel:nth-child(2)"), 50) },
      { at: c.word("line") - 6, dur: 26, box: room(c.box("panels", "#triptych .panel:nth-child(3)"), 50) },
    ],
    spots: (c) => [
      { from: c.word("back"), to: c.word("line") - 4, box: c.box("panels", "#triptych .panel:nth-child(2) dl") },
      { from: c.word("never"), box: c.box("panels", "#triptych .panel:nth-child(3) dl") },
    ],
    sounds: () => [[2, "paper", 0.25]],
  },
  "d-case": {
    label: "Where the name comes from",
    keys: (c) => [{ at: 0, view: FULL }, { at: c.word("here") - 6, dur: 28, box: room(union(c.box("case", "#case"), c.box("case", ".case-key")), 90) }],
    spots: (c) => [
      ...c.boxes("case", "#case .slot.moved").map((box) => ({ from: c.word("red"), to: c.word("manila") - 2, box })),
      ...c.boxes("case", "#case .slot.merged").map((box) => ({ from: c.word("manila"), box })),
    ],
    sounds: () => [[2, "paper", 0.25]],
  },
  "d-how": {
    label: "How it works",
    keys: (c) => [
      { at: 0, view: FULL },
      { at: c.word("lightgbm") - 6, dur: 26, box: union(c.box("how", ".steps li:nth-child(1)"), c.box("how", ".steps li:nth-child(2)")) },
      { at: c.word("then") - 6, dur: 26, box: union(c.box("how", ".steps li:nth-child(3)"), c.box("how", ".steps li:nth-child(4)")) },
    ],
    spots: (c) => [{ from: c.word("68"), to: c.word("then") - 4, box: c.box("how", ".steps li:nth-child(2)") }],
    sounds: () => [[2, "paper", 0.25]],
  },
  "d-desk": {
    label: "Dispatch desk",
    keys: () => [{ at: 0, view: FULL }],
    spots: (c) => [
      { from: c.word("five") + 4, to: c.word("austin") - 2, box: c.box("desk", "#city") },
      { from: c.word("austin") + 4, box: c.box("desk", "#route") },
    ],
    sounds: () => [[2, "paper", 0.25]],
  },
  "d-trust": {
    label: "Dispatch desk · trust the driver",
    keys: (c) => [
      { at: 0, view: FULL },
      { at: c.mark("look:trust-off") + 6, dur: 26, box: union(c.box("trust-off", "#cmp"), c.box("trust-off", "#desk-map")) },
      { at: c.word("turn", 1) - 10, dur: 22, view: FULL },
      { at: c.mark("look:trust-on") + 6, dur: 26, box: union(c.box("trust-on", "#cmp"), c.box("trust-off", "#desk-map")) },
    ],
    spots: (c) => [
      { from: c.word("19"), to: c.word("turn", 1) - 6, box: c.box("trust-off", "#cmp tbody tr:nth-child(4)") },
      { from: c.word("zero"), to: c.word("8") - 2, box: c.box("trust-on", "#cmp tbody tr:nth-child(4)") },
      { from: c.word("8"), box: c.box("trust-on", "#cmp tbody tr:nth-child(1)") },
    ],
    sounds: (c) => [[c.mark("trust-off"), "tick", 0.35], [c.mark("trust-on"), "tick", 0.35]],
  },
  "d-rush": {
    label: "Dispatch desk · what if",
    keys: (c) => [{ at: 0, view: FULL }, { at: c.mark("look:rush") - 4, dur: 26, box: c.box("rush", "#cmp") }],
    spots: (c) => [
      { from: c.word("three"), to: c.word("17") - 4, box: c.box("rush", "#cmp tbody tr:nth-child(3)") },
      { from: c.word("17"), box: c.box("rush", "#cmp tbody tr:nth-child(1)") },
    ],
    sounds: (c) => [[c.mark("rush"), "press", 0.4]],
  },
  "d-proof": {
    label: "Evidence",
    keys: () => [{ at: 0, view: FULL }],
    sounds: () => [[2, "paper", 0.25]],
  },
  "d-close": {
    label: "",
    keys: () => [{ at: 0, view: FULL }],
    spots: (c) => [{ from: c.word("code") + 6, box: c.box("close", ".close .links") }],
    sounds: () => [[2, "paper", 0.25]],
  },
};

function context(shot: Shot, plan: Plan): Ctx {
  const cap = plan.capture;
  const box = (look: string, selector: string) => {
    const b = cap.boxes[look]?.[selector];
    if (!b || Array.isArray(b)) throw new Error(`the capture has no box for ${selector} at ${look}`);
    return b;
  };
  const boxes = (look: string, selector: string) => {
    const b = cap.boxes[look]?.[selector];
    if (!Array.isArray(b)) throw new Error(`the capture has no boxes for ${selector} at ${look}`);
    return b;
  };
  const mark = (name: string) => {
    if (cap.marks[name] === undefined) throw new Error(`the capture has no mark ${name}`);
    return Math.round((cap.marks[name] - shot.footage) * FPS);
  };
  return { word: (w, nth = 0) => cue(shot, w, nth), mark, box, boxes };
}

export function Demo({ shot, plan }: SceneProps) {
  const f = useCurrentFrame();
  const def = DEFS[shot.id];
  const c = context(shot, plan);
  const v = camera(f, def.keys(c));
  const spots = def.spots?.(c) ?? [];
  const zoom = PAGE.w / v.w;
  const prev = plan.shots[plan.shots.findIndex((s) => s.id === shot.id) - 1];
  const fresh = !prev || DEFS[prev.id]?.label !== def.label;
  return (
    <AbsoluteFill style={{ background: ink.stock, overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: `translate(${-v.x * K * zoom}px, ${-v.y * K * zoom}px) scale(${zoom})`, transformOrigin: "0 0" }}>
        <OffthreadVideo src={staticFile("capture/run.mp4")} trimBefore={Math.round(shot.footage * FPS)} muted style={{ width: "100%", height: "100%", display: "block" }} />
        {spots.map((s, i) => (
          <Ring key={i} spot={s} zoom={zoom} />
        ))}
      </AbsoluteFill>
      <AbsoluteFill style={{ pointerEvents: "none", background: "radial-gradient(ellipse at 50% 50%, transparent 64%, rgba(18,23,34,0.16) 100%)" }} />
      {def.label && <Chapter label={def.label} fresh={fresh} />}
      <Tag />
      {(def.sounds?.(c) ?? []).map(([at, name, volume], i) => (
        <Sfx key={i} name={name} at={at} volume={volume} />
      ))}
    </AbsoluteFill>
  );
}
