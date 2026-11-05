import { interpolate, useCurrentFrame } from "remotion";
import { FPS, type Shot, type Word } from "../plan.ts";
import { fonts, ink } from "../theme.ts";
import { clamp } from "./kit.tsx";

/** Breaks a line into caption cards at sentence and clause ends, up to ten words each. */
function cards(words: Word[]): Word[][] {
  const out: Word[][] = [];
  let cur: Word[] = [];
  words.forEach((w, i) => {
    cur.push(w);
    const end = /[.?!]$/.test(w.text);
    const pause = /[,:;]$/.test(w.text) && cur.length >= 3;
    const next = words[i + 1];
    if (end || pause || cur.length >= 10 || (next && next.start - w.end > 0.45)) {
      out.push(cur);
      cur = [];
    }
  });
  if (cur.length) out.push(cur);
  return out;
}

/** Burned-in captions on a carrier-ink band: the current card, each word brightening as it is spoken. */
export function Captions({ shot }: { shot: Shot }) {
  const frame = useCurrentFrame();
  if (!shot.take) return null;
  const t = (frame - shot.voiceAt) / FPS;
  const all = cards(shot.take.words);
  const i = all.findIndex((c, k) => t >= c[0].start - 0.08 && (k === all.length - 1 ? t <= c.at(-1)!.end + 0.6 : t < all[k + 1][0].start - 0.08));
  if (i < 0) return null;
  const card = all[i];
  const inT = interpolate(t, [card[0].start - 0.08, card[0].start + 0.1], [0, 1], clamp);
  const outT = i === all.length - 1 ? interpolate(t, [card.at(-1)!.end + 0.3, card.at(-1)!.end + 0.6], [1, 0], clamp) : 1;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 46, display: "flex", justifyContent: "center", pointerEvents: "none", opacity: inT * outT, zIndex: 60 }}>
      <div
        style={{
          maxWidth: 1500,
          padding: "12px 28px 14px",
          borderRadius: 3,
          background: "rgba(27,34,48,0.9)",
          boxShadow: "0 10px 34px rgba(18,23,34,0.3)",
          borderTop: `3px solid ${ink.cancel}`,
          fontFamily: fonts.text,
          fontWeight: 600,
          fontSize: 36,
          lineHeight: 1.25,
          color: ink.face,
          textAlign: "center",
        }}
      >
        {card.map((w, k) => (
          <span key={k} style={{ opacity: t >= w.start - 0.05 ? 1 : 0.42 }}>
            {w.text}
            {k < card.length - 1 ? " " : ""}
          </span>
        ))}
      </div>
    </div>
  );
}
