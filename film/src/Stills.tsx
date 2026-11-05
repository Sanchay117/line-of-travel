import { AbsoluteFill } from "remotion";
import route from "../public/route.json";
import { fonts, ink } from "./theme.ts";
import { Grain, Mark, Postmark } from "./ui/kit.tsx";

const P = route.pts as number[][];
const pathOf = (tour: number[]) => tour.slice(1).map((i, k) => `${k ? "L" : "M"}${P[i][0]} ${P[i][1]}`).join("");
const HULLS = route.hulls.map((h) => (h.hull.length ? `M${h.hull.map((p) => p.join(" ")).join(" L")} Z` : ""));

/** The video's thumbnail: the name, the hero route in the driver's order and in ours, and the stamp. */
export function Thumbnail() {
  return (
    <AbsoluteFill style={{ background: ink.stock }}>
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
        <g transform="translate(700 70) scale(0.86)">
          {HULLS.map((d, i) => (
            <path key={i} d={d} fill={ink.steelSoft} stroke={ink.rule} strokeWidth={1.4} />
          ))}
          <path d={pathOf(route.tours.driver)} fill="none" stroke={ink.graphite} strokeWidth={2.4} strokeDasharray="7 6" strokeLinejoin="round" />
          <path d={pathOf(route.tours.lot)} fill="none" stroke={ink.cancel} strokeWidth={4.6} strokeLinejoin="round" strokeLinecap="round" />
          {P.map((p, i) => (i ? <circle key={i} cx={p[0]} cy={p[1]} r={3.6} fill={ink.ink} /> : null))}
        </g>
      </svg>
      <div style={{ position: "absolute", left: 110, top: 150 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontFamily: fonts.mono, fontWeight: 500, fontSize: 22, letterSpacing: 2, textTransform: "uppercase", color: ink.ink2 }}>
          <Mark size={40} />
          DataNova 2026 · DN-OR-01
        </div>
        <div style={{ marginTop: 26, fontFamily: fonts.display, fontWeight: 900, fontSize: 250, lineHeight: 0.84, textTransform: "uppercase" }}>
          <div style={{ color: ink.ink }}>Line of</div>
          <div style={{ color: ink.cancel }}>Travel</div>
        </div>
        <div style={{ marginTop: 40, fontFamily: fonts.text, fontWeight: 600, fontSize: 46, lineHeight: 1.2, color: ink.ink, maxWidth: 760 }}>
          Routes that drivers would actually drive.
        </div>
        <div style={{ marginTop: 22, fontFamily: fonts.mono, fontWeight: 500, fontSize: 24, letterSpacing: 1.6, textTransform: "uppercase", color: ink.ink2 }}>
          −5.9% drive time · 3,052 real Amazon routes
        </div>
      </div>
      <div style={{ position: "absolute", right: 70, top: 64, transform: "rotate(-8deg)" }}>
        <Postmark id="thumb" top="LINE OF TRAVEL" bottom="DBO3 · JUL 16, 2018" big={`−${Math.abs(route.minutes)} MIN`} small={`${route.kept}/${route.zones} ZONES KEPT`} width={560} />
      </div>
      <Grain amount={0.12} edge={0.14} />
    </AbsoluteFill>
  );
}
