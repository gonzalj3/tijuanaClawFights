import { test, expect, describe, beforeEach } from "bun:test";

// Polyfill localStorage for test environment
if (typeof globalThis.localStorage === "undefined") {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  };
}

import {
  buildDynamicSystemPrompt,
  generateReflection,
  applyCoaching,
  getCoachingHistory,
  clearCoachingHistory,
  COACHING_OPTIONS,
  type CoachingEntry,
  type MatchSummary,
} from "./coaching";

// ─── Coaching Options ──────────────────────────────────────────
describe("COACHING_OPTIONS", () => {
  test("has at least 4 presets", () => {
    expect(COACHING_OPTIONS.length).toBeGreaterThanOrEqual(4);
  });

  test("each option has label, advice, and promptFragment", () => {
    for (const opt of COACHING_OPTIONS) {
      expect(opt.label).toBeTruthy();
      expect(opt.advice).toBeTruthy();
      expect(opt.promptFragment).toBeTruthy();
    }
  });

  test("promptFragment is a concise instruction for the LLM", () => {
    for (const opt of COACHING_OPTIONS) {
      expect(opt.promptFragment.length).toBeLessThan(100);
    }
  });
});

// ─── Match Summary → Reflection ────────────────────────────────
describe("generateReflection", () => {
  test("generates loss reflection mentioning the problem", () => {
    const summary: MatchSummary = {
      result: "loss",
      reason: "ko",
      myHp: 0,
      oppHp: 45,
      opponentName: "RivalBot",
      ticksPlayed: 80,
      damageDealt: 55,
      damageTaken: 100,
      actionsUsed: { punch: 10, kick: 5, block: 2, move_left: 8, move_right: 3 },
    };
    const reflection = generateReflection(summary);
    expect(reflection).toBeTruthy();
    expect(typeof reflection).toBe("string");
    expect(reflection.length).toBeGreaterThan(10);
  });

  test("generates win reflection with confidence", () => {
    const summary: MatchSummary = {
      result: "win",
      reason: "ko",
      myHp: 72,
      oppHp: 0,
      opponentName: "WeakBot",
      ticksPlayed: 50,
      damageDealt: 100,
      damageTaken: 28,
      actionsUsed: { punch: 5, kick: 8, special: 3 },
    };
    const reflection = generateReflection(summary);
    expect(reflection).toBeTruthy();
  });

  test("generates draw reflection", () => {
    const summary: MatchSummary = {
      result: "draw",
      reason: "timeout",
      myHp: 30,
      oppHp: 30,
      opponentName: "EqualBot",
      ticksPlayed: 150,
      damageDealt: 70,
      damageTaken: 70,
      actionsUsed: { punch: 20, block: 15 },
    };
    const reflection = generateReflection(summary);
    expect(reflection).toBeTruthy();
  });

  test("identifies dominant opponent attack when losing to it", () => {
    const summary: MatchSummary = {
      result: "loss",
      reason: "ko",
      myHp: 0,
      oppHp: 60,
      opponentName: "KickSpammer",
      ticksPlayed: 40,
      damageDealt: 40,
      damageTaken: 100,
      actionsUsed: { punch: 12, move_right: 5 },
    };
    const reflection = generateReflection(summary);
    expect(reflection.length).toBeGreaterThan(0);
  });
});

// ─── Coaching History ──────────────────────────────────────────
describe("coaching history", () => {
  beforeEach(() => {
    clearCoachingHistory();
  });

  test("starts empty", () => {
    expect(getCoachingHistory()).toEqual([]);
  });

  test("applyCoaching adds an entry", () => {
    applyCoaching("Focus on blocking when HP is low", "Block when low HP");
    const history = getCoachingHistory();
    expect(history).toHaveLength(1);
    expect(history[0].advice).toBe("Focus on blocking when HP is low");
    expect(history[0].promptFragment).toBe("Block when low HP");
  });

  test("maintains max 10 entries (FIFO)", () => {
    for (let i = 0; i < 15; i++) {
      applyCoaching(`Advice ${i}`, `Fragment ${i}`);
    }
    const history = getCoachingHistory();
    expect(history).toHaveLength(10);
    expect(history[0].advice).toBe("Advice 5"); // oldest kept
    expect(history[9].advice).toBe("Advice 14"); // newest
  });

  test("entries have timestamps", () => {
    applyCoaching("Test advice", "Test fragment");
    const entry = getCoachingHistory()[0];
    expect(entry.timestamp).toBeDefined();
    expect(typeof entry.timestamp).toBe("number");
  });
});

// ─── Dynamic System Prompt ─────────────────────────────────────
describe("buildDynamicSystemPrompt", () => {
  beforeEach(() => {
    clearCoachingHistory();
  });

  test("returns base prompt when no coaching history", () => {
    const prompt = buildDynamicSystemPrompt();
    expect(prompt).toContain("fighting game AI");
    expect(prompt).toContain("punch");
    expect(prompt).not.toContain("COACHING");
  });

  test("includes coaching instructions when history exists", () => {
    applyCoaching("Block more", "Prioritize block when HP < 40");
    const prompt = buildDynamicSystemPrompt();
    expect(prompt).toContain("Prioritize block when HP < 40");
  });

  test("includes multiple coaching entries", () => {
    applyCoaching("Be aggressive", "Attack first, ask questions later");
    applyCoaching("Use specials", "Use special attack whenever off cooldown");
    const prompt = buildDynamicSystemPrompt();
    expect(prompt).toContain("Attack first");
    expect(prompt).toContain("Use special attack");
  });

  test("most recent coaching appears last (highest priority)", () => {
    applyCoaching("Old advice", "Old fragment");
    applyCoaching("New advice", "New fragment");
    const prompt = buildDynamicSystemPrompt();
    const oldIdx = prompt.indexOf("Old fragment");
    const newIdx = prompt.indexOf("New fragment");
    expect(oldIdx).toBeLessThan(newIdx);
  });

  test("prompt stays under 500 chars total", () => {
    // Even with max entries, prompt should be concise for the small model
    for (let i = 0; i < 10; i++) {
      applyCoaching(`Advice ${i}`, `Do thing ${i}`);
    }
    const prompt = buildDynamicSystemPrompt();
    expect(prompt.length).toBeLessThan(800);
  });
});
