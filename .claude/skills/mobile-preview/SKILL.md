# /mobile-preview

Quick mobile viewport screenshot of the local dev site using the gstack browse binary.

## Usage

```
/mobile-preview          # Screenshot /play at 375px (iPhone)
/mobile-preview /arena   # Screenshot /arena instead
/mobile-preview all      # Screenshot /, /play, and /arena
```

## Instructions

1. **Check dev server is running:**
   ```bash
   curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ || echo "NOT_RUNNING"
   ```
   If not running, tell the user: "Start the dev server first: `bun run dev`"

2. **Set the browse binary path:**
   ```bash
   B="$HOME/.claude/skills/gstack/browse/dist/browse"
   ```

3. **Take mobile screenshot (375x812 iPhone viewport):**
   ```bash
   $B navigate http://localhost:3000/play --viewport 375x812
   $B screenshot /tmp/mobile-play.png
   ```

   For `/arena`:
   ```bash
   $B navigate http://localhost:3000/arena --viewport 375x812
   $B screenshot /tmp/mobile-arena.png
   ```

   For `/` (home):
   ```bash
   $B navigate http://localhost:3000/ --viewport 375x812
   $B screenshot /tmp/mobile-home.png
   ```

4. **Show the screenshot** to the user using the Read tool on the PNG file.

5. **Optional multi-viewport comparison** (if user asks for "responsive" or "all sizes"):
   Take screenshots at 375px, 768px, and 1280px widths for side-by-side review:
   ```bash
   for W in 375 768 1280; do
     $B navigate http://localhost:3000/play --viewport ${W}x900
     $B screenshot /tmp/mobile-play-${W}.png
   done
   ```

## Notes
- Requires gstack browse binary installed at `~/.claude/skills/gstack/browse/dist/browse`
- No new dependencies — reuses existing gstack infrastructure
- Screenshots saved to `/tmp/` (ephemeral, cleaned on reboot)
