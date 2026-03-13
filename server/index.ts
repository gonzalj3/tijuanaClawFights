import { GameEngine } from "./game-engine.ts";
import { Matchmaker } from "./matchmaker.ts";
import { handleAgentMessage, handleAgentClose, type AgentData } from "./agent-connection.ts";
import type { SpectatorControlMessage } from "./protocol.ts";
import { readFileSync } from "fs";
import { join } from "path";

const PORT = Number(process.env.PORT) || 3000;

const engine = new GameEngine();
const matchmaker = new Matchmaker(engine);
engine.matchmaker = matchmaker;

// Serve static client files
function serveStatic(path: string): Response {
  const clientDir = join(import.meta.dir, "..", "client");
  const filePath = join(clientDir, path);

  try {
    const file = Bun.file(filePath);
    const ext = path.split(".").pop() ?? "";
    const contentType: Record<string, string> = {
      html: "text/html",
      css: "text/css",
      js: "application/javascript",
      ts: "application/javascript",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      webp: "image/webp",
    };
    return new Response(file, {
      headers: { "Content-Type": contentType[ext] ?? "application/octet-stream" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

const server = Bun.serve({
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url);

    // WebSocket upgrade
    if (url.pathname === "/agent") {
      const ok = server.upgrade(req, {
        data: { agentId: "", type: "agent" } as any,
      });
      return ok ? undefined : new Response("Upgrade failed", { status: 500 });
    }

    if (url.pathname === "/spectate") {
      const ok = server.upgrade(req, {
        data: { spectator: true, type: "spectator" } as any,
      });
      return ok ? undefined : new Response("Upgrade failed", { status: 500 });
    }

    // REST API
    if (url.pathname === "/api/leaderboard") {
      const msg = engine.getLeaderboardMessage() as any;
      return Response.json(msg.entries ?? []);
    }
    if (url.pathname === "/api/matches") {
      const msg = engine.getMatchList() as any;
      return Response.json(msg.matches ?? []);
    }

    // Static files
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return serveStatic("index.html");
    }
    if (url.pathname.startsWith("/dist/")) {
      return serveStatic(url.pathname.slice(1));
    }
    if (url.pathname.endsWith(".css")) {
      return serveStatic(url.pathname.slice(1));
    }
    if (url.pathname.startsWith("/assets/")) {
      return serveStatic(url.pathname.slice(1));
    }

    return new Response("Not found", { status: 404 });
  },

  websocket: {
    // Auto-close sockets that don't respond to pings within 30s
    idleTimeout: 30,
    sendPings: true,

    open(ws) {
      const data = ws.data as any;
      if (data.type === "spectator") {
        engine.spectators.add(ws as any);
        ws.send(JSON.stringify(engine.getMatchList()));
        ws.send(JSON.stringify(engine.getLeaderboardMessage()));
        // Send current arena status
        const hasMatch = [...engine.matches.values()].some((m) => !m.finished);
        ws.send(JSON.stringify({
          type: "arena_status",
          hasNpc: engine.hasNpc,
          hasMatch,
          queueSize: matchmaker.getQueueSize(),
          waitingFighter: matchmaker.getFirstWaitingName(),
          npcType: engine.npcType,
        }));
        console.log("[Spectator] connected");
      }
    },

    message(ws, message) {
      const data = ws.data as any;
      const raw = typeof message === "string" ? message : new TextDecoder().decode(message);

      if (data.type === "agent") {
        handleAgentMessage(ws as any, raw, engine, matchmaker);
      } else if (data.type === "spectator") {
        // Handle spectator control messages
        try {
          const msg: SpectatorControlMessage = JSON.parse(raw);
          if (msg.type === "spawn_npc") {
            engine.spawnNpc();
          } else if (msg.type === "dismiss_npc") {
            engine.dismissNpc();
          } else if (msg.type === "set_npc_type") {
            engine.setNpcType(msg.npcType);
          }
        } catch {}
      }
    },

    close(ws) {
      const data = ws.data as any;
      if (data.type === "spectator") {
        engine.spectators.delete(ws as any);
        console.log("[Spectator] disconnected");
      } else if (data.type === "agent") {
        handleAgentClose(ws as any, engine, matchmaker);
      }
    },
  },
});

engine.start();
console.log(`🥊 Tijuana Claw Fights server running on http://localhost:${PORT}`);
