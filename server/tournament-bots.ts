import type { Action } from "./protocol.ts";
import { ATTACK_RANGE } from "./protocol.ts";
import type { Match } from "./match.ts";

// ─── Tournament Ladder Config ────────────────────────────────────
export const TOURNAMENT_LADDER = [
  { rung: 0, name: "Saco de Arena",  title: "The Punching Bag" },
  { rung: 1, name: "El Novato",      title: "The Rookie" },
  { rung: 2, name: "La Bailarina",   title: "The Dancer" },
  { rung: 3, name: "El Matón",       title: "The Brawler" },
  { rung: 4, name: "El Fantasma",    title: "The Ghost" },
  { rung: 5, name: "La Tormenta",    title: "The Storm" },
  { rung: 6, name: "El Muro",        title: "The Wall" },
  { rung: 7, name: "El Espejo",      title: "The Mirror" },
  { rung: 8, name: "El Campeón",     title: "The Boss" },
];

// ─── TournamentBot Interface ─────────────────────────────────────
export interface TournamentBot {
  id: string;
  name: string;
  onTick(match: Match, fighterIndex: 0 | 1): void;
  destroy(): void;
}

// ─── Helper ──────────────────────────────────────────────────────
function moveToward(me: { x: number }, opp: { x: number }): Action {
  return me.x < opp.x ? "move_right" : "move_left";
}

function moveAway(me: { x: number }, opp: { x: number }): Action {
  return me.x < opp.x ? "move_left" : "move_right";
}

function inRange(me: { x: number }, opp: { x: number }): boolean {
  return Math.abs(me.x - opp.x) <= ATTACK_RANGE;
}

function isAttackAction(action: Action | null): boolean {
  return action === "punch" || action === "kick" || action === "special";
}

// ─── Rung 0: Punching Bag ───────────────────────────────────────
// Slow but fights back. Moves toward opponent, punches and blocks.
class PunchingBagBot implements TournamentBot {
  id = `tournament-${crypto.randomUUID()}`;
  name = TOURNAMENT_LADDER[0].name;

  onTick(match: Match, fighterIndex: 0 | 1): void {
    if (match.finished) return;
    if (Math.random() < 0.55) return; // 55% skip — slow but not helpless
    const me = match.fighters[fighterIndex];
    const opp = match.fighters[fighterIndex === 0 ? 1 : 0];
    if (!inRange(me, opp)) {
      match.setAction(fighterIndex, moveToward(me, opp));
    } else {
      // Block incoming attacks sometimes
      if (isAttackAction(opp.lastAction) && Math.random() < 0.2) {
        match.setAction(fighterIndex, "block");
      } else {
        match.setAction(fighterIndex, "punch");
      }
    }
  }

  destroy(): void {}
}

// ─── Rung 1: Rookie ─────────────────────────────────────────────
// Aggressive puncher. Moves in fast, mixes punch/kick, blocks reactively.
class RookieBot implements TournamentBot {
  id = `tournament-${crypto.randomUUID()}`;
  name = TOURNAMENT_LADDER[1].name;

  onTick(match: Match, fighterIndex: 0 | 1): void {
    if (match.finished) return;
    if (Math.random() < 0.25) return; // 25% skip — quite active
    const me = match.fighters[fighterIndex];
    const opp = match.fighters[fighterIndex === 0 ? 1 : 0];
    if (!inRange(me, opp)) {
      match.setAction(fighterIndex, moveToward(me, opp));
    } else {
      // Block if just got hit
      if (isAttackAction(opp.lastAction) && Math.random() < 0.3) {
        match.setAction(fighterIndex, "block");
      } else {
        const roll = Math.random();
        if (roll < 0.55) match.setAction(fighterIndex, "punch");
        else if (roll < 0.85) match.setAction(fighterIndex, "kick");
        else match.setAction(fighterIndex, "special");
      }
    }
  }

  destroy(): void {}
}

// ─── Rung 2: Dancer ─────────────────────────────────────────────
// Hit-and-run specialist. Kicks hard, retreats, jumps to dodge. Very evasive.
class DancerBot implements TournamentBot {
  id = `tournament-${crypto.randomUUID()}`;
  name = TOURNAMENT_LADDER[2].name;
  private retreatTicks = 0;

