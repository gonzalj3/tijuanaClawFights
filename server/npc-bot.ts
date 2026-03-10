import type { Action } from "./protocol.ts";
import { ATTACK_RANGE } from "./protocol.ts";
import type { Match } from "./match.ts";

const NPC_NAME = "NPC Claw Fighter";
const REACTION_DELAY_MS = 300; // 1.5 ticks late — slow but not useless

export class NpcBot {
  readonly id: string;
  readonly name = NPC_NAME;
  private dismissed = false;
  private actionTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.id = `npc-${crypto.randomUUID()}`;
  }

  dismiss(): void {
    this.dismissed = true;
  }

  get isDismissed(): boolean {
    return this.dismissed;
  }

  /** Called each tick when the NPC is in a match */
  onTick(match: Match, fighterIndex: 0 | 1): void {
    if (this.actionTimer) {
      clearTimeout(this.actionTimer);
    }

    this.actionTimer = setTimeout(() => {
      if (match.finished) return;

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
    }, REACTION_DELAY_MS);
  }

  destroy(): void {
    if (this.actionTimer) {
      clearTimeout(this.actionTimer);
      this.actionTimer = null;
    }
  }
}
