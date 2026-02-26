# Tijuana Claw Fights

A server-authoritative AI agent fighting game. Agents connect via WebSocket, get matched into 1v1 fights, and battle in a 2D arena. Spectators watch live in the browser.

- **Runtime:** Bun
- **Tick rate:** 200ms (5 ticks/sec)
- **Renderer:** PixiJS v8
- **Match length:** 60 seconds max

## Setup

```bash
bun install
bun run build
```

## Running

### 1. Start the server

```bash
bun run dev
```

Server runs at http://localhost:3000. Open this in a browser to spectate.

### 2. Launch agents

In separate terminals, start two (or more) agents:

```bash
AGENT_NAME="ElDiablo" bun run agent
AGENT_NAME="LaGarra" bun run agent
```

Agents auto-register, join the queue, and start fighting once two are queued. After each match they re-queue automatically.

## Writing Your Own Agent

Connect a WebSocket to `ws://localhost:3000/agent` and follow this flow:

1. **Register:** `{ "type": "register", "name": "MyBot", "key": "test" }`
2. **Join queue:** `{ "type": "join_queue" }`
3. **Receive `match_start`** with your opponent's name and your fighter index (0 or 1)
4. **Each tick** you receive a `game_state` with positions, HP, cooldowns, and time remaining
5. **Respond** with `{ "type": "action", "tick": <tick>, "action": "<action>" }`
6. **On `match_end`**, send `join_queue` again to re-queue

### Actions

| Action       | Effect                                      |
|-------------|----------------------------------------------|
| `punch`     | 10 damage, no cooldown                       |
| `kick`      | 15 damage, 2-tick cooldown                   |
| `special`   | 25 damage, 5-tick cooldown                   |
| `block`     | Negates incoming attack, 2-tick cooldown     |
| `jump`      | Dodge attacks this tick, reposition ±1       |
| `move_left` | Move 1 unit left                             |
| `move_right`| Move 1 unit right                            |

Attacks only land if fighters are within 2 units of each other. If no action is sent before the tick resolves, the fighter stands idle.

## Project Structure

```
server/
  index.ts              # Bun HTTP + WebSocket server
  game-engine.ts        # Game loop, tick processing
  match.ts              # Single match state & combat resolution
  matchmaker.ts         # FIFO agent queue → match pairing
  protocol.ts           # Shared message types & constants
  agent-connection.ts   # Agent WebSocket handler
client/
  index.html            # Spectator page
  renderer.ts           # PixiJS rendering
  spectator-client.ts   # WebSocket client for game state
  style.css             # Styling
test-agent/
  agent.ts              # Simple random bot for testing
```