  onTick(match: Match, fighterIndex: 0 | 1): void {
    if (match.finished) return;
    if (Math.random() < 0.15) return; // 15% skip — very active
    const me = match.fighters[fighterIndex];
    const opp = match.fighters[fighterIndex === 0 ? 1 : 0];

    if (this.retreatTicks > 0) {
      this.retreatTicks--;
      // Block or jump during retreat to stay safe
      if (inRange(me, opp) && Math.random() < 0.4) {
        match.setAction(fighterIndex, Math.random() < 0.5 ? "block" : "jump");
      } else {
        match.setAction(fighterIndex, Math.random() < 0.3 ? "jump" : moveAway(me, opp));
      }
      return;
    }

    if (!inRange(me, opp)) {
      match.setAction(fighterIndex, moveToward(me, opp));
    } else {
      // Block incoming attacks reactively
      if (isAttackAction(opp.lastAction) && Math.random() < 0.25) {
        match.setAction(fighterIndex, "block");
        return;
      }
      // Kick or special, then retreat
      const roll = Math.random();
      if (roll < 0.45) match.setAction(fighterIndex, "kick");
      else if (roll < 0.75) match.setAction(fighterIndex, "special");
      else match.setAction(fighterIndex, "punch");
      this.retreatTicks = 2;
    }
  }

  destroy(): void {}
}

// ─── Rung 3: Brawler ────────────────────────────────────────────
// Rushes in, heavy damage output. Never blocks but jumps occasionally.
class BrawlerBot implements TournamentBot {
  id = `tournament-${crypto.randomUUID()}`;
  name = TOURNAMENT_LADDER[3].name;

  onTick(match: Match, fighterIndex: 0 | 1): void {
    if (match.finished) return;
    if (Math.random() < 0.2) return; // 20% skip — very active
    const me = match.fighters[fighterIndex];
    const opp = match.fighters[fighterIndex === 0 ? 1 : 0];

    if (!inRange(me, opp)) {
      match.setAction(fighterIndex, moveToward(me, opp));
      return;
    }

    // Jump dodge occasionally when low HP
    if (me.hp < 40 && Math.random() < 0.15) {
      match.setAction(fighterIndex, "jump");
      return;
    }

    const roll = Math.random();
    if (roll < 0.45) match.setAction(fighterIndex, "punch");
    else if (roll < 0.7) match.setAction(fighterIndex, "kick");
    else match.setAction(fighterIndex, "special");
  }

  destroy(): void {}
}

// ─── Rung 4: Ghost ──────────────────────────────────────────────
// Attacks once in range (prefers specials), retreats for 2-3 ticks, blocks on approach.
class GhostBot implements TournamentBot {
  id = `tournament-${crypto.randomUUID()}`;
  name = TOURNAMENT_LADDER[4].name;
  private retreatTicks = 0;

  onTick(match: Match, fighterIndex: 0 | 1): void {
    if (match.finished) return;
    if (Math.random() < 0.2) return; // 20% skip
    const me = match.fighters[fighterIndex];
    const opp = match.fighters[fighterIndex === 0 ? 1 : 0];

    if (this.retreatTicks > 0) {
      this.retreatTicks--;
      // Block or jump during retreat if opponent is close
      if (inRange(me, opp) && Math.random() < 0.5) {
        match.setAction(fighterIndex, Math.random() < 0.5 ? "block" : "jump");
      } else {
        match.setAction(fighterIndex, moveAway(me, opp));
      }
      return;
    }

    if (!inRange(me, opp)) {
      match.setAction(fighterIndex, moveToward(me, opp));
    } else {
      // Hit hard then vanish
      const roll = Math.random();
      if (roll < 0.35) match.setAction(fighterIndex, "special");
      else if (roll < 0.65) match.setAction(fighterIndex, "kick");
      else match.setAction(fighterIndex, "punch");
      this.retreatTicks = 2 + (Math.random() < 0.4 ? 1 : 0);
    }
  }

  destroy(): void {}
}

// ─── Rung 5: Storm ──────────────────────────────────────────────
// Always approaches, attacks almost every tick. Relentless pressure.
class StormBot implements TournamentBot {
  id = `tournament-${crypto.randomUUID()}`;
  name = TOURNAMENT_LADDER[5].name;

  onTick(match: Match, fighterIndex: 0 | 1): void {
    if (match.finished) return;
    if (Math.random() < 0.1) return; // 10% skip — nearly always acts
    const me = match.fighters[fighterIndex];
    const opp = match.fighters[fighterIndex === 0 ? 1 : 0];

    if (!inRange(me, opp)) {
      match.setAction(fighterIndex, moveToward(me, opp));
      return;
    }

    // Occasionally block after opponent special
    if (opp.lastAction === "special" && Math.random() < 0.3) {
      match.setAction(fighterIndex, "block");
      return;
    }

    const roll = Math.random();
    if (roll < 0.35) match.setAction(fighterIndex, "punch");
    else if (roll < 0.6) match.setAction(fighterIndex, "kick");
    else if (roll < 0.85) match.setAction(fighterIndex, "special");
    else match.setAction(fighterIndex, "punch"); // double-up on punches
  }

