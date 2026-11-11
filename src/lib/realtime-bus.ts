import { EventEmitter } from "events";
import type {
  ChatMessageDTO,
  PlayerNetState,
  RoomDetailDTO,
  RoomEventPayload,
} from "./game-types";

export type RoomStreamPacket =
  | { type: "snapshot"; room: RoomDetailDTO; states: PlayerNetState[] }
  | { type: "player_state"; state: PlayerNetState }
  | { type: "bot_states"; states: PlayerNetState[] }
  | { type: "event"; event: RoomEventPayload }
  | { type: "chat"; message: ChatMessageDTO }
  | { type: "room_update"; room: RoomDetailDTO }
  | {
      type: "voice_state";
      userId: number;
      voiceEnabled: boolean;
      isMuted: boolean;
      speaking?: boolean;
    }
  | {
      type: "rtc_signal";
      fromUserId: number;
      toUserId: number;
      signalType: "offer" | "answer" | "ice";
      payload: string;
    };

interface RoomTransientStore {
  players: Map<number, PlayerNetState>;
}

const globalForRealtime = globalThis as typeof globalThis & {
  __aetherEmitter?: EventEmitter;
  __aetherRoomStores?: Map<string, RoomTransientStore>;
};

function getEmitter(): EventEmitter {
  if (!globalForRealtime.__aetherEmitter) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(500);
    globalForRealtime.__aetherEmitter = emitter;
  }
  return globalForRealtime.__aetherEmitter;
}

function getRoomStores(): Map<string, RoomTransientStore> {
  if (!globalForRealtime.__aetherRoomStores) {
    globalForRealtime.__aetherRoomStores = new Map();
  }
  return globalForRealtime.__aetherRoomStores;
}

export function getRoomStore(code: string): RoomTransientStore {
  const upper = code.toUpperCase();
  const stores = getRoomStores();
  let store = stores.get(upper);
  if (!store) {
    store = { players: new Map() };
    stores.set(upper, store);
  }
  return store;
}

export function upsertPlayerState(
  code: string,
  state: PlayerNetState
): void {
  const store = getRoomStore(code);
  store.players.set(state.userId, { ...state, updatedAt: Date.now() });
}

export function removePlayerState(code: string, userId: number): void {
  const store = getRoomStore(code);
  store.players.delete(userId);
}

export function getActivePlayerStates(code: string): PlayerNetState[] {
  const store = getRoomStore(code);
  const cutoff = Date.now() - 12_000;
  const active: PlayerNetState[] = [];
  for (const [uid, st] of store.players.entries()) {
    if (st.updatedAt < cutoff) {
      store.players.delete(uid);
    } else {
      active.push(st);
    }
  }
  return active;
}

export function publishToRoom(code: string, packet: RoomStreamPacket): void {
  const upper = code.toUpperCase();
  getEmitter().emit(`room:${upper}`, packet);
}

export function subscribeToRoom(
  code: string,
  listener: (packet: RoomStreamPacket) => void
): () => void {
  const upper = code.toUpperCase();
  const channel = `room:${upper}`;
  const emitter = getEmitter();
  emitter.on(channel, listener);
  return () => {
    emitter.off(channel, listener);
  };
}
