import { NextRequest } from "next/server";
import { getRoomDetailByCode } from "@/lib/room-queries";
import {
  getActivePlayerStates,
  subscribeToRoom,
  type RoomStreamPacket,
} from "@/lib/realtime-bus";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ code: string }> }
) {
  const { code } = await context.params;
  const upperCode = code.trim().toUpperCase();
  const viewerId = Number(req.nextUrl.searchParams.get("userId") || "0");

  const room = await getRoomDetailByCode(upperCode);
  if (!room) {
    return Response.json({ error: "Room not found." }, { status: 404 });
  }

  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      const sendPacket = (packet: RoomStreamPacket) => {
        if (closed) return;
        if (
          packet.type === "rtc_signal" &&
          viewerId > 0 &&
          packet.toUserId !== viewerId
        ) {
          return;
        }
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(packet)}\n\n`)
          );
        } catch {
          closed = true;
        }
      };

      sendPacket({
        type: "snapshot",
        room,
        states: getActivePlayerStates(upperCode),
      });

      const unsubscribe = subscribeToRoom(upperCode, sendPacket);

      const keepAliveTimer = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          closed = true;
        }
      }, 15_000);

      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(keepAliveTimer);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // ignore already closed
        }
      };

      req.signal.addEventListener("abort", () => {
        cleanup?.();
      });
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
