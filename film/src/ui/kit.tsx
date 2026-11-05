import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Easing, interpolate, random, useCurrentFrame } from "remotion";
import { fonts, ink } from "../theme.ts";

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const easeOut = Easing.bezier(0.16, 1, 0.3, 1);
export const easeInOut = Easing.bezier(0.65, 0, 0.35, 1);
export const easeIn = Easing.bezier(0.5, 0, 0.75, 0);

/** 0→1 over `dur` frames starting at `at`, eased. */
export function ramp(frame: number, at: number, dur = 18, easing = easeOut) {
  return interpolate(frame, [at, at + dur], [0, 1], { ...clamp, easing });
}

const NOISE = (tone: string) =>
  `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='260' height='260'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 ${tone}  0 0 0 0 ${tone}  0 0 0 0 ${tone}  0 0 0 .6 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")`;

/** Paper grain that moves every other frame, and a soft vignette. `dark` for ink grounds. */
export function Grain({ amount = 0.12, edge = 0.18, dark = false }: { amount?: number; edge?: number; dark?: boolean }) {
  const frame = useCurrentFrame();
  const j = Math.floor(frame / 2) % 7;
  return (
    <>
      <AbsoluteFill style={{ pointerEvents: "none", backgroundImage: NOISE(dark ? ".9" : ".1"), backgroundPosition: `${j * 37}px ${j * 53}px`, opacity: amount, mixBlendMode: dark ? "overlay" : "multiply" }} />
      <AbsoluteFill style={{ pointerEvents: "none", background: `radial-gradient(ellipse at 50% 50%, transparent 55%, rgba(18,23,34,${edge}) 100%)` }} />
    </>
  );
}

/** How hard the last of `hits` is still ringing at `frame`: 1 on the hit, falling fast. */
export function ringing(frame: number, hits: number[], decay = 3.4) {
  const last = hits.filter((h) => h <= frame).at(-1);
  if (last === undefined) return { last: -1, k: 0 };
  return { last, k: Math.exp(-(frame - last) / decay) };
}

/** The camera: a slow push from `from`, and a jolt on every hit, so type feels heavy. */
export function Camera({ children, hits = [], power = 10, push = 0.0006, from = 0, origin = "50% 50%", style }: { children: ReactNode; hits?: number[]; power?: number; push?: number; from?: number; origin?: string; style?: CSSProperties }) {
  const frame = useCurrentFrame();
  const { last, k } = ringing(frame, hits);
  const a = random(`hit ${last}`) * Math.PI * 2;
  const scale = 1 + Math.max(0, frame - from) * push + 0.016 * k;
  return (
    <AbsoluteFill style={{ transform: `translate(${power * k * Math.cos(a)}px, ${power * k * Math.sin(a)}px) rotate(${(random(`rot ${last}`) - 0.5) * 0.5 * k}deg) scale(${scale})`, transformOrigin: origin, ...style }}>
      {children}
    </AbsoluteFill>
  );
}

/** A full-frame flash at `at`, gone in `dur` frames. */
export function Flash({ at, dur = 10, color = "#ffffff", peak = 0.9, blend = "screen" }: { at: number; dur?: number; color?: string; peak?: number; blend?: CSSProperties["mixBlendMode"] }) {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [at - 1, at, at + dur], [0, peak, 0], clamp);
  if (o <= 0) return null;
  return <AbsoluteFill style={{ background: color, opacity: o, mixBlendMode: blend, pointerEvents: "none", zIndex: 40 }} />;
}

