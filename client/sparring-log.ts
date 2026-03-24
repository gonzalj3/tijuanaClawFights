// ─── Sparring Log: Records human gameplay for LLM learning ──────
//
// When the user plays in Spar Mode, their actions are recorded with
// game state context. After the match, the LLM analyzes the replay
// and extracts a fighting style summary. This style is injected into
// the AI mode system prompt so the fighter mimics the human's approach.
//
// All data stored in localStorage. No server communication.

import type { Action } from "./browser-llm";

export interface SparActionEntry {
  tick: number;
  myHp: number;
  oppHp: number;
  distance: number;
  action: Action;
  oppAction: Action | null;
}

export interface SparringLog {
  timestamp: string;
  result: "win" | "loss" | "draw";
  actions: SparActionEntry[];
}

const STORAGE_KEY = "clawfights-spar-logs";
const STYLE_KEY = "clawfights-coach-style";
const MAX_LOGS = 5;

export function getSparLogs(): SparringLog[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveSparLog(log: SparringLog): void {
  const logs = getSparLogs();
  logs.push(log);
  while (logs.length > MAX_LOGS) logs.shift();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
}

export function getCoachStyle(): string | null {
  return localStorage.getItem(STYLE_KEY);
}

export function setCoachStyle(style: string): void {
  localStorage.setItem(STYLE_KEY, style);
}

// Build a compact replay summary for LLM analysis
export function buildReplaySummary(log: SparringLog): string {
  const totalActions: Record<string, number> = {};
  let closeRangeActions = 0;
  let farRangeActions = 0;
  let aggressiveActions = 0;
  let defensiveActions = 0;

  for (const entry of log.actions) {
    totalActions[entry.action] = (totalActions[entry.action] || 0) + 1;
    if (entry.distance <= 2) closeRangeActions++;
    else farRangeActions++;
    if (["punch", "kick", "special"].includes(entry.action)) aggressiveActions++;
    if (["block", "jump"].includes(entry.action)) defensiveActions++;
  }

  const sortedActions = Object.entries(totalActions)
    .sort((a, b) => b[1] - a[1])
    .map(([action, count]) => `${action}: ${count}`)
    .join(", ");

  return `Match result: ${log.result}
Total actions: ${log.actions.length}
Action breakdown: ${sortedActions}
Close range actions (dist ≤ 2): ${closeRangeActions}
Far range actions (dist > 2): ${farRangeActions}
Aggressive actions (punch/kick/special): ${aggressiveActions}
Defensive actions (block/jump): ${defensiveActions}`;
}
