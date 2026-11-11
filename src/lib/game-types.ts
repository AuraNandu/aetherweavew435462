export type ShipChassis = "valkyrie" | "interceptor" | "phoenix" | "mantis";

/**
 * Every entry here is a distinct, implemented game. The `mode` column of a room
 * stores one of these ids.
 */
export type GameMode =
  | "flux_harvest"
  | "singularity_brawl"
  | "prism_rush"
  | "hex_dominion";

export type GameKind = "arena" | "race" | "hex";

export type MapTheme = "nebula_crucible" | "binary_pulsars" | "obsidian_void";

export interface PublicUser {
  id: number;
  username: string;
  shipChassis: ShipChassis;
  auraColor: string;
  bio: string;
  xp: number;
  wins: number;
  kills: number;
  matchesPlayed: number;
  currentRoomCode: string | null;
  isOnline: boolean;
  lastSeenAt: string;
}

export const SHIP_CHASSIS_LIST: {
  id: ShipChassis;
  name: string;
  tagline: string;
  speedBonus: string;
}[] = [
  {
    id: "valkyrie",
    name: "Valkyrie Prism",
    tagline: "Balanced delta-wing interceptor with twin orbital stabilizers",
    speedBonus: "Arena: no modifier",
  },
  {
    id: "interceptor",
    name: "Obsidian Lance",
    tagline: "Needle-frame railcraft tuned for high-velocity slingshots",
    speedBonus: "Arena: less drag (glides longer)",
  },
  {
    id: "phoenix",
    name: "Solaris Phoenix",
    tagline: "Wide solar-sail wingframe with reinforced plating",
    speedBonus: "Arena: +20 hull",
  },
  {
    id: "mantis",
    name: "Abyssal Mantis",
    tagline: "Forward-swept scythe craft built for aggressive tethering",
    speedBonus: "Arena: longer tether reach",
  },
];

export const AURA_PALETTES: { name: string; hex: string }[] = [
  { name: "Bio Cyan", hex: "#22d3ee" },
  { name: "Rift Violet", hex: "#a855f7" },
  { name: "Nova Magenta", hex: "#ec4899" },
  { name: "Solar Amber", hex: "#f59e0b" },
  { name: "Emerald Pulse", hex: "#10b981" },
  { name: "Crimson Flare", hex: "#f43f5e" },
];

export interface GameModeSpec {
  id: GameMode;
  kind: GameKind;
  name: string;
  genre: string;
  tagline: string;
  description: string;
  /** Match length cap in seconds (0 = untimed, turn-based). */
  durationSec: number;
  players: string;
  /** Bots are added until the room has this many players (when bot fill is on). */
  botFillTo: number;
  cover: string;
  accent: string;
  controls: { keys: string; title: string; text: string }[];
  mapNotes: Record<MapTheme, string>;
}