/** Comes down hard: large and fast, a small bounce, and an echo thrown off the hit. */
export function Slam({ at, from = 1.6, children, style, blur = true }: { at: number; from?: number; children: ReactNode; style?: CSSProperties; blur?: boolean }) {
  const frame = useCurrentFrame();
  const t = frame - at;
  if (t < 0) return <span style={{ display: "inline-block", opacity: 0, ...style }}>{children}</span>;
  const drop = interpolate(t, [0, 3], [from, 1], { ...clamp, easing: Easing.in(Easing.quad) });
  const bounce = interpolate(t, [3, 5, 10], [1, 0.975, 1], clamp);
  const thrown = interpolate(t, [3, 12], [1, 1.14], { ...clamp, easing: Easing.out(Easing.quad) });
  const echo = interpolate(t, [3, 12], [0.4, 0], clamp);
  return (
    <span style={{ position: "relative", display: "inline-block", transform: `scale(${t < 3 ? drop : bounce})`, filter: blur && t < 3 ? `blur(${(3 - t) * 2.5}px)` : undefined, ...style }}>
      {t >= 3 && t < 12 && <span style={{ position: "absolute", inset: 0, opacity: echo, transform: `scale(${thrown})` }}>{children}</span>}
      {children}
    </span>
  );
}

/** Text typed on at `cps` characters a second, with a block caret while it types. */
export function Typed({ at, text, cps = 40, style, caret = true }: { at: number; text: string; cps?: number; style?: CSSProperties; caret?: boolean }) {
  const frame = useCurrentFrame();
  const n = Math.max(0, Math.floor(((frame - at) / 30) * cps));
  if (frame < at) return null;
  const done = n >= text.length;
  return (
    <span style={{ whiteSpace: "pre", ...style }}>
      {text.slice(0, n)}
      {caret && (!done || Math.floor(frame / 8) % 2 === 0) && <span style={{ display: "inline-block", width: "0.55em", height: "1em", marginLeft: 4, verticalAlign: "-0.12em", background: "currentColor", opacity: 0.85 }} />}
    </span>
  );
}

/** A figure whose digits roll into place like the site's odometer, last digit first. */
export function Rolling({ at, value, dur = 24, style }: { at: number; value: string; dur?: number; style?: CSSProperties }) {
  const frame = useCurrentFrame();
  const chars = [...value];
  const digits = chars.filter((c) => /\d/.test(c)).length;
  let d = 0;
  return (
    <span style={{ display: "inline-flex", fontVariantNumeric: "tabular-nums", ...style }}>
      {chars.map((c, i) => {
        if (!/\d/.test(c)) return <span key={i}>{c}</span>;
        const k = d++;
        const settle = at + dur * ((k + 1) / digits);
        const target = Number(c);
        const spins = Math.max(0, settle - frame);
        const shown = frame < at ? 0 : spins > 0 ? (target + Math.floor(spins * 1.7)) % 10 : target;
        return (
          <span key={i} style={{ display: "inline-block", filter: spins > 0 ? "blur(1.2px)" : undefined }}>
            {shown}
          </span>
        );
      })}
    </span>
  );
}

/** A small uppercase mono label, the site's eyebrow voice. */
export function Label({ children, color = ink.ink2, size = 20, style }: { children: ReactNode; color?: string; size?: number; style?: CSSProperties }) {
  return <div style={{ fontFamily: fonts.mono, fontWeight: 500, fontSize: size, letterSpacing: size * 0.09, textTransform: "uppercase", color, whiteSpace: "nowrap", ...style }}>{children}</div>;
}

/** The cancellation bars of the postmark: rows of the route's own wiggle (web/src/postmark.js). */
function bars(x0: number, w: number, y0: number, gap: number, count: number, amp: number) {
  let d = "";
  for (let b = 0; b < count; b++) {
    const y = y0 + b * gap;
    d += `M${x0} ${y}`;
    for (let x = 0; x <= w; x += 12) d += ` Q${x0 + x + 6} ${y + (b % 2 ? amp : -amp)} ${x0 + x + 12} ${y}`;
  }
  return d;
}

/**
 * The site's postmark: a circular date stamp with wavy cancellation bars, in worn cancel red.
 * `draw` (0..1) draws its rings and bars on, for an ink-in rather than a stamp.
 */
