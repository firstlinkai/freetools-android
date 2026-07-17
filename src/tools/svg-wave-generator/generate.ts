/**
 * Pure, seeded SVG generation for waves and blobs.
 * Everything is deterministic for a given option set, so previews are
 * hydration-safe and the exported SVG always matches the preview.
 */

/** Small, fast seeded PRNG. Same seed always yields the same sequence. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (n: number) => Math.round(n * 100) / 100;

export interface WaveOptions {
  seed: number;
  /** Number of anchor points, 2-8. */
  complexity: number;
  /** 0-100 amplitude randomness. */
  variance: number;
  /** Vertical position of the wave line, 10-90 (% of height). */
  height: number;
  /** 1-4 stacked layers. */
  layers: number;
  color: string;
  /** 0-1 base opacity. */
  opacity: number;
  flip: boolean;
}

export const WAVE_W = 900;
export const WAVE_H = 300;

function wavePath(opts: WaveOptions, layerIndex: number): string {
  const { seed, complexity, variance, height, flip } = opts;
  const rng = mulberry32(seed + layerIndex * 7919);
  const n = Math.max(2, complexity);
  const baseY = (WAVE_H * height) / 100;
  const room = Math.min(baseY, WAVE_H - baseY);
  const amp = (variance / 100) * room * 0.9;
  const layerShift = layerIndex * 16;

  const ys: number[] = [];
  const xs: number[] = [];
  for (let i = 0; i < n; i++) {
    xs.push((WAVE_W * i) / (n - 1));
    let y = baseY + (rng() * 2 - 1) * amp + layerShift;
    y = Math.min(WAVE_H - 4, Math.max(4, y));
    if (flip) y = WAVE_H - y;
    ys.push(y);
  }

  let d = `M0,${round(ys[0])}`;
  for (let i = 1; i < n; i++) {
    const midX = (xs[i - 1] + xs[i]) / 2;
    d += ` C${round(midX)},${round(ys[i - 1])} ${round(midX)},${round(ys[i])} ${round(
      xs[i],
    )},${round(ys[i])}`;
  }
  d += flip ? ` L${WAVE_W},0 L0,0 Z` : ` L${WAVE_W},${WAVE_H} L0,${WAVE_H} Z`;
  return d;
}

export function buildWaveSvg(opts: WaveOptions): string {
  const paths: string[] = [];
  // Draw the faintest (deepest) layer first, the solid layer on top.
  for (let layer = opts.layers - 1; layer >= 0; layer--) {
    const o = round(opts.opacity * Math.pow(0.7, layer));
    paths.push(
      `  <path d="${wavePath(opts, layer)}" fill="${opts.color}" fill-opacity="${o}"/>`,
    );
  }
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WAVE_W} ${WAVE_H}" preserveAspectRatio="none">`,
    ...paths,
    `</svg>`,
  ].join("\n");
}

export interface BlobOptions {
  seed: number;
  /** Number of points around the circle, 4-12. */
  points: number;
  /** 0-100 radius jitter. */
  variance: number;
  color: string;
  gradient: boolean;
  color2: string;
}

export const BLOB_SIZE = 900;

export function buildBlobSvg(opts: BlobOptions): string {
  const { seed, points, variance, color, gradient, color2 } = opts;
  const rng = mulberry32(seed);
  const n = Math.max(4, points);
  const cx = BLOB_SIZE / 2;
  const cy = BLOB_SIZE / 2;
  const baseR = BLOB_SIZE * 0.34;
  const jitter = (variance / 100) * 0.45;

  const pts: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const r = baseR * (1 + (rng() * 2 - 1) * jitter);
    pts.push([cx + Math.cos(angle) * r, cy + Math.sin(angle) * r]);
  }

  // Closed catmull-rom converted to cubic beziers.
  const at = (i: number) => pts[(i + n) % n];
  let d = `M${round(pts[0][0])},${round(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${round(c1x)},${round(c1y)} ${round(c2x)},${round(c2y)} ${round(p2[0])},${round(
      p2[1],
    )}`;
  }
  d += " Z";

  const fill = gradient ? `url(#omni-blob-gradient)` : color;
  const defs = gradient
    ? [
        `  <defs>`,
        `    <linearGradient id="omni-blob-gradient" x1="0" y1="0" x2="1" y2="1">`,
        `      <stop offset="0%" stop-color="${color}"/>`,
        `      <stop offset="100%" stop-color="${color2}"/>`,
        `    </linearGradient>`,
        `  </defs>`,
      ]
    : [];

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BLOB_SIZE} ${BLOB_SIZE}">`,
    ...defs,
    `  <path d="${d}" fill="${fill}"/>`,
    `</svg>`,
  ].join("\n");
}
