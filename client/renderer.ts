import { Application, Graphics, Text, TextStyle, Sprite, Container } from "pixi.js";
import { connectSpectator } from "./spectator-client.ts";
import type { MatchStateMsg, MatchStartMsg, MatchEndMsg, ArenaStatusMsg, AgentRelayMsg, LeaderboardMsg, FighterState } from "./spectator-client.ts";
import { FighterSprite, ScreenShake, loadAllAssets, actionToAnim } from "./sprites.ts";
import type { LoadedAssets } from "./sprites.ts";

const CANVAS_W = 800;
const CANVAS_H = 400;
const ARENA_UNITS = 10;
const UNIT_PX = CANVAS_W / (ARENA_UNITS + 2); // padding on sides
const FIGHTER_W = 100;
const FIGHTER_H = 150;
const HP_BAR_W = 60;
const HP_BAR_H = 8;
const GROUND_Y = CANVAS_H - 50;

const COLORS = {
  p1: 0x4488ff,
  p2: 0xff4444,
  hpBg: 0x333333,
  hpFill: 0x44ff44,
  hpLow: 0xff4444,
  arena: 0x1a1a2e,
  floor: 0x2a2a3e,
};

// State
let currentFighters: [FighterState, FighterState] | null = null;
let targetFighters: [FighterState, FighterState] | null = null;
let prevFighters: [FighterState, FighterState] | null = null;
let interpProgress = 0;
let activeEvents: Array<{ text: string; x: number; y: number; age: number; type: string }> = [];
let matchActive = false;
let statusEl: HTMLElement;
let timerText: Text;
let matchInfoText: Text;
let announcementText: Text;
let announcementTimer = 0;

