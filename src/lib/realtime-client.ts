import type { PlayerNetState, RoomEventPayload } from "./game-types";
import type { RoomStreamPacket } from "./realtime-bus";

export type TransportMode = "cloudflare-worker-ws" | "builtin-sse";

export function getConfiguredWorkerWsUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_CF_WORKER_WS_URL?.trim();
  return url && url.length > 0 ? url : null;
}

export class RoomRealtimeTransport {
  private roomCode: string;
  private userId: number;
  private username: string;
  private onPacket: (packet: RoomStreamPacket) => void;
  private onStatus?: (status: {
    connected: boolean;
    mode: TransportMode;
    latencyMs: number | null;
  }) => void;

  private eventSource: EventSource | null = null;
  private ws: WebSocket | null = null;
  private closed = false;
  private mode: TransportMode = "builtin-sse";
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: {
    roomCode: string;
    userId: number;
    username: string;
    onPacket: (packet: RoomStreamPacket) => void;
    onStatus?: (status: {
      connected: boolean;
      mode: TransportMode;
      latencyMs: number | null;
    }) => void;
  }) {
    this.roomCode = opts.roomCode.toUpperCase();
    this.userId = opts.userId;
    this.username = opts.username;
    this.onPacket = opts.onPacket;
    this.onStatus = opts.onStatus;
  }

  connect(): void {
    this.closed = false;
    const cfWsBase = getConfiguredWorkerWsUrl();
    if (cfWsBase) {
      this.connectCloudflareWorker(cfWsBase);
    } else {
      this.connectBuiltInSSE();
    }
  }

  private connectCloudflareWorker(baseUrl: string): void {
    this.mode = "cloudflare-worker-ws";
    const cleanBase = baseUrl.replace(/\/$/, "");
    const wsUrl = `${cleanBase}/ws/room/${this.roomCode}?userId=${this.userId}&username=${encodeURIComponent(this.username)}`;
    try {
      const ws = new WebSocket(wsUrl);
      this.ws = ws;

      ws.onopen = () => {
        this.onStatus?.({
          connected: true,
          mode: "cloudflare-worker-ws",
          latencyMs: null,
        });
      };

      ws.onmessage = (ev) => {
        try {
          const parsed = JSON.parse(String(ev.data)) as RoomStreamPacket;
          this.onPacket(parsed);
        } catch {
          // ignore malformed packet
        }
      };

      ws.onclose = () => {
        this.onStatus?.({
          connected: false,
          mode: "cloudflare-worker-ws",
          latencyMs: null,
        });
        if (!this.closed) {
          this.reconnectTimer = setTimeout(() => {
            if (!this.closed) this.connectBuiltInSSE();
          }, 1500);
        }
      };

      ws.onerror = () => {
        // fallback cleanly if external worker unreachable
        ws.close();
      };
    } catch {
      this.connectBuiltInSSE();
    }
  }

  private connectBuiltInSSE(): void {
    this.mode = "builtin-sse";
    const url = `/api/rooms/${this.roomCode}/stream?userId=${this.userId}`;
    const es = new EventSource(url);
    this.eventSource = es;

    es.onopen = () => {
      this.onStatus?.({
        connected: true,
        mode: "builtin-sse",
        latencyMs: null,
      });
    };

    es.onmessage = (ev) => {
      if (!ev.data) return;
      try {
        const packet = JSON.parse(ev.data) as RoomStreamPacket;
        this.onPacket(packet);
      } catch {
        // ignore keepalive/malformed
      }
    };

    es.onerror = () => {
      this.onStatus?.({
        connected: false,
        mode: "builtin-sse",
        latencyMs: null,
      });
    };
  }

  async sendPlayerState(state: PlayerNetState): Promise<void> {
    return this.dispatch({ type: "player_state", state }, false);
  }

  async sendBotStates(states: PlayerNetState[]): Promise<void> {
    return this.dispatch({ type: "bot_states", states }, false);
  }

  async sendGameEvent(event: Omit<RoomEventPayload, "senderId" | "ts">): Promise<void> {
    return this.dispatch(
      {
        type: "event",
        event: { ...event, senderId: this.userId, ts: Date.now() },
      },
      false
    );
  }

  async sendChat(body: string, kind: "chat" | "emote" = "chat"): Promise<void> {
    return this.dispatch({ type: "chat", body, kind }, true);
  }

  async sendVoiceState(voiceState: {
    voiceEnabled: boolean;
    isMuted: boolean;
    speaking?: boolean;
  }): Promise<void> {
    return this.dispatch({ type: "voice_state", ...voiceState }, true);
  }

  async sendRtcSignal(signal: {
    toUserId: number;
    signalType: "offer" | "answer" | "ice";
    payload: string;
  }): Promise<void> {
    return this.dispatch({ type: "rtc_signal", ...signal }, true);
  }

  private async dispatch(
    payload: Record<string, unknown>,
    persistToApiEvenWithWs: boolean
  ): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
      if (!persistToApiEvenWithWs) return;
    }

    try {
      await fetch(`/api/rooms/${this.roomCode}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      // transient network drop; next tick recovers
    }
  }

  disconnect(): void {
    this.closed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.eventSource?.close();
    this.eventSource = null;
    this.ws?.close();
    this.ws = null;
  }

  getMode(): TransportMode {
    return this.mode;
  }
}
