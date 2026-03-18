// Browser-based LLM fighter agent
// Downloads a quantized model via WebLLM and plays using in-browser inference.
// No heuristic fallback — if LLM isn't ready or inference is slow, ticks are skipped.

import { checkWebGPUSupport, initEngine, pickAction, type GameState } from "./browser-llm";

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

// ─── State ──────────────────────────────────────────────────────
let ws: WebSocket | null = null;
let modelReady = false;
let inferring = false;
let wins = 0;
let losses = 0;
let draws = 0;
let lastStateTick = -1;

const MIN_RESPONSE_MS = 120; // floor to clear server's anti-heuristic filter

// ─── WebGPU Check ───────────────────────────────────────────────
if (!checkWebGPUSupport()) {
  webgpuError.style.display = "block";
  mainContent.style.display = "none";
} else {
  downloadModel();
}

// ─── Model Download ─────────────────────────────────────────────
async function downloadModel() {
  statusEl.textContent = "Downloading AI model...";
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

  pickAction(state).then((action) => {
    const elapsed = Date.now() - stateReceivedAt;
    inferring = false;

    if (!action) {
      log("log-error", `T${msg.tick} ✗ no valid action (${elapsed}ms)`);
      return;
    }
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    // Ensure we meet the minimum response time to pass anti-heuristic filter
    const delay = Math.max(0, MIN_RESPONSE_MS - elapsed);

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

  // Auto re-queue after 3s
  setTimeout(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      statusEl.textContent = "Re-joining queue...";
      ws.send(JSON.stringify({ type: "join_queue" }));
    }
  }, 3000);
}