async function main() {
  statusEl = document.getElementById("status")!;

  // Load sprite assets (gracefully handles missing files)
  const assets = await loadAllAssets();
  const hasSprites = !!(assets.fighter1 && assets.fighter2);
  if (hasSprites) {
    console.log("[renderer] Sprite sheets loaded!");
  } else {
    console.log("[renderer] No sprite sheets found, using fallback rectangles");
  }

  const app = new Application();
  await app.init({
    width: CANVAS_W,
    height: CANVAS_H,
    backgroundColor: COLORS.arena,
    antialias: true,
  });

  document.getElementById("game-container")!.appendChild(app.canvas);

  // Game layer (gets shaken)
  const gameLayer = new Container();
  app.stage.addChild(gameLayer);

  // Background
  if (assets.background) {
    const bg = new Sprite(assets.background);
    bg.width = CANVAS_W;
    bg.height = CANVAS_H;
    gameLayer.addChild(bg);
  } else {
    // Fallback floor
    const floor = new Graphics();
    floor.rect(0, GROUND_Y, CANVAS_W, 50);
    floor.fill(COLORS.floor);
    gameLayer.addChild(floor);
  }

  // Fighter sprites
  const fighter1 = new FighterSprite(COLORS.p1, FIGHTER_W, FIGHTER_H, false);  // natively faces left
  const fighter2 = new FighterSprite(COLORS.p2, FIGHTER_W, FIGHTER_H, true);   // natively faces right
  if (assets.fighter1) fighter1.loadFromTexture(assets.fighter1);
  if (assets.fighter2) fighter2.loadFromTexture(assets.fighter2);
  gameLayer.addChild(fighter1.container);
  gameLayer.addChild(fighter2.container);
  const fighters = [fighter1, fighter2];

  // Screen shake
  const shake = new ScreenShake();

  // HP bars
  const hp1Bg = new Graphics();
  const hp1Fill = new Graphics();
  const hp2Bg = new Graphics();
  const hp2Fill = new Graphics();
  gameLayer.addChild(hp1Bg, hp1Fill, hp2Bg, hp2Fill);

  // Name labels
  const nameStyle = new TextStyle({ fontSize: 14, fill: 0xffffff, fontFamily: "Courier New" });
  const name1 = new Text({ text: "", style: nameStyle });
  const name2 = new Text({ text: "", style: nameStyle });
  gameLayer.addChild(name1, name2);

  // Action labels
  const actionStyle = new TextStyle({ fontSize: 12, fill: 0xaaaaaa, fontFamily: "Courier New" });
  const action1 = new Text({ text: "", style: actionStyle });
  const action2 = new Text({ text: "", style: actionStyle });
  gameLayer.addChild(action1, action2);

  // Timer
  const timerStyle = new TextStyle({ fontSize: 20, fill: 0xffcc00, fontFamily: "Courier New", fontWeight: "bold" });
  timerText = new Text({ text: "", style: timerStyle });
  timerText.anchor.set(0.5, 0);
  timerText.x = CANVAS_W / 2;
  timerText.y = 10;
  gameLayer.addChild(timerText);

  // Match info (center)
  const infoStyle = new TextStyle({ fontSize: 16, fill: 0x888888, fontFamily: "Courier New" });
  matchInfoText = new Text({ text: "Waiting for fighters...", style: infoStyle });
  matchInfoText.anchor.set(0.5);
  matchInfoText.x = CANVAS_W / 2;
  matchInfoText.y = CANVAS_H / 2;
  gameLayer.addChild(matchInfoText);

  // UI layer (not shaken)
  const uiLayer = new Container();
  app.stage.addChild(uiLayer);

  // Announcement text (KO, etc.)
  const announceStyle = new TextStyle({
    fontSize: 48,
    fill: 0xff4444,
    fontFamily: "Courier New",
    fontWeight: "bold",
    stroke: { color: 0x000000, width: 4 },
  });
  announcementText = new Text({ text: "", style: announceStyle });
  announcementText.anchor.set(0.5);
  announcementText.x = CANVAS_W / 2;
  announcementText.y = CANVAS_H / 2 - 30;
  uiLayer.addChild(announcementText);

  // Event text container
  const eventTexts: Text[] = [];
  const eventStyle = new TextStyle({
    fontSize: 18,
    fill: 0xffffff,
    fontFamily: "Courier New",
    fontWeight: "bold",
    stroke: { color: 0x000000, width: 3 },
  });

  // Effects layer (between fighters and UI)
  const fxLayer = new Container();
  gameLayer.addChild(fxLayer);

  function unitToX(unit: number): number {
    return (unit + 1) * UNIT_PX;
  }

  function drawHpBar(bg: Graphics, fill: Graphics, x: number, hp: number) {
    const y = GROUND_Y - FIGHTER_H - 20;
    bg.clear();
    bg.rect(x - HP_BAR_W / 2, y, HP_BAR_W, HP_BAR_H);
    bg.fill(COLORS.hpBg);
    fill.clear();
    const ratio = hp / 100;
    const color = ratio > 0.3 ? COLORS.hpFill : COLORS.hpLow;
    fill.rect(x - HP_BAR_W / 2, y, HP_BAR_W * ratio, HP_BAR_H);
    fill.fill(color);
  }

  // Agent message panels
  const agentLogs = [
    document.getElementById("agent-log-0")!,
    document.getElementById("agent-log-1")!,
  ];
  const agentHeaders = [
    document.querySelector("#agent-panel-0 h3")!,
    document.querySelector("#agent-panel-1 h3")!,
  ];
  const MAX_LOG_ENTRIES = 100;

  function appendAgentMsg(fighter: 0 | 1, direction: "in" | "out", msg: any) {
    const log = agentLogs[fighter]!;
    const el = document.createElement("div");
    el.className = `msg msg-${direction}`;
    const arrow = direction === "in" ? "\u2192" : "\u2190";
    let text: string;
    if (msg.type === "action") {
      text = `${arrow} action: ${msg.action} (t${msg.tick})`;
    } else if (msg.type === "game_state") {
      text = `${arrow} state: hp=${msg.you?.hp}/${msg.opponent?.hp} d=${Math.abs((msg.you?.x ?? 0) - (msg.opponent?.x ?? 0))} t${msg.tick}`;
    } else {
      text = `${arrow} ${msg.type}: ${JSON.stringify(msg).slice(0, 80)}`;
    }
    el.textContent = text;
    log.appendChild(el);
    while (log.children.length > MAX_LOG_ENTRIES) {
      log.removeChild(log.firstChild!);
    }
    log.scrollTop = log.scrollHeight;
  }

  // NPC dismiss button
  const dismissBtn = document.getElementById("dismiss-btn")! as HTMLButtonElement;

  // Connect to server
  const conn = connectSpectator({
    onConnect() {
      statusEl.textContent = "Connected - waiting for match...";
    },
    onDisconnect() {
      statusEl.textContent = "Disconnected - reconnecting...";
    },
    onMatchStart(msg: MatchStartMsg) {
      matchActive = true;
      matchInfoText.text = "";
      showAnnouncement("FIGHT!", 0xffcc00);
      agentHeaders[0]!.textContent = msg.fighters[0];
      agentHeaders[1]!.textContent = msg.fighters[1];
      agentLogs[0]!.innerHTML = "";
      agentLogs[1]!.innerHTML = "";
      // Reset fighter sprites to idle
      fighter1.setState("idle");
      fighter2.setState("idle");
      console.log(`Match started: ${msg.fighters[0]} vs ${msg.fighters[1]}`);
    },
    onMatchState(msg: MatchStateMsg) {
      if (!matchActive) {
        matchActive = true;
        matchInfoText.text = "";
      }

      prevFighters = currentFighters;

      // Interpolation: store target, lerp from current
      if (!currentFighters) {
        currentFighters = msg.fighters;
        targetFighters = msg.fighters;
      } else {
        currentFighters = targetFighters ?? msg.fighters;
        targetFighters = msg.fighters;
      }
      interpProgress = 0;

      // Process events
      for (const ev of msg.events) {
        const fx = unitToX(msg.fighters[ev.fighter].x);
        activeEvents.push({
          text: ev.text,
          x: fx,
          y: GROUND_Y - FIGHTER_H - 40,
          age: 0,
          type: ev.type,
        });

        // Spawn effect sprites
        if (assets.effects.isLoaded) {
          const effectY = GROUND_Y - FIGHTER_H / 2;
          if (ev.type === "hit") {
            assets.effects.spawn("hit", fx, effectY, fxLayer);
          } else if (ev.type === "block") {
            assets.effects.spawn("block", fx, effectY, fxLayer);
          } else if (ev.type === "ko") {
            assets.effects.spawn("hit", fx, effectY, fxLayer);
            shake.trigger(6, 20); // big shake on KO
          }
        }

        // Screen shake on hits (even without effect sprites)
        if (ev.type === "hit") {
          shake.trigger(3, 8);
        } else if (ev.type === "ko") {
          shake.trigger(6, 20);
        }
      }

      // Update fighter animation states
      for (let i = 0; i < 2; i++) {
        const tgt = msg.fighters[i as 0 | 1];
        const wasHit = msg.events.some(
          (e) => e.type === "hit" && e.fighter !== i
        );
        const isKo = tgt.hp <= 0;
        const anim = actionToAnim(tgt.lastAction, wasHit, isKo);
        fighters[i]!.setState(anim);
      }

      timerText.text = `${Math.ceil(msg.timeRemaining / 5)}s`;
    },
    onMatchEnd(msg: MatchEndMsg) {
      matchActive = false;
      const resultText = msg.winner
        ? `${msg.winner} WINS!`
        : "DRAW!";
      showAnnouncement(resultText, msg.winner ? 0xff4444 : 0xffcc00);
      setTimeout(() => {
        matchInfoText.text = "Waiting for next match...";
        currentFighters = null;
        targetFighters = null;
        prevFighters = null;
        announcementText.text = "";
        timerText.text = "";
      }, 4000);
    },
    onArenaStatus(msg: ArenaStatusMsg) {
      dismissBtn.style.display = msg.hasNpc ? "" : "none";
    },
    onAgentMsg(msg: AgentRelayMsg) {
      appendAgentMsg(msg.fighter, msg.direction, msg.msg);
    },
    onLeaderboard(msg: LeaderboardMsg) {
      const tbody = document.getElementById("leaderboard-body")!;
      if (msg.entries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-board">No matches yet...</td></tr>';
        return;
      }
      tbody.innerHTML = msg.entries.map((e) =>
        `<tr class="rank-${e.rank}">` +
        `<td class="rank">#${e.rank}</td>` +
        `<td class="agent-name">${e.name}</td>` +
        `<td class="streak">${e.winStreak}${e.winStreak > 0 ? "\uD83D\uDD25" : ""}</td>` +
        `<td class="wins">${e.totalWins}</td>` +
        `<td class="losses">${e.totalLosses}</td>` +
        `</tr>`
      ).join("");
    },
  });

  dismissBtn.addEventListener("click", () => {
    conn.send({ type: "dismiss_npc" });
  });

  function showAnnouncement(text: string, color: number) {
    announcementText.text = text;
    announcementText.style.fill = color;
    announcementTimer = 120; // ~2 seconds at 60fps
  }

  // Render loop
  app.ticker.add((ticker) => {
    // Screen shake
    shake.update(gameLayer);

    if (!currentFighters || !targetFighters) return;

    // Interpolate (5 ticks/sec = 200ms, at 60fps ~ 12 frames per tick)
    interpProgress = Math.min(1, interpProgress + ticker.deltaTime / 12);

    for (let i = 0; i < 2; i++) {
      const curr = currentFighters[i as 0 | 1];
      const tgt = targetFighters[i as 0 | 1];
      const other = targetFighters[(1 - i) as 0 | 1];
      const lerpX = curr.x + (tgt.x - curr.x) * interpProgress;
      const x = unitToX(lerpX);

      const fSprite = fighters[i]!;

      // Check if fighter was just hit
      const justHit = activeEvents.some(
        (e) => e.age < 3 && e.type === "hit" && Math.abs(e.x - x) < UNIT_PX
      );

      if (fSprite.isFallback) {
        // Fallback rectangle rendering
        fSprite.drawFallback(x, GROUND_Y, justHit);
      } else {
        // Sprite rendering
        fSprite.setPosition(x, GROUND_Y);
        fSprite.setFacing(tgt.x < other.x); // face toward opponent
      }

      // HP bars
      const bg = i === 0 ? hp1Bg : hp2Bg;
      const fill = i === 0 ? hp1Fill : hp2Fill;
      drawHpBar(bg, fill, x, tgt.hp);

      // Names
      const nameLabel = i === 0 ? name1 : name2;
      nameLabel.text = tgt.name;
      nameLabel.x = x - nameLabel.width / 2;
      nameLabel.y = GROUND_Y - FIGHTER_H - 38;

      // Action labels
      const actionLabel = i === 0 ? action1 : action2;
      actionLabel.text = tgt.lastAction ?? "";
      actionLabel.x = x - actionLabel.width / 2;
      actionLabel.y = GROUND_Y + 10;
    }

    // Update event texts
    while (eventTexts.length > 0) {
      const t = eventTexts.pop()!;
      gameLayer.removeChild(t);
      t.destroy();
    }

    activeEvents = activeEvents.filter((e) => {
      e.age++;
      e.y -= 1;
      if (e.age > 40) return false;

      const t = new Text({ text: e.text, style: eventStyle });
      t.anchor.set(0.5);
      t.x = e.x;
      t.y = e.y;
      t.alpha = Math.max(0, 1 - e.age / 40);
      gameLayer.addChild(t);
      eventTexts.push(t);
      return true;
    });

    // Announcement fade
    if (announcementTimer > 0) {
      announcementTimer--;
      announcementText.alpha = Math.min(1, announcementTimer / 30);
      if (announcementTimer <= 0) {
        announcementText.text = "";
      }
    }
  });
}

main().catch(console.error);
