import { Match } from "./match.ts";
import { TICK_MS } from "./protocol.ts";
import { NpcBot } from "./npc-bot.ts";
import type { Matchmaker } from "./matchmaker.ts";
import type { ServerWebSocket } from "bun";
import type { SpectatorMessage, LeaderboardEntry } from "./protocol.ts";

export type AgentSocket = ServerWebSocket<{ agentId: string; matchId?: string; fighterIndex?: 0 | 1 }>;
export type SpectatorSocket = ServerWebSocket<{ spectator: true }>;

// ─── Agent Stats ────────────────────────────────────────────────
interface AgentStats {
  name: string;
  winStreak: number;
  bestStreak: number;
  totalWins: number;
  totalLosses: number;
  lastActive: number; // timestamp
}

const LEADERBOARD_SIZE = 12;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export class GameEngine {
  matches = new Map<string, Match>();
  agentSockets = new Map<string, AgentSocket>(); // agentId → socket
  spectators = new Set<SpectatorSocket>();
  matchmaker: Matchmaker | null = null; // set after construction
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private agentStats = new Map<string, AgentStats>(); // agent name → stats
  private npc: NpcBot | null = null;
  private npcMatchId: string | null = null;
  private npcFighterIndex: 0 | 1 = 0;

  start(): void {
    if (this.tickInterval) return;
    this.tickInterval = setInterval(() => this.tick(), TICK_MS);
    console.log(`Game engine started (${TICK_MS}ms ticks)`);
    // Auto-spawn NPC so the arena is never empty
    this.spawnNpc();
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

      // Record stats
      this.recordMatchResult(name0, name1, endMsg.winner);

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

      // Broadcast updated leaderboard
      this.broadcastToSpectators(this.getLeaderboardMessage());

      // Handle NPC match end
      if (this.npcMatchId === id) {
        this.npcMatchId = null;
        if (this.npc) {
          if (this.npc.isDismissed) {
            // NPC was told to leave — clean up
            this.destroyNpc();
          } else {
            // Re-queue NPC for next match
            this.matchmaker?.enqueue(this.npc.id, this.npc.name);
          }
        }
      }

      // Auto re-queue or kick agents via matchmaker (skip NPC — handled above)
      if (this.matchmaker) {
        const npcId = this.npc?.id;
        if (agent0Id !== npcId && agent1Id !== npcId) {
          this.matchmaker.onMatchEnd(agent0Id, name0, agent1Id, name1);
        } else {
          // Only handle the non-NPC agent
          const realId = agent0Id === npcId ? agent1Id : agent0Id;
          const realName = agent0Id === npcId ? name1 : name0;
          // Simulate onMatchEnd for just the real agent
          const count = ((this.matchmaker as any).fightCounts?.get(realId) ?? 0) + 1;
          (this.matchmaker as any).fightCounts?.set(realId, count);
          if (count >= 3) {
            console.log(`[Matchmaker] ${realName} kicked after ${count} fights`);
            const sock = this.agentSockets.get(realId);
            sock?.send(JSON.stringify({ type: "kicked", reason: "3 rounds completed" }));
            (this.matchmaker as any).fightCounts?.delete(realId);
          } else {
            console.log(`[Matchmaker] ${realName} auto re-queued (${count}/3 fights)`);
            this.matchmaker.enqueue(realId, realName);
          }
        }
      }

      // Remove match after a short delay
      setTimeout(() => {
        this.matches.delete(id);
        this.broadcastArenaStatus();
      }, 2000);

      this.broadcastArenaStatus();
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

    // Track NPC match
    if (this.npc) {
      if (agent0Id === this.npc.id) this.setNpcMatch(id, 0);
      else if (agent1Id === this.npc.id) this.setNpcMatch(id, 1);
    }

    // Notify spectators of new match
    this.broadcastToSpectators({
      type: "match_start",
      matchId: id,
      fighters: [name0, name1],
    });

    this.broadcastArenaStatus();

    return match;
  }

  private tick(): void {
    for (const [matchId, match] of this.matches) {
      if (match.finished) continue;

      match.processTick();

      // NPC tick — feed game state to the bot
      if (this.npc && this.npcMatchId === matchId) {
        this.npc.onTick(match, this.npcFighterIndex);
      }

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

  private getOrCreateStats(name: string): AgentStats {
    let stats = this.agentStats.get(name);
    if (!stats) {
      stats = { name, winStreak: 0, bestStreak: 0, totalWins: 0, totalLosses: 0, lastActive: Date.now() };
      this.agentStats.set(name, stats);
    }
    return stats;
  }

  private recordMatchResult(name0: string, name1: string, winner: string | null): void {
    const stats0 = this.getOrCreateStats(name0);
    const stats1 = this.getOrCreateStats(name1);
    stats0.lastActive = Date.now();
    stats1.lastActive = Date.now();

    if (winner === name0) {
      stats0.totalWins++;
      stats0.winStreak++;
      if (stats0.winStreak > stats0.bestStreak) stats0.bestStreak = stats0.winStreak;
      stats1.totalLosses++;
      stats1.winStreak = 0;
    } else if (winner === name1) {
      stats1.totalWins++;
      stats1.winStreak++;
      if (stats1.winStreak > stats1.bestStreak) stats1.bestStreak = stats1.winStreak;
      stats0.totalLosses++;
      stats0.winStreak = 0;
    } else {
      // Draw — both streaks reset
      stats0.winStreak = 0;
      stats1.winStreak = 0;
    }
  }

  getLeaderboardMessage(): SpectatorMessage {
    const now = Date.now();
    const entries: LeaderboardEntry[] = [];

    for (const stats of this.agentStats.values()) {
      // Only include agents active this week
      if (now - stats.lastActive > WEEK_MS) continue;
      entries.push({
        rank: 0,
        name: stats.name,
        winStreak: stats.winStreak,
        totalWins: stats.totalWins,
        totalLosses: stats.totalLosses,
      });
    }

    // Sort by current win streak (desc), then total wins (desc)
    entries.sort((a, b) => b.winStreak - a.winStreak || b.totalWins - a.totalWins);

    // Assign ranks and trim to top 12
    const top = entries.slice(0, LEADERBOARD_SIZE);
    top.forEach((e, i) => (e.rank = i + 1));

    return { type: "leaderboard", entries: top };
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

  // ─── NPC Management ──────────────────────────────────────────

  spawnNpc(): void {
    if (this.npc) return; // already active
    this.npc = new NpcBot();
    // Register NPC as a virtual agent (no real socket)
    console.log(`[NPC] Spawned: ${this.npc.name} (${this.npc.id})`);
    // Enqueue via matchmaker
    this.matchmaker?.enqueue(this.npc.id, this.npc.name);
    this.broadcastArenaStatus();
  }

  dismissNpc(): void {
    if (!this.npc) return;
    if (this.npcMatchId) {
      // NPC is in a match — flag it to leave after match ends
      this.npc.dismiss();
      console.log(`[NPC] Will leave after current match`);
    } else {
      // NPC is idle/queued — remove immediately
      this.matchmaker?.dequeue(this.npc.id);
      this.destroyNpc();
    }
    this.broadcastArenaStatus();
  }

  private destroyNpc(): void {
    if (!this.npc) return;
    this.npc.destroy();
    this.matchmaker?.dequeue(this.npc.id);
    console.log(`[NPC] Removed`);
    this.npc = null;
    this.npcMatchId = null;
    this.broadcastArenaStatus();
    // Re-spawn NPC when arena is empty (check after a delay to let agents leave)
    this.checkNpcRespawn();
  }

  /** Re-spawn NPC if no real agents remain */
  checkNpcRespawn(): void {
    setTimeout(() => {
      if (this.npc) return; // already respawned
      if (this.agentSockets.size === 0) {
        console.log(`[NPC] No agents connected, respawning`);
        this.spawnNpc();
      }
    }, 3000);
  }

  /** Track which match the NPC is in (called from createMatch) */
  setNpcMatch(matchId: string, fighterIndex: 0 | 1): void {
    this.npcMatchId = matchId;
    this.npcFighterIndex = fighterIndex;
  }

  get hasNpc(): boolean {
    return this.npc !== null;
  }

  get npcId(): string | null {
    return this.npc?.id ?? null;
  }

  broadcastArenaStatus(): void {
    const hasMatch = [...this.matches.values()].some((m) => !m.finished);
    this.broadcastToSpectators({
      type: "arena_status",
      hasNpc: this.npc !== null,
      hasMatch,
      queueSize: this.matchmaker?.getQueueSize() ?? 0,
    });
  }
}
