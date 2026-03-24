---
name: deploy
description: Commit, bump cache version, build, push, and manually deploy to production.
disable-model-invocation: true
---

# Deploy Checklist

Run through these steps in order. Stop and report if any step fails.

## 1. Bump the cache version number

Find all cache-buster version numbers and increment them:

- `client/play-agent.ts` line with `const PLAY_AGENT_VERSION = "vN"` — increment N
- `client/play.html` line with `play-agent.js?v=N` — match the same N
- `client/arena.html` line with `renderer.js?v=N` — increment N (if client/renderer.ts was changed in this diff)

Only bump `renderer.js?v=` if renderer.ts was actually modified. Always bump play-agent version.

## 2. Build

```bash
bun run build
```

Verify the build succeeds with no errors.

## 3. Commit

Stage all relevant changed files (including the built `client/dist/` output) and create a commit. Follow the repo's existing commit message style (short, imperative). Include the version bump in the commit message.

## 4. Push

```bash
git push origin main
```

This triggers the GitHub Actions deploy workflow (`.github/workflows/deploy.yml`) which:
- SSHs to Hetzner CPX11 at `5.161.180.174`
- Runs `git pull && bun install && bun run build && systemctl restart clawfights`

## 5. Verify deployment

Wait 30 seconds for the deploy workflow to complete, then verify:

```bash
curl -s -o /dev/null -w "%{http_code}" https://tijuanaclawfights.com:3000/play
```

Should return 200. Report the result to the user.