export const GAME_MODES: GameModeSpec[] = [
  {
    id: "flux_harvest",
    kind: "arena",
    name: "Aetherweave: Flux Harvest",
    genre: "Arena · Objective",
    tagline: "Collect, bank and dogfight around living gravity wells",
    description:
      "Collect drifting Aether Cores and bank them at the two Nexus Gates. Plasma bolts bend around gravity wells, tethers slingshot you or hurl asteroids, and being shot down drops half of your unbanked flux.",
    durationSec: 180,
    players: "1–6 pilots",
    botFillTo: 4,
    cover: "/images/cover-arena.png",
    accent: "#22d3ee",
    controls: [
      {
        keys: "L-CLICK",
        title: "Arc Plasma Bolts",
        text: "Shots bend around gravity wells and turn into golden Overcharged Arcs for 1.65x damage.",
      },
      {
        keys: "R-CLICK / E",
        title: "Quantum Tether",
        text: "Slingshot around pulsars, reel in Flux Cores, or grab an asteroid and fling it as a comet.",
      },
      {
        keys: "SPACE",
        title: "Nova Deflect Dash",
        text: "Dash forward and reflect enemy bolts caught in the shockwave.",
      },
    ],
    mapNotes: {
      nebula_crucible: "Central pulsar with two small orbiting wells.",
      binary_pulsars: "Two pulsars orbiting each other — figure-8 slingshots.",
      obsidian_void:
        "Central black hole that damages and ejects you, flanked by two pulsars.",
    },
  },
  {
    id: "singularity_brawl",
    kind: "arena",
    name: "Aetherweave: Singularity Brawl",
    genre: "Arena · Deathmatch",
    tagline: "Pure dogfight — no cores, no gates, only eliminations",
    description:
      "The same gravity arena with the objective stripped out: no Flux Cores and no Nexus Gates. Points come only from landing hits and eliminations, and Cyber-Bots hunt pilots instead of harvesting.",
    durationSec: 150,
    players: "1–6 pilots",
    botFillTo: 4,
    cover: "/images/cover-arena.png",
    accent: "#ec4899",
    controls: [
      {
        keys: "L-CLICK",
        title: "Arc Plasma Bolts",
        text: "Curve shots around a gravity well to overcharge them for 1.65x damage.",
      },
      {
        keys: "R-CLICK / E",
        title: "Quantum Tether",
        text: "Slingshot around pulsars for speed, or grab an asteroid and fling it as a comet.",
      },
      {
        keys: "SPACE",
        title: "Nova Deflect Dash",
        text: "Dash forward and reflect enemy bolts caught in the shockwave.",
      },
    ],
    mapNotes: {
      nebula_crucible: "Central pulsar with two small orbiting wells.",
      binary_pulsars: "Two pulsars orbiting each other — figure-8 slingshots.",
      obsidian_void:
        "Central black hole that damages and ejects you, flanked by two pulsars.",
    },
  },
  {
    id: "prism_rush",
    kind: "race",
    name: "Prism Rush",
    genre: "Racing",
    tagline: "3-lap neon hover racing with drift-charged boost",
    description:
      "Race hover-craft over 3 laps. Hold Shift to drift through corners and charge your boost, hit the boost pads, and stay inside the neon edge — the run-off outside it slows you down. Racers pass through each other, so it is all about your racing line.",
    durationSec: 180,
    players: "1–6 pilots",
    botFillTo: 4,
    cover: "/images/cover-race.png",
    accent: "#f59e0b",
    controls: [
      {
        keys: "W A S D / ARROWS",
        title: "Drive",
        text: "Accelerate, brake and steer. Leaving the track costs you speed.",
      },
      {
        keys: "SHIFT",
        title: "Drift",
        text: "Slide through corners. Releasing a long drift refills boost energy.",
      },
      {
        keys: "SPACE",
        title: "Boost",
        text: "Burn boost energy for a burst of speed. Boost pads refill it.",
      },
    ],
    mapNotes: {
      nebula_crucible: "Crucible Circuit — fast sweepers and one inward hairpin.",
      binary_pulsars: "Twin Pulsar Eight — a figure-8 with a crossover.",
      obsidian_void: "Event Horizon — a technical track with two tight corners.",
    },
  },
  {
    id: "hex_dominion",
    kind: "hex",
    name: "Hex Dominion",
    genre: "Turn-based strategy",
    tagline: "Clone, jump and convert — most orbs wins",
    description:
      "A turn-based territory game for 2–4 players on a hex board. Clone an orb into a neighbouring cell or jump two cells away; every enemy orb next to where you land flips to your colour. The game ends when nobody can move, and the most orbs wins. Moves are validated and stored on the server.",
    durationSec: 0,
    players: "2–4 players (a bot joins a solo room)",
    botFillTo: 2,
    cover: "/images/cover-hex.png",
    accent: "#a855f7",
    controls: [
      {
        keys: "CLICK ORB",
        title: "Select",
        text: "Pick one of your orbs on your turn. Legal targets light up.",
      },
      {
        keys: "ADJACENT CELL",
        title: "Clone",
        text: "Grow into a neighbouring cell — you keep the original orb.",
      },
      {
        keys: "2 CELLS AWAY",
        title: "Jump",
        text: "Leap further, but the cell you left becomes empty.",
      },
    ],
    mapNotes: {
      nebula_crucible: "Classic board with three void cells around the centre.",
      binary_pulsars: "Dead core plus a ring of six void pylons.",
      obsidian_void: "Large central void — the board becomes a ring.",
    },
  },
];

export const MAP_THEMES: {
  id: MapTheme;
  name: string;
  subtitle: string;
  accent: string;
}[] = [
  {
    id: "nebula_crucible",
    name: "Nebula Crucible",
    subtitle: "Sector layout — see the note for the selected game",
    accent: "#22d3ee",
  },
  {
    id: "binary_pulsars",
    name: "Binary Pulsars",
    subtitle: "Sector layout — see the note for the selected game",
    accent: "#a855f7",
  },
  {
    id: "obsidian_void",
    name: "Obsidian Singularity",
    subtitle: "Sector layout — see the note for the selected game",
    accent: "#ec4899",
  },
];

export interface PlayerNetState {
  userId: number; // negative IDs are AI cyber-bots (-1, -2, ...)
  username: string;
  isBot?: boolean;
  shipChassis: ShipChassis;
  auraColor: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  hp: number;
  maxHp: number;
  energy: number;
  score: number;
  kills: number;
  deaths: number;
  carryingFlux: number;
  shieldUntil: number;
  tetherType: "none" | "well" | "asteroid" | "core" | "ship";
  tetherX: number;
  tetherY: number;
  alive: boolean;
  respawnAt: number;
  updatedAt: number;
  /** Prism Rush only: track progress in samples (laps * samplesPerLap + index). */
  progress?: number;
  /** Prism Rush only: finish time in ms since GO (0 = still racing). */
  finishMs?: number;
  /** Prism Rush only: boost currently firing. */
  boosting?: boolean;
}

export interface RoomEventPayload {
  kind:
    | "fire"
    | "nova"
    | "hit"
    | "kill"
    | "bank"
    | "match_start"
    | "match_end"
    | "bot_sync";
  senderId: number;
  senderName?: string;
  data: Record<string, unknown>;
  ts: number;
}

export interface ChatMessageDTO {
  id: number;
  channel: string;
  userId: number | null;
  senderName: string;
  senderColor: string;
  kind: "chat" | "system" | "emote";
  body: string;
  createdAt: string;
}

export interface RoomParticipantDTO {
  userId: number;
  username: string;
  shipChassis: ShipChassis;
  auraColor: string;
  isReady: boolean;
  voiceEnabled: boolean;
  isMuted: boolean;
  team: string;
  lastScore: number;
  lastKills: number;
  xp: number;
  wins: number;
}

export interface RoomDetailDTO {
  id: number;
  code: string;
  name: string;
  hostId: number;
  hostUsername: string;
  mode: GameMode;
  mapTheme: MapTheme;
  isPrivate: boolean;
  maxPlayers: number;
  botFill: boolean;
  status: "lobby" | "playing" | "finished";
  matchStartedAt: string | null;
  participants: RoomParticipantDTO[];
}
