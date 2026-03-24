import { Match } from "./match.ts";
import { TICK_MS } from "./protocol.ts";
import { NpcBot, NpcStationaryBot } from "./npc-bot.ts";
import { createTournamentBot, TOURNAMENT_LADDER, type TournamentBot } from "./tournament-bots.ts";
import { type Matchmaker, MAX_FIGHTS } from "./matchmaker.ts";
import { loadStats, saveStats, cleanOldDays, getToday } from "./leaderboard-db.ts";
import { getPlayerIdForAgent } from "./agent-connection.ts";
import { getPhrase, type DuringFightEvent } from "./phrases.ts";
import { parseFighterMemory, updateMemoryAfterMatch, type MatchRecord } from "./fighter-memory.ts";
import type { PlayersDb } from "./players.ts";
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
  npcType: NpcType = "normal";
  private playersDb: PlayersDb | null = null;

  // Agent streak tracking (for progressive NPC difficulty)
  private agentStreaks = new Map<string, number>();

  // Tournament state
  private tournamentBots = new Map<string, { bot: TournamentBot; fighterIndex: 0 | 1 }>();
  private tournamentMatchCounter = 0;

  // Demo mode state
  private npc2: NpcBot | null = null;
  private npc2MatchId: string | null = null;
  private npc2FighterIndex: 0 | 1 = 1;
  private demoTimer: ReturnType<typeof setTimeout> | null = null;
  private demoMode = false;

  setPlayersDb(db: PlayersDb): void {
    this.playersDb = db;
  }

  setAgentStreak(agentId: string, streak: number): void {
    this.agentStreaks.set(agentId, streak);
  }

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

      // Record stats (skip demo fights and tournament matches — don't pollute leaderboard)
      const npcId = this.npc?.id;
      const npc2Id = this.npc2?.id;
      const isDemoFight = (agent0Id === npcId || agent0Id === npc2Id) &&
                          (agent1Id === npcId || agent1Id === npc2Id);
      const isTournament = this.tournamentBots.has(id);
      if (!isDemoFight && !isTournament) {
        this.recordMatchResult(name0, name1, endMsg.winner, agent0Id, agent1Id, m);
      }

      // Clean up tournament bot
      if (isTournament) {
        const tmData = this.tournamentBots.get(id);
        if (tmData) tmData.bot.destroy();
        this.tournamentBots.delete(id);
      }

      // Between-fight speech bubbles (phrase bank)
      this.broadcastPostMatchSpeech(m, id, name0, name1);

      // Notify agents
      const sock0 = this.agentSockets.get(agent0Id);
      const sock1 = this.agentSockets.get(agent1Id);
      const endPayload = JSON.stringify({ type: "match_end", ...endMsg });
      console.log(`[Match ${id}] END: winner="${endMsg.winner}" reason="${endMsg.reason}" f0="${name0}"(${m.fighters[0].hp}hp) f1="${name1}"(${m.fighters[1].hp}hp)`);
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
            // If a real agent is already waiting in queue, don't re-queue NPC —
            // let the two real agents fight each other instead.
            const realAgentsWaiting = this.matchmaker
              ? this.matchmaker.getQueueSize() > 0
              : false;
            if (realAgentsWaiting) {
              console.log(`[NPC] Stepping aside — real agent waiting in queue`);
            } else {
              // No one waiting — re-queue NPC for next match
              const npcRef = this.npc;
              setTimeout(() => {
                if (npcRef && !npcRef.isDismissed) {
                  this.matchmaker?.enqueue(npcRef.id, npcRef.name);
                }
              }, 5000);
            }
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

      // Auto re-queue or kick agents via matchmaker (skip NPCs and tournament — handled above)
      if (this.matchmaker && !isTournament) {
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

    // Track NPC match — scale difficulty based on opponent's streak
    if (this.npc) {
      if (agent0Id === this.npc.id || agent1Id === this.npc.id) {
        const npcIsAgent0 = agent0Id === this.npc.id;
        const realAgentId = npcIsAgent0 ? agent1Id : agent0Id;
        const streak = this.agentStreaks.get(realAgentId) ?? 0;

        if (streak > 0 && this.npc instanceof NpcBot) {
          // Respawn NPC with scaled skipRate for progressive difficulty
          const skipRate = Math.max(0.15, 0.80 - streak * 0.15);
          const suffixes = ["", " II", " III", " IV", " V", " VI", " VII", " VIII"];
          const npcName = `NPC Claw Fighter${suffixes[Math.min(streak, suffixes.length - 1)]}`;
          this.matchmaker?.dequeue(this.npc.id);
          this.npc.destroy();
          this.npc = new NpcBot(npcName, skipRate);
          console.log(`[NPC] Respawned as "${npcName}" (skipRate=${skipRate.toFixed(2)}) for streak ${streak}`);
          // Update the match fighter name to reflect the new NPC
          match.fighters[npcIsAgent0 ? 0 : 1].name = npcName;
        }

        this.setNpcMatch(id, npcIsAgent0 ? 0 : 1);
      }
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

  createTournamentMatch(agentId: string, agentName: string, rung: number): void {
    const bot = createTournamentBot(rung);
    const matchId = `tournament-${++this.tournamentMatchCounter}`;
    const ladder = TOURNAMENT_LADDER[rung];

    // Agent is always fighter 0, bot is fighter 1
    const match = this.createMatch(matchId, agentId, bot.id, agentName, bot.name);
    this.tournamentBots.set(matchId, { bot, fighterIndex: 1 });

    // Send match_start with tournament metadata to the agent
    const sock = this.agentSockets.get(agentId);
    if (sock) {
      sock.send(JSON.stringify({
        type: "match_start",
        matchId,
        opponent: bot.name,
        yourIndex: 0 as const,
        tournament: {
          rung: ladder.rung,
          title: ladder.title,
          opponentName: ladder.name,
        },
      }));
    }

    console.log(`[Tournament] Match ${matchId}: ${agentName} vs ${bot.name} (rung ${rung})`);
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

      // Tournament bot tick
      for (const [tmMatchId, tmData] of this.tournamentBots) {
        if (tmMatchId === matchId) {
          tmData.bot.onTick(match, tmData.fighterIndex);
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

      // Broadcast during-fight speech bubbles
      for (const speech of match.speechEvents) {
        const fighterName = match.fighters[speech.fighter].name;
        const opponentName = match.fighters[speech.fighter === 0 ? 1 : 0].name;
        const text = getPhrase(speech.event as DuringFightEvent, { opponent: opponentName });
        if (text) {
          this.broadcastToSpectators({
            type: "fighter_speech",
            matchId,
            fighter: speech.fighter,
            name: fighterName,
            text,
            event: speech.event,
          });
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

  private recordMatchResult(name0: string, name1: string, winner: string | null, agent0Id?: string, agent1Id?: string, match?: Match): void {
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

    // Persist to leaderboard SQLite
    const today = getToday();
    saveStats(name0, stats0, today);
    saveStats(name1, stats1, today);

    // Persist to players DB (Elo + persistent stats)
    if (this.playersDb && agent0Id && agent1Id) {
      const playerId0 = getPlayerIdForAgent(agent0Id);
      const playerId1 = getPlayerIdForAgent(agent1Id);
      if (playerId0 && playerId1) {
        const winnerId = winner === name0 ? playerId0 : winner === name1 ? playerId1 : null;
        try {
          this.playersDb.updateAfterMatch(playerId0, playerId1, winnerId);
        } catch (e) {
          console.warn("[Players] Failed to update match result:", e);
        }

        // Update fighter memory with match stats
        if (match) {
          try {
            const result0: "win" | "loss" | "draw" = winner === name0 ? "win" : winner === name1 ? "loss" : "draw";
            const result1: "win" | "loss" | "draw" = winner === name1 ? "win" : winner === name0 ? "loss" : "draw";

            const matchRecord0: MatchRecord = {
              opponentId: playerId1,
              opponentName: name1,
              result: result0,
              damageDealt: match.damageDealt[0],
              damageTaken: match.damageDealt[1],
              actionsUsed: match.actionCounts[0],
              myMinHp: match.minHp[0],
              ticksPlayed: match.tick,
            };
            const matchRecord1: MatchRecord = {
              opponentId: playerId0,
              opponentName: name0,
              result: result1,
              damageDealt: match.damageDealt[1],
              damageTaken: match.damageDealt[0],
              actionsUsed: match.actionCounts[1],
              myMinHp: match.minHp[1],
              ticksPlayed: match.tick,
            };

            const mem0 = parseFighterMemory(this.playersDb.getMemory(playerId0));
            const mem1 = parseFighterMemory(this.playersDb.getMemory(playerId1));
            this.playersDb.setMemory(playerId0, updateMemoryAfterMatch(mem0, matchRecord0));
            this.playersDb.setMemory(playerId1, updateMemoryAfterMatch(mem1, matchRecord1));
          } catch (e) {
            console.warn("[Memory] Failed to update fighter memory:", e);
          }
        }
      }
    }
  }

  private broadcastPostMatchSpeech(match: Match, matchId: string, name0: string, name1: string): void {
    const endMsg = match.getEndMessage();
    const winner = endMsg.winner;
    const isKo = endMsg.reason === "ko";

    // Determine event types for each fighter
    for (const idx of [0, 1] as const) {
      const name = match.fighters[idx].name;
      const opponentName = match.fighters[idx === 0 ? 1 : 0].name;
      const isWinner = winner === name;
      const isLoser = winner !== null && winner !== name;

      let event: string;
      if (isWinner && isKo) {
        event = "win_ko";
      } else if (isWinner) {
        event = "win_normal";
      } else if (isLoser) {
        event = "loss_normal";
      } else {
        continue; // draw — no speech for now
      }

      // Get signature move from match action counts
      let sigMove = "claw";
      const counts = match.actionCounts[idx];
      let maxCount = 0;
      for (const [action, count] of Object.entries(counts)) {
        if (count > maxCount) { maxCount = count; sigMove = action; }
      }

      const text = getPhrase(event as any, {
        opponent: opponentName,
        signature_move: sigMove,
      });

      if (text) {
        // Delay speech slightly so it appears after the match end animation
        setTimeout(() => {
          this.broadcastToSpectators({
            type: "fighter_speech",
            matchId,
            fighter: idx,
            name,
            text,
            event,
          });
        }, 1000);
      }
    }
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

  /** Re-spawn NPC if no real agents remain, and restart demo timer */
  checkNpcRespawn(): void {
    setTimeout(() => {
      if (this.agentSockets.size === 0) {
        if (!this.npc) {
          console.log(`[NPC] No agents connected, respawning`);
          this.spawnNpc();
        }
        // Always restart demo timer when arena has no real agents
        if (!this.demoMode) {
          this.startDemoTimer();
        }
      } else if (this.npc && !this.npcMatchId && !this.npc.isDismissed) {
        // NPC exists but isn't queued or in a match (stepped aside earlier).
        // If an agent is alone in queue with no one to fight, re-queue the NPC.
        const queueSize = this.matchmaker?.getQueueSize() ?? 0;
        const activeMatches = [...this.matches.values()].filter(m => !m.finished).length;
        if (queueSize === 1 && activeMatches === 0) {
          const npcInQueue = this.matchmaker!.isInQueue(this.npc.id);
          if (!npcInQueue) {
            console.log(`[NPC] Re-queuing — lone agent waiting with no match`);
            this.matchmaker?.enqueue(this.npc.id, this.npc.name);
          }
        }
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
