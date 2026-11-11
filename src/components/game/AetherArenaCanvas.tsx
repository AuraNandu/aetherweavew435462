"use client";

import { useEffect, useRef, useState } from "react";
import {
  Maximize2,
  Minimize2,
  Volume2,
  VolumeX,
  Trophy,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import type {
  PlayerNetState,
  PublicUser,
  RoomDetailDTO,
  RoomEventPayload,
  ShipChassis,
} from "@/lib/game-types";
import { GAME_MODES } from "@/lib/game-types";
import type { RoomRealtimeTransport } from "@/lib/realtime-client";
import { soundFX } from "@/lib/sound-fx";

const WORLD_W = 2400;
const WORLD_H = 1600;

interface GravityWell {
  id: string;
  baseX: number;
  baseY: number;
  x: number;
  y: number;
  radius: number;
  strength: number;
  kind: "pulsar" | "blackhole";
  color: string;
  orbitRadius: number;
  orbitSpeed: number;
  orbitPhase: number;
}

interface FluxCore {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  value: number;
  color: string;
  pulse: number;
}

interface Asteroid {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  angle: number;
  spin: number;
  hp: number;
  thrownBy: number | null;
  thrownUntil: number;
}

interface Projectile {
  id: string;
  ownerId: number;
  ownerName: string;
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  overcharged: boolean;
  life: number;
  trail: Array<{ x: number; y: number }>;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
}

interface Shockwave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  color: string;
  alpha: number;
}

interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
}

interface Afterimage {
  x: number;
  y: number;
  angle: number;
  chassis: ShipChassis;
  color: string;
  alpha: number;
}

interface KillFeedEntry {
  id: string;
  text: string;
  color: string;
  ts: number;
}

