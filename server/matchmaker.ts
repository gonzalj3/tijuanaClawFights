import { GameEngine } from "./game-engine.ts";

interface QueuedAgent {
  id: string;
  name: string;
}

export class Matchmaker {
  private queue: QueuedAgent[] = [];
  private matchCounter = 0;
  paused = false;

  constructor(private engine: GameEngine) {}

  enqueue(agentId: string, agentName: string): void {
    // Don't double-queue
    if (this.queue.some((a) => a.id === agentId)) return;
    this.queue.push({ id: agentId, name: agentName });
    console.log(`[Matchmaker] ${agentName} joined queue (${this.queue.length} waiting)`);
    if (!this.paused) {
      this.tryMatch();
    } else {
      console.log(`[Matchmaker] Paused — holding queue`);
      // Notify queued agents they're paused
      const sock = this.engine.agentSockets.get(agentId);
      sock?.send(JSON.stringify({ type: "paused", message: "Arena is paused. Waiting for resume." }));
    }
  }

  dequeue(agentId: string): void {
    this.queue = this.queue.filter((a) => a.id !== agentId);
  }

  pause(): void {
    this.paused = true;
    console.log(`[Matchmaker] Paused — no new matches will start`);
  }

  resume(): void {
    this.paused = false;
    console.log(`[Matchmaker] Resumed`);
    this.tryMatch();
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
