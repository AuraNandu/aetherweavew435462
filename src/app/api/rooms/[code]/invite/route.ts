import { NextRequest } from "next/server";
import { db, rooms, roomInvites, users } from "@/db";
import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(
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
  const toUserId = Number(body.toUserId);

  if (!toUserId || toUserId === me.id) {
    return Response.json({ error: "Invalid target user." }, { status: 400 });
  }

  const [roomRow] = await db
    .select()
    .from(rooms)
    .where(eq(rooms.code, upperCode))
    .limit(1);

  if (!roomRow) {
    return Response.json({ error: "Room not found." }, { status: 404 });
  }

  const [targetUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, toUserId))
    .limit(1);

  if (!targetUser) {
    return Response.json({ error: "Friend not found." }, { status: 404 });
  }

  // Clear old pending invite for same room & user
  await db
    .update(roomInvites)
    .set({ status: "dismissed" })
    .where(
      and(
        eq(roomInvites.roomCode, upperCode),
        eq(roomInvites.toUserId, toUserId),
        eq(roomInvites.status, "pending")
      )
    );

  const [created] = await db
    .insert(roomInvites)
    .values({
      roomCode: upperCode,
      roomName: roomRow.name,
      fromUserId: me.id,
      toUserId,
      status: "pending",
    })
    .returning();

  return Response.json({ invite: created }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const me = await getCurrentUser({ touchPresence: true });
  if (!me) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const inviteId = Number(body.inviteId);
  const status = body.status === "accepted" ? "accepted" : "dismissed";

  if (!inviteId) {
    return Response.json({ error: "Missing inviteId" }, { status: 400 });
  }

  await db
    .update(roomInvites)
    .set({ status })
    .where(and(eq(roomInvites.id, inviteId), eq(roomInvites.toUserId, me.id)));

  return Response.json({ ok: true });
}
