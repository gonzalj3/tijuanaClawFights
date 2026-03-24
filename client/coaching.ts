// ─── Post-Fight Coaching System ─────────────────────────────────
//
// Flow:
//   1. Match ends → fighter "reflects" based on match stats
//   2. User sees coaching options (presets + free-form)
//   3. User selects advice → saved to coaching rules (max 2)
//   4. System prompt = 2 fixed rules + up to 2 coaching rules
//   5. Fighter acknowledges coaching
//
// When both coaching slots are full and new advice arrives, the LLM
// decides which existing rule to replace (not FIFO).

import { chooseRuleToReplace } from "./browser-llm";

export interface CoachingOption {
  label: string;       // Button text shown to user
  advice: string;      // Human-readable coaching text
  promptFragment: string; // Concise instruction injected into LLM system prompt
}

export interface CoachingEntry {
  advice: string;
  promptFragment: string;
  timestamp: number;
}

export interface MatchSummary {
  result: "win" | "loss" | "draw";
  reason: "ko" | "timeout";
  myHp: number;
  oppHp: number;
  opponentName: string;
  ticksPlayed: number;
  damageDealt: number;
  damageTaken: number;
  actionsUsed: Record<string, number>;
}

// ─── Preset Coaching Options ───────────────────────────────────
// Each promptFragment must work as a standalone numbered rule in the system prompt.
// Keep them short and imperative — the 0.5B model needs direct instructions.
export const COACHING_OPTIONS: CoachingOption[] = [
  {
    label: "Be more aggressive",
    advice: "Attack more often, don't hesitate!",
    promptFragment: "Always attack when in range. Never block or retreat.",
  },
  {
    label: "Play defensive",
    advice: "Focus on blocking and dodging first.",
    promptFragment: "Block after every attack. Jump to dodge specials.",
  },
  {
    label: "Use more specials",
    advice: "Save up for special attacks — they deal 25 damage!",
    promptFragment: "Use special when off cooldown. It does 25 damage.",
  },
  {
    label: "Keep your distance",
    advice: "Stay back and pick your moments to strike.",
    promptFragment: "After attacking, move away. Only approach to attack.",
  },
  {
    label: "Close the gap",
    advice: "Get in close and stay there — punches are fast!",
    promptFragment: "Stay close. Use punch repeatedly. Never move away.",
  },
  {
    label: "Block when low HP",
    advice: "When you're hurt, block to survive longer.",
    promptFragment: "When HP < 30, use block. Survive first, attack second.",
  },
];

// ─── Reflection Generation ─────────────────────────────────────
//
// Generates a fighter's post-match reflection based on stats.
// This is deterministic (no LLM) — phrase bank style.

const LOSS_REFLECTIONS = [
  "I took {damageTaken} damage and only dealt {damageDealt}. I need a new strategy, Coach.",
  "That {opponentName} was tough... I couldn't keep up. What should I change?",
  "I went down in {ticksPlayed} ticks. How do I last longer, Coach?",
  "I keep using {topAction} but it's not enough. What else should I try?",
  "They KO'd me with {oppHp} HP left. I need to do more damage. Ideas?",
];

const WIN_REFLECTIONS = [
  "That felt good! {damageDealt} damage dealt. Should I keep this strategy?",
  "Won with {myHp} HP left. {topAction} worked well — should I lean into it more?",
  "Took down {opponentName}! But I still took {damageTaken} damage. How can I be cleaner?",
  "Victory! My {topAction} was key. Want me to mix it up or double down?",
];

const DRAW_REFLECTIONS = [
  "We went the full distance — {ticksPlayed} ticks. I need to finish fights faster. Advice?",
  "Draw against {opponentName}. I dealt {damageDealt} but couldn't close it out. What should I do differently?",
  "Timeout! I need more aggression or better positioning. What do you think, Coach?",
];

function getTopAction(actionsUsed: Record<string, number>): string {
  let top = "punch";
  let max = 0;
  for (const [action, count] of Object.entries(actionsUsed)) {
    if (count > max) {
      max = count;
      top = action;
    }
  }
  return top;
}

function fillReflection(template: string, summary: MatchSummary): string {
  const topAction = getTopAction(summary.actionsUsed);
  return template
    .replace("{damageTaken}", String(summary.damageTaken))
    .replace("{damageDealt}", String(summary.damageDealt))
    .replace("{opponentName}", summary.opponentName)
    .replace("{ticksPlayed}", String(summary.ticksPlayed))
    .replace("{topAction}", topAction)
    .replace("{myHp}", String(summary.myHp))
    .replace("{oppHp}", String(summary.oppHp));
}

export function generateReflection(summary: MatchSummary): string {
  let pool: string[];
  switch (summary.result) {
    case "loss":
      pool = LOSS_REFLECTIONS;
      break;
    case "win":
      pool = WIN_REFLECTIONS;
      break;
    case "draw":
      pool = DRAW_REFLECTIONS;
      break;
  }
  const template = pool[Math.floor(Math.random() * pool.length)];
  return fillReflection(template, summary);
}

// ─── Coaching Rules (localStorage) ───────────────────────────
// Max 2 coaching rules at a time (slots 3 & 4 in the prompt).
// FIFO: newest coaching pushes out the oldest when both slots full.
const STORAGE_KEY = "clawfights-coaching-history";
const MAX_COACHING_RULES = 2;

