import crypto from "crypto";
import { cookies } from "next/headers";
import { db, sessions, users } from "@/db";
import { eq, and, gt } from "drizzle-orm";
import type { PublicUser, ShipChassis } from "./game-types";

export const SESSION_COOKIE_NAME = "aether_session";
const SESSION_TTL_DAYS = 30;
const ONLINE_WINDOW_MS = 90_000;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, "hex");
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

export function hashToken(rawToken: string): string {
  const secret = process.env.AUTH_SECRET || "aetherweave-edge-secret-key-2026";
  return crypto
    .createHmac("sha256", secret)
    .update(rawToken)
    .digest("hex");
}

export function validateUsername(raw: string): {
  ok: boolean;
  username: string;
  error?: string;
} {
  const trimmed = raw.trim();
  if (trimmed.length < 3 || trimmed.length > 20) {
    return {
      ok: false,
      username: trimmed,
      error: "Username must be 3–20 characters long.",
    };
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return {
      ok: false,
      username: trimmed,
      error: "Use only letters, numbers, underscores (_), or hyphens (-).",
    };
  }
  return { ok: true, username: trimmed };
}

export function sanitizeUser(
  row: typeof users.$inferSelect
): PublicUser {
  const isOnline =
    Date.now() - new Date(row.lastSeenAt).getTime() < ONLINE_WINDOW_MS;
  return {
    id: row.id,
    username: row.username,
    shipChassis: (row.shipChassis as ShipChassis) || "valkyrie",
    auraColor: row.auraColor || "#22d3ee",
    bio: row.bio || "Orbital Rift Weaver",
    xp: row.xp,
    wins: row.wins,
    kills: row.kills,
    matchesPlayed: row.matchesPlayed,
    currentRoomCode: row.currentRoomCode,
    isOnline,
    lastSeenAt: new Date(row.lastSeenAt).toISOString(),
  };
}

export async function createSessionForUser(userId: number): Promise<void> {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(
    Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000
  );

  await db.insert(sessions).values({
    userId,
    tokenHash,
    expiresAt,
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE === "true",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroyCurrentSession(): Promise<void> {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (rawToken) {
    const tokenHash = hashToken(rawToken);
    await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
  }
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function getCurrentUser(options?: {
  touchPresence?: boolean;
}): Promise<PublicUser | null> {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!rawToken) return null;

  const tokenHash = hashToken(rawToken);
  const rows = await db
    .select({
      user: users,
      sessionId: sessions.id,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.tokenHash, tokenHash),
        gt(sessions.expiresAt, new Date())
      )
    )
    .limit(1);

  if (rows.length === 0) return null;

  let userRow = rows[0].user;

  if (options?.touchPresence !== false) {
    const ageMs = Date.now() - new Date(userRow.lastSeenAt).getTime();
    if (ageMs > 12_000) {
      const [updated] = await db
        .update(users)
        .set({ lastSeenAt: new Date() })
        .where(eq(users.id, userRow.id))
        .returning();
      if (updated) {
        userRow = updated;
      }
    }
  }

  return sanitizeUser(userRow);
}
