import { Match } from "./match.ts";
import { TICK_MS } from "./protocol.ts";
import { NpcBot, NpcStationaryBot } from "./npc-bot.ts";
import { type Matchmaker, MAX_FIGHTS } from "./matchmaker.ts";
import { loadStats, saveStats, cleanOldDays, getToday } from "./leaderboard-db.ts";
import type { ServerWebSocket } from "bun";
import type { SpectatorMessage, LeaderboardEntry, NpcType } from "./protocol.ts";

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
const DEMO_WAIT_MS = 5 * 60 * 1000; // 5 minutes before demo mode activates

export class GameEngine {
  matches = new Map<string, Match>();
  agentSockets = new Map<string, AgentSocket>(); // agentId → socket
  spectators = new Set<SpectatorSocket>();
  matchmaker: Matchmaker | null = null; // set after construction
  lastStateSentAt = new Map<string, number>(); // agentId → timestamp (for anti-heuristic rate limiting)
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private agentStats = new Map<string, AgentStats>(); // agent name → stats
  private npc: NpcBot | NpcStationaryBot | null = null;
  private npcMatchId: string | null = null;
  private npcFighterIndex: 0 | 1 = 0;
  npcType: NpcType = "stationary";

  // Demo mode state
  private npc2: NpcBot | null = null;
  private npc2MatchId: string | null = null;
  private npc2FighterIndex: 0 | 1 = 1;
  private demoTimer: ReturnType<typeof setTimeout> | null = null;
  private demoMode = false;

