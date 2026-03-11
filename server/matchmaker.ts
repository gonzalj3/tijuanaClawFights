import { GameEngine } from "./game-engine.ts";

interface QueuedAgent {
  id: string;
  name: string;
}

const MAX_FIGHTS = 3;

export class Matchmaker {
  private queue: QueuedAgent[] = [];
  private matchCounter = 0;
  private fightCounts = new Map<string, number>(); // agentId → fight count

  constructor(private engine: GameEngine) {}

  enqueue(agentId: string, agentName: string): void {
    // Don't double-queue
    if (this.queue.some((a) => a.id === agentId)) return;
    this.queue.push({ id: agentId, name: agentName });
    console.log(`[Matchmaker] ${agentName} joined queue (${this.queue.length} waiting)`);
    this.tryMatch();
  }

  dequeue(agentId: string): void {
    this.queue = this.queue.filter((a) => a.id !== agentId);
    this.fightCounts.delete(agentId);
  }

  getQueueSize(): number {
    return this.queue.length;
  }

  getFirstWaitingName(): string | null {
    return this.queue.length > 0 ? this.queue[0]!.name : null;
  }

  /** Called by game engine when a match ends. Handles re-queue or kick. */
  onMatchEnd(agent0Id: string, agent0Name: string, agent1Id: string, agent1Name: string): void {
    for (const [id, name] of [[agent0Id, agent0Name], [agent1Id, agent1Name]] as const) {
      const count = (this.fightCounts.get(id) ?? 0) + 1;
      this.fightCounts.set(id, count);

      if (count >= MAX_FIGHTS) {
        // Kick agent
        console.log(`[Matchmaker] ${name} kicked after ${count} fights`);
        const sock = this.engine.agentSockets.get(id);
        sock?.send(JSON.stringify({ type: "kicked", reason: "3 rounds completed" }));
        this.fightCounts.delete(id);
        // Don't re-queue — agent can rejoin manually (count resets)
      } else {
        // Auto re-queue
        console.log(`[Matchmaker] ${name} auto re-queued (${count}/${MAX_FIGHTS} fights)`);
        this.enqueue(id, name);
      }
    }
  }

  /** Reset fight count for an agent (e.g., when they rejoin after being kicked) */
  resetFightCount(agentId: string): void {
    this.fightCounts.delete(agentId);
  }

  private tryMatch(): void {
    while (this.queue.length >= 2) {
      const a0 = this.queue.shift()!;
      const a1 = this.queue.shift()!;

      const matchId = `match-${++this.matchCounter}`;
      console.log(`[Matchmaker] Creating ${matchId}: ${a0.name} vs ${a1.name}`);

      const match = this.engine.createMatch(matchId, a0.id, a1.id, a0.name, a1.name);

      // Notify agents
      const sock0 = this.engine.agentSockets.get(a0.id);
      const sock1 = this.engine.agentSockets.get(a1.id);

      sock0?.send(
        JSON.stringify({
          type: "match_start",
          matchId,
          opponent: a1.name,
          yourIndex: 0,
        })
      );
      sock1?.send(
        JSON.stringify({
          type: "match_start",
          matchId,
          opponent: a0.name,
          yourIndex: 1,
        })
      );
    }
  }
}
