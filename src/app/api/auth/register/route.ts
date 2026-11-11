import { NextRequest } from "next/server";
import { db, users } from "@/db";
import { eq } from "drizzle-orm";
import {
  createSessionForUser,
  hashPassword,
  sanitizeUser,
  validateUsername,
} from "@/lib/auth";
import { ensureSeedData } from "@/lib/seed";
import { AURA_PALETTES, SHIP_CHASSIS_LIST } from "@/lib/game-types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    await ensureSeedData();
    const body = await req.json();
    const rawUsername = String(body.username ?? "");
    const password = String(body.password ?? "");
    const shipChassis = String(body.shipChassis ?? "valkyrie");
    const auraColor = String(body.auraColor ?? "#22d3ee");

    const validation = validateUsername(rawUsername);
    if (!validation.ok) {
      return Response.json({ error: validation.error }, { status: 400 });
    }
    if (password.length < 6) {
      return Response.json(
        { error: "Password must be at least 6 characters." },
        { status: 400 }
      );
    }

    const lower = validation.username.toLowerCase();
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.usernameLower, lower))
      .limit(1);

    if (existing.length > 0) {
      return Response.json(
        { error: "That unique username is already claimed by another pilot." },
        { status: 409 }
      );
    }

    const validChassis = SHIP_CHASSIS_LIST.some((c) => c.id === shipChassis)
      ? shipChassis
      : "valkyrie";
    const validAura = AURA_PALETTES.some((a) => a.hex === auraColor)
      ? auraColor
      : "#22d3ee";

    const [created] = await db
      .insert(users)
      .values({
        username: validation.username,
        usernameLower: lower,
        passwordHash: hashPassword(password),
        shipChassis: validChassis,
        auraColor: validAura,
        lastSeenAt: new Date(),
      })
      .returning();

    await createSessionForUser(created.id);
    return Response.json({ user: sanitizeUser(created) }, { status: 201 });
  } catch (err) {
    console.error("Register error:", err);
    return Response.json(
      { error: "Failed to register pilot account." },
      { status: 500 }
    );
  }
}