export function Postmark({ id, top, bottom, big, small, width = 600, color = ink.cancel, draw = 1 }: { id: string; top: string; bottom: string; big: string; small: string; width?: number; color?: string; draw?: number }) {
  const dash = (len: number) => ({ strokeDasharray: len, strokeDashoffset: len * (1 - draw) });
  return (
    <svg viewBox="0 0 300 160" width={width} height={(width * 160) / 300} style={{ overflow: "visible" }}>
      <defs>
        <filter id={`${id}-ink`} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.25 1.62" result="mask" />
          <feComposite in="SourceGraphic" in2="mask" operator="in" />
        </filter>
        <path id={`${id}-top`} d="M 26 80 A 54 54 0 0 1 134 80" />
        <path id={`${id}-bot`} d="M 22 80 A 58 58 0 0 0 138 80" />
      </defs>
      <g filter={`url(#${id}-ink)`} fill="none" stroke={color} strokeLinecap="round">
        <circle cx="80" cy="80" r="70" strokeWidth="3.5" transform="rotate(-90 80 80)" style={dash(440)} />
        <circle cx="80" cy="80" r="48" strokeWidth="2" transform="rotate(-90 80 80)" style={dash(302)} />
        <path d={bars(156, 132, 46, 17, 5, 5)} strokeWidth="3.2" style={dash(900)} />
        <g fill={color} stroke="none" fontFamily="IBM Plex Mono, monospace" fontWeight="500" opacity={draw}>
          <text fontSize="12.5" letterSpacing="2.2">
            <textPath href={`#${id}-top`} startOffset="50%" textAnchor="middle">{top}</textPath>
          </text>
          <text fontSize={bottom.length > 15 ? 10 : 11} letterSpacing={bottom.length > 15 ? 1 : 1.6}>
            <textPath href={`#${id}-bot`} startOffset="50%" textAnchor="middle" dominantBaseline="hanging">{bottom}</textPath>
          </text>
          <text x="80" y="86" textAnchor="middle" fontFamily="Public Sans, sans-serif" fontWeight="600" fontSize={big.length > 6 ? 19 : 23}>{big}</text>
          <text x="80" y="101" textAnchor="middle" fontSize={small.length > 14 ? 8 : 9.5} letterSpacing={small.length > 14 ? 0.2 : 0.6}>{small}</text>
        </g>
      </g>
    </svg>
  );
}

/** A stamp hitting the frame at `at`: big and fast, a squash, a small shake. */
export function StampIn({ at, children, angle = -6, style }: { at: number; children: ReactNode; angle?: number; style?: CSSProperties }) {
  const frame = useCurrentFrame();
  const t = frame - at;
  if (t < 0) return null;
  const drop = interpolate(t, [0, 4], [2.2, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
  const settle = interpolate(t, [4, 7, 11], [1, 0.96, 1], clamp);
  const shake = t >= 4 && t < 10 ? Math.sin(t * 2.4) * (10 - t) * 0.4 : 0;
  return (
    <div style={{ display: "inline-block", transform: `translate(${shake}px, 0) rotate(${angle}deg) scale(${t < 4 ? drop : settle})`, opacity: interpolate(t, [0, 2], [0, 1], clamp), ...style }}>
      {children}
    </div>
  );
}

/** The site's small mark: a ring and two cancellation waves. */
export function Mark({ size = 64, color = ink.cancel, draw = 1 }: { size?: number; color?: string; draw?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size}>
      <circle cx="26" cy="32" r="21" fill="none" stroke={color} strokeWidth="4" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw} transform="rotate(-90 26 32)" />
      <path d="M8 26 Q15 21 22 26 T36 26 T50 26 T62 26" fill="none" stroke={color} strokeWidth="3.6" strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - Math.min(1, draw * 1.3)} />
      <path d="M8 38 Q15 43 22 38 T36 38 T50 38 T62 38" fill="none" stroke={color} strokeWidth="3.6" strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - Math.max(0, draw * 1.3 - 0.3)} />
    </svg>
  );
}
