// Browser-based LLM fighter agent
// Downloads a quantized model via WebLLM and plays using in-browser inference.
// No heuristic fallback — if LLM isn't ready or inference is slow, ticks are skipped.

const PLAY_AGENT_VERSION = "v12";
console.log(`[play-agent] version ${PLAY_AGENT_VERSION}`);

import { checkWebGPUSupport, initEngine, isModelCached, pickAction, type GameState, type Action } from "./browser-llm";
import {
  generateReflection,
  applyCoaching,
  getAcknowledgment,
  getCoachingHistory,
  removeCoachingRule,
  updateCoachingRule,
  getBaseRules,
  setBaseRules,
  getDefaultBaseRules,
  COACHING_OPTIONS,
  TOURNAMENT_REFLECTIONS,
  TOURNAMENT_SUGGESTED_COACHING,
  type MatchSummary,
} from "./coaching";
import { saveSparLog, buildReplaySummary, setCoachStyle, type SparActionEntry, type SparringLog } from "./sparring-log";
import { analyzeReplay } from "./browser-llm";

// ─── DOM Elements ───────────────────────────────────────────────
const statusEl = document.getElementById("status")!;
const progressBar = document.getElementById("progress-bar") as HTMLProgressElement;
const progressText = document.getElementById("progress-text")!;
const progressSection = document.getElementById("progress-section")!;
const fightBtn = document.getElementById("fight-btn") as HTMLButtonElement;
const identityNameEl = document.getElementById("identity-name")!;
const identityStatsEl = document.getElementById("identity-stats")!;
const recordEl = document.getElementById("record")!;
const matchInfoEl = document.getElementById("match-info")!;
const webgpuError = document.getElementById("webgpu-error")!;
const mainContent = document.getElementById("main-content")!;
const agentLog = document.getElementById("agent-log")!;
const tickDisplay = document.getElementById("tick-display")!;
const arenaOverlay = document.getElementById("arena-overlay")!;
const arenaOverlayText = document.getElementById("arena-overlay-text")!;

// ─── Naming Ceremony DOM ────────────────────────────────────────
const namingOverlay = document.getElementById("naming-overlay")!;
const namingInput = document.getElementById("naming-input") as HTMLInputElement;
const namingConfirm = document.getElementById("naming-confirm") as HTMLButtonElement;
const namingSkip = document.getElementById("naming-skip") as HTMLButtonElement;

// ─── Stats Card DOM ─────────────────────────────────────────────
const statsCard = document.getElementById("stats-card")!;

// ─── Coaching DOM ──────────────────────────────────────────────
const coachingPanel = document.getElementById("coaching-panel")!;
const coachingReflection = document.getElementById("coaching-reflection")!;
const coachingOptionsEl = document.getElementById("coaching-options")!;
const coachingInput = document.getElementById("coaching-input") as HTMLInputElement;
const coachingSend = document.getElementById("coaching-send")!;
const coachingSkip = document.getElementById("coaching-skip")!;
const coachingAck = document.getElementById("coaching-ack")!;
const fightAgainBtn = document.getElementById("fight-again-btn") as HTMLButtonElement;

// ─── Tournament DOM Elements ───────────────────────────────────
const tournamentBtn = document.getElementById("tournament-btn") as HTMLButtonElement;
const tournamentOverlay = document.getElementById("tournament-overlay")!;
const tournamentLadderEl = document.getElementById("tournament-ladder")!;
const tournamentFightBtn = document.getElementById("tournament-fight-btn") as HTMLButtonElement;
const tournamentBackBtn = document.getElementById("tournament-back-btn") as HTMLButtonElement;
const tournamentVictoryOverlay = document.getElementById("tournament-victory-overlay")!;
const tournamentVictoryDismiss = document.getElementById("tournament-victory-dismiss") as HTMLButtonElement;

// ─── Tournament Post-Fight Overlay DOM ──────────────────────────
const postfightOverlay = document.getElementById("tournament-postfight-overlay")!;
const postfightResultLabel = document.getElementById("postfight-result-label")!;
const postfightOpponent = document.getElementById("postfight-opponent")!;
const postfightStats = document.getElementById("postfight-stats")!;
const postfightActionsUsed = document.getElementById("postfight-actions-used")!;
const postfightReflection = document.getElementById("postfight-reflection")!;
const postfightCoachingLabel = document.getElementById("postfight-coaching-label")!;
const postfightCoachingOptions = document.getElementById("postfight-coaching-options")!;
const postfightCoachingCustom = document.getElementById("postfight-coaching-custom")!;
const postfightCoachingInput = document.getElementById("postfight-coaching-input") as HTMLInputElement;
const postfightCoachingSend = document.getElementById("postfight-coaching-send")!;
const postfightSkip = document.getElementById("postfight-skip")!;
const postfightCoachingAck = document.getElementById("postfight-coaching-ack")!;
const postfightNav = document.getElementById("postfight-nav")!;
const postfightStreak = document.getElementById("postfight-streak")!;

// ─── Prompt Viewer DOM ────────────────────────────────────────
const brainBtn = document.getElementById("brain-btn") as HTMLButtonElement;
const promptViewerStandalone = document.getElementById("prompt-viewer-standalone")!;
const promptViewerBrain = document.getElementById("prompt-viewer-brain")!;
const promptViewerCoaching = document.getElementById("prompt-viewer-coaching")!;
const promptViewerPostfight = document.getElementById("prompt-viewer-postfight")!;

const MAX_LOG_ENTRIES = 150;

function log(cls: string, text: string) {
  const el = document.createElement("div");
  el.className = cls;
  el.textContent = text;
  agentLog.appendChild(el);
  while (agentLog.children.length > MAX_LOG_ENTRIES) {
    agentLog.removeChild(agentLog.firstChild!);
  }
  agentLog.scrollTop = agentLog.scrollHeight;
}

