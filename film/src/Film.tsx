import type { ComponentType, ReactNode } from "react";
import { AbsoluteFill, Audio, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";
import { DROP_S, FIGURES_S, STRIKE_S } from "./beats.ts";
import { FPS, OVERLAP, TEASER_FRAMES, type Plan, type Shot } from "./plan.ts";
import { Demo } from "./scenes/Demo.tsx";
import { End } from "./scenes/End.tsx";
import { Teaser } from "./scenes/Teaser.tsx";
import { ink } from "./theme.ts";
import { Captions } from "./ui/Captions.tsx";

export interface SceneProps {
  shot: Shot;
  plan: Plan;
}

export interface FilmProps extends Record<string, unknown> {
  captions: boolean;
  music: boolean;
  /** Public repository URL for the closing card; hidden when empty. */
  repo: string;
  /** Public website URL for the closing card; hidden when empty. */
  site: string;
  plan?: Plan;
}

type Scene = ComponentType<SceneProps & { repo: string; site: string }>;

const sceneFor = (id: string): { component: Scene; quiet?: boolean } =>
  id === "teaser" ? { component: Teaser, quiet: true } : id === "close" ? { component: End, quiet: true } : { component: Demo };

/** Fades a scene in over the overlap with the one before it; hard cuts when they do not overlap. */
function CrossFade({ children, shot, plan }: { children: ReactNode; shot: Shot; plan: Plan }) {
  const frame = useCurrentFrame();
  const i = plan.shots.indexOf(shot);
  const prev = plan.shots[i - 1];
  const overlaps = prev && prev.from + prev.frames > shot.from;
  const o = overlaps ? interpolate(frame, [0, OVERLAP], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 1;
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
}

export function Film({ captions, music, repo, site, plan }: FilmProps) {
  if (!plan) return null;
  return (
    <AbsoluteFill style={{ background: ink.stock }}>
      {plan.shots.map((shot) => {
        const scene = sceneFor(shot.id);
        const Scene = scene.component;
        return (
          <Sequence key={shot.id} from={shot.from} durationInFrames={shot.frames} name={shot.id}>
            <CrossFade shot={shot} plan={plan}>
              <Scene shot={shot} plan={plan} repo={repo} site={site} />
              {captions && !scene.quiet && <Captions shot={shot} />}
            </CrossFade>
          </Sequence>
        );
      })}
      {plan.voices.map((voice) => (
        <Sequence key={voice.id} from={voice.from} durationInFrames={voice.frames} name={`vo ${voice.id}`}>
          <Audio src={staticFile(voice.file)} volume={voice.from < TEASER_FRAMES ? TEASER_VOICE : 1} />
        </Sequence>
      ))}
      {music && <Score plan={plan} />}
    </AbsoluteFill>
  );
}

const fade = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** The narrator sits a little forward in the teaser, where the words compete with a full score. */
const TEASER_VOICE = 1.4;
/** One pass of sfx/bed.wav. A looped Audio restarts its volume frame each pass, so the passes are laid out by hand. */
const BED = 64 * FPS;
const DROP = DROP_S * FPS;
const HITS = [DROP, ...FIGURES_S.map((s) => s * FPS), STRIKE_S * FPS];

/**
 * The teaser's score, then a quiet bed under the demo. Under a teaser line the score falls away,
 * further as the music gets bigger, so the words stay on top; the first beat of each hit lands at
 * full strength, whoever is talking. The score's last chord rings into the demo.
 */
function Score({ plan }: { plan: Plan }) {
  const lines = plan.voices.filter((v) => v.from < TEASER_FRAMES);
  const beneath = (frame: number) => interpolate(frame, [240, 480, 600, 780], [0.62, 0.36, 0.26, 0.22], fade);
  const hit = (frame: number) => HITS.reduce((most, h) => Math.max(most, interpolate(frame, [h - 2, h, h + 4, h + 12], [0, 1, 1, 0], fade)), 0);
  const ducked = (frame: number) => {
    const under = lines.reduce((most, v) => Math.max(most, interpolate(frame, [v.from - 5, v.from + 1, v.from + v.frames - 3, v.from + v.frames + 5], [0, 1, 1, 0], fade)), 0);
    return 1 - (1 - beneath(frame)) * under * (1 - hit(frame));
  };
  const level = (frame: number) => interpolate(frame, [0, 240, 480, 585, 600, 840, 870, 990], [0.4, 0.46, 0.54, 0.6, 0.82, 0.82, 0.32, 0], fade);
  const close = plan.shots.at(-1)!;
  const bed = (frame: number) => {
    const left = plan.total - frame;
    const swell = interpolate(frame, [close.from, close.from + 30], [0, 1], fade);
    return interpolate(frame - TEASER_FRAMES, [60, 150], [0, 0.1], fade) * (1 + swell) * interpolate(left, [0, 60], [0, 1], fade);
  };
  const passes = Math.ceil((plan.total - TEASER_FRAMES) / BED);
  return (
    <>
      <Audio src={staticFile("sfx/teaser.wav")} volume={(f) => level(f) * ducked(f)} />
      {Array.from({ length: passes }, (_, pass) => {
        const from = TEASER_FRAMES + pass * BED;
        return (
          <Sequence key={pass} from={from} durationInFrames={BED} name={`bed ${pass + 1}`}>
            <Audio src={staticFile("sfx/bed.wav")} volume={(f) => bed(from + f)} />
          </Sequence>
        );
      })}
    </>
  );
}
