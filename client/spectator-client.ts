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

export type SpectatorMsg = MatchStateMsg | MatchStartMsg | MatchEndMsg | { type: "match_list"; matches: any[] };

export type SpectatorCallbacks = {
  onMatchState: (msg: MatchStateMsg) => void;
  onMatchStart: (msg: MatchStartMsg) => void;
  onMatchEnd: (msg: MatchEndMsg) => void;
  onConnect: () => void;
  onDisconnect: () => void;
};

export function connectSpectator(callbacks: SpectatorCallbacks): void {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const url = `${proto}//${location.host}/spectate`;

  let ws: WebSocket;
  let reconnectTimer: number;

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
      }
    };

    ws.onclose = () => {
      console.log("[Spectator] Disconnected, reconnecting...");
      callbacks.onDisconnect();
      reconnectTimer = window.setTimeout(connect, 2000);
    };
  }

  connect();
}
