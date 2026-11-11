import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    username: varchar("username", { length: 24 }).notNull(),
    usernameLower: varchar("username_lower", { length: 24 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    shipChassis: varchar("ship_chassis", { length: 32 })
      .notNull()
      .default("valkyrie"),
    auraColor: varchar("aura_color", { length: 24 })
      .notNull()
      .default("#22d3ee"),
    bio: varchar("bio", { length: 160 })
      .notNull()
      .default("Orbital Rift Weaver"),
    xp: integer("xp").notNull().default(0),
    wins: integer("wins").notNull().default(0),
    kills: integer("kills").notNull().default(0),
    matchesPlayed: integer("matches_played").notNull().default(0),
    currentRoomCode: varchar("current_room_code", { length: 12 }),
    lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("users_username_lower_idx").on(table.usernameLower),
    index("users_last_seen_idx").on(table.lastSeenAt),
  ]
);

export const sessions = pgTable(
  "sessions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 128 }).notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("sessions_token_hash_idx").on(table.tokenHash)]
);

export const friendships = pgTable(
  "friendships",
  {
    id: serial("id").primaryKey(),
    requesterId: integer("requester_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    addresseeId: integer("addressee_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 16 }).notNull().default("pending"), // pending | accepted | declined
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("friendships_pair_idx").on(
      table.requesterId,
      table.addresseeId
    ),
    index("friendships_addressee_idx").on(table.addresseeId),
  ]
);

export const rooms = pgTable(
  "rooms",
  {
    id: serial("id").primaryKey(),
    code: varchar("code", { length: 12 }).notNull(),
    name: varchar("name", { length: 64 }).notNull(),
    hostId: integer("host_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mode: varchar("mode", { length: 24 }).notNull().default("flux_harvest"), // flux_harvest | singularity_brawl | rift_survival
    mapTheme: varchar("map_theme", { length: 24 })
      .notNull()
      .default("nebula_crucible"), // nebula_crucible | binary_pulsars | obsidian_void
    isPrivate: boolean("is_private").notNull().default(false),
    maxPlayers: integer("max_players").notNull().default(6),
    botFill: boolean("bot_fill").notNull().default(true),
    status: varchar("status", { length: 16 }).notNull().default("lobby"), // lobby | playing | finished
    matchStartedAt: timestamp("match_started_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("rooms_code_idx").on(table.code),
    index("rooms_status_idx").on(table.status),
  ]
);

export const roomParticipants = pgTable(
  "room_participants",
  {
    id: serial("id").primaryKey(),
    roomId: integer("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    isReady: boolean("is_ready").notNull().default(false),
    voiceEnabled: boolean("voice_enabled").notNull().default(false),
    isMuted: boolean("is_muted").notNull().default(false),
    team: varchar("team", { length: 12 }).notNull().default("alpha"),
    lastScore: integer("last_score").notNull().default(0),
    lastKills: integer("last_kills").notNull().default(0),
    joinedAt: timestamp("joined_at").notNull().defaultNow(),
    lastHeartbeatAt: timestamp("last_heartbeat_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("room_participants_room_user_idx").on(
      table.roomId,
      table.userId
    ),
  ]
);

export const messages = pgTable(
  "messages",
  {
    id: serial("id").primaryKey(),
    channel: varchar("channel", { length: 32 }).notNull(), // 'global' | 'room:CODE'
    userId: integer("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    senderName: varchar("sender_name", { length: 32 }).notNull(),
    senderColor: varchar("sender_color", { length: 24 })
      .notNull()
      .default("#22d3ee"),
    kind: varchar("kind", { length: 16 }).notNull().default("chat"), // chat | system | emote
    body: text("body").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("messages_channel_idx").on(table.channel, table.createdAt)]
);

export const roomInvites = pgTable(
  "room_invites",
  {
    id: serial("id").primaryKey(),
    roomCode: varchar("room_code", { length: 12 }).notNull(),
    roomName: varchar("room_name", { length: 64 }).notNull(),
    fromUserId: integer("from_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    toUserId: integer("to_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 16 }).notNull().default("pending"), // pending | accepted | dismissed
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("room_invites_to_user_idx").on(table.toUserId, table.status)]
);

export const rtcSignals = pgTable(
  "rtc_signals",
  {
    id: serial("id").primaryKey(),
    roomCode: varchar("room_code", { length: 12 }).notNull(),
    fromUserId: integer("from_user_id").notNull(),
    toUserId: integer("to_user_id").notNull(),
    signalType: varchar("signal_type", { length: 24 }).notNull(), // offer | answer | ice
    payload: text("payload").notNull(),
    consumed: boolean("consumed").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("rtc_signals_room_to_idx").on(
      table.roomCode,
      table.toUserId,
      table.consumed
    ),
  ]
);

// Server-authoritative state for turn-based games (Hex Dominion). One row per
// room; `version` is used for optimistic concurrency so two requests can never
// both apply a move on top of the same position.
export const gameStates = pgTable(
  "game_states",
  {
    id: serial("id").primaryKey(),
    roomId: integer("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    version: integer("version").notNull().default(0),
    state: text("state").notNull(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("game_states_room_idx").on(table.roomId)]
);
