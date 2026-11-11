"use client";

import { useEffect, useRef, useState } from "react";
import {
  Flag,
  Maximize2,
  Minimize2,
  RotateCcw,
  Trophy,
  Volume2,
  VolumeX,
} from "lucide-react";
import type {
  PlayerNetState,
  PublicUser,
  RoomDetailDTO,
  RoomEventPayload,
} from "@/lib/game-types";
import { GAME_MODES } from "@/lib/game-types";
import type { RoomRealtimeTransport } from "@/lib/realtime-client";
import { soundFX } from "@/lib/sound-fx";
import {
  RACE_LAPS,
  TRACK_HALF_WIDTH,
  TRACK_WALL_MARGIN,
  buildTrack,
  locateOnTrack,
  normalizeAngle,
  stepBotRacer,
  wrapIndex,
  type BotRacer,
} from "@/lib/race-track";

interface RankRow {
  userId: number;
  username: string;
  color: string;
  isBot: boolean;
  progress: number;
  finishMs: number;
}

interface ResultRow {
  userId: number;
  username: string;
  color: string;
  isBot: boolean;
  label: string;
  points: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
}

interface HudState {
  phase: "countdown" | "racing" | "finished" | "ended";
  countdown: number;
  position: number;
  total: number;
  lap: number;
  raceMs: number;
  speed: number;
  energy: number;
  boosting: boolean;
  offTrack: boolean;
  wrongWay: boolean;
  drift: number;
  board: Array<{
    userId: number;
    username: string;
    color: string;
    isBot: boolean;
    status: string;
  }>;
  results: ResultRow[];
}

type BotCar = BotRacer & { userId: number; username: string; color: string };

const PLACE_POINTS = [1000, 750, 600, 450, 350, 250, 150, 100];

