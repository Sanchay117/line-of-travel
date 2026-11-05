import { Composition, Still } from "remotion";
import links from "../../links.json";
import { Film, type FilmProps } from "./Film.tsx";
import { FPS, makePlan } from "./plan.ts";
import { Thumbnail } from "./Stills.tsx";

export function Root() {
  return (
    <>
      <Composition
        id="LineOfTravel"
        component={Film}
        width={1920}
        height={1080}
        fps={FPS}
        durationInFrames={FPS * 200}
        defaultProps={{ captions: true, music: true, repo: links.repo, site: links.demo } satisfies FilmProps}
        calculateMetadata={async ({ props }) => {
          const plan = await makePlan();
          return { durationInFrames: plan.total, props: { ...props, plan } };
        }}
      />
      <Still id="Thumbnail" component={Thumbnail} width={1920} height={1080} />
      <Still id="Card" component={Thumbnail} width={1800} height={1200} defaultProps={{ shape: "card" as const }} />
    </>
  );
}
