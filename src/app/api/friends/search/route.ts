import { NextRequest } from "next/server";
import { db, friendships, users } from "@/db";
import { ilike, ne, or, eq, desc } from "drizzle-orm";
import { getCurrentUser, sanitizeUser } from "@/lib/auth";
import { ensureSeedData } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await ensureSeedData();
  const me = await getCurrentUser({ touchPresence: false });
  const q = (req.nextUrl.searchParams.get("q") || "").trim();

  const query = me
    ? db
        .select()
        .from(users)
        .where(
          q
            ? ilike(users.username, `%${q}%`)
            : ne(users.id, me.id)
        )
        .orderBy(desc(users.lastSeenAt))
        .limit(20)
    : db
        .select()
        .from(users)
        .where(q ? ilike(users.username, `%${q}%`) : undefined)
        .orderBy(desc(users.lastSeenAt))
        .limit(20);

  const candidates = await query;

  const relationMap = new Map<
    number,
    { status: string; direction: "incoming" | "outgoing" | "none" }
  >();

  if (me) {
    const rows = await db
      .select()
      .from(friendships)
      .where(
        or(
          eq(friendships.requesterId, me.id),
          eq(friendships.addresseeId, me.id)
        )
      );
    for (const r of rows) {
      const isRequester = r.requesterId === me.id;
      const otherId = isRequester ? r.addresseeId : r.requesterId;
      relationMap.set(otherId, {
        status: r.status,
        direction: isRequester ? "outgoing" : "incoming",
      });
    }
  }

  const results = candidates
    .filter((u) => !me || u.id !== me.id)
    .map((u) => ({
      user: sanitizeUser(u),
      relation: relationMap.get(u.id) ?? {
        status: "none",
        direction: "none",
      },
    }));

  return Response.json({ results });
}
