// Pure rules for Hex Dominion. Shared by the server (authoritative) and the
// client (highlighting only). No imports, so it can be tested in plain Node.

export const HEX_RADIUS = 4;
export const HEX_TURN_MS = 30_000;
export const HEX_BOT_THINK_MS = 900;
export const HEX_EMPTY = -1;

export interface HexSeat {
  userId: number;
  username: string;
  color: string;
  isBot: boolean;
}

export interface HexMove {
  seat: number;
  from: string;
  to: string;
  jump: boolean;
  flipped: string[];
  /** True when the server played this move because the turn timer ran out. */
  auto: boolean;
}

export interface HexState {
  /** Version: increments with every applied move. */
  v: number;
  layout: string;
  radius: number;
  /** "q,r" -> seat index, or HEX_EMPTY. Void cells are simply absent. */
  cells: Record<string, number>;
  seats: HexSeat[];
  turn: number;
  turnStartedAt: number;
  status: "playing" | "finished";
  lastMove: HexMove | null;
  /** null while playing, and also null for a tied result. */
  winnerSeat: number | null;
}

const DIRS: Array<[number, number]> = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];

const BLOCKED_CELLS: Record<string, string[]> = {
  nebula_crucible: ["0,-1", "1,0", "-1,1"],
  binary_pulsars: ["0,0", "2,0", "0,2", "-2,2", "-2,0", "0,-2", "2,-2"],
  obsidian_void: ["0,0", "1,0", "1,-1", "0,-1", "-1,0", "-1,1", "0,1"],
};

export function hexKey(q: number, r: number): string {
  return `${q},${r}`;
}

export function parseHexKey(key: string): [number, number] {
  const parts = key.split(",");
  return [Number(parts[0]), Number(parts[1])];
}

