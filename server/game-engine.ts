import { Match } from "./match.ts";
import { TICK_MS } from "./protocol.ts";
import type { ServerWebSocket } from "bun";
import type { SpectatorMessage } from "./protocol.ts";

export type AgentSocket = ServerWebSocket<{ agentId: string; matchId?: string; fighterIndex?: 0 | 1 }>;
export type SpectatorSocket = ServerWebSocket<{ spectator: true }>;

export class GameEngine {
  matches = new Map<string, Match>();
  agentSockets = new Map<string, AgentSocket>(); // agentId → socket
  spectators = new Set<SpectatorSocket>();
  private tickInterval: ReturnType<typeof setInterval> | null = null;

  start(): void {
    if (this.tickInterval) return;
    this.tickInterval = setInterval(() => this.tick(), TICK_MS);
    console.log(`Game engine started (${TICK_MS}ms ticks)`);
  }

  stop(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  createMatch(id: string, agent0Id: string, agent1Id: string, name0: string, name1: string): Match {
    const match = new Match(id, name0, name1);

    match.onEnd = (m) => {
      const endMsg = m.getEndMessage();

      // Notify agents
      const sock0 = this.agentSockets.get(agent0Id);
      const sock1 = this.agentSockets.get(agent1Id);
      const endPayload = JSON.stringify({ type: "match_end", ...endMsg });
      sock0?.send(endPayload);
      sock1?.send(endPayload);

      // Clear match associations
      if (sock0?.data) sock0.data.matchId = undefined;
      if (sock1?.data) sock1.data.matchId = undefined;

      // Notify spectators
      this.broadcastToSpectators({
        type: "match_end",
        matchId: m.id,
        ...endMsg,
      });

      // Remove match after a short delay
      setTimeout(() => this.matches.delete(id), 2000);
    };

    this.matches.set(id, match);

    // Set socket data
    const sock0 = this.agentSockets.get(agent0Id);
    const sock1 = this.agentSockets.get(agent1Id);
    if (sock0?.data) {
      sock0.data.matchId = id;
      sock0.data.fighterIndex = 0;
    }
    if (sock1?.data) {
      sock1.data.matchId = id;
      sock1.data.fighterIndex = 1;
    }

    // Notify spectators of new match
    this.broadcastToSpectators({
      type: "match_start",
      matchId: id,
      fighters: [name0, name1],
    });

    return match;
  }

  private tick(): void {
    for (const [matchId, match] of this.matches) {
      if (match.finished) continue;

      match.processTick();

      // Send state to agents
      for (const [agentId, sock] of this.agentSockets) {
        if (sock.data.matchId === matchId && sock.data.fighterIndex !== undefined) {
          try {
            const agentState = match.getAgentState(sock.data.fighterIndex);
            sock.send(JSON.stringify(agentState));
            // Relay outgoing message to spectators
            this.broadcastToSpectators({
              type: "agent_msg",
              fighter: sock.data.fighterIndex,
              name: match.fighters[sock.data.fighterIndex].name,
              direction: "out",
              msg: agentState,
            });
          } catch {
            // Agent disconnected
          }
        }
      }

      // Send state to spectators
      this.broadcastToSpectators(match.getSpectatorState());
    }
  }

  broadcastToSpectators(msg: SpectatorMessage): void {
    const payload = JSON.stringify(msg);
    for (const ws of this.spectators) {
      try {
        ws.send(payload);
      } catch {
        this.spectators.delete(ws);
      }
    }
  }

  getMatchList(): SpectatorMessage {
    const matches: Array<{ matchId: string; fighters: [string, string] }> = [];
    for (const [id, match] of this.matches) {
      if (!match.finished) {
        matches.push({
          matchId: id,
          fighters: [match.fighters[0].name, match.fighters[1].name],
        });
      }
    }
    return { type: "match_list", matches };
  }
}
