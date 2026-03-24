---
description: Use Bun instead of Node.js, npm, pnpm, or vite.
globs: "*.ts, *.tsx, *.html, *.css, *.js, *.jsx, package.json"
alwaysApply: false
---

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Frontend

Use HTML imports with `Bun.serve()`. Don't use `vite`. HTML imports fully support React, CSS, Tailwind.

Server:

```ts#index.ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  // optional websocket support
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
      // handle close
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

HTML files can import .tsx, .jsx or .js files directly and Bun's bundler will transpile & bundle automatically. `<link>` tags can point to stylesheets and Bun's CSS bundler will bundle.

```html#index.html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

With the following `frontend.tsx`:

```tsx#frontend.tsx
import React from "react";
import { createRoot } from "react-dom/client";

// import .css files directly and it works
import './index.css';

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

Then, run index.ts

```sh
bun --hot ./index.ts
```

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.mdx`.

## Project-Specific

### Build & Run
- `bun run dev` — start the game server (watches for changes)
- `bun run build` — rebuild client bundle to `client/dist/` (**required** after editing client .ts files)
- `bun run agent` — run a test bot agent
- The browser loads pre-built JS from `client/dist/renderer.js`, NOT the .ts source directly

### Architecture
- WebSocket fighting game: 200ms ticks, 10-unit arena, 100 HP per fighter
- Server: `server/index.ts` (Bun.serve with WebSocket), `server/game-engine.ts`, `server/match.ts`, `server/matchmaker.ts`
- Client: Pixi.js v8 renderer (`client/renderer.ts`), sprite engine (`client/sprites.ts`), spectator WS client (`client/spectator-client.ts`)
- Agents connect via WebSocket to `/agent`, spectators to `/spectate`
- Protocol types in `server/protocol.ts` — actions: punch, kick, special, block, jump, move_left, move_right

### Sprite Engine (`client/sprites.ts`)
- Frame size: 128x128 pixels (from PixelLab.ai generation)
- Spritesheet layout: 5 rows x 4 cols (512x640 PNG per fighter)
  - Row 0: idle, Row 1: hit/stagger, Row 2: walk, Row 3: jump, Row 4: punch
- `FighterSprite` takes `nativeFacingRight` param — P1 (fighter-blue) natively faces left (`false`), P2 (fighter-red) natively faces right (`true`)
- Fighter display size controlled by `FIGHTER_W`/`FIGHTER_H` in `renderer.ts` (currently 100x150)
- Assets in `client/assets/`: fighter-blue.png, fighter-red.png, arena-bg.png, fx-*.png

### Deployment
- Hetzner CPX11 server: `5.161.180.174` / `tijuanaclawfights.com:3000`
- Auto-deploys on push to `main` via `.github/workflows/deploy.yml`
- Server uses systemd service `clawfights` — project at `/root/tijuanaClawFights`
- Bun on server: `/root/.bun/bin/bun`
- Deploy flow: git pull → bun install → bun run build → systemctl restart clawfights

### Spectator Page & iOS WebView
- `/arena` serves static `client/arena.html` — no query parameter handling
- HTML structure: `#game-container` (PixiJS canvas 800×400), `#leaderboard` (DOM table), `#agent-panels` (DOM logs), `#status`, `#controls`
- PixiJS renders all in-game visuals (fighters, HP bars, actions, timer, effects); leaderboard & agent logs are DOM/HTML
- **iOS app** (`/Users/jmg/GitHub/clawFighter_iOS`) loads `/arena` in WKWebView and injects CSS to hide `#leaderboard`, `#agent-panels`, `h1`, `#status`, `#controls` — showing only the game canvas
- No server-side mobile theme needed currently; CSS injection in the iOS client handles it
- If server-side theme support is ever added: parse `url.searchParams` in `/arena` route, inject config as `<script>window.__ARENA_CONFIG = {...}</script>`, read in `renderer.ts`

### gstack (Garry Tan's Claude Code skill pack)
- Installed at `.claude/skills/gstack/` — provides slash commands for the full dev workflow
- Available skills: `/plan-ceo-review`, `/plan-eng-review`, `/review`, `/ship`, `/qa`, `/browse`, `/design-consultation`, `/design-review`, `/investigate`, `/retro`, `/office-hours`, `/freeze`, `/unfreeze`, `/careful`, `/document-release`
- Use `/browse` for all web browsing tasks (opens real Playwright browser)
- Use `/qa` to QA the site by opening it in a real browser and clicking through
- Use `/ship` to create a PR with full review + QA cycle
- Use `/investigate` for systematic root-cause debugging

### Companion Repos
- **ClawFighter iOS**: `/Users/jmg/GitHub/clawFighter_iOS` — Swift/SwiftUI app with on-device MLX LLM, prompt evolution, spectator WebView
- **OpenClaw fighter agent**: `/Users/jmg/GitHub/openClawFighter` (separate repo)
- Uses Claude Haiku with 140ms timeout + heuristic fallback for 200ms game ticks
