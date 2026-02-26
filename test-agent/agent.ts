const HOST = process.env.HOST || "localhost:3000";
const NAME = process.env.AGENT_NAME || `Bot-${Math.random().toString(36).slice(2, 6)}`;
const ACTIONS = ["punch", "kick", "block", "move_left", "move_right", "jump", "special"] as const;

console.log(`[${NAME}] Connecting to ws://${HOST}/agent`);

const ws = new WebSocket(`ws://${HOST}/agent`);

ws.onopen = () => {
  console.log(`[${NAME}] Connected, registering...`);
  ws.send(JSON.stringify({ type: "register", name: NAME, key: "test" }));
};

ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data as string);

  switch (msg.type) {
    case "registered":
      console.log(`[${NAME}] Registered with id: ${msg.id}`);
      ws.send(JSON.stringify({ type: "join_queue" }));
      console.log(`[${NAME}] Joined queue`);
      break;

    case "queued":
      console.log(`[${NAME}] Waiting for opponent...`);
      break;

    case "match_start":
      console.log(`[${NAME}] Match started vs ${msg.opponent}!`);
      break;

    case "game_state": {
      // Simple strategy: move toward opponent, attack when in range
      const { you, opponent, tick } = msg;
      const dist = Math.abs(you.x - opponent.x);
      let action: string;

      if (dist > 2) {
        // Move toward opponent
        action = you.x < opponent.x ? "move_right" : "move_left";
      } else {
        // In range — pick a combat action
        const combatActions: string[] = ["punch"];

        // Add kick if off cooldown
        if (!you.cooldowns.kick) combatActions.push("kick", "kick");
        // Add special if off cooldown
        if (!you.cooldowns.special) combatActions.push("special");
        // Sometimes block
        if (!you.cooldowns.block) combatActions.push("block");
        // Occasionally jump
        combatActions.push("jump");

        action = combatActions[Math.floor(Math.random() * combatActions.length)]!;
      }

      ws.send(JSON.stringify({ type: "action", tick, action }));

      if (tick % 10 === 0) {
        console.log(
          `[${NAME}] tick=${tick} hp=${you.hp} opp_hp=${opponent.hp} pos=${you.x} action=${action}`
        );
      }
      break;
    }

    case "match_end":
      console.log(`[${NAME}] Match ended! Winner: ${msg.winner ?? "DRAW"} (${msg.reason})`);
      // Re-queue
      setTimeout(() => {
        ws.send(JSON.stringify({ type: "join_queue" }));
        console.log(`[${NAME}] Re-queued`);
      }, 2000);
      break;

    case "error":
      console.error(`[${NAME}] Error: ${msg.message}`);
      break;
  }
};

ws.onclose = () => {
  console.log(`[${NAME}] Disconnected`);
  process.exit(0);
};
