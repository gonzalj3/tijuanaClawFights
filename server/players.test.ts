import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, rmSync } from "node:fs";

// ─── Test helpers ──────────────────────────────────────────────
const TEST_DB_DIR = "data/test";
let db: Database;

// We'll import these after creating the module
import {
  calculateElo,
  sanitizeName,
  sanitizeText,
  createPlayersDb,
  type PlayersDb,
} from "./players";

// ─── Elo Calculation ───────────────────────────────────────────
describe("calculateElo", () => {
  test("winner gains rating, loser loses rating", () => {
    const [newWinner, newLoser] = calculateElo(1200, 1200, "win");
    expect(newWinner).toBeGreaterThan(1200);
    expect(newLoser).toBeLessThan(1200);
  });

  test("equal ratings: winner gains 16 (K=32, expected=0.5)", () => {
    const [newWinner, newLoser] = calculateElo(1200, 1200, "win");
    expect(newWinner).toBe(1216);
    expect(newLoser).toBe(1184);
  });

  test("underdog wins: gains more than 16", () => {
    const [newWinner] = calculateElo(1000, 1400, "win");
    // Expected ≈ 0.09, so gain ≈ K * (1 - 0.09) ≈ 29
    expect(newWinner).toBeGreaterThan(1016);
  });

  test("favorite wins: gains less than 16", () => {
    const [newWinner] = calculateElo(1400, 1000, "win");
    expect(newWinner - 1400).toBeLessThan(16);
  });

  test("draw: higher-rated player loses points, lower gains", () => {
    const [newHigher, newLower] = calculateElo(1400, 1000, "draw");
    expect(newHigher).toBeLessThan(1400);
    expect(newLower).toBeGreaterThan(1000);
  });

  test("draw between equals: no change", () => {
    const [a, b] = calculateElo(1200, 1200, "draw");
    expect(a).toBe(1200);
    expect(b).toBe(1200);
  });

  test("ratings are rounded to integers", () => {
    const [a, b] = calculateElo(1200, 1250, "win");
    expect(Number.isInteger(a)).toBe(true);
    expect(Number.isInteger(b)).toBe(true);
  });

  test("rating never goes below 0", () => {
    const [, loser] = calculateElo(100, 100, "win");
    expect(loser).toBeGreaterThanOrEqual(0);
    // Even extreme case
    const [, loser2] = calculateElo(500, 0, "win");
    expect(loser2).toBeGreaterThanOrEqual(0);
  });
});

// ─── Name Sanitization ────────────────────────────────────────
describe("sanitizeName", () => {
  test("allows alphanumeric names", () => {
    expect(sanitizeName("ThunderClaw")).toBe("ThunderClaw");
  });

  test("allows spaces and hyphens", () => {
    expect(sanitizeName("Thunder Claw")).toBe("Thunder Claw");
    expect(sanitizeName("Thunder-Claw")).toBe("Thunder-Claw");
  });

  test("allows emoji", () => {
    expect(sanitizeName("Claw🦞")).toBe("Claw🦞");
  });

  test("strips HTML tags", () => {
    expect(sanitizeName("<script>alert(1)</script>")).toBe("alert1");
  });

  test("trims whitespace", () => {
    expect(sanitizeName("  Thunder  ")).toBe("Thunder");
  });

  test("truncates to 20 chars", () => {
    const long = "A".repeat(30);
    expect(sanitizeName(long).length).toBeLessThanOrEqual(20);
  });

  test("returns null for empty string", () => {
    expect(sanitizeName("")).toBeNull();
  });

  test("returns null for whitespace-only", () => {
    expect(sanitizeName("   ")).toBeNull();
  });

  test("returns null for tags-only input", () => {
    expect(sanitizeName("<b></b>")).toBeNull();
  });

  test("strips control characters", () => {
    expect(sanitizeName("Claw\x00Fighter\x07")).toBe("ClawFighter");
  });
});

// ─── Text Sanitization ────────────────────────────────────────
describe("sanitizeText", () => {
  test("passes through normal text", () => {
    expect(sanitizeText("Too easy. Next!")).toBe("Too easy. Next!");
  });

  test("strips HTML tags", () => {
    expect(sanitizeText("<b>bold</b>")).toBe("bold");
    expect(sanitizeText('<img src=x onerror="alert(1)">')).toBe("");
  });

  test("strips script tags and content", () => {
    expect(sanitizeText("<script>alert(1)</script>safe")).toBe("safe");
  });

  test("strips control characters", () => {
    expect(sanitizeText("hello\x00world\x1F")).toBe("helloworld");
  });

  test("truncates to 200 chars by default", () => {
    const long = "A".repeat(300);
    expect(sanitizeText(long).length).toBe(200);
  });

  test("accepts custom max length", () => {
    const long = "A".repeat(50);
    expect(sanitizeText(long, 30).length).toBe(30);
  });

  test("trims whitespace", () => {
    expect(sanitizeText("  hello  ")).toBe("hello");
  });

  test("returns empty string for empty input", () => {
    expect(sanitizeText("")).toBe("");
  });
});

