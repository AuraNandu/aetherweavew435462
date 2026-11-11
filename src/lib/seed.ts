import { db, users, rooms, roomParticipants, messages } from "@/db";
import { eq, sql } from "drizzle-orm";
import { hashPassword } from "./auth";

const globalForSeed = globalThis as typeof globalThis & {
  __aetherSeedDone?: boolean;
  __aetherSeedPromise?: Promise<void>;
};

export async function ensureSeedData(): Promise<void> {
  if (globalForSeed.__aetherSeedDone) return;
  if (globalForSeed.__aetherSeedPromise) {
    return globalForSeed.__aetherSeedPromise;
  }

  globalForSeed.__aetherSeedPromise = (async () => {
    try {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(users);

      if (count === 0) {
        const demoPass = hashPassword("aether2026");

        const insertedUsers = await db
          .insert(users)
          .values([
            {
              username: "NovaValkyrie",
              usernameLower: "novavalkyrie",
              passwordHash: demoPass,
              shipChassis: "valkyrie",
              auraColor: "#22d3ee",
              bio: "Founder of the Nexus Crucible. Gravity slingshot specialist.",
              xp: 1480,
              wins: 12,
              kills: 47,
              matchesPlayed: 18,
              currentRoomCode: "AWNOVA",
              lastSeenAt: new Date(),
            },
            {
              username: "ApexZephyr",
              usernameLower: "apexzephyr",
              passwordHash: demoPass,
              shipChassis: "interceptor",
              auraColor: "#a855f7",
              bio: "Curve shots around binary pulsars or get shattered.",
              xp: 1120,
              wins: 8,
              kills: 34,
              matchesPlayed: 14,
              currentRoomCode: null,
              lastSeenAt: new Date(),
            },
            {
              username: "KaelenVex",
              usernameLower: "kaelenvex",
              passwordHash: demoPass,
              shipChassis: "mantis",
              auraColor: "#ec4899",
              bio: "Tether-grappling comet striker in the Outer Rift.",
              xp: 890,
              wins: 5,
              kills: 28,
              matchesPlayed: 11,
              currentRoomCode: null,
              lastSeenAt: new Date(Date.now() - 10 * 60 * 1000),
            },
          ])
          .onConflictDoNothing()
          .returning();

        const nova =
          insertedUsers.find((u) => u.usernameLower === "novavalkyrie") ??
          (
            await db
              .select()
              .from(users)
              .where(eq(users.usernameLower, "novavalkyrie"))
              .limit(1)
          )[0];

        if (nova) {
          const [existingRoom] = await db
            .select()
            .from(rooms)
            .where(eq(rooms.code, "AWNOVA"))
            .limit(1);

          let roomId = existingRoom?.id;
          if (!roomId) {
            const [createdRoom] = await db
              .insert(rooms)
              .values({
                code: "AWNOVA",
                name: "Nexus Crucible // Open Arena",
                hostId: nova.id,
                mode: "flux_harvest",
                mapTheme: "nebula_crucible",
                isPrivate: false,
                maxPlayers: 6,
                botFill: true,
                status: "lobby",
              })
              .onConflictDoNothing()
              .returning();
            roomId = createdRoom?.id;
          }

          if (roomId) {
            await db
              .insert(roomParticipants)
              .values({
                roomId,
                userId: nova.id,
                isReady: true,
                voiceEnabled: false,
                isMuted: false,
              })
              .onConflictDoNothing();
          }

          await db.insert(messages).values([
            {
              channel: "global",
              userId: nova.id,
              senderName: "NovaValkyrie",
              senderColor: "#22d3ee",
              kind: "chat",
              body: "Welcome to AETHERWEAVE! Join room AWNOVA or spin up your own Rift Arena — voice & text comms are online.",
            },
            {
              channel: "room:AWNOVA",
              userId: nova.id,
              senderName: "NovaValkyrie",
              senderColor: "#22d3ee",
              kind: "chat",
              body: "Drop in, click Join Voice if you have a mic, and launch the Crucible whenever ready!",
            },
          ]);
        }
      }

      globalForSeed.__aetherSeedDone = true;
    } catch (err) {
      console.error("Seed error:", err);
    } finally {
      globalForSeed.__aetherSeedPromise = undefined;
    }
  })();

  return globalForSeed.__aetherSeedPromise;
}
