// ─── Action Types ───────────────────────────────────────────────
export type Action =
  | "punch"
  | "kick"
  | "block"
  | "move_left"
  | "move_right"
  | "jump"
  | "special";

// ─── Agent → Server Messages ───────────────────────────────────
export type AgentMessage =
  | { type: "register"; name: string; key: string }
  | { type: "join_queue" }
  | { type: "leave_queue" }
  | { type: "action"; tick: number; action: Action };

// ─── Server → Agent Messages ───────────────────────────────────
export interface FighterState {
  name: string;
  x: number;
  hp: number;
  cooldowns: Record<string, number>; // action → ticks remaining
  lastAction: Action | null;
}

export type ServerAgentMessage =
  | { type: "registered"; id: string }
  | { type: "queued" }
  | {
      type: "match_start";
      matchId: string;
      opponent: string;
      yourIndex: 0 | 1;
    }
  | {
      type: "game_state";
      tick: number;
      you: FighterState;
      opponent: FighterState;
      timeRemaining: number;
      lastResult: string | null;
    }
  | {
      type: "match_end";
      winner: string | null; // null = draw
      reason: "ko" | "timeout";
    }
  | { type: "error"; message: string }
  | { type: "kicked"; reason: string };

// ─── Animation Events (for spectators) ─────────────────────────
export interface AnimationEvent {
  type: "hit" | "block" | "miss" | "ko" | "special";
  fighter: 0 | 1;
  text: string;
}

// ─── Server → Spectator Messages ───────────────────────────────
export type SpectatorMessage =
  | {
      type: "match_list";
      matches: Array<{
        matchId: string;
        fighters: [string, string];
      }>;
    }
  | {
      type: "match_start";
      matchId: string;
      fighters: [string, string];
    }
  | {
      type: "match_state";
      matchId: string;
      tick: number;
      fighters: [FighterState, FighterState];
      events: AnimationEvent[];
      timeRemaining: number;
    }
  | {
      type: "match_end";
      matchId: string;
      winner: string | null;
      reason: "ko" | "timeout";
    }
  | {
      type: "arena_status";
      hasNpc: boolean;
      hasMatch: boolean;
      queueSize: number;
      waitingFighter: string | null;
      npcType: NpcType;
    }
  | {
      type: "agent_msg";
      fighter: 0 | 1;
      name: string;
      direction: "in" | "out";
      msg: any;
    }
  | {
      type: "leaderboard";
      entries: LeaderboardEntry[];
    };

// ─── Leaderboard ──────────────────────────────────────────────
export interface LeaderboardEntry {
  rank: number;
  name: string;
  winStreak: number;
  totalWins: number;
  totalLosses: number;
}

// ─── Spectator → Server Messages ───────────────────────────────
export type NpcType = "normal" | "stationary";

export type SpectatorControlMessage =
  | { type: "spawn_npc" }
  | { type: "dismiss_npc" }
  | { type: "set_npc_type"; npcType: NpcType };

// ─── Combat Constants ──────────────────────────────────────────
export const ARENA_WIDTH = 10;
export const TICK_MS = 400;
export const MATCH_DURATION_TICKS = 150; // 60 seconds
export const MIN_RESPONSE_MS = 100; // anti-heuristic: ignore actions faster than this
export const MAX_HP = 100;
export const ATTACK_RANGE = 2;

export const DAMAGE: Record<string, number> = {
  punch: 10,
  kick: 15,
  special: 25,
};

export const COOLDOWNS: Record<string, number> = {
  kick: 2,
  special: 5,
  block: 2, // can't block two consecutive ticks
};
