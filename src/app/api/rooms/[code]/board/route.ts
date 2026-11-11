import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { HEX_TURN_MS } from "@/lib/hex-game";
import { getHexState, submitHexMove } from "@/lib/hex-server";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ code: string }> }
) {
  const { code } = await context.params;
  const state = await getHexState(code.trim().toUpperCase());
  return Response.json(
    { state, serverNow: Date.now(), turnMs: HEX_TURN_MS },
    { headers: NO_STORE }
  );
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ code: string }> }
) {
  const me = await getCurrentUser({ touchPresence: true });
  if (!me) {
    return Response.json({ error: "Please sign in first." }, { status: 401 });
  }

  const { code } = await context.params;
  const body = (await req.json().catch(() => ({}))) as {
    from?: unknown;
    to?: unknown;
  };
  const from = typeof body.from === "string" ? body.from : "";
  const to = typeof body.to === "string" ? body.to : "";

  const result = await submitHexMove(
    code.trim().toUpperCase(),
    me.id,
    from,
    to
  );
  if (!result.state) {
    return Response.json(
      { error: result.error ?? "Move rejected." },
      { status: result.status, headers: NO_STORE }
    );
  }
  return Response.json(
    { state: result.state, serverNow: Date.now(), turnMs: HEX_TURN_MS },
    { headers: NO_STORE }
  );
}
