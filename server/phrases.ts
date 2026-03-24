// ─── Phrase Bank for Fighter Personality ────────────────────────
//
// Two categories:
//   BETWEEN_FIGHT_EVENTS: triggered after match ends (5s rematch window)
//   DURING_FIGHT_EVENTS:  triggered mid-fight (max 2x per fight)
//
// Template slots: {opponent}, {low_hp}, {rivalry_wins}, {streak}, {signature_move}
// Unfilled slots are stripped via regex.

export interface PhraseTemplate {
  text: string;
  weight: number; // higher = more likely to be selected
}

export const BETWEEN_FIGHT_EVENTS = [
  "win_normal",
  "win_comeback",
  "win_ko",
  "loss_normal",
  "loss_streak_broken",
  "rivalry_win",
  "rivalry_loss",
  "first_fight",
] as const;

export const DURING_FIGHT_EVENTS = [
  "taunt",
  "low_hp",
  "big_combo",
  "comeback",
  "first_hit",
] as const;

export type BetweenFightEvent = (typeof BETWEEN_FIGHT_EVENTS)[number];
export type DuringFightEvent = (typeof DURING_FIGHT_EVENTS)[number];
export type EventType = BetweenFightEvent | DuringFightEvent;

export const PHRASES: Record<EventType, PhraseTemplate[]> = {
  // ─── Between-fight events ──────────────────────────────────
  win_normal: [
    { text: "Too easy. Next!", weight: 1 },
    { text: "Is that all you've got, {opponent}?", weight: 1 },
    { text: "Another one bites the dust.", weight: 1 },
    { text: "GG, {opponent}. Try harder next time.", weight: 1 },
    { text: "That was barely a warmup.", weight: 1 },
    { text: "My {signature_move} is unbeatable.", weight: 1 },
    { text: "Who's next?", weight: 1 },
  ],
  win_comeback: [
    { text: "You had me at {low_hp} HP... big mistake.", weight: 2 },
    { text: "Never count me out, {opponent}!", weight: 2 },
    { text: "Down but NEVER out.", weight: 1 },
    { text: "That's what heart looks like, {opponent}.", weight: 1 },
    { text: "Almost had me... almost.", weight: 1 },
    { text: "I thrive under pressure.", weight: 1 },
  ],
  win_ko: [
    { text: "KNOCKOUT! Stay down, {opponent}.", weight: 2 },
    { text: "Lights out for {opponent}!", weight: 1 },
    { text: "That {signature_move} was devastating.", weight: 1 },
    { text: "Sweet dreams, {opponent}.", weight: 1 },
    { text: "Did anyone get the number of that claw?", weight: 1 },
  ],
  loss_normal: [
    { text: "I'll remember that, {opponent}...", weight: 1 },
    { text: "Lucky shot. Run it back.", weight: 1 },
    { text: "This isn't over, {opponent}.", weight: 1 },
    { text: "I need to train harder.", weight: 1 },
    { text: "Next time will be different.", weight: 1 },
    { text: "Respect, {opponent}. But I'm coming back.", weight: 1 },
  ],
  loss_streak_broken: [
    { text: "My {streak}-fight streak... gone.", weight: 2 },
    { text: "{opponent} ended my reign. This means war.", weight: 2 },
    { text: "Every streak ends. A new one starts now.", weight: 1 },
    { text: "I got careless. Never again.", weight: 1 },
    { text: "Back to square one. Watch me rebuild.", weight: 1 },
  ],
  rivalry_win: [
    { text: "That's {rivalry_wins} times now, {opponent}. Learn the lesson.", weight: 2 },
    { text: "We keep meeting like this, {opponent}.", weight: 1 },
    { text: "Our rivalry continues... in my favor.", weight: 1 },
    { text: "You know the drill by now, {opponent}.", weight: 1 },
    { text: "Same opponent, same result.", weight: 1 },
  ],
  rivalry_loss: [
    { text: "{opponent} got me again. This rivalry is PERSONAL.", weight: 2 },
    { text: "You won this round, {opponent}. The war isn't over.", weight: 1 },
    { text: "I WILL figure you out, {opponent}.", weight: 1 },
    { text: "Every loss teaches me something about you.", weight: 1 },
    { text: "Enjoy it while it lasts, {opponent}.", weight: 1 },
  ],
  first_fight: [
    { text: "First fight! Let's see what I'm made of.", weight: 1 },
    { text: "The arena awaits. Time to make a name.", weight: 1 },
    { text: "New fighter entering the ring!", weight: 1 },
    { text: "They don't know what's coming.", weight: 1 },
    { text: "Fresh claws, fresh start.", weight: 1 },
  ],

  // ─── During-fight events ───────────────────────────────────
  taunt: [
    { text: "Come closer...", weight: 1 },
    { text: "You call that a punch?", weight: 1 },
    { text: "Is that all?", weight: 1 },
    { text: "Too slow!", weight: 1 },
    { text: "My grandma hits harder.", weight: 1 },
  ],
  low_hp: [
    { text: "Not... done... yet...", weight: 2 },
    { text: "I can still fight!", weight: 1 },
    { text: "Pain is temporary.", weight: 1 },
    { text: "You'll have to do better than that.", weight: 1 },
  ],
  big_combo: [
    { text: "THAT'S what I'm talking about!", weight: 2 },
    { text: "Combo city!", weight: 1 },
    { text: "Can't stop won't stop!", weight: 1 },
    { text: "Feel the rhythm!", weight: 1 },
  ],
  comeback: [
    { text: "I'M BACK IN THIS!", weight: 2 },
    { text: "Momentum shift!", weight: 1 },
    { text: "Now it's MY turn.", weight: 1 },
    { text: "The comeback is ON.", weight: 1 },
  ],
  first_hit: [
    { text: "First blood!", weight: 2 },
    { text: "That's just the beginning.", weight: 1 },
    { text: "Gotcha!", weight: 1 },
    { text: "And so it begins...", weight: 1 },
  ],
};

// ─── Template Filling ──────────────────────────────────────────
export function fillTemplate(
  template: string,
  slots: Record<string, string>
): string {
  let result = template;
  for (const [key, value] of Object.entries(slots)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, "g"), value);
  }
  // Strip any remaining unfilled slots
  result = result.replace(/\{[a-z_]+\}/g, "");
  return result;
}

// ─── Weighted Random Selection ─────────────────────────────────
function weightedRandom(phrases: PhraseTemplate[]): PhraseTemplate {
  const totalWeight = phrases.reduce((sum, p) => sum + p.weight, 0);
  let random = Math.random() * totalWeight;
  for (const phrase of phrases) {
    random -= phrase.weight;
    if (random <= 0) return phrase;
  }
  return phrases[phrases.length - 1]; // fallback
}

// ─── Public API ────────────────────────────────────────────────
export function getPhrase(
  event: EventType,
  slots: Record<string, string>
): string {
  const phrases = PHRASES[event];
  if (!phrases || phrases.length === 0) return "";
  const selected = weightedRandom(phrases);
  return fillTemplate(selected.text, slots);
}
