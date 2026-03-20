# Multi-User Browser Play — Roadmap & Architecture Plan

**Created:** March 19, 2026
**Status:** Planning — not yet implemented

---

## Current State (as of March 19, 2026)

### What works
- `/play` page lets anyone click "Play Now", download a 300MB Qwen 0.5B model via WebLLM, and fight with an LLM-controlled browser agent
- The server supports **unlimited concurrent matches** — the matchmaker pairs agents FIFO, creating a new match every time 2 agents are in the queue
- If 10 people click Play simultaneously, 5 matches run in parallel. No one waits beyond a few seconds.
- Each match runs independently on the server with its own tick loop
- The brain log panel shows tick-by-tick LLM inference on the `/play` page

### What doesn't work
- **No player identity** — every page refresh generates a random name (`WebClaw-XXXX`). No history, no persistence.
- **No duplicate prevention** — one person can open 10 tabs and queue 10 agents
- **Arena iframe shows one match** — the embedded spectator view tracks a single `activeMatchId`. With multiple concurrent matches, players see someone else's fight, not their own.
- **No rating system** — a brand new player fights the same opponents as a veteran. No skill-based matchmaking.
- **No reconnection** — if you refresh mid-fight, you forfeit and start over

### Concurrency model
- Bun's single-threaded event loop handles all WebSocket connections and match ticks
- Each match ticks every 400ms (`TICK_MS`), runs for 150 ticks (60 seconds)
- With 50 concurrent matches, that's 50 tick callbacks per 400ms — well within Bun's capacity
- The real bottleneck would be spectator broadcasts: each tick sends `match_state` to all spectators. With 100 spectators and 50 matches, that's 5000 messages per tick. This scales linearly and would need attention at ~100+ concurrent matches.

---

## Phase 1: Browser Player Identity (localStorage UUID)

**Goal:** Returning visitors are recognized. Same browser = same fighter.

### Changes

**Client (`play-agent.ts` / `play.html`):**
- On first visit, generate a `playerId` UUID, store in `localStorage`
- Also persist the chosen name in `localStorage`
- Send `playerId` with the `register` message: `{ type: "register", name, key, playerId }`
- On page load, restore name from `localStorage` into the input field
- Show persistent stats below the name input: rating, record, streak

**Server (`agent-connection.ts`):**
- Accept `playerId` from `register` message
- If a WebSocket with the same `playerId` is already connected, close the old one with `{ type: "kicked", reason: "connected_elsewhere" }` — **last connection wins** (prevents duplicate tabs)
- Look up or create a player record in SQLite

**Server (new: `server/players.ts`):**
- SQLite table via `bun:sqlite`:
  ```sql
  CREATE TABLE players (
    id TEXT PRIMARY KEY,          -- the localStorage UUID
    name TEXT NOT NULL,
    rating INTEGER DEFAULT 1200,  -- Elo or Glicko-2
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    draws INTEGER DEFAULT 0,
    best_streak INTEGER DEFAULT 0,
    current_streak INTEGER DEFAULT 0,
    matches_played INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    last_seen TEXT DEFAULT (datetime('now'))
  );
  ```
- On match end, update both players' records
- Return player stats in a new `registered` response: `{ type: "registered", id, stats: { rating, wins, losses, ... } }`

### What this gives you
- "Welcome back, WebClaw-2ENL — Rating: 1247, Record: 14W 8L" on return visit
- One connection per person (no tab spam)
- Foundation for everything that follows

### Estimated scope
- ~3-4 hours. Small protocol addition, one new SQLite table, client localStorage logic.

---

## Phase 2: Your Own Arena View

**Goal:** Each player on `/play` sees their own fight, not a random match.

### The problem
The `/play` page embeds `/arena?embed=true` as an iframe. The arena renderer subscribes to the spectator WebSocket and shows whichever match it picks up. With multiple concurrent matches, you might watch someone else's fight while yours is happening off-screen.

### Options

**Option A: Filter arena by match ID (simplest)**
- When the agent gets `match_start`, pass the `matchId` to the iframe via `postMessage`
- The arena renderer filters `match_state` messages to only show that `matchId`
- Already partially implemented: `renderer.ts` has `activeMatchId` filtering (line 252)
- Just need the `/play` page to tell the iframe which match to watch
- URL param approach: reload iframe as `/arena?embed=true&match=match-42`

**Option B: Render fight directly on `/play` (no iframe)**
- The `/play` page already receives `game_state` from the agent WebSocket
- Add a lightweight Pixi.js renderer directly on the `/play` page
- Reuse the existing sprite engine code
- Pros: no iframe coordination, simpler, faster
- Cons: duplicates rendering code, larger bundle

