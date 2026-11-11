import { NextRequest } from "next/server";
import { db, friendships, users } from "@/db";
import { and, eq, or } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const me = await getCurrentUser({ touchPresence: true });
  if (!me) {
    return Response.json({ error: "Please log in first." }, { status: 401 });
  }

  const body = await req.json();
  const targetUserId = body.targetUserId ? Number(body.targetUserId) : null;
  const targetUsername =
    typeof body.username === "string" ? body.username.trim().toLowerCase() : "";

  let target: typeof users.$inferSelect | undefined;
  if (targetUserId) {
    [target] = await db
      .select()
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1);
  } else if (targetUsername) {
    [target] = await db
      .select()
      .from(users)
      .where(eq(users.usernameLower, targetUsername))
      .limit(1);
  }

  if (!target) {
    return Response.json({ error: "Pilot not found." }, { status: 404 });
  }

  if (target.id === me.id) {
    return Response.json(
      { error: "You cannot send a friend request to yourself." },
      { status: 400 }
    );
  }

  const existing = await db
    .select()
    .from(friendships)
    .where(
      or(
        and(
          eq(friendships.requesterId, me.id),
          eq(friendships.addresseeId, target.id)
        ),
        and(
          eq(friendships.requesterId, target.id),
          eq(friendships.addresseeId, me.id)
        )
      )
    )
    .limit(1);

  if (existing.length > 0) {
    const rel = existing[0];
    if (rel.status === "accepted") {
      return Response.json({ error: "Already friends with this pilot." }, { status: 409 });
    }
    if (rel.status === "pending") {
      // If they already requested us, auto-accept!
      if (rel.requesterId === target.id) {
        await db
          .update(friendships)
          .set({ status: "accepted", updatedAt: new Date() })
          .where(eq(friendships.id, rel.id));
        return Response.json({ ok: true, status: "accepted" });
      }
      return Response.json(
        { error: "Friend request already sent." },
        { status: 409 }
      );
    }

    // Re-open declined request
    await db
      .update(friendships)
      .set({
        requesterId: me.id,
        addresseeId: target.id,
        status: "pending",
        updatedAt: new Date(),
      })
      .where(eq(friendships.id, rel.id));

    return Response.json({ ok: true, status: "pending" });
  }

  await db.insert(friendships).values({
    requesterId: me.id,
    addresseeId: target.id,
    status: "pending",
  });

  return Response.json({ ok: true, status: "pending" }, { status: 201 });
}