export function getCoachingHistory(): CoachingEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CoachingEntry[];
  } catch {
    return [];
  }
}

/**
 * Apply new coaching advice. If both slots are full, the LLM decides
 * which existing rule to replace. Returns the rule that was dropped (if any).
 */
export async function applyCoaching(advice: string, promptFragment: string): Promise<string | null> {
  const history = getCoachingHistory();
  let droppedRule: string | null = null;

  if (history.length >= MAX_COACHING_RULES) {
    // Both slots full — ask the LLM which to replace
    const existingRules = history.map((e) => e.promptFragment);
    const idx = await chooseRuleToReplace(existingRules, promptFragment);
    if (idx !== null && idx >= 1 && idx <= history.length) {
      droppedRule = history[idx - 1].promptFragment;
      history[idx - 1] = { advice, promptFragment, timestamp: Date.now() };
    } else {
      // LLM couldn't decide — replace the oldest as fallback
      droppedRule = history[0].promptFragment;
      history.shift();
      history.push({ advice, promptFragment, timestamp: Date.now() });
    }
  } else {
    history.push({ advice, promptFragment, timestamp: Date.now() });
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  return droppedRule;
}

export function clearCoachingHistory(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// ─── Dynamic System Prompt ─────────────────────────────────────
//
// Minimal mechanical ruleset for a 0.5B model.
// Structure: 2 fixed rules + up to 2 coaching rules = max 4 rules total.
// The model sees a numbered list and picks an action. That's it.

export function buildDynamicSystemPrompt(): string {
  const rules: string[] = [
    "If distance > 2: move toward opponent.",
    "Attacks hit only at distance ≤ 2. punch=10dmg kick=15dmg(2cd) special=25dmg(5cd).",
  ];

  // Add coaching rules (max 2)
  const history = getCoachingHistory();
  for (const entry of history) {
    rules.push(entry.promptFragment);
  }

  const numberedRules = rules.map((r, i) => `${i + 1}. ${r}`).join("\n");

  return `Pick ONE action per turn: punch kick special block jump move_left move_right

RULES:
${numberedRules}

Reply ONLY the action name.`;
}

// ─── Fighter Acknowledgment ────────────────────────────────────
const ACKNOWLEDGMENTS = [
  "Got it, Coach! I'll try that next time.",
  "Understood! Let's see how that works.",
  "On it! Watch me in the next fight.",
  "Good call, Coach. I'm ready.",
  "Makes sense. Let's go!",
  "I'll focus on that. Bring on the next one!",
];

export function getAcknowledgment(): string {
  return ACKNOWLEDGMENTS[Math.floor(Math.random() * ACKNOWLEDGMENTS.length)];
}

// ─── Tournament Reflections ──────────────────────────────────────
export const TOURNAMENT_REFLECTIONS: Record<number, { win: string[]; loss: string[] }> = {
  0: {
    win: ["Easy one, Coach! My claws are warmed up."],
    loss: ["I... lost to a punching bag? Help me, Coach."],
  },
  1: {
    win: ["That rookie didn't stand a chance! What's next?"],
    loss: ["Even the rookie got me... I need to learn the basics, Coach."],
  },
  2: {
    win: ["She was fast, but I caught her! Movement is key."],
    loss: ["She danced circles around me. I need to control the ring better."],
  },
  3: {
    win: ["That brawler hit hard, but I hit harder!"],
    loss: ["Too much raw power. I need a way to survive that aggression, Coach."],
  },
  4: {
    win: ["Caught the ghost! You can't run forever."],
    loss: ["He keeps disappearing... How do I pin down a hit-and-run fighter?"],
  },
  5: {
    win: ["Survived the storm! Relentless, but I held my ground."],
    loss: ["That was non-stop pressure. I couldn't breathe. Help me, Coach."],
  },
  6: {
    win: ["Broke through the wall! Patience pays off."],
    loss: ["I kept hitting a wall... literally. How do I crack a defensive fighter?"],
  },
  7: {
    win: ["The mirror couldn't keep up with my style! I'm unpredictable."],
    loss: ["It copied everything I did... and did it better. I need to switch it up."],
  },
  8: {
    win: ["WE DID IT, COACH! THE CHAMPIONSHIP IS OURS!"],
    loss: ["The champ is on another level. Three phases of pain. What's the plan, Coach?"],
  },
};

// Per-rung suggested coaching option indices (into COACHING_OPTIONS array)
export const TOURNAMENT_SUGGESTED_COACHING: Record<number, number[]> = {
  0: [0, 4],    // "Be aggressive", "Close the gap"
  1: [0, 4],    // "Be aggressive", "Close the gap"
  2: [3, 4],    // "Keep your distance", "Close the gap"
  3: [1, 5],    // "Play defensive", "Block when low HP"
  4: [0, 4],    // "Be aggressive", "Close the gap"
  5: [1, 5],    // "Play defensive", "Block when low HP"
  6: [0, 2],    // "Be aggressive", "Use more specials"
  7: [2, 3],    // "Use more specials", "Keep your distance"
  8: [1, 2, 5], // "Play defensive", "Use more specials", "Block when low HP"
};