// ─── Prompt Viewer (Fighter Brain) ──────────────────────────────
function renderPromptViewer(container: HTMLElement) {
  const baseRules = getBaseRules();
  const defaults = getDefaultBaseRules();
  const coaching = getCoachingHistory();

  let html = `<div class="prompt-viewer-title">Fighter Brain — Active Rules</div>`;

  // Base rules
  baseRules.forEach((rule, i) => {
    html += `
      <div class="prompt-rule" data-type="base" data-index="${i}">
        <span class="prompt-rule-num">${i + 1}.</span>
        <span class="prompt-rule-text base">${escapeHtml(rule)}</span>
        <div class="prompt-rule-actions">
          <button class="prompt-rule-btn edit" title="Edit rule" data-type="base" data-index="${i}">&#9998;</button>
          <button class="prompt-rule-btn delete" title="Reset to default" data-type="base" data-index="${i}">&#8634;</button>
        </div>
      </div>`;
  });

  // Coaching rules
  coaching.forEach((entry, i) => {
    const ruleNum = baseRules.length + i + 1;
    html += `
      <div class="prompt-rule" data-type="coaching" data-index="${i}">
        <span class="prompt-rule-num">${ruleNum}.</span>
        <span class="prompt-rule-text coaching">${escapeHtml(entry.promptFragment)}</span>
        <div class="prompt-rule-actions">
          <button class="prompt-rule-btn edit" title="Edit rule" data-type="coaching" data-index="${i}">&#9998;</button>
          <button class="prompt-rule-btn delete" title="Delete rule" data-type="coaching" data-index="${i}">&times;</button>
        </div>
      </div>`;
  });

  // Add rule button (if coaching slots available)
  if (coaching.length < 2) {
    html += `<button class="prompt-add-rule" id="prompt-add-${container.id}">+ Add coaching rule (${2 - coaching.length} slot${coaching.length === 1 ? "" : "s"} open)</button>`;
  } else {
    html += `<button class="prompt-add-rule disabled" disabled>All coaching slots full</button>`;
  }

  container.innerHTML = html;

  // Wire up edit buttons
  container.querySelectorAll<HTMLButtonElement>(".prompt-rule-btn.edit").forEach((btn) => {
    btn.addEventListener("click", () => {
      const type = btn.dataset.type!;
      const idx = parseInt(btn.dataset.index!, 10);
      const ruleEl = btn.closest(".prompt-rule")!;
      const textEl = ruleEl.querySelector(".prompt-rule-text")!;
      const actionsEl = ruleEl.querySelector(".prompt-rule-actions")!;
      const currentText = type === "base" ? baseRules[idx] : coaching[idx].promptFragment;

      // Replace with inline edit
      textEl.outerHTML = `<input class="prompt-rule-edit-input" value="${escapeAttr(currentText)}" />`;
      actionsEl.outerHTML = `
        <div class="prompt-rule-edit-actions">
          <button class="prompt-rule-btn save" title="Save">&#10003;</button>
          <button class="prompt-rule-btn cancel" title="Cancel">&#10007;</button>
        </div>`;

      const input = ruleEl.querySelector(".prompt-rule-edit-input") as HTMLInputElement;
      input.focus();
      input.select();

      const save = () => {
        const val = input.value.trim();
        if (!val) return;
        if (type === "base") {
          const rules = getBaseRules();
          rules[idx] = val;
          setBaseRules(rules);
        } else {
          updateCoachingRule(idx, val);
        }
        renderPromptViewer(container);
        refreshAllPromptViewers(container);
      };

      ruleEl.querySelector(".prompt-rule-btn.save")!.addEventListener("click", save);
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") save(); });
      ruleEl.querySelector(".prompt-rule-btn.cancel")!.addEventListener("click", () => {
        renderPromptViewer(container);
      });
    });
  });

  // Wire up delete/reset buttons
  container.querySelectorAll<HTMLButtonElement>(".prompt-rule-btn.delete").forEach((btn) => {
    btn.addEventListener("click", () => {
      const type = btn.dataset.type!;
      const idx = parseInt(btn.dataset.index!, 10);
      if (type === "base") {
        // Reset to default
        const rules = getBaseRules();
        rules[idx] = defaults[idx];
        setBaseRules(rules);
      } else {
        removeCoachingRule(idx);
      }
      renderPromptViewer(container);
      refreshAllPromptViewers(container);
    });
  });

  // Wire up add button
  const addBtn = container.querySelector<HTMLButtonElement>(".prompt-add-rule:not(.disabled)");
  if (addBtn) {
    addBtn.addEventListener("click", () => {
      // Replace button with input
      addBtn.outerHTML = `
        <div class="prompt-rule" style="border-color:var(--cyan)">
          <span class="prompt-rule-num">${baseRules.length + coaching.length + 1}.</span>
          <input class="prompt-rule-edit-input" placeholder="Type a new coaching rule..." id="prompt-new-input-${container.id}" />
          <div class="prompt-rule-edit-actions">
            <button class="prompt-rule-btn save" id="prompt-new-save-${container.id}" title="Save">&#10003;</button>
            <button class="prompt-rule-btn cancel" id="prompt-new-cancel-${container.id}" title="Cancel">&#10007;</button>
          </div>
        </div>`;
      const newInput = container.querySelector(`#prompt-new-input-${container.id}`) as HTMLInputElement;
      newInput.focus();

      const saveNew = async () => {
        const val = newInput.value.trim();
        if (!val) return;
        await applyCoaching(val, val);
        renderPromptViewer(container);
        refreshAllPromptViewers(container);
      };

      container.querySelector(`#prompt-new-save-${container.id}`)!.addEventListener("click", saveNew);
      newInput.addEventListener("keydown", (e) => { if (e.key === "Enter") saveNew(); });
      container.querySelector(`#prompt-new-cancel-${container.id}`)!.addEventListener("click", () => {
        renderPromptViewer(container);
      });
    });
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Keep all visible prompt viewers in sync
function refreshAllPromptViewers(except?: HTMLElement) {
  const viewers = [promptViewerBrain, promptViewerCoaching, promptViewerPostfight];
  for (const v of viewers) {
    if (v !== except && v.innerHTML) {
      renderPromptViewer(v);
    }
  }
}

// ─── Brain Button Toggle ──────────────────────────────────────
brainBtn.addEventListener("click", () => {
  const isVisible = promptViewerStandalone.classList.toggle("visible");
  brainBtn.classList.toggle("active", isVisible);
  if (isVisible) {
    renderPromptViewer(promptViewerBrain);
  }
});

// ─── Coach Shout ────────────────────────────────────────────────
const coachBar = document.getElementById("coach-bar")!;
const shoutButtons = document.querySelectorAll<HTMLButtonElement>(".shout-btn");

const coachPopupMale = document.getElementById("coach-popup-male")!;
const coachPopupFemale = document.getElementById("coach-popup-female")!;
const speechBubbleMale = document.getElementById("speech-bubble-male")!;
const speechBubbleFemale = document.getElementById("speech-bubble-female")!;

const SHOUT_HINTS: Record<string, string> = {
  attack: "ATTACK! Use your strongest available move!",
  movein: "CLOSE THE DISTANCE! Move toward the opponent NOW!",
  retreat: "BACK OFF! Jump or move away from the opponent!",
  block: "DEFEND! Block the next attack!",
};

const SHOUT_LABELS: Record<string, string> = {
  attack: "ATTACK!",
  movein: "MOVE IN!",
  retreat: "RETREAT!",
  block: "BLOCK!",
};

let coachShout: string | null = null;
let shoutTicksLeft = 0;

shoutButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const key = btn.dataset.shout!;
    coachShout = SHOUT_HINTS[key];
    shoutTicksLeft = 4;
    shoutButtons.forEach((b) => b.classList.remove("shout-active"));
    btn.classList.add("shout-active");
    log("log-info", `Coach: ${btn.textContent}`);

    // Show coach popup: female for attack/movein, male for retreat/block
    coachPopupMale.classList.remove("visible");
    coachPopupFemale.classList.remove("visible");
    const isMale = key === "retreat" || key === "block";
    const popup = isMale ? coachPopupMale : coachPopupFemale;
    const bubble = isMale ? speechBubbleMale : speechBubbleFemale;
    bubble.textContent = SHOUT_LABELS[key];
    popup.classList.add("visible");
  });
});

function clearShout() {
  coachShout = null;
  shoutTicksLeft = 0;
  shoutButtons.forEach((b) => b.classList.remove("shout-active"));
  coachPopupMale.classList.remove("visible");
  coachPopupFemale.classList.remove("visible");
}

// ─── Game Mode (AI vs Spar) ─────────────────────────────────────
type GameMode = "ai" | "spar";
let gameMode: GameMode = "ai";
let pendingKeyAction: Action | null = null;

const keyboardHud = document.getElementById("keyboard-hud")!;
const sparNextBtn = document.getElementById("spar-next-btn") as HTMLButtonElement;

// ─── Progression State ──────────────────────────────────────────
const SPAR_UNLOCK_THRESHOLD = 2;
let matchCount = parseInt(localStorage.getItem("clawfights-match-count") || "0", 10);
let sparUnlocked = localStorage.getItem("clawfights-spar-unlocked") === "true";
let firstCoachingDone = localStorage.getItem("clawfights-first-coaching-done") === "true";

// ─── Tournament State ──────────────────────────────────────────
let tournamentMode = false;
let tournamentRung = 0;

interface TournamentState {
  currentRung: number;          // 0-8, or 9 if completed
  attempts: Record<number, number>;
  completed: boolean;
}

const TOURNAMENT_STORAGE_KEY = "clawfights-tournament";

const TOURNAMENT_LADDER = [
  { rung: 0, name: "Saco de Arena",  title: "The Punching Bag" },
  { rung: 1, name: "El Novato",      title: "The Rookie" },
  { rung: 2, name: "La Bailarina",   title: "The Dancer" },
  { rung: 3, name: "El Matón",       title: "The Brawler" },
  { rung: 4, name: "El Fantasma",    title: "The Ghost" },
  { rung: 5, name: "La Tormenta",    title: "The Storm" },
  { rung: 6, name: "El Muro",        title: "The Wall" },
  { rung: 7, name: "El Espejo",      title: "The Mirror" },
  { rung: 8, name: "El Campeón",     title: "The Boss" },
];

