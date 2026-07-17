/**
 * Pure data model and CSS generation for the keyframe builder.
 * No DOM access here, so it is trivially SSR-safe and testable.
 */

export interface StopProps {
  /** translateX in px, -200..200 */
  x: number;
  /** translateY in px, -200..200 */
  y: number;
  /** 0..3 */
  scale: number;
  /** degrees, -360..360 */
  rotate: number;
  /** 0..1 */
  opacity: number;
}

export interface Stop {
  id: string;
  /** 0..100, the 0 and 100 stops always exist. */
  percent: number;
  props: StopProps;
}

export const DEFAULT_PROPS: StopProps = { x: 0, y: 0, scale: 1, rotate: 0, opacity: 1 };

export interface AnimSettings {
  /** seconds, 0.1..10 */
  duration: number;
  easing: string;
  iteration: string;
  direction: string;
}

export const DEFAULT_SETTINGS: AnimSettings = {
  duration: 1.5,
  easing: "ease-in-out",
  iteration: "infinite",
  direction: "normal",
};

export const EASINGS = [
  "linear",
  "ease",
  "ease-in",
  "ease-out",
  "ease-in-out",
  "cubic-bezier(0.16, 1, 0.3, 1)",
];

export const ITERATIONS = ["1", "2", "3", "infinite"];
export const DIRECTIONS = ["normal", "alternate"];

const trim = (n: number) => {
  const r = Math.round(n * 1000) / 1000;
  return Object.is(r, -0) ? 0 : r;
};

export function sortStops(stops: Stop[]): Stop[] {
  return [...stops].sort((a, b) => a.percent - b.percent);
}

/** Linearly interpolate props at `percent` between the surrounding stops. */
export function interpolateProps(stops: Stop[], percent: number): StopProps {
  const sorted = sortStops(stops);
  let before = sorted[0];
  let after = sorted[sorted.length - 1];
  for (const s of sorted) {
    if (s.percent <= percent) before = s;
    if (s.percent >= percent) {
      after = s;
      break;
    }
  }
  if (after.percent === before.percent) return { ...before.props };
  const t = (percent - before.percent) / (after.percent - before.percent);
  const lerp = (a: number, b: number) => a + (b - a) * t;
  return {
    x: lerp(before.props.x, after.props.x),
    y: lerp(before.props.y, after.props.y),
    scale: lerp(before.props.scale, after.props.scale),
    rotate: lerp(before.props.rotate, after.props.rotate),
    opacity: lerp(before.props.opacity, after.props.opacity),
  };
}

/**
 * Body of the @keyframes block. Only properties that differ from the
 * element's base state are written per stop; a stop with no changes is
 * emitted with `transform: none` so it still anchors interpolation.
 */
export function buildKeyframeBody(stops: Stop[]): string {
  const lines: string[] = [];
  for (const stop of sortStops(stops)) {
    const { x, y, scale, rotate, opacity } = stop.props;
    const parts: string[] = [];
    if (x !== 0 || y !== 0) parts.push(`translate(${trim(x)}px, ${trim(y)}px)`);
    if (scale !== 1) parts.push(`scale(${trim(scale)})`);
    if (rotate !== 0) parts.push(`rotate(${trim(rotate)}deg)`);

    const decls: string[] = [];
    if (parts.length > 0) decls.push(`transform: ${parts.join(" ")};`);
    if (opacity !== 1) decls.push(`opacity: ${trim(opacity)};`);
    if (decls.length === 0) decls.push("transform: none;");

    lines.push(`  ${trim(stop.percent)}% {`);
    for (const d of decls) lines.push(`    ${d}`);
    lines.push("  }");
  }
  return lines.join("\n");
}

export function buildCss(stops: Stop[], settings: AnimSettings, name = "my-animation"): string {
  const iter = settings.iteration;
  return [
    `@keyframes ${name} {`,
    buildKeyframeBody(stops),
    `}`,
    ``,
    `.animated-element {`,
    `  animation: ${name} ${trim(settings.duration)}s ${settings.easing} ${iter} ${settings.direction};`,
    `}`,
    ``,
  ].join("\n");
}

const p = (over: Partial<StopProps>): StopProps => ({ ...DEFAULT_PROPS, ...over });

export const PRESETS: Record<string, Stop[]> = {
  Pulse: [
    { id: "pr-0", percent: 0, props: p({}) },
    { id: "pr-1", percent: 50, props: p({ scale: 1.25 }) },
    { id: "pr-2", percent: 100, props: p({}) },
  ],
  "Slide in": [
    { id: "pr-0", percent: 0, props: p({ x: -160, opacity: 0 }) },
    { id: "pr-1", percent: 100, props: p({}) },
  ],
  Bounce: [
    { id: "pr-0", percent: 0, props: p({}) },
    { id: "pr-1", percent: 25, props: p({ y: -80 }) },
    { id: "pr-2", percent: 50, props: p({}) },
    { id: "pr-3", percent: 75, props: p({ y: -35 }) },
    { id: "pr-4", percent: 100, props: p({}) },
  ],
  Spin: [
    { id: "pr-0", percent: 0, props: p({}) },
    { id: "pr-1", percent: 100, props: p({ rotate: 360 }) },
  ],
  Fade: [
    { id: "pr-0", percent: 0, props: p({ opacity: 0 }) },
    { id: "pr-1", percent: 100, props: p({}) },
  ],
};

export const INITIAL_STOPS: Stop[] = [
  { id: "start", percent: 0, props: p({}) },
  { id: "mid", percent: 50, props: p({ scale: 1.25 }) },
  { id: "end", percent: 100, props: p({}) },
];
