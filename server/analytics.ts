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