  start(): void {
    if (this.tickInterval) return;

    // Load persisted stats for today, clean old days
    const today = getToday();
    this.agentStats = loadStats(today);
    cleanOldDays(today);
    console.log(`[Leaderboard] Loaded ${this.agentStats.size} agents for ${today}`);

    this.tickInterval = setInterval(() => this.tick(), TICK_MS);
    console.log(`Game engine started (${TICK_MS}ms ticks)`);
    // Auto-spawn NPC so the arena is never empty
    this.spawnNpc();
    // Start demo timer (will fire if no agents connect within 5 min)
    this.startDemoTimer();
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

      // Record stats (skip demo fights — don't pollute leaderboard)
      const npcId = this.npc?.id;
      const npc2Id = this.npc2?.id;
      const isDemoFight = (agent0Id === npcId || agent0Id === npc2Id) &&
                          (agent1Id === npcId || agent1Id === npc2Id);
      if (!isDemoFight) {
        this.recordMatchResult(name0, name1, endMsg.winner);
      }

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
            // Re-queue NPC for next match (delayed to match agent rematch delay)
            const npcRef = this.npc;
            setTimeout(() => {
              if (npcRef && !npcRef.isDismissed) {
                this.matchmaker?.enqueue(npcRef.id, npcRef.name);
              }
            }, 5000);
          }
        }
      }

      // Handle NPC2 (demo mode) match end
      if (this.npc2MatchId === id) {
        this.npc2MatchId = null;
        if (this.npc2) {
          if (this.npc2.isDismissed) {
            this.destroyNpc2();
          } else if (this.demoMode) {
            // Re-queue npc2 for continuous demo fights
            const npc2Ref = this.npc2;
            setTimeout(() => {
              if (npc2Ref && !npc2Ref.isDismissed && this.demoMode) {
                this.matchmaker?.enqueue(npc2Ref.id, npc2Ref.name);
              }
            }, 5000);
          }
        }
      }

      // Auto re-queue or kick agents via matchmaker (skip NPCs — handled above)
      if (this.matchmaker) {
        const npcId = this.npc?.id;
        const npc2Id = this.npc2?.id;
        const isNpc0 = agent0Id === npcId || agent0Id === npc2Id;
        const isNpc1 = agent1Id === npcId || agent1Id === npc2Id;

        if (!isNpc0 && !isNpc1) {
          this.matchmaker.onMatchEnd(agent0Id, name0, agent1Id, name1);
        } else if (isNpc0 && isNpc1) {
          // Both NPCs — demo match, no real agents to handle
        } else {
          // Only handle the non-NPC agent
          const realId = isNpc0 ? agent1Id : agent0Id;
          const realName = isNpc0 ? name1 : name0;
          this.matchmaker.onSingleAgentMatchEnd(realId, realName);
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
    // Track NPC2 (demo mode) match
    if (this.npc2) {
      if (agent0Id === this.npc2.id) { this.npc2MatchId = id; this.npc2FighterIndex = 0; }
      else if (agent1Id === this.npc2.id) { this.npc2MatchId = id; this.npc2FighterIndex = 1; }
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
        const npcState = match.getAgentState(this.npcFighterIndex);
        this.broadcastToSpectators({
          type: "agent_msg",
          fighter: this.npcFighterIndex,
          name: match.fighters[this.npcFighterIndex].name,
          direction: "out",
          msg: npcState,
        });

        this.npc.onTick(match, this.npcFighterIndex);

        const npcAction = match.fighters[this.npcFighterIndex].pendingAction;
        if (npcAction) {
          this.broadcastToSpectators({
            type: "agent_msg",
            fighter: this.npcFighterIndex,
            name: match.fighters[this.npcFighterIndex].name,
            direction: "in",
            msg: { type: "action", action: npcAction },
          });
        }
      }

      // NPC2 tick (demo mode)
      if (this.npc2 && this.npc2MatchId === matchId) {
        const npc2State = match.getAgentState(this.npc2FighterIndex);
        this.broadcastToSpectators({
          type: "agent_msg",
          fighter: this.npc2FighterIndex,
          name: match.fighters[this.npc2FighterIndex].name,
          direction: "out",
          msg: npc2State,
        });

        this.npc2.onTick(match, this.npc2FighterIndex);

        const npc2Action = match.fighters[this.npc2FighterIndex].pendingAction;
        if (npc2Action) {
          this.broadcastToSpectators({
            type: "agent_msg",
            fighter: this.npc2FighterIndex,
            name: match.fighters[this.npc2FighterIndex].name,
            direction: "in",
            msg: { type: "action", action: npc2Action },
          });
        }
      }

      // Send state to agents
      for (const [agentId, sock] of this.agentSockets) {
        if (sock.data.matchId === matchId && sock.data.fighterIndex !== undefined) {
          try {
            const agentState = match.getAgentState(sock.data.fighterIndex);
            sock.send(JSON.stringify(agentState));
            this.lastStateSentAt.set(agentId, Date.now());
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

    // Persist to SQLite
    const today = getToday();
    saveStats(name0, stats0, today);
    saveStats(name1, stats1, today);
  }

  getLeaderboardMessage(): SpectatorMessage {
    const entries: LeaderboardEntry[] = [];

    for (const stats of this.agentStats.values()) {
      // All in-memory stats are today's — no filtering needed
      entries.push({
        rank: 0,
        name: stats.name,
        winStreak: stats.winStreak,
        bestStreak: stats.bestStreak,
        totalWins: stats.totalWins,
        totalLosses: stats.totalLosses,
      });
    }

    // Sort by best streak (desc), then current streak (desc), then total wins (desc)
    entries.sort((a, b) => b.bestStreak - a.bestStreak || b.winStreak - a.winStreak || b.totalWins - a.totalWins);

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
    this.npc = this.npcType === "stationary" ? new NpcStationaryBot() : new NpcBot();
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
        this.startDemoTimer();
      }
    }, 3000);
  }

  // ─── Demo Mode ──────────────────────────────────────────────

  startDemoTimer(): void {
    this.cancelDemoTimer();
    console.log(`[Demo] Timer started — demo mode in ${DEMO_WAIT_MS / 1000}s if no agents connect`);
    this.demoTimer = setTimeout(() => {
      this.demoTimer = null;
      if (this.agentSockets.size === 0) {
        this.enterDemoMode();
      }
    }, DEMO_WAIT_MS);
  }

  private cancelDemoTimer(): void {
    if (this.demoTimer) {
      clearTimeout(this.demoTimer);
      this.demoTimer = null;
    }
  }

  private enterDemoMode(): void {
    if (this.demoMode) return;
    this.demoMode = true;
    console.log(`[Demo] Entering demo mode — spawning NPC Challenger`);

    // Spawn npc2 as a moving NPC with 50% skip rate for more action
    this.npc2 = new NpcBot("NPC Challenger", 0.5);
    console.log(`[Demo] Spawned: ${this.npc2.name} (${this.npc2.id})`);

    // Also make the primary NPC more active for demo fights
    // Dismiss and respawn with lower skip rate
    if (this.npc && !this.npcMatchId) {
      this.matchmaker?.dequeue(this.npc.id);
      this.npc.destroy();
      this.npc = new NpcBot("NPC Claw Fighter", 0.5);
      console.log(`[Demo] Respawned primary NPC with demo skip rate (${this.npc.id})`);
      this.matchmaker?.enqueue(this.npc.id, this.npc.name);
    }

    // Enqueue npc2 — matchmaker will pair them
    this.matchmaker?.enqueue(this.npc2.id, this.npc2.name);
    this.broadcastArenaStatus();
  }

  exitDemoMode(): void {
    if (!this.demoMode && !this.demoTimer) return;

    this.cancelDemoTimer();

    if (!this.demoMode) return; // only timer was pending, already cancelled

    console.log(`[Demo] Exiting demo mode — real agent joined`);
    this.demoMode = false;

    // Forfeit demo match if one is active
    if (this.npc2MatchId) {
      const match = this.matches.get(this.npc2MatchId);
      if (match && !match.finished) {
        console.log(`[Demo] Forfeiting demo match ${this.npc2MatchId}`);
        match.forfeit(this.npc2FighterIndex);
      }
    }

    // Dismiss npc2
    if (this.npc2) {
      this.matchmaker?.dequeue(this.npc2.id);
      this.destroyNpc2();
    }

    // Respawn primary NPC with normal skip rate if needed
    if (this.npc && !this.npcMatchId) {
      this.matchmaker?.dequeue(this.npc.id);
      this.npc.destroy();
      this.npc = this.npcType === "stationary" ? new NpcStationaryBot() : new NpcBot();
      console.log(`[Demo] Respawned primary NPC with normal skip rate (${this.npc.id})`);
      this.matchmaker?.enqueue(this.npc.id, this.npc.name);
    }

    this.broadcastArenaStatus();
  }

  private destroyNpc2(): void {
    if (!this.npc2) return;
    this.npc2.destroy();
    this.matchmaker?.dequeue(this.npc2.id);
    console.log(`[Demo] NPC2 removed`);
    this.npc2 = null;
    this.npc2MatchId = null;
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

  setNpcType(type: NpcType): void {
    this.npcType = type;
    console.log(`[NPC] Type set to: ${type}`);
    // Dismiss current NPC and respawn with new type
    if (this.npc) {
      this.dismissNpc();
      // Wait for dismiss to complete, then respawn
      const waitAndRespawn = () => {
        if (this.npc) {
          // Still waiting for current NPC to finish match
          setTimeout(waitAndRespawn, 1000);
        } else {
          this.spawnNpc();
        }
      };
      setTimeout(waitAndRespawn, 100);
    }
    this.broadcastArenaStatus();
  }

  broadcastArenaStatus(): void {
    const hasMatch = [...this.matches.values()].some((m) => !m.finished);
    this.broadcastToSpectators({
      type: "arena_status",
      hasNpc: this.npc !== null,
      hasMatch,
      queueSize: this.matchmaker?.getQueueSize() ?? 0,
      waitingFighter: this.matchmaker?.getFirstWaitingName() ?? null,
      npcType: this.npcType,
    });
  }
}