function loadTournamentState(): TournamentState {
  try {
    const raw = localStorage.getItem(TOURNAMENT_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { currentRung: 0, attempts: {}, completed: false };
}

function saveTournamentState(state: TournamentState): void {
  localStorage.setItem(TOURNAMENT_STORAGE_KEY, JSON.stringify(state));
}

// Spar mode WebSocket connections (separate from main `ws`)
let sparHumanWs: WebSocket | null = null;
let sparLlmWs: WebSocket | null = null;
let sparLlmInferring = false;

function activateSparMode() {
  gameMode = "spar";
  coachBar.style.display = "none";
  keyboardHud.style.display = "block";
  pendingKeyAction = null;
  log("log-info", "Mode: YOU fight via keyboard vs your AI fighter");
}

function resetToAiMode() {
  gameMode = "ai";
  coachBar.style.display = "";
  keyboardHud.style.display = "none";
  pendingKeyAction = null;
  // Clean up spar connections
  if (sparHumanWs && sparHumanWs.readyState === WebSocket.OPEN) sparHumanWs.close();
  if (sparLlmWs && sparLlmWs.readyState === WebSocket.OPEN) sparLlmWs.close();
  sparHumanWs = null;
  sparLlmWs = null;
  sparLlmInferring = false;
}

// ─── Keyboard Controls (Spar Mode) ─────────────────────────────
const KEY_ACTION_MAP: Record<string, Action> = {
  ArrowLeft: "move_left",
  a: "move_left",
  ArrowRight: "move_right",
  d: "move_right",
  ArrowUp: "jump",
  w: "jump",
  z: "punch",
  j: "punch",
  x: "kick",
  k: "kick",
  c: "special",
  l: "special",
  " ": "block",
};

document.addEventListener("keydown", (e) => {
  if (gameMode !== "spar") return;
  // Don't capture keys when typing in input fields
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  const action = KEY_ACTION_MAP[e.key];
  if (action) {
    e.preventDefault();
    pendingKeyAction = action;
  }
});

// ─── State ──────────────────────────────────────────────────────
let ws: WebSocket | null = null;
let modelReady = false;
let inferring = false;
let wins = 0;
let losses = 0;
let draws = 0;
let winStreak = 0;
let lastStateTick = -1;
let lastStateReceivedAt = 0; // timestamp of most recent game_state (including skipped)

// Match tracking for coaching reflections
let matchDamageDealt = 0;
let matchDamageTaken = 0;
let matchActionsUsed: Record<string, number> = {};
let matchTicksPlayed = 0;
let lastMyHp = 100;
let lastOppHp = 100;
let currentOpponent = "";
let coachingActive = false;
let myMinHp = 100; // track lowest HP for comeback detection
let wasLosingHp = false; // was behind at some point

// Spar mode action recording (for LLM learning)
interface SparAction {
  tick: number;
  myHp: number;
  oppHp: number;
  distance: number;
  action: Action;
  oppAction: Action | null;
}
let sparMatchActions: SparAction[] = [];

// ─── Tab Title ──────────────────────────────────────────────────
const originalTitle = document.title;
let titleTimer: ReturnType<typeof setTimeout> | null = null;

function setTempTitle(title: string, durationMs = 5000) {
  document.title = title;
  if (titleTimer) clearTimeout(titleTimer);
  titleTimer = setTimeout(() => { document.title = originalTitle; }, durationMs);
}

// ─── Notifications ──────────────────────────────────────────────
let notifPermissionRequested = false;

function requestNotifPermission() {
  if (notifPermissionRequested) return;
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") {
    Notification.requestPermission();
  }
  notifPermissionRequested = true;
}

function sendNotification(title: string, body: string) {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  if (!document.hidden) return; // only when tabbed away
  new Notification(title, { body, icon: "/assets/arena-bg.png" });
}

const MIN_RESPONSE_MS = 120; // floor to clear server's anti-heuristic filter

// ─── Player Identity Persistence ────────────────────────────────
function getOrCreatePlayerId(): string {
  let id = localStorage.getItem("clawfights-player-id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("clawfights-player-id", id);
  }
  return id;
}

const playerId = getOrCreatePlayerId();

// ─── Fighter Name Generator ──────────────────────────────────────
const NAME_ADJECTIVES = [
  "Iron", "Crimson", "Shadow", "Lucky", "Mad", "Golden", "Silent", "Furious",
  "Rogue", "Savage", "Neon", "Feral", "Phantom", "Wicked", "Blazing", "Rusty",
  "Toxic", "Mystic", "Bone", "Razor", "Thunder", "Velvet", "Chaos", "Turbo",
  "Brutal", "Cosmic", "Mighty", "Dark", "Bloody", "Swift", "Steel", "Wild",
];

const NAME_NOUNS = [
  "Claw", "Pincer", "Fang", "Crusher", "Snapper", "Brawler", "Fury", "Storm",
  "Havoc", "Mantis", "Scorpion", "Viper", "Titan", "Hammer", "Blade", "Ripper",
  "Lobster", "Bruiser", "Reaper", "Tornado", "Menace", "Demon", "Slasher", "Beast",
  "Predator", "Wrecker", "Mauler", "Mangler", "Thrasher", "Striker", "Knuckle", "Barrage",
];

function generateRandomName(): string {
  const adj = NAME_ADJECTIVES[Math.floor(Math.random() * NAME_ADJECTIVES.length)];
  const noun = NAME_NOUNS[Math.floor(Math.random() * NAME_NOUNS.length)];
  return `${adj} ${noun}`;
}

// ─── Fighter Greetings (phrase bank) ────────────────────────────
const FIGHTER_GREETINGS = [
  "You picked ME? Let's destroy them, Coach.",
  "Finally, a real Coach. I've been waiting.",
  "I can feel it. We're gonna be legends.",
  "They won't know what hit them. Let's go.",
  "I was born for this arena. Lead the way.",
  "Coach and fighter, together. Unstoppable.",
  "The arena's calling. Let's answer it.",
  "I've seen the others fight. We're better.",
  "Point me at someone and watch what happens.",
  "Let's make them remember our name, Coach.",
  "No mercy. No retreat. That's our style.",
  "I've got claws and I'm not afraid to use them.",
];

let fighterName: string = localStorage.getItem("clawfights-name") || generateRandomName();
identityNameEl.textContent = fighterName;

// Notify the arena iframe which fighter belongs to the user (for name styling)
function notifyIframeMyFighter(name: string) {
  const iframe = document.querySelector(".arena-frame iframe") as HTMLIFrameElement | null;
  if (iframe?.contentWindow) {
    iframe.contentWindow.postMessage({ type: "setMyFighter", name }, "*");
  }
}
// Send initial name once iframe loads
const arenaIframe = document.querySelector(".arena-frame iframe") as HTMLIFrameElement | null;
if (arenaIframe) {
  arenaIframe.addEventListener("load", () => notifyIframeMyFighter(fighterName));
}

// Click name to trigger rename via naming ceremony
identityNameEl.addEventListener("click", () => {
  if (ws && ws.readyState === WebSocket.OPEN) return; // can't rename mid-fight
  showNamingCeremony();
});

// ─── Announcement Modal ─────────────────────────────────────────
const announceOverlay = document.getElementById("announce-overlay")!;
const announceIcon = document.getElementById("announce-icon")!;
const announceTitle = document.getElementById("announce-title")!;
const announceBody = document.getElementById("announce-body")!;
const announceDismiss = document.getElementById("announce-dismiss") as HTMLButtonElement;

let announceResolve: (() => void) | null = null;

function showAnnouncement(opts: {
  icon: string;
  title: string;
  body: string;
  buttonText?: string;
  buttonStyle?: "red" | "cyan";
}): Promise<void> {
  announceIcon.textContent = opts.icon;
  announceTitle.textContent = opts.title;
  announceBody.innerHTML = opts.body;
  announceDismiss.textContent = opts.buttonText || "Got it";
  announceDismiss.className = `announce-dismiss ${opts.buttonStyle || "red"}`;
  announceOverlay.classList.remove("hidden");
  return new Promise((resolve) => {
    announceResolve = resolve;
  });
}

announceDismiss.addEventListener("click", () => {
  announceOverlay.classList.add("hidden");
  if (announceResolve) {
    announceResolve();
    announceResolve = null;
  }
});

// ─── Post-Coaching Greeting Phrases ─────────────────────────────
const POST_COACHING_GREETINGS = [
  "Thanks, Coach. I feel stronger already.",
  "Now I know what to do. Let's fight!",
  "You get me, Coach. Ready for the next one.",
  "That advice? Perfect. Watch what I do with it.",
  "I can feel the difference already. Let's go.",
  "Coach knows best. Time to prove it.",
];

// ─── Spar Unlock Phrases ────────────────────────────────────────
const SPAR_UNLOCK_PHRASES = [
  "I've been watching you coach... Show me how YOU fight, Coach.",
  "You talk a big game, Coach. Time to back it up.",
  "Coach, I want to see YOUR moves. Fight me.",
  "Three fights in and I trust you. Now show me your claws.",
];

// ─── Fighter Greeting Toast ─────────────────────────────────────
const greetingToast = document.getElementById("greeting-toast")!;
const greetingToastText = document.getElementById("greeting-toast-text")!;

function showFighterGreeting(name: string, postCoaching = false): Promise<void> {
  const pool = postCoaching ? POST_COACHING_GREETINGS : FIGHTER_GREETINGS;
  const greeting = pool[Math.floor(Math.random() * pool.length)];
  greetingToastText.innerHTML = `<strong>${name}</strong> stretches its claws. <em>"${greeting}"</em>`;
  greetingToast.classList.add("visible");
  log("log-info", `${name}: "${greeting}"`);
  return new Promise((resolve) => {
    setTimeout(() => {
      greetingToast.classList.remove("visible");
      resolve();
    }, 3500);
  });
}


// ─── WebGPU Check ───────────────────────────────────────────────
if (!checkWebGPUSupport()) {
  webgpuError.style.display = "block";
  mainContent.style.display = "none";
} else {
  downloadModel();
}

// ─── Model Download ─────────────────────────────────────────────
async function downloadModel() {
  const cached = await isModelCached();
  statusEl.textContent = cached
    ? "Loading AI model from cache..."
    : "Downloading AI model (first time only)...";
  progressSection.style.display = "block";

  try {
    await initEngine((report) => {
      progressBar.value = report.progress;
      progressText.textContent = report.text;
    });
    modelReady = true;
    progressSection.style.display = "none";
    statusEl.textContent = "Model ready! Click Fight to enter the arena.";
    fightBtn.disabled = false;
    tournamentBtn.disabled = false;
  } catch (err) {
    statusEl.textContent = `Model load failed: ${err}`;
    console.error("WebLLM init failed:", err);
  }
}

// ─── Naming Ceremony ────────────────────────────────────────────
let namingDone = !!localStorage.getItem("clawfights-name");
let namingResolve: ((name: string) => void) | null = null;

const namingTitle = document.getElementById("naming-title")!;
const namingSubtitle = document.getElementById("naming-subtitle")!;

function showNamingCeremony(postFight = false): Promise<string> {
  if (postFight) {
    namingTitle.innerHTML = `Give me a real name, <span>Coach</span>`;
    namingSubtitle.textContent = "I've proven myself in the arena. Now give me a name worth fighting for.";
  } else {
    namingTitle.innerHTML = `Name Your <span>Fighter</span>`;
    namingSubtitle.textContent = "Every champion needs a name. Choose wisely — this is who you'll be coaching in the arena.";
  }
  namingOverlay.classList.remove("hidden");
  namingInput.value = "";
  namingInput.focus();
  return new Promise((resolve) => {
    namingResolve = resolve;
  });
}

function dismissNaming(name?: string) {
  namingOverlay.classList.add("hidden");
  if (name) {
    fighterName = name;
    localStorage.setItem("clawfights-name", name);
  }
  identityNameEl.textContent = fighterName;
  notifyIframeMyFighter(fighterName);
  namingDone = true;
  if (namingResolve) {
    namingResolve(fighterName);
    namingResolve = null;
  }
}

namingConfirm.addEventListener("click", () => {
  const name = namingInput.value.trim();
  if (!name) return;
  dismissNaming(name);
});

namingInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") namingConfirm.click();
});

