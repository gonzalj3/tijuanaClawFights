import type { ServerWebSocket } from "bun";
import type { AgentMessage } from "./protocol.ts";
import type { GameEngine } from "./game-engine.ts";
import type { Matchmaker } from "./matchmaker.ts";

export interface AgentData {
  agentId: string;
  matchId?: string;
  fighterIndex?: 0 | 1;
}

// Registered agents: id → name
const agents = new Map<string, string>();

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
      ws.send(JSON.stringify({ type: "registered", id }));
      console.log(`[Agent] ${msg.name} registered (${id})`);
      break;
    }

    case "join_queue": {
      const name = agents.get(ws.data.agentId);
      if (!name) {
        ws.send(JSON.stringify({ type: "error", message: "Not registered" }));
        return;
      }
      ws.send(JSON.stringify({ type: "queued" }));
      matchmaker.enqueue(ws.data.agentId, name);
      break;
    }

    case "action": {
      if (!ws.data.matchId || ws.data.fighterIndex === undefined) {
        ws.send(JSON.stringify({ type: "error", message: "Not in a match" }));
        return;
      }
      const match = engine.matches.get(ws.data.matchId);
      if (match) {
        match.setAction(ws.data.fighterIndex, msg.action);
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
  const { agentId, matchId, fighterIndex } = ws.data;
  if (agentId) {
    const agentName = agents.get(agentId);
    matchmaker.dequeue(agentId);
    engine.agentSockets.delete(agentId);
    agents.delete(agentId);
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
