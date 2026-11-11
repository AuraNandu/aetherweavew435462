"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Cloud,
  Compass,
  Gamepad2,
  Globe,
  Headphones,
  LogOut,
  Plus,
  Search,
  Send,
  Shield,
  Sparkles,
  Trophy,
  UserCheck,
  UserPlus,
  Users,
  X,
  Zap,
  Check,
  Trash2,
} from "lucide-react";
import {
  AURA_PALETTES,
  GAME_MODES,
  MAP_THEMES,
  SHIP_CHASSIS_LIST,
  type ChatMessageDTO,
  type GameMode,
  type MapTheme,
  type PublicUser,
  type ShipChassis,
} from "@/lib/game-types";
import { AuthPanel } from "./AuthModal";
import { ShipPreview } from "./ShipPreview";
import { DeployModal } from "./DeployModal";

interface PublicRoomSummary {
  id: number;
  code: string;
  name: string;
  hostId: number;
  hostUsername: string;
  hostColor: string;
  mode: GameMode;
  mapTheme: MapTheme;
  maxPlayers: number;
  botFill: boolean;
  status: string;
  playerCount: number;
  voiceCount: number;
}

interface FriendItem {
  friendshipId: number;
  user: PublicUser;
}

interface FriendRequestItem {
  friendshipId: number;
  user: PublicUser;
  createdAt: string;
}

interface RoomInviteItem {
  id: number;
  roomCode: string;
  roomName: string;
  fromUsername: string;
  fromAuraColor: string;
  createdAt: string;
}