namingSkip.addEventListener("click", () => {
  dismissNaming(); // use random placeholder name
});

// ─── Fight Button ───────────────────────────────────────────────
fightBtn.onclick = () => {
  if (!modelReady) return;
  // Disconnect from AI match
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.close();
    ws = null;
    fightBtn.textContent = "Fight!";
    statusEl.textContent = "Disconnected.";
    matchInfoEl.textContent = "";
    coachBar.classList.remove("in-match");
    clearShout();
    return;
  }
  // Disconnect from spar match
  if (sparHumanWs || sparLlmWs) {
    resetToAiMode(); // closes spar connections
    fightBtn.textContent = "Fight!";
    statusEl.textContent = "Disconnected.";
    matchInfoEl.textContent = "";
    return;
  }
  connectAgent(); // No tryouts, no naming. Just fight.
};

// ─── Agent WebSocket ────────────────────────────────────────────
function connectAgent() {
  const name = fighterName;
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${proto}//${location.host}/agent`);
  fightBtn.textContent = "Disconnect";
  statusEl.textContent = "Connecting...";

  ws.onopen = () => {
    ws!.send(JSON.stringify({ type: "register", name, key: "", playerId }));
  };

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    switch (msg.type) {
      case "registered":
        statusEl.textContent = "Registered! Joining queue...";
        // Restore persistent stats from server
        if (msg.player) {
          wins = msg.player.wins;
          losses = msg.player.losses;
          draws = msg.player.draws;
          recordEl.textContent = `W: ${wins}  L: ${losses}  D: ${draws}  |  Elo: ${msg.player.rating}`;
          identityStatsEl.textContent = `${wins}W ${losses}L · Elo ${msg.player.rating}`;
          if (msg.player.wins + msg.player.losses + msg.player.draws > 0) {
            log("log-info", `Welcome back! ${msg.player.name} — ${msg.player.wins}W ${msg.player.losses}L${msg.player.streak > 1 ? `, ${msg.player.streak}-fight streak` : ""} (Elo: ${msg.player.rating})`);
          }
        }
        if (tournamentMode) {
          ws!.send(JSON.stringify({ type: "request_tournament_match", rung: tournamentRung }));
        } else {
          ws!.send(JSON.stringify({ type: "join_queue", streak: winStreak }));
        }
        coachBar.classList.add("in-match");
        break;

      case "queued":
        statusEl.textContent = "In queue — waiting for opponent...";
        arenaOverlayText.innerHTML = `Waiting for opponent...<span>Spectating other fights in the meantime</span>`;
        break;

      case "match_start":
        statusEl.textContent = `Match started vs ${msg.opponent}!`;
        matchInfoEl.textContent = `Fighting: ${msg.opponent}`;
        notifyIframeMyFighter(fighterName);
        lastStateTick = -1;
        inferring = false;
        clearShout();
        coachBar.classList.add("in-match");
        arenaOverlay.classList.add("hidden");
        // Reset match tracking
        matchDamageDealt = 0;
        matchDamageTaken = 0;
        matchActionsUsed = {};
        matchTicksPlayed = 0;
        lastMyHp = 100;
        lastOppHp = 100;
        currentOpponent = msg.opponent;
        coachingActive = false;
        coachingPanel.style.display = "none";
        myMinHp = 100;
        wasLosingHp = false;
        sparMatchActions = [];
        // Request notification permission on first match
        requestNotifPermission();
        document.title = "(Fighting...) TCF";
        log("log-info", `── Match started vs ${msg.opponent} ──`);
        break;

      case "game_state":
        onGameState(msg);
        break;

      case "match_end":
        onMatchEnd(msg);
        break;

      case "error":
        statusEl.textContent = `Error: ${msg.message}`;
        break;

      case "kicked":
        statusEl.textContent = `Kicked: ${msg.reason}`;
        break;
    }
  };

  ws.onclose = () => {
    statusEl.textContent = "Disconnected.";
    fightBtn.textContent = "Fight!";
    matchInfoEl.textContent = "";
    coachBar.classList.remove("in-match");
    clearShout();
    arenaOverlay.classList.remove("hidden");
    arenaOverlayText.innerHTML = `Spectating other fights...<span>Your match will appear here once you join</span>`;
  };

  ws.onerror = () => {
    statusEl.textContent = "Connection error.";
  };
}

// ─── Game State → LLM Inference or Keyboard Input ───────────────
function onGameState(msg: any) {
  const dist = Math.abs(msg.you.x - msg.opponent.x);
  tickDisplay.textContent = `T${msg.tick}  ${Math.ceil(msg.timeRemaining)}s`;
  lastStateReceivedAt = Date.now(); // track for anti-heuristic delay

  // Track match stats for coaching reflection
  matchTicksPlayed++;
  const dmgDealt = lastOppHp - msg.opponent.hp;
  const dmgTaken = lastMyHp - msg.you.hp;
  if (dmgDealt > 0) matchDamageDealt += dmgDealt;
  if (dmgTaken > 0) matchDamageTaken += dmgTaken;
  lastMyHp = msg.you.hp;
  lastOppHp = msg.opponent.hp;
  // Comeback tracking
  if (msg.you.hp < myMinHp) myMinHp = msg.you.hp;
  if (msg.you.hp < msg.opponent.hp) wasLosingHp = true;

  lastStateTick = msg.tick;

  // AI mode: LLM inference
  if (inferring) {
    log("log-skip", `T${msg.tick} ⏭ skipped (LLM still thinking)`);
    return;
  }

  log("log-state", `T${msg.tick} ← state: hp=${msg.you.hp}/${msg.opponent.hp} dist=${dist} opp=${msg.opponent.lastAction ?? "-"}`);

  inferring = true;
  const stateReceivedAt = Date.now();

  const state: GameState = {
    tick: msg.tick,
    you: msg.you,
    opponent: msg.opponent,
    timeRemaining: msg.timeRemaining,
  };

  const hint = shoutTicksLeft > 0 ? coachShout : undefined;
  if (shoutTicksLeft > 0) {
    shoutTicksLeft--;
    if (shoutTicksLeft === 0) clearShout();
  }

  pickAction(state, hint ?? undefined).then((action) => {
    const elapsed = Date.now() - stateReceivedAt;
    inferring = false;

    if (!action) {
      log("log-error", `T${msg.tick} ✗ no valid action (${elapsed}ms)`);
      return;
    }
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    // Ensure action arrives ≥120ms after the MOST RECENT game_state from server
    const msSinceLastState = Date.now() - lastStateReceivedAt;
    const delay = Math.max(0, MIN_RESPONSE_MS - msSinceLastState);

    // Track action for coaching summary
    matchActionsUsed[action] = (matchActionsUsed[action] || 0) + 1;

    const send = () => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: "action",
          tick: lastStateTick,
          action,
        }));
        log("log-action", `T${msg.tick} → ${action} (${elapsed}ms inference${delay > 0 ? `, +${delay}ms delay` : ""})`);
      }
    };

    if (delay > 0) {
      setTimeout(send, delay);
    } else {
      send();
    }
  });
}

