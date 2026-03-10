import type { Action, FighterState } from "./protocol.ts";
import type { Match } from "./match.ts";

const NPC_NAME = "NPC Claw Fighter";
const REACTION_DELAY_MS = 600; // 3 ticks late — deliberately bad

// Predictable cycle: punch → punch → kick → block → move_left → move_right
const PATTERN: Action[] = ["punch", "punch", "kick", "block", "move_left", "move_right"];

export class NpcBot {
  readonly id: string;
  readonly name = NPC_NAME;
  private patternIndex = 0;
  private dismissed = false;
  private actionTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.id = `npc-${crypto.randomUUID()}`;
  }

  /** Signal the NPC to leave after current match (won't re-queue) */
  dismiss(): void {
    this.dismissed = true;
  }

  get isDismissed(): boolean {
    return this.dismissed;
  }

  /** Called each tick when the NPC is in a match — queues an action with delay */
  onTick(match: Match, fighterIndex: 0 | 1): void {
    // Clear any pending action from previous tick
    if (this.actionTimer) {
      clearTimeout(this.actionTimer);
    }

    // Delayed reaction — 600ms means the action arrives ~3 ticks late
    this.actionTimer = setTimeout(() => {
      if (match.finished) return;
      const action = PATTERN[this.patternIndex % PATTERN.length]!;
      this.patternIndex++;
      match.setAction(fighterIndex, action);
    }, REACTION_DELAY_MS);
  }

  /** Clean up timers */
  destroy(): void {
    if (this.actionTimer) {
      clearTimeout(this.actionTimer);
      this.actionTimer = null;
    }
  }
}