**Option C: Dual WebSocket on `/play`**
- The `/play` page connects both an agent WSocket and a spectator WebSocket
- The spectator WS receives `match_state` with animations/events
- The agent WS is used for game logic
- The `/play` page renderer uses the spectator feed for display
- Pros: gets the full spectator experience (animation events, HP bars, effects)
- Cons: two WebSocket connections per player

**Recommendation:** Option A is the simplest path. Option B is the cleanest long-term.

### Estimated scope
- Option A: ~2 hours (postMessage bridge, iframe URL param)
- Option B: ~6 hours (extract renderer, integrate into play page)

---

## Phase 3: Match History & Fighter Profile Page

**Goal:** Every fighter has a public page. Shareable identity.

### Changes

**Server (new: `server/match-history.ts`):**
- SQLite table:
  ```sql
  CREATE TABLE match_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id TEXT NOT NULL,
    player1_id TEXT,
    player1_name TEXT NOT NULL,
    player2_id TEXT,
    player2_name TEXT NOT NULL,
    winner_name TEXT,           -- null = draw
    reason TEXT NOT NULL,       -- 'ko' or 'timeout'
    player1_rating_before INTEGER,
    player1_rating_after INTEGER,
    player2_rating_before INTEGER,
    player2_rating_after INTEGER,
    duration_ticks INTEGER,
    played_at TEXT DEFAULT (datetime('now'))
  );
  ```
- Record every match result (skip NPC-vs-NPC demos)

**Server route: `/fighter/[name]`**
- HTML page showing:
  - Fighter name, rating, W/L/D record
  - Rating graph over time (simple SVG or canvas chart)
  - Recent match history (last 20 matches)
  - Best streak, current streak
  - Platform badge (browser / iOS)
- Returns JSON at `/api/fighter/[name]` for programmatic access

**Client:**
- After each match on `/play`, show a "Share" button that copies the profile URL
- Link from the leaderboard entries to fighter profile pages

### What this gives you
- Social proof and virality: "I just hit 1400 Elo" with a shareable link
- Aligns with the roadmap's Fighter Card System

### Estimated scope
- ~6 hours. SQLite schema, profile page HTML, rating calculation, API endpoint.

---

## Phase 4: Smarter Matchmaking

**Goal:** Fair matches. Handle 5-50 concurrent players gracefully.

### Changes

**Rating-based pairing:**
- Replace pure FIFO with rating-window matching
- Each queued agent has a `queuedAt` timestamp and a `rating`
- Matchmaker runs every 500ms and pairs the closest-rated agents within a tolerance window
- Tolerance starts at ±100 Elo and widens by ±50 every 5 seconds of waiting
- After 15 seconds with no human match, offer NPC as "Practice Match" (unrated)

**Queue status broadcast:**
- New spectator message: `{ type: "queue_status", playersOnline, queueSize, activeMatches }`
- `/play` page shows: "4 players online, 2 matches in progress"
- Landing page shows live player count

**Unrated NPC matches:**
- Matches vs NPC are clearly labeled and don't affect rating
- Only human-vs-human matches are rated
- Keeps the leaderboard meaningful

### What this gives you
- When posted on HN and 50 people click Play, they fight opponents at their level
- New players aren't immediately crushed by veterans

### Estimated scope
- ~4 hours. Matchmaker refactor, rating integration, queue status messages.

---

## Phase 5: Soul File & Progression

**Goal:** Your fighter has a history, personality, and growth arc.

### The soul file
A JSON document per player, stored server-side (keyed by `playerId`), representing everything about this fighter:

```json
{
  "id": "uuid-here",
  "name": "WebClaw-2ENL",
  "creature": "claw",
  "rating": 1347,
  "record": { "wins": 47, "losses": 31, "draws": 5 },
  "bestStreak": 8,
  "achievements": ["first_blood", "streak_5", "centurion"],
  "strategy": "aggressive-closer",
  "promptFingerprint": "sha256-abc...",
  "createdAt": "2026-03-19T...",
  "totalTicksPlayed": 12450,
  "favoriteAction": "special",
  "actionDistribution": {
    "punch": 0.31, "kick": 0.22, "special": 0.18,
    "block": 0.08, "jump": 0.05, "move_left": 0.08, "move_right": 0.08
  }
}
```

### Achievements / milestones
Unlocked automatically based on play:
- **First Blood** — Win your first match
- **Streak 5 / 10 / 20** — Win streak milestones
- **Centurion** — Play 100 matches
- **Glass Cannon** — Win a match at ≤10 HP
- **Untouchable** — Win without taking damage
- **Rivalry** — Fight the same opponent 5+ times
- **Closer** — Win 10 matches by KO (not timeout)
- **Iron Wall** — Block 50+ attacks across all matches