  destroy(): void {}
}

// ─── Rung 6: Wall ───────────────────────────────────────────────
// Blocks most attacks, counter-punches gaps, uses specials to punish.
class WallBot implements TournamentBot {
  id = `tournament-${crypto.randomUUID()}`;
  name = TOURNAMENT_LADDER[6].name;

  onTick(match: Match, fighterIndex: 0 | 1): void {
    if (match.finished) return;
    if (Math.random() < 0.15) return; // 15% skip
    const me = match.fighters[fighterIndex];
    const oppIdx = fighterIndex === 0 ? 1 : 0;
    const opp = match.fighters[oppIdx];

    if (!inRange(me, opp)) {
      match.setAction(fighterIndex, moveToward(me, opp));
      return;
    }

    // Counter-attack when opponent just blocked or missed
    if (opp.lastAction === "block" || opp.lastAction === "jump") {
      const roll = Math.random();
      if (roll < 0.5) match.setAction(fighterIndex, "special");
      else match.setAction(fighterIndex, "kick");
      return;
    }

    // Block attacks, jump to dodge specials
    if (isAttackAction(opp.lastAction)) {
      if (opp.lastAction === "special" && Math.random() < 0.4) {
        match.setAction(fighterIndex, "jump");
      } else {
        match.setAction(fighterIndex, Math.random() < 0.7 ? "block" : "punch");
      }
      return;
    }

    // Default: mostly block, occasionally attack
    if (Math.random() < 0.5) {
      match.setAction(fighterIndex, "block");
    } else {
      match.setAction(fighterIndex, Math.random() < 0.6 ? "punch" : "kick");
    }
  }

  destroy(): void {}
}

// ─── Rung 7: Mirror ─────────────────────────────────────────────
// Reads opponent's action distribution and counters it. Also blocks reactively.
class MirrorBot implements TournamentBot {
  id = `tournament-${crypto.randomUUID()}`;
  name = TOURNAMENT_LADDER[7].name;

  onTick(match: Match, fighterIndex: 0 | 1): void {
    if (match.finished) return;
    if (Math.random() < 0.12) return; // 12% skip
    const me = match.fighters[fighterIndex];
    const oppIdx = fighterIndex === 0 ? 1 : 0;
    const opp = match.fighters[oppIdx];

    if (!inRange(me, opp)) {
      match.setAction(fighterIndex, moveToward(me, opp));
      return;
    }

    // Reactive defense: block/jump when opponent attacks
    if (isAttackAction(opp.lastAction) && Math.random() < 0.35) {
      match.setAction(fighterIndex, Math.random() < 0.6 ? "block" : "jump");
      return;
    }

    // Mirror opponent's action distribution but with counters
    const counts = match.actionCounts[oppIdx];
    const total = Object.values(counts).reduce((s, c) => s + c, 0);

    if (total < 5) {
      // Not enough data — play aggressively
      const roll = Math.random();
      if (roll < 0.4) match.setAction(fighterIndex, "punch");
      else if (roll < 0.7) match.setAction(fighterIndex, "kick");
      else match.setAction(fighterIndex, "special");
      return;
    }

    // Find opponent's most-used action and counter it
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const topAction = sorted[0]?.[0];

    if (topAction === "punch" || topAction === "kick" || topAction === "special") {
      // Opponent is attack-heavy: mix block/jump + counter-attack
      const roll = Math.random();
      if (roll < 0.3) match.setAction(fighterIndex, "block");
      else if (roll < 0.45) match.setAction(fighterIndex, "jump");
      else if (roll < 0.75) match.setAction(fighterIndex, "special");
      else match.setAction(fighterIndex, "kick");
    } else if (topAction === "block") {
      // Opponent blocks a lot: use specials to break through
      match.setAction(fighterIndex, Math.random() < 0.6 ? "special" : "kick");
    } else {
      // Opponent moves a lot: rush and attack
      const roll = Math.random();
      if (roll < 0.4) match.setAction(fighterIndex, "punch");
      else if (roll < 0.7) match.setAction(fighterIndex, "kick");
      else match.setAction(fighterIndex, "special");
    }
  }

  destroy(): void {}
}

