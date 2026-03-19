// Browser-based LLM fighter agent
// Downloads a quantized model via WebLLM and plays using in-browser inference.
// No heuristic fallback — if LLM isn't ready or inference is slow, ticks are skipped.

import { checkWebGPUSupport, initEngine, isModelCached, pickAction, type GameState } from "./browser-llm";

// ─── DOM Elements ───────────────────────────────────────────────
const statusEl = document.getElementById("status")!;
const progressBar = document.getElementById("progress-bar") as HTMLProgressElement;
const progressText = document.getElementById("progress-text")!;
const progressSection = document.getElementById("progress-section")!;
const fightBtn = document.getElementById("fight-btn") as HTMLButtonElement;
const nameInput = document.getElementById("agent-name") as HTMLInputElement;
const recordEl = document.getElementById("record")!;
const matchInfoEl = document.getElementById("match-info")!;
const webgpuError = document.getElementById("webgpu-error")!;
const mainContent = document.getElementById("main-content")!;
const agentLog = document.getElementById("agent-log")!;
const tickDisplay = document.getElementById("tick-display")!;

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

// ─── Coach Shout ────────────────────────────────────────────────
const coachBar = document.getElementById("coach-bar")!;
const shoutButtons = document.querySelectorAll<HTMLButtonElement>(".shout-btn");

const SHOUT_HINTS: Record<string, string> = {
  attack: "ATTACK! Use your strongest available move!",
  movein: "CLOSE THE DISTANCE! Move toward the opponent NOW!",
  retreat: "BACK OFF! Jump or move away from the opponent!",
  block: "DEFEND! Block the next attack!",
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
  });
});

function clearShout() {
  coachShout = null;
  shoutTicksLeft = 0;
  shoutButtons.forEach((b) => b.classList.remove("shout-active"));
}

// ─── State ──────────────────────────────────────────────────────
let ws: WebSocket | null = null;
let modelReady = false;
let inferring = false;
let wins = 0;
let losses = 0;
let draws = 0;
let lastStateTick = -1;
let lastStateReceivedAt = 0; // timestamp of most recent game_state (including skipped)

const MIN_RESPONSE_MS = 120; // floor to clear server's anti-heuristic filter

// ─── Name Persistence ───────────────────────────────────────────
const savedName = localStorage.getItem("clawfights-name");
if (savedName) {
  nameInput.value = savedName;
}
nameInput.addEventListener("change", () => {
  const val = nameInput.value.trim();
  if (val) {
    localStorage.setItem("clawfights-name", val);
  } else {
    localStorage.removeItem("clawfights-name");
  }
});

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
    statusEl.textContent = "Model ready! Enter a name and click Fight.";
    fightBtn.disabled = false;
  } catch (err) {
    statusEl.textContent = `Model load failed: ${err}`;
    console.error("WebLLM init failed:", err);
  }
}

// ─── Fight Button ───────────────────────────────────────────────
fightBtn.onclick = () => {
  if (!modelReady) return;
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.close();
    ws = null;
    fightBtn.textContent = "Fight!";
    statusEl.textContent = "Disconnected.";
    matchInfoEl.textContent = "";
    return;
  }
  connectAgent();
};

// ─── Agent WebSocket ────────────────────────────────────────────
function connectAgent() {
  const name = nameInput.value.trim() || nameInput.placeholder;
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${proto}//${location.host}/agent`);
  fightBtn.textContent = "Disconnect";
  statusEl.textContent = "Connecting...";

  ws.onopen = () => {
    ws!.send(JSON.stringify({ type: "register", name, key: "" }));
  };

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    switch (msg.type) {
      case "registered":
        statusEl.textContent = "Registered! Joining queue...";
        ws!.send(JSON.stringify({ type: "join_queue" }));
        break;

      case "queued":
        statusEl.textContent = "In queue — waiting for opponent...";
        break;

      case "match_start":
        statusEl.textContent = `Match started vs ${msg.opponent}!`;
        matchInfoEl.textContent = `Fighting: ${msg.opponent}`;
        lastStateTick = -1;
        inferring = false;
        clearShout();
        coachBar.classList.add("in-match");
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
  };

  ws.onerror = () => {
    statusEl.textContent = "Connection error.";
  };
}

// ─── Game State → LLM Inference ─────────────────────────────────
function onGameState(msg: any) {
  const dist = Math.abs(msg.you.x - msg.opponent.x);
  tickDisplay.textContent = `T${msg.tick}  ${Math.ceil(msg.timeRemaining)}s`;
  lastStateReceivedAt = Date.now(); // track for anti-heuristic delay

  // If already inferring for a previous tick, skip this one
  if (inferring) {
    log("log-skip", `T${msg.tick} ⏭ skipped (LLM still thinking)`);
    return;
  }

  log("log-state", `T${msg.tick} ← state: hp=${msg.you.hp}/${msg.opponent.hp} dist=${dist} opp=${msg.opponent.lastAction ?? "-"}`);

  lastStateTick = msg.tick;
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
    // (server checks against last state it sent, which keeps ticking during inference)
    const msSinceLastState = Date.now() - lastStateReceivedAt;
    const delay = Math.max(0, MIN_RESPONSE_MS - msSinceLastState);

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

// ─── Match End → Auto Re-queue ──────────────────────────────────
function onMatchEnd(msg: any) {
  clearShout();
  coachBar.classList.remove("in-match");
  const name = nameInput.value.trim() || nameInput.placeholder;

  if (msg.winner === null) {
    draws++;
    statusEl.textContent = "Draw!";
    log("log-info", `── Draw! ──`);
  } else if (msg.winner === name) {
    wins++;
    statusEl.textContent = `You won! (${msg.reason})`;
    log("log-info", `── You won! (${msg.reason}) ──`);
  } else {
    losses++;
    statusEl.textContent = `You lost to ${msg.winner}. (${msg.reason})`;
    log("log-error", `── Lost to ${msg.winner} (${msg.reason}) ──`);
  }

  matchInfoEl.textContent = "";
  recordEl.textContent = `W: ${wins}  L: ${losses}  D: ${draws}`;

  // Server auto-requeues via onSingleAgentMatchEnd — just update status
  setTimeout(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      statusEl.textContent = "Next match starting soon...";
    }
  }, 3000);
}
