import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";

interface AgentStats {
  name: string;
  winStreak: number;
  bestStreak: number;
  totalWins: number;
  totalLosses: number;
  lastActive: number;
}

// Ensure data directory exists
mkdirSync("data", { recursive: true });

const db = new Database("data/leaderboard.db");
db.run("PRAGMA journal_mode = WAL");
db.run(`
  CREATE TABLE IF NOT EXISTS agent_stats (
    name TEXT PRIMARY KEY,
    win_streak INTEGER NOT NULL DEFAULT 0,
    best_streak INTEGER NOT NULL DEFAULT 0,
    total_wins INTEGER NOT NULL DEFAULT 0,
    total_losses INTEGER NOT NULL DEFAULT 0,
    last_active INTEGER NOT NULL DEFAULT 0,
    day TEXT NOT NULL
  )
`);

const upsertStmt = db.prepare(`
  INSERT INTO agent_stats (name, win_streak, best_streak, total_wins, total_losses, last_active, day)
  VALUES ($name, $winStreak, $bestStreak, $totalWins, $totalLosses, $lastActive, $day)
  ON CONFLICT(name) DO UPDATE SET
    win_streak = $winStreak,
    best_streak = $bestStreak,
    total_wins = $totalWins,
    total_losses = $totalLosses,
    last_active = $lastActive,
    day = $day
`);

const loadStmt = db.prepare(`SELECT * FROM agent_stats WHERE day = ?`);
const cleanStmt = db.prepare(`DELETE FROM agent_stats WHERE day != ?`);

export function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export function loadStats(today: string): Map<string, AgentStats> {
  const map = new Map<string, AgentStats>();
  const rows = loadStmt.all(today) as Array<{
    name: string;
    win_streak: number;
    best_streak: number;
    total_wins: number;
    total_losses: number;
    last_active: number;
  }>;
  for (const row of rows) {
    map.set(row.name, {
      name: row.name,
      winStreak: row.win_streak,
      bestStreak: row.best_streak,
      totalWins: row.total_wins,
      totalLosses: row.total_losses,
      lastActive: row.last_active,
    });
  }
  return map;
}

export function saveStats(name: string, stats: AgentStats, today: string): void {
  upsertStmt.run({
    $name: name,
    $winStreak: stats.winStreak,
    $bestStreak: stats.bestStreak,
    $totalWins: stats.totalWins,
    $totalLosses: stats.totalLosses,
    $lastActive: stats.lastActive,
    $day: today,
  });
}

export function cleanOldDays(today: string): void {
  const result = cleanStmt.run(today);
  if (result.changes > 0) {
    console.log(`[Leaderboard] Cleaned ${result.changes} stale rows from previous days`);
  }
}
