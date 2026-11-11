# AETHERWEAVE — multiplayer game hub

A full-stack multiplayer game hub: accounts with unique usernames, friends,
rooms with shareable codes, room text chat, peer-to-peer voice chat, and
**four games** that all run inside the same room system.

Built with Next.js (App Router), PostgreSQL + Drizzle ORM, HTML5 canvas and
WebRTC. An optional Cloudflare Worker + Durable Object relay is included.

---

## Games

| Game | Genre | Players | How it is run |
| --- | --- | --- | --- |
| **Aetherweave: Flux Harvest** | Arena, objective | 1–6 (+bots) | Client-simulated, relayed |
| **Aetherweave: Singularity Brawl** | Arena, deathmatch | 1–6 (+bots) | Client-simulated, relayed |
| **Prism Rush** | Racing, 3 laps | 1–6 (+bots) | Client-simulated, relayed |
| **Hex Dominion** | Turn-based strategy | 2–4 (bot joins a solo room) | **Server-authoritative** (moves validated and stored in PostgreSQL) |

- **Flux Harvest** — collect Aether Cores and bank them at the Nexus Gates.
  Plasma bolts bend around gravity wells (and overcharge for 1.65x damage),
  the tether slingshots you around pulsars or flings asteroids, and the Nova
  dash reflects bolts.
- **Singularity Brawl** — the same arena with no cores and no gates. Points
  only come from hits and eliminations; bots hunt pilots.
- **Prism Rush** — WASD/arrows to drive, Shift to drift (a long drift refills
  boost), Space to boost, boost pads on track. Three tracks, one per map
  sector. Racers do not collide with each other.
- **Hex Dominion** — clone an orb to a neighbouring cell or jump two cells;
  every enemy orb touching the landing cell flips. 30s turn timer (the server
  moves for you when it expires), and a seat goes on autopilot if its player
  leaves the room.

The "map sector" setting means something different per game (gravity-well
layout, race track, or board layout); the lobby shows the note for the
selected game.

---

## Other features

- Unique usernames (case-insensitive), scrypt password hashes, HTTP-only
  session cookies, ship + colour customisation.
- Friend search, friend requests (accept / decline / remove), online and
  in-room status, room invites.
- Public and private rooms with shareable codes (`/room/CODE`), host controls,
  ready-up, optional bot fill.
- Room text chat, global chat, and WebRTC voice chat (mute, deafen, speaking
  indicators, listen-only fallback when no microphone is available).

---

## What has and has not been tested

Tested in this repository's sandbox against a running production build:

- **API tests (29 checks):** a complete Hex Dominion game through the HTTP
  API, illegal-move / wrong-turn / spectator / anonymous rejections, the 30s
  turn timer, leaver autopilot, exactly-once XP, and the result endpoint.
- **Headless-browser tests with separate logged-in users:** hosting and
  launching every game, keyboard and mouse input, a second player joining a
  live match, an arena match running to its timer, a full Prism Rush race, and
  voice chat between two browser contexts using fake microphones (connection
  established and audio bytes flowing both ways).
- **Rules libraries:** bot-vs-bot Hex games on every board for 2/3/4 players,
  and bot lap simulations on every track.

**Not tested — treat as unverified:**

- **Anything on Cloudflare.** The relay Worker in `cloudflare-worker/` has
  never been type-checked, run or deployed, and the Next.js app has never been
  built with OpenNext or run on Workers. See the caveats below before relying
  on it.
- **Voice chat across real networks.** Only two browser contexts on one
  machine were tested. Voice uses public STUN servers and has **no TURN
  server**, so it will fail for some users behind strict NATs or firewalls.
- **Real devices, real latency, mobile.** There are no touch controls; the
  arena and racing games need a keyboard (and mouse for the arena).
- Play-testing by humans. Difficulty and balance are tuned from simulation.

---

## Known limitations

