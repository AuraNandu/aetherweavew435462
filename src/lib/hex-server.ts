import { db, gameStates, messages, roomParticipants, rooms, users } from "@/db";
import { and, asc, eq, sql } from "drizzle-orm";
import { AURA_PALETTES } from "./game-types";
import {
  HEX_BOT_THINK_MS,
  HEX_TURN_MS,
  applyHexMove,
  countPieces,
  createHexState,
  pickBotMove,
  type HexSeat,
  type HexState,
} from "./hex-game";
import { getRoomDetailByCode } from "./room-queries";
import { publishToRoom } from "./realtime-bus";

const HEX_GAME_ID = "hex_dominion";

/** Seats the first four pilots (by join order) and stores a fresh board. */
export async function initHexMatch(
  roomId: number,
  mapTheme: string,
  botFill: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      auraColor: users.auraColor,
    })
    .from(roomParticipants)
    .innerJoin(users, eq(roomParticipants.userId, users.id))
    .where(eq(roomParticipants.roomId, roomId))
    .orderBy(asc(roomParticipants.joinedAt))
    .limit(4);

  if (rows.length === 0) {
    return { ok: false, error: "No pilots are seated in this room." };
  }

  // Seat colours must be distinct or the orbs would be indistinguishable.
  const palette = AURA_PALETTES.map((a) => a.hex);
  const used = new Set<string>();
  const pickColor = (preferred: string) => {
    const color = !used.has(preferred)
      ? preferred
      : palette.find((p) => !used.has(p)) ?? preferred;
    used.add(color);
    return color;
  };

  const seats: HexSeat[] = rows.map((u) => ({
    userId: u.id,
    username: u.username,
    color: pickColor(u.auraColor),
    isBot: false,
  }));

  if (seats.length < 2) {
    if (!botFill) {
      return {
        ok: false,
        error:
          "Hex Dominion needs at least 2 players. Invite a friend or turn on AI Cyber-Bot Fill.",
      };
    }
    seats.push({
      userId: -1,
      username: "Bot_Vega",
      color: pickColor("#f59e0b"),
      isBot: true,
    });
  }

  const json = JSON.stringify(createHexState(seats, mapTheme, Date.now()));
  await db
    .insert(gameStates)
    .values({ roomId, version: 0, state: json })
    .onConflictDoUpdate({
      target: gameStates.roomId,
      set: { version: 0, state: json, updatedAt: new Date() },
    });

  return { ok: true };
}

async function loadState(roomId: number): Promise<HexState | null> {
  const [row] = await db
    .select()
    .from(gameStates)
    .where(eq(gameStates.roomId, roomId))
    .limit(1);
  if (!row) return null;
  try {
    return JSON.parse(row.state) as HexState;
  } catch {
    return null;
  }
}

/** Writes `next` only if nobody else has moved since `prevVersion` was read. */
async function saveState(
  roomId: number,
  prevVersion: number,
  next: HexState
): Promise<boolean> {
  const updated = await db
    .update(gameStates)
    .set({ state: JSON.stringify(next), version: next.v, updatedAt: new Date() })
    .where(
      and(eq(gameStates.roomId, roomId), eq(gameStates.version, prevVersion))
    )
    .returning({ id: gameStates.id });
  return updated.length > 0;
}

