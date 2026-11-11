import crypto from "crypto";
import { db, rooms, roomParticipants, users } from "@/db";
import { eq, asc } from "drizzle-orm";
import type {
  GameMode,
  MapTheme,
  RoomDetailDTO,
  RoomParticipantDTO,
  ShipChassis,
} from "./game-types";

export function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "AW";
  const bytes = crypto.randomBytes(4);
  for (let i = 0; i < 4; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

export async function getRoomDetailByCode(
  rawCode: string
): Promise<RoomDetailDTO | null> {
  const code = rawCode.trim().toUpperCase();
  const roomRows = await db
    .select({
      room: rooms,
      hostUsername: users.username,
    })
    .from(rooms)
    .innerJoin(users, eq(rooms.hostId, users.id))
    .where(eq(rooms.code, code))
    .limit(1);

  if (roomRows.length === 0) return null;

  const { room, hostUsername } = roomRows[0];

  const participantRows = await db
    .select({
      participant: roomParticipants,
      user: users,
    })
    .from(roomParticipants)
    .innerJoin(users, eq(roomParticipants.userId, users.id))
    .where(eq(roomParticipants.roomId, room.id))
    .orderBy(asc(roomParticipants.joinedAt));

  const participants: RoomParticipantDTO[] = participantRows.map(
    ({ participant, user }) => ({
      userId: user.id,
      username: user.username,
      shipChassis: (user.shipChassis as ShipChassis) || "valkyrie",
      auraColor: user.auraColor || "#22d3ee",
      isReady: participant.isReady,
      voiceEnabled: participant.voiceEnabled,
      isMuted: participant.isMuted,
      team: participant.team,
      lastScore: participant.lastScore,
      lastKills: participant.lastKills,
      xp: user.xp,
      wins: user.wins,
    })
  );

  return {
    id: room.id,
    code: room.code,
    name: room.name,
    hostId: room.hostId,
    hostUsername,
    mode: (room.mode as GameMode) || "flux_harvest",
    mapTheme: (room.mapTheme as MapTheme) || "nebula_crucible",
    isPrivate: room.isPrivate,
    maxPlayers: room.maxPlayers,
    botFill: room.botFill,
    status: (room.status as "lobby" | "playing" | "finished") || "lobby",
    matchStartedAt: room.matchStartedAt
      ? new Date(room.matchStartedAt).toISOString()
      : null,
    participants,
  };
}
