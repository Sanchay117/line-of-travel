import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import type { SceneProps } from "../Film.tsx";
import { fonts, ink } from "../theme.ts";
import { clamp, easeOut, Grain, Mark, ramp } from "../ui/kit.tsx";
import { Sfx } from "../ui/Sfx.tsx";

const mono = (size: number, color: string) => ({ fontFamily: fonts.mono, fontWeight: 500, fontSize: size, letterSpacing: size * 0.08, textTransform: "uppercase" as const, color });

/** Everything on the closing card is from the held-out evaluation (web/public/data/summary.json). */
const PROOF: [string, string][] = [
  ["Held-out test", "3,052 Amazon routes · −5.9% drive time, 95% CI 5.8 to 6.1 · 0.01 zone re-entries"],
  ["Solver", "Shortest path 2.26% shorter than OR-Tools on 200 routes, in a 0.3 s budget"],
  ["Data", "Amazon Last Mile Routing Research Challenge 2021 · CC BY-NC 4.0"],
];

const bare = (url: string) => url.replace(/^https?:\/\//, "").replace(/\/$/, "");

export function End({ repo, site }: SceneProps & { repo: string; site: string }) {
  const f = useCurrentFrame();
  const links = [["Try it", site], ["Code", repo]].filter(([, url]) => url);
  return (
    <AbsoluteFill style={{ background: ink.stock }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 120, display: "flex", justifyContent: "center" }}>
        <Mark size={104} draw={ramp(f, 4, 28)} />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 250, textAlign: "center", fontFamily: fonts.display, fontWeight: 900, fontSize: 176, lineHeight: 0.86, textTransform: "uppercase" }}>
        {(["Line of", "Travel"] as const).map((word, row) => (
          <div key={word} style={{ color: row ? ink.cancel : ink.ink, clipPath: `inset(-10% ${100 - 100 * ramp(f, 10 + row * 8, 18)}% -10% 0)` }}>
            {word}
          </div>
        ))}
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 572, textAlign: "center", fontFamily: fonts.text, fontSize: 38, color: ink.ink2, opacity: ramp(f, 34, 14), transform: `translateY(${(1 - ramp(f, 34, 14)) * 10}px)` }}>
        Keep the order drivers already know. Remove the detours.
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 676, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
        {PROOF.map(([k, v], i) => {
          const e = ramp(f, 54 + i * 8, 14, easeOut);
          return (
            <div key={k} style={{ display: "flex", gap: 20, alignItems: "baseline", opacity: e, transform: `translateY(${(1 - e) * 12}px)` }}>
              <span style={{ ...mono(18, ink.cancelInk), width: 260, textAlign: "right" }}>{k}</span>
              <span style={{ width: 2, height: 15, background: ink.rule }} />
              <span style={{ ...mono(18, ink.ink2), width: 1060 }}>{v}</span>
            </div>
          );
        })}
        {links.length > 0 && (
          <div style={{ marginTop: 30, display: "flex", gap: 64, alignItems: "baseline", opacity: ramp(f, 86, 14) }}>
            {links.map(([k, url]) => (
              <span key={k} style={{ display: "flex", gap: 14, alignItems: "baseline" }}>
                <span style={mono(17, ink.cancelInk)}>{k}</span>
                {/* Addresses keep their case, so they read as typed. */}
                <span style={{ fontFamily: fonts.mono, fontWeight: 500, fontSize: 24, color: ink.ink }}>{bare(url)}</span>
              </span>
            ))}
          </div>
        )}
      </div>
      <Grain amount={0.12} edge={0.14} />
      <AbsoluteFill style={{ background: ink.night, opacity: interpolate(f, [200, 225], [0, 1], clamp) }} />
      <Sfx name="chime" at={8} volume={0.25} />
    </AbsoluteFill>
  );
}
