import { NextRequest } from "next/server";
import { db, users } from "@/db";
import { eq } from "drizzle-orm";
import { validateUsername } from "@/lib/auth";
import { ensureSeedData } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await ensureSeedData();
  const username = req.nextUrl.searchParams.get("username") || "";
  const validation = validateUsername(username);
  if (!validation.ok) {
    return Response.json({
      available: false,
      error: validation.error,
    });
  }

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.usernameLower, validation.username.toLowerCase()))
    .limit(1);

  return Response.json({
    available: existing.length === 0,
    error: existing.length > 0 ? "That callsign is already claimed." : null,
  });
}
