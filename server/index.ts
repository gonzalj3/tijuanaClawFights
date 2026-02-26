import { GameEngine } from "./game-engine.ts";
import { Matchmaker } from "./matchmaker.ts";
import { handleAgentMessage, handleAgentClose, type AgentData } from "./agent-connection.ts";
import { readFileSync } from "fs";
import { join } from "path";

const PORT = Number(process.env.PORT) || 3000;

const engine = new GameEngine();
const matchmaker = new Matchmaker(engine);

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

    return new Response("Not found", { status: 404 });
  },

  websocket: {
    open(ws) {
      const data = ws.data as any;
      if (data.type === "spectator") {
        engine.spectators.add(ws as any);
        ws.send(JSON.stringify(engine.getMatchList()));
        console.log("[Spectator] connected");
      }
    },

    message(ws, message) {
      const data = ws.data as any;
      const raw = typeof message === "string" ? message : new TextDecoder().decode(message);

      if (data.type === "agent") {
        handleAgentMessage(ws as any, raw, engine, matchmaker);
      }
      // Spectators don't send messages
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
