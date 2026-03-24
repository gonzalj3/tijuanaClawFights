// Browser LLM wrapper using WebLLM (runs quantized models via WebGPU)
// No heuristic fallback — returns null if inference fails or model isn't ready.

import { CreateMLCEngine, hasModelInCache, type MLCEngine, type InitProgressReport } from "@mlc-ai/web-llm";
import { buildDynamicSystemPrompt } from "./coaching";

const MODEL_ID = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";

export async function isModelCached(): Promise<boolean> {
  try {
    return await hasModelInCache(MODEL_ID);
  } catch {
    return false;
  }
}

const VALID_ACTIONS = new Set([
  "punch", "kick", "special", "block", "jump", "move_left", "move_right",
]);

// System prompt is now dynamic — built from coaching history
// See coaching.ts for the base prompt + coaching section builder

let engine: MLCEngine | null = null;

export function checkWebGPUSupport(): boolean {
  return "gpu" in navigator;
}

export async function initEngine(
  onProgress: (report: InitProgressReport) => void
): Promise<void> {
  engine = await CreateMLCEngine(MODEL_ID, {
    initProgressCallback: onProgress,
  });
}

export type Action = "punch" | "kick" | "special" | "block" | "jump" | "move_left" | "move_right";

export interface GameState {
  tick: number;
  you: {
    hp: number;
    x: number;
    cooldowns: Record<string, number>;
    lastAction: string | null;
  };
  opponent: {
    hp: number;
    x: number;
    cooldowns: Record<string, number>;
    lastAction: string | null;
  };
  timeRemaining: number;
}

function buildUserPrompt(state: GameState, coachHint?: string): string {
  const { you, opponent } = state;
  const dist = Math.abs(you.x - opponent.x);
  const approach = you.x < opponent.x ? "move_right" : "move_left";

  const cds = Object.entries(you.cooldowns)
    .map(([k, v]) => `${k}:${v}`)
    .join(",") || "none";

  let prompt: string;
  if (dist > 2) {
    prompt = `hp=${you.hp} opp=${opponent.hp} dist=${dist} TOO FAR. Use ${approach}`;
  } else {
    prompt = `hp=${you.hp} opp=${opponent.hp} dist=${dist} cd=[${cds}] IN RANGE`;
  }

  if (coachHint) {
    prompt += ` COACH:${coachHint}`;
  }

  return prompt;
}

export async function analyzeReplay(replaySummary: string): Promise<string | null> {
  if (!engine) return null;
  try {
    const response = await engine.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "You analyze fighting game replays. Given match stats, summarize the player's fighting style in 2-3 short sentences. Focus on: preferred range, favorite attacks, aggression level, defensive patterns. Be concise and specific.",
        },
        {
          role: "user",
          content: `Analyze this fight replay. The Coach fought this match manually.\n\n${replaySummary}\n\nSummarize their fighting style:`,
        },
      ],
      max_tokens: 100,
      temperature: 0.5,
    });
    return response.choices[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}

/**
 * Given existing coaching rules and a new one, ask the LLM which existing
 * rule to drop. Returns the 1-based index of the rule to replace, or null
 * if the LLM can't decide (caller falls back to dropping oldest).
 */
export async function chooseRuleToReplace(
  existingRules: string[],
  newRule: string
): Promise<number | null> {
  if (!engine) return null;
  try {
    const numbered = existingRules.map((r, i) => `${i + 1}. ${r}`).join("\n");
    const response = await engine.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "You manage a fighter's rulebook. Given existing rules and a new rule, pick which existing rule to REPLACE. Reply with ONLY the number.",
        },
        {
          role: "user",
          content: `Current rules:\n${numbered}\n\nNew rule: ${newRule}\n\nWhich rule number should be replaced?`,
        },
      ],
      max_tokens: 5,
      temperature: 0.1,
    });
    const raw = response.choices[0]?.message?.content?.trim();
    if (!raw) return null;
    const num = parseInt(raw, 10);
    if (num >= 1 && num <= existingRules.length) return num;
    return null;
  } catch {
    return null;
  }
}

export async function pickAction(state: GameState, coachHint?: string): Promise<Action | null> {
  if (!engine) return null;

  const approach = state.you.x < state.opponent.x ? "move_right" : "move_left";

  try {
    const response = await engine.chat.completions.create({
      messages: [
        { role: "system", content: buildDynamicSystemPrompt(approach) },
        { role: "user", content: buildUserPrompt(state, coachHint) },
      ],
      max_tokens: 10,
      temperature: 0.3,
    });

    const raw = response.choices[0]?.message?.content?.trim().toLowerCase();
    if (raw && VALID_ACTIONS.has(raw)) {
      return raw as Action;
    }
    // Try to extract a valid action from the response
    for (const action of VALID_ACTIONS) {
      if (raw?.includes(action)) return action as Action;
    }
    return null;
  } catch {
    return null;
  }
}
