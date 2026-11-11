import { NextRequest } from "next/server";
import { db, messages, users } from "@/db";
import { eq, desc, gt, sql } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { ensureSeedData } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureSeedData();
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.channel, "global"))
    .orderBy(desc(messages.createdAt))
    .limit(50);

  const onlineCutoff = new Date(Date.now() - 90_000);
  const [{ onlineCount }] = await db
    .select({ onlineCount: sql<number>`count(*)::int` })
    .from(users)
    .where(gt(users.lastSeenAt, onlineCutoff));

  return Response.json({
    onlineCount: Math.max(onlineCount, 1),
    messages: rows.reverse().map((m) => ({
      id: m.id,
      channel: m.channel,
      userId: m.userId,
      senderName: m.senderName,
      senderColor: m.senderColor,
      kind: m.kind,
      body: m.body,
      createdAt: new Date(m.createdAt).toISOString(),
    })),
  });
}

export async function POST(req: NextRequest) {
  const me = await getCurrentUser({ touchPresence: true });
  if (!me) {
    return Response.json({ error: "Sign in to chat." }, { status: 401 });
  }

  const body = await req.json();
  const text = String(body.body ?? "").trim();
  if (!text) {
    return Response.json({ error: "Message cannot be empty." }, { status: 400 });
  }

  const [created] = await db
    .insert(messages)
    .values({
      channel: "global",
      userId: me.id,
      senderName: me.username,
      senderColor: me.auraColor,
      kind: "chat",
      body: text.slice(0, 320),
    })
    .returning();

  return Response.json(
    {
      message: {
        id: created.id,
        channel: created.channel,
        userId: created.userId,
        senderName: created.senderName,
        senderColor: created.senderColor,
        kind: created.kind,
        body: created.body,
        createdAt: new Date(created.createdAt).toISOString(),
      },
    },
    { status: 201 }
  );
}