// ─── Match End → Coaching → Auto Re-queue ───────────────────────
function onMatchEnd(msg: any) {
  clearShout();
  coachBar.classList.remove("in-match");
  arenaOverlay.classList.remove("hidden");

  // Tournament mode has its own handler
  if (tournamentMode) {
    onTournamentMatchEnd(msg);
    return;
  }

  // Increment match count
  matchCount++;
  localStorage.setItem("clawfights-match-count", String(matchCount));

  // Reset to AI mode after each match (spar is per-fight opt-in)
  resetToAiMode();

  // Tell server not to auto-requeue — user must click "Fight Again"
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "leave_queue" }));
  }

  const name = fighterName;

  // Debug: log the winner comparison
  console.log("[DEBUG match_end]", { winner: msg.winner, fighterName: name, match: JSON.stringify(msg) });
  log("log-info", `[DEBUG] winner="${msg.winner}" vs name="${name}" equal=${msg.winner === name}`);

  let result: "win" | "loss" | "draw";
  if (msg.winner === null) {
    draws++;
    result = "draw";
    winStreak = 0;
    statusEl.textContent = "Draw!";
    log("log-info", `── Draw! ──`);
    setTempTitle("(DRAW) TCF");
    sendNotification("Draw!", `${name} vs ${currentOpponent} — timeout`);
  } else if (msg.winner === name) {
    wins++;
    result = "win";
    winStreak++;
    statusEl.textContent = `You won! (${msg.reason})`;
    log("log-info", `── You won! (${msg.reason}) ──`);
    setTempTitle("(WIN!) TCF");
    sendNotification("Victory!", `${name} defeated ${currentOpponent}!`);
  } else {
    losses++;
    result = "loss";
    winStreak = 0;
    statusEl.textContent = `You lost to ${msg.winner}. (${msg.reason})`;
    log("log-error", `── Lost to ${msg.winner} (${msg.reason}) ──`);
    setTempTitle("(KO) TCF");
    sendNotification("Defeated!", `${name} lost to ${msg.winner}`);
  }

  matchInfoEl.textContent = "";
  recordEl.textContent = `W: ${wins}  L: ${losses}  D: ${draws}`;

  // Build match summary and show post-fight overlay (same modal as tournament)
  const summary: MatchSummary = {
    result,
    reason: msg.reason === "ko" ? "ko" : "timeout",
    myHp: lastMyHp,
    oppHp: lastOppHp,
    opponentName: currentOpponent,
    ticksPlayed: matchTicksPlayed,
    damageDealt: matchDamageDealt,
    damageTaken: matchDamageTaken,
    actionsUsed: matchActionsUsed,
  };

  showRegularPostfightOverlay(summary);
}

// ─── Coaching Panel ─────────────────────────────────────────────
function renderStatsCard(summary: MatchSummary) {
  const isComeback = summary.result === "win" && wasLosingHp && myMinHp <= 30;
  const resultLabel = summary.result === "win" ? "VICTORY" : summary.result === "loss" ? "DEFEAT" : "DRAW";
  const comebackHtml = isComeback ? `<span class="comeback-badge">COMEBACK</span>` : "";

  // Top actions by count
  const sortedActions = Object.entries(summary.actionsUsed)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  const actionChips = sortedActions
    .map(([action, count]) => `<span class="action-chip">${action} x${count}</span>`)
    .join("");

  const dmgRatio = summary.damageDealt - summary.damageTaken;
  const dmgClass = dmgRatio > 0 ? "positive" : dmgRatio < 0 ? "negative" : "";

  statsCard.innerHTML = `
    <div class="stats-card-header">
      <div class="stats-card-result ${summary.result}">${resultLabel} vs ${summary.opponentName}${comebackHtml}</div>
      <div class="stats-card-time">${summary.ticksPlayed} ticks · ${summary.reason.toUpperCase()}</div>
    </div>
    <div class="stats-grid">
      <div class="stat-item"><span class="stat-label">Damage Dealt</span><span class="stat-value positive">${summary.damageDealt}</span></div>
      <div class="stat-item"><span class="stat-label">Damage Taken</span><span class="stat-value negative">${summary.damageTaken}</span></div>
      <div class="stat-item"><span class="stat-label">Net Damage</span><span class="stat-value ${dmgClass}">${dmgRatio > 0 ? "+" : ""}${dmgRatio}</span></div>
      <div class="stat-item"><span class="stat-label">Final HP</span><span class="stat-value">${summary.myHp} / ${summary.oppHp}</span></div>
    </div>
    ${actionChips ? `<div class="stats-actions">${actionChips}</div>` : ""}
  `;
  statsCard.classList.add("visible");

  if (isComeback) {
    log("log-info", `COMEBACK! Won after dropping to ${myMinHp} HP!`);
  }
}

function showCoachingPanel(summary: MatchSummary) {
  coachingActive = true;
  renderStatsCard(summary);
  const reflection = generateReflection(summary);
  coachingReflection.textContent = reflection;
  log("log-info", `Fighter: "${reflection}"`);
  renderPromptViewer(promptViewerCoaching);

  // Populate coaching option buttons
  coachingOptionsEl.innerHTML = "";
  for (const opt of COACHING_OPTIONS) {
    const btn = document.createElement("button");
    btn.className = "coaching-btn";
    btn.textContent = opt.label;
    btn.addEventListener("click", () => {
      applyCoachingAndDismiss(opt.advice, opt.promptFragment);
    });
    coachingOptionsEl.appendChild(btn);
  }

  // Reset custom input
  coachingInput.value = "";
  coachingAck.style.display = "none";
  fightAgainBtn.style.display = "none";
  coachingPanel.style.display = "block";
}

async function applyCoachingAndDismiss(advice: string, promptFragment: string) {
  // Hide coaching UI while LLM decides
  coachingOptionsEl.style.display = "none";
  (coachingPanel.querySelector(".coaching-custom") as HTMLElement).style.display = "none";
  coachingSkip.style.display = "none";

  const droppedRule = await applyCoaching(advice, promptFragment);
  const ack = getAcknowledgment();

  if (droppedRule) {
    log("log-info", `Fighter dropped rule: "${droppedRule}"`);
    log("log-info", `Fighter learned rule: "${promptFragment}"`);
  } else {
    log("log-info", `Fighter learned rule: "${promptFragment}"`);
  }
  log("log-info", `Fighter: "${ack}"`);

  coachingAck.textContent = droppedRule
    ? `${ack} (Forgot: "${droppedRule}")`
    : ack;
  coachingAck.style.display = "block";

  // Refresh prompt viewer to show new rule
  renderPromptViewer(promptViewerCoaching);

  // Post-match ceremony chain
  await runPostMatchCeremonies(true);
}

async function runPostMatchCeremonies(coached: boolean) {
  // 1. First coaching → announce coaching is unlocked + greeting
  if (!firstCoachingDone) {
    firstCoachingDone = true;
    localStorage.setItem("clawfights-first-coaching-done", "true");
    if (coached) {
      await showAnnouncement({
        icon: "🎯",
        title: "Coaching Unlocked",
        body: `<em>"${POST_COACHING_GREETINGS[Math.floor(Math.random() * POST_COACHING_GREETINGS.length)]}"</em><br><br>After every fight, you can review your fighter's performance and give advice. Your coaching shapes how they fight.`,
        buttonText: "Let's go",
      });
    } else {
      await showAnnouncement({
        icon: "🎯",
        title: "Coaching Available",
        body: "After each fight, you can give your fighter advice to shape how they fight. Try it next time!",
        buttonText: "Got it",
      });
    }
  }

  // 2. Naming ceremony if never named
  if (!namingDone) {
    const name = await showNamingCeremony(true);
    log("log-info", `Fighter named: ${name}`);
  }

  // 3. Spar unlock check
  if (matchCount >= SPAR_UNLOCK_THRESHOLD && !sparUnlocked) {
    sparUnlocked = true;
    localStorage.setItem("clawfights-spar-unlocked", "true");
    const phrase = SPAR_UNLOCK_PHRASES[Math.floor(Math.random() * SPAR_UNLOCK_PHRASES.length)];
    log("log-info", `Fighter: "${phrase}"`);
    await showAnnouncement({
      icon: "🎮",
      title: "Spar Mode Unlocked",
      body: `<em>"${phrase}"</em><br><br>You can now fight using keyboard controls! After coaching, choose <strong>Spar Next Fight</strong> to take the controls yourself.`,
      buttonText: "Nice!",
      buttonStyle: "cyan",
    });
  }

  // 4. Show fight-again buttons
  fightAgainBtn.style.display = "block";
  if (sparUnlocked) {
    sparNextBtn.style.display = "block";
  }
}

function dismissCoaching() {
  coachingActive = false;
  coachingPanel.style.display = "none";
  statsCard.classList.remove("visible");
  // Restore hidden elements for next time
  coachingOptionsEl.style.display = "";
  const customEl = coachingPanel.querySelector(".coaching-custom") as HTMLElement;
  if (customEl) customEl.style.display = "";
  coachingSkip.style.display = "";
  coachingAck.style.display = "none";
  fightAgainBtn.style.display = "none";
  sparNextBtn.style.display = "none";
}