interface BotBrain {
  userId: number;
  username: string;
  chassis: ShipChassis;
  auraColor: string;
  fireCd: number;
  dashCd: number;
  wanderAngle: number;
  state: PlayerNetState;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

function buildInitialWells(theme: string): GravityWell[] {
  if (theme === "binary_pulsars") {
    return [
      {
        id: "well-a",
        baseX: WORLD_W / 2,
        baseY: WORLD_H / 2,
        x: WORLD_W / 2 - 260,
        y: WORLD_H / 2,
        radius: 56,
        strength: 1550,
        kind: "pulsar",
        color: "#22d3ee",
        orbitRadius: 270,
        orbitSpeed: 0.42,
        orbitPhase: 0,
      },
      {
        id: "well-b",
        baseX: WORLD_W / 2,
        baseY: WORLD_H / 2,
        x: WORLD_W / 2 + 260,
        y: WORLD_H / 2,
        radius: 56,
        strength: 1550,
        kind: "pulsar",
        color: "#a855f7",
        orbitRadius: 270,
        orbitSpeed: 0.42,
        orbitPhase: Math.PI,
      },
    ];
  }

  if (theme === "obsidian_void") {
    return [
      {
        id: "well-core",
        baseX: WORLD_W / 2,
        baseY: WORLD_H / 2,
        x: WORLD_W / 2,
        y: WORLD_H / 2,
        radius: 68,
        strength: 2250,
        kind: "blackhole",
        color: "#ec4899",
        orbitRadius: 0,
        orbitSpeed: 0,
        orbitPhase: 0,
      },
      {
        id: "well-west",
        baseX: 600,
        baseY: WORLD_H / 2,
        x: 600,
        y: WORLD_H / 2,
        radius: 42,
        strength: 1150,
        kind: "pulsar",
        color: "#22d3ee",
        orbitRadius: 0,
        orbitSpeed: 0,
        orbitPhase: 0,
      },
      {
        id: "well-east",
        baseX: WORLD_W - 600,
        baseY: WORLD_H / 2,
        x: WORLD_W - 600,
        y: WORLD_H / 2,
        radius: 42,
        strength: 1150,
        kind: "pulsar",
        color: "#22d3ee",
        orbitRadius: 0,
        orbitSpeed: 0,
        orbitPhase: 0,
      },
    ];
  }

  // nebula_crucible default
  return [
    {
      id: "well-center",
      baseX: WORLD_W / 2,
      baseY: WORLD_H / 2,
      x: WORLD_W / 2,
      y: WORLD_H / 2,
      radius: 62,
      strength: 1700,
      kind: "pulsar",
      color: "#22d3ee",
      orbitRadius: 0,
      orbitSpeed: 0,
      orbitPhase: 0,
    },
    {
      id: "well-north",
      baseX: WORLD_W / 2,
      baseY: 360,
      x: WORLD_W / 2,
      y: 360,
      radius: 38,
      strength: 1050,
      kind: "pulsar",
      color: "#a855f7",
      orbitRadius: 110,
      orbitSpeed: 0.35,
      orbitPhase: 0.6,
    },
    {
      id: "well-south",
      baseX: WORLD_W / 2,
      baseY: WORLD_H - 360,
      x: WORLD_W / 2,
      y: WORLD_H - 360,
      radius: 38,
      strength: 1050,
      kind: "pulsar",
      color: "#ec4899",
      orbitRadius: 110,
      orbitSpeed: 0.35,
      orbitPhase: 3.7,
    },
  ];
}

function drawShipHull(
  ctx: CanvasRenderingContext2D,
  chassis: ShipChassis,
  color: string,
  radius = 18
) {
  ctx.save();
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = color;
  ctx.fillStyle = "#080f22";
  ctx.shadowBlur = 16;
  ctx.shadowColor = color;

  ctx.beginPath();
  if (chassis === "interceptor") {
    ctx.moveTo(radius * 1.35, 0);
    ctx.lineTo(-radius * 0.6, -radius * 0.85);
    ctx.lineTo(-radius * 0.95, -radius * 0.35);
    ctx.lineTo(-radius * 0.5, 0);
    ctx.lineTo(-radius * 0.95, radius * 0.35);
    ctx.lineTo(-radius * 0.6, radius * 0.85);
  } else if (chassis === "phoenix") {
    ctx.moveTo(radius * 1.2, 0);
    ctx.lineTo(0, -radius * 0.55);
    ctx.lineTo(-radius * 0.3, -radius * 1.25);
    ctx.lineTo(-radius * 0.9, -radius * 0.7);
    ctx.lineTo(-radius * 0.65, 0);
    ctx.lineTo(-radius * 0.9, radius * 0.7);
    ctx.lineTo(-radius * 0.3, radius * 1.25);
    ctx.lineTo(0, radius * 0.55);
  } else if (chassis === "mantis") {
    ctx.moveTo(radius * 0.9, 0);
    ctx.lineTo(radius * 0.25, -radius * 0.5);
    ctx.lineTo(radius * 1.05, -radius * 1.1);
    ctx.lineTo(-radius * 0.75, -radius * 0.85);
    ctx.lineTo(-radius * 0.5, 0);
    ctx.lineTo(-radius * 0.75, radius * 0.85);
    ctx.lineTo(radius * 1.05, radius * 1.1);
    ctx.lineTo(radius * 0.25, radius * 0.5);
  } else {
    // valkyrie
    ctx.moveTo(radius * 1.25, 0);
    ctx.lineTo(-radius * 0.45, -radius * 1.05);
    ctx.lineTo(-radius * 0.85, -radius * 0.45);
    ctx.lineTo(-radius * 0.55, 0);
    ctx.lineTo(-radius * 0.85, radius * 0.45);
    ctx.lineTo(-radius * 0.45, radius * 1.05);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Inner cockpit glow
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#e0f7ff";
  ctx.beginPath();
  ctx.ellipse(radius * 0.2, 0, radius * 0.35, radius * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function AetherArenaCanvas({
  room,
  user,
  transportRef,
  remotePlayersRef,
  incomingEventRef,
  onMatchFinish,
  onReturnLobby,
}: {
  room: RoomDetailDTO;
  user: PublicUser;
  transportRef: React.MutableRefObject<RoomRealtimeTransport | null>;
  remotePlayersRef: React.MutableRefObject<Map<number, PlayerNetState>>;
  incomingEventRef: React.MutableRefObject<RoomEventPayload[]>;
  onMatchFinish: (standings: Array<{ userId: number; score: number; kills: number }>) => void;
  onReturnLobby: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [muted, setMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hudState, setHudState] = useState({
    hp: 100,
    maxHp: 100,
    energy: 100,
    novaReady: true,
    novaCooldownPct: 1,
    carryingFlux: 0,
    score: 0,
    kills: 0,
    timeLeftSec: 180,
    leaderboard: [] as Array<{
      userId: number;
      username: string;
      score: number;
      kills: number;
      auraColor: string;
      isBot?: boolean;
    }>,
    killFeed: [] as KillFeedEntry[],
    matchEnded: false,
  });

  const isHost = room.hostId === user.id;
  const modeSpec =
    GAME_MODES.find((m) => m.id === room.mode) ?? GAME_MODES[0];

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    soundFX.muted = next;
  };

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      await containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      await document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const nebulaImg = new Image();
    nebulaImg.src = "/images/nebula-backdrop.png";

    const stars = Array.from({ length: 240 }, (_, i) => ({
      x: ((i * 7919) % WORLD_W),
      y: ((i * 6271) % WORLD_H),
      size: (i % 3) * 0.7 + 0.7,
      depth: (i % 3) * 0.22 + 0.25,
      color:
        i % 7 === 0 ? "#22d3ee" : i % 11 === 0 ? "#c084fc" : "#e2e8f0",
    }));

    const wells = buildInitialWells(room.mapTheme);

    // Singularity Brawl is a pure deathmatch: no gates and no flux cores.
    const isBrawl = room.mode === "singularity_brawl";
    const nexusGates = isBrawl ? [] : [
      { id: "gate-west", x: 260, y: WORLD_H / 2, radius: 74, color: "#22d3ee" },
      {
        id: "gate-east",
        x: WORLD_W - 260,
        y: WORLD_H / 2,
        radius: 74,
        color: "#a855f7",
      },
    ];

    const fluxCores: FluxCore[] = Array.from({ length: isBrawl ? 0 : 18 }, (_, i) => {
      const ang = (i / 18) * Math.PI * 2;
      const rad = 260 + (i % 3) * 180;
      return {
        id: i + 1,
        x: clamp(WORLD_W / 2 + Math.cos(ang) * rad, 160, WORLD_W - 160),
        y: clamp(WORLD_H / 2 + Math.sin(ang) * (rad * 0.7), 160, WORLD_H - 160),
        vx: Math.cos(ang + 1.5) * 18,
        vy: Math.sin(ang + 1.5) * 18,
        value: i % 5 === 0 ? 120 : 60,
        color: i % 5 === 0 ? "#fbbf24" : "#22d3ee",
        pulse: Math.random() * Math.PI * 2,
      };
    });
    let nextCoreId = 100;

    const asteroids: Asteroid[] = Array.from({ length: 11 }, (_, i) => {
      const ang = (i / 11) * Math.PI * 2;
      return {
        id: i + 1,
        x: WORLD_W / 2 + Math.cos(ang) * (440 + (i % 2) * 260),
        y: WORLD_H / 2 + Math.sin(ang) * (310 + (i % 3) * 120),
        vx: (Math.sin(i * 2.1) - 0.5) * 28,
        vy: (Math.cos(i * 1.7) - 0.5) * 28,
        radius: 24 + (i % 3) * 8,
        angle: i * 0.9,
        spin: (i % 2 === 0 ? 1 : -1) * 0.7,
        hp: 70,
        thrownBy: null,
        thrownUntil: 0,
      };
    });

    // Spawn local player
    const spawnAngle = (user.id % 6) * ((Math.PI * 2) / 6);
    const hullMax = user.shipChassis === "phoenix" ? 120 : 100;
    const localPlayer: PlayerNetState = {
      userId: user.id,
      username: user.username,
      isBot: false,
      shipChassis: user.shipChassis,
      auraColor: user.auraColor,
      x: WORLD_W / 2 + Math.cos(spawnAngle) * 680,
      y: WORLD_H / 2 + Math.sin(spawnAngle) * 440,
      vx: 0,
      vy: 0,
      angle: spawnAngle + Math.PI,
      hp: hullMax,
      maxHp: hullMax,
      energy: 100,
      score: 0,
      kills: 0,
      deaths: 0,
      carryingFlux: 0,
      shieldUntil: Date.now() + 2500,
      tetherType: "none",
      tetherX: 0,
      tetherY: 0,
      alive: true,
      respawnAt: 0,
      updatedAt: Date.now(),
    };

    // AI Cyber-Bots managed by host if botFill enabled
    const bots: BotBrain[] = [];
    if (isHost && room.botFill) {
      const botSpecs: Array<{
        id: number;
        name: string;
        chassis: ShipChassis;
        color: string;
      }> = [
        { id: -1, name: "Bot_Helios", chassis: "phoenix", color: "#f59e0b" },
        { id: -2, name: "Bot_Nyx", chassis: "mantis", color: "#ec4899" },
        { id: -3, name: "Bot_Orion", chassis: "interceptor", color: "#10b981" },
      ];
      const needed = Math.max(0, 4 - room.participants.length);
      for (let i = 0; i < Math.min(needed, botSpecs.length); i++) {
        const b = botSpecs[i];
        const a = ((i + 1.5) / 4) * Math.PI * 2;
        bots.push({
          userId: b.id,
          username: b.name,
          chassis: b.chassis,
          auraColor: b.color,
          fireCd: 0.8 + i * 0.3,
          dashCd: 3,
          wanderAngle: a,
          state: {
            userId: b.id,
            username: b.name,
            isBot: true,
            shipChassis: b.chassis,
            auraColor: b.color,
            x: WORLD_W / 2 + Math.cos(a) * 650,
            y: WORLD_H / 2 + Math.sin(a) * 420,
            vx: 0,
            vy: 0,
            angle: a + Math.PI,
            hp: 100,
            maxHp: 100,
            energy: 100,
            score: 0,
            kills: 0,
            deaths: 0,
            carryingFlux: 0,
            shieldUntil: Date.now() + 2000,
            tetherType: "none",
            tetherX: 0,
            tetherY: 0,
            alive: true,
            respawnAt: 0,
            updatedAt: Date.now(),
          },
        });
      }
    }

    const projectiles: Projectile[] = [];
    const particles: Particle[] = [];
    const shockwaves: Shockwave[] = [];
    const floatingTexts: FloatingText[] = [];
    const afterimages: Afterimage[] = [];
    const killFeed: KillFeedEntry[] = [];
    const smoothedRemote = new Map<number, PlayerNetState>();

    type TetherTarget =
      | { kind: "well"; id: string }
      | { kind: "asteroid"; id: number }
      | { kind: "core"; id: number }
      | { kind: "ship"; id: number };
    const tetherState: { current: TetherTarget | null } = { current: null };
    let tetherOrbitRadius = 180;

    // Input state
    const keys = new Set<string>();
    const mouse = {
      screenX: canvas.width / 2,
      screenY: canvas.height / 2,
      worldX: localPlayer.x + 120,
      worldY: localPlayer.y,
      leftDown: false,
      rightDown: false,
    };

    let camX = localPlayer.x;
    let camY = localPlayer.y;
    let screenShake = 0;
    let fireCooldown = 0;
    let novaCooldown = 0;
    const NOVA_CD_MAX = 4.2;
    let matchStartMs = room.matchStartedAt
      ? new Date(room.matchStartedAt).getTime()
      : Date.now();
    const startedFinished = room.status === "finished";
    const mountedAtMs = Date.now();
    let matchEnded = startedFinished;

    const addFloatingText = (
      x: number,
      y: number,
      text: string,
      color: string
    ) => {
      floatingTexts.push({ x, y, text, color, life: 1.05, maxLife: 1.05 });
    };

    const spawnBurst = (
      x: number,
      y: number,
      color: string,
      count = 16,
      speed = 220
    ) => {
      for (let i = 0; i < count; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = (0.3 + Math.random() * 0.9) * speed;
        particles.push({
          x,
          y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          size: 2 + Math.random() * 3.5,
          color,
          alpha: 1,
          life: 0.45 + Math.random() * 0.45,
          maxLife: 0.9,
        });
      }
    };

    const pushKillFeed = (text: string, color: string) => {
      killFeed.unshift({
        id: `${Date.now()}-${Math.random()}`,
        text,
        color,
        ts: Date.now(),
      });
      if (killFeed.length > 5) killFeed.length = 5;
    };

    const triggerNovaDash = () => {
      if (!localPlayer.alive || novaCooldown > 0 || matchEnded) return;
      novaCooldown = NOVA_CD_MAX;
      soundFX.playNova();
      screenShake = Math.max(screenShake, 8);

      // Dash impulse toward aim
      const dashSpd = 690;
      localPlayer.vx += Math.cos(localPlayer.angle) * dashSpd;
      localPlayer.vy += Math.sin(localPlayer.angle) * dashSpd;
      localPlayer.shieldUntil = Math.max(
        localPlayer.shieldUntil,
        Date.now() + 850
      );

      for (let i = 0; i < 3; i++) {
        afterimages.push({
          x: localPlayer.x - Math.cos(localPlayer.angle) * i * 24,
          y: localPlayer.y - Math.sin(localPlayer.angle) * i * 24,
          angle: localPlayer.angle,
          chassis: localPlayer.shipChassis,
          color: localPlayer.auraColor,
          alpha: 0.7 - i * 0.18,
        });
      }

      shockwaves.push({
        x: localPlayer.x,
        y: localPlayer.y,
        radius: 20,
        maxRadius: 230,
        color: localPlayer.auraColor,
        alpha: 1,
      });

      // Deflect enemy projectiles in radius!
      let deflectedCount = 0;
      for (const proj of projectiles) {
        if (
          proj.ownerId !== localPlayer.userId &&
          dist(proj.x, proj.y, localPlayer.x, localPlayer.y) < 220
        ) {
          proj.ownerId = localPlayer.userId;
          proj.ownerName = localPlayer.username;
          proj.color = localPlayer.auraColor;
          proj.vx = -proj.vx * 1.25;
          proj.vy = -proj.vy * 1.25;
          proj.overcharged = true;
          proj.damage = 42;
          proj.life = 2.0;
          deflectedCount++;
        }
      }

      if (deflectedCount > 0) {
        addFloatingText(
          localPlayer.x,
          localPlayer.y - 32,
          `DEFLECTED x${deflectedCount}!`,
          "#22d3ee"
        );
      }

      void transportRef.current?.sendGameEvent({
        kind: "nova",
        data: { x: localPlayer.x, y: localPlayer.y, color: localPlayer.auraColor },
      });
    };

    const acquireTether = () => {
      if (!localPlayer.alive || tetherState.current || matchEnded) return;
      const maxReach = localPlayer.shipChassis === "mantis" ? 490 : 410;
      let bestDist = maxReach;
      let chosen: TetherTarget | null = null;

      // Prefer items near cursor direction
      const scoreCandidate = (x: number, y: number) => {
        const dShip = dist(localPlayer.x, localPlayer.y, x, y);
        if (dShip > maxReach) return Infinity;
        const dMouse = dist(mouse.worldX, mouse.worldY, x, y);
        return dShip * 0.45 + dMouse * 0.55;
      };

      for (const w of wells) {
        const s = scoreCandidate(w.x, w.y);
        if (s < bestDist) {
          bestDist = s;
          chosen = { kind: "well", id: w.id };
          tetherOrbitRadius = clamp(
            dist(localPlayer.x, localPlayer.y, w.x, w.y),
            w.radius + 55,
            340
          );
        }
      }
      for (const a of asteroids) {
        const s = scoreCandidate(a.x, a.y);
        if (s < bestDist) {
          bestDist = s;
          chosen = { kind: "asteroid", id: a.id };
        }
      }
      for (const c of fluxCores) {
        const s = scoreCandidate(c.x, c.y);
        if (s < bestDist) {
          bestDist = s;
          chosen = { kind: "core", id: c.id };
        }
      }

      if (chosen) {
        tetherState.current = chosen;
        soundFX.playTether();
      }
    };

    const releaseTether = () => {
      const target = tetherState.current;
      if (!target) return;
      if (target.kind === "asteroid") {
        const ast = asteroids.find((a) => a.id === target.id);
        if (ast) {
          const throwDir = Math.atan2(
            mouse.worldY - ast.y,
            mouse.worldX - ast.x
          );
          ast.vx = Math.cos(throwDir) * 680 + localPlayer.vx * 0.4;
          ast.vy = Math.sin(throwDir) * 680 + localPlayer.vy * 0.4;
          ast.thrownBy = localPlayer.userId;
          ast.thrownUntil = Date.now() + 2200;
          addFloatingText(ast.x, ast.y - 20, "COMET FLING!", "#fbbf24");
        }
      } else if (target.kind === "well") {
        // Slingshot exit boost!
        const speed = Math.hypot(localPlayer.vx, localPlayer.vy);
        if (speed > 260) {
          localPlayer.vx *= 1.28;
          localPlayer.vy *= 1.28;
          addFloatingText(
            localPlayer.x,
            localPlayer.y - 28,
            "SLINGSHOT BOOST!",
            "#22d3ee"
          );
        }
      }
      tetherState.current = null;
      localPlayer.tetherType = "none";
    };

    const fireBolt = (
      shooter: PlayerNetState,
      isLocal: boolean
    ) => {
      const muzzleX = shooter.x + Math.cos(shooter.angle) * 24;
      const muzzleY = shooter.y + Math.sin(shooter.angle) * 24;
      const spd = 760;
      const p: Projectile = {
        id: `${shooter.userId}-${Date.now()}-${Math.random()}`,
        ownerId: shooter.userId,
        ownerName: shooter.username,
        color: shooter.auraColor,
        x: muzzleX,
        y: muzzleY,
        vx: Math.cos(shooter.angle) * spd + shooter.vx * 0.25,
        vy: Math.sin(shooter.angle) * spd + shooter.vy * 0.25,
        damage: 24,
        overcharged: false,
        life: 1.75,
        trail: [],
      };
      projectiles.push(p);
      if (isLocal) {
        soundFX.playShot(false);
        void transportRef.current?.sendGameEvent({
          kind: "fire",
          data: {
            x: p.x,
            y: p.y,
            vx: p.vx,
            vy: p.vy,
            color: p.color,
          },
        });
      }
    };

    const isInputFocused = () => {
      const el = document.activeElement;
      if (!el) return false;
      const tag = el.tagName.toLowerCase();
      return tag === "input" || tag === "textarea";
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isInputFocused()) return;
      const k = e.key.toLowerCase();
      keys.add(k);
      if (k === " " || k === "shift" || k === "q") {
        e.preventDefault();
        triggerNovaDash();
      } else if (k === "e") {
        acquireTether();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      keys.delete(k);
      if (k === "e") {
        releaseTether();
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.screenX = e.clientX - rect.left;
      mouse.screenY = e.clientY - rect.top;
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) mouse.leftDown = true;
      if (e.button === 2) {
        mouse.rightDown = true;
        acquireTether();
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) mouse.leftDown = false;
      if (e.button === 2) {
        mouse.rightDown = false;
        releaseTether();
      }
    };

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("contextmenu", onContextMenu);

    const resizeCanvas = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(320, Math.floor(rect.width * dpr));
      canvas.height = Math.max(320, Math.floor(rect.height * dpr));
    };
    resizeCanvas();
    const ro = new ResizeObserver(resizeCanvas);
    if (containerRef.current) ro.observe(containerRef.current);

    let lastTime = performance.now();
    let lastNetSync = 0;
    let lastHudSync = 0;
    let hudFrozen = false;
    let rafId = 0;

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      const nowMs = Date.now();
      const timeSec = now / 1000;

      // Consume incoming room events (remote shots, novas, hits, kills, banks)
      if (incomingEventRef.current.length > 0) {
        const events = incomingEventRef.current.splice(0);
        for (const ev of events) {
          if (ev.senderId === user.id) continue;
          const d = ev.data || {};
          if (ev.kind === "fire") {
            projectiles.push({
              id: `rem-${ev.senderId}-${ev.ts}-${Math.random()}`,
              ownerId: ev.senderId,
              ownerName: ev.senderName || "Pilot",
              color: String(d.color || "#a855f7"),
              x: Number(d.x || 0),
              y: Number(d.y || 0),
              vx: Number(d.vx || 0),
              vy: Number(d.vy || 0),
              damage: 24,
              overcharged: false,
              life: 1.75,
              trail: [],
            });
          } else if (ev.kind === "nova") {
            shockwaves.push({
              x: Number(d.x || 0),
              y: Number(d.y || 0),
              radius: 20,
              maxRadius: 230,
              color: String(d.color || "#a855f7"),
              alpha: 1,
            });
          } else if (ev.kind === "kill") {
            pushKillFeed(
              String(d.summary || `${ev.senderName} scored an elimination!`),
              String(d.color || "#ec4899")
            );
          } else if (ev.kind === "bank") {
            addFloatingText(
              Number(d.x || 0),
              Number(d.y || 0),
              `+${Number(d.amount || 0)} BANKED`,
              "#fbbf24"
            );
          } else if (ev.kind === "match_end") {
            matchEnded = true;
          }
        }
      }

      // Check match timer
      const elapsedSec = Math.floor((nowMs - matchStartMs) / 1000);
      const timeLeftSec = Math.max(0, modeSpec.durationSec - elapsedSec);
      // The host closes the match. If the host has vanished, any client may do it
      // a few seconds later (the server only accepts the first report).
      if (
        timeLeftSec === 0 &&
        !matchEnded &&
        (isHost || nowMs - mountedAtMs > (modeSpec.durationSec + 8) * 1000)
      ) {
        matchEnded = true;
        const standings = [
          {
            userId: localPlayer.userId,
            score: localPlayer.score,
            kills: localPlayer.kills,
          },
          ...Array.from(remotePlayersRef.current.values()).map((p) => ({
            userId: p.userId,
            score: p.score,
            kills: p.kills,
          })),
          ...bots.map((b) => ({
            userId: b.userId,
            score: b.state.score,
            kills: b.state.kills,
          })),
        ];
        onMatchFinish(standings);
      }

      // 1. Update Gravity Wells
      for (const w of wells) {
        if (w.orbitRadius > 0) {
          const ang = timeSec * w.orbitSpeed + w.orbitPhase;
          w.x = w.baseX + Math.cos(ang) * w.orbitRadius;
          w.y = w.baseY + Math.sin(ang) * w.orbitRadius;
        }
      }

      // 2. Respawn local player if needed
      if (!localPlayer.alive && nowMs >= localPlayer.respawnAt) {
        localPlayer.alive = true;
        localPlayer.hp = localPlayer.maxHp;
        localPlayer.energy = 100;
        const ang = Math.random() * Math.PI * 2;
        localPlayer.x = clamp(WORLD_W / 2 + Math.cos(ang) * 650, 120, WORLD_W - 120);
        localPlayer.y = clamp(WORLD_H / 2 + Math.sin(ang) * 420, 120, WORLD_H - 120);
        localPlayer.vx = 0;
        localPlayer.vy = 0;
        localPlayer.shieldUntil = nowMs + 2200;
        shockwaves.push({
          x: localPlayer.x,
          y: localPlayer.y,
          radius: 10,
          maxRadius: 120,
          color: localPlayer.auraColor,
          alpha: 0.9,
        });
      }

      // 3. Local Player Physics & Controls
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const viewW = canvas.width / dpr;
      const viewH = canvas.height / dpr;
      mouse.worldX = camX - viewW / 2 + mouse.screenX;
      mouse.worldY = camY - viewH / 2 + mouse.screenY;

      if (localPlayer.alive && !matchEnded) {
        localPlayer.angle = Math.atan2(
          mouse.worldY - localPlayer.y,
          mouse.worldX - localPlayer.x
        );

        let ax = 0;
        let ay = 0;
        if (keys.has("w") || keys.has("arrowup")) ay -= 1;
        if (keys.has("s") || keys.has("arrowdown")) ay += 1;
        if (keys.has("a") || keys.has("arrowleft")) ax -= 1;
        if (keys.has("d") || keys.has("arrowright")) ax += 1;
        if (ax !== 0 || ay !== 0) {
          const len = Math.hypot(ax, ay);
          ax /= len;
          ay /= len;
          const thrust = 860;
          localPlayer.vx += ax * thrust * dt;
          localPlayer.vy += ay * thrust * dt;

          if (Math.random() < 0.75) {
            particles.push({
              x: localPlayer.x - Math.cos(localPlayer.angle) * 18,
              y: localPlayer.y - Math.sin(localPlayer.angle) * 18,
              vx: -ax * 140 + (Math.random() - 0.5) * 45,
              vy: -ay * 140 + (Math.random() - 0.5) * 45,
              size: 2.5 + Math.random() * 2,
              color: localPlayer.auraColor,
              alpha: 0.9,
              life: 0.28,
              maxLife: 0.28,
            });
          }
        }

        // Gravity pull from wells
        for (const w of wells) {
          const dx = w.x - localPlayer.x;
          const dy = w.y - localPlayer.y;
          const d = Math.hypot(dx, dy);
          if (d > 10 && d < 520) {
            const force = (w.strength * 55) / Math.max(d * d, 4200);
            localPlayer.vx += (dx / d) * force * dt * 60;
            localPlayer.vy += (dy / d) * force * dt * 60;
          }
          if (d < w.radius + 14) {
            if (w.kind === "blackhole") {
              // Event horizon crush + warp eject
              localPlayer.hp = Math.max(0, localPlayer.hp - 32);
              const ejectAng = Math.random() * Math.PI * 2;
              localPlayer.x = clamp(w.x + Math.cos(ejectAng) * 320, 120, WORLD_W - 120);
              localPlayer.y = clamp(w.y + Math.sin(ejectAng) * 320, 120, WORLD_H - 120);
              localPlayer.vx = Math.cos(ejectAng) * 420;
              localPlayer.vy = Math.sin(ejectAng) * 420;
              addFloatingText(localPlayer.x, localPlayer.y, "SINGULARITY WARP!", "#ec4899");
              screenShake = 12;
            } else {
              // Gentle bounce off pulsar corona
              const nx = -dx / (d || 1);
              const ny = -dy / (d || 1);
              localPlayer.x = w.x + nx * (w.radius + 16);
              localPlayer.y = w.y + ny * (w.radius + 16);
              localPlayer.vx += nx * 180;
              localPlayer.vy += ny * 180;
            }
          }
        }

        // Quantum Tether Physics
        const activeTether = tetherState.current;
        if (activeTether) {
          if (activeTether.kind === "well") {
            const w = wells.find((ww) => ww.id === activeTether.id);
            if (w) {
              const dx = localPlayer.x - w.x;
              const dy = localPlayer.y - w.y;
              const d = Math.hypot(dx, dy) || 1;
              const nx = dx / d;
              const ny = dy / d;
              // Pull smoothly toward orbit radius & add tangential sling force!
              const radialErr = d - tetherOrbitRadius;
              localPlayer.vx -= nx * radialErr * 4.5 * dt;
              localPlayer.vy -= ny * radialErr * 4.5 * dt;
              // Tangent
              const tx = -ny;
              const ty = nx;
              const dot = localPlayer.vx * tx + localPlayer.vy * ty;
              const sign = dot >= 0 ? 1 : -1;
              localPlayer.vx += tx * sign * 520 * dt;
              localPlayer.vy += ty * sign * 520 * dt;
              localPlayer.tetherType = "well";
              localPlayer.tetherX = w.x;
              localPlayer.tetherY = w.y;
            }
          } else if (activeTether.kind === "asteroid") {
            const ast = asteroids.find((a) => a.id === activeTether.id);
            if (ast) {
              const targetX = localPlayer.x - Math.cos(localPlayer.angle) * 85;
              const targetY = localPlayer.y - Math.sin(localPlayer.angle) * 85;
              ast.vx += (targetX - ast.x) * 14 * dt;
              ast.vy += (targetY - ast.y) * 14 * dt;
              ast.vx *= 0.94;
              ast.vy *= 0.94;
              localPlayer.tetherType = "asteroid";
              localPlayer.tetherX = ast.x;
              localPlayer.tetherY = ast.y;
            } else {
              tetherState.current = null;
            }
          } else if (activeTether.kind === "core") {
            const core = fluxCores.find((c) => c.id === activeTether.id);
            if (core) {
              const dx = localPlayer.x - core.x;
              const dy = localPlayer.y - core.y;
              const d = Math.hypot(dx, dy) || 1;
              core.vx += (dx / d) * 1200 * dt;
              core.vy += (dy / d) * 1200 * dt;
              localPlayer.tetherType = "core";
              localPlayer.tetherX = core.x;
              localPlayer.tetherY = core.y;
            } else {
              tetherState.current = null;
            }
          }
        } else {
          localPlayer.tetherType = "none";
        }

        // Space damping
        const drag = localPlayer.shipChassis === "interceptor" ? 0.986 : 0.98;
        localPlayer.vx *= Math.pow(drag, dt * 60);
        localPlayer.vy *= Math.pow(drag, dt * 60);

        const maxSpd = 640;
        const curSpd = Math.hypot(localPlayer.vx, localPlayer.vy);
        if (curSpd > maxSpd) {
          localPlayer.vx = (localPlayer.vx / curSpd) * maxSpd;
          localPlayer.vy = (localPlayer.vy / curSpd) * maxSpd;
        }

        localPlayer.x += localPlayer.vx * dt;
        localPlayer.y += localPlayer.vy * dt;

        // World boundary bounce
        if (localPlayer.x < 40) {
          localPlayer.x = 40;
          localPlayer.vx = Math.abs(localPlayer.vx) * 0.7;
        } else if (localPlayer.x > WORLD_W - 40) {
          localPlayer.x = WORLD_W - 40;
          localPlayer.vx = -Math.abs(localPlayer.vx) * 0.7;
        }
        if (localPlayer.y < 40) {
          localPlayer.y = 40;
          localPlayer.vy = Math.abs(localPlayer.vy) * 0.7;
        } else if (localPlayer.y > WORLD_H - 40) {
          localPlayer.y = WORLD_H - 40;
          localPlayer.vy = -Math.abs(localPlayer.vy) * 0.7;
        }

        // Fire weapon
        fireCooldown = Math.max(0, fireCooldown - dt);
        novaCooldown = Math.max(0, novaCooldown - dt);
        localPlayer.energy = Math.min(100, localPlayer.energy + 18 * dt);

        if (mouse.leftDown && fireCooldown <= 0) {
          fireCooldown = 0.21;
          fireBolt(localPlayer, true);
        }

        // Pick up Flux Cores
        for (let i = fluxCores.length - 1; i >= 0; i--) {
          const core = fluxCores[i];
          if (dist(localPlayer.x, localPlayer.y, core.x, core.y) < 34) {
            localPlayer.carryingFlux += core.value;
            localPlayer.score += 15;
            soundFX.playPickup();
            spawnBurst(core.x, core.y, core.color, 10, 150);
            addFloatingText(
              core.x,
              core.y - 16,
              `+${core.value} FLUX`,
              core.color
            );
            fluxCores.splice(i, 1);
          }
        }

        // Bank Flux at Nexus Gates!
        if (localPlayer.carryingFlux > 0) {
          for (const g of nexusGates) {
            if (dist(localPlayer.x, localPlayer.y, g.x, g.y) < g.radius) {
              const banked = localPlayer.carryingFlux;
              localPlayer.score += banked;
              localPlayer.carryingFlux = 0;
              localPlayer.hp = Math.min(localPlayer.maxHp, localPlayer.hp + 25);
              soundFX.playBank();
              spawnBurst(g.x, g.y, "#fbbf24", 26, 260);
              shockwaves.push({
                x: g.x,
                y: g.y,
                radius: 25,
                maxRadius: 190,
                color: "#fbbf24",
                alpha: 1,
              });
              addFloatingText(
                localPlayer.x,
                localPlayer.y - 36,
                `+${banked} BANKED!`,
                "#fbbf24"
              );
              void transportRef.current?.sendGameEvent({
                kind: "bank",
                data: { x: g.x, y: g.y, amount: banked },
              });
              break;
            }
          }
        }
      }

      // 4. Update AI Bots (Host only)
      if (isHost && !matchEnded) {
        for (const bot of bots) {
          const s = bot.state;
          if (!s.alive) {
            if (nowMs >= s.respawnAt) {
              s.alive = true;
              s.hp = s.maxHp;
              const a = Math.random() * Math.PI * 2;
              s.x = WORLD_W / 2 + Math.cos(a) * 620;
              s.y = WORLD_H / 2 + Math.sin(a) * 400;
              s.vx = 0;
              s.vy = 0;
              s.shieldUntil = nowMs + 1500;
            }
            continue;
          }

          bot.fireCd -= dt;
          bot.wanderAngle += (Math.random() - 0.5) * 1.4 * dt;

          // Target selection: bank if carrying >= 180, else nearest core or nearest opponent
          let targetX = WORLD_W / 2 + Math.cos(bot.wanderAngle) * 420;
          let targetY = WORLD_H / 2 + Math.sin(bot.wanderAngle) * 260;

          if (s.carryingFlux >= 180) {
            const g0 = nexusGates[0];
            const g1 = nexusGates[1];
            const nearestGate =
              dist(s.x, s.y, g0.x, g0.y) < dist(s.x, s.y, g1.x, g1.y) ? g0 : g1;
            targetX = nearestGate.x;
            targetY = nearestGate.y;
          } else if (fluxCores.length > 0) {
            let bestD = Infinity;
            for (const c of fluxCores) {
              const d = dist(s.x, s.y, c.x, c.y);
              if (d < bestD) {
                bestD = d;
                targetX = c.x;
                targetY = c.y;
              }
            }
          }

          if (isBrawl) {
            // Deathmatch: chase the nearest living pilot instead of harvesting.
            let huntDist = Infinity;
            const prey: PlayerNetState[] = [
              localPlayer,
              ...Array.from(remotePlayersRef.current.values()),
              ...bots.map((other) => other.state),
            ];
            for (const preyShip of prey) {
              if (!preyShip.alive || preyShip.userId === s.userId) continue;
              const d = dist(s.x, s.y, preyShip.x, preyShip.y);
              if (d < huntDist) {
                huntDist = d;
                targetX = preyShip.x;
                targetY = preyShip.y;
              }
            }
            // Keep a standoff distance: circle the target instead of sitting on top of it.
            if (huntDist < 260) {
              const preyX = targetX;
              const preyY = targetY;
              targetX = s.x - (preyY - s.y);
              targetY = s.y + (preyX - s.x);
            }
          }

          const steerAng = Math.atan2(targetY - s.y, targetX - s.x);
          s.vx += Math.cos(steerAng) * 560 * dt;
          s.vy += Math.sin(steerAng) * 560 * dt;

          // Avoid center singularity
          for (const w of wells) {
            const d = dist(s.x, s.y, w.x, w.y);
            if (d < w.radius + 95) {
              const away = Math.atan2(s.y - w.y, s.x - w.x);
              s.vx += Math.cos(away) * 850 * dt;
              s.vy += Math.sin(away) * 850 * dt;
            }
          }

          s.vx *= Math.pow(0.98, dt * 60);
          s.vy *= Math.pow(0.98, dt * 60);
          s.x = clamp(s.x + s.vx * dt, 50, WORLD_W - 50);
          s.y = clamp(s.y + s.vy * dt, 50, WORLD_H - 50);

          // Aim at nearest live player within 620px
          let aimTarget: PlayerNetState | null = null;
          let aimDist = 640;
          if (localPlayer.alive) {
            const d = dist(s.x, s.y, localPlayer.x, localPlayer.y);
            if (d < aimDist) {
              aimDist = d;
              aimTarget = localPlayer;
            }
          }
          for (const rp of [
            ...Array.from(remotePlayersRef.current.values()),
            ...bots.map((other) => other.state),
          ]) {
            if (rp.userId === s.userId || !rp.alive) continue;
            const d = dist(s.x, s.y, rp.x, rp.y);
            if (d < aimDist) {
              aimDist = d;
              aimTarget = rp;
            }
          }

          if (aimTarget) {
            s.angle = Math.atan2(aimTarget.y - s.y, aimTarget.x - s.x);
            if (bot.fireCd <= 0) {
              bot.fireCd = 0.72 + Math.random() * 0.4;
              fireBolt(s, false);
              void transportRef.current?.sendGameEvent({
                kind: "fire",
                data: {
                  x: s.x + Math.cos(s.angle) * 24,
                  y: s.y + Math.sin(s.angle) * 24,
                  vx: Math.cos(s.angle) * 760,
                  vy: Math.sin(s.angle) * 760,
                  color: s.auraColor,
                },
              });
            }
          } else {
            s.angle = steerAng;
          }

          // Bot Flux collection & banking
          for (let i = fluxCores.length - 1; i >= 0; i--) {
            if (dist(s.x, s.y, fluxCores[i].x, fluxCores[i].y) < 32) {
              // Bots harvest at half value: they path to cores perfectly, so at full
              // value they out-score any human by a wide margin.
              s.carryingFlux += Math.round(fluxCores[i].value * 0.5);
              s.score += 5;
              fluxCores.splice(i, 1);
            }
          }
          if (s.carryingFlux > 0) {
            for (const g of nexusGates) {
              if (dist(s.x, s.y, g.x, g.y) < g.radius) {
                s.score += s.carryingFlux;
                s.carryingFlux = 0;
                s.hp = Math.min(s.maxHp, s.hp + 20);
                break;
              }
            }
          }
        }
      }

      // 5. Update Flux Cores & Asteroids & Replenish
      while (!isBrawl && fluxCores.length < 18) {
        const ang = Math.random() * Math.PI * 2;
        const r = 180 + Math.random() * 520;
        const golden = Math.random() < 0.22;
        fluxCores.push({
          id: nextCoreId++,
          x: clamp(WORLD_W / 2 + Math.cos(ang) * r, 140, WORLD_W - 140),
          y: clamp(WORLD_H / 2 + Math.sin(ang) * r * 0.75, 140, WORLD_H - 140),
          vx: (Math.random() - 0.5) * 22,
          vy: (Math.random() - 0.5) * 22,
          value: golden ? 120 : 60,
          color: golden ? "#fbbf24" : "#22d3ee",
          pulse: Math.random() * Math.PI * 2,
        });
      }

      for (const c of fluxCores) {
        c.pulse += dt * 3;
        c.vx *= 0.99;
        c.vy *= 0.99;
        c.x = clamp(c.x + c.vx * dt, 80, WORLD_W - 80);
        c.y = clamp(c.y + c.vy * dt, 80, WORLD_H - 80);
      }

      for (const ast of asteroids) {
        ast.angle += ast.spin * dt;
        ast.x += ast.vx * dt;
        ast.y += ast.vy * dt;
        ast.vx *= 0.995;
        ast.vy *= 0.995;
        if (ast.x < 50 || ast.x > WORLD_W - 50) ast.vx *= -1;
        if (ast.y < 50 || ast.y > WORLD_H - 50) ast.vy *= -1;
        ast.x = clamp(ast.x, 50, WORLD_W - 50);
        ast.y = clamp(ast.y, 50, WORLD_H - 50);

        // Thrown comet collision against local player or bots!
        if (ast.thrownBy !== null && nowMs < ast.thrownUntil) {
          if (
            localPlayer.alive &&
            ast.thrownBy !== localPlayer.userId &&
            nowMs > localPlayer.shieldUntil &&
            dist(ast.x, ast.y, localPlayer.x, localPlayer.y) < ast.radius + 18
          ) {
            localPlayer.hp -= 45;
            localPlayer.shieldUntil = nowMs + 600;
            ast.thrownBy = null;
            screenShake = 11;
            soundFX.playHit(localPlayer.hp <= 0);
            spawnBurst(localPlayer.x, localPlayer.y, "#fbbf24", 20, 240);
          }
          if (isHost) {
            for (const bot of bots) {
              if (
                bot.state.alive &&
                ast.thrownBy !== bot.userId &&
                dist(ast.x, ast.y, bot.state.x, bot.state.y) < ast.radius + 18
              ) {
                bot.state.hp -= 55;
                ast.thrownBy = null;
                spawnBurst(bot.state.x, bot.state.y, "#fbbf24", 20, 240);
                if (bot.state.hp <= 0) {
                  bot.state.alive = false;
                  bot.state.respawnAt = nowMs + 3500;
                  bot.state.deaths += 1;
                  if (ast.thrownBy === localPlayer.userId) {
                    localPlayer.kills += 1;
                    localPlayer.score += 180;
                    pushKillFeed(
                      `${localPlayer.username} shattered ${bot.username} with a Comet!`,
                      "#fbbf24"
                    );
                  }
                }
              }
            }
          }
        }
      }

      // 6. Update Projectiles (Gravity Curving + Overcharge + Hits!)
      for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        p.life -= dt;
        if (p.life <= 0) {
          projectiles.splice(i, 1);
          continue;
        }

        p.trail.push({ x: p.x, y: p.y });
        if (p.trail.length > 9) p.trail.shift();

        // Gravity wells curve plasma bolts & overcharge them!
        for (const w of wells) {
          const dx = w.x - p.x;
          const dy = w.y - p.y;
          const d = Math.hypot(dx, dy);
          if (d < w.radius + 6) {
            // Absorbed by core
            p.life = 0;
            break;
          }
          if (d < 340) {
            const pull = (w.strength * 85) / Math.max(d * d, 3000);
            p.vx += (dx / d) * pull * dt * 60;
            p.vy += (dy / d) * pull * dt * 60;
            if (!p.overcharged && d < w.radius + 135) {
              p.overcharged = true;
              p.damage = Math.round(p.damage * 1.65);
              p.vx *= 1.24;
              p.vy *= 1.24;
              p.color = "#fbbf24";
            }
          }
        }

        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.x < 0 || p.x > WORLD_W || p.y < 0 || p.y > WORLD_H) {
          projectiles.splice(i, 1);
          continue;
        }

        // Hit asteroid -> crack into flux shards
        let hitSomething = false;
        for (const ast of asteroids) {
          if (dist(p.x, p.y, ast.x, ast.y) < ast.radius + 6) {
            ast.hp -= p.damage;
            ast.vx += p.vx * 0.08;
            ast.vy += p.vy * 0.08;
            spawnBurst(p.x, p.y, "#94a3b8", 6, 120);
            if (ast.hp <= 0) {
              ast.hp = 70;
              if (!isBrawl) fluxCores.push({
                id: nextCoreId++,
                x: ast.x,
                y: ast.y,
                vx: (Math.random() - 0.5) * 90,
                vy: (Math.random() - 0.5) * 90,
                value: 90,
                color: "#fbbf24",
                pulse: 0,
              });
              ast.x = Math.random() < 0.5 ? 140 : WORLD_W - 140;
              ast.y = 180 + Math.random() * (WORLD_H - 360);
            }
            hitSomething = true;
            break;
          }
        }
        if (hitSomething) {
          projectiles.splice(i, 1);
          continue;
        }

        // Hit Local Player
        if (
          localPlayer.alive &&
          p.ownerId !== localPlayer.userId &&
          nowMs > localPlayer.shieldUntil &&
          dist(p.x, p.y, localPlayer.x, localPlayer.y) < 22
        ) {
          localPlayer.hp -= p.damage;
          screenShake = Math.max(screenShake, p.overcharged ? 10 : 5);
          spawnBurst(p.x, p.y, p.color, 14, 210);
          addFloatingText(
            localPlayer.x,
            localPlayer.y - 24,
            `-${p.damage}`,
            "#f43f5e"
          );
          const died = localPlayer.hp <= 0;
          soundFX.playHit(died);

          if (died) {
            localPlayer.hp = 0;
            localPlayer.alive = false;
            localPlayer.deaths += 1;
            localPlayer.respawnAt = nowMs + 3200;
            const dropped = Math.floor(localPlayer.carryingFlux * 0.5);
            localPlayer.carryingFlux -= dropped;
            if (dropped > 0) {
              fluxCores.push({
                id: nextCoreId++,
                x: localPlayer.x,
                y: localPlayer.y,
                vx: 0,
                vy: 0,
                value: dropped,
                color: "#fbbf24",
                pulse: 0,
              });
            }
            shockwaves.push({
              x: localPlayer.x,
              y: localPlayer.y,
              radius: 15,
              maxRadius: 160,
              color: "#f43f5e",
              alpha: 1,
            });
            const summary = `${p.ownerName} shattered ${localPlayer.username}!`;
            pushKillFeed(summary, p.color);
            void transportRef.current?.sendGameEvent({
              kind: "kill",
              data: { killerId: p.ownerId, victimId: localPlayer.userId, summary, color: p.color },
            });
          }

          projectiles.splice(i, 1);
          continue;
        }

        // Host checks bot hits, AND local player checks remote player visual hit feedback
        if (isHost) {
          for (const bot of bots) {
            if (
              bot.state.alive &&
              p.ownerId !== bot.userId &&
              dist(p.x, p.y, bot.state.x, bot.state.y) < 22
            ) {
              bot.state.hp -= p.damage;
              spawnBurst(p.x, p.y, p.color, 12, 180);
              if (p.ownerId === localPlayer.userId) {
                addFloatingText(
                  bot.state.x,
                  bot.state.y - 22,
                  p.overcharged ? `OVERCHARGED -${p.damage}!` : `-${p.damage}`,
                  p.overcharged ? "#fbbf24" : "#22d3ee"
                );
                localPlayer.score += 15;
              }
              if (bot.state.hp <= 0) {
                bot.state.hp = 0;
                bot.state.alive = false;
                bot.state.respawnAt = nowMs + 3400;
                bot.state.deaths += 1;
                soundFX.playHit(true);
                shockwaves.push({
                  x: bot.state.x,
                  y: bot.state.y,
                  radius: 14,
                  maxRadius: 150,
                  color: bot.auraColor,
                  alpha: 1,
                });
                if (bot.state.carryingFlux > 0) {
                  fluxCores.push({
                    id: nextCoreId++,
                    x: bot.state.x,
                    y: bot.state.y,
                    vx: 0,
                    vy: 0,
                    value: bot.state.carryingFlux,
                    color: "#fbbf24",
                    pulse: 0,
                  });
                  bot.state.carryingFlux = 0;
                }
                if (p.ownerId === localPlayer.userId) {
                  localPlayer.kills += 1;
                  localPlayer.score += 150;
                }
                const summary = `${p.ownerName} shattered ${bot.username}!`;
                pushKillFeed(summary, p.color);
                void transportRef.current?.sendGameEvent({
                  kind: "kill",
                  data: { summary, color: p.color },
                });
              }
              projectiles.splice(i, 1);
              hitSomething = true;
              break;
            }
          }
          if (hitSomething) continue;
        }

        // Local shot hitting remote human player (client-side hit confirm + score)
        if (p.ownerId === localPlayer.userId) {
          for (const rp of remotePlayersRef.current.values()) {
            if (rp.userId <= 0 || !rp.alive) continue;
            if (dist(p.x, p.y, rp.x, rp.y) < 22) {
              spawnBurst(p.x, p.y, p.color, 14, 200);
              addFloatingText(
                rp.x,
                rp.y - 24,
                p.overcharged ? `ARC HIT -${p.damage}!` : `-${p.damage}`,
                p.overcharged ? "#fbbf24" : "#22d3ee"
              );
              localPlayer.score += p.overcharged ? 35 : 20;
              if (rp.hp - p.damage <= 0) {
                localPlayer.kills += 1;
                localPlayer.score += 150;
              }
              projectiles.splice(i, 1);
              break;
            }
          }
        }
      }

      // 7. Smooth remote players
      for (const [uid, target] of remotePlayersRef.current.entries()) {
        if (uid === user.id) continue;
        const prev = smoothedRemote.get(uid);
        if (!prev) {
          smoothedRemote.set(uid, { ...target });
        } else {
          prev.x += (target.x - prev.x) * Math.min(1, dt * 14);
          prev.y += (target.y - prev.y) * Math.min(1, dt * 14);
          prev.vx = target.vx;
          prev.vy = target.vy;
          prev.angle = target.angle;
          prev.hp = target.hp;
          prev.score = target.score;
          prev.kills = target.kills;
          prev.carryingFlux = target.carryingFlux;
          prev.alive = target.alive;
          prev.tetherType = target.tetherType;
          prev.tetherX = target.tetherX;
          prev.tetherY = target.tetherY;
          prev.shieldUntil = target.shieldUntil;
          prev.auraColor = target.auraColor;
          prev.shipChassis = target.shipChassis;
        }
      }
      for (const uid of Array.from(smoothedRemote.keys())) {
        if (!remotePlayersRef.current.has(uid)) {
          smoothedRemote.delete(uid);
        }
      }

      // 8. Update visual particles, shockwaves, floating texts, afterimages
      for (let i = particles.length - 1; i >= 0; i--) {
        const pt = particles[i];
        pt.life -= dt;
        if (pt.life <= 0) {
          particles.splice(i, 1);
        } else {
          pt.x += pt.vx * dt;
          pt.y += pt.vy * dt;
          pt.alpha = pt.life / pt.maxLife;
        }
      }
      for (let i = shockwaves.length - 1; i >= 0; i--) {
        const sw = shockwaves[i];
        sw.radius += (sw.maxRadius - sw.radius) * dt * 7 + 160 * dt;
        sw.alpha -= dt * 1.9;
        if (sw.alpha <= 0) shockwaves.splice(i, 1);
      }
      for (let i = floatingTexts.length - 1; i >= 0; i--) {
        const ft = floatingTexts[i];
        ft.life -= dt;
        ft.y -= 36 * dt;
        if (ft.life <= 0) floatingTexts.splice(i, 1);
      }
      for (let i = afterimages.length - 1; i >= 0; i--) {
        afterimages[i].alpha -= dt * 1.6;
        if (afterimages[i].alpha <= 0) afterimages.splice(i, 1);
      }

      // Camera smooth follow + cursor look-ahead
      const lookX = (mouse.screenX - viewW / 2) * 0.14;
      const lookY = (mouse.screenY - viewH / 2) * 0.14;
      camX += (localPlayer.x + lookX - camX) * Math.min(1, dt * 8);
      camY += (localPlayer.y + lookY - camY) * Math.min(1, dt * 8);
      screenShake = Math.max(0, screenShake - dt * 24);

      // Network state broadcast (~16Hz)
      if (now - lastNetSync > 62) {
        lastNetSync = now;
        localPlayer.updatedAt = nowMs;
        void transportRef.current?.sendPlayerState(localPlayer);
        if (isHost && bots.length > 0) {
          void transportRef.current?.sendBotStates(bots.map((b) => b.state));
        }
      }

      // HUD React state sync (~6Hz)
      if (now - lastHudSync > 160 && !hudFrozen) {
        lastHudSync = now;
        // Freeze the HUD on the final standings once the match is over.
        if (matchEnded) hudFrozen = true;
        const boardMap = new Map<
          number,
          {
            userId: number;
            username: string;
            score: number;
            kills: number;
            auraColor: string;
            isBot?: boolean;
          }
        >();
        boardMap.set(localPlayer.userId, {
          userId: localPlayer.userId,
          username: localPlayer.username,
          score: localPlayer.score,
          kills: localPlayer.kills,
          auraColor: localPlayer.auraColor,
        });
        for (const rp of remotePlayersRef.current.values()) {
          boardMap.set(rp.userId, {
            userId: rp.userId,
            username: rp.username,
            score: rp.score,
            kills: rp.kills,
            auraColor: rp.auraColor,
            isBot: rp.isBot,
          });
        }
        for (const b of bots) {
          boardMap.set(b.userId, {
            userId: b.userId,
            username: b.username,
            score: b.state.score,
            kills: b.state.kills,
            auraColor: b.auraColor,
            isBot: true,
          });
        }
        const boardRows: Array<{
          userId: number;
          username: string;
          score: number;
          kills: number;
          auraColor: string;
          isBot?: boolean;
        }> = startedFinished
          ? room.participants.map((p) => ({
              userId: p.userId,
              username: p.username,
              score: p.lastScore,
              kills: p.lastKills,
              auraColor: p.auraColor,
            }))
          : Array.from(boardMap.values());
        const leaderboard = boardRows.sort((a, b) => b.score - a.score);
        setHudState({
          hp: Math.max(0, Math.round(localPlayer.hp)),
          maxHp: localPlayer.maxHp,
          energy: Math.round(localPlayer.energy),
          novaReady: novaCooldown <= 0,
          novaCooldownPct: 1 - novaCooldown / NOVA_CD_MAX,
          carryingFlux: localPlayer.carryingFlux,
          score: localPlayer.score,
          kills: localPlayer.kills,
          timeLeftSec,
          leaderboard: leaderboard.slice(0, 6),
          killFeed: [...killFeed],
          matchEnded,
        });
      }

      // ==================== RENDER ====================
      ctx.save();
      ctx.scale(dpr, dpr);

      // Deep space background
      ctx.fillStyle = "#040611";
      ctx.fillRect(0, 0, viewW, viewH);

      if (nebulaImg.complete && nebulaImg.naturalWidth > 0) {
        ctx.save();
        ctx.globalAlpha = 0.28;
        const parallaxX = -(camX * 0.08) % 200;
        const parallaxY = -(camY * 0.08) % 200;
        ctx.drawImage(
          nebulaImg,
          parallaxX - 160,
          parallaxY - 120,
          viewW + 320,
          viewH + 240
        );
        ctx.restore();
      }

      // Parallax stars
      for (const st of stars) {
        const sx =
          ((st.x - camX * st.depth + WORLD_W) % viewW + viewW) % viewW;
        const sy =
          ((st.y - camY * st.depth + WORLD_H) % viewH + viewH) % viewH;
        ctx.fillStyle = st.color;
        ctx.globalAlpha = 0.45 + st.depth * 0.5;
        ctx.fillRect(sx, sy, st.size, st.size);
      }
      ctx.globalAlpha = 1;

      // Apply camera transform
      const shakeX = (Math.random() - 0.5) * screenShake;
      const shakeY = (Math.random() - 0.5) * screenShake;
      ctx.translate(
        Math.round(viewW / 2 - camX + shakeX),
        Math.round(viewH / 2 - camY + shakeY)
      );

      // Subtle arena spatial grid
      ctx.strokeStyle = "rgba(34, 211, 238, 0.055)";
      ctx.lineWidth = 1;
      const gridStep = 160;
      const startGx = Math.max(0, Math.floor((camX - viewW / 2) / gridStep) * gridStep);
      const endGx = Math.min(WORLD_W, camX + viewW / 2 + gridStep);
      const startGy = Math.max(0, Math.floor((camY - viewH / 2) / gridStep) * gridStep);
      const endGy = Math.min(WORLD_H, camY + viewH / 2 + gridStep);
      ctx.beginPath();
      for (let gx = startGx; gx <= endGx; gx += gridStep) {
        ctx.moveTo(gx, startGy);
        ctx.lineTo(gx, endGy);
      }
      for (let gy = startGy; gy <= endGy; gy += gridStep) {
        ctx.moveTo(startGx, gy);
        ctx.lineTo(endGx, gy);
      }
      ctx.stroke();

      // Arena Neon Boundary
      ctx.strokeStyle = "rgba(236, 72, 153, 0.45)";
      ctx.lineWidth = 4;
      ctx.strokeRect(12, 12, WORLD_W - 24, WORLD_H - 24);

      // Draw Nexus Bank Gates
      for (const g of nexusGates) {
        ctx.save();
        ctx.translate(g.x, g.y);
        ctx.rotate(timeSec * 0.65);
        const grad = ctx.createRadialGradient(0, 0, 8, 0, 0, g.radius * 1.4);
        grad.addColorStop(0, `${g.color}55`);
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, g.radius * 1.4, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = g.color;
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          const px = Math.cos(a) * g.radius;
          const py = Math.sin(a) * g.radius;
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();

        ctx.rotate(-timeSec * 1.2);
        ctx.fillStyle = "#e2f8ff";
        ctx.font = "700 11px monospace";
        ctx.textAlign = "center";
        ctx.fillText("NEXUS BANK", 0, 4);
        ctx.restore();
      }

      // Draw Gravity Wells
      for (const w of wells) {
        ctx.save();
        ctx.translate(w.x, w.y);

        // Gravity corona field
        const corona = ctx.createRadialGradient(
          0,
          0,
          w.radius * 0.4,
          0,
          0,
          w.radius * 4.2
        );
        corona.addColorStop(0, w.kind === "blackhole" ? "#000000" : `${w.color}cc`);
        corona.addColorStop(0.35, `${w.color}38`);
        corona.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = corona;
        ctx.beginPath();
        ctx.arc(0, 0, w.radius * 4.2, 0, Math.PI * 2);
        ctx.fill();

        // Spinning orbital rings
        ctx.strokeStyle = `${w.color}99`;
        ctx.lineWidth = 2;
        ctx.setLineDash([12, 10]);
        ctx.save();
        ctx.rotate(timeSec * (w.kind === "blackhole" ? 1.8 : 0.9));
        ctx.beginPath();
        ctx.arc(0, 0, w.radius * 1.45, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        ctx.setLineDash([]);

        // Core sphere
        ctx.beginPath();
        ctx.arc(0, 0, w.radius, 0, Math.PI * 2);
        ctx.fillStyle = w.kind === "blackhole" ? "#020308" : "#0b1730";
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = w.color;
        ctx.stroke();
        ctx.restore();
      }

      // Draw Asteroids
      for (const ast of asteroids) {
        ctx.save();
        ctx.translate(ast.x, ast.y);
        ctx.rotate(ast.angle);
        const isThrown = ast.thrownBy !== null && nowMs < ast.thrownUntil;
        ctx.fillStyle = isThrown ? "#451a03" : "#111827";
        ctx.strokeStyle = isThrown ? "#fbbf24" : "#64748b";
        ctx.lineWidth = isThrown ? 3 : 2;
        ctx.beginPath();
        for (let k = 0; k < 7; k++) {
          const a = (k / 7) * Math.PI * 2;
          const rad = ast.radius * (k % 2 === 0 ? 1 : 0.78);
          const px = Math.cos(a) * rad;
          const py = Math.sin(a) * rad;
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      // Draw Flux Cores
      for (const c of fluxCores) {
        const s = 9 + Math.sin(c.pulse) * 2.2;
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(c.pulse * 0.6);
        ctx.shadowBlur = 14;
        ctx.shadowColor = c.color;
        ctx.fillStyle = c.color;
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.lineTo(s * 0.72, 0);
        ctx.lineTo(0, s);
        ctx.lineTo(-s * 0.72, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // Additive glow layer for projectiles, shockwaves, particles, afterimages
      ctx.save();
      ctx.globalCompositeOperation = "lighter";

      for (const ai of afterimages) {
        ctx.save();
        ctx.globalAlpha = ai.alpha * 0.45;
        ctx.translate(ai.x, ai.y);
        ctx.rotate(ai.angle);
        drawShipHull(ctx, ai.chassis, ai.color, 18);
        ctx.restore();
      }

      for (const sw of shockwaves) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, sw.alpha);
        ctx.strokeStyle = sw.color;
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      for (const pt of particles) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, pt.alpha);
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      for (const p of projectiles) {
        if (p.trail.length > 1) {
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.overcharged ? 4.5 : 2.8;
          ctx.beginPath();
          p.trail.forEach((pt, idx) => {
            if (idx === 0) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
          });
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.overcharged ? 5.5 : 3.8, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();

      // Render all Pilots (Local + Remote Humans + Bots)
      const renderPilot = (pl: PlayerNetState) => {
        if (!pl.alive) return;

        // Tether lightning spline beam
        if (pl.tetherType !== "none") {
          ctx.save();
          ctx.strokeStyle = pl.auraColor;
          ctx.lineWidth = 2.6;
          ctx.shadowBlur = 14;
          ctx.shadowColor = pl.auraColor;
          ctx.beginPath();
          ctx.moveTo(pl.x, pl.y);
          const midX = (pl.x + pl.tetherX) / 2 + (Math.random() - 0.5) * 14;
          const midY = (pl.y + pl.tetherY) / 2 + (Math.random() - 0.5) * 14;
          ctx.quadraticCurveTo(midX, midY, pl.tetherX, pl.tetherY);
          ctx.stroke();
          ctx.restore();
        }

        // Orbiting carried Flux satellites
        if (pl.carryingFlux > 0) {
          const satCount = Math.min(6, Math.ceil(pl.carryingFlux / 60));
          for (let k = 0; k < satCount; k++) {
            const a = timeSec * 3.4 + (k / satCount) * Math.PI * 2;
            const sx = pl.x + Math.cos(a) * 29;
            const sy = pl.y + Math.sin(a) * 29;
            ctx.fillStyle = "#fbbf24";
            ctx.beginPath();
            ctx.arc(sx, sy, 3.2, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // Shield bubble
        if (nowMs < pl.shieldUntil) {
          ctx.save();
          ctx.strokeStyle = "rgba(34, 211, 238, 0.65)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(pl.x, pl.y, 28, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        ctx.save();
        ctx.translate(pl.x, pl.y);
        ctx.rotate(pl.angle);
        drawShipHull(ctx, pl.shipChassis, pl.auraColor, 18);
        ctx.restore();

        // Nametag + HP bar
        ctx.save();
        ctx.font = "600 12px sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = "#f8fafc";
        ctx.fillText(pl.username, pl.x, pl.y - 34);

        const barW = 46;
        const hpRatio = clamp(pl.hp / (pl.maxHp || 100), 0, 1);
        ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
        ctx.fillRect(pl.x - barW / 2, pl.y - 28, barW, 5);
        ctx.fillStyle = hpRatio > 0.35 ? pl.auraColor : "#f43f5e";
        ctx.fillRect(pl.x - barW / 2, pl.y - 28, barW * hpRatio, 5);
        ctx.restore();
      };

      for (const rp of smoothedRemote.values()) {
        renderPilot(rp);
      }
      if (isHost) {
        for (const b of bots) {
          renderPilot(b.state);
        }
      }
      renderPilot(localPlayer);

      // Respawn banner if local player eliminated
      if (!localPlayer.alive) {
        const secs = Math.max(
          0.1,
          (localPlayer.respawnAt - nowMs) / 1000
        ).toFixed(1);
        ctx.save();
        ctx.fillStyle = "#f43f5e";
        ctx.font = "700 20px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(
          `HULL SHATTERED — REFORMING IN ${secs}s`,
          camX,
          camY
        );
        ctx.restore();
      }

      // Floating combat texts
      for (const ft of floatingTexts) {
        ctx.save();
        ctx.globalAlpha = clamp(ft.life / ft.maxLife, 0, 1);
        ctx.fillStyle = ft.color;
        ctx.font = "700 14px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.restore();
      }

      ctx.restore();

      // ==================== MINIMAP OVERLAY ====================
      const mapW = 162;
      const mapH = 108;
      const mx = viewW - mapW - 14;
      const my = viewH - mapH - 14;

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.fillStyle = "rgba(7, 11, 24, 0.8)";
      ctx.strokeStyle = "rgba(34, 211, 238, 0.3)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(mx, my, mapW, mapH, 10);
      ctx.fill();
      ctx.stroke();

      const scaleX = mapW / WORLD_W;
      const scaleY = mapH / WORLD_H;

      for (const g of nexusGates) {
        ctx.fillStyle = g.color;
        ctx.fillRect(mx + g.x * scaleX - 3, my + g.y * scaleY - 3, 6, 6);
      }
      for (const w of wells) {
        ctx.fillStyle = w.color;
        ctx.beginPath();
        ctx.arc(mx + w.x * scaleX, my + w.y * scaleY, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const rp of smoothedRemote.values()) {
        if (!rp.alive) continue;
        ctx.fillStyle = rp.auraColor;
        ctx.beginPath();
        ctx.arc(mx + rp.x * scaleX, my + rp.y * scaleY, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      if (isHost) {
        for (const b of bots) {
          if (!b.state.alive) continue;
          ctx.fillStyle = b.auraColor;
          ctx.beginPath();
          ctx.arc(
            mx + b.state.x * scaleX,
            my + b.state.y * scaleY,
            3,
            0,
            Math.PI * 2
          );
          ctx.fill();
        }
      }
      if (localPlayer.alive) {
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(
          mx + localPlayer.x * scaleX,
          my + localPlayer.y * scaleY,
          4,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
      ctx.restore();

      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("contextmenu", onContextMenu);
    };
      // Keyed to the match itself: lobby or participant updates must never restart a live match.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.code, room.matchStartedAt, room.mode, room.mapTheme, user.id]);

  const mins = String(Math.floor(hudState.timeLeftSec / 60)).padStart(2, "0");
  const secs = String(hudState.timeLeftSec % 60).padStart(2, "0");

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full select-none overflow-hidden rounded-2xl border border-cyan-400/25 bg-[#040611]"
    >
      <canvas ref={canvasRef} className="block h-full w-full cursor-crosshair" />

      {/* Top-Left Pilot Telemetry HUD */}
      <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-2">
        <div className="rounded-xl border border-white/15 bg-[#080d1e]/80 px-3.5 py-2.5 backdrop-blur-md">
          <div className="mb-1 flex items-center justify-between gap-6 text-xs">
            <span className="font-semibold text-white">{user.username}</span>
            <span className="font-mono text-cyan-300">
              {hudState.score} PTS · {hudState.kills} KILLS
            </span>
          </div>
          <div className="h-2 w-48 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-all"
              style={{
                width: `${Math.round((hudState.hp / hudState.maxHp) * 100)}%`,
              }}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-300">
            <span>HULL {hudState.hp}%</span>
            <span
              className={
                hudState.novaReady ? "text-cyan-300 font-semibold" : "text-slate-400"
              }
            >
              {hudState.novaReady
                ? "SPACE: NOVA READY"
                : `NOVA ${Math.round(hudState.novaCooldownPct * 100)}%`}
            </span>
          </div>
        </div>

        {hudState.carryingFlux > 0 && (
          <div className="animate-pulse rounded-xl border border-amber-400/50 bg-amber-500/20 px-3 py-1.5 text-xs font-bold text-amber-200 backdrop-blur-md">
            ⚡ {hudState.carryingFlux} UNBANKED FLUX — FLY TO NEXUS GATE!
          </div>
        )}
      </div>

      {/* Top-Center Match Timer & Mode */}
      <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2">
        <div className="flex items-center gap-3 rounded-xl border border-cyan-400/25 bg-[#080d1e]/85 px-4 py-1.5 backdrop-blur-md">
          <span className="text-[11px] font-bold uppercase tracking-widest text-cyan-300">
            {modeSpec.name}
          </span>
          <span className="font-mono text-base font-bold text-white">
            {mins}:{secs}
          </span>
        </div>
      </div>

      {/* Top-Right Controls & Leaderboard */}
      <div className="absolute right-3 top-3 flex flex-col items-end gap-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={toggleMute}
            title={muted ? "Unmute SFX" : "Mute SFX"}
            className="rounded-lg border border-white/15 bg-[#080d1e]/85 p-2 text-slate-300 backdrop-blur-md hover:border-cyan-400/40 hover:text-white"
          >
            {muted ? (
              <VolumeX className="h-4 w-4 text-rose-400" />
            ) : (
              <Volume2 className="h-4 w-4 text-cyan-300" />
            )}
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            title="Toggle Fullscreen"
            className="rounded-lg border border-white/15 bg-[#080d1e]/85 p-2 text-slate-300 backdrop-blur-md hover:border-cyan-400/40 hover:text-white"
          >
            {isFullscreen ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </button>
        </div>

        <div className="pointer-events-none w-52 rounded-xl border border-white/10 bg-[#080d1e]/80 p-2.5 text-xs backdrop-blur-md">
          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            <Trophy className="h-3 w-3 text-amber-400" />
            Arena Leaderboard
          </div>
          <div className="space-y-1">
            {hudState.leaderboard.map((row, idx) => (
              <div
                key={row.userId}
                className="flex items-center justify-between text-[11px]"
              >
                <span className="flex items-center gap-1.5 truncate">
                  <span className="text-slate-500">{idx + 1}.</span>
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: row.auraColor }}
                  />
                  <span
                    className={
                      row.userId === user.id
                        ? "font-bold text-cyan-200"
                        : "text-slate-200"
                    }
                  >
                    {row.username}
                  </span>
                </span>
                <span className="font-mono text-slate-300">{row.score}</span>
              </div>
            ))}
          </div>
        </div>

        {hudState.killFeed.length > 0 && (
          <div className="pointer-events-none flex flex-col items-end gap-1">
            {hudState.killFeed.slice(0, 3).map((kf) => (
              <div
                key={kf.id}
                className="rounded-lg border border-white/10 bg-black/65 px-2.5 py-1 text-[11px] font-medium text-slate-200 backdrop-blur"
              >
                {kf.text}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom-Left Controls Strip */}
      <div className="pointer-events-none absolute bottom-3 left-3 rounded-xl border border-white/10 bg-[#080d1e]/80 px-3 py-2 text-[11px] text-slate-300 backdrop-blur-md">
        <span className="font-semibold text-cyan-300">WASD</span> Move ·{" "}
        <span className="font-semibold text-cyan-300">L-Click</span> Arc Bolt ·{" "}
        <span className="font-semibold text-violet-300">R-Click / E</span>{" "}
        Gravity Tether ·{" "}
        <span className="font-semibold text-amber-300">Space</span> Nova Deflect
      </div>

      {/* Match Ended Podium Overlay */}
      {hudState.matchEnded && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
          <div className="w-full max-w-md rounded-2xl border border-cyan-400/35 bg-[#080d1e] p-6 text-center shadow-[0_0_60px_rgba(34,211,238,0.25)]">
            <Sparkles className="mx-auto mb-2 h-8 w-8 text-amber-400" />
            <h3 className="font-display text-xl font-bold tracking-wider text-white">
              MATCH COMPLETE
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              XP and combat stats saved to Pilot Profiles.
            </p>
            <div className="my-4 space-y-2 text-left">
              {hudState.leaderboard.map((row, i) => (
                <div
                  key={row.userId}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-xs"
                >
                  <span className="flex items-center gap-2">
                    <span className="font-mono font-bold text-amber-300">
                      #{i + 1}
                    </span>
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: row.auraColor }}
                    />
                    <span className="font-semibold text-white">
                      {row.username}
                    </span>
                  </span>
                  <span className="font-mono text-cyan-300">
                    {row.score} PTS · {row.kills} K
                  </span>
                </div>
              ))}
            </div>
            {isHost ? (
              <button
                type="button"
                onClick={onReturnLobby}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 py-2.5 text-sm font-bold text-slate-950"
              >
                <RotateCcw className="h-4 w-4" />
                Return Room to Hangar
              </button>
            ) : (
              <p className="text-xs text-slate-400">
                Waiting for host {room.hostUsername} to return to Hangar...
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
