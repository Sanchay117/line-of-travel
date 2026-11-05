import type { CSSProperties } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import route from "../../public/route.json";
import { DOTS_S, DROP_S, FIGURES_S, LETTERS_S, RINGS, RINGS_S, STRIKE_S, THREAD_S, TILES_S } from "../beats.ts";
import type { SceneProps } from "../Film.tsx";
import { FPS, said, type Plan } from "../plan.ts";
import { fonts, ink } from "../theme.ts";
import { Camera, clamp, easeIn, easeInOut, easeOut, Flash, Grain, Label, Mark, Postmark, ramp, Rolling, Slam, StampIn, Typed } from "../ui/kit.tsx";

// The teaser is cut to its score (scripts/music.ts, on the grid in src/beats.ts): 120 BPM, so a
// beat is 15 frames and a bar 60. Every number below is a hit in the music. Everything drawn is
// real: the route is the site's hero route, solved by the site's engine (scripts/route.ts), and
// the figures are the held-out results in web/public/data/summary.json.

const F = (s: number) => Math.round(s * FPS);
const LETTERS = LETTERS_S.map(F);
const THREAD = THREAD_S.map(F);
const DOTS = F(DOTS_S[0]);
const RING = RINGS_S.map(F);
const TILES = TILES_S.map(F);
export const DROP = F(DROP_S);
const FIGURES = FIGURES_S.map(F);
export const STRIKE = F(STRIKE_S);
const MAP = F(8);
const SHORTEST = F(12);
const LEARN = F(16);
const SILENCE = F(19.5);
const CLOSE = F(26) - 8;

if (route.reentries.tsp.length !== RINGS) throw new Error(`the score has ${RINGS} rings, the route ${route.reentries.tsp.length}`);

const mono = (size: number, color: string = ink.ink2, extra?: CSSProperties): CSSProperties => ({
  fontFamily: fonts.mono,
  fontWeight: 500,
  fontSize: size,
  letterSpacing: size * 0.1,
  textTransform: "uppercase",
  color,
  whiteSpace: "nowrap",
  ...extra,
});

/** A label typed in the top-left corner, with the site's red tick. */
function Slate({ at, text, color = ink.ink2, top = 96 }: { at: number; text: string; color?: string; top?: number }) {
  const f = useCurrentFrame();
  return (
    <div style={{ position: "absolute", left: 120, top, display: "flex", alignItems: "center", gap: 16, opacity: ramp(f, at - 2, 6), zIndex: 20 }}>
      <span style={{ width: 34 * ramp(f, at, 10), height: 2, background: ink.cancel }} />
      <Typed at={at + 4} text={text} cps={46} caret={false} style={mono(19, color)} />
    </div>
  );
}

// ─── 1. The carrier case: sixteen slots, a letter flicked into each on the eighths ───

const CASE = { x: 230, y: 236, w: 1460, h: 560, pad: 30, gap: 14, cols: 8, rows: 2, label: 38 };
const SLOT_W = (CASE.w - 2 * CASE.pad - (CASE.cols - 1) * CASE.gap) / CASE.cols;
const SLOT_H = (CASE.h - 2 * CASE.pad - (CASE.rows - 1) * CASE.gap) / CASE.rows;
const slot = (i: number) => {
  const c = i % CASE.cols;
  const r = Math.floor(i / CASE.cols);
  return { x: CASE.x + CASE.pad + c * (SLOT_W + CASE.gap), y: CASE.y + CASE.pad + r * (SLOT_H + CASE.gap) };
};
const HOUSES = Array.from({ length: 16 }, (_, i) => `${2 + i * 2} ELM ST`);

