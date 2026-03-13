export type MatchStateMsg = {
  type: "match_state";
  matchId: string;
  tick: number;
  fighters: [FighterState, FighterState];
  events: AnimationEvent[];
  timeRemaining: number;
};

export type MatchStartMsg = {
  type: "match_start";
  matchId: string;
  fighters: [string, string];
};

export type MatchEndMsg = {
  type: "match_end";
  matchId: string;
  winner: string | null;
  reason: "ko" | "timeout";
};

export type FighterState = {
  name: string;
  x: number;
  hp: number;
  cooldowns: Record<string, number>;
  lastAction: string | null;
};

export type AnimationEvent = {
  type: "hit" | "block" | "miss" | "ko" | "special";
  fighter: 0 | 1;
  text: string;
};

export type ArenaStatusMsg = {
  type: "arena_status";
  hasNpc: boolean;
  hasMatch: boolean;
  queueSize: number;
  waitingFighter: string | null;
  npcType: "normal" | "stationary";
};

export type AgentRelayMsg = {
  type: "agent_msg";
  fighter: 0 | 1;
  name: string;
  direction: "in" | "out";
  msg: any;
};

export type LeaderboardMsg = {
  type: "leaderboard";
  entries: Array<{
    rank: number;
    name: string;
    winStreak: number;
    totalWins: number;
    totalLosses: number;
  }>;
};

export type SpectatorMsg = MatchStateMsg | MatchStartMsg | MatchEndMsg | ArenaStatusMsg | AgentRelayMsg | LeaderboardMsg | { type: "match_list"; matches: any[] };

export type SpectatorCallbacks = {
  onMatchState: (msg: MatchStateMsg) => void;
  onMatchStart: (msg: MatchStartMsg) => void;
  onMatchEnd: (msg: MatchEndMsg) => void;
  onArenaStatus: (msg: ArenaStatusMsg) => void;
  onAgentMsg: (msg: AgentRelayMsg) => void;
  onLeaderboard: (msg: LeaderboardMsg) => void;
  onConnect: () => void;
  onDisconnect: () => void;
};

export interface SpectatorConnection {
  send: (msg: any) => void;
}

export function connectSpectator(callbacks: SpectatorCallbacks): SpectatorConnection {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const url = `${proto}//${location.host}/spectate`;

  let ws: WebSocket;
  let reconnectTimer: number;

  const connection: SpectatorConnection = {
    send(msg: any) {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    },
  };

  function connect() {
    ws = new WebSocket(url);

    ws.onopen = () => {
      console.log("[Spectator] Connected");
      callbacks.onConnect();
    };

    ws.onmessage = (ev) => {
      const msg: SpectatorMsg = JSON.parse(ev.data);
      switch (msg.type) {
        case "match_state":
          callbacks.onMatchState(msg);
          break;
        case "match_start":
          callbacks.onMatchStart(msg);
          break;
        case "match_end":
          callbacks.onMatchEnd(msg);
          break;
        case "arena_status":
          callbacks.onArenaStatus(msg);
          break;
        case "agent_msg":
          callbacks.onAgentMsg(msg);
          break;
        case "leaderboard":
          callbacks.onLeaderboard(msg);
          break;
      }
    };

    ws.onclose = () => {
      console.log("[Spectator] Disconnected, reconnecting...");
      callbacks.onDisconnect();
      reconnectTimer = window.setTimeout(connect, 2000);
    };
  }

  connect();
  return connection;
}
