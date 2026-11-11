// Pure track geometry + bot driving for Prism Rush. No imports, so it can be
// unit-tested in plain Node as well as used by the canvas component.

export const RACE_LAPS = 3;
export const TRACK_HALF_WIDTH = 92;
/** Distance beyond the track edge where the barrier pushes racers back. */
export const TRACK_WALL_MARGIN = 46;
const SAMPLE_SPACING = 22;

export interface TrackSample {
  x: number;
  y: number;
  /** Unit tangent (direction of travel). */
  tx: number;
  ty: number;
  /** Unit normal (points to the right of travel). */
  nx: number;
  ny: number;
}

export interface RaceTrack {
  theme: string;
  name: string;
  accent: string;
  samples: TrackSample[];
  /** Sample indices that carry a boost pad. */
  boostPads: number[];
  worldW: number;
  worldH: number;
}

interface TrackDef {
  name: string;
  accent: string;
  points: Array<[number, number]>;
  /** Boost pad positions as a fraction of the lap. */
  pads: number[];
}

const TRACK_DEFS: Record<string, TrackDef> = {
  nebula_crucible: {
    name: "Crucible Circuit",
    accent: "#22d3ee",
    points: [
      [700, 450],
      [1500, 380],
      [2300, 450],
      [2900, 700],
      [2950, 1300],
      [2500, 1750],
      [1900, 1600],
      [1500, 1150],
      [1100, 1500],
      [700, 1850],
      [350, 1400],
      [380, 800],
    ],
    pads: [0.1, 0.36, 0.62, 0.9],
  },
  binary_pulsars: {
    name: "Twin Pulsar Eight",
    accent: "#a855f7",
    points: [
      [900, 1625],
      [1296, 1479],
      [1650, 1125],
      [2004, 771],
      [2400, 625],
      [2796, 771],
      [2960, 1125],
      [2796, 1479],
      [2400, 1625],
      [2004, 1479],
      [1650, 1125],
      [1296, 771],
      [900, 625],
      [504, 771],
      [340, 1125],
      [504, 1479],
    ],
    pads: [0.27, 0.48, 0.77, 0.97],
  },
  obsidian_void: {
    name: "Event Horizon",
    accent: "#ec4899",
    points: [
      [450, 700],
      [1000, 420],
      [1700, 480],
      [2400, 400],
      [2950, 700],
      [2900, 1250],
      [2350, 1400],
      [1900, 1050],
      [1400, 1000],
      [1300, 1450],
      [800, 1800],
      [380, 1400],
    ],
    pads: [0.14, 0.4, 0.66, 0.93],
  },
};

function catmullRom(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  t: number
): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

export function wrapIndex(i: number, n: number): number {
  return ((i % n) + n) % n;
}

export function normalizeAngle(a: number): number {
  let out = a;
  while (out > Math.PI) out -= Math.PI * 2;
  while (out < -Math.PI) out += Math.PI * 2;
  return out;
}