function Letter({ at, i }: { at: number; i: number }) {
  const f = useCurrentFrame();
  const t = f - at;
  if (t < -2) return null;
  const s = slot(i);
  const w = SLOT_W - 30;
  const h = 128;
  const rest = s.y + SLOT_H - CASE.label - h + 22;
  const y = interpolate(t, [-2, 4, 7, 10], [s.y - h - 40, rest + 8, rest - 3, rest], { ...clamp, easing: easeIn });
  const tilt = (i % 3) - 1;
  return (
    <div style={{ position: "absolute", left: s.x + 15, top: y, width: w, height: h, background: ink.face, boxShadow: "0 2px 0 rgba(27,34,48,.12)", transform: `rotate(${tilt * 1.4}deg)`, opacity: interpolate(t, [-2, 1], [0, 1], clamp) }}>
      <div style={{ position: "absolute", right: 10, top: 10, width: 22, height: 26, background: ink.cancel, opacity: 0.85 }} />
      <div style={{ position: "absolute", left: 14, top: 58, width: w * 0.6, height: 4, background: ink.graphite, opacity: 0.7 }} />
      <div style={{ position: "absolute", left: 14, top: 70, width: w * 0.45, height: 4, background: ink.graphite, opacity: 0.5 }} />
      <div style={{ position: "absolute", left: 14, top: 82, width: w * 0.52, height: 4, background: ink.graphite, opacity: 0.5 }} />
    </div>
  );
}

/** The red thread through the case, in the order the carrier walks: along a row, then back to the next. */
function threadPath() {
  const c = Array.from({ length: 16 }, (_, i) => {
    const s = slot(i);
    return [s.x + SLOT_W / 2, s.y + SLOT_H * 0.42];
  });
  // The way back runs along the divider between the rows, clear of the address strips.
  const divider = slot(0).y + SLOT_H + CASE.gap / 2;
  let d = `M${c[0][0] - 60} ${c[0][1]} L${c[0][0]} ${c[0][1]}`;
  for (let i = 1; i < c.length; i++) {
    const [x, y] = c[i];
    const [px, py] = c[i - 1];
    if (y === py) d += ` L${x} ${y}`;
    else d += ` C${px + 110} ${py}, ${px + 110} ${divider}, ${px} ${divider} L${x} ${divider} C${x - 110} ${divider}, ${x - 110} ${y}, ${x} ${y}`;
  }
  return d + ` L${c[15][0] + 60} ${c[15][1]}`;
}
const THREAD_D = threadPath();

function CarrierCase({ plan }: { plan: Plan }) {
  const f = useCurrentFrame();
  const enter = ramp(f, 0, 22);
  const draw = interpolate(f, [THREAD[0], THREAD[1]], [0, 1], { ...clamp, easing: easeInOut });
  const named = said(plan, "t-name", "travel");
  const out = ramp(f, MAP - 8, 8, easeIn);
  return (
    <AbsoluteFill style={{ background: ink.stock }}>
      <Camera hits={LETTERS} power={2.4} push={0.0005} style={{ opacity: 1 - out, transform: `scale(${1 + out * 0.08})` }}>
        <div style={{ position: "absolute", left: CASE.x, top: CASE.y, width: CASE.w, height: CASE.h, background: ink.steel, borderRadius: 6, boxShadow: "0 30px 60px rgba(27,34,48,.18), inset 0 0 0 3px rgba(0,0,0,.08)", transform: `translateY(${(1 - enter) * 60}px)`, opacity: enter }}>
          {Array.from({ length: 16 }, (_, i) => {
            const s = slot(i);
            return (
              <div key={i} style={{ position: "absolute", left: s.x - CASE.x, top: s.y - CASE.y, width: SLOT_W, height: SLOT_H, background: ink.steelDeep, boxShadow: "inset 0 10px 18px rgba(0,0,0,.35)", overflow: "hidden" }}>
                <div style={{ position: "absolute", left: 10, top: 8, fontFamily: fonts.text, fontWeight: 600, fontSize: 30, color: ink.face, opacity: 0.9 }}>{i + 1}</div>
              </div>
            );
          })}
        </div>
        {LETTERS.map((at, i) => (
          <Letter key={i} at={at} i={i} />
        ))}
        {/* Label strips sit in front of the letters, as the front lip of each slot. */}
        {Array.from({ length: 16 }, (_, i) => {
          const s = slot(i);
          return (
            <div key={i} style={{ position: "absolute", left: s.x, top: s.y + SLOT_H - CASE.label, width: SLOT_W, height: CASE.label, background: ink.face, display: "flex", alignItems: "center", padding: "0 10px", opacity: enter, transform: `translateY(${(1 - enter) * 60}px)` }}>
              <span style={mono(15, ink.ink, { letterSpacing: 1.2 })}>{HOUSES[i]}</span>
            </div>
          );
        })}
        <svg width={1920} height={1080} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
          <path d={THREAD_D} fill="none" stroke={ink.cancel} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw} style={{ filter: "drop-shadow(0 3px 2px rgba(27,34,48,.25))" }} />
        </svg>
        <div style={{ position: "absolute", left: 0, right: 0, top: CASE.y + CASE.h + 52, textAlign: "center", opacity: ramp(f, named - 4, 8) }}>
          <Slam at={named} from={1.25}>
            <span style={{ fontFamily: fonts.display, fontWeight: 900, fontSize: 92, letterSpacing: "0.01em", color: ink.cancel, textTransform: "uppercase" }}>Line of Travel</span>
          </Slam>
          <div style={mono(18, ink.ink2, { marginTop: 10, opacity: ramp(f, named + 10, 10) })}>US Postal Service · the order a carrier delivers in</div>
        </div>
      </Camera>
      <Slate at={8} text="A letter carrier's case · one slot per stop" />
      <Grain amount={0.13} edge={0.16} />
    </AbsoluteFill>
  );
}