// ─── Regular Post-Fight Overlay (same modal as tournament) ──────
function showRegularPostfightOverlay(summary: MatchSummary) {
  // Result header
  const resultText = summary.result === "win" ? "VICTORY" : summary.result === "loss" ? "DEFEAT" : "DRAW";
  postfightResultLabel.textContent = resultText;
  postfightResultLabel.className = `postfight-result-label ${summary.result}`;
  postfightOpponent.textContent = `vs ${summary.opponentName} · ${summary.ticksPlayed} ticks · ${summary.reason.toUpperCase()}`;

  // Streak badge
  if (winStreak > 0) {
    postfightStreak.textContent = `Win Streak: ${winStreak}`;
    postfightStreak.classList.add("visible");
  } else {
    postfightStreak.classList.remove("visible");
  }

  // Stats grid
  const dmgRatio = summary.damageDealt - summary.damageTaken;
  const dmgClass = dmgRatio > 0 ? "positive" : dmgRatio < 0 ? "negative" : "";
  postfightStats.innerHTML = `
    <div class="postfight-stat"><span class="postfight-stat-label">Damage Dealt</span><span class="postfight-stat-value" style="color:var(--green)">${summary.damageDealt}</span></div>
    <div class="postfight-stat"><span class="postfight-stat-label">Damage Taken</span><span class="postfight-stat-value" style="color:var(--red)">${summary.damageTaken}</span></div>
    <div class="postfight-stat"><span class="postfight-stat-label">Net Damage</span><span class="postfight-stat-value" style="color:${dmgClass === 'positive' ? 'var(--green)' : dmgClass === 'negative' ? 'var(--red)' : 'var(--text-1)'}">${dmgRatio > 0 ? "+" : ""}${dmgRatio}</span></div>
    <div class="postfight-stat"><span class="postfight-stat-label">Final HP</span><span class="postfight-stat-value">${summary.myHp} / ${summary.oppHp}</span></div>
  `;

  // Action chips
  const sortedActions = Object.entries(summary.actionsUsed)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  postfightActionsUsed.innerHTML = sortedActions
    .map(([action, count]) => `<span class="action-chip">${action} x${count}</span>`)
    .join("");

  // Reflection
  const reflection = generateReflection(summary);
  postfightReflection.textContent = reflection;
  log("log-info", `Fighter: "${reflection}"`);

  // Prompt viewer
  renderPromptViewer(promptViewerPostfight);

  // Coaching options — show ALL options (not curated like tournament)
  postfightCoachingOptions.innerHTML = "";
  for (const opt of COACHING_OPTIONS) {
    const btn = document.createElement("button");
    btn.className = "coaching-btn";
    btn.textContent = opt.label;
    btn.addEventListener("click", () => {
      applyCoachingAndDismissRegular(opt.advice, opt.promptFragment);
    });
    postfightCoachingOptions.appendChild(btn);
  }

  // Reset coaching state
  postfightCoachingInput.value = "";
  postfightCoachingAck.style.display = "none";
  postfightCoachingLabel.style.display = "";
  postfightCoachingOptions.style.display = "";
  postfightCoachingCustom.style.display = "";
  postfightSkip.style.display = "";

  // Nav buttons
  renderRegularPostfightNav();

  // Wire up skip
  postfightSkip.onclick = () => {
    postfightCoachingLabel.style.display = "none";
    postfightCoachingOptions.style.display = "none";
    postfightCoachingCustom.style.display = "none";
    postfightSkip.style.display = "none";
  };

  // Wire up custom send
  postfightCoachingSend.onclick = () => {
    const text = postfightCoachingInput.value.trim();
    if (!text) return;
    applyCoachingAndDismissRegular(text, text);
  };

  // Show the overlay
  postfightOverlay.classList.remove("hidden");
}

async function applyCoachingAndDismissRegular(advice: string, promptFragment: string) {
  postfightCoachingLabel.style.display = "none";
  postfightCoachingOptions.style.display = "none";
  postfightCoachingCustom.style.display = "none";
  postfightSkip.style.display = "none";

  const droppedRule = await applyCoaching(advice, promptFragment);
  const ack = getAcknowledgment();

  if (droppedRule) {
    log("log-info", `Fighter dropped rule: "${droppedRule}"`);
  }
  log("log-info", `Fighter learned rule: "${promptFragment}"`);
  log("log-info", `Fighter: "${ack}"`);

  postfightCoachingAck.textContent = droppedRule
    ? `${ack} (Forgot: "${droppedRule}")`
    : ack;
  postfightCoachingAck.style.display = "block";

  // Refresh prompt viewer to show new rule
  renderPromptViewer(promptViewerPostfight);

  // Run post-match ceremonies (first coaching announcement, naming, spar unlock)
  // Hide coaching label+options section since coaching was applied
  if (!firstCoachingDone) {
    firstCoachingDone = true;
    localStorage.setItem("clawfights-first-coaching-done", "true");
  }
}

function renderRegularPostfightNav() {
  postfightNav.innerHTML = "";

  // "Keep Fighting" / "Fight Again (Streak: N)" — primary red button
  const fightBtn2 = document.createElement("button");
  fightBtn2.className = "postfight-nav-btn primary";
  fightBtn2.textContent = winStreak > 0 ? `Fight Again (Streak: ${winStreak})` : "Fight Again";
  fightBtn2.addEventListener("click", () => {
    postfightOverlay.classList.add("hidden");
    postfightStreak.classList.remove("visible");
    resetToAiMode();
    requeueForFight();
  });
  postfightNav.appendChild(fightBtn2);

  // "Tournament" — secondary cyan button
  const tournBtn = document.createElement("button");
  tournBtn.className = "postfight-nav-btn primary";
  tournBtn.style.background = "transparent";
  tournBtn.style.color = "var(--cyan)";
  tournBtn.style.border = "2px solid var(--cyan)";
  tournBtn.style.boxShadow = "0 4px 20px rgba(56,189,248,0.15)";
  tournBtn.textContent = "Tournament";
  tournBtn.addEventListener("click", () => {
    postfightOverlay.classList.add("hidden");
    postfightStreak.classList.remove("visible");
    winStreak = 0; // reset streak when switching to tournament
    showTournamentLadder();
  });
  postfightNav.appendChild(tournBtn);

  // "Back to Lobby" — tertiary text button
  const lobbyBtn = document.createElement("button");
  lobbyBtn.className = "postfight-nav-btn secondary";
  lobbyBtn.textContent = "Back to Lobby";
  lobbyBtn.addEventListener("click", () => {
    postfightOverlay.classList.add("hidden");
    postfightStreak.classList.remove("visible");
    winStreak = 0;
  });
  postfightNav.appendChild(lobbyBtn);
}

// ─── Coaching Event Handlers ────────────────────────────────────
coachingSend.addEventListener("click", () => {
  const text = coachingInput.value.trim();
  if (!text) return;
  // Use the custom text as both advice and promptFragment
  applyCoachingAndDismiss(text, text);
});

coachingInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    coachingSend.click();
  }
});

coachingSkip.addEventListener("click", async () => {
  log("log-info", "Coach: (skipped coaching)");
  coachingOptionsEl.style.display = "none";
  (coachingPanel.querySelector(".coaching-custom") as HTMLElement).style.display = "none";
  coachingSkip.style.display = "none";
  await runPostMatchCeremonies(false);
});

// ─── Fight Again / Spar Next Buttons ─────────────────────────────
function requeueForFight() {
  dismissCoaching();
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "join_queue", streak: winStreak }));
    statusEl.textContent = "In queue — waiting for opponent...";
    coachBar.classList.add("in-match");
    arenaOverlayText.innerHTML = `Waiting for opponent...<span>Spectating other fights in the meantime</span>`;
    log("log-info", `── Queued for next fight${winStreak > 0 ? ` (streak: ${winStreak})` : ""} ──`);
  }
}

fightAgainBtn.addEventListener("click", () => {
  resetToAiMode();
  requeueForFight();
});

sparNextBtn.addEventListener("click", () => {
  activateSparMode();
  dismissCoaching();
  startSparMatch();
});