export function hexDistance(a: string, b: string): number {
  const [aq, ar] = parseHexKey(a);
  const [bq, br] = parseHexKey(b);
  const dq = aq - bq;
  const dr = ar - br;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

const neighborCache = new Map<string, string[]>();

export function hexNeighbors(key: string): string[] {
  let list = neighborCache.get(key);
  if (!list) {
    const [q, r] = parseHexKey(key);
    list = DIRS.map(([dq, dr]) => hexKey(q + dq, r + dr));
    neighborCache.set(key, list);
  }
  return list;
}

const reachCache = new Map<string, Array<{ key: string; dist: number }>>();

/** All coordinates at distance 1 or 2 (18 of them), on the board or not. */
function hexReach(key: string): Array<{ key: string; dist: number }> {
  let list = reachCache.get(key);
  if (!list) {
    const [q, r] = parseHexKey(key);
    list = [];
    for (let dq = -2; dq <= 2; dq++) {
      for (let dr = Math.max(-2, -dq - 2); dr <= Math.min(2, -dq + 2); dr++) {
        if (dq === 0 && dr === 0) continue;
        const dist = (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
        list.push({ key: hexKey(q + dq, r + dr), dist });
      }
    }
    reachCache.set(key, list);
  }
  return list;
}

export function createHexState(
  seats: HexSeat[],
  layout: string,
  now: number
): HexState {
  const blocked = new Set(BLOCKED_CELLS[layout] ?? BLOCKED_CELLS.nebula_crucible);
  const R = HEX_RADIUS;
  const cells: Record<string, number> = {};
  for (let q = -R; q <= R; q++) {
    for (let r = Math.max(-R, -q - R); r <= Math.min(R, -q + R); r++) {
      const key = hexKey(q, r);
      if (!blocked.has(key)) cells[key] = HEX_EMPTY;
    }
  }

  // The six corners, in order around the board.
  const corners = [
    hexKey(R, -R),
    hexKey(R, 0),
    hexKey(0, R),
    hexKey(-R, R),
    hexKey(-R, 0),
    hexKey(0, -R),
  ];
  const plan: number[][] =
    seats.length === 2
      ? [
          [0, 2, 4],
          [1, 3, 5],
        ]
      : seats.length === 3
      ? [
          [0, 3],
          [1, 4],
          [2, 5],
        ]
      : [[0], [1], [3], [4]];
  seats.forEach((_, seat) => {
    for (const c of plan[seat] ?? []) cells[corners[c]] = seat;
  });

  return {
    v: 0,
    layout,
    radius: R,
    cells,
    seats,
    turn: 0,
    turnStartedAt: now,
    status: "playing",
    lastMove: null,
    winnerSeat: null,
  };
}

export function countPieces(state: HexState): number[] {
  const counts = state.seats.map(() => 0);
  for (const key of Object.keys(state.cells)) {
    const owner = state.cells[key];
    if (owner >= 0 && owner < counts.length) counts[owner] += 1;
  }
  return counts;
}

function seatHasMove(cells: Record<string, number>, seat: number): boolean {
  for (const key of Object.keys(cells)) {
    if (cells[key] !== seat) continue;
    for (const c of hexReach(key)) {
      if (cells[c.key] === HEX_EMPTY) return true;
    }
  }
  return false;
}

function finish(state: HexState): void {
  state.status = "finished";
  const counts = countPieces(state);
  const top = Math.max(...counts);
  const leaders = counts.filter((c) => c === top).length;
  state.winnerSeat = leaders === 1 ? counts.indexOf(top) : null;
}

/**
 * Validates and applies a move. Returns the next state, or null if the move
 * is illegal. Never mutates the input.
 */
export function applyHexMove(
  state: HexState,
  seat: number,
  from: string,
  to: string,
  now: number,
  auto = false
): HexState | null {
  if (state.status !== "playing" || state.turn !== seat) return null;
  if (state.cells[from] !== seat || state.cells[to] !== HEX_EMPTY) return null;
  const dist = hexDistance(from, to);
  if (dist !== 1 && dist !== 2) return null;

  const cells = { ...state.cells };
  const jump = dist === 2;
  if (jump) cells[from] = HEX_EMPTY;
  cells[to] = seat;

  const flipped: string[] = [];
  for (const nb of hexNeighbors(to)) {
    const owner = cells[nb];
    if (owner !== undefined && owner >= 0 && owner !== seat) {
      cells[nb] = seat;
      flipped.push(nb);
    }
  }

  const next: HexState = {
    ...state,
    v: state.v + 1,
    cells,
    lastMove: { seat, from, to, jump, flipped, auto },
    turnStartedAt: now,
  };

  // Pass the turn to the next seat that can move.
  const total = state.seats.length;
  let nextTurn = -1;
  for (let i = 1; i <= total; i++) {
    const cand = (seat + i) % total;
    if (seatHasMove(cells, cand)) {
      nextTurn = cand;
      break;
    }
  }

  if (nextTurn === -1) {
    finish(next);
  } else if (nextTurn === seat) {
    // Nobody else can move: the remaining empty cells go to the mover.
    for (const key of Object.keys(cells)) {
      if (cells[key] === HEX_EMPTY) cells[key] = seat;
    }
    finish(next);
  } else {
    next.turn = nextTurn;
  }
  return next;
}

/** The most orbs `seat` could lose to a single enemy reply on this board. */
function worstReply(cells: Record<string, number>, seat: number): number {
  let worst = 0;
  for (const key of Object.keys(cells)) {
    if (cells[key] !== HEX_EMPTY) continue;
    let mine = 0;
    for (const nb of hexNeighbors(key)) {
      if (cells[nb] === seat) mine += 1;
    }
    if (mine <= worst) continue;
    for (const c of hexReach(key)) {
      const owner = cells[c.key];
      if (owner !== undefined && owner >= 0 && owner !== seat) {
        worst = mine;
        break;
      }
    }
  }
  return worst;
}

/** Greedy move picker with a one-reply lookahead. Used by bots and timeouts. */
export function pickBotMove(
  state: HexState,
  seat: number
): { from: string; to: string } | null {
  const cells = state.cells;
  let best: { from: string; to: string } | null = null;
  let bestScore = -Infinity;
  for (const from of Object.keys(cells)) {
    if (cells[from] !== seat) continue;
    for (const c of hexReach(from)) {
      if (cells[c.key] !== HEX_EMPTY) continue;
      const jump = c.dist === 2;
      const sim = { ...cells };
      if (jump) sim[from] = HEX_EMPTY;
      sim[c.key] = seat;
      let gain = jump ? 0 : 1;
      for (const nb of hexNeighbors(c.key)) {
        const owner = sim[nb];
        if (owner !== undefined && owner >= 0 && owner !== seat) {
          sim[nb] = seat;
          gain += 1;
        }
      }
      const score = gain - 0.65 * worstReply(sim, seat) + Math.random() * 0.3;
      if (score > bestScore) {
        bestScore = score;
        best = { from, to: c.key };
      }
    }
  }
  return best;
}