// ─── 2. The route: Boston, 154 stops. The driver's order, then the shortest path doubling back ───

const P = route.pts as number[][];
const pathOf = (tour: number[]) => tour.slice(1).map((i, k) => `${k ? "L" : "M"}${P[i][0]} ${P[i][1]}`).join("");
const DRIVER_D = pathOf(route.tours.driver);
const TSP_D = pathOf(route.tours.tsp);
const LOT_D = pathOf(route.tours.lot);
const HULLS = route.hulls.map((h) => (h.hull.length ? `M${h.hull.map((p) => p.join(" ")).join(" L")} Z` : ""));
const ORDER = new Map(route.tours.driver.slice(1).map((s, k) => [s, k]));
const hours = (s: number) => `${Math.floor(s / 3600)} H ${String(Math.round((s % 3600) / 60)).padStart(2, "0")} MIN`;
const pct = (a: number, b: number) => `${a < b ? "−" : "+"}${Math.abs((100 * (a - b)) / b).toFixed(1)}%`;

/** A tour drawn on, through a mask driven along it, so a dashed line stays dashed while it draws. */
function Drawn({ id, d, p, color, width, dash, opacity = 1 }: { id: string; d: string; p: number; color: string; width: number; dash?: string; opacity?: number }) {
  return (
    <>
      <mask id={`m-${id}`} maskUnits="userSpaceOnUse" x={0} y={0} width={1920} height={1080}>
        <path d={d} fill="none" stroke="#fff" strokeWidth={width + 10} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p} />
      </mask>
      <path d={d} mask={`url(#m-${id})`} fill="none" stroke={color} strokeWidth={width} strokeDasharray={dash} strokeLinejoin="round" strokeLinecap="round" opacity={opacity} />
    </>
  );
}