export function buildTrack(theme: string): RaceTrack {
  const def = TRACK_DEFS[theme] ?? TRACK_DEFS.nebula_crucible;
  const pts = def.points;
  const count = pts.length;

  // 1. Dense closed Catmull-Rom spline through the control points.
  const dense: Array<[number, number]> = [];
  for (let i = 0; i < count; i++) {
    const p0 = pts[wrapIndex(i - 1, count)];
    const p1 = pts[i];
    const p2 = pts[wrapIndex(i + 1, count)];
    const p3 = pts[wrapIndex(i + 2, count)];
    for (let s = 0; s < 40; s++) {
      const t = s / 40;
      dense.push([
        catmullRom(p0[0], p1[0], p2[0], p3[0], t),
        catmullRom(p0[1], p1[1], p2[1], p3[1], t),
      ]);
    }
  }

  // 2. Resample at uniform arc length so one sample == one unit of progress.
  const cum: number[] = [0];
  for (let i = 0; i < dense.length; i++) {
    const a = dense[i];
    const b = dense[(i + 1) % dense.length];
    cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = cum[dense.length];
  const n = Math.max(60, Math.round(total / SAMPLE_SPACING));
  const step = total / n;
  const raw: Array<[number, number]> = [];
  let seg = 0;
  for (let k = 0; k < n; k++) {
    const target = k * step;
    while (seg < dense.length - 1 && cum[seg + 1] < target) seg++;
    const a = dense[seg];
    const b = dense[(seg + 1) % dense.length];
    const segLen = cum[seg + 1] - cum[seg] || 1;
    const f = (target - cum[seg]) / segLen;
    raw.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }

  let maxX = 0;
  let maxY = 0;
  const samples: TrackSample[] = raw.map((p, i) => {
    const prev = raw[wrapIndex(i - 1, n)];
    const next = raw[wrapIndex(i + 1, n)];
    const dx = next[0] - prev[0];
    const dy = next[1] - prev[1];
    const len = Math.hypot(dx, dy) || 1;
    const tx = dx / len;
    const ty = dy / len;
    maxX = Math.max(maxX, p[0]);
    maxY = Math.max(maxY, p[1]);
    return { x: p[0], y: p[1], tx, ty, nx: -ty, ny: tx };
  });

  return {
    theme,
    name: def.name,
    accent: def.accent,
    samples,
    boostPads: def.pads.map((f) => wrapIndex(Math.round(f * n), n)),
    worldW: maxX + 320,
    worldH: maxY + 320,
  };
}

/**
 * Finds the nearest track sample, searching only a window around the last
 * known index. The window is what stops shortcuts (and keeps the two branches
 * of the figure-8 apart): cutting across the infield does not advance progress.
 */
export function locateOnTrack(
  track: RaceTrack,
  x: number,
  y: number,
  lastIdx: number,
  window = 14
): { idx: number; delta: number; side: number } {
  const n = track.samples.length;
  let best = 0;
  let bestD = Infinity;
  for (let o = -window; o <= window; o++) {
    const s = track.samples[wrapIndex(lastIdx + o, n)];
    const d = (s.x - x) * (s.x - x) + (s.y - y) * (s.y - y);
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  const idx = wrapIndex(lastIdx + best, n);
  const s = track.samples[idx];
  // Signed lateral offset from the centre line (positive = right of travel).
  const side = (x - s.x) * s.nx + (y - s.y) * s.ny;
  return { idx, delta: best, side };
}

export interface BotRacer {
  x: number;
  y: number;
  angle: number;
  speed: number;
  idx: number;
  progress: number;
  /** Preferred lateral offset from the centre line. */
  lane: number;
  topSpeed: number;
  finishMs: number;
}

/** Kinematic AI driver: steers at a look-ahead point and brakes for bends. */
export function stepBotRacer(track: RaceTrack, bot: BotRacer, dt: number): void {
  const n = track.samples.length;
  const loc = locateOnTrack(track, bot.x, bot.y, bot.idx);
  bot.idx = loc.idx;
  bot.progress += loc.delta;

  const look = 4 + Math.floor(bot.speed / 85);
  const tgt = track.samples[wrapIndex(bot.idx + look, n)];
  const desired = Math.atan2(
    tgt.y + tgt.ny * bot.lane - bot.y,
    tgt.x + tgt.nx * bot.lane - bot.x
  );
  const diff = normalizeAngle(desired - bot.angle);
  const maxTurn = 3.6 * dt;
  bot.angle = normalizeAngle(
    bot.angle + Math.max(-maxTurn, Math.min(maxTurn, diff))
  );

  const a = track.samples[wrapIndex(bot.idx + 3, n)];
  const b = track.samples[wrapIndex(bot.idx + 15, n)];
  const bend = Math.abs(
    normalizeAngle(Math.atan2(b.ty, b.tx) - Math.atan2(a.ty, a.tx))
  );
  const want = bot.topSpeed * Math.max(0.55, 1 - bend * 0.32);
  const dv = want - bot.speed;
  bot.speed += Math.max(-560 * dt, Math.min(320 * dt, dv));

  bot.x += Math.cos(bot.angle) * bot.speed * dt;
  bot.y += Math.sin(bot.angle) * bot.speed * dt;
}