export function NexusHubClient({
  initialUser,
}: {
  initialUser: PublicUser | null;
}) {
  const router = useRouter();
  const [user, setUser] = useState<PublicUser | null>(initialUser);
  const [showDeploy, setShowDeploy] = useState(false);
  const [showCreateRoom, setShowCreateRoom] = useState(false);

  // Rooms state
  const [rooms, setRooms] = useState<PublicRoomSummary[]>([]);
  const [joinCode, setJoinCode] = useState("");
  const [roomError, setRoomError] = useState<string | null>(null);

  // Create room form
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomMode, setNewRoomMode] = useState<GameMode>("flux_harvest");
  const [newRoomMap, setNewRoomMap] = useState<MapTheme>("nebula_crucible");
  const [newRoomPrivate, setNewRoomPrivate] = useState(false);
  const [newRoomBotFill, setNewRoomBotFill] = useState(true);
  const [creatingRoom, setCreatingRoom] = useState(false);

  // Social & Comms state
  const [socialTab, setSocialTab] = useState<"friends" | "search" | "chat">(
    "friends"
  );
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequestItem[]>(
    []
  );
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequestItem[]>(
    []
  );
  const [roomInvites, setRoomInvites] = useState<RoomInviteItem[]>([]);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    Array<{
      user: PublicUser;
      relation: { status: string; direction: string };
    }>
  >([]);
  const [friendFeedback, setFriendFeedback] = useState<string | null>(null);

  // Global chat
  const [globalMessages, setGlobalMessages] = useState<ChatMessageDTO[]>([]);
  const [onlineCount, setOnlineCount] = useState(1);
  const [globalChatText, setGlobalChatText] = useState("");

  const refreshHub = useCallback(async () => {
    try {
      const [roomsRes, chatRes] = await Promise.all([
        fetch("/api/rooms"),
        fetch("/api/chat/global"),
      ]);
      if (roomsRes.ok) {
        const d = (await roomsRes.json()) as { rooms: PublicRoomSummary[] };
        setRooms(d.rooms);
      }
      if (chatRes.ok) {
        const c = (await chatRes.json()) as {
          messages: ChatMessageDTO[];
          onlineCount: number;
        };
        setGlobalMessages(c.messages);
        setOnlineCount(c.onlineCount);
      }
      if (user) {
        const fRes = await fetch("/api/friends");
        if (fRes.ok) {
          const fd = (await fRes.json()) as {
            friends: FriendItem[];
            incomingRequests: FriendRequestItem[];
            outgoingRequests: FriendRequestItem[];
            roomInvites: RoomInviteItem[];
          };
          setFriends(fd.friends);
          setIncomingRequests(fd.incomingRequests);
          setOutgoingRequests(fd.outgoingRequests);
          setRoomInvites(fd.roomInvites);
        }
      }
    } catch {
      // ignore transient poll errors
    }
  }, [user]);

  useEffect(() => {
    void refreshHub();
    const timer = setInterval(() => {
      void refreshHub();
    }, 5500);
    return () => clearInterval(timer);
  }, [refreshHub]);

  const runSearch = useCallback(async (q: string) => {
    try {
      const res = await fetch(
        `/api/friends/search?q=${encodeURIComponent(q.trim())}`
      );
      if (res.ok) {
        const d = (await res.json()) as {
          results: Array<{
            user: PublicUser;
            relation: { status: string; direction: string };
          }>;
        };
        setSearchResults(d.results);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (socialTab === "search") {
      const t = setTimeout(() => {
        void runSearch(searchQuery);
      }, 220);
      return () => clearTimeout(t);
    }
  }, [searchQuery, socialTab, runSearch]);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setFriends([]);
    setIncomingRequests([]);
    setOutgoingRequests([]);
    setRoomInvites([]);
  };

  const handleUpdateLoadout = async (patch: {
    shipChassis?: ShipChassis;
    auraColor?: string;
  }) => {
    if (!user) return;
    const res = await fetch("/api/auth/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const d = (await res.json()) as { user: PublicUser };
      setUser(d.user);
    }
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingRoom(true);
    setRoomError(null);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newRoomName,
          mode: newRoomMode,
          mapTheme: newRoomMap,
          isPrivate: newRoomPrivate,
          botFill: newRoomBotFill,
        }),
      });
      const d = (await res.json()) as {
        room?: { code: string };
        error?: string;
      };
      if (!res.ok || !d.room) {
        setRoomError(d.error || "Could not create room.");
      } else {
        router.push(`/room/${d.room.code}`);
      }
    } catch {
      setRoomError("Network error while creating room.");
    } finally {
      setCreatingRoom(false);
    }
  };

  const handleJoinByCode = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = joinCode.trim().toUpperCase();
    if (!cleaned) return;
    router.push(`/room/${cleaned}`);
  };

  const handleQuickPlay = async () => {
    const open = rooms.find((r) => r.playerCount < r.maxPlayers);
    if (open) {
      router.push(`/room/${open.code}`);
      return;
    }
    const res = await fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `${user?.username || "Pilot"}'s Quick Rift`,
        mode: "flux_harvest",
        mapTheme: "nebula_crucible",
        isPrivate: false,
        botFill: true,
      }),
    });
    const d = (await res.json()) as { room?: { code: string } };
    if (d.room) router.push(`/room/${d.room.code}`);
  };

  const handleSendFriendRequest = async (targetUserId: number) => {
    setFriendFeedback(null);
    const res = await fetch("/api/friends/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetUserId }),
    });
    const d = (await res.json()) as { error?: string; status?: string };
    if (!res.ok) {
      setFriendFeedback(d.error || "Could not send request.");
    } else {
      setFriendFeedback(
        d.status === "accepted"
          ? "Friend added!"
          : "Friend request dispatched!"
      );
      void refreshHub();
      void runSearch(searchQuery);
    }
  };

  const handleFriendRespond = async (
    friendshipId: number,
    action: "accept" | "decline" | "remove"
  ) => {
    await fetch("/api/friends/respond", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ friendshipId, action }),
    });
    void refreshHub();
  };

  const handleInviteAction = async (
    invite: RoomInviteItem,
    status: "accepted" | "dismissed"
  ) => {
    await fetch(`/api/rooms/${invite.roomCode}/invite`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteId: invite.id, status }),
    });
    if (status === "accepted") {
      router.push(`/room/${invite.roomCode}`);
    } else {
      setRoomInvites((prev) => prev.filter((i) => i.id !== invite.id));
    }
  };

  const handleSendGlobalChat = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = globalChatText.trim();
    if (!text) return;
    setGlobalChatText("");
    const res = await fetch("/api/chat/global", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: text }),
    });
    if (res.ok) {
      const d = (await res.json()) as { message: ChatMessageDTO };
      setGlobalMessages((prev) => [...prev, d.message]);
    }
  };

  return (
    <div
      className="min-h-screen bg-[#050711] text-slate-100"
      style={{
        backgroundImage: `linear-gradient(to bottom, rgba(5,7,17,0.78), rgba(5,7,17,0.96)), url('/images/nebula-backdrop.png')`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
      }}
    >
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#060a17]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <img
              src="/images/aetherweave-emblem.png"
              alt="Aetherweave Emblem"
              className="h-10 w-10 rounded-xl border border-cyan-400/35 object-cover shadow-[0_0_20px_rgba(34,211,238,0.25)]"
            />
            <div>
              <div className="font-display text-base font-extrabold tracking-widest text-white sm:text-lg">
                AETHER<span className="text-cyan-400">WEAVE</span>
              </div>
              <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-slate-400">
                Orbital Gravity & Tether Arena
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="hidden items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300 md:flex">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
              {onlineCount} Pilots Online
            </div>

            <button
              type="button"
              onClick={() => setShowDeploy(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-orange-400/30 bg-orange-500/10 px-3 py-1.5 text-xs font-semibold text-orange-200 transition hover:bg-orange-500/20"
            >
              <Cloud className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Git & Cloudflare</span>
            </button>

            {user && (
              <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-1.5">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: user.auraColor }}
                />
                <span className="text-xs font-bold text-white">
                  {user.username}
                </span>
                <span className="hidden font-mono text-[11px] text-cyan-300 sm:inline">
                  {user.xp} XP
                </span>
                <button
                  type="button"
                  onClick={handleLogout}
                  title="Sign Out"
                  className="ml-1 rounded-md p-1 text-slate-400 hover:bg-white/10 hover:text-rose-300"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Incoming Room Invites Toast Bar */}
      {user && roomInvites.length > 0 && (
        <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6">
          <div className="space-y-2">
            {roomInvites.map((inv) => (
              <div
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan-400/45 bg-gradient-to-r from-cyan-500/15 via-violet-500/10 to-transparent px-4 py-3 shadow-[0_0_25px_rgba(34,211,238,0.18)]"
              >
                <div className="flex items-center gap-2.5 text-xs sm:text-sm">
                  <Sparkles className="h-4 w-4 text-cyan-300" />
                  <span>
                    <strong className="text-white">{inv.fromUsername}</strong>{" "}
                    invited you to{" "}
                    <strong className="text-cyan-300">{inv.roomName}</strong>{" "}
                    <span className="font-mono text-xs text-slate-400">
                      ({inv.roomCode})
                    </span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleInviteAction(inv, "accepted")}
                    className="rounded-lg bg-cyan-400 px-3.5 py-1.5 text-xs font-bold text-slate-950 hover:bg-cyan-300"
                  >
                    Join Room
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleInviteAction(inv, "dismissed")}
                    className="rounded-lg border border-white/15 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-white/10"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!user ? (
        /* Unauthenticated Hero + Auth Portal */
        <main className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-12 lg:py-16">
          <div className="space-y-6 lg:col-span-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3.5 py-1 text-xs font-semibold uppercase tracking-widest text-cyan-300">
              <Zap className="h-3.5 w-3.5" />
              Multiplayer Gravity-Tether Combat · Voice & Rooms
            </div>

            <h1 className="font-display text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl">
              Bend Gravity.{" "}
              <span className="bg-gradient-to-r from-cyan-300 via-sky-400 to-fuchsia-400 bg-clip-text text-transparent">
                Tether Comets.
              </span>{" "}
              Shatter Rivals.
            </h1>

            <p className="max-w-2xl text-base leading-relaxed text-slate-300">
              Welcome to <strong className="text-white">AETHERWEAVE</strong> — a
              high-speed orbital arena where plasma bolts curve around living
              pulsars into golden Overcharged Arcs, quantum tethers slingshot
              your craft around black holes, and squads coordinate live via{" "}
              <strong className="text-cyan-300">voice chat</strong> and room text chat.
            </p>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-[#090e1d]/75 p-4 backdrop-blur-md">
                <Gamepad2 className="mb-2 h-5 w-5 text-cyan-300" />
                <div className="text-xs font-bold uppercase tracking-wider text-white">
                  4 Games, 3 Genres
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  Gravity arena (Harvest and Brawl), Prism Rush racing and
                  Hex Dominion strategy.
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-[#090e1d]/75 p-4 backdrop-blur-md">
                <Headphones className="mb-2 h-5 w-5 text-emerald-300" />
                <div className="text-xs font-bold uppercase tracking-wider text-white">
                  Live Voice & Text Rooms
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  Crystal WebRTC voice comms, mic visualizers, mute/deafen, and
                  squad chat.
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-[#090e1d]/75 p-4 backdrop-blur-md">
                <Users className="mb-2 h-5 w-5 text-fuchsia-300" />
                <div className="text-xs font-bold uppercase tracking-wider text-white">
                  Unique Callsigns & Friends
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  Search unique pilots, send friend requests, and dispatch room
                  invites.
                </p>
              </div>
            </div>
          </div>

          <div className="flex justify-center lg:col-span-5">
            <AuthPanel
              initialMode="register"
              onSuccess={(authedUser) => {
                setUser(authedUser);
              }}
            />
          </div>
        </main>
      ) : (
        /* Authenticated Command Nexus Hub */
        <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-12">
          {/* Left Primary Stage: Rooms & Hangar */}
          <div className="space-y-6 lg:col-span-8">
            {/* Quick Action Bar */}
            <section className="rounded-2xl border border-cyan-400/20 bg-[#080d1e]/85 p-5 shadow-[0_0_50px_rgba(34,211,238,0.08)] backdrop-blur-xl">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-xl font-extrabold tracking-wide text-white">
                    COMMAND NEXUS HUB
                  </h1>
                  <p className="text-xs text-slate-400">
                    Launch into an active Rift Room or forge a private squad
                    arena with voice chat.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => void handleQuickPlay()}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-sky-500 px-4 py-2.5 text-xs font-extrabold uppercase tracking-wider text-slate-950 shadow-[0_0_22px_rgba(34,211,238,0.35)] transition hover:brightness-110"
                  >
                    <Zap className="h-4 w-4 fill-current" />
                    Quick Play
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreateRoom(true)}
                    className="inline-flex items-center gap-2 rounded-xl border border-violet-400/40 bg-violet-500/20 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-violet-100 transition hover:bg-violet-500/30"
                  >
                    <Plus className="h-4 w-4" />
                    Create Room
                  </button>
                </div>
              </div>

              <form
                onSubmit={handleJoinByCode}
                className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/10 pt-4"
              >
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Have a Room Code?
                </span>
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  placeholder="Enter code (e.g. AWNOVA)"
                  maxLength={12}
                  className="w-48 rounded-xl border border-white/15 bg-slate-950 px-3 py-1.5 font-mono text-xs uppercase text-white placeholder-slate-500 outline-none focus:border-cyan-400"
                />
                <button
                  type="submit"
                  className="rounded-xl border border-cyan-400/35 bg-cyan-500/15 px-4 py-1.5 text-xs font-bold text-cyan-200 hover:bg-cyan-500/25"
                >
                  Warp In
                </button>
              </form>
            </section>

            {/* Game Library */}
            <section className="rounded-2xl border border-white/10 bg-[#080d1e]/85 p-5 backdrop-blur-xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wider text-amber-300">
                  <Gamepad2 className="h-4 w-4" />
                  Game Library ({GAME_MODES.length})
                </h2>
                <span className="text-[11px] text-slate-400">
                  Every game runs in a room with voice and text chat
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {GAME_MODES.map((g) => (
                  <div
                    key={g.id}
                    className="group overflow-hidden rounded-xl border border-white/10 bg-[#050814] transition hover:border-white/30"
                  >
                    <div
                      className="h-28 w-full bg-cover bg-center opacity-85 transition group-hover:opacity-100"
                      style={{
                        backgroundImage: `linear-gradient(to bottom, rgba(5,8,20,0.05), rgba(5,8,20,0.96)), url('${g.cover}')`,
                      }}
                    />
                    <div className="px-3.5 pb-3.5">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-display text-sm font-bold tracking-wide text-white">
                          {g.name}
                        </h3>
                        <span
                          className="shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase"
                          style={{ backgroundColor: `${g.accent}26`, color: g.accent }}
                        >
                          {g.genre}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                        {g.tagline}
                      </p>
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <span className="text-[11px] text-slate-500">{g.players}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setNewRoomMode(g.id);
                            setShowCreateRoom(true);
                          }}
                          className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-bold text-white transition hover:border-cyan-400/50 hover:bg-cyan-500/20"
                        >
                          Host a Room
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Active Public Rooms Browser */}
            <section className="rounded-2xl border border-white/10 bg-[#080d1e]/85 p-5 backdrop-blur-xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wider text-cyan-300">
                  <Globe className="h-4 w-4" />
                  Active Public Arenas ({rooms.length})
                </h2>
                <span className="text-[11px] text-slate-400">
                  Auto-syncing live rooms
                </span>
              </div>

              {rooms.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/15 p-8 text-center text-xs text-slate-400">
                  No public arenas active right now. Click{" "}
                  <strong className="text-cyan-300">Create Room</strong> to
                  launch one!
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {rooms.map((r) => {
                    const m = GAME_MODES.find((gm) => gm.id === r.mode);
                    const map = MAP_THEMES.find((mt) => mt.id === r.mapTheme);
                    return (
                      <div
                        key={r.id}
                        className="group flex flex-col justify-between rounded-xl border border-white/10 bg-white/[0.03] p-4 transition hover:border-cyan-400/40 hover:bg-white/[0.05]"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h3 className="font-semibold text-white">
                                {r.name}
                              </h3>
                              <p className="mt-0.5 text-[11px] text-slate-400">
                                Host:{" "}
                                <span style={{ color: r.hostColor }}>
                                  {r.hostUsername}
                                </span>
                              </p>
                            </div>
                            <span className="rounded-md border border-white/15 bg-black/40 px-2 py-0.5 font-mono text-[11px] font-bold text-cyan-300">
                              {r.code}
                            </span>
                          </div>

                          <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] font-semibold uppercase">
                            <span className="rounded-md bg-cyan-500/15 px-2 py-0.5 text-cyan-200">
                              {m?.name || r.mode}
                            </span>
                            <span className="rounded-md bg-violet-500/15 px-2 py-0.5 text-violet-200">
                              {map?.name || r.mapTheme}
                            </span>
                            <span
                              className={`rounded-md px-2 py-0.5 ${
                                r.status === "playing"
                                  ? "bg-amber-500/20 text-amber-300"
                                  : "bg-emerald-500/15 text-emerald-300"
                              }`}
                            >
                              {r.status === "playing"
                                ? "Live Match"
                                : "In Lobby"}
                            </span>
                          </div>
                        </div>

                        <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3">
                          <div className="flex items-center gap-3 text-xs text-slate-300">
                            <span className="inline-flex items-center gap-1">
                              <Users className="h-3.5 w-3.5 text-cyan-400" />
                              {r.playerCount}/{r.maxPlayers}
                            </span>
                            {r.voiceCount > 0 && (
                              <span className="inline-flex items-center gap-1 text-emerald-300">
                                <Headphones className="h-3.5 w-3.5" />
                                {r.voiceCount} Voice
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => router.push(`/room/${r.code}`)}
                            className="rounded-lg bg-cyan-500/20 px-3 py-1.5 text-xs font-bold text-cyan-200 transition group-hover:bg-cyan-400 group-hover:text-slate-950"
                          >
                            Enter Room
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Pilot Ship Hangar & Career Telemetry */}
            <section className="rounded-2xl border border-white/10 bg-[#080d1e]/85 p-5 backdrop-blur-xl">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wider text-violet-300">
                  <Compass className="h-4 w-4" />
                  Ship Hangar & Pilot Telemetry
                </h2>
                <div className="flex items-center gap-4 font-mono text-xs text-slate-300">
                  <span className="inline-flex items-center gap-1 text-amber-300">
                    <Trophy className="h-3.5 w-3.5" />
                    {user.wins} Wins
                  </span>
                  <span>{user.kills} Eliminations</span>
                  <span>{user.matchesPlayed} Matches</span>
                </div>
              </div>

              <div className="grid items-center gap-5 sm:grid-cols-12">
                <div className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-[#050814] p-5 sm:col-span-4">
                  <ShipPreview
                    chassis={user.shipChassis}
                    auraColor={user.auraColor}
                    size={108}
                  />
                  <div className="mt-2 text-xs font-bold text-white">
                    {
                      SHIP_CHASSIS_LIST.find((c) => c.id === user.shipChassis)
                        ?.name
                    }
                  </div>
                  <div className="text-[11px] text-cyan-300">
                    {
                      SHIP_CHASSIS_LIST.find((c) => c.id === user.shipChassis)
                        ?.speedBonus
                    }
                  </div>
                </div>

                <div className="space-y-4 sm:col-span-8">
                  <div>
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Chassis Frame
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {SHIP_CHASSIS_LIST.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() =>
                            void handleUpdateLoadout({ shipChassis: c.id })
                          }
                          className={`rounded-xl border p-2.5 text-left transition ${
                            user.shipChassis === c.id
                              ? "border-cyan-400/60 bg-cyan-500/15"
                              : "border-white/10 bg-white/[0.02] hover:border-white/25"
                          }`}
                        >
                          <div className="text-xs font-bold text-white">
                            {c.name}
                          </div>
                          <div className="mt-0.5 text-[10px] text-slate-400">
                            {c.tagline}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Reactor Aura Color
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {AURA_PALETTES.map((a) => (
                        <button
                          key={a.hex}
                          type="button"
                          onClick={() =>
                            void handleUpdateLoadout({ auraColor: a.hex })
                          }
                          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition ${
                            user.auraColor === a.hex
                              ? "border-white bg-white/15 font-semibold text-white"
                              : "border-white/10 bg-white/5 text-slate-400 hover:text-white"
                          }`}
                        >
                          <span
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: a.hex }}
                          />
                          {a.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* Right Social & Global Chat Sidebar */}
          <aside className="flex h-[680px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#080d1e]/90 backdrop-blur-xl lg:col-span-4 lg:sticky lg:top-20">
            <div className="grid grid-cols-3 border-b border-white/10 text-xs font-bold">
              <button
                type="button"
                onClick={() => setSocialTab("friends")}
                className={`relative py-3 transition ${
                  socialTab === "friends"
                    ? "border-b-2 border-cyan-400 text-cyan-200"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Friends ({friends.length})
                {incomingRequests.length > 0 && (
                  <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] text-white">
                    {incomingRequests.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setSocialTab("search")}
                className={`py-3 transition ${
                  socialTab === "search"
                    ? "border-b-2 border-cyan-400 text-cyan-200"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Find Pilots
              </button>
              <button
                type="button"
                onClick={() => setSocialTab("chat")}
                className={`py-3 transition ${
                  socialTab === "chat"
                    ? "border-b-2 border-cyan-400 text-cyan-200"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Global Chat
              </button>
            </div>

            {socialTab === "friends" && (
              <div className="flex-1 space-y-4 overflow-y-auto p-4">
                {incomingRequests.length > 0 && (
                  <div>
                    <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-amber-300">
                      Incoming Friend Requests ({incomingRequests.length})
                    </div>
                    <div className="space-y-2">
                      {incomingRequests.map((req) => (
                        <div
                          key={req.friendshipId}
                          className="flex items-center justify-between rounded-xl border border-amber-400/30 bg-amber-500/10 p-2.5 text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: req.user.auraColor }}
                            />
                            <div>
                              <div className="font-bold text-white">
                                {req.user.username}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                {req.user.xp} XP · {req.user.wins} Wins
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                void handleFriendRespond(
                                  req.friendshipId,
                                  "accept"
                                )
                              }
                              className="rounded-lg bg-emerald-500 p-1.5 text-slate-950 hover:bg-emerald-400"
                              title="Accept"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void handleFriendRespond(
                                  req.friendshipId,
                                  "decline"
                                )
                              }
                              className="rounded-lg bg-white/10 p-1.5 text-slate-300 hover:bg-rose-500/20 hover:text-rose-300"
                              title="Decline"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Squad Roster ({friends.length})
                  </div>
                  {friends.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-white/15 p-5 text-center text-xs text-slate-400">
                      <UserPlus className="mx-auto mb-2 h-5 w-5 text-cyan-400" />
                      Your squad list is empty. Switch to{" "}
                      <button
                        type="button"
                        onClick={() => setSocialTab("search")}
                        className="font-semibold text-cyan-300 underline"
                      >
                        Find Pilots
                      </button>{" "}
                      to send friend requests (try searching{" "}
                      <code className="text-white">NovaValkyrie</code> or{" "}
                      <code className="text-white">ApexZephyr</code>!).
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {friends.map(({ friendshipId, user: f }) => (
                        <div
                          key={friendshipId}
                          className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] p-2.5 text-xs"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="relative">
                              <ShipPreview
                                chassis={f.shipChassis}
                                auraColor={f.auraColor}
                                size={36}
                              />
                              <span
                                className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border border-[#080d1e] ${
                                  f.isOnline ? "bg-emerald-400" : "bg-slate-600"
                                }`}
                              />
                            </div>
                            <div>
                              <div className="font-bold text-white">
                                {f.username}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                {f.currentRoomCode
                                  ? `Playing in ${f.currentRoomCode}`
                                  : f.isOnline
                                  ? "Online in Nexus"
                                  : "Offline"}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {f.currentRoomCode && (
                              <button
                                type="button"
                                onClick={() =>
                                  router.push(`/room/${f.currentRoomCode}`)
                                }
                                className="rounded-lg bg-cyan-500/20 px-2.5 py-1 text-[11px] font-semibold text-cyan-200 hover:bg-cyan-500/35"
                              >
                                Join
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                void handleFriendRespond(friendshipId, "remove")
                              }
                              title="Remove friend"
                              className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-500/15 hover:text-rose-300"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {outgoingRequests.length > 0 && (
                  <div>
                    <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Sent Requests ({outgoingRequests.length})
                    </div>
                    <div className="space-y-1.5">
                      {outgoingRequests.map((req) => (
                        <div
                          key={req.friendshipId}
                          className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs text-slate-300"
                        >
                          <span>{req.user.username}</span>
                          <button
                            type="button"
                            onClick={() =>
                              void handleFriendRespond(
                                req.friendshipId,
                                "remove"
                              )
                            }
                            className="text-[11px] text-slate-400 hover:text-rose-300"
                          >
                            Cancel
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {socialTab === "search" && (
              <div className="flex flex-1 flex-col overflow-hidden p-4">
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search unique pilot callsign..."
                    className="w-full rounded-xl border border-white/15 bg-slate-950 py-2 pl-9 pr-3 text-xs text-white placeholder-slate-500 outline-none focus:border-cyan-400"
                  />
                </div>

                {friendFeedback && (
                  <div className="mb-2 rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-1.5 text-[11px] text-cyan-200">
                    {friendFeedback}
                  </div>
                )}

                <div className="flex-1 space-y-2 overflow-y-auto">
                  {searchResults.map(({ user: target, relation }) => (
                    <div
                      key={target.id}
                      className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] p-2.5 text-xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <ShipPreview
                          chassis={target.shipChassis}
                          auraColor={target.auraColor}
                          size={34}
                        />
                        <div>
                          <div className="font-bold text-white">
                            {target.username}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {target.xp} XP · {target.wins} Wins
                          </div>
                        </div>
                      </div>

                      {relation.status === "accepted" ? (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
                          <UserCheck className="h-3 w-3" />
                          Friends
                        </span>
                      ) : relation.status === "pending" ? (
                        <span className="rounded-lg bg-white/10 px-2.5 py-1 text-[11px] text-slate-300">
                          {relation.direction === "outgoing"
                            ? "Pending"
                            : "Requested You"}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void handleSendFriendRequest(target.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-cyan-400/35 bg-cyan-500/15 px-2.5 py-1 text-[11px] font-semibold text-cyan-200 hover:bg-cyan-500/25"
                        >
                          <UserPlus className="h-3 w-3" />
                          Add
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {socialTab === "chat" && (
              <>
                <div className="flex-1 space-y-2 overflow-y-auto p-3.5 text-xs">
                  {globalMessages.map((m) => (
                    <div
                      key={m.id}
                      className="rounded-xl bg-white/[0.03] px-3 py-2"
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
                </div>
                <form
                  onSubmit={(e) => void handleSendGlobalChat(e)}
                  className="flex gap-2 border-t border-white/10 p-3"
                >
                  <input
                    type="text"
                    value={globalChatText}
                    onChange={(e) => setGlobalChatText(e.target.value)}
                    placeholder="Broadcast to Nexus Lounge..."
                    className="min-w-0 flex-1 rounded-xl border border-white/15 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-cyan-400"
                  />
                  <button
                    type="submit"
                    className="rounded-xl bg-cyan-500 px-3 text-slate-950 hover:bg-cyan-400"
                    aria-label="Send Global Message"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </button>
                </form>
              </>
            )}
          </aside>
        </main>
      )}

      {/* Create Room Modal */}
      {showCreateRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
          <div className="relative w-full max-w-md rounded-2xl border border-cyan-400/30 bg-[#080d1e] p-6 shadow-[0_0_60px_rgba(34,211,238,0.2)]">
            <button
              type="button"
              onClick={() => setShowCreateRoom(false)}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>

            <h2 className="font-display text-lg font-bold tracking-wider text-white">
              FORGE ARENA ROOM
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Create a persistent room with Voice Chat, Text Chat & Shareable
              Invite Code.
            </p>

            <form onSubmit={handleCreateRoom} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Room Name
                </label>
                <input
                  type="text"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  placeholder={`${user?.username || "Pilot"}'s Rift Arena`}
                  maxLength={48}
                  className="w-full rounded-xl border border-white/15 bg-slate-950 px-3.5 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Game
                </label>
                <select
                  value={newRoomMode}
                  onChange={(e) => setNewRoomMode(e.target.value as GameMode)}
                  className="w-full rounded-xl border border-white/15 bg-slate-950 px-3.5 py-2 text-xs text-white outline-none focus:border-cyan-400"
                >
                  {GAME_MODES.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Map Sector
                </label>
                <select
                  value={newRoomMap}
                  onChange={(e) => setNewRoomMap(e.target.value as MapTheme)}
                  className="w-full rounded-xl border border-white/15 bg-slate-950 px-3.5 py-2 text-xs text-white outline-none focus:border-cyan-400"
                >
                  {MAP_THEMES.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2 rounded-xl border border-white/10 bg-slate-950/60 p-3 text-xs">
                <label className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-slate-200">
                    <Shield className="h-3.5 w-3.5 text-violet-400" />
                    Private Room (Invite Code Only)
                  </span>
                  <input
                    type="checkbox"
                    checked={newRoomPrivate}
                    onChange={(e) => setNewRoomPrivate(e.target.checked)}
                    className="h-4 w-4 accent-cyan-400"
                  />
                </label>

                <label className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-slate-200">
                    <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
                    Fill Empty Slots with AI Cyber-Bots
                  </span>
                  <input
                    type="checkbox"
                    checked={newRoomBotFill}
                    onChange={(e) => setNewRoomBotFill(e.target.checked)}
                    className="h-4 w-4 accent-cyan-400"
                  />
                </label>
              </div>

              {roomError && (
                <div className="rounded-xl border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                  {roomError}
                </div>
              )}

              <button
                type="submit"
                disabled={creatingRoom}
                className="w-full rounded-xl bg-gradient-to-r from-cyan-400 to-violet-500 py-2.5 text-sm font-extrabold uppercase tracking-wider text-slate-950 shadow-[0_0_24px_rgba(34,211,238,0.35)] hover:brightness-110 disabled:opacity-50"
              >
                {creatingRoom ? "Forging Room..." : "Create & Enter Room"}
              </button>
            </form>
          </div>
        </div>
      )}

      {showDeploy && <DeployModal onClose={() => setShowDeploy(false)} />}
    </div>
  );
}
