"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Copy,
  Crown,
  Headphones,
  HeadphoneOff,
  Mic,
  MicOff,
  PanelRightClose,
  PanelRightOpen,
  PhoneCall,
  PhoneOff,
  Play,
  Radio,
  Send,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
  Bot,
  Cloud,
} from "lucide-react";
import {
  GAME_MODES,
  MAP_THEMES,
  type ChatMessageDTO,
  type GameMode,
  type MapTheme,
  type PlayerNetState,
  type PublicUser,
  type RoomDetailDTO,
  type RoomEventPayload,
} from "@/lib/game-types";
import {
  RoomRealtimeTransport,
  type TransportMode,
} from "@/lib/realtime-client";
import type { RoomStreamPacket } from "@/lib/realtime-bus";
import { useVoiceChat } from "@/hooks/useVoiceChat";
import { AuthPanel } from "./AuthModal";
import { ShipPreview } from "./ShipPreview";
import { AetherArenaCanvas } from "./game/AetherArenaCanvas";
import { PrismRushCanvas } from "./game/PrismRushCanvas";
import { HexDominionBoard } from "./game/HexDominionBoard";
import { DeployModal } from "./DeployModal";

export function RoomClient({
  initialUser,
  initialRoom,
  initialMessages,
  roomCode,
}: {
  initialUser: PublicUser | null;
  initialRoom: RoomDetailDTO | null;
  initialMessages: ChatMessageDTO[];
  roomCode: string;
}) {
  const router = useRouter();
  const [user, setUser] = useState<PublicUser | null>(initialUser);
  const [room, setRoom] = useState<RoomDetailDTO | null>(initialRoom);
  const [messages, setMessages] = useState<ChatMessageDTO[]>(initialMessages);
  const [chatText, setChatText] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [commsOpen, setCommsOpen] = useState(true);
  const [commsTab, setCommsTab] = useState<"chat" | "invite">("chat");
  const [friends, setFriends] = useState<Array<{ user: PublicUser }>>([]);
  const [invitedIds, setInvitedIds] = useState<Record<number, boolean>>({});
  const [showDeploy, setShowDeploy] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [transportStatus, setTransportStatus] = useState<{
    connected: boolean;
    mode: TransportMode;
  }>({ connected: false, mode: "builtin-sse" });

  const transportRef = useRef<RoomRealtimeTransport | null>(null);
  const remotePlayersRef = useRef<Map<number, PlayerNetState>>(new Map());
  const incomingEventRef = useRef<RoomEventPayload[]>([]);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const roomRef = useRef<RoomDetailDTO | null>(initialRoom);

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  // Every match starts from a clean slate: no ships or events left over from the previous one.
  const matchKey = room?.matchStartedAt ?? null;
  useEffect(() => {
    remotePlayersRef.current.clear();
    incomingEventRef.current.length = 0;
  }, [matchKey]);

  // Drop ships of pilots who are no longer in the room so they do not linger as frozen ghosts.
  const pruneRemotePilots = useCallback((detail: RoomDetailDTO) => {
    for (const id of Array.from(remotePlayersRef.current.keys())) {
      if (id > 0 && !detail.participants.some((p) => p.userId === id)) {
        remotePlayersRef.current.delete(id);
      }
    }
  }, []);

  const voice = useVoiceChat({
    roomCode,
    myUserId: user?.id ?? null,
    participants: room?.participants ?? [],
    transportRef,
  });

  // Auto scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Load friends for Invite panel
  useEffect(() => {
    if (!user) return;
    fetch("/api/friends")
      .then((r) => r.json())
      .then((d: { friends?: Array<{ user: PublicUser }> }) => {
        if (d.friends) setFriends(d.friends);
      })
      .catch(() => {});
  }, [user]);

  // Auto-join room when authenticated
  useEffect(() => {
    if (!user || !room) return;
    const isInRoom = room.participants.some((p) => p.userId === user.id);
    if (!isInRoom) {
      fetch(`/api/rooms/${roomCode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "join" }),
      })
        .then((r) => r.json())
        .then((d: { room?: RoomDetailDTO }) => {
          if (d.room) setRoom(d.room);
        })
        .catch(() => {});
    }
  }, [room, roomCode, user]);

  // Connect real-time transport
  useEffect(() => {
    if (!user || !room) return;

    const transport = new RoomRealtimeTransport({
      roomCode,
      userId: user.id,
      username: user.username,
      onStatus: (st) => {
        setTransportStatus({ connected: st.connected, mode: st.mode });
      },
      onPacket: (packet: RoomStreamPacket) => {
        if (packet.type === "snapshot") {
          setRoom(packet.room);
          remotePlayersRef.current.clear();
          for (const s of packet.states) {
            if (s.userId !== user.id) {
              remotePlayersRef.current.set(s.userId, s);
            }
          }
        } else if (packet.type === "room_update") {
          setRoom(packet.room);
          pruneRemotePilots(packet.room);
        } else if (packet.type === "player_state") {
          if (packet.state.userId !== user.id) {
            remotePlayersRef.current.set(packet.state.userId, packet.state);
          }
        } else if (packet.type === "bot_states") {
          // The host simulates the bots locally; ignoring the echo stops every bot being drawn twice.
          if (packet.states && roomRef.current?.hostId !== user.id) {
            for (const bs of packet.states) {
              remotePlayersRef.current.set(bs.userId, bs);
            }
          }
        } else if (packet.type === "event") {
          incomingEventRef.current.push(packet.event);
          if (packet.event.kind === "match_start") {
            fetch(`/api/rooms/${roomCode}`)
              .then((r) => r.json())
              .then((d: { room?: RoomDetailDTO }) => {
                if (d.room) setRoom(d.room);
              })
              .catch(() => {});
          }
        } else if (packet.type === "chat") {
          setMessages((prev) => {
            if (prev.some((m) => m.id === packet.message.id)) return prev;
            return [...prev.slice(-79), packet.message];
          });
        } else if (packet.type === "voice_state") {
          voice.handlePeerVoiceState(packet);
          setRoom((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              participants: prev.participants.map((p) =>
                p.userId === packet.userId
                  ? {
                      ...p,
                      voiceEnabled: packet.voiceEnabled,
                      isMuted: packet.isMuted,
                    }
                  : p
              ),
            };
          });
        } else if (packet.type === "rtc_signal") {
          void voice.handleIncomingSignal(packet);
        }
      },
    });

    transportRef.current = transport;
    transport.connect();

    return () => {
      transport.disconnect();
      transportRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, room?.code]);

  // Fallback room sync every 3s. Covers dropped event streams, and the Cloudflare
  // WebSocket transport, which relays game traffic but not lobby/match-state changes.
  useEffect(() => {
    if (!user) return;
    const timer = setInterval(() => {
      fetch(`/api/rooms/${roomCode}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { room?: RoomDetailDTO } | null) => {
          const fresh = d?.room;
          if (!fresh) return;
          const before = roomRef.current;
          if (before?.status === "playing" && fresh.status === "finished") {
            incomingEventRef.current.push({
              kind: "match_end",
              senderId: 0,
              data: {},
              ts: Date.now(),
            });
          }
          pruneRemotePilots(fresh);
          setRoom((prev) =>
            JSON.stringify(prev) === JSON.stringify(fresh) ? prev : fresh
          );
        })
        .catch(() => {});
    }, 3000);
    return () => clearInterval(timer);
  }, [roomCode, user, pruneRemotePilots]);

  const handleSendChat = async (e?: React.FormEvent, customText?: string, kind: "chat" | "emote" = "chat") => {
    e?.preventDefault();
    const text = (customText ?? chatText).trim();
    if (!text) return;
    if (!customText) setChatText("");
    await transportRef.current?.sendChat(text, kind);
  };

  const handleLeaveRoom = async () => {
    await voice.leaveVoice();
    await fetch(`/api/rooms/${roomCode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "leave" }),
    });
    router.push("/");
  };

  const handleToggleReady = async () => {
    const res = await fetch(`/api/rooms/${roomCode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggle_ready" }),
    });
    const d = (await res.json()) as { room?: RoomDetailDTO };
    if (d.room) setRoom(d.room);
  };

  const handleUpdateSettings = async (patch: {
    mode?: GameMode;
    mapTheme?: MapTheme;
    botFill?: boolean;
    isPrivate?: boolean;
  }) => {
    const res = await fetch(`/api/rooms/${roomCode}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_settings", ...patch }),
    });
    const d = (await res.json()) as { room?: RoomDetailDTO };
    if (d.room) setRoom(d.room);
  };

  const handleStartMatch = async () => {
    const res = await fetch(`/api/rooms/${roomCode}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start_match" }),
    });
    const d = (await res.json()) as { room?: RoomDetailDTO; error?: string };
    setLaunchError(d.room ? null : d.error || "Could not launch the match.");
    if (d.room) setRoom(d.room);
  };

  const handleMatchFinish = useCallback(
    async (standings: Array<{ userId: number; score: number; kills: number }>) => {
      const res = await fetch(`/api/rooms/${roomCode}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "finish_match", standings }),
      });
      const d = (await res.json()) as { room?: RoomDetailDTO };
      if (d.room) setRoom(d.room);
    },
    [roomCode]
  );

  const handleReturnLobby = async () => {
    const res = await fetch(`/api/rooms/${roomCode}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset_lobby" }),
    });
    const d = (await res.json()) as { room?: RoomDetailDTO };
    if (d.room) setRoom(d.room);
  };

  const handleInviteFriend = async (friendId: number) => {
    setInvitedIds((prev) => ({ ...prev, [friendId]: true }));
    await fetch(`/api/rooms/${roomCode}/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toUserId: friendId }),
    });
  };

  const copyCode = () => {
    void navigator.clipboard.writeText(roomCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 1800);
  };

  const copyLink = () => {
    const url = `${window.location.origin}/room/${roomCode}`;
    void navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 1800);
  };

  if (!room) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#050711] p-6 text-white">
        <div className="max-w-md rounded-2xl border border-rose-500/30 bg-[#090e1d] p-8 text-center">
          <h1 className="font-display text-2xl font-bold text-white">
            RIFT ROOM NOT FOUND
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Room code <span className="font-mono text-cyan-300">{roomCode}</span>{" "}
            does not exist or has closed.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-5 py-2.5 text-sm font-bold text-slate-950"
          >
            <ArrowLeft className="h-4 w-4" />
            Return to Command Nexus
          </Link>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main
        className="relative grid min-h-screen place-items-center bg-[#050711] p-4"
        style={{
          backgroundImage: `linear-gradient(to bottom, rgba(5,7,17,0.82), rgba(5,7,17,0.95)), url('/images/nebula-backdrop.png')`,
          backgroundSize: "cover",
        }}
      >
        <AuthPanel
          initialMode="register"
          subtitle={`Claim a unique Pilot Callsign to enter Room ${room.code} (${room.name})`}
          onSuccess={(authedUser) => {
            setUser(authedUser);
          }}
        />
      </main>
    );
  }

  const isHost = room.hostId === user.id;
  const myParticipant = room.participants.find((p) => p.userId === user.id);
  const modeSpec = GAME_MODES.find((m) => m.id === room.mode) ?? GAME_MODES[0];
  const mapSpec =
    MAP_THEMES.find((m) => m.id === room.mapTheme) ?? MAP_THEMES[0];

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#050711] text-slate-100">
      {/* Top Room Command Bar */}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#080d1e]/90 px-4 py-2.5 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleLeaveRoom}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-rose-400/40 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Leave
          </button>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-sm font-bold tracking-wider text-white sm:text-base">
                {room.name}
              </h1>
              <span className="rounded-md border border-cyan-400/35 bg-cyan-500/15 px-2 py-0.5 font-mono text-xs font-bold text-cyan-200">
                {room.code}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <span>{modeSpec.name}</span>
              <span>·</span>
              <span>{mapSpec.name}</span>
              <span>·</span>
              <span>
                {room.participants.length}/{room.maxPlayers} Pilots
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowDeploy(true)}
            className="hidden items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-2.5 py-1.5 text-[11px] font-medium text-slate-300 hover:border-cyan-400/40 sm:inline-flex"
          >
            <span
              className={`h-2 w-2 rounded-full ${
                transportStatus.connected ? "bg-emerald-400" : "bg-amber-400"
              }`}
            />
            <Cloud className="h-3.5 w-3.5 text-orange-300" />
            {transportStatus.mode === "cloudflare-worker-ws"
              ? "Cloudflare Edge WS"
              : "Live SSE Engine"}
          </button>

          <button
            type="button"
            onClick={copyCode}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:border-cyan-400/40"
          >
            {copiedCode ? (
              <Check className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <Copy className="h-3.5 w-3.5 text-cyan-300" />
            )}
            {copiedCode ? "Copied Code" : "Copy Code"}
          </button>

          <button
            type="button"
            onClick={copyLink}
            className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-400/30 bg-cyan-500/15 px-3 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/25"
          >
            {copiedLink ? (
              <Check className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <UserPlus className="h-3.5 w-3.5" />
            )}
            {copiedLink ? "Invite Link Copied!" : "Share Invite Link"}
          </button>

          <button
            type="button"
            onClick={() => setCommsOpen((p) => !p)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs text-slate-300 hover:text-white"
            title="Toggle Comms Sidebar"
          >
            {commsOpen ? (
              <PanelRightClose className="h-4 w-4" />
            ) : (
              <PanelRightOpen className="h-4 w-4" />
            )}
          </button>
        </div>
      </header>

      {/* Main Split Workspace */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Primary Arena / Lobby Viewport */}
        <div className="min-w-0 flex-1 p-3">
          {room.status === "playing" || room.status === "finished" ? (
            modeSpec.kind === "hex" ? (
              <HexDominionBoard
                room={room}
                user={user}
                onReturnLobby={handleReturnLobby}
              />
            ) : modeSpec.kind === "race" ? (
              <PrismRushCanvas
                room={room}
                user={user}
                transportRef={transportRef}
                remotePlayersRef={remotePlayersRef}
                incomingEventRef={incomingEventRef}
                onMatchFinish={handleMatchFinish}
                onReturnLobby={handleReturnLobby}
              />
            ) : (
              <AetherArenaCanvas
                room={room}
                user={user}
                transportRef={transportRef}
                remotePlayersRef={remotePlayersRef}
                incomingEventRef={incomingEventRef}
                onMatchFinish={handleMatchFinish}
                onReturnLobby={handleReturnLobby}
              />
            )
          ) : (
            <div
              className="flex h-full flex-col justify-between overflow-y-auto rounded-2xl border border-cyan-400/20 bg-[#070b18] p-5"
              style={{
                backgroundImage: `radial-gradient(circle at 50% 0%, rgba(34,211,238,0.12), transparent 60%)`,
              }}
            >
              {/* Lobby Header & Mode Config */}
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wider text-cyan-300">
                      <Users className="h-4 w-4" />
                      Squad Hangar ({room.participants.length}/{room.maxPlayers})
                    </h2>
                    {isHost && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/35 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-300">
                        <Crown className="h-3 w-3" />
                        You are Room Host
                      </span>
                    )}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {room.participants.map((p) => {
                      const peerVoice = voice.peerSpeakingMap[p.userId];
                      const isSpeakingNow =
                        p.userId === user.id
                          ? voice.isSpeaking
                          : Boolean(peerVoice?.speaking);
                      return (
                        <div
                          key={p.userId}
                          className={`flex items-center gap-3 rounded-xl border p-3 transition ${
                            isSpeakingNow
                              ? "border-emerald-400/70 bg-emerald-500/10 shadow-[0_0_20px_rgba(16,185,129,0.2)]"
                              : "border-white/10 bg-white/[0.03]"
                          }`}
                        >
                          <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-[#050814]">
                            <ShipPreview
                              chassis={p.shipChassis}
                              auraColor={p.auraColor}
                              size={48}
                            />
                            {p.voiceEnabled && (
                              <span
                                className={`absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-black ${
                                  p.isMuted
                                    ? "bg-rose-500 text-white"
                                    : isSpeakingNow
                                    ? "animate-pulse bg-emerald-400 text-slate-950"
                                    : "bg-cyan-400 text-slate-950"
                                }`}
                              >
                                {p.isMuted ? (
                                  <MicOff className="h-3 w-3" />
                                ) : (
                                  <Mic className="h-3 w-3" />
                                )}
                              </span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate font-semibold text-white">
                                {p.username}
                              </span>
                              {p.userId === room.hostId && (
                                <Crown className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                              )}
                            </div>
                            <div className="mt-0.5 text-[11px] text-slate-400">
                              {p.xp} XP · {p.wins} Wins
                            </div>
                            <div className="mt-1">
                              <span
                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                                  p.isReady
                                    ? "bg-emerald-500/20 text-emerald-300"
                                    : "bg-slate-800 text-slate-400"
                                }`}
                              >
                                {p.isReady ? "Ready" : "Preparing"}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {room.botFill &&
                      Array.from({
                        length: Math.max(0, modeSpec.botFillTo - room.participants.length),
                      }).map((_, i) => (
                        <div
                          key={`bot-slot-${i}`}
                          className="flex items-center gap-3 rounded-xl border border-dashed border-white/15 bg-white/[0.015] p-3 opacity-75"
                        >
                          <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-white/10 bg-slate-950 text-cyan-400">
                            <Bot className="h-6 w-6" />
                          </div>
                          <div>
                            <div className="text-xs font-semibold text-slate-300">
                              Cyber-Bot Pilot #{i + 1}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              Auto-fills empty slot until a friend joins
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>

                {/* Arena Rules & Host Settings */}
                <div className="space-y-3 rounded-xl border border-white/10 bg-[#0b1124]/90 p-4">
                  <h3 className="font-display text-xs font-bold uppercase tracking-wider text-violet-300">
                    Arena Configuration
                  </h3>

                  <div>
                    <label className="mb-1 block text-[11px] uppercase tracking-wider text-slate-400">
                      Game
                    </label>
                    {isHost ? (
                      <select
                        value={room.mode}
                        onChange={(e) =>
                          handleUpdateSettings({
                            mode: e.target.value as GameMode,
                          })
                        }
                        className="w-full rounded-lg border border-white/15 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-cyan-400"
                      >
                        {GAME_MODES.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-xs font-semibold text-white">
                        {modeSpec.name}
                      </div>
                    )}
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                      {modeSpec.description}
                    </p>
                  </div>

                  <div>
                    <label className="mb-1 block text-[11px] uppercase tracking-wider text-slate-400">
                      Map Sector
                    </label>
                    {isHost ? (
                      <select
                        value={room.mapTheme}
                        onChange={(e) =>
                          handleUpdateSettings({
                            mapTheme: e.target.value as MapTheme,
                          })
                        }
                        className="w-full rounded-lg border border-white/15 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-cyan-400"
                      >
                        {MAP_THEMES.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-xs font-semibold text-white">
                        {mapSpec.name}
                      </div>
                    )}
                    <p className="mt-1 text-[11px] text-slate-400">
                      {modeSpec.mapNotes[room.mapTheme] ?? mapSpec.subtitle}
                    </p>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2">
                    <span className="text-xs text-slate-300">
                      AI Cyber-Bot Fill
                    </span>
                    {isHost ? (
                      <button
                        type="button"
                        onClick={() =>
                          handleUpdateSettings({ botFill: !room.botFill })
                        }
                        className={`rounded-md px-2.5 py-1 text-[11px] font-bold ${
                          room.botFill
                            ? "bg-cyan-500/20 text-cyan-300"
                            : "bg-slate-800 text-slate-400"
                        }`}
                      >
                        {room.botFill ? "ENABLED" : "OFF"}
                      </button>
                    ) : (
                      <span className="text-[11px] font-semibold text-cyan-300">
                        {room.botFill ? "ENABLED" : "OFF"}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Abilities Guide + Launch Bar */}
              <div className="mt-5 space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  {modeSpec.controls.map((c, i) => (
                    <div
                      key={c.keys}
                      className={`rounded-xl border p-3 ${
                        [
                          "border-cyan-400/20 bg-cyan-500/5",
                          "border-violet-400/20 bg-violet-500/5",
                          "border-amber-400/20 bg-amber-500/5",
                        ][i % 3]
                      }`}
                    >
                      <div
                        className={`text-xs font-bold ${
                          ["text-cyan-300", "text-violet-300", "text-amber-300"][i % 3]
                        }`}
                      >
                        {c.keys} · {c.title.toUpperCase()}
                      </div>
                      <p className="mt-1 text-[11px] text-slate-300">{c.text}</p>
                    </div>
                  ))}
                </div>

                {launchError && (
                  <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                    {launchError}
                  </div>
                )}

<div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#0b1124] p-4">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleToggleReady}
                      className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition ${
                        myParticipant?.isReady
                          ? "border border-emerald-400/50 bg-emerald-500/20 text-emerald-200"
                          : "border border-white/20 bg-white/10 text-white hover:bg-white/15"
                      }`}
                    >
                      <ShieldCheck className="h-4 w-4" />
                      {myParticipant?.isReady ? "Pilot Ready" : "Ready Up"}
                    </button>
                    <span className="text-xs text-slate-400">
                      {isHost
                        ? "Ready whenever you are — launch solo with Cyber-Bots or wait for friends!"
                        : `Waiting for Host (${room.hostUsername}) to launch the Arena.`}
                    </span>
                  </div>

                  {isHost && (
                    <button
                      type="button"
                      onClick={handleStartMatch}
                      className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 via-sky-400 to-violet-500 px-6 py-3 text-sm font-extrabold uppercase tracking-wider text-slate-950 shadow-[0_0_30px_rgba(34,211,238,0.45)] transition hover:brightness-110"
                    >
                      <Play className="h-4 w-4 fill-current" />
                      Launch Match
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Comms Dock: Voice Chat + Room Chat + Invite Friends */}
        {commsOpen && (
          <aside className="flex w-80 shrink-0 flex-col border-l border-white/10 bg-[#070b17] lg:w-96">
            {/* WebRTC Voice Chat Panel */}
            <div className="border-b border-white/10 bg-[#0a1022] p-3.5">
              <div className="mb-2.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-cyan-300">
                  <Radio className="h-3.5 w-3.5" />
                  WebRTC Voice Channel
                </span>
                <span className="text-[11px] text-slate-400">
                  {room.participants.filter((p) => p.voiceEnabled).length} in voice
                </span>
              </div>

              {!voice.voiceJoined ? (
                <button
                  type="button"
                  onClick={() => void voice.joinVoice()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-400/40 bg-emerald-500/15 py-2 text-xs font-bold uppercase tracking-wider text-emerald-200 transition hover:bg-emerald-500/25"
                >
                  <PhoneCall className="h-3.5 w-3.5" />
                  Join Room Voice Chat
                </button>
              ) : (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void voice.toggleMute()}
                      disabled={voice.listenOnly}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition ${
                        voice.isMuted
                          ? "border border-rose-400/40 bg-rose-500/20 text-rose-200"
                          : "border border-emerald-400/40 bg-emerald-500/20 text-emerald-200"
                      } disabled:opacity-60`}
                    >
                      {voice.isMuted ? (
                        <MicOff className="h-3.5 w-3.5" />
                      ) : (
                        <Mic className="h-3.5 w-3.5" />
                      )}
                      {voice.listenOnly
                        ? "Listen Only"
                        : voice.isMuted
                        ? "Muted"
                        : "Mic Live"}
                    </button>

                    <button
                      type="button"
                      onClick={voice.toggleDeafen}
                      className={`rounded-lg border px-2.5 py-1.5 text-xs ${
                        voice.isDeafened
                          ? "border-amber-400/40 bg-amber-500/20 text-amber-200"
                          : "border-white/15 bg-white/5 text-slate-300"
                      }`}
                      title={voice.isDeafened ? "Undeafen" : "Deafen"}
                    >
                      {voice.isDeafened ? (
                        <HeadphoneOff className="h-3.5 w-3.5" />
                      ) : (
                        <Headphones className="h-3.5 w-3.5" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => void voice.leaveVoice()}
                      className="rounded-lg border border-rose-500/40 bg-rose-500/15 px-2.5 py-1.5 text-xs text-rose-300 hover:bg-rose-500/25"
                      title="Leave Voice"
                    >
                      <PhoneOff className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Live Mic Meter */}
                  {!voice.listenOnly && (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase text-slate-400">
                        Input
                      </span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-all duration-75"
                          style={{ width: `${voice.micLevel}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {voice.voiceError && (
                <p className="mt-2 rounded-lg border border-amber-400/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-200">
                  {voice.voiceError}
                </p>
              )}

              {/* Active Voice Participants Pills */}
              {room.participants.some((p) => p.voiceEnabled) && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {room.participants
                    .filter((p) => p.voiceEnabled)
                    .map((p) => {
                      const speaking =
                        p.userId === user.id
                          ? voice.isSpeaking
                          : Boolean(voice.peerSpeakingMap[p.userId]?.speaking);
                      return (
                        <span
                          key={p.userId}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] ${
                            speaking
                              ? "border-emerald-400 bg-emerald-500/20 text-emerald-200"
                              : "border-white/10 bg-white/5 text-slate-300"
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              p.isMuted
                                ? "bg-rose-400"
                                : speaking
                                ? "animate-ping bg-emerald-400"
                                : "bg-cyan-400"
                            }`}
                          />
                          {p.username}
                        </span>
                      );
                    })}
                </div>
              )}
            </div>

            {/* Comms Tabs: Room Text Chat vs Invite Friends */}
            <div className="grid grid-cols-2 border-b border-white/10 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setCommsTab("chat")}
                className={`py-2.5 transition ${
                  commsTab === "chat"
                    ? "border-b-2 border-cyan-400 text-cyan-200"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Room Text Chat
              </button>
              <button
                type="button"
                onClick={() => setCommsTab("invite")}
                className={`py-2.5 transition ${
                  commsTab === "invite"
                    ? "border-b-2 border-cyan-400 text-cyan-200"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Invite Friends ({friends.length})
              </button>
            </div>

            {commsTab === "chat" ? (
              <>
                <div className="flex-1 space-y-2 overflow-y-auto p-3 text-xs">
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={`rounded-xl px-2.5 py-1.5 ${
                        m.kind === "system"
                          ? "border border-cyan-400/15 bg-cyan-500/5 text-cyan-200/90 italic"
                          : m.kind === "emote"
                          ? "border border-amber-400/20 bg-amber-500/10 text-amber-100"
                          : "bg-white/[0.03]"
                      }`}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span
                          className="font-bold"
                          style={{ color: m.senderColor || "#22d3ee" }}
                        >
                          {m.senderName}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {new Date(m.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <p className="mt-0.5 break-words text-slate-200">
                        {m.body}
                      </p>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>

                {/* Quick Emotes */}
                <div className="flex gap-1 border-t border-white/10 px-3 py-1.5">
                  {[
                    "⚡ Rush Nexus!",
                    "🛡️ Cover Me",
                    "🔥 Nice Shot!",
                    "GG!",
                  ].map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => void handleSendChat(undefined, q, "emote")}
                      className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-slate-300 hover:border-cyan-400/40 hover:text-white"
                    >
                      {q}
                    </button>
                  ))}
                </div>

                <form
                  onSubmit={(e) => void handleSendChat(e)}
                  className="flex gap-2 border-t border-white/10 p-3"
                >
                  <input
                    type="text"
                    value={chatText}
                    onChange={(e) => setChatText(e.target.value)}
                    placeholder="Message squad... (Esc to steer)"
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    className="min-w-0 flex-1 rounded-xl border border-white/15 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-cyan-400"
                  />
                  <button
                    type="submit"
                    className="rounded-xl bg-cyan-500 px-3 text-slate-950 transition hover:bg-cyan-400"
                    aria-label="Send"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </button>
                </form>
              </>
            ) : (
              <div className="flex-1 space-y-2 overflow-y-auto p-3">
                {friends.length === 0 ? (
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-center text-xs text-slate-400">
                    <Sparkles className="mx-auto mb-2 h-5 w-5 text-cyan-400" />
                    No friends added yet! Search for pilots or share your room
                    link above.
                  </div>
                ) : (
                  friends.map(({ user: f }) => (
                    <div
                      key={f.id}
                      className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] p-2.5 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            f.isOnline ? "bg-emerald-400" : "bg-slate-600"
                          }`}
                        />
                        <div>
                          <div className="font-semibold text-white">
                            {f.username}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {f.currentRoomCode
                              ? `In Room ${f.currentRoomCode}`
                              : f.isOnline
                              ? "Online in Nexus"
                              : "Offline"}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={Boolean(invitedIds[f.id])}
                        onClick={() => void handleInviteFriend(f.id)}
                        className="rounded-lg border border-cyan-400/35 bg-cyan-500/15 px-2.5 py-1 text-[11px] font-semibold text-cyan-200 hover:bg-cyan-500/25 disabled:opacity-50"
                      >
                        {invitedIds[f.id] ? "Invited!" : "Invite"}
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </aside>
        )}
      </div>

      {showDeploy && <DeployModal onClose={() => setShowDeploy(false)} />}
    </div>
  );
}