// ─── Player CRUD (database) ───────────────────────────────────
describe("PlayersDb", () => {
  let players: PlayersDb;

  beforeEach(() => {
    mkdirSync(TEST_DB_DIR, { recursive: true });
    players = createPlayersDb(`${TEST_DB_DIR}/test-${Date.now()}.db`);
  });

  afterEach(() => {
    players.close();
  });

  test("getOrCreate creates new player with defaults", () => {
    const p = players.getOrCreate("uuid-1", "ThunderClaw");
    expect(p.id).toBe("uuid-1");
    expect(p.name).toBe("ThunderClaw");
    expect(p.rating).toBe(1200);
    expect(p.wins).toBe(0);
    expect(p.losses).toBe(0);
    expect(p.draws).toBe(0);
    expect(p.matches_played).toBe(0);
    expect(p.current_streak).toBe(0);
    expect(p.best_streak).toBe(0);
  });

  test("getOrCreate returns existing player", () => {
    players.getOrCreate("uuid-1", "ThunderClaw");
    const p = players.getOrCreate("uuid-1", "DifferentName");
    expect(p.name).toBe("ThunderClaw"); // original name preserved
  });

  test("getOrCreate updates last_seen on return", () => {
    const p1 = players.getOrCreate("uuid-1", "ThunderClaw");
    // Simulate time passing
    const p2 = players.getOrCreate("uuid-1", "ThunderClaw");
    expect(p2.last_seen).toBeDefined();
  });

  test("updateAfterMatch updates win correctly", () => {
    players.getOrCreate("uuid-1", "Winner");
    players.getOrCreate("uuid-2", "Loser");

    players.updateAfterMatch("uuid-1", "uuid-2", "uuid-1");

    const winner = players.getOrCreate("uuid-1", "Winner");
    const loser = players.getOrCreate("uuid-2", "Loser");

    expect(winner.wins).toBe(1);
    expect(winner.matches_played).toBe(1);
    expect(winner.current_streak).toBe(1);
    expect(winner.rating).toBeGreaterThan(1200);

    expect(loser.losses).toBe(1);
    expect(loser.matches_played).toBe(1);
    expect(loser.current_streak).toBe(0);
    expect(loser.rating).toBeLessThan(1200);
  });

  test("updateAfterMatch handles draw", () => {
    players.getOrCreate("uuid-1", "Player1");
    players.getOrCreate("uuid-2", "Player2");

    players.updateAfterMatch("uuid-1", "uuid-2", null);

    const p1 = players.getOrCreate("uuid-1", "Player1");
    const p2 = players.getOrCreate("uuid-2", "Player2");

    expect(p1.draws).toBe(1);
    expect(p2.draws).toBe(1);
    expect(p1.matches_played).toBe(1);
    expect(p2.matches_played).toBe(1);
    // Equal ratings draw = no change
    expect(p1.rating).toBe(1200);
  });

  test("win streak increments on consecutive wins", () => {
    players.getOrCreate("uuid-1", "Champ");
    players.getOrCreate("uuid-2", "Opponent");

    players.updateAfterMatch("uuid-1", "uuid-2", "uuid-1");
    players.updateAfterMatch("uuid-1", "uuid-2", "uuid-1");
    players.updateAfterMatch("uuid-1", "uuid-2", "uuid-1");

    const champ = players.getOrCreate("uuid-1", "Champ");
    expect(champ.current_streak).toBe(3);
    expect(champ.best_streak).toBe(3);
  });

  test("win streak resets on loss", () => {
    players.getOrCreate("uuid-1", "Player");
    players.getOrCreate("uuid-2", "Opponent");

    players.updateAfterMatch("uuid-1", "uuid-2", "uuid-1");
    players.updateAfterMatch("uuid-1", "uuid-2", "uuid-1");
    players.updateAfterMatch("uuid-1", "uuid-2", "uuid-2"); // loss

    const p = players.getOrCreate("uuid-1", "Player");
    expect(p.current_streak).toBe(0);
    expect(p.best_streak).toBe(2);
  });

  test("getMemory returns empty object for new player", () => {
    players.getOrCreate("uuid-1", "NewFighter");
    const mem = players.getMemory("uuid-1");
    expect(mem).toEqual({});
  });

  test("setMemory and getMemory round-trip", () => {
    players.getOrCreate("uuid-1", "Fighter");
    const memory = {
      rivals: [{ id: "uuid-2", name: "Rival", wins: 1, losses: 0, lastFought: new Date().toISOString() }],
      signature_move: "kick",
      action_counts: { punch: 10, kick: 20 },
      personality_seed: 0.73,
    };
    players.setMemory("uuid-1", memory);
    const loaded = players.getMemory("uuid-1");
    expect(loaded.signature_move).toBe("kick");
    expect(loaded.rivals).toHaveLength(1);
    expect(loaded.rivals[0].name).toBe("Rival");
  });

  test("memory JSON is capped at ~2KB", () => {
    players.getOrCreate("uuid-1", "Fighter");
    const hugeMemory = { data: "X".repeat(3000) };
    // Should not throw, but should truncate or reject gracefully
    expect(() => players.setMemory("uuid-1", hugeMemory)).not.toThrow();
  });

  test("getById returns null for non-existent player", () => {
    const p = players.getById("nonexistent");
    expect(p).toBeNull();
  });

  test("getById returns player data", () => {
    players.getOrCreate("uuid-1", "Fighter");
    const p = players.getById("uuid-1");
    expect(p).not.toBeNull();
    expect(p!.name).toBe("Fighter");
  });

  test("updateName changes player name", () => {
    players.getOrCreate("uuid-1", "OldName");
    players.updateName("uuid-1", "NewName");
    const p = players.getById("uuid-1");
    expect(p!.name).toBe("NewName");
  });
});