function RouteMap({ plan }: { plan: Plan }) {
  const f = useCurrentFrame();
  const drv = interpolate(f, [F(8.6), F(11.6)], [0, 1], { ...clamp, easing: easeInOut });
  const tsp = interpolate(f, [SHORTEST + 2, F(14.4)], [0, 1], { ...clamp, easing: easeInOut });
  const ghost = 1 - 0.78 * ramp(f, SHORTEST, 12);
  const shown = RING.filter((r) => f >= r).length;
  const away = ramp(f, LEARN, 16, easeInOut);
  const m = route.metrics;
  const shortest = f >= SHORTEST;
  const nobody = said(plan, "t-amazon", "nobody");
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse 80% 75% at 50% 50%, #1b2230 0%, ${ink.night} 70%)` }}>
      <Camera hits={[MAP, ...RING]} power={2.2} push={0.0004} from={MAP} style={{ opacity: 1 - away, transform: `scale(${1 - away * 0.35})` }}>
        <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
          {HULLS.map((d, i) => (
            <path key={i} d={d} fill={ink.steelSoft} fillOpacity={0.05 * ramp(f, MAP + 6, 20)} stroke={ink.face} strokeOpacity={0.12 * ramp(f, MAP + 6, 20)} strokeWidth={1.2} strokeLinejoin="round" />
          ))}
          <Drawn id="drv" d={DRIVER_D} p={drv} color="#a9aeb7" width={2.6} dash="7 6" opacity={ghost} />
          <Drawn id="tsp" d={TSP_D} p={tsp} color={ink.face} width={2.8} />
          {P.map((p, i) => {
            if (!i) return null;
            const at = DOTS + ((ORDER.get(i) ?? 0) / (P.length - 1)) * 28;
            const e = ramp(f, at, 6);
            return <circle key={i} cx={p[0]} cy={p[1]} r={4.2 * e} fill={ink.face} opacity={0.82} />;
          })}
          {route.reentries.tsp.map((stop, k) => {
            const t = f - RING[k];
            if (t < 0) return null;
            const r = interpolate(t, [0, 5, 9], [4, 22, 16], clamp);
            return (
              <g key={k}>
                <circle cx={P[stop][0]} cy={P[stop][1]} r={r} fill="none" stroke={ink.cancel} strokeWidth={3.4} />
                <circle cx={P[stop][0]} cy={P[stop][1]} r={r * 1.8} fill={ink.cancel} opacity={interpolate(t, [0, 10], [0.35, 0], clamp)} />
              </g>
            );
          })}
        </svg>
      </Camera>
      <div style={{ position: "absolute", right: 120, top: 92, textAlign: "right", opacity: (1 - away) * ramp(f, F(9.4), 10) }}>
        <Label color={shortest ? ink.face : "#a9aeb7"} size={20}>{shortest ? "Shortest path" : "The driver's order"}</Label>
        <div style={mono(18, "#a9aeb7", { marginTop: 10 })}>{shortest ? `${pct(m.tsp.travel, m.driver.travel)} drive time` : `${hours(m.driver.travel)} · ${m.driver.reentries} zone re-entry`}</div>
        {f >= RING[0] && (
          <div style={{ marginTop: 26 }}>
            <div style={{ fontFamily: fonts.display, fontWeight: 900, fontSize: 168, lineHeight: 0.9, color: ink.cancel }}>{shown}</div>
            <div style={mono(18, ink.face, { marginTop: 8 })}>Times it drives back</div>
            <div style={mono(18, ink.face)}>into a finished zone</div>
          </div>
        )}
      </div>
      <div style={{ position: "absolute", left: 120, bottom: 96, opacity: (1 - away) * ramp(f, nobody, 8) * (1 - ramp(f, SHORTEST - 6, 6)) }}>
        <div style={{ fontFamily: fonts.text, fontStyle: "italic", fontSize: 40, color: ink.face }}>Nobody wrote it down.</div>
      </div>
      <Slate at={MAP + 4} text={`Amazon · ${route.station} · Boston · ${route.stops} stops · ${route.zones} zones`} color="#c9ced6" />
      <Grain amount={0.12} edge={0.4} dark />
    </AbsoluteFill>
  );
}

// ─── 3. Six thousand real routes: every sample route on the site, in its driver's order ───

const TILE = { size: 128, gap: 18, cols: 12 };
const TILE_LEFT = (1920 - (TILE.cols * TILE.size + (TILE.cols - 1) * TILE.gap)) / 2;
// The hero route first, where the map shrank to.
const WALL = [...route.tiles].sort((a, b) => (a.station === route.station ? -1 : 0) - (b.station === route.station ? -1 : 0));