async function finalizeHex(
  roomId: number,
  code: string,
  state: HexState
): Promise<void> {
  // Claim the finish atomically so XP can only ever be awarded once.
  const claimed = await db
    .update(rooms)
    .set({ status: "finished", updatedAt: new Date() })
    .where(and(eq(rooms.id, roomId), eq(rooms.status, "playing")))
    .returning({ id: rooms.id });
  if (claimed.length === 0) return;

  const counts = countPieces(state);
  for (let i = 0; i < state.seats.length; i++) {
    const seat = state.seats[i];
    if (seat.userId <= 0) continue;
    const score = counts[i] * 25;
    const isWinner = state.winnerSeat === i;
    const earnedXp = Math.max(25, Math.floor(score / 10) + (isWinner ? 100 : 0));

    await db
      .update(roomParticipants)
      .set({ lastScore: score, lastKills: 0 })
      .where(
        and(
          eq(roomParticipants.roomId, roomId),
          eq(roomParticipants.userId, seat.userId)
        )
      );
    await db
      .update(users)
      .set({
        xp: sql`${users.xp} + ${earnedXp}`,
        wins: sql`${users.wins} + ${isWinner ? 1 : 0}`,
        matchesPlayed: sql`${users.matchesPlayed} + 1`,
      })
      .where(eq(users.id, seat.userId));
  }

  const summary =
    state.winnerSeat === null
      ? `Hex Dominion ended in a tie (${counts.join(" – ")}).`
      : `${state.seats[state.winnerSeat].username} won Hex Dominion ${counts.join(" – ")}.`;
  const [sysMsg] = await db
    .insert(messages)
    .values({
      channel: `room:${code}`,
      userId: null,
      senderName: "NEXUS SYSTEM",
      senderColor: "#a855f7",
      kind: "system",
      body: summary,
    })
    .returning();

  publishToRoom(code, {
    type: "chat",
    message: {
      id: sysMsg.id,
      channel: sysMsg.channel,
      userId: null,
      senderName: sysMsg.senderName,
      senderColor: sysMsg.senderColor,
      kind: "system",
      body: sysMsg.body,
      createdAt: new Date(sysMsg.createdAt).toISOString(),
    },
  });
  const detail = await getRoomDetailByCode(code);
  if (detail) publishToRoom(code, { type: "room_update", room: detail });
}

/**
 * Returns the current board. Also advances the game by at most one move when
 * one is due: a bot whose "thinking" delay has passed, a human whose 30s turn
 * timer ran out, or a human who has left the room (their seat goes on
 * autopilot). Advancing one move per call lets clients see bot moves one by one.
 */
export async function getHexState(code: string): Promise<HexState | null> {
  const [room] = await db
    .select()
    .from(rooms)
    .where(eq(rooms.code, code))
    .limit(1);
  if (!room || room.mode !== HEX_GAME_ID) return null;

  let state = await loadState(room.id);
  if (!state || state.status !== "playing") return state;

  const now = Date.now();
  const seat = state.seats[state.turn];
  if (!seat) return state;
  const elapsed = now - state.turnStartedAt;
  let working = state;
  let due = seat.isBot ? elapsed >= HEX_BOT_THINK_MS : elapsed >= HEX_TURN_MS;

  if (!seat.isBot && !due && elapsed >= 5000) {
    const [still] = await db
      .select({ id: roomParticipants.id })
      .from(roomParticipants)
      .where(
        and(
          eq(roomParticipants.roomId, room.id),
          eq(roomParticipants.userId, seat.userId)
        )
      )
      .limit(1);
    if (!still) {
      const turn = state.turn;
      working = {
        ...state,
        seats: state.seats.map((s, i) =>
          i === turn ? { ...s, isBot: true } : s
        ),
      };
      due = true;
    }
  }

  if (due) {
    const mv = pickBotMove(working, working.turn);
    const next = mv
      ? applyHexMove(working, working.turn, mv.from, mv.to, now, !seat.isBot)
      : null;
    if (next) {
      const saved = await saveState(room.id, state.v, next);
      if (saved) {
        state = next;
        if (next.status === "finished") {
          await finalizeHex(room.id, room.code, next);
        }
      } else {
        state = (await loadState(room.id)) ?? state;
      }
    }
  }
  return state;
}

export async function submitHexMove(
  code: string,
  userId: number,
  from: string,
  to: string
): Promise<{ state?: HexState; error?: string; status: number }> {
  const [room] = await db
    .select()
    .from(rooms)
    .where(eq(rooms.code, code))
    .limit(1);
  if (!room || room.mode !== HEX_GAME_ID) {
    return { error: "No Hex Dominion match in this room.", status: 404 };
  }

  const state = await loadState(room.id);
  if (!state) {
    return { error: "The match has not started yet.", status: 404 };
  }
  if (state.status !== "playing") {
    return { error: "The match is over.", status: 409 };
  }

  const seat = state.seats.findIndex((s) => s.userId === userId && !s.isBot);
  if (seat === -1) {
    return { error: "You are spectating this match.", status: 403 };
  }
  if (state.turn !== seat) {
    return { error: "It is not your turn.", status: 409 };
  }

  const next = applyHexMove(state, seat, from, to, Date.now());
  if (!next) {
    return { error: "Illegal move.", status: 400 };
  }

  const saved = await saveState(room.id, state.v, next);
  if (!saved) {
    return { error: "The board changed — try again.", status: 409 };
  }
  if (next.status === "finished") {
    await finalizeHex(room.id, room.code, next);
  }
  return { state: next, status: 200 };
}
