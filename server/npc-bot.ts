import type { Action } from "./protocol.ts";
import { ATTACK_RANGE } from "./protocol.ts";
import type { Match } from "./match.ts";

const NPC_NAME = "NPC Claw Fighter";

export class NpcBot {
  readonly id: string;
  readonly name = NPC_NAME;
  private dismissed = false;

  constructor() {
    this.id = `npc-${crypto.randomUUID()}`;
  }

  dismiss(): void {
    this.dismissed = true;
  }

  get isDismissed(): boolean {
    return this.dismissed;
  }

  /** Called each tick when the NPC is in a match.
   *  Skips some ticks randomly to simulate reaction delay instead of using
   *  setTimeout (which gets cancelled by the next tick before it fires). */
  onTick(match: Match, fighterIndex: 0 | 1): void {
    if (match.finished) return;

    // Skip ~90% of ticks to simulate slower reaction time (gives on-device LLMs a chance)
    if (Math.random() < 0.9) return;

    const me = match.fighters[fighterIndex];
    const opp = match.fighters[fighterIndex === 0 ? 1 : 0];
    const dist = Math.abs(me.x - opp.x);
    const roll = Math.random();

    let action: Action;

    if (dist > ATTACK_RANGE) {
      // Too far — move toward opponent
      action = me.x < opp.x ? "move_right" : "move_left";
    } else {
      // In range — fight
      if (opp.lastAction && (opp.lastAction === "punch" || opp.lastAction === "kick" || opp.lastAction === "special")) {
        // Opponent attacked last tick — block or jump sometimes
        if (roll < 0.3) {
          action = "block";
        } else if (roll < 0.45) {
          action = "jump";
        } else {
          action = roll < 0.7 ? "punch" : "kick";
        }
      } else {
        // Opponent didn't attack — be aggressive
        if (roll < 0.45) {
          action = "punch";
        } else if (roll < 0.75) {
          action = "kick";
        } else if (roll < 0.85) {
          action = "special";
        } else {
          action = "block";
        }
      }
    }

    match.setAction(fighterIndex, action);
  }

  destroy(): void {
    // no-op — cleanup hook for future use
  }
}

const STATIONARY_NPC_NAME = "NPC Punching Bag";

export class NpcStationaryBot {
  readonly id: string;
  readonly name = STATIONARY_NPC_NAME;
  private dismissed = false;

  constructor() {
    this.id = `npc-${crypto.randomUUID()}`;
  }

  dismiss(): void {
    this.dismissed = true;
  }

  get isDismissed(): boolean {
    return this.dismissed;
  }

  /** Stationary NPC — never moves, only attacks when opponent is in range. */
  onTick(match: Match, fighterIndex: 0 | 1): void {
    if (match.finished) return;

    // Skip ~90% of ticks — slower than regular NPC since it doesn't move
    if (Math.random() < 0.9) return;

    const me = match.fighters[fighterIndex];
    const opp = match.fighters[fighterIndex === 0 ? 1 : 0];
    const dist = Math.abs(me.x - opp.x);
    const roll = Math.random();

    if (dist > ATTACK_RANGE) {
      // Too far — do nothing (stationary)
      return;
    }

    // In range — fight (same logic as NpcBot)
    let action: Action;
    if (opp.lastAction && (opp.lastAction === "punch" || opp.lastAction === "kick" || opp.lastAction === "special")) {
      if (roll < 0.3) {
        action = "block";
      } else if (roll < 0.45) {
        action = "jump";
      } else {
        action = roll < 0.7 ? "punch" : "kick";
      }
    } else {
      if (roll < 0.45) {
        action = "punch";
      } else if (roll < 0.75) {
        action = "kick";
      } else if (roll < 0.85) {
        action = "special";
      } else {
        action = "block";
      }
    }

    match.setAction(fighterIndex, action);
  }

  destroy(): void {
    // no-op
  }
}