function Wall({ plan }: { plan: Plan }) {
  const f = useCurrentFrame();
  const six = said(plan, "t-learn", "six");
  const gone = f >= SILENCE;
  if (gone) return <AbsoluteFill style={{ background: "#0b0e15" }} />;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse 80% 75% at 50% 50%, #1b2230 0%, ${ink.night} 70%)` }}>
      <Camera hits={TILES.filter((_, i) => i % 6 === 0)} power={1.6} push={0.0008} from={LEARN} origin="50% 40%">
        {WALL.map((tile, i) => {
          const at = TILES[i];
          const e = ramp(f, at, 8);
          if (e <= 0) return null;
          const c = i % TILE.cols;
          const r = Math.floor(i / TILE.cols);
          const s = TILE.size - 20;
          const d = tile.pts.map((p, k) => `${k ? "L" : "M"}${(10 + p[0] * s).toFixed(1)} ${(10 + p[1] * s).toFixed(1)}`).join("");
          return (
            <div key={i} style={{ position: "absolute", left: TILE_LEFT + c * (TILE.size + TILE.gap), top: 172 + r * (TILE.size + TILE.gap), width: TILE.size, height: TILE.size, background: ink.face, borderRadius: 3, transform: `scale(${0.7 + 0.3 * e})`, opacity: e }}>
              <svg width={TILE.size} height={TILE.size}>
                <path d={d} fill="none" stroke={i === 0 ? ink.cancel : ink.ink2} strokeWidth={1.4} strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - ramp(f, at, 10, easeInOut)} />
              </svg>
              <div style={mono(10, ink.ink3, { position: "absolute", left: 6, bottom: 4, letterSpacing: 1 })}>{tile.station}</div>
            </div>
          );
        })}
        <div style={{ position: "absolute", left: 0, right: 0, top: 652, textAlign: "center", opacity: ramp(f, six - 3, 6) }}>
          <div style={{ fontFamily: fonts.display, fontWeight: 900, fontSize: 220, lineHeight: 0.9, color: ink.face }}>
            <Rolling at={six - 2} value="6,112" dur={34} />
          </div>
          <div style={mono(22, "#c9ced6", { marginTop: 18 })}>Real Amazon routes · in the order drivers actually drove</div>
        </div>
      </Camera>
      <Slate at={LEARN + 6} text="Amazon Last Mile Routing Research Challenge · 2021" color="#c9ced6" />
      <Grain amount={0.12} edge={0.4} dark />
    </AbsoluteFill>
  );
}

// ─── 4. The drop: the name, over the route it drives ───

function Name() {
  const f = useCurrentFrame();
  const lot = interpolate(f, [DROP, DROP + 50], [0, 1], { ...clamp, easing: easeOut });
  return (
    <AbsoluteFill style={{ background: ink.stock }}>
      <Camera hits={[DROP, DROP + 6]} power={14} push={0.0008} from={DROP}>
        <svg width={1920} height={1080} style={{ position: "absolute", inset: 0, opacity: 0.5 }}>
          {HULLS.map((d, i) => (
            <path key={i} d={d} fill={ink.steelSoft} fillOpacity={0.6} stroke={ink.rule} strokeWidth={1.2} />
          ))}
          <Drawn id="lot" d={LOT_D} p={lot} color={ink.cancel} width={4} />
        </svg>
        <div style={{ position: "absolute", left: 0, right: 0, top: 190, textAlign: "center", fontFamily: fonts.display, fontWeight: 900, fontSize: 330, lineHeight: 0.84, letterSpacing: "-0.005em", textTransform: "uppercase" }}>
          <div>
            <Slam at={DROP} from={1.5}>
              <span style={{ color: ink.ink }}>Line of</span>
            </Slam>
          </div>
          <div>
            <Slam at={DROP + 6} from={1.6}>
              <span style={{ color: ink.cancel }}>Travel</span>
            </Slam>
          </div>
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 820, display: "flex", justifyContent: "center", alignItems: "center", gap: 18, opacity: ramp(f, DROP + 14, 8) }}>
          <Mark size={44} draw={ramp(f, DROP + 14, 16)} />
          <Typed at={DROP + 16} text="DataNova 2026 · DN-OR-01 · driver-aware last-mile routing" cps={60} caret={false} style={mono(20, ink.ink2)} />
        </div>
      </Camera>
      <Grain amount={0.13} edge={0.16} />
      <Flash at={DROP} dur={9} peak={1} color="#ffffff" blend="normal" />
    </AbsoluteFill>
  );
}

// ─── 5. The two figures, from the 3,052 held-out routes ───

