import type { ServerWebSocket } from "bun";
import type { AgentMessage } from "./protocol.ts";
import { MIN_RESPONSE_MS, TICK_MS } from "./protocol.ts";
import type { GameEngine } from "./game-engine.ts";
import type { Matchmaker } from "./matchmaker.ts";
import type { PlayersDb } from "./players.ts";

export interface AgentData {
  agentId: string;
  playerId?: string; // persistent UUID from localStorage
  matchId?: string;
  fighterIndex?: 0 | 1;
}

// Registered agents: id → name
const agents = new Map<string, string>();
// agentId → playerId (persistent UUID)
const agentPlayerIds = new Map<string, string>();
// playerId → socket (for duplicate connection detection)
const playerSockets = new Map<string, ServerWebSocket<AgentData>>();
// Track last accepted action time per agent (one action per tick window)
const lastActionAt = new Map<string, number>();

let playersDb: PlayersDb | null = null;

export function setPlayersDb(db: PlayersDb): void {
  playersDb = db;
}

export function getPlayerIdForAgent(agentId: string): string | undefined {
  return agentPlayerIds.get(agentId);
}

export function handleAgentMessage(
  ws: ServerWebSocket<AgentData>,
  raw: string,
  engine: GameEngine,
  matchmaker: Matchmaker
): void {
  let msg: AgentMessage;
  try {
    msg = JSON.parse(raw);
  } catch {
    ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
    return;
  }

  // Relay incoming agent message to spectators for debug panel
  const agentName = agents.get(ws.data.agentId);
  if (ws.data.fighterIndex !== undefined && agentName) {
    engine.broadcastToSpectators({
      type: "agent_msg",
      fighter: ws.data.fighterIndex,
      name: agentName,
      direction: "in",
      msg,
    });
  }

  switch (msg.type) {
    case "register": {
      const id = crypto.randomUUID();
      agents.set(id, msg.name);
      ws.data.agentId = id;
      engine.agentSockets.set(id, ws as any);
      // Cancel demo timer early — a real agent is connecting
      engine.exitDemoMode();

      // Player persistence: if playerId provided, look up or create player
      let playerPayload: any = undefined;
      if (msg.playerId && playersDb) {
        // Kick duplicate connection (last connection wins)
        const existingSocket = playerSockets.get(msg.playerId);
        if (existingSocket) {
          try {
            existingSocket.send(JSON.stringify({ type: "kicked", reason: "connected_elsewhere" }));
            existingSocket.close();
          } catch { /* already closed */ }
        }
        playerSockets.set(msg.playerId, ws);
        agentPlayerIds.set(id, msg.playerId);
        ws.data.playerId = msg.playerId;

        const player = playersDb.getOrCreate(msg.playerId, msg.name);
        playerPayload = {
          name: player.name,
          rating: player.rating,
          wins: player.wins,
          losses: player.losses,
          draws: player.draws,
          streak: player.current_streak,
          bestStreak: player.best_streak,
        };
      }

      ws.send(JSON.stringify({ type: "registered", id, player: playerPayload }));
      console.log(`[Agent] ${msg.name} registered (${id}${msg.playerId ? `, player: ${msg.playerId.slice(0, 8)}...` : ""})`);
      break;
    }

    case "join_queue": {
      const name = agents.get(ws.data.agentId);
      if (!name) {
        ws.send(JSON.stringify({ type: "error", message: "Not registered" }));
        return;
      }
      // Exit demo mode so the arena is free for real agents
      engine.exitDemoMode();
      // Track streak for progressive NPC difficulty
      engine.setAgentStreak(ws.data.agentId, msg.streak ?? 0);
      ws.send(JSON.stringify({ type: "queued" }));
      matchmaker.enqueue(ws.data.agentId, name);
      break;
    }

    case "leave_queue": {
      matchmaker.dequeue(ws.data.agentId);
      const lqName = agents.get(ws.data.agentId);
      console.log(`[Agent] ${lqName ?? ws.data.agentId} left queue`);
      ws.send(JSON.stringify({ type: "queue_left" }));
      break;
    }

    case "request_tournament_match": {
      const name = agents.get(ws.data.agentId);
      if (!name) {
        ws.send(JSON.stringify({ type: "error", message: "Not registered" }));
        return;
      }
      if (ws.data.matchId) {
        ws.send(JSON.stringify({ type: "error", message: "Already in a match" }));
        return;
      }
      if (msg.rung < 0 || msg.rung > 8) {
        ws.send(JSON.stringify({ type: "error", message: "Invalid tournament rung" }));
        return;
      }
      engine.createTournamentMatch(ws.data.agentId, name, msg.rung);
      break;
    }

    case "action": {
      if (!ws.data.matchId || ws.data.fighterIndex === undefined) {
        ws.send(JSON.stringify({ type: "error", message: "Not in a match" }));
        return;
      }
      const now = Date.now();
      // Anti-heuristic policy: player agents must use LLMs, not heuristics.
      // Actions arriving faster than MIN_RESPONSE_MS are silently dropped.
      const sentAt = engine.lastStateSentAt.get(ws.data.agentId);
      if (sentAt && now - sentAt < MIN_RESPONSE_MS) {
        break; // silently drop — agent responded too fast
      }
      // Rate limit: only accept one action per tick window per agent
      const lastAction = lastActionAt.get(ws.data.agentId);
      if (lastAction && now - lastAction < TICK_MS) {
        break; // silently drop — already acted this tick
      }
      const match = engine.matches.get(ws.data.matchId);
      if (match) {
        match.setAction(ws.data.fighterIndex, msg.action);
        lastActionAt.set(ws.data.agentId, now);
      }
      break;
    }
  }
}

export function handleAgentClose(
  ws: ServerWebSocket<AgentData>,
  engine: GameEngine,
  matchmaker: Matchmaker
): void {
  const { agentId, playerId, matchId, fighterIndex } = ws.data;
  if (agentId) {
    const agentName = agents.get(agentId);
    matchmaker.removeAgent(agentId);
    engine.agentSockets.delete(agentId);
    agents.delete(agentId);
    lastActionAt.delete(agentId);
    // Clean up player tracking
    if (playerId) {
      const currentSocket = playerSockets.get(playerId);
      if (currentSocket === ws) playerSockets.delete(playerId);
      agentPlayerIds.delete(agentId);
    }
    console.log(`[Agent] ${agentName ?? agentId} disconnected`);

    // If agent was in an active match, force-end it (opponent wins by forfeit)
    if (matchId) {
      const match = engine.matches.get(matchId);
      if (match && !match.finished) {
        console.log(`[Agent] Forfeiting match ${matchId} — ${agentName ?? agentId} disconnected`);
        match.forfeit(fighterIndex ?? 0);
      }
    }

    // Check if NPC should respawn (arena may be empty now)
    engine.checkNpcRespawn();
  }
}