// ─── Rung 8: Campeon (Boss) ─────────────────────────────────────
// 3 phases: aggressive (tick 0-40), counter (40-90), adaptive (90+).
// Very low skip rate, reads opponent, blocks reactively, punishes mistakes.
class CampeonBot implements TournamentBot {
  id = `tournament-${crypto.randomUUID()}`;
  name = TOURNAMENT_LADDER[8].name;

  onTick(match: Match, fighterIndex: 0 | 1): void {
    if (match.finished) return;
    if (Math.random() < 0.08) return; // 8% skip — almost always acts
    const me = match.fighters[fighterIndex];
    const oppIdx = fighterIndex === 0 ? 1 : 0;
    const opp = match.fighters[oppIdx];

    if (!inRange(me, opp)) {
      match.setAction(fighterIndex, moveToward(me, opp));
      return;
    }

    const tick = match.tick;

    // Reactive defense across all phases
    if (isAttackAction(opp.lastAction) && Math.random() < 0.3) {
      if (opp.lastAction === "special") {
        match.setAction(fighterIndex, "jump"); // dodge specials
      } else {
        match.setAction(fighterIndex, "block");
      }
      return;
    }

    if (tick <= 40) {
      // Phase 1: Aggressive rush — establish damage lead
      const roll = Math.random();
      if (roll < 0.35) match.setAction(fighterIndex, "punch");
      else if (roll < 0.6) match.setAction(fighterIndex, "kick");
      else if (roll < 0.85) match.setAction(fighterIndex, "special");
      else match.setAction(fighterIndex, "punch");
    } else if (tick <= 90) {
      // Phase 2: Counter — block/dodge then punish
      if (opp.lastAction === "block" || opp.lastAction === "jump" || opp.lastAction === null) {
        // Opponent is defensive/idle — punish with heavy attacks
        const roll = Math.random();
        if (roll < 0.45) match.setAction(fighterIndex, "special");
        else if (roll < 0.75) match.setAction(fighterIndex, "kick");
        else match.setAction(fighterIndex, "punch");
      } else {
        // Opponent moved or attacked — mix defense and offense
        const roll = Math.random();
        if (roll < 0.3) match.setAction(fighterIndex, "block");
        else if (roll < 0.6) match.setAction(fighterIndex, "kick");
        else match.setAction(fighterIndex, "special");
      }
    } else {
      // Phase 3: Adaptive — analyze and exploit weaknesses
      const counts = match.actionCounts[oppIdx];
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      const topAction = sorted[0]?.[0];
      const secondAction = sorted[1]?.[0];

      // Low HP survival mode
      if (me.hp < 25) {
        if (Math.random() < 0.4) {
          match.setAction(fighterIndex, "block");
          return;
        }
      }

      if (topAction === "punch") {
        // Opponent spams punches: block then counter with specials
        if (Math.random() < 0.35) match.setAction(fighterIndex, "block");
        else match.setAction(fighterIndex, Math.random() < 0.5 ? "special" : "kick");
      } else if (topAction === "block") {
        // Opponent turtles: use specials (they still deal chip?)
        match.setAction(fighterIndex, Math.random() < 0.55 ? "special" : "kick");
      } else if (topAction === "move_left" || topAction === "move_right") {
        // Opponent runs: chase and attack
        const roll = Math.random();
        if (roll < 0.4) match.setAction(fighterIndex, "punch");
        else if (roll < 0.7) match.setAction(fighterIndex, "kick");
        else match.setAction(fighterIndex, "special");
      } else {
        // Mixed or kick-heavy — be unpredictable
        const roll = Math.random();
        if (roll < 0.25) match.setAction(fighterIndex, "punch");
        else if (roll < 0.45) match.setAction(fighterIndex, "kick");
        else if (roll < 0.7) match.setAction(fighterIndex, "special");
        else if (roll < 0.85) match.setAction(fighterIndex, "block");
        else match.setAction(fighterIndex, "jump");
      }
    }
  }

  destroy(): void {}
}

// ─── Factory ─────────────────────────────────────────────────────
export function createTournamentBot(rung: number): TournamentBot {
  switch (rung) {
    case 0: return new PunchingBagBot();
    case 1: return new RookieBot();
    case 2: return new DancerBot();
    case 3: return new BrawlerBot();
    case 4: return new GhostBot();
    case 5: return new StormBot();
    case 6: return new WallBot();
    case 7: return new MirrorBot();
    case 8: return new CampeonBot();
    default: throw new Error(`Invalid tournament rung: ${rung}`);
  }
}
