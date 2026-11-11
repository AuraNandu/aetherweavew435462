import { NextRequest } from "next/server";
import { db, users } from "@/db";
import { eq } from "drizzle-orm";
import { getCurrentUser, sanitizeUser } from "@/lib/auth";
import { ensureSeedData } from "@/lib/seed";
import { AURA_PALETTES, SHIP_CHASSIS_LIST } from "@/lib/game-types";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureSeedData();
  const user = await getCurrentUser({ touchPresence: true });
  return Response.json({ user });
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser({ touchPresence: true });
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const updates: Partial<typeof users.$inferInsert> = {
    lastSeenAt: new Date(),
  };

  if (
    typeof body.shipChassis === "string" &&
    SHIP_CHASSIS_LIST.some((c) => c.id === body.shipChassis)
  ) {
    updates.shipChassis = body.shipChassis;
  }

  if (
    typeof body.auraColor === "string" &&
    AURA_PALETTES.some((a) => a.hex === body.auraColor)
  ) {
    updates.auraColor = body.auraColor;
  }

  if (typeof body.bio === "string") {
    updates.bio = body.bio.trim().slice(0, 150) || "Orbital Rift Weaver";
  }

  const [updated] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, user.id))
    .returning();

  return Response.json({ user: sanitizeUser(updated) });
}
