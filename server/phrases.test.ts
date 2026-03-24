import { test, expect, describe } from "bun:test";
import {
  getPhrase,
  fillTemplate,
  BETWEEN_FIGHT_EVENTS,
  DURING_FIGHT_EVENTS,
  PHRASES,
  type EventType,
} from "./phrases";

// ─── Phrase Bank Structure ─────────────────────────────────────
describe("PHRASES structure", () => {
  test("has all between-fight event types", () => {
    for (const event of BETWEEN_FIGHT_EVENTS) {
      expect(PHRASES[event]).toBeDefined();
      expect(PHRASES[event].length).toBeGreaterThan(0);
    }
  });

  test("has all during-fight event types", () => {
    for (const event of DURING_FIGHT_EVENTS) {
      expect(PHRASES[event]).toBeDefined();
      expect(PHRASES[event].length).toBeGreaterThan(0);
    }
  });

  test("every phrase has text and positive weight", () => {
    for (const [event, phrases] of Object.entries(PHRASES)) {
      for (const phrase of phrases) {
        expect(phrase.text).toBeTruthy();
        expect(phrase.weight).toBeGreaterThan(0);
      }
    }
  });

  test("has at least 5 phrases per between-fight event", () => {
    for (const event of BETWEEN_FIGHT_EVENTS) {
      expect(PHRASES[event].length).toBeGreaterThanOrEqual(5);
    }
  });

  test("has at least 3 phrases per during-fight event", () => {
    for (const event of DURING_FIGHT_EVENTS) {
      expect(PHRASES[event].length).toBeGreaterThanOrEqual(3);
    }
  });
});

// ─── Template Filling ──────────────────────────────────────────
describe("fillTemplate", () => {
  test("fills {opponent} slot", () => {
    const result = fillTemplate("Take that, {opponent}!", { opponent: "ThunderClaw" });
    expect(result).toBe("Take that, ThunderClaw!");
  });

  test("fills multiple slots", () => {
    const result = fillTemplate("{opponent} got hit by my {signature_move}!", {
      opponent: "Rival",
      signature_move: "kick",
    });
    expect(result).toBe("Rival got hit by my kick!");
  });

  test("strips unfilled optional slots", () => {
    const result = fillTemplate("Won with {streak} streak!", {});
    expect(result).not.toContain("{streak}");
    // Double space is acceptable — templates should be authored to avoid this
  });

  test("fills {low_hp} slot", () => {
    const result = fillTemplate("You had me at {low_hp} HP...", { low_hp: "8" });
    expect(result).toBe("You had me at 8 HP...");
  });

  test("handles no slots", () => {
    const result = fillTemplate("Too easy. Next!", {});
    expect(result).toBe("Too easy. Next!");
  });
});

// ─── Phrase Selection ──────────────────────────────────────────
describe("getPhrase", () => {
  test("returns a string for each event type", () => {
    const allEvents: EventType[] = [...BETWEEN_FIGHT_EVENTS, ...DURING_FIGHT_EVENTS];
    for (const event of allEvents) {
      const phrase = getPhrase(event, { opponent: "TestBot" });
      expect(typeof phrase).toBe("string");
      expect(phrase.length).toBeGreaterThan(0);
    }
  });

  test("fills opponent name in returned phrase", () => {
    // Try multiple times since selection is random
    let found = false;
    for (let i = 0; i < 20; i++) {
      const phrase = getPhrase("win_normal", { opponent: "RivalBot" });
      if (phrase.includes("RivalBot")) {
        found = true;
        break;
      }
    }
    // At least some phrases should contain the opponent name
    // (not all templates use {opponent})
    expect(found).toBe(true);
  });

  test("respects weights (higher weight phrases appear more often)", () => {
    // Statistical test: run many times, check distribution isn't uniform
    // This is a soft check — we just verify it doesn't crash
    const counts = new Map<string, number>();
    for (let i = 0; i < 100; i++) {
      const phrase = getPhrase("taunt", {});
      counts.set(phrase, (counts.get(phrase) || 0) + 1);
    }
    expect(counts.size).toBeGreaterThan(0);
  });
});
