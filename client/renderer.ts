import { Application, Graphics, Text, TextStyle } from "pixi.js";
import { connectSpectator } from "./spectator-client.ts";
import type { MatchStateMsg, MatchStartMsg, MatchEndMsg, FighterState } from "./spectator-client.ts";

const CANVAS_W = 800;
const CANVAS_H = 400;
const ARENA_UNITS = 10;
const UNIT_PX = CANVAS_W / (ARENA_UNITS + 2); // padding on sides
const FIGHTER_W = 40;
const FIGHTER_H = 70;
const HP_BAR_W = 60;
const HP_BAR_H = 8;

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
let interpProgress = 0;
let activeEvents: Array<{ text: string; x: number; y: number; age: number }> = [];
let matchActive = false;
let statusEl: HTMLElement;
let timerText: Text;
let matchInfoText: Text;
let announcementText: Text;
let announcementTimer = 0;

async function main() {
  statusEl = document.getElementById("status")!;

  const app = new Application();
  await app.init({
    width: CANVAS_W,
    height: CANVAS_H,
    backgroundColor: COLORS.arena,
    antialias: true,
  });

  document.getElementById("game-container")!.appendChild(app.canvas);

  // Floor
  const floor = new Graphics();
  floor.rect(0, CANVAS_H - 50, CANVAS_W, 50);
  floor.fill(COLORS.floor);
  app.stage.addChild(floor);

  // Fighter graphics
  const fighter1Gfx = new Graphics();
  const fighter2Gfx = new Graphics();
  app.stage.addChild(fighter1Gfx);
  app.stage.addChild(fighter2Gfx);

  // HP bars
  const hp1Bg = new Graphics();
  const hp1Fill = new Graphics();
  const hp2Bg = new Graphics();
  const hp2Fill = new Graphics();
  app.stage.addChild(hp1Bg, hp1Fill, hp2Bg, hp2Fill);

  // Name labels
  const nameStyle = new TextStyle({ fontSize: 14, fill: 0xffffff, fontFamily: "Courier New" });
  const name1 = new Text({ text: "", style: nameStyle });
  const name2 = new Text({ text: "", style: nameStyle });
  app.stage.addChild(name1, name2);

  // Action labels
  const actionStyle = new TextStyle({ fontSize: 12, fill: 0xaaaaaa, fontFamily: "Courier New" });
  const action1 = new Text({ text: "", style: actionStyle });
  const action2 = new Text({ text: "", style: actionStyle });
  app.stage.addChild(action1, action2);

  // Timer
  const timerStyle = new TextStyle({ fontSize: 20, fill: 0xffcc00, fontFamily: "Courier New", fontWeight: "bold" });
  timerText = new Text({ text: "", style: timerStyle });
  timerText.anchor.set(0.5, 0);
  timerText.x = CANVAS_W / 2;
  timerText.y = 10;
  app.stage.addChild(timerText);

  // Match info (center)
  const infoStyle = new TextStyle({ fontSize: 16, fill: 0x888888, fontFamily: "Courier New" });
  matchInfoText = new Text({ text: "Waiting for fighters...", style: infoStyle });
  matchInfoText.anchor.set(0.5);
  matchInfoText.x = CANVAS_W / 2;
  matchInfoText.y = CANVAS_H / 2;
  app.stage.addChild(matchInfoText);

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
  app.stage.addChild(announcementText);

  // Event text container
  const eventTexts: Text[] = [];
  const eventStyle = new TextStyle({
    fontSize: 18,
    fill: 0xffffff,
    fontFamily: "Courier New",
    fontWeight: "bold",
    stroke: { color: 0x000000, width: 3 },
  });

  function unitToX(unit: number): number {
    return (unit + 1) * UNIT_PX;
  }

  function drawFighter(gfx: Graphics, x: number, color: number, flash: boolean) {
    gfx.clear();
    const drawColor = flash ? 0xffffff : color;
    gfx.rect(x - FIGHTER_W / 2, CANVAS_H - 50 - FIGHTER_H, FIGHTER_W, FIGHTER_H);
    gfx.fill(drawColor);
    // "Claws" - small triangles at the sides
    gfx.moveTo(x - FIGHTER_W / 2 - 10, CANVAS_H - 50 - FIGHTER_H + 20);
    gfx.lineTo(x - FIGHTER_W / 2, CANVAS_H - 50 - FIGHTER_H + 10);
    gfx.lineTo(x - FIGHTER_W / 2, CANVAS_H - 50 - FIGHTER_H + 30);
    gfx.fill(drawColor);
    gfx.moveTo(x + FIGHTER_W / 2 + 10, CANVAS_H - 50 - FIGHTER_H + 20);
    gfx.lineTo(x + FIGHTER_W / 2, CANVAS_H - 50 - FIGHTER_H + 10);
    gfx.lineTo(x + FIGHTER_W / 2, CANVAS_H - 50 - FIGHTER_H + 30);
    gfx.fill(drawColor);
  }

  function drawHpBar(bg: Graphics, fill: Graphics, x: number, hp: number) {
    const y = CANVAS_H - 50 - FIGHTER_H - 20;
    bg.clear();
    bg.rect(x - HP_BAR_W / 2, y, HP_BAR_W, HP_BAR_H);
    bg.fill(COLORS.hpBg);
    fill.clear();
    const ratio = hp / 100;
    const color = ratio > 0.3 ? COLORS.hpFill : COLORS.hpLow;
    fill.rect(x - HP_BAR_W / 2, y, HP_BAR_W * ratio, HP_BAR_H);
    fill.fill(color);
  }

  // Connect to server
  connectSpectator({
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
      console.log(`Match started: ${msg.fighters[0]} vs ${msg.fighters[1]}`);
    },
    onMatchState(msg: MatchStateMsg) {
      if (!matchActive) {
        matchActive = true;
        matchInfoText.text = "";
      }

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
        activeEvents.push({ text: ev.text, x: fx, y: CANVAS_H - 50 - FIGHTER_H - 40, age: 0 });
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
        announcementText.text = "";
        timerText.text = "";
      }, 4000);
    },
  });

  function showAnnouncement(text: string, color: number) {
    announcementText.text = text;
    announcementText.style.fill = color;
    announcementTimer = 120; // ~2 seconds at 60fps
  }

  // Render loop
  app.ticker.add((ticker) => {
    if (!currentFighters || !targetFighters) return;

    // Interpolate (5 ticks/sec = 200ms, at 60fps ~ 12 frames per tick)
    interpProgress = Math.min(1, interpProgress + ticker.deltaTime / 12);

    for (let i = 0; i < 2; i++) {
      const curr = currentFighters[i as 0 | 1];
      const tgt = targetFighters[i as 0 | 1];
      const lerpX = curr.x + (tgt.x - curr.x) * interpProgress;
      const x = unitToX(lerpX);

      const gfx = i === 0 ? fighter1Gfx : fighter2Gfx;
      const color = i === 0 ? COLORS.p1 : COLORS.p2;

      // Check if fighter was just hit
      const justHit = activeEvents.some(
        (e) => e.age < 3 && e.text.includes("!") && Math.abs(e.x - x) < UNIT_PX
      );

      drawFighter(gfx, x, color, justHit);

      // HP bars
      const bg = i === 0 ? hp1Bg : hp2Bg;
      const fill = i === 0 ? hp1Fill : hp2Fill;
      drawHpBar(bg, fill, x, tgt.hp);

      // Names
      const nameLabel = i === 0 ? name1 : name2;
      nameLabel.text = tgt.name;
      nameLabel.x = x - nameLabel.width / 2;
      nameLabel.y = CANVAS_H - 50 - FIGHTER_H - 38;

      // Action labels
      const actionLabel = i === 0 ? action1 : action2;
      actionLabel.text = tgt.lastAction ?? "";
      actionLabel.x = x - actionLabel.width / 2;
      actionLabel.y = CANVAS_H - 40;
    }

    // Update event texts
    // Clean up old event text sprites
    while (eventTexts.length > 0) {
      const t = eventTexts.pop()!;
      app.stage.removeChild(t);
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
      app.stage.addChild(t);
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
