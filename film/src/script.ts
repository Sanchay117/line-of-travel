// The film's narration, in order. `text` is what the captions show; `say` (when set) is what the
// voice reads, spelled for the ear. scripts/voice.ts turns each entry into public/vo/<id>.wav and
// records its timing in public/vo/manifest.json.
//
// Every number is from the site: the held-out results in web/public/data/summary.json, the hero
// route as scripts/route.ts solves it, and the desk route as scripts/desk.ts prints it.

export interface Line {
  id: string;
  text: string;
  say?: string;
  /** Speeds the take up without changing its pitch. */
  tempo?: number;
}

/** The teaser is cut to its score, so these lines sit at fixed places (plan.ts, TEASER_AT). */
export const TEASER: Line[] = [
  { id: "t-case", text: "Every morning, a mail carrier cases the letters in the order they walk.", tempo: 1.15 },
  { id: "t-name", text: "The Postal Service calls it the Line of Travel.", tempo: 1.04 },
  { id: "t-amazon", text: "Amazon drivers have one too. Nobody wrote it down.", tempo: 1.06 },
  { id: "t-tsp", text: "The shortest route ignores it, and keeps doubling back.", tempo: 1.08 },
  { id: "t-learn", text: "So we learned it, from six thousand real routes.", tempo: 1.06 },
  { id: "t-drop", text: "Line of Travel.", tempo: 1.0 },
  { id: "t-less", text: "Six percent less driving.", tempo: 1.1 },
  { id: "t-whole", text: "Zones kept whole.", tempo: 1.06 },
  { id: "t-close", text: "Keep the order. Remove the detours.", tempo: 1.0 },
];

/** The demo, one line per scene, over the real website (scripts/capture.ts films each scene to its line). */
export const DEMO: Line[] = [
  {
    id: "d-hero",
    text: "This is the website. It loads a real Amazon route, 154 stops in Boston, and re-sequences it right in your browser.",
    say: "This is the website. It loads a real Amazon route, a hundred and fifty four stops in Boston, and re-sequences it right in your browser.",
    tempo: 1.05,
  },
  { id: "d-stamp", text: "Twenty minutes less driving, with twenty-three of its twenty-six zones still in the driver's order.", tempo: 1.05 },
  {
    id: "d-ledger",
    text: "Across 3,052 routes the model never saw, that is 5.9% less driving, almost no zone re-entries, and one late stop, where the drivers had 469.",
    say: "Across three thousand and fifty two routes the model never saw, that is five point nine percent less driving, almost no zone re-entries, and one late stop, where the drivers had four hundred and sixty nine.",
    tempo: 1.06,
  },
  {
    id: "d-turn",
    text: "Why not take the shortest path? Here it is 14% shorter, but it drives back into a finished zone 23 times. Line of Travel never does, and still saves 9%.",
    say: "Why not take the shortest path? Here it is fourteen percent shorter, but it drives back into a finished zone twenty three times. Line of Travel never does, and still saves nine percent.",
    tempo: 1.05,
  },
  {
    id: "d-case",
    text: "The name is the Postal Service's: a carrier's case, one slot per stop, in walking order. Here each slot is a zone, in the driver's order. Red is where it changed the order. Manila is a zone the driver visited twice, now done in one trip.",
    tempo: 1.06,
  },
  {
    id: "d-how",
    text: "A LightGBM ranker learned the driver's next zone from 6,112 routes. It picks the right one 68% of the time; the nearest zone, 35%. Then a local search prices every move in Amazon's road times.",
    say: "A Light G B M ranker learned the driver's next zone from six thousand one hundred and twelve routes. It picks the right one sixty eight percent of the time; the nearest zone, thirty five percent. Then a local search prices every move in Amazon's road times.",
    tempo: 1.06,
  },
  {
    id: "d-desk",
    text: "The dispatch desk runs real routes from all five cities. This one is Austin, 183 stops.",
    say: "The dispatch desk runs real routes from all five cities. This one is Austin, a hundred and eighty three stops.",
    tempo: 1.04,
  },
  {
    id: "d-trust",
    text: "Turn driver trust off, and you get the shortest path: 19 zone re-entries. Turn it back up, and they go to zero, still 8% shorter than the driver.",
    say: "Turn driver trust off, and you get the shortest path: nineteen zone re-entries. Turn it back up, and they go to zero, still eight percent shorter than the driver.",
    tempo: 1.05,
  },
  {
    id: "d-rush",
    text: "Add eight same-day orders. Fitting them into the driver's route by hand leaves three late. Line of Travel gets every one there on time, for 17 more minutes of driving.",
    say: "Add eight same-day orders. Fitting them into the driver's route by hand leaves three late. Line of Travel gets every one there on time, for seventeen more minutes of driving.",
    tempo: 1.05,
  },
  {
    id: "d-proof",
    text: "Every claim is checked on held-out routes: Amazon's official scorer, OR-Tools as a baseline, bootstrap intervals, and the limits we know about.",
    say: "Every claim is checked on held-out routes: Amazon's official scorer, O R Tools as a baseline, bootstrap intervals, and the limits we know about.",
    tempo: 1.05,
  },
  { id: "d-close", text: "Keep the order drivers already know. Remove the detours. The code and the deck are linked right here.", tempo: 1.02 },
];

export const SCRIPT: Line[] = [...TEASER, ...DEMO];
