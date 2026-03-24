// ─── Local Sparring Engine ──────────────────────────────────────
//
// Client-side fighting engine for sparring tryouts.
// Same rules as the server but runs entirely locally — no WebSocket needed.
// The user controls one fighter via keyboard, the opponent is powered by the
// locally-running WebLLM model (same model used in AI mode).

import { ARENA_WIDTH, MAX_HP, ATTACK_RANGE, DAMAGE, COOLDOWNS } from "../server/protocol";

export type Action = "punch" | "kick" | "special" | "block" | "jump" | "move_left" | "move_right";

export interface LocalFighter {
  hp: number;
  x: number;
  cooldowns: Record<string, number>;
  lastAction: Action | null;
  blocking: boolean;
}

export interface SparringResult {
  playerHp: number;
  opponentHp: number;
  playerWon: boolean;
  draw: boolean;
  ticks: number;
  playerActions: Record<string, number>;
}

export interface SparringCallbacks {
  onTick: (tick: number, player: LocalFighter, opponent: LocalFighter, timeLeft: number) => void;
  onEnd: (result: SparringResult) => void;
  getPlayerAction: () => Action | null;
  /** Async function to get the opponent's action via LLM inference. If null, opponent skips the tick. */
  getOpponentAction: (state: { tick: number; opponent: LocalFighter; player: LocalFighter; timeRemaining: number }) => Promise<Action | null>;
}

function createFighter(x: number): LocalFighter {
  return { hp: MAX_HP, x, cooldowns: {}, lastAction: null, blocking: false };
}

function tickCooldowns(f: LocalFighter) {
  for (const key of Object.keys(f.cooldowns)) {
    f.cooldowns[key]--;
    if (f.cooldowns[key] <= 0) delete f.cooldowns[key];
  }
}

function applyAction(actor: LocalFighter, target: LocalFighter, action: Action) {
  actor.lastAction = action;
  actor.blocking = action === "block";

  switch (action) {
    case "move_left":
      actor.x = Math.max(0, actor.x - 1);
      break;
    case "move_right":
      actor.x = Math.min(ARENA_WIDTH, actor.x + 1);
      break;
    case "jump":
      break;
    case "block":
      if (actor.cooldowns["block"]) return;
      actor.cooldowns["block"] = COOLDOWNS["block"];
      break;
    case "punch":
    case "kick":
    case "special": {
      if (actor.cooldowns[action]) return;
      const dist = Math.abs(actor.x - target.x);
      if (dist <= ATTACK_RANGE) {
        const dmg = DAMAGE[action] ?? 0;
        if (target.blocking) {
          target.hp -= Math.floor(dmg * 0.25);
        } else {
          target.hp -= dmg;
        }
        target.hp = Math.max(0, target.hp);
      }
      if (COOLDOWNS[action]) {
        actor.cooldowns[action] = COOLDOWNS[action];
      }
      break;
    }
  }
}

const SPAR_TICKS = 40; // ~16 seconds at 400ms per tick
const SPAR_TICK_MS = 400;

export function startSparring(callbacks: SparringCallbacks): { stop: () => void } {
  const player = createFighter(2);
  const opponent = createFighter(8);
  let tick = 0;
  let stopped = false;
  const playerActions: Record<string, number> = {};

  async function gameLoop() {
    if (stopped) return;
    tick++;
    const timeLeft = ((SPAR_TICKS - tick) * SPAR_TICK_MS) / 1000;

    // Tick cooldowns
    tickCooldowns(player);
    tickCooldowns(opponent);
    player.blocking = false;
    opponent.blocking = false;

    // Get player action (keyboard)
    const playerAction = callbacks.getPlayerAction();

    // Get opponent action from LLM
    const botAction = await callbacks.getOpponentAction({
      tick,
      opponent,   // "you" from the opponent's perspective
      player,     // "opponent" from the opponent's perspective
      timeRemaining: timeLeft,
    });

    if (stopped) return; // could have been stopped while awaiting LLM

    if (playerAction) {
      applyAction(player, opponent, playerAction);
      playerActions[playerAction] = (playerActions[playerAction] || 0) + 1;
    }
    if (botAction) {
      applyAction(opponent, player, botAction);
    }

    callbacks.onTick(tick, player, opponent, timeLeft);

    // Check end conditions
    if (player.hp <= 0 || opponent.hp <= 0 || tick >= SPAR_TICKS) {
      stopped = true;
      callbacks.onEnd({
        playerHp: player.hp,
        opponentHp: opponent.hp,
        playerWon: player.hp > 0 && (opponent.hp <= 0 || player.hp > opponent.hp),
        draw: player.hp === opponent.hp,
        ticks: tick,
        playerActions,
      });
      return;
    }

    setTimeout(gameLoop, SPAR_TICK_MS);
  }

  // Start after a brief delay
  setTimeout(gameLoop, SPAR_TICK_MS);

  return {
    stop: () => { stopped = true; },
  };
}
