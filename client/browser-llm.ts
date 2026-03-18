// Browser LLM wrapper using WebLLM (runs quantized models via WebGPU)
// No heuristic fallback — returns null if inference fails or model isn't ready.

import { CreateMLCEngine, type MLCEngine, type InitProgressReport } from "@mlc-ai/web-llm";

const MODEL_ID = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";

const VALID_ACTIONS = new Set([
  "punch", "kick", "special", "block", "jump", "move_left", "move_right",
]);

const SYSTEM_PROMPT = `You are a fighting game AI in Tijuana Claw Fights. You control a fighter in a 1v1 arena.

## Arena
- Width: 0-10, two fighters
- Tick rate: 400ms, 150 ticks per match (60s)

## Actions (pick exactly ONE per tick)
- punch: 10 dmg, no cooldown, range ≤2
- kick: 15 dmg, 2-tick cooldown, range ≤2
- special: 25 dmg, 5-tick cooldown, range ≤2
- block: negates incoming attack, 2-tick cooldown
- jump: dodges attacks + moves 1 away from opponent
- move_left / move_right: move 1 unit

## Combat Rules
- Attacks hit if distance ≤ 2 and target isn't jumping
- Block negates all damage from that tick
- Jump dodges AND repositions 1 away
- Both fighters act simultaneously

## Strategy Tips
- Close distance before attacking (move toward opponent when dist > 2)
- Use special when off cooldown for max damage
- Block or jump when you expect an attack
- Track opponent patterns to predict and counter

Respond with ONLY the action name. No explanation.`;

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

  return `T${tick} ${timeRemaining}s left
Me: hp=${you.hp} x=${you.x} cd=[${cds}]
Opp: hp=${opponent.hp} x=${opponent.x} cd=[${oppCds}] last=${opponent.lastAction ?? "-"}
Dist: ${dist}
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
