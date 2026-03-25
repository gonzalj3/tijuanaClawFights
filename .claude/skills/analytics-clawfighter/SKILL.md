---
name: analytics-clawfighter
description: Query play analytics from the production SQLite database via SSH.
---

# Play Analytics

Query the production analytics database on `5.161.180.174` via SSH.

## Database

- Path: `/root/tijuanaClawFights/data/analytics.db`
- Table: `events` (id, event, player_id, metadata JSON, created_at UTC)
- Events tracked: `fight_start`, `fight_end`, `coaching_given`
- Metadata fields vary by event:
  - `fight_start`: `mode` (ai|tournament|spar), `rung` (tournament only)
  - `fight_end`: `mode`, `result` (win|loss|draw), `opponent` (ai only), `rung` (tournament only)
  - `coaching_given`: `source` (preset|custom)

## Queries to run

Run ALL of these via a single SSH command and present the results in a clear summary:

```bash
ssh root@5.161.180.174 'sqlite3 -header -column /root/tijuanaClawFights/data/analytics.db "
-- Overall totals
SELECT \"=== ALL TIME ===\";
SELECT event, count(*) as count FROM events GROUP BY event;

-- Today
SELECT \"=== TODAY ===\";
SELECT event, count(*) as count FROM events WHERE created_at >= datetime(\"now\", \"-1 day\") GROUP BY event;

-- Last 7 days
SELECT \"=== LAST 7 DAYS ===\";
SELECT event, count(*) as count FROM events WHERE created_at >= datetime(\"now\", \"-7 days\") GROUP BY event;

-- Fights by mode
SELECT \"=== FIGHTS BY MODE ===\";
SELECT json_extract(metadata, \"$.mode\") as mode, event, count(*) as count FROM events WHERE event IN (\"fight_start\", \"fight_end\") GROUP BY mode, event;

-- Win/loss/draw breakdown
SELECT \"=== FIGHT RESULTS ===\";
SELECT json_extract(metadata, \"$.mode\") as mode, json_extract(metadata, \"$.result\") as result, count(*) as count FROM events WHERE event = \"fight_end\" GROUP BY mode, result;

-- Coaching preset vs custom
SELECT \"=== COACHING ===\";
SELECT json_extract(metadata, \"$.source\") as source, count(*) as count FROM events WHERE event = \"coaching_given\" GROUP BY source;

-- Unique players
SELECT \"=== UNIQUE PLAYERS ===\";
SELECT count(DISTINCT player_id) as unique_players FROM events;

-- Completion rate (fight_end / fight_start)
SELECT \"=== COMPLETION RATE ===\";
SELECT
  (SELECT count(*) FROM events WHERE event = \"fight_start\") as starts,
  (SELECT count(*) FROM events WHERE event = \"fight_end\") as completions,
  ROUND(CAST((SELECT count(*) FROM events WHERE event = \"fight_end\") AS REAL) / MAX((SELECT count(*) FROM events WHERE event = \"fight_start\"), 1) * 100, 1) as completion_pct;

-- Last 10 events (recent activity)
SELECT \"=== RECENT ACTIVITY (last 10) ===\";
SELECT created_at, event, player_id, metadata FROM events ORDER BY id DESC LIMIT 10;
"'
```

## Presenting results

After running the query, summarize the data clearly:
- Lead with the key numbers: total fights, unique players, completion rate
- Break down by mode (ai vs tournament vs spar)
- Note coaching engagement (how many fights led to coaching)
- Call out any interesting patterns (e.g., tournament drop-off at specific rungs)
- If there's no data yet, say so — the analytics were just deployed
