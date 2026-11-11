import { NextRequest } from "next/server";
import { db, users } from "@/db";
import { eq } from "drizzle-orm";
import {
  createSessionForUser,
  sanitizeUser,
  verifyPassword,
} from "@/lib/auth";
import { ensureSeedData } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    await ensureSeedData();
    const body = await req.json();
    const rawUsername = String(body.username ?? "").trim();
    const password = String(body.password ?? "");

    if (!rawUsername || !password) {
      return Response.json(
        { error: "Username and password are required." },
        { status: 400 }
      );
    }

    const found = await db
      .select()
      .from(users)
      .where(eq(users.usernameLower, rawUsername.toLowerCase()))
      .limit(1);

    if (found.length === 0) {
      return Response.json(
        { error: "Invalid pilot callsign or password." },
        { status: 401 }
      );
    }

    const userRow = found[0];
    if (!verifyPassword(password, userRow.passwordHash)) {
      return Response.json(
        { error: "Invalid pilot callsign or password." },
        { status: 401 }
      );
    }

    const [updated] = await db
      .update(users)
      .set({ lastSeenAt: new Date() })
      .where(eq(users.id, userRow.id))
      .returning();

    await createSessionForUser(userRow.id);
    return Response.json({ user: sanitizeUser(updated ?? userRow) });
  } catch (err) {
    console.error("Login error:", err);
    return Response.json({ error: "Login failed." }, { status: 500 });
  }
}
