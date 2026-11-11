import { NextRequest } from "next/server";
import { db, rooms, roomParticipants, users, messages } from "@/db";
import { eq, desc } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { ensureSeedData } from "@/lib/seed";
import { generateRoomCode, getRoomDetailByCode } from "@/lib/room-queries";
import { GAME_MODES, MAP_THEMES } from "@/lib/game-types";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureSeedData();

  const publicRooms = await db
    .select({
      room: rooms,
      hostUsername: users.username,
      hostColor: users.auraColor,
    })
    .from(rooms)
    .innerJoin(users, eq(rooms.hostId, users.id))
    .where(eq(rooms.isPrivate, false))
    .orderBy(desc(rooms.updatedAt))
    .limit(24);

  const allParticipants = await db.select().from(roomParticipants);
  const countByRoom = new Map<number, number>();
  const voiceCountByRoom = new Map<number, number>();
  for (const p of allParticipants) {
    countByRoom.set(p.roomId, (countByRoom.get(p.roomId) || 0) + 1);
    if (p.voiceEnabled) {
      voiceCountByRoom.set(p.roomId, (voiceCountByRoom.get(p.roomId) || 0) + 1);
    }
  }

  return Response.json({
    rooms: publicRooms.map(({ room, hostUsername, hostColor }) => ({
      id: room.id,
      code: room.code,
      name: room.name,
      hostId: room.hostId,
      hostUsername,
      hostColor,
      mode: room.mode,
      mapTheme: room.mapTheme,
      maxPlayers: room.maxPlayers,
      botFill: room.botFill,
      status: room.status,
      playerCount: countByRoom.get(room.id) || 0,
      voiceCount: voiceCountByRoom.get(room.id) || 0,
      updatedAt: new Date(room.updatedAt).toISOString(),
    })),
  });
}

export async function POST(req: NextRequest) {
  const me = await getCurrentUser({ touchPresence: true });
  if (!me) {
    return Response.json(
      { error: "Please sign in to create a room." },
      { status: 401 }
    );
  }

  const body = await req.json();
  const name =
    String(body.name ?? "").trim().slice(0, 48) ||
    `${me.username}'s Rift Arena`;
  const mode = GAME_MODES.some((m) => m.id === body.mode)
    ? String(body.mode)
    : "flux_harvest";
  const mapTheme = MAP_THEMES.some((m) => m.id === body.mapTheme)
    ? String(body.mapTheme)
    : "nebula_crucible";
  const isPrivate = Boolean(body.isPrivate);
  const botFill = body.botFill === undefined ? true : Boolean(body.botFill);
  const maxPlayers = Math.min(6, Math.max(2, Number(body.maxPlayers) || 6));

  let code = generateRoomCode();
  for (let i = 0; i < 5; i++) {
    const exists = await db
      .select({ id: rooms.id })
      .from(rooms)
      .where(eq(rooms.code, code))
      .limit(1);
    if (exists.length === 0) break;
    code = generateRoomCode();
  }

  const [created] = await db
    .insert(rooms)
    .values({
      code,
      name,
      hostId: me.id,
      mode,
      mapTheme,
      isPrivate,
      maxPlayers,
      botFill,
      status: "lobby",
    })
    .returning();

  await db
    .insert(roomParticipants)
    .values({
      roomId: created.id,
      userId: me.id,
      isReady: true,
    })
    .onConflictDoNothing();

  await db
    .update(users)
    .set({ currentRoomCode: created.code, lastSeenAt: new Date() })
    .where(eq(users.id, me.id));

  await db.insert(messages).values({
    channel: `room:${created.code}`,
    userId: null,
    senderName: "NEXUS SYSTEM",
    senderColor: "#22d3ee",
    kind: "system",
    body: `${me.username} forged room ${created.code} (${name}). Share the code or invite friends!`,
  });

  const detail = await getRoomDetailByCode(created.code);
  return Response.json({ room: detail }, { status: 201 });
}