function Figure({ at, value, color, label, sub, x }: { at: number; value: string; color: string; label: string; sub: string; x: number }) {
  const f = useCurrentFrame();
  return (
    <div style={{ position: "absolute", left: x, top: 250, width: 820, opacity: ramp(f, at - 2, 4) }}>
      <Label color="#c9ced6" size={22}>{label}</Label>
      <div style={{ fontFamily: fonts.display, fontWeight: 900, fontSize: 330, lineHeight: 0.92, color, marginTop: 6 }}>
        <Slam at={at} from={1.45}>{value}</Slam>
      </div>
      <div style={mono(19, "#a9aeb7", { marginTop: 16, opacity: ramp(f, at + 10, 8) })}>{sub}</div>
    </div>
  );
}

function Figures() {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse 80% 75% at 50% 45%, #1b2230 0%, ${ink.night} 72%)` }}>
      <Camera hits={FIGURES} power={12} push={0.0006} from={FIGURES[0]}>
        <Figure at={FIGURES[0]} x={150} value="−5.9%" color={ink.face} label="Drive time vs the driver" sub="3,052 held-out routes · 95% CI 5.8 to 6.1" />
        <Figure at={FIGURES[1]} x={1040} value="0.01" color={ink.cancel} label="Zone re-entries per route" sub="Drivers 1.4 · shortest path 15.7" />
        <div style={{ position: "absolute", left: 150, right: 150, top: 800, borderTop: "1px solid rgba(247,247,242,.18)", paddingTop: 26, opacity: ramp(f, FIGURES[1] + 14, 6) }}>
          <Typed at={FIGURES[1] + 16} text="Late stops · drivers 469 · Line of Travel 1 · of 28,354 with a time window" cps={70} caret={false} style={mono(22, ink.face)} />
        </div>
      </Camera>
      <Grain amount={0.12} edge={0.4} dark />
    </AbsoluteFill>
  );
}

// ─── 6. Keep the order. Remove the detours. Stamped. ───

function Close({ plan }: { plan: Plan }) {
  const f = useCurrentFrame();
  const keep = said(plan, "t-close", "keep");
  const remove = said(plan, "t-close", "remove");
  const line = (at: number, text: string, color: string) => (
    <div style={{ fontFamily: fonts.display, fontWeight: 900, fontSize: 170, lineHeight: 0.95, textTransform: "uppercase", color }}>
      <Slam at={at} from={1.3}>{text}</Slam>
    </div>
  );
  return (
    <AbsoluteFill style={{ background: ink.stock }}>
      <Camera hits={[keep, remove, STRIKE]} power={9} push={0.0005} from={CLOSE}>
        <div style={{ position: "absolute", left: 150, top: 220 }}>
          {line(keep, "Keep the order.", ink.ink)}
          {line(remove, "Remove the detours.", ink.cancel)}
        </div>
        <div style={{ position: "absolute", left: 1130, top: 590 }}>
          <StampIn at={STRIKE} angle={-9}>
            <Postmark id="close" top="LINE OF TRAVEL" bottom="DATANOVA 2026 · DN-OR-01" big="−5.9%" small="3,052 ROUTES" width={700} />
          </StampIn>
        </div>
      </Camera>
      <Grain amount={0.13} edge={0.16} />
      <Flash at={STRIKE} dur={10} peak={0.25} color={ink.cancel} blend="multiply" />
    </AbsoluteFill>
  );
}

export function Teaser({ plan }: SceneProps) {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill>
      {f < MAP && <CarrierCase plan={plan} />}
      {f >= MAP && f < LEARN + 14 && <RouteMap plan={plan} />}
      {f >= LEARN + 14 && f < DROP && <Wall plan={plan} />}
      {f >= DROP && f < FIGURES[0] && <Name />}
      {f >= FIGURES[0] && f < CLOSE && <Figures />}
      {f >= CLOSE && <Close plan={plan} />}
      <Flash at={MAP} dur={6} peak={0.35} />
      <Flash at={FIGURES[0]} dur={6} peak={0.35} />
    </AbsoluteFill>
  );
}
