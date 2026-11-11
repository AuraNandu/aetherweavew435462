import { NextRequest } from "next/server";
import { db, rooms, roomParticipants, users, messages } from "@/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { ensureSeedData } from "@/lib/seed";
import { getRoomDetailByCode } from "@/lib/room-queries";
import {
  getActivePlayerStates,
  publishToRoom,
  removePlayerState,
} from "@/lib/realtime-bus";
import { GAME_MODES, MAP_THEMES } from "@/lib/game-types";
import { initHexMatch } from "@/lib/hex-server";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ code: string }> }
) {
  await ensureSeedData();
  const { code } = await context.params;
  const upperCode = code.trim().toUpperCase();
  const room = await getRoomDetailByCode(upperCode);

  if (!room) {
    return Response.json({ error: "Room not found." }, { status: 404 });
  }

  const chatRows = await db
    .select()
    .from(messages)
    .where(eq(messages.channel, `room:${upperCode}`))
    .orderBy(desc(messages.createdAt))
    .limit(60);

  return Response.json({
    room,
    messages: chatRows.reverse().map((m) => ({
      id: m.id,
      channel: m.channel,
      userId: m.userId,
      senderName: m.senderName,
      senderColor: m.senderColor,
      kind: m.kind,
      body: m.body,
      createdAt: new Date(m.createdAt).toISOString(),
    })),
    states: getActivePlayerStates(upperCode),
  });
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ code: string }> }
) {
  const me = await getCurrentUser({ touchPresence: true });
  if (!me) {
    return Response.json({ error: "Please sign in first." }, { status: 401 });
  }

  const { code } = await context.params;
  const upperCode = code.trim().toUpperCase();
  const body = await req.json();
  const action = String(body.action || "join");

  const [roomRow] = await db
    .select()
    .from(rooms)
    .where(eq(rooms.code, upperCode))
    .limit(1);

  if (!roomRow) {
    return Response.json({ error: "Room not found." }, { status: 404 });
  }

  if (action === "join") {
    const existing = await db
      .select()
      .from(roomParticipants)
      .where(
        and(
          eq(roomParticipants.roomId, roomRow.id),
          eq(roomParticipants.userId, me.id)
        )
      )
      .limit(1);

    if (existing.length === 0) {
      const currentCount = await db
        .select({ id: roomParticipants.id })
        .from(roomParticipants)
        .where(eq(roomParticipants.roomId, roomRow.id));

      if (currentCount.length >= roomRow.maxPlayers) {
        return Response.json({ error: "Room is full." }, { status: 409 });
      }

      await db.insert(roomParticipants).values({
        roomId: roomRow.id,
        userId: me.id,
        isReady: roomRow.hostId === me.id,
      });

      const [sysMsg] = await db
        .insert(messages)
        .values({
          channel: `room:${upperCode}`,
          userId: null,
          senderName: "NEXUS SYSTEM",
          senderColor: me.auraColor,
          kind: "system",
          body: `${me.username} warped into the room.`,
        })
        .returning();

      publishToRoom(upperCode, {
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
    } else {
      await db
        .update(roomParticipants)
        .set({ lastHeartbeatAt: new Date() })
        .where(eq(roomParticipants.id, existing[0].id));
    }

    await db
      .update(users)
      .set({ currentRoomCode: upperCode, lastSeenAt: new Date() })
      .where(eq(users.id, me.id));

    await db
      .update(rooms)
      .set({ updatedAt: new Date() })
      .where(eq(rooms.id, roomRow.id));

    const detail = await getRoomDetailByCode(upperCode);
    if (detail) {
      publishToRoom(upperCode, { type: "room_update", room: detail });
    }
    return Response.json({ room: detail });
  }

  if (action === "toggle_ready") {
    const [participant] = await db
      .select()
      .from(roomParticipants)
      .where(
        and(
          eq(roomParticipants.roomId, roomRow.id),
          eq(roomParticipants.userId, me.id)
        )
      )
      .limit(1);

    if (!participant) {
      return Response.json({ error: "Not in room." }, { status: 400 });
    }

    await db
      .update(roomParticipants)
      .set({ isReady: !participant.isReady, lastHeartbeatAt: new Date() })
      .where(eq(roomParticipants.id, participant.id));

    const detail = await getRoomDetailByCode(upperCode);
    if (detail) {
      publishToRoom(upperCode, { type: "room_update", room: detail });
    }
    return Response.json({ room: detail });
  }

  if (action === "leave") {
    await db
      .delete(roomParticipants)
      .where(
        and(
          eq(roomParticipants.roomId, roomRow.id),
          eq(roomParticipants.userId, me.id)
        )
      );

    await db
      .update(users)
      .set({ currentRoomCode: null, lastSeenAt: new Date() })
      .where(eq(users.id, me.id));

    removePlayerState(upperCode, me.id);

    const remaining = await db
      .select()
      .from(roomParticipants)
      .where(eq(roomParticipants.roomId, roomRow.id));

    if (remaining.length > 0 && roomRow.hostId === me.id) {
      await db
        .update(rooms)
        .set({ hostId: remaining[0].userId, updatedAt: new Date() })
        .where(eq(rooms.id, roomRow.id));
    }

    const [sysMsg] = await db
      .insert(messages)
      .values({
        channel: `room:${upperCode}`,
        userId: null,
        senderName: "NEXUS SYSTEM",
        senderColor: "#94a3b8",
        kind: "system",
        body: `${me.username} left the room.`,
      })
      .returning();

    publishToRoom(upperCode, {
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

    const detail = await getRoomDetailByCode(upperCode);
    if (detail) {
      publishToRoom(upperCode, { type: "room_update", room: detail });
    }

    return Response.json({ ok: true });
  }

  return Response.json({ error: "Unknown action." }, { status: 400 });
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ code: string }> }
) {
  const me = await getCurrentUser({ touchPresence: true });
  if (!me) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { code } = await context.params;
  const upperCode = code.trim().toUpperCase();
  const body = await req.json();
  const action = String(body.action || "update_settings");

  const [roomRow] = await db
    .select()
    .from(rooms)
    .where(eq(rooms.code, upperCode))
    .limit(1);

  if (!roomRow) {
    return Response.json({ error: "Room not found." }, { status: 404 });
  }

  if (action === "update_settings") {
    if (roomRow.hostId !== me.id) {
      return Response.json(
        { error: "Only the room host can update settings." },
        { status: 403 }
      );
    }

    const updates: Partial<typeof rooms.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (
      typeof body.mode === "string" &&
      GAME_MODES.some((m) => m.id === body.mode)
    ) {
      updates.mode = body.mode;
    }
    if (
      typeof body.mapTheme === "string" &&
      MAP_THEMES.some((m) => m.id === body.mapTheme)
    ) {
      updates.mapTheme = body.mapTheme;
    }
    if (typeof body.botFill === "boolean") {
      updates.botFill = body.botFill;
    }
    if (typeof body.isPrivate === "boolean") {
      updates.isPrivate = body.isPrivate;
    }

    await db.update(rooms).set(updates).where(eq(rooms.id, roomRow.id));
    const detail = await getRoomDetailByCode(upperCode);
    if (detail) {
      publishToRoom(upperCode, { type: "room_update", room: detail });
    }
    return Response.json({ room: detail });
  }

  if (action === "start_match") {
    if (roomRow.hostId !== me.id) {
      return Response.json(
        { error: "Only the room host can launch the match." },
        { status: 403 }
      );
    }

    // Hex Dominion is server-authoritative: seat the players and store a fresh board first.
    if (roomRow.mode === "hex_dominion") {
      const init = await initHexMatch(
        roomRow.id,
        roomRow.mapTheme,
        roomRow.botFill
      );
      if (!init.ok) {
        return Response.json({ error: init.error }, { status: 400 });
      }
    }

    await db
      .update(rooms)
      .set({
        status: "playing",
        matchStartedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(rooms.id, roomRow.id));

    const [sysMsg] = await db
      .insert(messages)
      .values({
        channel: `room:${upperCode}`,
        userId: null,
        senderName: "NEXUS SYSTEM",
        senderColor: "#22d3ee",
        kind: "system",
        body: `Arena Launch initiated by ${me.username}! All pilots deploy!`,
      })
      .returning();

    publishToRoom(upperCode, {
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

    const detail = await getRoomDetailByCode(upperCode);
    if (detail) {
      publishToRoom(upperCode, { type: "room_update", room: detail });
    }
    publishToRoom(upperCode, {
      type: "event",
      event: {
        kind: "match_start",
        senderId: me.id,
        senderName: me.username,
        data: { startedAt: Date.now() },
        ts: Date.now(),
      },
    });

    return Response.json({ room: detail });
  }

  if (action === "finish_match") {
    const standings = Array.isArray(body.standings)
      ? (body.standings as Array<{
          userId: number;
          score: number;
          kills: number;
        }>)
      : [];

    if (roomRow.mode === "hex_dominion") {
      return Response.json(
        { error: "Hex Dominion results are decided by the server." },
        { status: 400 }
      );
    }

    const memberRows = await db
      .select({ userId: roomParticipants.userId })
      .from(roomParticipants)
      .where(eq(roomParticipants.roomId, roomRow.id));
    const memberIds = new Set(memberRows.map((m) => m.userId));
    if (!memberIds.has(me.id)) {
      return Response.json(
        { error: "Only pilots in this room can report a result." },
        { status: 403 }
      );
    }
    const awarded = new Set<number>();
    for (const s of standings) {
      s.score = Math.max(0, Math.min(20000, Number(s.score) || 0));
      s.kills = Math.max(0, Math.min(200, Number(s.kills) || 0));
    }

    // Claim the finish atomically so two clients reporting at once cannot double-award XP.
    const claimed = await db
      .update(rooms)
      .set({ status: "finished", updatedAt: new Date() })
      .where(and(eq(rooms.id, roomRow.id), eq(rooms.status, "playing")))
      .returning({ id: rooms.id });

    if (claimed.length > 0) {

      const topScore = standings.reduce((m, s) => Math.max(m, s.score || 0), 0);

      for (const s of standings) {
        if (s.userId > 0 && memberIds.has(s.userId) && !awarded.has(s.userId)) {
          awarded.add(s.userId);
          const isWinner = s.score > 0 && s.score === topScore;
          const earnedXp = Math.max(25, Math.floor((s.score || 0) / 10) + (isWinner ? 100 : 0));

          await db
            .update(roomParticipants)
            .set({
              lastScore: Math.floor(s.score || 0),
              lastKills: Math.floor(s.kills || 0),
            })
            .where(
              and(
                eq(roomParticipants.roomId, roomRow.id),
                eq(roomParticipants.userId, s.userId)
              )
            );

          await db
            .update(users)
            .set({
              xp: sql`${users.xp} + ${earnedXp}`,
              kills: sql`${users.kills} + ${Math.max(0, Math.floor(s.kills || 0))}`,
              wins: sql`${users.wins} + ${isWinner ? 1 : 0}`,
              matchesPlayed: sql`${users.matchesPlayed} + 1`,
            })
            .where(eq(users.id, s.userId));
        }
      }
    }

    const detail = await getRoomDetailByCode(upperCode);
    if (detail) {
      publishToRoom(upperCode, { type: "room_update", room: detail });
    }
    publishToRoom(upperCode, {
      type: "event",
      event: {
        kind: "match_end",
        senderId: me.id,
        data: { standings },
        ts: Date.now(),
      },
    });

    return Response.json({ room: detail });
  }

  if (action === "reset_lobby") {
    if (roomRow.hostId !== me.id) {
      return Response.json(
        { error: "Only host can return room to lobby." },
        { status: 403 }
      );
    }

    await db
      .update(rooms)
      .set({
        status: "lobby",
        matchStartedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(rooms.id, roomRow.id));

    const detail = await getRoomDetailByCode(upperCode);
    if (detail) {
      publishToRoom(upperCode, { type: "room_update", room: detail });
    }
    return Response.json({ room: detail });
  }

  return Response.json({ error: "Invalid action." }, { status: 400 });
}
