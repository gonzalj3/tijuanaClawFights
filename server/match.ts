import type { Action, AnimationEvent, FighterState, SpectatorMessage, ServerAgentMessage } from "./protocol.ts";
import {
  ARENA_WIDTH,
  MATCH_DURATION_TICKS,
  MAX_HP,
  ATTACK_RANGE,
  DAMAGE,
  COOLDOWNS,
} from "./protocol.ts";

export interface Fighter {
  name: string;
  x: number;
  hp: number;
  cooldowns: Map<string, number>;
  lastAction: Action | null;
  pendingAction: Action | null;
}

function newFighter(name: string, x: number): Fighter {
  return {
    name,
    x,
    hp: MAX_HP,
    cooldowns: new Map(),
    lastAction: null,
    pendingAction: null,
  };
}

function fighterState(f: Fighter): FighterState {
  const cooldowns: Record<string, number> = {};
  for (const [k, v] of f.cooldowns) cooldowns[k] = v;
  return {
    name: f.name,
    x: f.x,
    hp: f.hp,
    cooldowns,
    lastAction: f.lastAction,
  };
}

export class Match {
  id: string;
  fighters: [Fighter, Fighter];
  tick = 0;
  events: AnimationEvent[] = [];
  finished = false;
  winner: string | null = null;
  winReason: "ko" | "timeout" = "ko";

  // Callbacks set by the engine
  onEnd?: (match: Match) => void;

  constructor(id: string, name0: string, name1: string) {
    this.id = id;
    this.fighters = [newFighter(name0, 2), newFighter(name1, 8)];
  }

  setAction(index: 0 | 1, action: Action): boolean {
    const f = this.fighters[index];
    if (!f || this.finished) return false;

    // Validate cooldowns
    const cd = f.cooldowns.get(action);
    if (cd && cd > 0) return false;

    f.pendingAction = action;
    return true;
  }

  processTick(): void {
    if (this.finished) return;
    this.tick++;
    this.events = [];

    const [f0, f1] = this.fighters;

    // Decrement cooldowns
    for (const f of this.fighters) {
      for (const [k, v] of f.cooldowns) {
        if (v > 0) f.cooldowns.set(k, v - 1);
        if (v <= 1) f.cooldowns.delete(k);
      }
    }

    const a0 = f0.pendingAction;
    const a1 = f1.pendingAction;
    f0.lastAction = a0;
    f1.lastAction = a1;
    f0.pendingAction = null;
    f1.pendingAction = null;

    // Apply cooldowns for used actions
    for (const [f, a] of [[f0, a0], [f1, a1]] as [Fighter, Action | null][]) {
      if (a && COOLDOWNS[a]) {
        f.cooldowns.set(a, COOLDOWNS[a]!);
      }
    }

    // Resolve movement
    this.resolveMovement(f0, a0);
    this.resolveMovement(f1, a1);

    // Resolve combat
    const dist = Math.abs(f0.x - f1.x);
    const inRange = dist <= ATTACK_RANGE;

    // Determine who is jumping (dodging)
    const f0Jumping = a0 === "jump";
    const f1Jumping = a1 === "jump";
    const f0Blocking = a0 === "block";
    const f1Blocking = a1 === "block";
    const f0Attacking = isAttack(a0);
    const f1Attacking = isAttack(a1);

    // Resolve attacks
    if (f0Attacking && inRange && !f1Jumping) {
      if (f1Blocking) {
        this.events.push({ type: "block", fighter: 1, text: "BLOCKED!" });
      } else {
        const dmg = DAMAGE[a0!]!;
        f1.hp = Math.max(0, f1.hp - dmg);
        this.events.push({ type: "hit", fighter: 0, text: actionText(a0!) });
      }
    } else if (f0Attacking && inRange && f1Jumping) {
      this.events.push({ type: "miss", fighter: 0, text: "MISS!" });
    }

    if (f1Attacking && inRange && !f0Jumping) {
      if (f0Blocking) {
        this.events.push({ type: "block", fighter: 0, text: "BLOCKED!" });
      } else {
        const dmg = DAMAGE[a1!]!;
        f0.hp = Math.max(0, f0.hp - dmg);
        this.events.push({ type: "hit", fighter: 1, text: actionText(a1!) });
      }
    } else if (f1Attacking && inRange && f0Jumping) {
      this.events.push({ type: "miss", fighter: 1, text: "MISS!" });
    }

    // Check win conditions
    if (f0.hp <= 0 || f1.hp <= 0) {
      this.finished = true;
      this.winReason = "ko";
      if (f0.hp <= 0 && f1.hp <= 0) {
        this.winner = null; // draw
      } else if (f0.hp <= 0) {
        this.winner = f1.name;
        this.events.push({ type: "ko", fighter: 1, text: "KO!" });
      } else {
        this.winner = f0.name;
        this.events.push({ type: "ko", fighter: 0, text: "KO!" });
      }
      this.onEnd?.(this);
      return;
    }

    // Check timeout
    if (this.tick >= MATCH_DURATION_TICKS) {
      this.finished = true;
      this.winReason = "timeout";
      if (f0.hp === f1.hp) {
        this.winner = null;
      } else {
        this.winner = f0.hp > f1.hp ? f0.name : f1.name;
      }
      this.onEnd?.(this);
    }
  }

  private resolveMovement(f: Fighter, action: Action | null): void {
    if (action === "move_left") {
      f.x = Math.max(0, f.x - 1);
    } else if (action === "move_right") {
      f.x = Math.min(ARENA_WIDTH, f.x + 1);
    } else if (action === "jump") {
      // Jump repositions ±1 away from opponent
      const other = f === this.fighters[0] ? this.fighters[1] : this.fighters[0];
      if (f.x < other.x) {
        f.x = Math.max(0, f.x - 1);
      } else {
        f.x = Math.min(ARENA_WIDTH, f.x + 1);
      }
    }
  }

  get timeRemaining(): number {
    return Math.max(0, MATCH_DURATION_TICKS - this.tick);
  }

  getSpectatorState(): SpectatorMessage {
    return {
      type: "match_state",
      matchId: this.id,
      tick: this.tick,
      fighters: [fighterState(this.fighters[0]), fighterState(this.fighters[1])],
      events: this.events,
      timeRemaining: this.timeRemaining,
    };
  }

  getAgentState(index: 0 | 1): ServerAgentMessage {
    const otherIndex = index === 0 ? 1 : 0;
    return {
      type: "game_state",
      tick: this.tick,
      you: fighterState(this.fighters[index]),
      opponent: fighterState(this.fighters[otherIndex]),
      timeRemaining: this.timeRemaining,
      lastResult: this.events.length > 0 ? this.events.map((e) => e.text).join(", ") : null,
    };
  }

  getEndMessage(): { winner: string | null; reason: "ko" | "timeout" } {
    return { winner: this.winner, reason: this.winReason };
  }
}

function isAttack(action: Action | null): boolean {
  return action === "punch" || action === "kick" || action === "special";
}

function actionText(action: Action): string {
  switch (action) {
    case "punch": return "PUNCH!";
    case "kick": return "KICK!";
    case "special": return "SPECIAL!";
    default: return action.toUpperCase();
  }
}
