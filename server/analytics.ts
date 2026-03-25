import { Database } from "bun:sqlite";
import { join } from "path";
import { mkdirSync } from "fs";

const dataDir = join(import.meta.dir, "..", "data");
mkdirSync(dataDir, { recursive: true });

const db = new Database(join(dataDir, "analytics.db"));
db.run("PRAGMA journal_mode = WAL");
db.run(`
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event TEXT NOT NULL,
    player_id TEXT,
    metadata TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

const insertStmt = db.prepare(
  "INSERT INTO events (event, player_id, metadata) VALUES (?, ?, ?)"
);

export function trackEvent(event: string, playerId?: string, metadata?: Record<string, any>) {
  insertStmt.run(event, playerId ?? null, metadata ? JSON.stringify(metadata) : null);
}

const countStmt = db.prepare(`
  SELECT event, count(*) as count FROM events
  WHERE created_at >= datetime('now', ?)
  GROUP BY event
`);

export function getEventCounts(since: string = "-30 days"): Record<string, number> {
  const rows = countStmt.all(since) as { event: string; count: number }[];
  const result: Record<string, number> = {};
  for (const row of rows) {
    result[row.event] = row.count;
  }
  return result;
}

export function getStats() {
  return {
    today: getEventCounts("-1 day"),
    week: getEventCounts("-7 days"),
    month: getEventCounts("-30 days"),
  };
}
