import { db, friendships, roomInvites, users } from "@/db";
import { eq, or, and, desc } from "drizzle-orm";
import { getCurrentUser, sanitizeUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const me = await getCurrentUser({ touchPresence: true });
  if (!me) {
    return Response.json({
      friends: [],
      incomingRequests: [],
      outgoingRequests: [],
      roomInvites: [],
    });
  }

  const allFriendships = await db
    .select()
    .from(friendships)
    .where(
      or(
        eq(friendships.requesterId, me.id),
        eq(friendships.addresseeId, me.id)
      )
    )
    .orderBy(desc(friendships.updatedAt));

  const otherUserIds = new Set<number>();
  for (const f of allFriendships) {
    otherUserIds.add(f.requesterId === me.id ? f.addresseeId : f.requesterId);
  }

  const invites = await db
    .select()
    .from(roomInvites)
    .where(
      and(eq(roomInvites.toUserId, me.id), eq(roomInvites.status, "pending"))
    )
    .orderBy(desc(roomInvites.createdAt));

  for (const inv of invites) {
    otherUserIds.add(inv.fromUserId);
  }

  const userMap = new Map<number, ReturnType<typeof sanitizeUser>>();
  if (otherUserIds.size > 0) {
    const allUsers = await db.select().from(users);
    for (const u of allUsers) {
      if (otherUserIds.has(u.id)) {
        userMap.set(u.id, sanitizeUser(u));
      }
    }
  }

  const friends: Array<{
    friendshipId: number;
    user: ReturnType<typeof sanitizeUser>;
  }> = [];
  const incomingRequests: Array<{
    friendshipId: number;
    user: ReturnType<typeof sanitizeUser>;
    createdAt: string;
  }> = [];
  const outgoingRequests: Array<{
    friendshipId: number;
    user: ReturnType<typeof sanitizeUser>;
    createdAt: string;
  }> = [];

  for (const f of allFriendships) {
    const isRequester = f.requesterId === me.id;
    const otherId = isRequester ? f.addresseeId : f.requesterId;
    const other = userMap.get(otherId);
    if (!other) continue;

    if (f.status === "accepted") {
      friends.push({ friendshipId: f.id, user: other });
    } else if (f.status === "pending") {
      if (isRequester) {
        outgoingRequests.push({
          friendshipId: f.id,
          user: other,
          createdAt: new Date(f.createdAt).toISOString(),
        });
      } else {
        incomingRequests.push({
          friendshipId: f.id,
          user: other,
          createdAt: new Date(f.createdAt).toISOString(),
        });
      }
    }
  }

  const formattedInvites = invites
    .map((inv) => {
      const fromUser = userMap.get(inv.fromUserId);
      if (!fromUser) return null;
      return {
        id: inv.id,
        roomCode: inv.roomCode,
        roomName: inv.roomName,
        fromUsername: fromUser.username,
        fromAuraColor: fromUser.auraColor,
        createdAt: new Date(inv.createdAt).toISOString(),
      };
    })
    .filter(Boolean);

  return Response.json({
    friends,
    incomingRequests,
    outgoingRequests,
    roomInvites: formattedInvites,
  });
}
