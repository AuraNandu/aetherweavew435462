import { db, messages } from "@/db";
import { desc, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { ensureSeedData } from "@/lib/seed";
import { getRoomDetailByCode } from "@/lib/room-queries";
import { RoomClient } from "@/components/RoomClient";

export const dynamic = "force-dynamic";

export default async function RoomPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  await ensureSeedData();
  const { code } = await params;
  const upperCode = code.trim().toUpperCase();

  const [user, room] = await Promise.all([
    getCurrentUser({ touchPresence: true }),
    getRoomDetailByCode(upperCode),
  ]);

  const chatRows = room
    ? await db
        .select()
        .from(messages)
        .where(eq(messages.channel, `room:${upperCode}`))
        .orderBy(desc(messages.createdAt))
        .limit(60)
    : [];

  const initialMessages = chatRows.reverse().map((m) => ({
    id: m.id,
    channel: m.channel,
    userId: m.userId,
    senderName: m.senderName,
    senderColor: m.senderColor,
    kind: m.kind as "chat" | "system" | "emote",
    body: m.body,
    createdAt: new Date(m.createdAt).toISOString(),
  }));

  return (
    <RoomClient
      initialUser={user}
      initialRoom={room}
      initialMessages={initialMessages}
      roomCode={upperCode}
    />
  );
}
