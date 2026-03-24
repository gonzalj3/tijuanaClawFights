import { test, expect, describe } from "bun:test";
import { createTournamentBot, TOURNAMENT_LADDER } from "./tournament-bots.ts";
import { Match } from "./match.ts";

function runBot(rung: number, ticks: number) {
  const bot = createTournamentBot(rung);
  const match = new Match("test", "Player", bot.name);
  const botIdx: 0 | 1 = 1;
  const actions: string[] = [];

  // Move player into range
  match.fighters[0].x = 4;
  match.fighters[1].x = 5;

  for (let i = 0; i < ticks; i++) {
    bot.onTick(match, botIdx);
    const action = match.fighters[botIdx].pendingAction;
    if (action) actions.push(action);
    match.processTick();
    if (match.finished) break;
  }

  bot.destroy();
  return actions;
}

function countActions(actions: string[]) {
  const counts: Record<string, number> = {};
  for (const a of actions) counts[a] = (counts[a] || 0) + 1;
  return counts;
}

describe("Tournament Bots", () => {
  test("TOURNAMENT_LADDER has 9 entries", () => {
    expect(TOURNAMENT_LADDER).toHaveLength(9);
  });

  test("createTournamentBot creates all 9 rungs", () => {
    for (let i = 0; i <= 8; i++) {
      const bot = createTournamentBot(i);
      expect(bot.name).toBe(TOURNAMENT_LADDER[i].name);
      expect(bot.id).toStartWith("tournament-");
    }
  });

  test("createTournamentBot throws for invalid rung", () => {
    expect(() => createTournamentBot(9)).toThrow("Invalid tournament rung");
    expect(() => createTournamentBot(-1)).toThrow("Invalid tournament rung");
  });

  test("Rung 0 (Punching Bag) — mostly skips, never moves", () => {
    const actions = runBot(0, 200);
    const counts = countActions(actions);
    // Very few actions due to 95% skip rate
    expect(actions.length).toBeLessThan(40);
    // Should never move
    expect(counts["move_left"] ?? 0).toBe(0);
    expect(counts["move_right"] ?? 0).toBe(0);
  });

  test("Rung 1 (Rookie) — punches frequently, uses mixed attacks", () => {
    const bot = createTournamentBot(1);
    const match = new Match("test", "Player", bot.name);
    match.fighters[0].x = 4;
    match.fighters[1].x = 5;
    const actions: string[] = [];

    for (let i = 0; i < 200; i++) {
      bot.onTick(match, 1);
      const a = match.fighters[1].pendingAction;
      if (a) actions.push(a);
      match.processTick();
      if (match.finished) break;
    }

    const counts = countActions(actions);
    // Actively attacks with punch as primary
    expect(counts["punch"] ?? 0).toBeGreaterThan(0);
    const attackCount = (counts["punch"] ?? 0) + (counts["kick"] ?? 0) + (counts["special"] ?? 0);
    expect(attackCount).toBeGreaterThan(5);
  });

  test("Rung 2 (Dancer) — uses kicks and movement", () => {
    const actions = runBot(2, 200);
    const counts = countActions(actions);
    expect(counts["kick"] ?? 0).toBeGreaterThan(0);
    // Should have retreating movements
    const moveCount = (counts["move_left"] ?? 0) + (counts["move_right"] ?? 0);
    expect(moveCount).toBeGreaterThan(0);
  });

  test("Rung 3 (Brawler) — never blocks, uses punch/kick/special", () => {
    const actions = runBot(3, 200);
    const counts = countActions(actions);
    expect(counts["block"] ?? 0).toBe(0);
    expect(counts["punch"] ?? 0).toBeGreaterThan(0);
  });

  test("Rung 4 (Ghost) — has retreat phases", () => {
    const actions = runBot(4, 200);
    const counts = countActions(actions);
    const moveCount = (counts["move_left"] ?? 0) + (counts["move_right"] ?? 0);
    expect(moveCount).toBeGreaterThan(0);
  });

  test("Rung 5 (Storm) — attacks frequently", () => {
    const actions = runBot(5, 200);
    const counts = countActions(actions);
    const attackCount = (counts["punch"] ?? 0) + (counts["kick"] ?? 0) + (counts["special"] ?? 0);
    // Match may end via KO quickly since opponent doesn't fight back
    expect(attackCount).toBeGreaterThan(3);
  });

  test("Rung 6 (Wall) — blocks frequently", () => {
    const actions = runBot(6, 200);
    const counts = countActions(actions);
    expect(counts["block"] ?? 0).toBeGreaterThan(2);
  });

  test("Rung 7 (Mirror) — produces actions in range", () => {
    const actions = runBot(7, 200);
    expect(actions.length).toBeGreaterThan(0);
  });

  test("Rung 8 (Campeon) — attacks frequently across phases", () => {
    const actions = runBot(8, 200);
    const counts = countActions(actions);
    const attackCount = (counts["punch"] ?? 0) + (counts["kick"] ?? 0) + (counts["special"] ?? 0);
    // Match may end via KO quickly since opponent doesn't fight back
    expect(attackCount).toBeGreaterThan(3);
  });
});
