import { DurableObject } from "cloudflare:workers";

export interface Env {
  AETHER_ROOM: DurableObjectNamespace<AetherRoomDO>;
}

interface SocketAttachment {
  userId: number;
  username: string;
}

interface RelayPacket {
  type: string;
  toUserId?: number;
  fromUserId?: number;
  state?: Record<string, unknown>;
  [key: string]: unknown;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export class AetherRoomDO extends DurableObject<Env> {
  private transientStates = new Map<number, Record<string, unknown>>();

  async fetch(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const upgrade = request.headers.get("Upgrade");
    if (!upgrade || upgrade.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket upgrade", {
        status: 426,
        headers: CORS_HEADERS,
      });
    }

    const url = new URL(request.url);
    const userId = Number(url.searchParams.get("userId") || "0");
    const username = url.searchParams.get("username") || "Pilot";

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ userId, username } satisfies SocketAttachment);

    // Send currently cached player kinematics to newcomer
    for (const st of this.transientStates.values()) {
      server.send(JSON.stringify({ type: "player_state", state: st }));
    }

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async webSocketMessage(ws: WebSocket, rawMessage: string | ArrayBuffer) {
    if (typeof rawMessage !== "string") return;

    const attachment = (ws.deserializeAttachment() as SocketAttachment | null) ?? {
      userId: 0,
      username: "Pilot",
    };

    let packet: RelayPacket;
    try {
      packet = JSON.parse(rawMessage) as RelayPacket;
    } catch {
      return;
    }

    if (packet.type === "player_state" && packet.state) {
      const uid = Number(packet.state.userId || attachment.userId);
      if (uid) {
        this.transientStates.set(uid, packet.state);
      }
      this.broadcast(rawMessage, ws);
      return;
    }

    if (packet.type === "bot_states" || packet.type === "event") {
      this.broadcast(rawMessage, ws);
      return;
    }

    if (packet.type === "voice_state") {
      this.broadcast(
        JSON.stringify({
          ...packet,
          userId: attachment.userId,
        }),
        ws
      );
      return;
    }

    if (packet.type === "rtc_signal" && packet.toUserId) {
      const targeted = JSON.stringify({
        type: "rtc_signal",
        fromUserId: attachment.userId,
        toUserId: packet.toUserId,
        signalType: packet.signalType,
        payload: packet.payload,
      });
      for (const peerWs of this.ctx.getWebSockets()) {
        const peerAtt = peerWs.deserializeAttachment() as SocketAttachment | null;
        if (peerAtt && peerAtt.userId === packet.toUserId) {
          try {
            peerWs.send(targeted);
          } catch {
            // ignore closed socket
          }
        }
      }
      return;
    }

    if (packet.type === "chat") {
      this.broadcast(
        JSON.stringify({
          type: "chat",
          message: {
            id: Date.now(),
            channel: "room",
            userId: attachment.userId,
            senderName: attachment.username,
            senderColor: "#22d3ee",
            kind: packet.kind || "chat",
            body: String(packet.body || "").slice(0, 320),
            createdAt: new Date().toISOString(),
          },
        })
      );
    }
  }

  async webSocketClose(ws: WebSocket) {
    const attachment = ws.deserializeAttachment() as SocketAttachment | null;
    if (attachment?.userId) {
      this.transientStates.delete(attachment.userId);
      this.broadcast(
        JSON.stringify({
          type: "voice_state",
          userId: attachment.userId,
          voiceEnabled: false,
          isMuted: false,
          speaking: false,
        }),
        ws
      );
    }
  }

  private broadcast(payload: string, exclude?: WebSocket) {
    for (const sock of this.ctx.getWebSockets()) {
      if (exclude && sock === exclude) continue;
      try {
        sock.send(payload);
      } catch {
        // ignore closed sockets
      }
    }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    if (url.pathname === "/health" || url.pathname === "/") {
      return Response.json(
        {
          ok: true,
          service: "aetherweave-cloudflare-relay",
          runtime: "Cloudflare Workers + Durable Objects",
        },
        { headers: CORS_HEADERS }
      );
    }

    const match = url.pathname.match(/^\/ws\/room\/([A-Za-z0-9_-]+)$/);
    if (match) {
      const roomCode = match[1].toUpperCase();
      const id = env.AETHER_ROOM.idFromName(roomCode);
      const stub = env.AETHER_ROOM.get(id);
      return stub.fetch(request);
    }

    return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
  },
};