- **Arena and racing scores are reported by the players' browsers.** The
  server only accepts one result per match, from a pilot in the room, for
  pilots in the room, with capped values — but a modified client can still
  report a high score. Hex Dominion is not affected (the server decides).
- **Bots and the match clock in the arena and racing games run in the host's
  browser.** If the host leaves mid-match the bots stop; the match is still
  closed by another client a few seconds after the time limit.
- **The built-in realtime bus is in-memory**, so the app must run as a single
  server process. Room pages also re-sync room state every 3 seconds as a
  fallback.
- A room seats at most 4 players in Hex Dominion; extra pilots spectate.

---

## Local development

```bash
cp .env.example .env        # then edit DATABASE_URL / AUTH_SECRET
npm install
npx drizzle-kit push        # creates/updates tables (includes game_states)
npm run dev
```

On a fresh database two demo accounts are seeded: `NovaValkyrie` and
`ApexZephyr` (password `aether2026`). Change or remove them before going
public — see `src/lib/seed.ts`.

Fonts are self-hosted in `src/app/fonts/` (Orbitron, Space Grotesk and
JetBrains Mono, all SIL Open Font License), so the build makes no network
requests.

### Environment variables

| Name | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | Long random string used when hashing session tokens |
| `COOKIE_SECURE` | Set to `true` when served over HTTPS in production |
| `NEXT_PUBLIC_CF_WORKER_WS_URL` | Optional `wss://` URL of the relay Worker |

---

## Push to Git

```bash
git init
git add .
git commit -m "Aetherweave multiplayer game hub"
git branch -M main
git remote add origin https://github.com/<your-username>/aetherweave.git
git push -u origin main
```

If you upgrade an existing database, run `npx drizzle-kit push` again: this
version adds the `game_states` table.

---

## Deploying

### Option A — any Node host (the tested configuration)

Run it as one Node process next to a PostgreSQL database
(`npm run build && npm run start`). This is the setup everything above was
tested on.

### Option B — Cloudflare (included, but untested)

The files are in the repository, but none of this has been run:

1. **Relay Worker** (`cloudflare-worker/`): a Durable Object per room that
   relays game state, room chat and voice signalling over WebSockets.
   ```bash
   cd cloudflare-worker
   npm install
   npm run typecheck      # has not been run yet — fix anything it reports
   npx wrangler login
   npx wrangler deploy
   ```
   Set `NEXT_PUBLIC_CF_WORKER_WS_URL=wss://aetherweave-relay.<subdomain>.workers.dev`
   in the app. The relay accepts any connection and trusts the `userId` in the
   URL, so add authentication before using it publicly.
2. **Next.js app on Workers** (`wrangler.jsonc`, `open-next.config.ts`,
   `.github/workflows/deploy-cloudflare.yml`):
   ```bash
   npm install --no-save @opennextjs/cloudflare wrangler
   npx @opennextjs/cloudflare build
   npx wrangler deploy
   ```
   Expect to make changes first:
   - `src/db/index.ts` keeps one global `pg` connection pool. Workers generally
     need a connection per request (or Cloudflare Hyperdrive).
   - The built-in event stream (`/api/rooms/[code]/stream`) relies on the
     in-memory bus and will not work across Worker isolates. With the relay
     URL set, game traffic goes through the Durable Object instead and lobby
     state syncs through the 3-second polling fallback.
   - Hex Dominion only uses plain HTTP requests and PostgreSQL.

A lower-risk split is to host the Next.js app on a Node host (Option A) and
use only the Cloudflare relay Worker for realtime traffic.

---

## Project layout

- `src/app` — pages and API routes (auth, friends, rooms, chat, sync, board)
- `src/components` — hub, room screen, and the game components in `game/`
- `src/lib/hex-game.ts`, `src/lib/race-track.ts` — pure, dependency-free rules
  and track code for the two newer games
- `src/lib/hex-server.ts` — server-side Hex Dominion storage and turn logic
- `src/db/schema.ts` — Drizzle schema
- `cloudflare-worker/` — optional relay Worker + Durable Object