// ─── Spar Match (Two-Agent: Human vs Own LLM Fighter) ────────────
function startSparMatch() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";

  fightBtn.textContent = "Disconnect";
  statusEl.textContent = "Setting up spar match...";
  arenaOverlay.classList.add("hidden");

  sparMatchActions = [];
  matchDamageDealt = 0;
  matchDamageTaken = 0;
  matchActionsUsed = {};
  matchTicksPlayed = 0;
  lastMyHp = 100;
  lastOppHp = 100;
  myMinHp = 100;
  wasLosingHp = false;
  sparLlmInferring = false;

  // Step 1: Dismiss the NPC so our two agents can match together
  const dismissWs = new WebSocket(`${proto}//${location.host}/spectate`);
  dismissWs.onopen = () => {
    dismissWs.send(JSON.stringify({ type: "dismiss_npc" }));
    setTimeout(() => { dismissWs.close(); connectSparAgents(); }, 500);
  };
  dismissWs.onerror = () => connectSparAgents(); // proceed even if fails

  function connectSparAgents() {
    // Step 2: Connect the LLM fighter first
    sparLlmWs = new WebSocket(`${proto}//${location.host}/agent`);
    sparLlmWs.onopen = () => {
      sparLlmWs!.send(JSON.stringify({ type: "register", name: fighterName, key: "" }));
    };
    sparLlmWs.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === "registered") {
        sparLlmWs!.send(JSON.stringify({ type: "join_queue" }));
        // Now connect the human player
        connectSparHuman();
      }
      if (msg.type === "game_state") {
        // LLM inference for the AI fighter — no heuristic fallback
        if (sparLlmInferring) return;
        sparLlmInferring = true;
        const stateAt = Date.now();
        const state: GameState = {
          tick: msg.tick,
          you: msg.you,
          opponent: msg.opponent,
          timeRemaining: msg.timeRemaining,
        };
        pickAction(state).then((action) => {
          sparLlmInferring = false;
          if (!action || !sparLlmWs || sparLlmWs.readyState !== WebSocket.OPEN) return;
          const delay = Math.max(0, MIN_RESPONSE_MS - (Date.now() - stateAt));
          setTimeout(() => {
            if (sparLlmWs && sparLlmWs.readyState === WebSocket.OPEN) {
              sparLlmWs.send(JSON.stringify({ type: "action", tick: msg.tick, action }));
              log("log-action", `T${msg.tick} → AI: ${action}`);
            }
          }, delay);
        });
      }
      if (msg.type === "match_end") {
        sparLlmWs!.close();
        sparLlmWs = null;
      }
    };
    sparLlmWs.onerror = () => log("log-error", "Spar LLM connection error");
  }

  function connectSparHuman() {
    sparHumanWs = new WebSocket(`${proto}//${location.host}/agent`);
    sparHumanWs.onopen = () => {
      sparHumanWs!.send(JSON.stringify({ type: "register", name: "Coach", key: "" }));
    };
    let humanLastStateAt = 0;

    sparHumanWs.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === "registered") {
        sparHumanWs!.send(JSON.stringify({ type: "join_queue" }));
      }
      if (msg.type === "match_start") {
        currentOpponent = msg.opponent;
        statusEl.textContent = `Spar: You vs ${msg.opponent}`;
        matchInfoEl.textContent = `Sparring: ${msg.opponent}`;
        log("log-info", `── Spar: You (Coach) vs ${msg.opponent} ──`);
        document.title = "(Sparring...) TCF";
      }
      if (msg.type === "game_state") {
        humanLastStateAt = Date.now();
        const dist = Math.abs(msg.you.x - msg.opponent.x);
        tickDisplay.textContent = `T${msg.tick}  ${Math.ceil(msg.timeRemaining)}s`;

        // Track match stats (from the human/Coach perspective)
        matchTicksPlayed++;
        const dmgDealt = lastOppHp - msg.opponent.hp;
        const dmgTaken = lastMyHp - msg.you.hp;
        if (dmgDealt > 0) matchDamageDealt += dmgDealt;
        if (dmgTaken > 0) matchDamageTaken += dmgTaken;
        lastMyHp = msg.you.hp;
        lastOppHp = msg.opponent.hp;
        if (msg.you.hp < myMinHp) myMinHp = msg.you.hp;
        if (msg.you.hp < msg.opponent.hp) wasLosingHp = true;

        // Send buffered keyboard action
        const action = pendingKeyAction;
        pendingKeyAction = null;
        if (action) {
          matchActionsUsed[action] = (matchActionsUsed[action] || 0) + 1;
          sparMatchActions.push({
            tick: msg.tick,
            myHp: msg.you.hp,
            oppHp: msg.opponent.hp,
            distance: dist,
            action,
            oppAction: (msg.opponent.lastAction as Action) ?? null,
          });
          const delay = Math.max(0, MIN_RESPONSE_MS - (Date.now() - humanLastStateAt));
          const send = () => {
            if (sparHumanWs && sparHumanWs.readyState === WebSocket.OPEN) {
              sparHumanWs.send(JSON.stringify({ type: "action", tick: msg.tick, action }));
              log("log-action", `T${msg.tick} → You: ${action}`);
            }
          };
          if (delay > 0) setTimeout(send, delay); else send();
        } else {
          log("log-state", `T${msg.tick} ← hp=${msg.you.hp}/${msg.opponent.hp} dist=${dist} (no key)`);
        }
      }
      if (msg.type === "match_end") {
        // End of spar match — process results from Coach perspective
        sparHumanWs!.close();
        sparHumanWs = null;
        onSparMatchEnd(msg);
      }
    };
    sparHumanWs.onerror = () => log("log-error", "Spar human connection error");
  }
}

function onSparMatchEnd(msg: any) {
  arenaOverlay.classList.remove("hidden");
  arenaOverlayText.innerHTML = `Spectating other fights...<span>Your match will appear here once you join</span>`;

  // Increment match count
  matchCount++;
  localStorage.setItem("clawfights-match-count", String(matchCount));

  // Determine result from the Coach's perspective
  const coachName = "Coach";
  let result: "win" | "loss" | "draw";
  if (msg.winner === null) {
    result = "draw";
    statusEl.textContent = "Spar: Draw!";
    log("log-info", `── Spar Draw! ──`);
  } else if (msg.winner === coachName) {
    result = "win";
    statusEl.textContent = `Spar: You beat ${fighterName}!`;
    log("log-info", `── You beat your fighter! ──`);
  } else {
    result = "loss";
    statusEl.textContent = `Spar: ${fighterName} beat you!`;
    log("log-info", `── Your fighter beat you! ──`);
  }

  matchInfoEl.textContent = "";
  document.title = originalTitle;

  const summary: MatchSummary = {
    result,
    reason: msg.reason === "ko" ? "ko" : "timeout",
    myHp: lastMyHp,
    oppHp: lastOppHp,
    opponentName: fighterName,
    ticksPlayed: matchTicksPlayed,
    damageDealt: matchDamageDealt,
    damageTaken: matchDamageTaken,
    actionsUsed: matchActionsUsed,
  };

  showCoachingPanel(summary);

  // Save spar log and analyze
  if (sparMatchActions.length > 0) {
    const sparLog: SparringLog = {
      timestamp: new Date().toISOString(),
      result,
      actions: sparMatchActions as SparActionEntry[],
    };
    saveSparLog(sparLog);
    log("log-info", `Spar log saved (${sparMatchActions.length} actions)`);

    const summaryText = buildReplaySummary(sparLog);
    analyzeReplay(summaryText).then((style) => {
      if (style) {
        setCoachStyle(style);
        log("log-info", `Coach style learned: "${style}"`);
      }
    });
  }

  // Reset to AI mode for next fight
  resetToAiMode();
  fightBtn.textContent = "Fight!";
}

// ─── Tournament Mode ─────────────────────────────────────────────

function showTournamentLadder() {
  const state = loadTournamentState();
  tournamentLadderEl.innerHTML = "";

  for (const entry of TOURNAMENT_LADDER) {
    const rung = document.createElement("div");
    rung.className = "tournament-rung";

    let statusIcon: string;
    if (entry.rung < state.currentRung) {
      rung.classList.add("completed");
      statusIcon = "&#10003;"; // checkmark
    } else if (entry.rung === state.currentRung && !state.completed) {
      rung.classList.add("current");
      statusIcon = "&#9876;"; // swords
    } else if (state.completed) {
      rung.classList.add("completed");
      statusIcon = "&#10003;";
    } else {
      rung.classList.add("locked");
      statusIcon = "&#128274;"; // lock
    }

    const attempts = state.attempts[entry.rung] || 0;
    const attemptText = attempts > 0 ? ` · ${attempts} attempt${attempts > 1 ? "s" : ""}` : "";

    rung.innerHTML = `
      <span class="rung-number">${entry.rung + 1}</span>
      <div class="rung-info">
        <div class="rung-name">${entry.name}</div>
        <div class="rung-title">${entry.title}${attemptText}</div>
      </div>
      <span class="rung-status">${statusIcon}</span>
    `;

    tournamentLadderEl.appendChild(rung);
  }

  // Update fight button text
  if (state.completed) {
    tournamentFightBtn.textContent = "Reset & Play Again";
  } else {
    const current = TOURNAMENT_LADDER[state.currentRung];
    tournamentFightBtn.textContent = `Fight ${current.name}!`;
  }

  tournamentOverlay.classList.remove("hidden");
}

function startTournamentFight(rung: number) {
  const state = loadTournamentState();
  state.attempts[rung] = (state.attempts[rung] || 0) + 1;
  saveTournamentState(state);

  tournamentMode = true;
  tournamentRung = rung;
  tournamentOverlay.classList.add("hidden");
  connectAgent();
}

