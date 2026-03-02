import { Assets, Texture, Rectangle, AnimatedSprite, Container, Sprite, Graphics } from "pixi.js";

// ─── Animation State Machine ────────────────────────────────────
export type AnimState =
  | "idle"
  | "walk"
  | "punch"
  | "kick"
  | "special"
  | "block"
  | "jump"
  | "hit"
  | "ko";

/** Map game actions to animation states */
export function actionToAnim(action: string | null, wasHit: boolean, isKo: boolean): AnimState {
  if (isKo) return "ko";
  if (wasHit) return "hit";
  if (!action) return "idle";
  switch (action) {
    case "punch": return "punch";
    case "kick": return "kick";
    case "special": return "special";
    case "block": return "block";
    case "jump": return "jump";
    case "move_left":
    case "move_right": return "walk";
    default: return "idle";
  }
}

// ─── Retro Diffusion walking_and_idle Layout ────────────────────
// Output is 192x192 PNG = 4x4 grid of 48x48 frames
// The exact layout from walking_and_idle:
//   Row 0: Idle facing down (4 frames)
//   Row 1: Walk facing down (4 frames)
//   Row 2: Walk facing right (4 frames) — we use this for side-view walk
//   Row 3: Walk facing up (4 frames)
//
// For a side-scroller, we map:
//   idle    → Row 0 (idle facing forward)
//   walk    → Row 2 (walk right, flip for left)
//   punch   → Row 2 frame 1-2 (reuse walk frames as a lunge)
//   kick    → Row 2 frame 2-3
//   special → All of Row 2 fast (flurry)
//   block   → Row 0 frame 0 (held still)
//   jump    → Row 3 frame 0-2 (upward facing)
//   hit     → Row 1 frame 0,2 (stagger)
//   ko      → Row 1 frames reversed (falling)

const FRAME_W = 64;
const FRAME_H = 64;
const SHEET_COLS = 4;

/** Extract frames from a 4x4 grid */
function extractGrid(base: Texture, row: number, cols: number): Texture[] {
  const textures: Texture[] = [];
  for (let c = 0; c < cols; c++) {
    const frame = new Rectangle(c * FRAME_W, row * FRAME_H, FRAME_W, FRAME_H);
    textures.push(new Texture({ source: base.source, frame }));
  }
  return textures;
}

/** Extract all 16 frames sequentially from a 4x4 grid */
function extractAll16(base: Texture): Texture[] {
  const textures: Texture[] = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const frame = new Rectangle(c * FRAME_W, r * FRAME_H, FRAME_W, FRAME_H);
      textures.push(new Texture({ source: base.source, frame }));
    }
  }
  return textures;
}

// ─── Fighter Sprite Controller ──────────────────────────────────
export class FighterSprite {
  container: Container;
  private anims: Map<AnimState, Texture[]> = new Map();
  private animDefs: Map<AnimState, { speed: number; loop: boolean }> = new Map();
  private current: AnimatedSprite | null = null;
  private currentState: AnimState = "idle";
  private fallbackGfx: Graphics | null = null;
  private useFallback: boolean;
  private fighterColor: number;
  private spriteScale: number;

  readonly displayW: number;
  readonly displayH: number;

  constructor(color: number, displayW: number, displayH: number) {
    this.container = new Container();
    this.useFallback = true;
    this.fighterColor = color;
    this.displayW = displayW;
    this.displayH = displayH;
    this.spriteScale = displayH / FRAME_H;

    this.fallbackGfx = new Graphics();
    this.container.addChild(this.fallbackGfx);
  }

  loadFromTexture(base: Texture): void {
    const row0 = extractGrid(base, 0, 4); // idle / front-facing
    const row1 = extractGrid(base, 1, 4); // walk down
    const row2 = extractGrid(base, 2, 4); // walk right (side view)
    const row3 = extractGrid(base, 3, 4); // walk up

    // Map game states to available frames
    this.setAnim("idle",    row0,                          0.08, true);
    this.setAnim("walk",    row2,                          0.15, true);
    this.setAnim("punch",   [row2[1]!, row2[2]!, row2[1]!], 0.25, false);
    this.setAnim("kick",    [row2[2]!, row2[3]!, row2[2]!], 0.25, false);
    this.setAnim("special", [...row2, row2[3]!],           0.2,  false);
    this.setAnim("block",   [row0[0]!],                    0.1,  false);
    this.setAnim("jump",    [row3[0]!, row3[1]!, row3[2]!], 0.15, false);
    this.setAnim("hit",     [row1[0]!, row1[2]!],          0.2,  false);
    this.setAnim("ko",      [row1[2]!, row1[1]!, row1[0]!], 0.1,  false);

    this.useFallback = false;

    if (this.fallbackGfx) {
      this.container.removeChild(this.fallbackGfx);
      this.fallbackGfx.destroy();
      this.fallbackGfx = null;
    }

    this.setState("idle");
  }

  private setAnim(state: AnimState, frames: Texture[], speed: number, loop: boolean): void {
    this.anims.set(state, frames);
    this.animDefs.set(state, { speed, loop });
  }

  setState(state: AnimState): void {
    if (state === this.currentState && this.current) return;
    this.currentState = state;

    if (this.useFallback) return;

    const frames = this.anims.get(state);
    const def = this.animDefs.get(state);
    if (!frames || !def || frames.length === 0) {
      const idleFrames = this.anims.get("idle");
      const idleDef = this.animDefs.get("idle");
      if (!idleFrames || !idleDef) return;
      this.playAnim(idleFrames, idleDef);
      return;
    }

    this.playAnim(frames, def);
  }

