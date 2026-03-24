---
name: deploy
description: Bump cache versions, build, commit, push, and manually deploy to production.
disable-model-invocation: true
---

# Deploy Checklist

Run through these steps in order. Stop and report if any step fails.

## 1. Bump the cache version number

Check `git diff --name-only` to see what changed, then bump accordingly:

- **Always bump**: `client/play-agent.ts` → `const PLAY_AGENT_VERSION = "vN"` (increment N)
- **Always bump**: `client/play.html` → `play-agent.js?v=N` (match the same N)
- **Only if `client/renderer.ts` changed**: `client/arena.html` → `renderer.js?v=N` (increment N)

## 2. Build

```bash
export PATH="$HOME/.bun/bin:$PATH" && bun run build
```

Verify the build succeeds with no errors.

## 3. Commit

Stage all relevant changed files and create a commit. Follow the repo's existing commit message style (short, imperative). Include the version bump in the commit message.

Note: `client/dist/` is gitignored — the server rebuilds on deploy.

## 4. Push

```bash
git push origin main
```

## 5. Manual deploy

SSH to the production server and deploy:

```bash
ssh root@5.161.180.174 'cd /root/tijuanaClawFights && git pull && /root/.bun/bin/bun install && /root/.bun/bin/bun run build && systemctl restart clawfights'
```

This runs: git pull → bun install → bun run build → restart systemd service.

## 6. Verify deployment

After the deploy command completes, verify the site is up:

```bash
curl -s -o /dev/null -w "%{http_code}" https://tijuanaclawfights.com:3000/play
```

Should return 200. Report the result to the user.