function onTournamentMatchEnd(msg: any) {
  const name = fighterName;
  const state = loadTournamentState();

  let result: "win" | "loss" | "draw";
  if (msg.winner === null) {
    result = "draw";
    statusEl.textContent = "Draw! Try again.";
    log("log-info", `── Tournament Draw! ──`);
  } else if (msg.winner === name) {
    result = "win";
    statusEl.textContent = `Victory over ${currentOpponent}!`;
    log("log-info", `── Tournament Win vs ${currentOpponent}! ──`);

    // Advance to next rung
    if (tournamentRung === state.currentRung) {
      state.currentRung++;
      if (state.currentRung >= 9) {
        state.completed = true;
      }
      saveTournamentState(state);
    }
  } else {
    result = "loss";
    statusEl.textContent = `Defeated by ${currentOpponent}. Try again!`;
    log("log-error", `── Tournament Loss to ${currentOpponent} ──`);
  }

  matchInfoEl.textContent = "";
  document.title = originalTitle;

  // Disconnect the tournament WS
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.close();
  }
  ws = null;
  fightBtn.textContent = "Fight!";
  tournamentMode = false;

  // Build match summary
  const summary: MatchSummary = {
    result,
    reason: msg.reason === "ko" ? "ko" : "timeout",
    myHp: lastMyHp,
    oppHp: lastOppHp,
    opponentName: currentOpponent,
    ticksPlayed: matchTicksPlayed,
    damageDealt: matchDamageDealt,
    damageTaken: matchDamageTaken,
    actionsUsed: matchActionsUsed,
  };

  showTournamentCoachingPanel(summary, result, tournamentRung, state);
}

function showTournamentCoachingPanel(
  summary: MatchSummary,
  result: "win" | "loss" | "draw",
  rung: number,
  state: TournamentState,
) {
  // ─── Populate the post-fight overlay ───

  // Result header
  const resultText = result === "win" ? "VICTORY" : result === "loss" ? "DEFEAT" : "DRAW";
  postfightResultLabel.textContent = resultText;
  postfightResultLabel.className = `postfight-result-label ${result}`;
  postfightOpponent.textContent = `vs ${summary.opponentName} · ${summary.ticksPlayed} ticks · ${summary.reason.toUpperCase()}`;

  // Stats grid
  const dmgRatio = summary.damageDealt - summary.damageTaken;
  const dmgClass = dmgRatio > 0 ? "positive" : dmgRatio < 0 ? "negative" : "";
  postfightStats.innerHTML = `
    <div class="postfight-stat"><span class="postfight-stat-label">Damage Dealt</span><span class="postfight-stat-value" style="color:var(--green)">${summary.damageDealt}</span></div>
    <div class="postfight-stat"><span class="postfight-stat-label">Damage Taken</span><span class="postfight-stat-value" style="color:var(--red)">${summary.damageTaken}</span></div>
    <div class="postfight-stat"><span class="postfight-stat-label">Net Damage</span><span class="postfight-stat-value" style="color:${dmgClass === 'positive' ? 'var(--green)' : dmgClass === 'negative' ? 'var(--red)' : 'var(--text-1)'}">${dmgRatio > 0 ? "+" : ""}${dmgRatio}</span></div>
    <div class="postfight-stat"><span class="postfight-stat-label">Final HP</span><span class="postfight-stat-value">${summary.myHp} / ${summary.oppHp}</span></div>
  `;

  // Action chips
  const sortedActions = Object.entries(summary.actionsUsed)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  postfightActionsUsed.innerHTML = sortedActions
    .map(([action, count]) => `<span class="action-chip">${action} x${count}</span>`)
    .join("");

  // Reflection
  const reflections = TOURNAMENT_REFLECTIONS[rung];
  let reflection: string;
  if (reflections && result !== "draw") {
    const pool = result === "win" ? reflections.win : reflections.loss;
    reflection = pool[Math.floor(Math.random() * pool.length)];
  } else {
    reflection = generateReflection(summary);
  }
  postfightReflection.textContent = reflection;
  log("log-info", `Fighter: "${reflection}"`);

  // Prompt viewer
  renderPromptViewer(promptViewerPostfight);

  // Coaching options
  postfightCoachingOptions.innerHTML = "";
  const suggestedIndices = TOURNAMENT_SUGGESTED_COACHING[rung] || [0, 1];
  for (const idx of suggestedIndices) {
    const opt = COACHING_OPTIONS[idx];
    if (!opt) continue;
    const btn = document.createElement("button");
    btn.className = "coaching-btn";
    btn.textContent = opt.label;
    btn.addEventListener("click", () => {
      applyCoachingAndDismissTournament(opt.advice, opt.promptFragment, result, rung, state);
    });
    postfightCoachingOptions.appendChild(btn);
  }

  // Reset coaching state
  postfightCoachingInput.value = "";
  postfightCoachingAck.style.display = "none";
  postfightCoachingLabel.style.display = "";
  postfightCoachingOptions.style.display = "";
  postfightCoachingCustom.style.display = "";
  postfightSkip.style.display = "";

  // Nav buttons (shown immediately — user can coach OR skip straight to next)
  renderPostfightNav(result, rung, state);

  // Wire up skip
  postfightSkip.onclick = () => {
    postfightCoachingLabel.style.display = "none";
    postfightCoachingOptions.style.display = "none";
    postfightCoachingCustom.style.display = "none";
    postfightSkip.style.display = "none";
  };

  // Wire up custom send
  postfightCoachingSend.onclick = () => {
    const text = postfightCoachingInput.value.trim();
    if (!text) return;
    applyCoachingAndDismissTournament(text, text, result, rung, state);
  };

  // Show the overlay
  postfightOverlay.classList.remove("hidden");
}

async function applyCoachingAndDismissTournament(
  advice: string,
  promptFragment: string,
  result: "win" | "loss" | "draw",
  rung: number,
  state: TournamentState,
) {
  postfightCoachingLabel.style.display = "none";
  postfightCoachingOptions.style.display = "none";
  postfightCoachingCustom.style.display = "none";
  postfightSkip.style.display = "none";

  const droppedRule = await applyCoaching(advice, promptFragment);
  const ack = getAcknowledgment();

  if (droppedRule) {
    log("log-info", `Fighter dropped rule: "${droppedRule}"`);
  }
  log("log-info", `Fighter learned rule: "${promptFragment}"`);
  log("log-info", `Fighter: "${ack}"`);

  postfightCoachingAck.textContent = droppedRule
    ? `${ack} (Forgot: "${droppedRule}")`
    : ack;
  postfightCoachingAck.style.display = "block";

  // Refresh prompt viewer to show new rule
  renderPromptViewer(promptViewerPostfight);
}

function renderPostfightNav(
  result: "win" | "loss" | "draw",
  rung: number,
  state: TournamentState,
) {
  postfightNav.innerHTML = "";

  if (result === "win" && state.completed) {
    const victoryBtn = document.createElement("button");
    victoryBtn.className = "postfight-nav-btn primary";
    victoryBtn.textContent = "View Championship!";
    victoryBtn.addEventListener("click", () => {
      postfightOverlay.classList.add("hidden");
      showTournamentVictory();
    });
    postfightNav.appendChild(victoryBtn);
  } else if (result === "win" && state.currentRung <= 8) {
    const nextBtn = document.createElement("button");
    nextBtn.className = "postfight-nav-btn primary";
    nextBtn.textContent = `Next: ${TOURNAMENT_LADDER[state.currentRung].name}`;
    nextBtn.addEventListener("click", () => {
      postfightOverlay.classList.add("hidden");
      startTournamentFight(state.currentRung);
    });
    postfightNav.appendChild(nextBtn);
  }

  if (result === "loss" || result === "draw") {
    const retryBtn = document.createElement("button");
    retryBtn.className = "postfight-nav-btn primary";
    retryBtn.textContent = `Retry: ${TOURNAMENT_LADDER[rung].name}`;
    retryBtn.addEventListener("click", () => {
      postfightOverlay.classList.add("hidden");
      startTournamentFight(rung);
    });
    postfightNav.appendChild(retryBtn);
  }

  const lobbyBtn = document.createElement("button");
  lobbyBtn.className = "postfight-nav-btn secondary";
  lobbyBtn.textContent = "Back to Lobby";
  lobbyBtn.addEventListener("click", () => {
    postfightOverlay.classList.add("hidden");
  });
  postfightNav.appendChild(lobbyBtn);
}

function showTournamentVictory() {
  tournamentVictoryOverlay.classList.remove("hidden");
}

// ─── Tournament Button Handlers ──────────────────────────────────
tournamentBtn.onclick = () => {
  if (!modelReady) return;
  // Don't open if mid-fight
  if (ws && ws.readyState === WebSocket.OPEN) return;
  if (sparHumanWs || sparLlmWs) return;
  showTournamentLadder();
};

tournamentFightBtn.onclick = () => {
  const state = loadTournamentState();
  if (state.completed) {
    // Reset tournament
    const fresh: TournamentState = { currentRung: 0, attempts: {}, completed: false };
    saveTournamentState(fresh);
    showTournamentLadder();
    return;
  }
  startTournamentFight(state.currentRung);
};

tournamentBackBtn.onclick = () => {
  tournamentOverlay.classList.add("hidden");
};

tournamentVictoryDismiss.onclick = () => {
  tournamentVictoryOverlay.classList.add("hidden");
};