### Browser-side strategy evolution (stretch)
- Track which actions led to wins vs losses per distance/HP bracket
- Adjust the system prompt's strategy hints based on accumulated data
- Simpler than the iOS PromptEvolver — more like weighted action preferences
- Stored in the soul file, loaded on return visits

### Exportable
- "Download Soul File" button — exports JSON
- "Import Soul File" — restore fighter identity on a new device/browser
- Bridge to account system: soul file is what gets linked to an account

### Estimated scope
- ~8 hours. Achievement tracking, soul file schema, UI for displaying progression.

---

## Phase 6: Optional Account Linking (Lazy Registration)

**Goal:** Cross-device identity without upfront friction.

### The pattern
1. Player has been fighting with their `localStorage` UUID for weeks
2. They want to play on their phone or protect against clearing browser data
3. Offer "Save Your Fighter" — email or passkey-based account creation
4. All history, rating, achievements, soul file link to the account
5. iOS app can log in with the same account — one fighter across platforms
6. **Never required** — you can play forever without an account

### Implementation options

**Option A: Passkeys (WebAuthn)**
- No passwords. Biometric or device-based authentication.
- Modern, frictionless, supported by all major browsers (2025+)
- Slightly complex to implement but excellent UX

**Option B: Magic link (email)**
- Enter email → receive link → click to authenticate
- Simple to implement, familiar pattern
- Requires email sending service (Resend, Postmark, etc.)

**Option C: OAuth (Sign in with Apple / Google)**
- Lowest friction for users who already have accounts
- Requires third-party integration
- Sign in with Apple is required for iOS App Store if you offer any sign-in

**Recommendation:** Start with Option B (magic link) for web. Add Option C (Sign in with Apple) when the iOS app needs cross-device sync. Consider passkeys as the long-term ideal.

### Estimated scope
- ~12 hours. Auth flow, session management, account linking, iOS sync.

---

## Open Questions

1. **Creature selection for browser players** — When should browser players pick their creature type (claw, ink, spark, etc.)? Before fighting? After a certain number of matches? Does creature type affect gameplay or is it purely cosmetic at the sprite/identity level?

2. **Rating system choice** — Elo is simpler. Glicko-2 handles uncertainty better (new players' ratings settle faster). Lichess uses Glicko-2. Chess.com uses Glicko. Either works; Glicko-2 is ~50 more lines of code.

3. **Browser vs iOS fairness** — iOS runs MLX models (Qwen 3B) locally which are much stronger than the browser's WebLLM (Qwen 0.5B). Should they share a leaderboard? Options:
   - Single leaderboard (the model IS part of your fighter's identity — bigger brain = advantage, just like real sports)
   - Separate leaderboards per platform
   - Single leaderboard but show the model/platform as a badge

4. **What happens when the model gets too good?** — If someone brings a fine-tuned 3B model that wins 95% of matches, is that a problem or a feature? The tick timing (400ms) naturally caps how smart any model can be. This is similar to chess engine tournaments where the time control is the equalizer.

5. **Spectator experience with multiple matches** — Should `/arena` show all active matches (thumbnail grid)? Let spectators click to watch a specific match? Auto-cycle between matches? Currently it shows one match at a time.

---

## Implementation Order

```
Phase 1: Player Identity (localStorage UUID, SQLite, duplicate prevention)
   ↓
Phase 2: Your Own Arena View (see your match, not someone else's)
   ↓
Phase 3: Match History & Fighter Profile (/fighter/[name])
   ↓
Phase 4: Smarter Matchmaking (rating-based, queue status)
   ↓
Phase 5: Soul File & Progression (achievements, action stats)
   ↓
Phase 6: Account Linking (optional, cross-device)
```

Each phase is independently shippable and builds on the previous one. Phase 1 is the foundation. Phases 2 and 3 can be built in parallel. Phase 6 is only needed when cross-device play becomes a real user need.

---

## References & Inspirations

- **Battlesnake** (play.battlesnake.com) — Closest analog. Bring-your-own-AI competition with global leaderboard, 250ms time limit per turn. Proves the "any AI approach is valid" model works.
- **Lichess** (lichess.org) — Open-source chess. Anonymous play with optional account. Glicko-2 ratings. WebSocket-based real-time gameplay. Gold standard for progressive identity.
- **Chess.com** — Guest play with cookie-based identity. Demonstrates the lazy registration pattern at scale.
- **Slither.io / Agar.io** — Sharded server model for massive concurrency. Relevant if Arena Claw Fights grows beyond what a single server can handle.
- **Colyseus** (colyseus.io) — Game framework with built-in matchmaking, reconnection tokens, and seat reservation. Good reference implementation for WebSocket session management.
