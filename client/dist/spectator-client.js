var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
function __accessProp(key) {
  return this[key];
}
var __toESMCache_node;
var __toESMCache_esm;
var __toESM = (mod, isNodeMode, target) => {
  var canCache = mod != null && typeof mod === "object";
  if (canCache) {
    var cache = isNodeMode ? __toESMCache_node ??= new WeakMap : __toESMCache_esm ??= new WeakMap;
    var cached = cache.get(mod);
    if (cached)
      return cached;
  }
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  for (let key of __getOwnPropNames(mod))
    if (!__hasOwnProp.call(to, key))
      __defProp(to, key, {
        get: __accessProp.bind(mod, key),
        enumerable: true
      });
  if (canCache)
    cache.set(mod, to);
  return to;
};
var __commonJS = (cb, mod) => () => (mod || cb((mod = { exports: {} }).exports, mod), mod.exports);
var __returnValue = (v) => v;
function __exportSetter(name, newValue) {
  this[name] = __returnValue.bind(null, newValue);
}
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: __exportSetter.bind(all, name)
    });
};
var __esm = (fn, res) => () => (fn && (res = fn(fn = 0)), res);

// client/spectator-client.ts
function connectSpectator(callbacks) {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const url = `${proto}//${location.host}/spectate`;
  let ws;
  let reconnectTimer;
  const connection = {
    send(msg) {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    }
  };
  function connect() {
    ws = new WebSocket(url);
    ws.onopen = () => {
      console.log("[Spectator] Connected");
      callbacks.onConnect();
    };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
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
export {
  connectSpectator
};
