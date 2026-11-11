import { NextRequest } from "next/server";
import { db, messages, roomParticipants, rooms, rtcSignals } from "@/db";
import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { publishToRoom, upsertPlayerState } from "@/lib/realtime-bus";
import type { PlayerNetState, RoomEventPayload } from "@/lib/game-types";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ code: string }> }
) {
  const me = await getCurrentUser({ touchPresence: false });
  if (!me) {
    return Response.json({ signals: [] });
  }
  const { code } = await context.params;
  const upperCode = code.trim().toUpperCase();

  const pending = await db
    .select()
    .from(rtcSignals)
    .where(
      and(
        eq(rtcSignals.roomCode, upperCode),
        eq(rtcSignals.toUserId, me.id),
        eq(rtcSignals.consumed, false)
      )
    );

  if (pending.length > 0) {
    await db
      .update(rtcSignals)
      .set({ consumed: true })
      .where(
        and(
          eq(rtcSignals.roomCode, upperCode),
          eq(rtcSignals.toUserId, me.id),
          eq(rtcSignals.consumed, false)
        )
      );
  }

  return Response.json({
    signals: pending.map((s) => ({
      fromUserId: s.fromUserId,
      toUserId: s.toUserId,
      signalType: s.signalType,
      payload: s.payload,
    })),
  });
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ code: string }> }
) {
  const me = await getCurrentUser({ touchPresence: false });
  if (!me) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { code } = await context.params;
  const upperCode = code.trim().toUpperCase();
  const body = await req.json();
  const type = String(body.type || "");

  if (type === "player_state" && body.state) {
    const incoming = body.state as PlayerNetState;
    const sanitized: PlayerNetState = {
      ...incoming,
      userId: me.id,
      username: me.username,
      shipChassis: me.shipChassis,
      auraColor: me.auraColor,
      updatedAt: Date.now(),
    };
    upsertPlayerState(upperCode, sanitized);
    publishToRoom(upperCode, { type: "player_state", state: sanitized });
    return Response.json({ ok: true });
  }

  if (type === "bot_states" && Array.isArray(body.states)) {
    const botStates = (body.states as PlayerNetState[]).map((s) => ({
      ...s,
      isBot: true,
      updatedAt: Date.now(),
    }));
    for (const bs of botStates) {
      upsertPlayerState(upperCode, bs);
    }
    publishToRoom(upperCode, { type: "bot_states", states: botStates });
    return Response.json({ ok: true });
  }

  if (type === "event" && body.event) {
    const ev = body.event as RoomEventPayload;
    publishToRoom(upperCode, {
      type: "event",
      event: {
        ...ev,
        senderId: me.id,
        senderName: me.username,
        ts: Date.now(),
      },
    });
    return Response.json({ ok: true });
  }

  if (type === "chat") {
    const text = String(body.body ?? "").trim();
    const kind = body.kind === "emote" ? "emote" : "chat";
    if (!text) {
      return Response.json({ error: "Empty message" }, { status: 400 });
    }

    const [created] = await db
      .insert(messages)
      .values({
        channel: `room:${upperCode}`,
        userId: me.id,
        senderName: me.username,
        senderColor: me.auraColor,
        kind,
        body: text.slice(0, 320),
      })
      .returning();

    const dto = {
      id: created.id,
      channel: created.channel,
      userId: created.userId,
      senderName: created.senderName,
      senderColor: created.senderColor,
      kind: created.kind as "chat" | "system" | "emote",
      body: created.body,
      createdAt: new Date(created.createdAt).toISOString(),
    };

    publishToRoom(upperCode, { type: "chat", message: dto });
    return Response.json({ message: dto }, { status: 201 });
  }

  if (type === "voice_state") {
    const voiceEnabled = Boolean(body.voiceEnabled);
    const isMuted = Boolean(body.isMuted);
    const speaking = Boolean(body.speaking);

    const [roomRow] = await db
      .select({ id: rooms.id })
      .from(rooms)
      .where(eq(rooms.code, upperCode))
      .limit(1);

    if (roomRow) {
      await db
        .update(roomParticipants)
        .set({
          voiceEnabled,
          isMuted,
          lastHeartbeatAt: new Date(),
        })
        .where(
          and(
            eq(roomParticipants.roomId, roomRow.id),
            eq(roomParticipants.userId, me.id)
          )
        );
    }

    publishToRoom(upperCode, {
      type: "voice_state",
      userId: me.id,
      voiceEnabled,
      isMuted,
      speaking,
    });
    return Response.json({ ok: true });
  }

  if (type === "rtc_signal") {
    const toUserId = Number(body.toUserId);
    const signalType = body.signalType as "offer" | "answer" | "ice";
    const payload = String(body.payload ?? "");

    if (
      !toUserId ||
      !["offer", "answer", "ice"].includes(signalType) ||
      !payload
    ) {
      return Response.json({ error: "Invalid RTC signal" }, { status: 400 });
    }

    await db.insert(rtcSignals).values({
      roomCode: upperCode,
      fromUserId: me.id,
      toUserId,
      signalType,
      payload,
      consumed: false,
    });

    publishToRoom(upperCode, {
      type: "rtc_signal",
      fromUserId: me.id,
      toUserId,
      signalType,
      payload,
    });

    return Response.json({ ok: true });
  }

  return Response.json({ error: "Unsupported sync packet" }, { status: 400 });
}
