import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";

// ─── Types ─────────────────────────────────────────────────────
export interface Player {
  id: string;
  name: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  matches_played: number;
  current_streak: number;
  best_streak: number;
  memory: string;
  created_at: string;
  last_seen: string;
}

export interface PlayersDb {
  getOrCreate(id: string, name: string): Player;
  getById(id: string): Player | null;
  updateAfterMatch(p1Id: string, p2Id: string, winnerId: string | null): void;
  getMemory(id: string): any;
  setMemory(id: string, memory: any): void;
  updateName(id: string, name: string): void;
  close(): void;
}

// ─── Elo Calculation ───────────────────────────────────────────
const K = 32;

export function calculateElo(
  ratingA: number,
  ratingB: number,
  result: "win" | "loss" | "draw"
): [number, number] {
  const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  const expectedB = 1 - expectedA;

  let actualA: number;
  let actualB: number;
  if (result === "win") {
    actualA = 1;
    actualB = 0;
  } else if (result === "loss") {
    actualA = 0;
    actualB = 1;
  } else {
    actualA = 0.5;
    actualB = 0.5;
  }

  const newA = Math.max(0, Math.round(ratingA + K * (actualA - expectedA)));
  const newB = Math.max(0, Math.round(ratingB + K * (actualB - expectedB)));
  return [newA, newB];
}

// ─── Name & Text Sanitization ──────────────────────────────────
export function sanitizeName(input: string): string | null {
  // Strip HTML tags
  let clean = input.replace(/<[^>]*>/g, "");
  // Strip control characters (keep printable + emoji)
  clean = clean.replace(/[\x00-\x1F\x7F]/g, "");
  // Allow: alphanumeric, spaces, hyphens, emoji
  clean = clean.replace(/[^\w\s\-\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, "");
  clean = clean.trim();
  if (clean.length === 0) return null;
  // Truncate to 20 chars
  if (clean.length > 20) clean = clean.slice(0, 20);
  return clean;
}

export function sanitizeText(input: string, maxLength: number = 200): string {
  // Strip script tags and their content
  let clean = input.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  // Strip remaining HTML tags
  clean = clean.replace(/<[^>]*>/g, "");
  // Strip control characters
  clean = clean.replace(/[\x00-\x1F\x7F]/g, "");
  clean = clean.trim();
  if (clean.length > maxLength) clean = clean.slice(0, maxLength);
  return clean;
}

// ─── Database ──────────────────────────────────────────────────
const MAX_MEMORY_BYTES = 2048;

export function createPlayersDb(dbPath: string = "data/players.db"): PlayersDb {
  // Ensure parent directory exists
  const dir = dbPath.substring(0, dbPath.lastIndexOf("/"));
  if (dir) mkdirSync(dir, { recursive: true });

  const db = new Database(dbPath);
  db.run("PRAGMA journal_mode = WAL");
  db.run(`
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      rating INTEGER NOT NULL DEFAULT 1200,
      wins INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0,
      draws INTEGER NOT NULL DEFAULT 0,
      matches_played INTEGER NOT NULL DEFAULT 0,
      current_streak INTEGER NOT NULL DEFAULT 0,
      best_streak INTEGER NOT NULL DEFAULT 0,
      memory TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const getStmt = db.prepare("SELECT * FROM players WHERE id = ?");
  const insertStmt = db.prepare(`
    INSERT INTO players (id, name) VALUES ($id, $name)
  `);
  const touchStmt = db.prepare(`
    UPDATE players SET last_seen = datetime('now') WHERE id = ?
  `);
  const updateWinStmt = db.prepare(`
    UPDATE players SET
      rating = $rating, wins = wins + 1, matches_played = matches_played + 1,
      current_streak = current_streak + 1,
      best_streak = MAX(best_streak, current_streak + 1),
      last_seen = datetime('now')
    WHERE id = $id
  `);
  const updateLossStmt = db.prepare(`
    UPDATE players SET
      rating = $rating, losses = losses + 1, matches_played = matches_played + 1,
      current_streak = 0,
      last_seen = datetime('now')
    WHERE id = $id
  `);
  const updateDrawStmt = db.prepare(`
    UPDATE players SET
      rating = $rating, draws = draws + 1, matches_played = matches_played + 1,
      last_seen = datetime('now')
    WHERE id = $id
  `);
  const getMemoryStmt = db.prepare("SELECT memory FROM players WHERE id = ?");
  const setMemoryStmt = db.prepare("UPDATE players SET memory = $memory WHERE id = $id");
  const updateNameStmt = db.prepare("UPDATE players SET name = $name WHERE id = $id");

  function rowToPlayer(row: any): Player {
    return {
      id: row.id,
      name: row.name,
      rating: row.rating,
      wins: row.wins,
      losses: row.losses,
      draws: row.draws,
      matches_played: row.matches_played,
      current_streak: row.current_streak,
      best_streak: row.best_streak,
      memory: row.memory,
      created_at: row.created_at,
      last_seen: row.last_seen,
    };
  }

  return {
    getOrCreate(id: string, name: string): Player {
      const existing = getStmt.get(id) as any;
      if (existing) {
        touchStmt.run(id);
        // Re-fetch to get updated last_seen
        return rowToPlayer(getStmt.get(id));
      }
      insertStmt.run({ $id: id, $name: name });
      return rowToPlayer(getStmt.get(id));
    },

    getById(id: string): Player | null {
      const row = getStmt.get(id) as any;
      return row ? rowToPlayer(row) : null;
    },

    updateAfterMatch(p1Id: string, p2Id: string, winnerId: string | null): void {
      const p1 = getStmt.get(p1Id) as any;
      const p2 = getStmt.get(p2Id) as any;
      if (!p1 || !p2) return;

      if (winnerId === null) {
        // Draw
        const [newR1, newR2] = calculateElo(p1.rating, p2.rating, "draw");
        updateDrawStmt.run({ $rating: newR1, $id: p1Id });
        updateDrawStmt.run({ $rating: newR2, $id: p2Id });
      } else if (winnerId === p1Id) {
        const [newR1, newR2] = calculateElo(p1.rating, p2.rating, "win");
        updateWinStmt.run({ $rating: newR1, $id: p1Id });
        updateLossStmt.run({ $rating: newR2, $id: p2Id });
      } else {
        const [newR1, newR2] = calculateElo(p1.rating, p2.rating, "loss");
        updateLossStmt.run({ $rating: newR1, $id: p1Id });
        updateWinStmt.run({ $rating: newR2, $id: p2Id });
      }
    },

    getMemory(id: string): any {
      const row = getMemoryStmt.get(id) as any;
      if (!row) return {};
      try {
        return JSON.parse(row.memory);
      } catch {
        return {};
      }
    },

    setMemory(id: string, memory: any): void {
      let json = JSON.stringify(memory);
      // Cap at MAX_MEMORY_BYTES — truncate by removing oldest rivals if needed
      if (json.length > MAX_MEMORY_BYTES) {
        // Best effort: trim rivals array
        if (memory.rivals && Array.isArray(memory.rivals)) {
          while (json.length > MAX_MEMORY_BYTES && memory.rivals.length > 0) {
            memory.rivals.pop();
            json = JSON.stringify(memory);
          }
        }
        // If still too large, store truncated JSON
        if (json.length > MAX_MEMORY_BYTES) {
          json = json.slice(0, MAX_MEMORY_BYTES);
        }
      }
      setMemoryStmt.run({ $memory: json, $id: id });
    },

    updateName(id: string, name: string): void {
      updateNameStmt.run({ $name: name, $id: id });
    },

    close(): void {
      db.close();
    },
  };
}
