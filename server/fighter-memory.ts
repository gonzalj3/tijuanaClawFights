// ─── Fighter Memory System ──────────────────────────────────────
//
// Tracks persistent fighter personality data:
// - Rivals (LRU max 5): win/loss/draw records against specific opponents
// - Action counts: cumulative usage of each action
// - Signature move: most-used action
// - Damage stats: total dealt/taken
// - Best comeback: lowest HP survived to win
//
// Stored as JSON in the players.memory column (max ~2KB).

const MAX_RIVALS = 5;

export interface RivalRecord {
  id: string;
  name: string;
  wins: number;
  losses: number;
  draws: number;
  lastFought: string; // ISO timestamp
}

export interface FighterMemory {
  rivals: RivalRecord[];
  action_counts: Record<string, number>;
  signature_move: string | null;
  total_damage_dealt: number;
  total_damage_taken: number;
  best_comeback_hp: number; // lowest HP when winning (lower = better comeback)
  total_matches: number;
}

export interface MatchRecord {
  opponentId: string;
  opponentName: string;
  result: "win" | "loss" | "draw";
  damageDealt: number;
  damageTaken: number;
  actionsUsed: Record<string, number>;
  myMinHp: number;
  ticksPlayed: number;
}

export function createFighterMemory(): FighterMemory {
  return {
    rivals: [],
    action_counts: {},
    signature_move: null,
    total_damage_dealt: 0,
    total_damage_taken: 0,
    best_comeback_hp: 100,
    total_matches: 0,
  };
}

/** Parse memory from JSON, filling missing fields with defaults */
export function parseFighterMemory(raw: any): FighterMemory {
  const base = createFighterMemory();
  if (!raw || typeof raw !== "object") return base;
  return {
    rivals: Array.isArray(raw.rivals) ? raw.rivals : base.rivals,
    action_counts: raw.action_counts && typeof raw.action_counts === "object"
      ? raw.action_counts : base.action_counts,
    signature_move: raw.signature_move ?? base.signature_move,
    total_damage_dealt: raw.total_damage_dealt ?? base.total_damage_dealt,
    total_damage_taken: raw.total_damage_taken ?? base.total_damage_taken,
    best_comeback_hp: raw.best_comeback_hp ?? base.best_comeback_hp,
    total_matches: raw.total_matches ?? base.total_matches,
  };
}

export function updateMemoryAfterMatch(
  mem: FighterMemory,
  match: MatchRecord
): FighterMemory {
  const updated = { ...mem };
  const now = new Date().toISOString();

  // ─── Update rival record ─────────────────────────────────────
  updated.rivals = [...mem.rivals];
  const existingIdx = updated.rivals.findIndex((r) => r.id === match.opponentId);

  if (existingIdx >= 0) {
    const rival = { ...updated.rivals[existingIdx] };
    if (match.result === "win") rival.wins++;
    else if (match.result === "loss") rival.losses++;
    else rival.draws++;
    rival.lastFought = now;
    rival.name = match.opponentName; // update in case they renamed
    // Move to end (most recent) for LRU
    updated.rivals.splice(existingIdx, 1);
    updated.rivals.push(rival);
  } else {
    updated.rivals.push({
      id: match.opponentId,
      name: match.opponentName,
      wins: match.result === "win" ? 1 : 0,
      losses: match.result === "loss" ? 1 : 0,
      draws: match.result === "draw" ? 1 : 0,
      lastFought: now,
    });
  }

  // LRU eviction: keep only the MAX_RIVALS most recent
  while (updated.rivals.length > MAX_RIVALS) {
    updated.rivals.shift(); // remove oldest (front of array)
  }

  // ─── Accumulate action counts ────────────────────────────────
  updated.action_counts = { ...mem.action_counts };
  for (const [action, count] of Object.entries(match.actionsUsed)) {
    updated.action_counts[action] = (updated.action_counts[action] || 0) + count;
  }

  // ─── Update signature move ───────────────────────────────────
  let maxCount = 0;
  let sig: string | null = null;
  for (const [action, count] of Object.entries(updated.action_counts)) {
    if (count > maxCount) {
      maxCount = count;
      sig = action;
    }
  }
  updated.signature_move = sig;

  // ─── Damage totals ───────────────────────────────────────────
  updated.total_damage_dealt = mem.total_damage_dealt + match.damageDealt;
  updated.total_damage_taken = mem.total_damage_taken + match.damageTaken;

  // ─── Best comeback (only on wins) ────────────────────────────
  if (match.result === "win" && match.myMinHp < mem.best_comeback_hp) {
    updated.best_comeback_hp = match.myMinHp;
  }

  // ─── Match counter ───────────────────────────────────────────
  updated.total_matches = mem.total_matches + 1;

  return updated;
}

export function getSignatureMove(mem: FighterMemory): string | null {
  return mem.signature_move;
}

export function getRivalRecord(
  mem: FighterMemory,
  opponentId: string
): RivalRecord | null {
  return mem.rivals.find((r) => r.id === opponentId) ?? null;
}