  private playAnim(frames: Texture[], def: { speed: number; loop: boolean }): void {
    if (this.current) {
      this.container.removeChild(this.current);
      this.current.destroy();
    }

    const anim = new AnimatedSprite(frames);
    anim.animationSpeed = def.speed;
    anim.loop = def.loop;
    anim.anchor.set(0.5, 1);
    anim.scale.set(this.spriteScale);

    if (!def.loop) {
      anim.onComplete = () => {
        if (this.currentState !== "ko") {
          this.currentState = "idle"; // force state reset
          const idleFrames = this.anims.get("idle");
          const idleDef = this.animDefs.get("idle");
          if (idleFrames && idleDef) this.playAnim(idleFrames, idleDef);
        }
      };
    }

    anim.play();
    this.container.addChild(anim);
    this.current = anim;
  }

  setPosition(x: number, groundY: number): void {
    this.container.x = x;
    this.container.y = groundY;
  }

  setFacing(facingRight: boolean): void {
    if (this.useFallback) return;
    if (this.current) {
      this.current.scale.x = facingRight ? this.spriteScale : -this.spriteScale;
    }
  }

  drawFallback(x: number, groundY: number, flash: boolean): void {
    if (!this.fallbackGfx) return;
    const gfx = this.fallbackGfx;
    gfx.clear();
    const color = flash ? 0xffffff : this.fighterColor;
    const w = this.displayW;
    const h = this.displayH;
    gfx.rect(-w / 2, -h, w, h);
    gfx.fill(color);
    gfx.moveTo(-w / 2 - 10, -h + 20);
    gfx.lineTo(-w / 2, -h + 10);
    gfx.lineTo(-w / 2, -h + 30);
    gfx.fill(color);
    gfx.moveTo(w / 2 + 10, -h + 20);
    gfx.lineTo(w / 2, -h + 10);
    gfx.lineTo(w / 2, -h + 30);
    gfx.fill(color);
    this.container.x = x;
    this.container.y = groundY;
  }

  get isFallback(): boolean {
    return this.useFallback;
  }
}

// ─── Effect Sprite ──────────────────────────────────────────────
// VFX sheets from Retro Diffusion are also 192x192 (4x4 grid of 48x48)
// We read all 16 frames as a sequential animation.

export class EffectSprite {
  private anims: Map<string, Texture[]> = new Map();
  private loaded = false;

  async loadEffect(name: string, path: string): Promise<void> {
    try {
      const base = await Assets.load(path);
      const frames = extractAll16(base);
      this.anims.set(name, frames);
      this.loaded = true;
    } catch {
      // Asset not available yet
    }
  }

  spawn(name: string, x: number, y: number, parent: Container): AnimatedSprite | null {
    const frames = this.anims.get(name);
    if (!frames) return null;

    const anim = new AnimatedSprite(frames);
    anim.animationSpeed = 0.4; // play through 16 frames quickly
    anim.loop = false;
    anim.anchor.set(0.5);
    anim.x = x;
    anim.y = y;
    anim.scale.set(1.5); // scale up effects a bit for visibility
    anim.onComplete = () => {
      parent.removeChild(anim);
      anim.destroy();
    };
    anim.play();
    parent.addChild(anim);
    return anim;
  }

  get isLoaded(): boolean {
    return this.loaded;
  }
}

// ─── Screen Shake ───────────────────────────────────────────────
export class ScreenShake {
  private intensity = 0;
  private duration = 0;
  private elapsed = 0;

  trigger(intensity: number, durationFrames: number): void {
    this.intensity = intensity;
    this.duration = durationFrames;
    this.elapsed = 0;
  }

  update(stage: Container): void {
    if (this.elapsed >= this.duration) {
      stage.x = 0;
      stage.y = 0;
      return;
    }

    this.elapsed++;
    const decay = 1 - this.elapsed / this.duration;
    const amp = this.intensity * decay;
    stage.x = (Math.random() - 0.5) * 2 * amp;
    stage.y = (Math.random() - 0.5) * 2 * amp;
  }

  get active(): boolean {
    return this.elapsed < this.duration;
  }
}

// ─── Asset Loading ──────────────────────────────────────────────
export interface LoadedAssets {
  fighter1: Texture | null;
  fighter2: Texture | null;
  background: Texture | null;
  effects: EffectSprite;
}

export async function loadAllAssets(): Promise<LoadedAssets> {
  const effects = new EffectSprite();

  let fighter1: Texture | null = null;
  let fighter2: Texture | null = null;
  let background: Texture | null = null;

  try { fighter1 = await Assets.load("/assets/fighter-blue.png"); } catch {}
  try { fighter2 = await Assets.load("/assets/fighter-red.png"); } catch {}
  try { background = await Assets.load("/assets/arena-bg.png"); } catch {}

  await Promise.allSettled([
    effects.loadEffect("hit", "/assets/fx-hit.png"),
    effects.loadEffect("block", "/assets/fx-block.png"),
    effects.loadEffect("special", "/assets/fx-special.png"),
    effects.loadEffect("dust", "/assets/fx-dust.png"),
  ]);

  return { fighter1, fighter2, background, effects };
}
