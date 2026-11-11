import { NextRequest } from "next/server";
import { db, friendships } from "@/db";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const me = await getCurrentUser({ touchPresence: true });
  if (!me) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const friendshipId = Number(body.friendshipId);
  const action = String(body.action || ""); // accept | decline | remove

  if (!friendshipId || !["accept", "decline", "remove"].includes(action)) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const [rel] = await db
    .select()
    .from(friendships)
    .where(eq(friendships.id, friendshipId))
    .limit(1);

  if (!rel) {
    return Response.json({ error: "Friendship not found." }, { status: 404 });
  }

  if (rel.requesterId !== me.id && rel.addresseeId !== me.id) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  if (action === "accept") {
    if (rel.addresseeId !== me.id) {
      return Response.json(
        { error: "Only the recipient can accept." },
        { status: 403 }
      );
    }
    await db
      .update(friendships)
      .set({ status: "accepted", updatedAt: new Date() })
      .where(eq(friendships.id, rel.id));
    return Response.json({ ok: true, status: "accepted" });
  }

  await db.delete(friendships).where(eq(friendships.id, rel.id));
  return Response.json({ ok: true, status: "removed" });
}
