import { test, expect, describe, beforeEach } from "bun:test";
import {
  createFighterMemory,
  updateMemoryAfterMatch,
  getSignatureMove,
  getRivalRecord,
  type FighterMemory,
  type MatchRecord,
} from "./fighter-memory";

describe("createFighterMemory", () => {
  test("returns empty memory structure", () => {
    const mem = createFighterMemory();
    expect(mem.rivals).toEqual([]);
    expect(mem.action_counts).toEqual({});
    expect(mem.signature_move).toBe(null);
    expect(mem.total_damage_dealt).toBe(0);
    expect(mem.total_damage_taken).toBe(0);
    expect(mem.best_comeback_hp).toBe(100);
    expect(mem.total_matches).toBe(0);
  });
});

describe("updateMemoryAfterMatch", () => {
  let mem: FighterMemory;
  const baseMatch: MatchRecord = {
    opponentId: "opp-1",
    opponentName: "RivalBot",
    result: "win",
    damageDealt: 80,
    damageTaken: 40,
    actionsUsed: { punch: 10, kick: 5, special: 2 },
    myMinHp: 60,
    ticksPlayed: 50,
  };

  beforeEach(() => {
    mem = createFighterMemory();
  });

  test("adds a new rival on first encounter", () => {
    const updated = updateMemoryAfterMatch(mem, baseMatch);
    expect(updated.rivals).toHaveLength(1);
    expect(updated.rivals[0].id).toBe("opp-1");
    expect(updated.rivals[0].name).toBe("RivalBot");
    expect(updated.rivals[0].wins).toBe(1);
    expect(updated.rivals[0].losses).toBe(0);
  });

  test("updates existing rival record", () => {
    let updated = updateMemoryAfterMatch(mem, baseMatch);
    updated = updateMemoryAfterMatch(updated, { ...baseMatch, result: "loss" });
    expect(updated.rivals).toHaveLength(1);
    expect(updated.rivals[0].wins).toBe(1);
    expect(updated.rivals[0].losses).toBe(1);
  });

  test("tracks draws for rivals", () => {
    const updated = updateMemoryAfterMatch(mem, { ...baseMatch, result: "draw" });
    expect(updated.rivals[0].wins).toBe(0);
    expect(updated.rivals[0].losses).toBe(0);
    expect(updated.rivals[0].draws).toBe(1);
  });

  test("accumulates action counts", () => {
    let updated = updateMemoryAfterMatch(mem, baseMatch);
    updated = updateMemoryAfterMatch(updated, {
      ...baseMatch,
      actionsUsed: { punch: 5, block: 8 },
    });
    expect(updated.action_counts).toEqual({ punch: 15, kick: 5, special: 2, block: 8 });
  });

  test("updates signature_move to most used action", () => {
    const updated = updateMemoryAfterMatch(mem, {
      ...baseMatch,
      actionsUsed: { kick: 20, punch: 3 },
    });
    expect(updated.signature_move).toBe("kick");
  });

  test("accumulates total damage", () => {
    let updated = updateMemoryAfterMatch(mem, baseMatch);
    updated = updateMemoryAfterMatch(updated, baseMatch);
    expect(updated.total_damage_dealt).toBe(160);
    expect(updated.total_damage_taken).toBe(80);
  });

  test("tracks best comeback (lowest HP survived)", () => {
    let updated = updateMemoryAfterMatch(mem, {
      ...baseMatch,
      result: "win",
      myMinHp: 8,
    });
    expect(updated.best_comeback_hp).toBe(8);

    // Higher min HP shouldn't replace lower
    updated = updateMemoryAfterMatch(updated, {
      ...baseMatch,
      result: "win",
      myMinHp: 30,
    });
    expect(updated.best_comeback_hp).toBe(8);
  });

  test("only updates best_comeback_hp on wins", () => {
    const updated = updateMemoryAfterMatch(mem, {
      ...baseMatch,
      result: "loss",
      myMinHp: 5,
    });
    expect(updated.best_comeback_hp).toBe(100); // unchanged
  });

  test("increments total_matches", () => {
    let updated = updateMemoryAfterMatch(mem, baseMatch);
    updated = updateMemoryAfterMatch(updated, baseMatch);
    expect(updated.total_matches).toBe(2);
  });

  test("caps rivals at 5 (LRU eviction)", () => {
    let updated = mem;
    for (let i = 0; i < 7; i++) {
      updated = updateMemoryAfterMatch(updated, {
        ...baseMatch,
        opponentId: `opp-${i}`,
        opponentName: `Bot${i}`,
      });
    }
    expect(updated.rivals).toHaveLength(5);
    // Most recent should be present
    expect(updated.rivals.some((r) => r.id === "opp-6")).toBe(true);
    // Oldest should be evicted
    expect(updated.rivals.some((r) => r.id === "opp-0")).toBe(false);
    expect(updated.rivals.some((r) => r.id === "opp-1")).toBe(false);
  });

  test("LRU eviction keeps most recently fought rivals", () => {
    let updated = mem;
    // Fight opp-0 through opp-4
    for (let i = 0; i < 5; i++) {
      updated = updateMemoryAfterMatch(updated, {
        ...baseMatch,
        opponentId: `opp-${i}`,
        opponentName: `Bot${i}`,
      });
    }
    // Fight opp-0 again (refreshes it)
    updated = updateMemoryAfterMatch(updated, {
      ...baseMatch,
      opponentId: "opp-0",
      opponentName: "Bot0",
    });
    // Add opp-5 (should evict opp-1, not opp-0)
    updated = updateMemoryAfterMatch(updated, {
      ...baseMatch,
      opponentId: "opp-5",
      opponentName: "Bot5",
    });
    expect(updated.rivals).toHaveLength(5);
    expect(updated.rivals.some((r) => r.id === "opp-0")).toBe(true);
    expect(updated.rivals.some((r) => r.id === "opp-1")).toBe(false);
  });

  test("updates lastFought timestamp on rival", () => {
    const before = Date.now();
    const updated = updateMemoryAfterMatch(mem, baseMatch);
    const after = Date.now();
    const ts = new Date(updated.rivals[0].lastFought).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});

describe("getSignatureMove", () => {
  test("returns null for empty memory", () => {
    expect(getSignatureMove(createFighterMemory())).toBe(null);
  });

  test("returns most used action", () => {
    const mem = createFighterMemory();
    mem.action_counts = { punch: 50, kick: 80, special: 20 };
    mem.signature_move = "kick";
    expect(getSignatureMove(mem)).toBe("kick");
  });
});

describe("getRivalRecord", () => {
  test("returns null for unknown opponent", () => {
    expect(getRivalRecord(createFighterMemory(), "unknown-id")).toBe(null);
  });

  test("returns rival record for known opponent", () => {
    let mem = createFighterMemory();
    mem = updateMemoryAfterMatch(mem, {
      opponentId: "rival-1",
      opponentName: "Nemesis",
      result: "loss",
      damageDealt: 30,
      damageTaken: 100,
      actionsUsed: { punch: 5 },
      myMinHp: 0,
      ticksPlayed: 40,
    });
    const rival = getRivalRecord(mem, "rival-1");
    expect(rival).not.toBe(null);
    expect(rival!.name).toBe("Nemesis");
    expect(rival!.losses).toBe(1);
  });
});
