"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Crown, Eye, RotateCcw, Timer, Volume2, VolumeX } from "lucide-react";
import type { PublicUser, RoomDetailDTO } from "@/lib/game-types";
import {
  HEX_EMPTY,
  HEX_TURN_MS,
  countPieces,
  hexDistance,
  hexKey,
  hexNeighbors,
  parseHexKey,
  type HexState,
} from "@/lib/hex-game";
import { soundFX } from "@/lib/sound-fx";

interface CellAnim {
  start: number;
  from: number;
  to: number;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

const SQRT3 = Math.sqrt(3);

export function HexDominionBoard({
  room,
  user,
  onReturnLobby,
}: {
  room: RoomDetailDTO;
  user: PublicUser;
  onReturnLobby: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [hex, setHex] = useState<HexState | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [muted, setMuted] = useState(() => soundFX.muted);
  const [remainingMs, setRemainingMs] = useState(HEX_TURN_MS);

  const hexRef = useRef<HexState | null>(null);
  const selectedRef = useRef<string | null>(null);
  const hoverRef = useRef<string | null>(null);
  const mySeatRef = useRef(-1);
  const animsRef = useRef<Map<string, CellAnim>>(new Map());
  const sparksRef = useRef<Spark[]>([]);
  const layoutRef = useRef({ size: 30, cx: 0, cy: 0 });
  const clockOffsetRef = useRef(0);
  const lastMoveAtRef = useRef(0);
  const busyRef = useRef(false);

  const mySeat = hex
    ? hex.seats.findIndex((s) => s.userId === user.id && !s.isBot)
    : -1;
  const isHost = room.hostId === user.id;

  useEffect(() => {
    mySeatRef.current = mySeat;
  }, [mySeat]);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  const applyIncoming = useCallback((next: HexState) => {
    const prev = hexRef.current;
    // Ignore stale responses that arrive out of order.
    if (prev && next.v <= prev.v) return;
    const now = performance.now();

    if (prev) {
      const { size, cx, cy } = layoutRef.current;
      let flips = 0;
      for (const key of Object.keys(next.cells)) {
        const before = prev.cells[key];
        const after = next.cells[key];
        if (before === after) continue;
        animsRef.current.set(key, {
          start: now,
          from: before ?? HEX_EMPTY,
          to: after,
        });
        if (before >= 0 && after >= 0) {
          flips += 1;
          const [q, r] = parseHexKey(key);
          const x = cx + size * SQRT3 * (q + r / 2);
          const y = cy + size * 1.5 * r;
          const color = next.seats[after]?.color ?? "#ffffff";
          for (let i = 0; i < 9; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = 40 + Math.random() * 110;
            sparksRef.current.push({
              x,
              y,
              vx: Math.cos(a) * sp,
              vy: Math.sin(a) * sp,
              life: 0.5 + Math.random() * 0.3,
              color,
            });
          }
        }
      }
      lastMoveAtRef.current = now;
      if (next.status === "finished") soundFX.playBank();
      else if (flips > 0) soundFX.playPickup();
      else soundFX.playTether();
    }

    hexRef.current = next;
    setHex(next);
    setSelected(null);
  }, []);

  // Poll the authoritative board. The GET also lets the server play any move
  // that is due (bot turn, expired turn timer).
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/rooms/${room.code}/board`, {
          cache: "no-store",
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          state: HexState | null;
          serverNow: number;
        };
        if (cancelled || !data.state) return;
        clockOffsetRef.current = data.serverNow - Date.now();
        applyIncoming(data.state);
      } catch {
        // transient network error; the next poll retries
      }
    };
    void load();
    const timer = setInterval(() => void load(), 900);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [room.code, applyIncoming]);

  // Turn countdown (uses the server clock offset measured by the poll).
  useEffect(() => {
    const timer = setInterval(() => {
      const st = hexRef.current;
      if (!st || st.status !== "playing") return;
      const serverNow = Date.now() + clockOffsetRef.current;
      setRemainingMs(
        Math.max(0, HEX_TURN_MS - (serverNow - st.turnStartedAt))
      );
    }, 250);
    return () => clearInterval(timer);
  }, []);

  // Canvas renderer
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const backdrop = new Image();
    backdrop.src = "/images/nebula-backdrop.png";

    let w = 640;
    let h = 480;
    let dpr = 1;
    const resize = () => {
      const rect = container.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.max(320, rect.width);
      h = Math.max(320, rect.height);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    const hexPath = (x: number, y: number, s: number) => {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 6 + (i * Math.PI) / 3;
        const px = x + s * Math.cos(a);
        const py = y + s * Math.sin(a);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
    };

    const drawOrb = (
      x: number,
      y: number,
      radius: number,
      color: string,
      squish = 1,
      alpha = 1
    ) => {
      if (radius <= 0.5) return;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x, y);
      ctx.scale(Math.max(0.06, squish), 1);
      ctx.shadowBlur = radius * 0.9;
      ctx.shadowColor = color;
      const g = ctx.createRadialGradient(
        -radius * 0.3,
        -radius * 0.35,
        radius * 0.08,
        0,
        0,
        radius
      );
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.32, color);
      g.addColorStop(1, "#070a16");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = color;
      ctx.stroke();
      ctx.restore();
    };

    let raf = 0;
    let last = performance.now();

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#04060f";
      ctx.fillRect(0, 0, w, h);
      if (backdrop.complete && backdrop.naturalWidth > 0) {
        const scale = Math.max(
          w / backdrop.naturalWidth,
          h / backdrop.naturalHeight
        );
        const bw = backdrop.naturalWidth * scale;
        const bh = backdrop.naturalHeight * scale;
        ctx.globalAlpha = 0.34;
        ctx.drawImage(backdrop, (w - bw) / 2, (h - bh) / 2, bw, bh);
        ctx.globalAlpha = 1;
      }

      const st = hexRef.current;
      if (!st) {
        ctx.fillStyle = "#94a3b8";
        ctx.font = "600 14px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Synchronising board…", w / 2, h / 2);
        raf = requestAnimationFrame(frame);
        return;
      }

      const R = st.radius;
      // Reserve room for the turn banner (top) and the hint box (bottom) so
      // neither overlaps the board.
      const topPad = 62;
      const bottomPad = 82;
      const usableH = Math.max(200, h - topPad - bottomPad);
      const size = Math.min(
        w / (SQRT3 * (2 * R + 2.4)),
        usableH / (1.5 * 2 * R + 2)
      );
      const cx = w / 2;
      const cy = topPad + usableH / 2;
      layoutRef.current = { size, cx, cy };
      const center = (key: string): [number, number] => {
        const [q, r] = parseHexKey(key);
        return [cx + size * SQRT3 * (q + r / 2), cy + size * 1.5 * r];
      };

      const sel = selectedRef.current;
      const hover = hoverRef.current;
      const seatIdx = mySeatRef.current;
      const myTurn =
        st.status === "playing" && seatIdx >= 0 && st.turn === seatIdx;
      const turnColor = st.seats[st.turn]?.color ?? "#22d3ee";

      // Halo in the colour of whoever is on turn
      const halo = ctx.createRadialGradient(
        cx,
        cy,
        size * 2,
        cx,
        cy,
        size * (R * 2 + 3)
      );
      halo.addColorStop(0, `${turnColor}2e`);
      halo.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, w, h);

      // Void cells
      for (let q = -R; q <= R; q++) {
        for (let r = Math.max(-R, -q - R); r <= Math.min(R, -q + R); r++) {
          const key = hexKey(q, r);
          if (st.cells[key] !== undefined) continue;
          const [x, y] = center(key);
          hexPath(x, y, size * 0.9);
          ctx.fillStyle = "rgba(2, 3, 8, 0.8)";
          ctx.fill();
          ctx.setLineDash([4, 5]);
          ctx.lineWidth = 1;
          ctx.strokeStyle = "rgba(236, 72, 153, 0.3)";
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // Playable cells
      const keys = Object.keys(st.cells);
      for (const key of keys) {
        const [x, y] = center(key);
        hexPath(x, y, size * 0.93);
        ctx.fillStyle = "rgba(12, 19, 40, 0.88)";
        ctx.fill();
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = "rgba(56, 189, 248, 0.22)";
        ctx.stroke();
      }

      // Legal targets for the selected orb
      if (sel && myTurn) {
        const color = st.seats[seatIdx].color;
        const pulse = 0.5 + 0.5 * Math.sin(now / 220);
        for (const key of keys) {
          if (st.cells[key] !== HEX_EMPTY) continue;
          const d = hexDistance(sel, key);
          if (d !== 1 && d !== 2) continue;
          const [x, y] = center(key);
          hexPath(x, y, size * 0.86);
          ctx.fillStyle = `${color}${d === 1 ? "44" : "1c"}`;
          ctx.fill();
          ctx.lineWidth = d === 1 ? 2.4 : 1.6;
          if (d === 2) ctx.setLineDash([6, 5]);
          ctx.strokeStyle = color;
          ctx.globalAlpha = 0.5 + pulse * 0.5;
          ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.setLineDash([]);

          if (hover === key) {
            hexPath(x, y, size * 0.93);
            ctx.lineWidth = 3;
            ctx.strokeStyle = "#ffffff";
            ctx.stroke();
            // Preview which enemy orbs this move would convert
            for (const nb of hexNeighbors(key)) {
              const owner = st.cells[nb];
              if (owner === undefined || owner < 0 || owner === seatIdx) continue;
              const [nx, ny] = center(nb);
              ctx.beginPath();
              ctx.arc(nx, ny, size * 0.7, 0, Math.PI * 2);
              ctx.lineWidth = 2.5;
              ctx.strokeStyle = color;
              ctx.stroke();
            }
          }
        }
      }

      // Last move marker
      if (st.lastMove) {
        const age = (now - lastMoveAtRef.current) / 1600;
        const [fx, fy] = center(st.lastMove.from);
        const [tx, ty] = center(st.lastMove.to);
        const c = st.seats[st.lastMove.seat]?.color ?? "#ffffff";
        ctx.save();
        ctx.globalAlpha = Math.max(0.3, 1 - age);
        ctx.strokeStyle = c;
        ctx.lineWidth = 3;
        if (st.lastMove.jump) ctx.setLineDash([8, 7]);
        ctx.shadowBlur = 12;
        ctx.shadowColor = c;
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.restore();
        hexPath(tx, ty, size * 0.93);
        ctx.lineWidth = 2;
        ctx.strokeStyle = c;
        ctx.globalAlpha = 0.65;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Orbs
      const orbR = size * 0.56;
      for (const key of keys) {
        const owner = st.cells[key];
        const [x, y] = center(key);
        const anim = animsRef.current.get(key);
        if (anim) {
          const t = (now - anim.start) / 480;
          if (t >= 1) {
            animsRef.current.delete(key);
          } else {
            if (anim.from >= 0 && anim.to >= 0) {
              // Flip: squash to a line, swap colour, expand again
              const squish = Math.abs(Math.cos(t * Math.PI));
              const c =
                st.seats[t < 0.5 ? anim.from : anim.to]?.color ?? "#ffffff";
              drawOrb(x, y, orbR * (1 + 0.25 * Math.sin(t * Math.PI)), c, squish);
            } else if (anim.to >= 0) {
              const s =
                t < 0.7 ? (t / 0.7) * 1.18 : 1.18 - ((t - 0.7) / 0.3) * 0.18;
              drawOrb(x, y, orbR * s, st.seats[anim.to]?.color ?? "#ffffff");
            } else if (anim.from >= 0) {
              drawOrb(
                x,
                y,
                orbR * (1 - t),
                st.seats[anim.from]?.color ?? "#ffffff",
                1,
                1 - t
              );
            }
            continue;
          }
        }
        if (owner < 0) continue;
        const breathe = 1 + 0.035 * Math.sin(now / 520 + x * 0.05 + y * 0.03);
        drawOrb(x, y, orbR * breathe, st.seats[owner]?.color ?? "#ffffff");
        if (key === sel) {
          ctx.beginPath();
          ctx.arc(x, y, orbR + 5, 0, Math.PI * 2);
          ctx.lineWidth = 3;
          ctx.strokeStyle = "#ffffff";
          ctx.stroke();
        } else if (myTurn && !sel && owner === seatIdx) {
          ctx.beginPath();
          ctx.arc(
            x,
            y,
            orbR + 4 + 2 * Math.sin(now / 260),
            0,
            Math.PI * 2
          );
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = "rgba(255,255,255,0.55)";
          ctx.stroke();
        }
      }

      // Conversion sparks
      const sparks = sparksRef.current;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = sparks.length - 1; i >= 0; i--) {
        const sp = sparks[i];
        sp.life -= dt;
        if (sp.life <= 0) {
          sparks.splice(i, 1);
          continue;
        }
        sp.x += sp.vx * dt;
        sp.y += sp.vy * dt;
        ctx.globalAlpha = Math.min(1, sp.life * 2);
        ctx.fillStyle = sp.color;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  const pixelToKey = (clientX: number, clientY: number): string | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const { size, cx, cy } = layoutRef.current;
    const px = clientX - rect.left - cx;
    const py = clientY - rect.top - cy;
    const qf = ((SQRT3 / 3) * px - py / 3) / size;
    const rf = ((2 / 3) * py) / size;
    const sf = -qf - rf;
    let rq = Math.round(qf);
    let rr = Math.round(rf);
    const rs = Math.round(sf);
    const dq = Math.abs(rq - qf);
    const dr = Math.abs(rr - rf);
    const ds = Math.abs(rs - sf);
    if (dq > dr && dq > ds) rq = -rr - rs;
    else if (dr > ds) rr = -rq - rs;
    return hexKey(rq, rr);
  };

  const handleMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const key = pixelToKey(e.clientX, e.clientY);
    const st = hexRef.current;
    hoverRef.current = key && st && st.cells[key] !== undefined ? key : null;
  };

  const handleClick = async (e: React.MouseEvent<HTMLCanvasElement>) => {
    const st = hexRef.current;
    if (!st || st.status !== "playing" || busyRef.current) return;
    const key = pixelToKey(e.clientX, e.clientY);
    if (!key || st.cells[key] === undefined) {
      setSelected(null);
      return;
    }
    const seat = mySeatRef.current;
    if (seat < 0) {
      setNotice("You are spectating — the first four pilots in the room are seated.");
      return;
    }
    if (st.turn !== seat) {
      setNotice("Wait for your turn.");
      return;
    }
    const owner = st.cells[key];
    if (owner === seat) {
      setSelected(key === selectedRef.current ? null : key);
      setNotice(null);
      return;
    }
    const from = selectedRef.current;
    if (!from) {
      setNotice("Select one of your own orbs first.");
      return;
    }
    if (owner !== HEX_EMPTY) {
      setNotice("That cell is occupied.");
      return;
    }
    const d = hexDistance(from, key);
    if (d !== 1 && d !== 2) {
      setNotice("Too far — clone 1 cell away or jump 2 cells away.");
      return;
    }

    busyRef.current = true;
    try {
      const res = await fetch(`/api/rooms/${room.code}/board`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: key }),
      });
      const data = (await res.json()) as {
        state?: HexState;
        serverNow?: number;
        error?: string;
      };
      if (res.ok && data.state) {
        if (typeof data.serverNow === "number") {
          clockOffsetRef.current = data.serverNow - Date.now();
        }
        applyIncoming(data.state);
        setNotice(null);
      } else {
        setNotice(data.error || "Move rejected.");
        setSelected(null);
      }
    } catch {
      setNotice("Network error — the move was not sent.");
    } finally {
      busyRef.current = false;
    }
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    soundFX.muted = next;
  };

  const counts = hex ? countPieces(hex) : [];
  const totalCells = hex ? Object.keys(hex.cells).length : 1;
  const turnSeat = hex ? hex.seats[hex.turn] : null;
  const myTurn = Boolean(hex && hex.status === "playing" && mySeat === hex.turn);
  const secondsLeft = Math.ceil(remainingMs / 1000);
  const ranking = hex
    ? hex.seats
        .map((s, i) => ({ seat: i, ...s, orbs: counts[i] ?? 0 }))
        .sort((a, b) => b.orbs - a.orbs)
    : [];

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full select-none overflow-hidden rounded-2xl border border-violet-400/25 bg-[#04060f]"
    >
      <canvas
        ref={canvasRef}
        className={`block h-full w-full ${
          myTurn ? "cursor-pointer" : "cursor-default"
        }`}
        onClick={(e) => void handleClick(e)}
        onMouseMove={handleMove}
        onMouseLeave={() => {
          hoverRef.current = null;
        }}
      />

      {/* Seats / score */}
      {hex && (
        <div className="pointer-events-none absolute left-3 top-3 w-56 space-y-1.5">
          {hex.seats.map((s, i) => {
            const onTurn = hex.status === "playing" && hex.turn === i;
            return (
              <div
                key={`${s.userId}-${i}`}
                className={`rounded-xl border px-3 py-2 backdrop-blur-md transition ${
                  onTurn
                    ? "border-white/60 bg-[#0b1226]/95"
                    : "border-white/10 bg-[#080d1e]/80"
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{
                        backgroundColor: s.color,
                        boxShadow: `0 0 8px ${s.color}`,
                      }}
                    />
                    <span className="truncate font-semibold text-white">
                      {s.username}
                    </span>
                    {s.isBot && <Bot className="h-3 w-3 shrink-0 text-slate-400" />}
                    {i === mySeat && (
                      <span className="shrink-0 text-[10px] text-cyan-300">YOU</span>
                    )}
                  </span>
                  <span className="font-mono font-bold text-white">
                    {counts[i] ?? 0}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.round(((counts[i] ?? 0) / totalCells) * 100)}%`,
                      backgroundColor: s.color,
                    }}
                  />
                </div>
              </div>
            );
          })}
          {mySeat < 0 && (
            <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#080d1e]/80 px-3 py-1.5 text-[11px] text-slate-300">
              <Eye className="h-3.5 w-3.5 text-cyan-300" />
              Spectating
            </div>
          )}
        </div>
      )}

      {/* Turn banner */}
      {hex && hex.status === "playing" && turnSeat && (
        <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2">
          <div
            className="flex items-center gap-3 rounded-xl border bg-[#080d1e]/90 px-4 py-2 backdrop-blur-md"
            style={{ borderColor: `${turnSeat.color}99` }}
          >
            <span
              className="font-display text-xs font-bold uppercase tracking-widest"
              style={{ color: turnSeat.color }}
            >
              {myTurn ? "Your turn" : `${turnSeat.username} is thinking`}
            </span>
            {!turnSeat.isBot && (
              <span
                className={`flex items-center gap-1 font-mono text-sm font-bold ${
                  secondsLeft <= 8 ? "text-rose-300" : "text-white"
                }`}
              >
                <Timer className="h-3.5 w-3.5" />
                {secondsLeft}s
              </span>
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={toggleMute}
        title={muted ? "Unmute SFX" : "Mute SFX"}
        className="absolute right-3 top-3 rounded-lg border border-white/15 bg-[#080d1e]/85 p-2 text-slate-300 backdrop-blur-md hover:border-violet-400/40 hover:text-white"
      >
        {muted ? (
          <VolumeX className="h-4 w-4 text-rose-400" />
        ) : (
          <Volume2 className="h-4 w-4 text-violet-300" />
        )}
      </button>

      {/* Hint / notice */}
      <div className="pointer-events-none absolute bottom-3 left-1/2 w-[min(92%,640px)] -translate-x-1/2 rounded-xl border border-white/10 bg-[#080d1e]/85 px-3.5 py-2 text-center text-[11px] text-slate-300 backdrop-blur-md">
        {notice ? (
          <span className="font-semibold text-amber-200">{notice}</span>
        ) : (
          <>
            <span className="font-semibold text-violet-300">Click your orb</span>,
            then a neighbouring cell to{" "}
            <span className="font-semibold text-cyan-300">clone</span> or a cell
            two away to <span className="font-semibold text-cyan-300">jump</span>.
            Landing converts every enemy orb touching that cell. If the 30s timer
            runs out, the server moves for you.
          </>
        )}
      </div>

      {/* Result */}
      {hex && hex.status === "finished" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-violet-400/40 bg-[#080d1e] p-6 text-center shadow-[0_0_60px_rgba(168,85,247,0.25)]">
            <Crown className="mx-auto mb-2 h-8 w-8 text-amber-400" />
            <h3 className="font-display text-xl font-bold tracking-wider text-white">
              {hex.winnerSeat === null
                ? "TIED GAME"
                : `${hex.seats[hex.winnerSeat].username.toUpperCase()} WINS`}
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              Final orb count. XP has been saved for seated players.
            </p>
            <div className="my-4 space-y-2 text-left">
              {ranking.map((row, i) => (
                <div
                  key={`${row.userId}-${row.seat}`}
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
                    {row.isBot && <Bot className="h-3 w-3 text-slate-400" />}
                  </span>
                  <span className="font-mono text-violet-200">{row.orbs} orbs</span>
                </div>
              ))}
            </div>
            {isHost ? (
              <button
                type="button"
                onClick={onReturnLobby}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-cyan-400 py-2.5 text-sm font-bold text-slate-950"
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
