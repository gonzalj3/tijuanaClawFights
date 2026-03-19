// Browser LLM wrapper using WebLLM (runs quantized models via WebGPU)
// No heuristic fallback — returns null if inference fails or model isn't ready.

import { CreateMLCEngine, type MLCEngine, type InitProgressReport } from "@mlc-ai/web-llm";

const MODEL_ID = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";

const VALID_ACTIONS = new Set([
  "punch", "kick", "special", "block", "jump", "move_left", "move_right",
]);

const SYSTEM_PROMPT = `You are an aggressive fighting game AI. Pick ONE action per turn.

ACTIONS: punch (10dmg), kick (15dmg, 2cd), special (25dmg, 5cd), block, jump, move_left, move_right

RULES:
- Attacks only hit at distance ≤ 2
- If distance > 2: MUST move toward opponent (use "approach" direction in state)
- If distance ≤ 2: attack! Use special if off cooldown, else kick if off cooldown, else punch
- Block if low HP and opponent just attacked
- Be aggressive — close distance and attack constantly

Respond with ONLY the action name, nothing else.`;

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

function buildUserPrompt(state: GameState): string {
  const { you, opponent, tick, timeRemaining } = state;
  const dist = Math.abs(you.x - opponent.x);

  const cds = Object.entries(you.cooldowns)
    .map(([k, v]) => `${k}:${v}`)
    .join(",") || "none";

  const oppCds = Object.entries(opponent.cooldowns)
    .map(([k, v]) => `${k}:${v}`)
    .join(",") || "none";

  const approach = you.x < opponent.x ? "move_right" : "move_left";

  return `T${tick} ${timeRemaining}s left
Me: hp=${you.hp} Opp: hp=${opponent.hp} Dist: ${dist}
My cd: [${cds}] Opp last: ${opponent.lastAction ?? "-"}
Approach: ${approach}
${dist > 2 ? `Too far to attack — use ${approach}` : "In range — attack!"}
Action?`;
}

export async function pickAction(state: GameState): Promise<Action | null> {
  if (!engine) return null;

  try {
    const response = await engine.chat.completions.create({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(state) },
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