const INITIAL_HUD: HudState = {
  phase: "countdown",
  countdown: 5,
  position: 1,
  total: 1,
  lap: 1,
  raceMs: 0,
  speed: 0,
  energy: 40,
  boosting: false,
  offTrack: false,
  wrongWay: false,
  drift: 0,
  board: [],
  results: [],
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function formatMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms));
  const m = Math.floor(total / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const cs = Math.floor((total % 1000) / 10);
  return `${m}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

export function PrismRushCanvas({
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
  onMatchFinish: (
    standings: Array<{ userId: number; score: number; kills: number }>
  ) => void;
  onReturnLobby: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [muted, setMuted] = useState(() => soundFX.muted);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hud, setHud] = useState<HudState>(INITIAL_HUD);

  const isHost = room.hostId === user.id;

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
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const track = buildTrack(room.mapTheme);
    const n = track.samples.length;
    const raceLen = RACE_LAPS * n;
    const hostAtStart = room.hostId === user.id;
    const startedFinished = room.status === "finished";
    const spec = GAME_MODES.find((m) => m.id === room.mode) ?? GAME_MODES[0];
    const durationMs = Math.max(90, spec.durationSec) * 1000;
    const accent = track.accent;

    const trackPath = new Path2D();
    track.samples.forEach((s, i) => {
      if (i === 0) trackPath.moveTo(s.x, s.y);
      else trackPath.lineTo(s.x, s.y);
    });
    trackPath.closePath();

    const nebula = new Image();
    nebula.src = "/images/nebula-backdrop.png";
    const stars = Array.from({ length: 150 }, (_, i) => ({
      x: (i * 7919) % 2200,
      y: (i * 6271) % 1500,
      size: (i % 3) * 0.6 + 0.7,
      depth: (i % 3) * 0.1 + 0.06,
    }));

    let viewW = 960;
    let viewH = 600;
    let dpr = 1;
    const resize = () => {
      const rect = container.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      viewW = Math.max(320, rect.width);
      viewH = Math.max(320, rect.height);
      canvas.width = Math.floor(viewW * dpr);
      canvas.height = Math.floor(viewH * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    // Starting grid: two columns, staggered behind the line.
    const gridPose = (slot: number) => {
      const back = 3 + Math.floor(slot / 2) * 3;
      const idx = wrapIndex(-back, n);
      const s = track.samples[idx];
      const lat = slot % 2 === 0 ? -36 : 36;
      return {
        x: s.x + s.nx * lat,
        y: s.y + s.ny * lat,
        angle: Math.atan2(s.ty, s.tx),
        idx,
        progress: -back,
      };
    };

    const humanIds = room.participants.map((p) => p.userId).sort((a, b) => a - b);
    const mySlot = Math.max(0, humanIds.indexOf(user.id));
    const pose = gridPose(mySlot);
    const me = {
      x: pose.x,
      y: pose.y,
      angle: pose.angle,
      vx: 0,
      vy: 0,
      idx: pose.idx,
      progress: pose.progress,
      energy: 40,
      finishMs: 0,
      boosting: false,
      drift: 0,
      offTrack: false,
    };

    // AI racers are simulated by the host and broadcast to everyone else.
    const bots: BotCar[] = [];
    if (hostAtStart && room.botFill && !startedFinished) {
      const specs = [
        { userId: -1, username: "Bot_Comet", color: "#f59e0b", topSpeed: 485, lane: -34 },
        { userId: -2, username: "Bot_Quasar", color: "#ec4899", topSpeed: 455, lane: 30 },
        { userId: -3, username: "Bot_Zenith", color: "#10b981", topSpeed: 425, lane: -6 },
      ];
      const need = clamp(spec.botFillTo - room.participants.length, 0, specs.length);
      for (let i = 0; i < need; i++) {
        const gp = gridPose(humanIds.length + i);
        bots.push({
          ...specs[i],
          x: gp.x,
          y: gp.y,
          angle: gp.angle,
          speed: 0,
          idx: gp.idx,
          progress: gp.progress,
          finishMs: 0,
        });
      }
    }

    const smoothed = new Map<number, { x: number; y: number; angle: number }>();
    const seen = new Map<number, { stamp: number; at: number }>();
    const trails = new Map<number, Array<{ x: number; y: number }>>();
    const particles: Particle[] = [];
    const toasts: Array<{ text: string; color: string; life: number }> = [];
    const padCooldown = new Map<string, number>();

    const keys = new Set<string>();
    const typing = () => {
      const tag = document.activeElement?.tagName.toLowerCase();
      return tag === "input" || tag === "textarea" || tag === "select";
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (typing()) return;
      const k = e.key.toLowerCase();
      if (k === " " || k.startsWith("arrow")) e.preventDefault();
      keys.add(k);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys.delete(e.key.toLowerCase());
    };
    const onBlur = () => keys.clear();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);

    const spark = (x: number, y: number, color: string, count: number, speed: number) => {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = (0.3 + Math.random() * 0.8) * speed;
        const life = 0.25 + Math.random() * 0.35;
        particles.push({
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life,
          max: life,
          size: 1.5 + Math.random() * 2.5,
          color,
        });
      }
    };
    const toast = (text: string, color: string) => {
      toasts.unshift({ text, color, life: 1.4 });
      if (toasts.length > 3) toasts.length = 3;
    };
    const pushTrail = (id: number, x: number, y: number) => {
      let list = trails.get(id);
      if (!list) {
        list = [];
        trails.set(id, list);
      }
      const lastPt = list[list.length - 1];
      if (!lastPt || Math.hypot(lastPt.x - x, lastPt.y - y) > 7) {
        list.push({ x, y });
        if (list.length > 16) list.shift();
      }
    };

    const collectRanks = (): RankRow[] => {
      const rows: RankRow[] = [
        {
          userId: user.id,
          username: user.username,
          color: user.auraColor,
          isBot: false,
          progress: me.progress,
          finishMs: me.finishMs,
        },
      ];
      for (const b of bots) {
        rows.push({
          userId: b.userId,
          username: b.username,
          color: b.color,
          isBot: true,
          progress: b.progress,
          finishMs: b.finishMs,
        });
      }
      for (const rp of remotePlayersRef.current.values()) {
        // `smoothed` only holds racers we are still receiving updates from.
        if (!smoothed.has(rp.userId)) continue;
        rows.push({
          userId: rp.userId,
          username: rp.username,
          color: rp.auraColor,
          isBot: Boolean(rp.isBot),
          progress: rp.progress ?? 0,
          finishMs: rp.finishMs ?? 0,
        });
      }
      rows.sort((a, b) => {
        if (a.finishMs > 0 && b.finishMs > 0) return a.finishMs - b.finishMs;
        if (a.finishMs > 0) return -1;
        if (b.finishMs > 0) return 1;
        return b.progress - a.progress;
      });
      return rows;
    };

    const buildResults = (ranks: RankRow[]): ResultRow[] =>
      ranks.map((r, i) => ({
        userId: r.userId,
        username: r.username,
        color: r.color,
        isBot: r.isBot,
        label: r.finishMs > 0 ? formatMs(r.finishMs) : "DNF",
        points:
          r.finishMs > 0
            ? PLACE_POINTS[i] ?? 60
            : Math.round(50 * clamp(r.progress / raceLen, 0, 1)),
      }));

    const toNet = (
      id: number,
      name: string,
      color: string,
      isBot: boolean,
      x: number,
      y: number,
      vx: number,
      vy: number,
      angle: number,
      progress: number,
      finishMs: number,
      boosting: boolean
    ): PlayerNetState => ({
      userId: id,
      username: name,
      isBot,
      shipChassis: user.shipChassis,
      auraColor: color,
      x,
      y,
      vx,
      vy,
      angle,
      hp: 100,
      maxHp: 100,
      energy: 0,
      score: Math.round(progress),
      kills: 0,
      deaths: 0,
      carryingFlux: 0,
      shieldUntil: 0,
      tetherType: "none",
      tetherX: 0,
      tetherY: 0,
      alive: true,
      respawnAt: 0,
      updatedAt: Date.now(),
      progress,
      finishMs,
      boosting,
    });

    const drawCar = (
      x: number,
      y: number,
      angle: number,
      color: string,
      boosting: boolean,
      speed: number,
      name: string,
      isMe: boolean
    ) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      const flame = 8 + Math.min(34, speed / 18) + (boosting ? 26 : 0);
      const grad = ctx.createLinearGradient(-15, 0, -15 - flame, 0);
      grad.addColorStop(0, boosting ? "#ffffff" : color);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(-14, -7);
      ctx.lineTo(-15 - flame, 0);
      ctx.lineTo(-14, 7);
      ctx.closePath();
      ctx.fill();

      ctx.shadowBlur = 18;
      ctx.shadowColor = color;
      ctx.fillStyle = "#0a1226";
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(24, 0);
      ctx.lineTo(6, -9);
      ctx.lineTo(-8, -14);
      ctx.lineTo(-17, -11);
      ctx.lineTo(-13, 0);
      ctx.lineTo(-17, 11);
      ctx.lineTo(-8, 14);
      ctx.lineTo(6, 9);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.fillStyle = "#e0f2fe";
      ctx.beginPath();
      ctx.ellipse(5, 0, 7, 3.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.fillRect(-11, -1.5, 9, 3);
      ctx.restore();

      ctx.font = "600 12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = isMe ? "#ffffff" : "rgba(226,232,240,0.85)";
      ctx.fillText(name, x, y - 26);
    };

    const goAt = performance.now() + (startedFinished ? 0 : 4200);
    let ended = startedFinished;
    let finalResults: ResultRow[] | null = startedFinished
      ? [...room.participants]
          .sort((a, b) => b.lastScore - a.lastScore)
          .map((p) => ({
            userId: p.userId,
            username: p.username,
            color: p.auraColor,
            isBot: false,
            label: `${p.lastScore} pts`,
            points: p.lastScore,
          }))
      : null;
    let allDoneAt = 0;
    let firstFinishAt = 0;
    let lastCd = 99;
    let wrongWayT = 0;
    let lastScrape = 0;
    let camX = me.x;
    let camY = me.y;
    let zoom = 0.9;
    let last = performance.now();
    let lastNet = 0;
    let lastHud = 0;
    let raf = 0;

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const raceMs = Math.max(0, now - goAt);
      const live = !startedFinished && now >= goAt && !ended;

      if (incomingEventRef.current.length > 0) {
        for (const ev of incomingEventRef.current.splice(0)) {
          if (ev.kind === "match_end") ended = true;
        }
      }

      const cd = Math.ceil((goAt - now) / 1000);
      if (!startedFinished && cd !== lastCd) {
        lastCd = cd;
        if (cd >= 1 && cd <= 3) soundFX.playPickup();
        else if (cd === 0) soundFX.playBank();
      }

      // ---------- local driving ----------
      const canDrive = live && me.finishMs === 0;
      let boosting = false;
      if (canDrive) {
        const up = keys.has("w") || keys.has("arrowup");
        const down = keys.has("s") || keys.has("arrowdown");
        const steer =
          (keys.has("d") || keys.has("arrowright") ? 1 : 0) -
          (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
        const drifting = keys.has("shift");

        const fx0 = Math.cos(me.angle);
        const fy0 = Math.sin(me.angle);
        const fwd0 = me.vx * fx0 + me.vy * fy0;
        const sp0 = Math.hypot(me.vx, me.vy);
        me.angle +=
          steer *
          (drifting ? 3.4 : 2.8) *
          clamp(sp0 / 170, 0, 1) *
          (fwd0 < -10 ? -1 : 1) *
          dt;

        const fx = Math.cos(me.angle);
        const fy = Math.sin(me.angle);
        boosting = keys.has(" ") && me.energy > 1;
        if (up || boosting) {
          const acc = boosting ? 1150 : 640;
          me.vx += fx * acc * dt;
          me.vy += fy * acc * dt;
        }
        if (down && fwd0 > -170) {
          me.vx -= fx * 560 * dt;
          me.vy -= fy * 560 * dt;
        }

        // Lateral grip: keep the forward component, bleed off the sideways one.
        const fwd = me.vx * fx + me.vy * fy;
        let latX = me.vx - fx * fwd;
        let latY = me.vy - fy * fwd;
        const keep = Math.pow(drifting ? 0.935 : 0.8, dt * 60);
        latX *= keep;
        latY *= keep;
        me.vx = fx * fwd + latX;
        me.vy = fy * fwd + latY;

        const slide = Math.hypot(latX, latY);
        if (drifting && slide > 60 && sp0 > 220) {
          me.drift = Math.min(1.6, me.drift + dt);
          if (Math.random() < 0.7) {
            spark(me.x - fx * 14, me.y - fy * 14, "#fbbf24", 1, 120);
          }
        } else if (!drifting && me.drift > 0) {
          if (me.drift > 0.4) {
            const gain = Math.round(me.drift * 24);
            me.energy = Math.min(100, me.energy + gain);
            toast(`DRIFT CHARGE +${gain}`, "#fbbf24");
            soundFX.playPickup();
          }
          me.drift = 0;
        }

        me.energy = boosting
          ? Math.max(0, me.energy - 36 * dt)
          : Math.min(100, me.energy + 6 * dt);
        if (boosting && !me.boosting) soundFX.playNova();
      }
      me.boosting = boosting;

      const dragBase = canDrive ? (me.offTrack ? 0.965 : 0.99) : 0.965;
      const drag = Math.pow(dragBase, dt * 60);
      me.vx *= drag;
      me.vy *= drag;
      const cap = (boosting ? 800 : 545) * (me.offTrack ? 0.72 : 1);
      const spNow = Math.hypot(me.vx, me.vy);
      if (spNow > cap) {
        const k = Math.max(cap / spNow, Math.pow(0.93, dt * 60));
        me.vx *= k;
        me.vy *= k;
      }

      const lapsBefore = Math.floor(Math.max(0, me.progress) / n);
      me.x += me.vx * dt;
      me.y += me.vy * dt;
      const loc = locateOnTrack(track, me.x, me.y, me.idx);
      me.idx = loc.idx;
      me.progress += loc.delta;
      const here = track.samples[me.idx];
      const lateral = Math.abs(loc.side);
      me.offTrack = lateral > TRACK_HALF_WIDTH;

      const wall = TRACK_HALF_WIDTH + TRACK_WALL_MARGIN;
      if (lateral > wall) {
        const sign = loc.side > 0 ? 1 : -1;
        const over = lateral - wall;
        me.x -= here.nx * sign * over;
        me.y -= here.ny * sign * over;
        const outward = (me.vx * here.nx + me.vy * here.ny) * sign;
        if (outward > 0) {
          me.vx -= here.nx * sign * outward * 1.15;
          me.vy -= here.ny * sign * outward * 1.15;
          if (outward > 120 && now - lastScrape > 220) {
            lastScrape = now;
            soundFX.playHit(false);
          }
        }
        if (Math.random() < 0.6) spark(me.x, me.y, "#f43f5e", 2, 160);
      } else if (me.offTrack && spNow > 120 && Math.random() < 0.35) {
        spark(me.x, me.y, "#94a3b8", 1, 90);
      }

      const along = me.vx * here.tx + me.vy * here.ty;
      wrongWayT = canDrive && along < -90 ? wrongWayT + dt : 0;
      const wrongWay = wrongWayT > 0.7;

      // Boost pads
      if (canDrive && lateral < 64) {
        for (const pad of track.boostPads) {
          const gap = Math.abs(me.idx - pad);
          if (Math.min(gap, n - gap) > 1) continue;
          const padKey = `me:${pad}`;
          if ((padCooldown.get(padKey) ?? 0) > now) continue;
          padCooldown.set(padKey, now + 1500);
          me.vx += Math.cos(me.angle) * 230;
          me.vy += Math.sin(me.angle) * 230;
          me.energy = Math.min(100, me.energy + 30);
          soundFX.playNova();
          toast("BOOST PAD +30", "#22d3ee");
          spark(me.x, me.y, "#22d3ee", 14, 240);
        }
      }

      // Laps / finish
      const lapsNow = Math.floor(Math.max(0, me.progress) / n);
      if (canDrive && lapsNow > lapsBefore) {
        if (lapsNow >= RACE_LAPS) {
          me.finishMs = Math.max(1, Math.round(raceMs));
          soundFX.playBank();
          toast("FINISH!", "#fbbf24");
        } else {
          soundFX.playPickup();
          toast(
            lapsNow === RACE_LAPS - 1 ? "FINAL LAP" : `LAP ${lapsNow + 1}/${RACE_LAPS}`,
            "#ffffff"
          );
        }
      }
      pushTrail(user.id, me.x, me.y);

      // ---------- bots (host only) ----------
      if (live) {
        for (const b of bots) {
          stepBotRacer(track, b, dt);
          const gapBase = locateOnTrack(track, b.x, b.y, b.idx);
          if (Math.abs(gapBase.side) < 64) {
            for (const pad of track.boostPads) {
              const gap = Math.abs(b.idx - pad);
              if (Math.min(gap, n - gap) > 1) continue;
              const padKey = `${b.userId}:${pad}`;
              if ((padCooldown.get(padKey) ?? 0) > now) continue;
              padCooldown.set(padKey, now + 1500);
              b.speed += 140;
            }
          }
          if (b.finishMs === 0 && b.progress >= raceLen) {
            b.finishMs = Math.max(1, Math.round(raceMs));
            b.topSpeed = 170;
          }
          pushTrail(b.userId, b.x, b.y);
        }
      }

      // ---------- remote racers ----------
      for (const [uid, rp] of remotePlayersRef.current.entries()) {
        if (uid === user.id || bots.some((b) => b.userId === uid)) continue;
        const stamp = seen.get(uid);
        if (!stamp || stamp.stamp !== rp.updatedAt) {
          seen.set(uid, { stamp: rp.updatedAt, at: now });
        }
        const fresh = now - (seen.get(uid)?.at ?? now) < 5000;
        if (!fresh) {
          smoothed.delete(uid);
          trails.delete(uid);
          continue;
        }
        const cur = smoothed.get(uid);
        if (!cur) {
          smoothed.set(uid, { x: rp.x, y: rp.y, angle: rp.angle });
        } else {
          const tx = rp.x + rp.vx * 0.06;
          const ty = rp.y + rp.vy * 0.06;
          const f = Math.min(1, dt * 12);
          cur.x += (tx - cur.x) * f;
          cur.y += (ty - cur.y) * f;
          cur.angle += normalizeAngle(rp.angle - cur.angle) * f;
          pushTrail(uid, cur.x, cur.y);
        }
      }
      for (const uid of Array.from(smoothed.keys())) {
        if (!remotePlayersRef.current.has(uid)) {
          smoothed.delete(uid);
          trails.delete(uid);
        }
      }

      // ---------- race end ----------
      if (live) {
        const ranks = collectRanks();
        if (!firstFinishAt && ranks.some((r) => r.finishMs > 0)) {
          firstFinishAt = now;
        }
        if (!allDoneAt && ranks.filter((r) => !r.isBot).every((r) => r.finishMs > 0)) {
          allDoneAt = now;
        }
        const hostShouldEnd =
          (allDoneAt > 0 && now - allDoneAt > 2500) ||
          (firstFinishAt > 0 && now - firstFinishAt > 40000) ||
          raceMs > durationMs;
        // If the host vanished, anyone may close the race a little later.
        const fallbackEnd = raceMs > durationMs + 10000;
        if ((hostAtStart && hostShouldEnd) || fallbackEnd) {
          ended = true;
          finalResults = buildResults(ranks);
          onMatchFinish(
            finalResults.map((r) => ({ userId: r.userId, score: r.points, kills: 0 }))
          );
        }
      }
      if (ended && !finalResults) {
        finalResults = buildResults(collectRanks());
      }

      // ---------- network ----------
      if (!startedFinished && now - lastNet > 66) {
        lastNet = now;
        void transportRef.current?.sendPlayerState(
          toNet(
            user.id,
            user.username,
            user.auraColor,
            false,
            me.x,
            me.y,
            me.vx,
            me.vy,
            me.angle,
            me.progress,
            me.finishMs,
            me.boosting
          )
        );
        if (bots.length > 0) {
          void transportRef.current?.sendBotStates(
            bots.map((b) =>
              toNet(
                b.userId,
                b.username,
                b.color,
                true,
                b.x,
                b.y,
                Math.cos(b.angle) * b.speed,
                Math.sin(b.angle) * b.speed,
                b.angle,
                b.progress,
                b.finishMs,
                false
              )
            )
          );
        }
      }

      // ---------- HUD ----------
      if (now - lastHud > 110) {
        lastHud = now;
        const ranks = collectRanks();
        const lapOf = (p: number) =>
          clamp(Math.floor(Math.max(0, p) / n) + 1, 1, RACE_LAPS);
        setHud({
          phase: ended
            ? "ended"
            : me.finishMs > 0
            ? "finished"
            : now < goAt
            ? "countdown"
            : "racing",
          countdown: cd,
          position: Math.max(1, ranks.findIndex((r) => r.userId === user.id) + 1),
          total: ranks.length,
          lap: lapOf(me.progress),
          raceMs: me.finishMs > 0 ? me.finishMs : raceMs,
          speed: Math.round(Math.hypot(me.vx, me.vy)),
          energy: Math.round(me.energy),
          boosting: me.boosting,
          offTrack: me.offTrack,
          wrongWay,
          drift: me.drift,
          board: ranks.slice(0, 6).map((r) => ({
            userId: r.userId,
            username: r.username,
            color: r.color,
            isBot: r.isBot,
            status: r.finishMs > 0 ? formatMs(r.finishMs) : `Lap ${lapOf(r.progress)}`,
          })),
          results: finalResults ?? [],
        });
      }

      // ---------- render ----------
      const speedNow = Math.hypot(me.vx, me.vy);
      const baseZoom = clamp(Math.min(viewW, viewH) / 720, 0.62, 1.15);
      const targetZoom = baseZoom * (1 - Math.min(0.2, speedNow / 4000));
      zoom += (targetZoom - zoom) * Math.min(1, dt * 3);
      camX += (me.x + me.vx * 0.26 - camX) * Math.min(1, dt * 6);
      camY += (me.y + me.vy * 0.26 - camY) * Math.min(1, dt * 6);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#03040c";
      ctx.fillRect(0, 0, viewW, viewH);
      if (nebula.complete && nebula.naturalWidth > 0) {
        ctx.globalAlpha = 0.3;
        ctx.drawImage(
          nebula,
          -camX * 0.05 - 20,
          -camY * 0.05 - 20,
          viewW + 220,
          viewH + 160
        );
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = "#e2e8f0";
      for (const st of stars) {
        const sx = (((st.x - camX * st.depth) % viewW) + viewW) % viewW;
        const sy = (((st.y - camY * st.depth) % viewH) + viewH) % viewH;
        ctx.globalAlpha = 0.35 + st.depth * 3;
        ctx.fillRect(sx, sy, st.size, st.size);
      }
      ctx.globalAlpha = 1;

      ctx.save();
      ctx.translate(viewW / 2, viewH / 2);
      ctx.scale(zoom, zoom);
      ctx.translate(-camX, -camY);
      ctx.lineJoin = "round";
      ctx.lineCap = "round";

      // Barrier line and dark run-off
      ctx.strokeStyle = "rgba(244, 63, 94, 0.55)";
      ctx.lineWidth = (TRACK_HALF_WIDTH + TRACK_WALL_MARGIN) * 2 + 4;
      ctx.stroke(trackPath);
      ctx.strokeStyle = "#060814";
      ctx.lineWidth = (TRACK_HALF_WIDTH + TRACK_WALL_MARGIN) * 2;
      ctx.stroke(trackPath);
      // Neon edge (layered strokes instead of an expensive blur)
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.1;
      ctx.lineWidth = TRACK_HALF_WIDTH * 2 + 44;
      ctx.stroke(trackPath);
      ctx.globalAlpha = 0.22;
      ctx.lineWidth = TRACK_HALF_WIDTH * 2 + 24;
      ctx.stroke(trackPath);
      ctx.globalAlpha = 1;
      ctx.lineWidth = TRACK_HALF_WIDTH * 2 + 10;
      ctx.stroke(trackPath);
      // Tarmac
      ctx.strokeStyle = "#0b1022";
      ctx.lineWidth = TRACK_HALF_WIDTH * 2;
      ctx.stroke(trackPath);
      ctx.strokeStyle = "rgba(30, 41, 82, 0.5)";
      ctx.lineWidth = TRACK_HALF_WIDTH * 1.15;
      ctx.stroke(trackPath);
      ctx.lineCap = "butt";
      ctx.setLineDash([26, 34]);
      ctx.strokeStyle = "rgba(148, 163, 184, 0.3)";
      ctx.lineWidth = 3;
      ctx.stroke(trackPath);
      ctx.setLineDash([]);

      // Start / finish line
      const s0 = track.samples[0];
      ctx.save();
      ctx.translate(s0.x, s0.y);
      ctx.rotate(Math.atan2(s0.ty, s0.tx));
      const cell = (TRACK_HALF_WIDTH * 2) / 12;
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 12; col++) {
          ctx.fillStyle = (row + col) % 2 === 0 ? "#f8fafc" : "#0f172a";
          ctx.fillRect(-cell + row * cell, -TRACK_HALF_WIDTH + col * cell, cell, cell);
        }
      }
      ctx.restore();

      // Boost pads
      const padGlow = 0.55 + 0.45 * Math.sin(now / 160);
      for (const pad of track.boostPads) {
        const ps = track.samples[pad];
        ctx.save();
        ctx.translate(ps.x, ps.y);
        ctx.rotate(Math.atan2(ps.ty, ps.tx));
        ctx.fillStyle = `rgba(34, 211, 238, ${0.1 + padGlow * 0.12})`;
        ctx.fillRect(-36, -62, 72, 124);
        ctx.strokeStyle = `rgba(34, 211, 238, ${0.5 + padGlow * 0.5})`;
        ctx.lineWidth = 5;
        ctx.lineCap = "round";
        for (let k = -1; k <= 1; k++) {
          ctx.beginPath();
          ctx.moveTo(-12 + k * 20, -36);
          ctx.lineTo(8 + k * 20, 0);
          ctx.lineTo(-12 + k * 20, 36);
          ctx.stroke();
        }
        ctx.restore();
      }

      // Light trails
      const colorOf = new Map<number, string>();
      colorOf.set(user.id, user.auraColor);
      for (const b of bots) colorOf.set(b.userId, b.color);
      for (const rp of remotePlayersRef.current.values()) {
        if (!colorOf.has(rp.userId)) colorOf.set(rp.userId, rp.auraColor);
      }
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      for (const [id, list] of trails.entries()) {
        const c = colorOf.get(id) ?? "#ffffff";
        for (let i = 1; i < list.length; i++) {
          ctx.globalAlpha = (i / list.length) * 0.5;
          ctx.strokeStyle = c;
          ctx.lineWidth = 2 + (i / list.length) * 6;
          ctx.beginPath();
          ctx.moveTo(list[i - 1].x, list[i - 1].y);
          ctx.lineTo(list[i].x, list[i].y);
          ctx.stroke();
        }
      }
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= dt;
        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        ctx.globalAlpha = p.life / p.max;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // Cars
      for (const rp of remotePlayersRef.current.values()) {
        const pos = smoothed.get(rp.userId);
        if (!pos) continue;
        drawCar(
          pos.x,
          pos.y,
          pos.angle,
          rp.auraColor,
          Boolean(rp.boosting),
          Math.hypot(rp.vx, rp.vy),
          rp.username,
          false
        );
      }
      for (const b of bots) {
        drawCar(b.x, b.y, b.angle, b.color, false, b.speed, b.username, false);
      }
      drawCar(me.x, me.y, me.angle, user.auraColor, me.boosting, speedNow, user.username, true);

      ctx.restore();

      // ---------- screen-space overlays ----------
      if (me.boosting) {
        ctx.save();
        ctx.strokeStyle = "rgba(255,255,255,0.2)";
        ctx.lineWidth = 2;
        const r1 = Math.min(viewW, viewH) * 0.42;
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2 + now / 900;
          const r2 = r1 + 50 + (i % 3) * 34;
          ctx.beginPath();
          ctx.moveTo(viewW / 2 + Math.cos(a) * r1, viewH / 2 + Math.sin(a) * r1);
          ctx.lineTo(viewW / 2 + Math.cos(a) * r2, viewH / 2 + Math.sin(a) * r2);
          ctx.stroke();
        }
        ctx.restore();
      }

      for (let i = toasts.length - 1; i >= 0; i--) {
        const t = toasts[i];
        t.life -= dt;
        if (t.life <= 0) {
          toasts.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = clamp(t.life / 0.4, 0, 1);
        ctx.font = "800 20px sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = t.color;
        ctx.fillText(t.text, viewW / 2, viewH * 0.27 + i * 26);
      }
      ctx.globalAlpha = 1;

      // Minimap
      const mapW = 176;
      const mapH = 120;
      const mx = viewW - mapW - 14;
      const my = viewH - mapH - 14;
      const ms = Math.min((mapW - 16) / track.worldW, (mapH - 16) / track.worldH);
      const mox = mx + (mapW - track.worldW * ms) / 2;
      const moy = my + (mapH - track.worldH * ms) / 2;
      ctx.fillStyle = "rgba(7, 11, 24, 0.82)";
      ctx.strokeStyle = "rgba(245, 158, 11, 0.3)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(mx, my, mapW, mapH, 10);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i <= n; i += 3) {
        const s = track.samples[i % n];
        if (i === 0) ctx.moveTo(mox + s.x * ms, moy + s.y * ms);
        else ctx.lineTo(mox + s.x * ms, moy + s.y * ms);
      }
      ctx.closePath();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 3;
      ctx.stroke();
      const dot = (x: number, y: number, c: string, r: number) => {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(mox + x * ms, moy + y * ms, r, 0, Math.PI * 2);
        ctx.fill();
      };
      for (const rp of remotePlayersRef.current.values()) {
        const pos = smoothed.get(rp.userId);
        if (pos) dot(pos.x, pos.y, rp.auraColor, 3);
      }
      for (const b of bots) dot(b.x, b.y, b.color, 3);
      dot(me.x, me.y, "#ffffff", 4);

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
    // Keyed to the match itself: lobby or participant updates must never restart a live race.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.code, room.matchStartedAt, room.mapTheme, user.id]);

  const showGo = hud.phase === "racing" && hud.raceMs < 900;

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full select-none overflow-hidden rounded-2xl border border-amber-400/25 bg-[#03040c]"
    >
      <canvas ref={canvasRef} className="block h-full w-full" />

      {/* Position / lap / time */}
      <div className="pointer-events-none absolute left-3 top-3 flex items-stretch gap-2">
        <div className="rounded-xl border border-white/15 bg-[#080d1e]/85 px-4 py-2 backdrop-blur-md">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Position
          </div>
          <div className="font-display text-3xl font-extrabold leading-none text-white">
            {hud.position}
            <span className="text-base text-slate-400">/{hud.total}</span>
          </div>
        </div>
        <div className="rounded-xl border border-white/15 bg-[#080d1e]/85 px-4 py-2 backdrop-blur-md">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Lap
          </div>
          <div className="font-display text-3xl font-extrabold leading-none text-amber-300">
            {hud.lap}
            <span className="text-base text-slate-400">/{RACE_LAPS}</span>
          </div>
        </div>
        <div className="rounded-xl border border-white/15 bg-[#080d1e]/85 px-4 py-2 backdrop-blur-md">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Time
          </div>
          <div className="font-mono text-xl font-bold leading-8 text-white">
            {formatMs(hud.raceMs)}
          </div>
        </div>
      </div>

      {/* Buttons + live order */}
      <div className="absolute right-3 top-3 flex flex-col items-end gap-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={toggleMute}
            title={muted ? "Unmute SFX" : "Mute SFX"}
            className="rounded-lg border border-white/15 bg-[#080d1e]/85 p-2 text-slate-300 backdrop-blur-md hover:border-amber-400/40 hover:text-white"
          >
            {muted ? (
              <VolumeX className="h-4 w-4 text-rose-400" />
            ) : (
              <Volume2 className="h-4 w-4 text-amber-300" />
            )}
          </button>
          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            title="Toggle Fullscreen"
            className="rounded-lg border border-white/15 bg-[#080d1e]/85 p-2 text-slate-300 backdrop-blur-md hover:border-amber-400/40 hover:text-white"
          >
            {isFullscreen ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </button>
        </div>
        <div className="pointer-events-none w-52 rounded-xl border border-white/10 bg-[#080d1e]/80 p-2.5 backdrop-blur-md">
          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            <Flag className="h-3 w-3 text-amber-400" />
            Race Order
          </div>
          <div className="space-y-1">
            {hud.board.map((row, i) => (
              <div
                key={row.userId}
                className="flex items-center justify-between text-[11px]"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="text-slate-500">{i + 1}.</span>
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: row.color }}
                  />
                  <span
                    className={`truncate ${
                      row.userId === user.id
                        ? "font-bold text-amber-200"
                        : "text-slate-200"
                    }`}
                  >
                    {row.username}
                  </span>
                </span>
                <span className="font-mono text-slate-300">{row.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Speed + boost */}
      <div className="pointer-events-none absolute bottom-3 left-1/2 w-72 -translate-x-1/2 rounded-xl border border-white/10 bg-[#080d1e]/85 px-4 py-2.5 backdrop-blur-md">
        <div className="flex items-end justify-between">
          <div>
            <span className="font-display text-2xl font-extrabold text-white">
              {hud.speed}
            </span>
            <span className="ml-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              px/s
            </span>
          </div>
          <span
            className={`text-[10px] font-bold uppercase tracking-widest ${
              hud.boosting
                ? "text-white"
                : hud.offTrack
                ? "text-rose-300"
                : hud.drift > 0.4
                ? "text-amber-300"
                : "text-slate-400"
            }`}
          >
            {hud.boosting
              ? "Boosting"
              : hud.offTrack
              ? "Off track"
              : hud.drift > 0.4
              ? "Drift charged"
              : `Boost ${hud.energy}%`}
          </span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-800">
          <div
            className={`h-full rounded-full transition-all duration-100 ${
              hud.boosting
                ? "bg-white"
                : "bg-gradient-to-r from-amber-400 to-cyan-400"
            }`}
            style={{ width: `${hud.energy}%` }}
          />
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 hidden rounded-xl border border-white/10 bg-[#080d1e]/80 px-3 py-2 text-[11px] text-slate-300 backdrop-blur-md lg:block">
        <span className="font-semibold text-amber-300">WASD / Arrows</span> Drive ·{" "}
        <span className="font-semibold text-amber-300">Shift</span> Drift ·{" "}
        <span className="font-semibold text-cyan-300">Space</span> Boost
      </div>

      {/* Countdown / GO / warnings */}
      {hud.phase === "countdown" && (
        <div className="pointer-events-none absolute inset-x-0 top-[20%] flex justify-center">
          <div className="font-display text-7xl font-extrabold text-white drop-shadow-[0_0_30px_rgba(245,158,11,0.9)]">
            {hud.countdown > 3 ? "READY" : Math.max(1, hud.countdown)}
          </div>
        </div>
      )}
      {showGo && (
        <div className="pointer-events-none absolute inset-x-0 top-[20%] flex justify-center">
          <div className="font-display text-7xl font-extrabold text-emerald-300 drop-shadow-[0_0_30px_rgba(16,185,129,0.9)]">
            GO!
          </div>
        </div>
      )}
      {hud.wrongWay && hud.phase === "racing" && (
        <div className="pointer-events-none absolute left-1/2 top-24 -translate-x-1/2 animate-pulse rounded-xl border border-rose-400/60 bg-rose-500/25 px-4 py-1.5 font-display text-sm font-bold tracking-widest text-rose-100">
          WRONG WAY
        </div>
      )}
      {hud.phase === "finished" && (
        <div className="pointer-events-none absolute left-1/2 top-24 -translate-x-1/2 rounded-xl border border-amber-400/60 bg-[#080d1e]/90 px-5 py-2 text-center backdrop-blur-md">
          <div className="font-display text-lg font-extrabold tracking-widest text-amber-300">
            FINISHED · P{hud.position}
          </div>
          <div className="font-mono text-xs text-slate-300">
            {formatMs(hud.raceMs)} — waiting for the other racers
          </div>
        </div>
      )}

      {/* Results */}
      {hud.phase === "ended" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
          <div className="w-full max-w-md rounded-2xl border border-amber-400/40 bg-[#080d1e] p-6 text-center shadow-[0_0_60px_rgba(245,158,11,0.25)]">
            <Trophy className="mx-auto mb-2 h-8 w-8 text-amber-400" />
            <h3 className="font-display text-xl font-bold tracking-wider text-white">
              RACE COMPLETE
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              Placement points are saved as XP for pilots in the room.
            </p>
            <div className="my-4 space-y-2 text-left">
              {hud.results.map((row, i) => (
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
                      style={{ backgroundColor: row.color }}
                    />
                    <span className="font-semibold text-white">
                      {row.username}
                    </span>
                  </span>
                  <span className="font-mono text-amber-200">{row.label}</span>
                </div>
              ))}
            </div>
            {isHost ? (
              <button
                type="button"
                onClick={onReturnLobby}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-cyan-400 py-2.5 text-sm font-bold text-slate-950"
              >
                <RotateCcw className="h-4 w-4" />
                Return Room to Hangar
              </button>
            ) : (
              <p className="text-xs text-slate-400">
                Waiting for host {room.hostUsername} to return to the Hangar…
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
