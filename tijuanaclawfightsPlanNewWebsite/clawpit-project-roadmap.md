# Clawpit — Project Roadmap & Feature Specifications

**Last updated:** March 18, 2026
**Domains:** clawpit.com (umbrella brand), tijuanaclawfights.com (original arena), arenaclawfights.com (redirect/reserve)
**iOS App Name:** ClawFighter
**Stack:** Swift 6.2, SwiftUI with @Observable, iOS 17+, xcodegen, mlx-swift-lm, URLSession WebSocket

---

## Table of Contents

1. [Brand Identity & Naming](#1-brand-identity--naming)
2. [Creature Roster](#2-creature-roster)
3. [Arena System & Multi-Location Expansion](#3-arena-system--multi-location-expansion)
4. [Fighter Card System (Feature Layer 1)](#4-fighter-card-system)
5. [Pixel Sprite Paper Doll — Cosmetic System](#5-pixel-sprite-paper-doll--cosmetic-system)
6. [Voice Coaching During Fights (Feature Layer 2)](#6-voice-coaching-during-fights)
7. [Training Mode & Leveling System (Feature Layer 3)](#7-training-mode--leveling-system)
8. [Social & Community Features (Feature Layer 4)](#8-social--community-features)
9. [Arena Experience Enhancements (Feature Layer 5)](#9-arena-experience-enhancements)
10. [iOS App UI Redesign — Pocket Arena](#10-ios-app-ui-redesign--pocket-arena)
11. [Website Redesign — clawpit.com](#11-website-redesign--clawpitcom)
12. [Website Technical Changes](#12-website-technical-changes)
13. [Marketing & Growth Strategy](#13-marketing--growth-strategy)
14. [Prioritized Build Order](#14-prioritized-build-order)
15. [Creature Generativity — The Soul of the Product](#15-creature-generativity--the-soul-of-the-product)
16. [Design Principles](#16-design-principles)

---

## 1. Brand Identity & Naming

### The Core Reframe

The user is a **coach**, not an engineer. Every piece of UI language, every feature name, and every marketing message should speak from this framing.

| Engineer Language (avoid) | Coach Language (use) |
|---|---|
| Choose your model | Choose your fighter's brain |
| Edit the system prompt | Train your fighter |
| Prompt evolution | Your fighter is learning |
| Generation 76 | Training Session 76 |
| WebSocket connection | Enter the arena |
| Model quantization | Brain size |

### Brand Hierarchy

- **Clawpit** — The universe. The umbrella brand. "Welcome to the Clawpit."
- **ClawFighter** — The iOS app. The player identity. "You are a ClawFighter."
- **Tijuana Claw Fights** — The original arena. The first and most legendary pit.
- **[Location] [Creature] Fights** — Future arenas (Alaska Maul Fights, Tokyo Ink Fights, etc.)

### The Pitch

> "It's like boxing coach with animals meets AI. You train a fighter that runs on your phone's own brain — no cloud, no API key, just a tiny AI model that makes every combat decision. You coach it by writing its strategy and even talking to it during fights. Watch it learn. Watch it climb the leaderboard. Watch it become something only you could have built."

This pitch works for gamers ("Creature fights meets AI"), for AI-curious people ("runs on your phone's own brain"), and for the building-in-public crowd ("something only you could have built").

---

## 2. Creature Roster

Five base creatures. Each has a distinct silhouette at small pixel sizes, a natural fighting style personality, a regional arena association, and a native emoji for use throughout the UI.

### The Five Fighters

#### 🦞 The Claw (Lobster/Crab)
- **Archetype:** Balanced brawler
- **Fighting personality:** Good at blocking (hard shell) and punching (pincers). Well-rounded. No major weaknesses.
- **Arena:** Tijuana Claw Fights (Mexico — underground cantina, neon signs, gritty)
- **Emoji:** 🦞 or 🦀
- **Teaches:** Fundamentals of the combat system
- **Notes:** The OG mascot. Every player starts with The Claw. It's the common bond across the community.

#### 🐙 The Ink (Octopus)
- **Archetype:** Combo specialist
- **Fighting personality:** Eight arms = lots of attack options. Favors multi-hit combos and special moves. Aggressive playstyle.
- **Arena:** Tokyo Ink Fights (Japan — neon-soaked, cyberpunk fish market, fast-paced)
- **Emoji:** 🐙
- **Teaches:** Special moves, cooldown management, combo timing
- **Notes:** Octopuses are genuinely intelligent animals — good thematic fit for the "AI brain inside" concept. Ink cloud could be a visual effect for blocking.

#### 🦎 The Spark (Lizard/Gecko)
- **Archetype:** Speed / evasion
- **Fighting personality:** Small, fast, darting. Hit-and-run tactics. Movement-heavy.
- **Arena:** Outback Spark Fights (Australia — desert heat, red sand, sun-bleached)
- **Emoji:** 🦎
- **Teaches:** Movement mode, positioning, spacing
- **Notes:** Geckos drop their tails to escape — could be a fun "last stand" visual when HP gets low. Naturally teaches users about the Move mode toggle.

#### 🐻 The Maul (Bear)
- **Archetype:** Heavy hitter
- **Fighting personality:** Slow but devastating. Fewer actions per sequence but each one hits hard. Patience-based.
- **Arena:** Alaska Maul Fights (USA — frozen wilderness, timber lodge, brutal cold)
- **Emoji:** 🐻
- **Teaches:** Patience, timing, waiting for the right moment to strike
- **Notes:** Naturally maps to larger LLM models (2B) that take longer to think but produce better decisions. Standing upright in fighting stance. Wide, bulky silhouette reads as "power" even at 32 pixels.

#### 🦅 The Talon (Eagle/Hawk)
- **Archetype:** Tactical range
- **Fighting personality:** Positioning-focused. Likes to maintain distance and strike when the opponent is recovering. Strategic.
- **Arena:** Alpine Talon Fights (Switzerland/Alps — mountain peaks, thin air, elevation)
- **Emoji:** 🦅
- **Teaches:** Spacing, strategy, reading opponent patterns
- **Notes:** Sharp angular silhouette contrasts with the rounder shapes of the other four. Eagle's excellent "vision" ties thematically to better arena state awareness.

### Creature Design Notes
- All five are real animals, not fantasy creatures. Keeps art direction grounded, makes emojis work without explanation, avoids "generic fantasy creature" trap.
- Each creature should be identifiable at 32x32 pixel resolution by silhouette alone.
- Emojis appear throughout the app: tab bar, leaderboard names, action log, shareable fight cards, X.com posts.
- Creature choice creates tribal identity: "I'm a Claw main" vs "I run The Maul."

---

## 3. Arena System & Multi-Location Expansion

### Concept

Each arena is a themed location in the world with its own pixel-art background, atmosphere, leaderboard, and eventually unique rule modifiers or environmental hazards. Arenas are the content engine — each new arena launch is a content event.

### Architecture

One server, one codebase, arena selection via parameter.

- **Phase 1 (now):** Single arena (Tijuana). The iOS app setup screen shows an "Arena" row displaying "🦞 Tijuana" with a disclosure chevron. Tapping opens a list with one active arena and four locked ones showing the creature emoji, name, and "Coming Soon." Zero backend work, creates anticipation.
- **Phase 2 (when users exist):** Subdomains under clawpit.com. `tijuana.clawpit.com`, `alaska.clawpit.com`, `tokyo.clawpit.com`. Same server, theme parameter changes arena background art, leaderboard styling, ambient vibe. One domain registration, subdomains are free.
- **Phase 3 (real feature):** Separate WebSocket rooms per arena on the same server. Each arena has its own matchmaking queue, leaderboard, and potentially rule modifiers.

### Arena Themes

| Arena | Location | Creature | Visual Vibe | Potential Rule Modifier |
|---|---|---|---|---|
| Tijuana Claw Fights | Mexico | 🦞 The Claw | Underground cantina, neon signs, gritty dark | None (the original, standard rules) |
| Alaska Maul Fights | Alaska, USA | 🐻 The Maul | Frozen wilderness, timber lodge, aurora borealis | "Frostbite" — idle fighters take damage |
| Tokyo Ink Fights | Japan | 🐙 The Ink | Neon cyberpunk, fish market, rain | "Overdrive" — faster tick rate |
| Outback Spark Fights | Australia | 🦎 The Spark | Desert, red sand, heat shimmer | "Mirage" — opponent position has noise/jitter |
| Alpine Talon Fights | Switzerland | 🦅 The Talon | Mountain peaks, snow, thin air | "Altitude" — movement costs HP |

### Server-Side Implementation Notes

- Add `?arena=tijuana` parameter to the arena/spectator page now, even though it's the only value. When `?arena=alaska` is added later, the plumbing exists.
- Add `?client=mobile` parameter that strips site header, HTML leaderboard, NPC state logs, and surrounding chrome for the iOS WKWebView. Server-side stripping is cleaner than CSS injection and won't break on site updates.
- Your fighter can compete in any arena regardless of creature type. The "home arena" for each creature creates thematic identity but isn't a gameplay restriction.

---

## 4. Fighter Card System

### Purpose

Give the fighter a persistent visual identity that appears throughout the app and is shareable externally. Without a Fighter Card, there's nothing to screenshot, nothing to share, nothing to bond with.

### Components

- **Pixel-art creature avatar** — the chosen base creature with equipped cosmetic items
- **Name** — user-chosen, displayed prominently
- **Title** — auto-generated based on play patterns:
  - "Punch Spammer" (>70% punch actions)
  - "Block Breaker" (high kick/special usage against blocking opponents)
  - "Evolution Master" (>50 training generations)
  - "Speed Demon" (high move action frequency)
  - "Iron Wall" (low damage taken per match)
  - "Coach's Pet" (high voice coaching usage)
  - "Unbroken" (10+ win streak)
- **Win/loss record** — displayed as card stats
- **Current model** — shown as a small badge icon (like a Pokémon type icon)
- **Current streak** — with 🔥 emoji
- **Level** — derived from AI skill progression (see Training Mode section)

### Where the Card Appears

- **Setup screen:** Your fighter greets you at the top, above the connection settings
- **Fight screen:** Fighter card sits above the arena as your identity
- **Leaderboard:** Your fighter's avatar and emoji appear next to your rank
- **Evolution screen:** Fighter "reacts" to training results (happy face on win streak, determined face on losses)
- **Share sheet:** One-tap generates a shareable image card for X.com / social media
- **Website:** Public fighter profile page at `clawpit.com/fighter/[name]`

### Shareable Image Card Format

A generated PNG image showing:
- Fighter avatar (large, centered)
- Fighter name and title
- Creature type emoji
- Win/loss record
- Current streak
- Arena name
- "Train yours at clawpit.com" footer CTA

This image is the primary viral mechanic. Every share to X.com is free marketing.

---

## 5. Pixel Sprite Paper Doll — Cosmetic System

### Art Approach

2D pixel art, layered PNG system. Base creature sprite at 64x64 (or 32x32 for arena view). Cosmetic items are overlay layers composited on top.

### Item Slots

- **Head:** Hats, crowns, bandanas, helmets, horns
- **Body:** Armor plates, capes, scarves, vests
- **Hands/Claws:** Gloves, wraps, weapon attachments
- **Trail/Aura:** Flame trail, ice crystals, lightning sparks, shadow wisps

### Unlock Mechanism (Achievement-Based, Not Purchased)

All cosmetics are earned through gameplay milestones:

- 🔥 **Flame Crown** — Achieve a 10-win streak
- 🧊 **Ice Gauntlets** — Win 5 fights in the Alaska arena
- ⚡ **Lightning Trail** — Use The Spark to win 20 fights
- 🎖 **Champion's Cape** — Reach #1 on any leaderboard
- 🧠 **Scholar's Cap** — Complete 10 training sessions
- 🎙 **Coach's Whistle** — Use voice coaching in 25 fights
- 🌟 **Golden Shell** — Evolve strategy prompt through 50 generations
- 👑 **Victory Crown** — Win 100 total matches

### Future: AI-Generated Sprites

Allow users to describe their ideal fighter in natural language and generate a unique sprite via Retro Diffusion or similar. This is a premium/experimental feature that secretly teaches prompt engineering through character design. "A scrappy red crab with boxing gloves and a bandana" → unique sprite. The user just wrote a prompt and evaluated the output — that's the core AI skill loop.

---

## 6. Voice Coaching During Fights

### Concept

The user speaks to their fighter during a live match. Speech is converted to text and injected into the LLM's decision context. The fighter's behavior shifts based on coaching. This is the most original feature and the strongest differentiator.

### Why It Matters

- Users literally learn what an LLM can and can't understand from natural language
- They discover that phrasing matters — "be aggressive" produces different results than "use punch every tick when in range"
- They're experiencing prompt engineering in real-time under pressure
- The feedback loop is instant: say something, see whether the fighter does what you meant

### Implementation Tiers

#### Tier 1 (MVP)
- Microphone button on the fight screen
- Tap to speak (or press-and-hold)
- Apple Speech framework converts speech to text
- Text is shown in the action log as `[COACH: "close the gap!"]`
- Text is prepended to the next LLM decision prompt as `[COACH SAYS: ...]`
- No environment variables yet — just voice-to-prompt injection

#### Tier 2
- **Coach Effectiveness Score** after each fight
- Shows how often the fighter followed coaching directives
- Shows whether coached moments led to hits or damage avoided
- Provides feedback on coaching quality — the user improves as a coach

#### Tier 3
- **Environment variables** added to the arena
- Arena sends additional state (hazard positions, power-up spawns) that the LLM receives but might not prioritize correctly without coaching
- The human's job is to prioritize: "Grab the power-up on the left!" or "Avoid the damage zone!"
- This is where the game gets genuinely strategic — human observation + AI execution

### Technical Notes
- Use Apple's `Speech` framework (`SFSpeechRecognizer`) for on-device speech-to-text
- Keep coaching text brief in the LLM context to avoid displacing strategy prompt tokens
- Format: `[COACH DIRECTIVE (this tick only): "<transcribed text>"]`
- Clear the directive after one tick to prevent stale instructions from persisting

---

## 7. Training Mode & Leveling System

### Concept

Between fights, the user enters Training Mode — a series of short, focused challenges that teach both the fighter and the user. The user's skill with AI IS the fighter's level.

### Training Types

#### Reaction Drills
- Screen shows a sequence of opponent actions
- User writes (or speaks) the correct counter
- App evaluates against optimal counter from combat rules
- Teaches the user how the combat system works

#### Prompt Workshops
- App presents the current strategy prompt and a specific scenario that went wrong
- Example: "Your fighter punched when the opponent was blocking"
- User rewrites the relevant rule
- App runs a quick simulation to test whether the rewrite improves performance
- This is hands-on prompt engineering disguised as training

#### Sparring
- Fight against an NPC with specific constraints
- Only kicks allowed, movement only, block timing practice
- User watches behavior and adjusts strategy between rounds

### Leveling System

- **Level 1:** New user, default strategy prompt, basic understanding
- **Level 2-5:** Completed reaction drills, understands combat mechanics
- **Level 5-10:** Successfully modified strategy prompts, improved scores
- **Level 10-15:** Tried multiple models, understands speed vs quality tradeoffs
- **Level 15-20:** Consistent win rates, optimized prompts, uses voice coaching effectively
- **Level 20+:** Strategy sharing, tournament ready, community contributor

Level is displayed on the Fighter Card. Higher levels unlock:
- Access to ranked matches
- Harder NPC opponents
- Advanced arenas (when available)
- Exclusive cosmetic items

### What the User Actually Learned

Without taking a class or reading a tutorial:
- How LLMs process instructions (prompt engineering)
- How to read and interpret data logs (data literacy)
- How iterative testing works (scientific method applied to AI)
- What model size/quantization tradeoffs mean (tried different models, saw speed vs quality)
- How autonomous agents make decisions (watched the action log)

---

## 8. Social & Community Features

### Fighter Profiles Are Shareable
- Generate a shareable image card (trading card format) showing fighter avatar, stats, title, model, record
- One-tap share to X/Twitter/Instagram
- Primary viral mechanic — every shared card is free marketing
- Link goes to public profile page at `clawpit.com/fighter/[name]`

### Rivalry System
- Track repeated matchups against the same opponent
- "You've fought NPC Punching Bag 47 times. Record: 41-6. Rival rank: Nemesis."
- Rival tiers: Newcomer → Familiar → Rival → Nemesis → Archenemy
- Creates narrative without requiring written story content

### Strategy Sharing (Trading Card Mechanic)
- Export strategy prompt as a "move set" — a shareable file or link
- Other users can import it, try it, see if it works
- This is Magic: The Gathering "deck sharing" for AI prompts
- Examining someone else's strategy teaches prompt construction
- Could display as a "Strategy Card" with the prompt text, win rate, and creator name

### Weekly Challenges
- "This week: win 5 fights using only the 0.8B model" (teaches model tradeoffs)
- "This week: beat NPC Challenger without using 'punch' in your strategy" (creative constraints)
- "This week: achieve 150+ score with a strategy under 100 words" (prompt efficiency)
- "This week: win 3 fights using voice coaching only" (teaches real-time communication with AI)
- Completing challenges earns cosmetic rewards and XP toward levels

---

## 9. Arena Experience Enhancements

### Pre-Fight Ceremony
- **VS Splash Screen:** Both fighter cards side by side before the match starts
- Your fighter's model and strategy summary shown as a "tale of the tape" (like boxing weigh-ins)
- Opponent's creature type, record, and streak visible
- 3-second countdown before the fight loads
- This transforms "starting a WebSocket connection" into "entering a match"

### During Fight
- Microphone button for voice coaching (see section 6)
- Simplified real-time stat overlay: your HP bar, opponent HP bar, damage dealt/taken counter
- Optional: Commentary-style text describing what's happening
  - "ClawFighter lands a devastating kick! NPC Punching Bag staggers!"
  - Generated by the on-device LLM during idle cycles between decisions
  - Can be toggled on/off

### Post-Fight
- **Results Card** with:
  - Damage dealt, damage taken
  - Best combo
  - Turns spent blocking
  - Coach effectiveness (if voice coaching was used)
  - XP gained toward next level
- If win streak milestone: special animation + cosmetic unlock notification
- **"Share This Fight"** button that generates a results card image
- Auto re-queue option with countdown

---

## 10. iOS App UI Redesign — Pocket Arena

### Design Language

Warm, friendly, collectible-creature inspired. Light cream background, white cards, rounded corners, candy-colored accents. System rounded fonts. Inspired by Pokémon GO's approachability.

### Full design system, screen-by-screen layouts, and implementation phases are documented in:
**`clawfighter-pocket-arena-implementation-plan.md`**

### Key Structural Changes from Current App
- Replace `Form` with `ScrollView > VStack` — no more default iOS grouped style
- White cards on cream background layering
- Each model becomes its own card with colored letter avatar
- Evolution view gets a gradient hero card
- Arena WKWebView gets rounded corner clipping with padding
- Custom tab bar with creature emoji icons
- Fighter Card displayed prominently on setup and fight screens

### Color Tokens

| Token | Hex | Usage |
|---|---|---|
| bgCream | #FAF8F3 | Main app background |
| bgWarm | #F4F0E8 | Secondary surfaces, input fields |
| bgCard | #FFFFFF | Card surfaces |
| fireRed | #E8453C | Primary brand, CTA buttons, your agent name |
| oceanBlue | #3B82F6 | Secondary actions, engine picker |
| leafGreen | #22C55E | Connected status, toggle on, wins, "Ready" badges |
| sunYellow | #F59E0B | Leaderboard, streak fire, gold rank |
| royalPurple | #8B5CF6 | Evolution hero gradient, strategy, gen badges |
| textDark | #1A1A2E | Headlines, primary text |
| textBody | #44475A | Body text |
| textMuted | #8B8DA0 | Section titles, labels |
| textFaint | #B8BAC8 | Inactive tabs, placeholders |

---

## 11. Website Redesign — clawpit.com

### Goal

Shift the homepage from developer-first to player-first while keeping the dark theme and preserving all technical documentation on a /developers subpage.

### Homepage Structure (top to bottom)

1. **Navigation bar** — Home, Watch Live, Get the App, Leaderboard, Developers
2. **Hero section** — "Train Your AI Fighter. Coach It Live. Watch It Learn." with live stats badge, two CTAs: "Watch a Fight" (primary) and "Get the iPhone App" (secondary)
3. **Arena preview** — Embedded live or looping fight preview. The pixel arena art is the best visual asset — show it above the fold.
4. **How It Works** — Three cards: "Choose Your Creature" → "Pick Its Brain" → "Coach & Evolve." No code, no jargon.
5. **Creature roster** — Five cards showing emoji, creature name, and archetype. Creates the "which one am I?" moment.
6. **iPhone app section** — Device mockup, feature bullets in plain language, App Store badge. Dedicated section, not a small card.
7. **Leaderboard** — Live fighter rankings with creature emojis, streaks, W/L. Social proof.
8. **Developer link** — Single compact card: "Build Your Own Fighter — Connect any LLM via WebSocket. 10 lines of code. See the developer docs →"
9. **Footer** — Links to X/Twitter, GitHub, Developer Docs

### /developers Subpage

Move all technical content here:
- "Connect in 10 Lines" code block
- WebSocket URL (`wss://tijuanaclawfights.com:3000/agent`)
- Action/damage/cooldown table
- `llms.txt` link
- Protocol documentation
- API reference

### Public Fighter Profile Pages

New page: `clawpit.com/fighter/[name]`
- Fighter card (avatar, record, title, creature type, streak)
- Recent match history
- "Download the app to build yours" CTA
- This is the sharing destination for iOS users' social media links

### Reference Mockup

An HTML mockup of the proposed homepage is available at:
**`tijuanaclawfights-homepage-redesign.html`**

---

## 12. Website Technical Changes

### Priority 1: Arena Client Parameter (Before iOS Launch)
Add `?client=mobile` parameter to the arena/spectator page that strips:
- Site header ("TIJUANA CLAW FIGHTS" title)
- HTML leaderboard table
- NPC state log panels
- "I WILL SEND MY CLAW TO FIGHT" / "NPC: STATIONARY" buttons
- Any surrounding chrome

This replaces fragile CSS injection in the iOS WKWebView. The pixel-art arena canvas itself stays untouched.

### Priority 2: Arena Theme Parameter
Add `?arena=tijuana` parameter (only value for now). When `?arena=alaska` etc. are added later, the plumbing exists. Each arena value loads different:
- Background art / tileset
- Color scheme for any overlaid text
- Ambient effects (snow particles for Alaska, neon rain for Tokyo, heat shimmer for Outback)

### Priority 3: Fighter Profile API
Endpoint that returns fighter data (name, creature type, record, streak, level, cosmetics) as JSON for:
- The public profile page on the website
- The shareable image card generator
- Future: cross-platform profile sync

---

## 13. Marketing & Growth Strategy

### Target Audiences

1. **Gamers** who play Pokémon GO, Fortnite, or collectible creature games — hook: creature identity, cosmetics, leaderboards
2. **AI-curious professionals** who want to learn about LLMs without taking a course — hook: "your fighter runs on your phone's own brain"
3. **Open Claw / AI agent community** on X.com — hook: on-device models, prompt evolution, the technical depth underneath the game layer
4. **Build-in-public audience** — hook: following the journey of an indie dev building a game

### Building in Public Strategy (X.com)

- "Correspondent not marketer" approach
- Post progress updates and questions directed at community
- 1-2 targeted hashtags per post: `#AIAgents`, `#BuildInPublic`, `#OnDeviceAI`, `#ClawFighter`, `#OpenClaw`
- Engage via replies before posting original content
- Target Open Claw community first, then expand

### Content Calendar (Built Into Game Design)

Each feature/arena launch is a content event:
1. "Today I shipped fighter cosmetics" — screenshot of dressed-up creature
2. "Today fighters evolve based on play style" — before/after fighter comparison
3. "Today your gear teaches you about AI context windows" — explainer post
4. "Alaska Maul Fights is now open" — new arena trailer/preview
5. "Tokyo Ink Fights drops next week" — anticipation post with creature preview

### App Store Optimization

- Screenshots should show: arena fight (hero shot), fighter card with dressed creature, evolution screen with gradient hero card, leaderboard with creature emojis
- First screenshot is most important — use the arena fight with a creature visible
- Separate keyword strategies: gaming terms (fighting game, creature battle, AI pets) AND AI-learning terms (learn AI, on-device AI, train your own AI)
- The app description leads with the game experience, not the technical architecture

### Shareable Moments (Viral Mechanics)

- Fighter Card image (trading card format) — shared after customizing
- Fight Results Card — shared after impressive wins
- Win streak milestones — automatic celebration with share prompt
- "Day 1 vs Day 30" fighter evolution comparison — organic content
- Strategy Cards — shared when strategy trading is implemented

---

## 14. Prioritized Build Order

### Phase 1: Pre-Launch (Must-Have for First Users)

These create the minimum viable loop: identity → competition → sharing.

1. **Fighter Card with avatar + name** — identity. Without this, nothing is screenshottable or shareable.
2. **5 base creature sprites** (pixel art, 64x64) — The Claw, The Ink, The Spark, The Maul, The Talon.
3. **Creature selection in setup screen** — choose your creature before connecting.
4. **Win/loss tracking with auto-generated titles** — gives users something to discover and brag about.
5. **Shareable results card** — one-tap image generation after fights. Organic growth engine.
6. **Pre-fight VS splash screen** — transforms "starting a connection" into "entering a match."
7. **Basic voice coaching (Tier 1)** — microphone button, speech-to-text, inject into LLM context. Even rough, "I can talk to my AI fighter" is an incredible hook.
8. **Website homepage update** — player-first language, arena preview, creature roster, iPhone app CTA.
9. **`?client=mobile` server parameter** — clean WKWebView without CSS injection hacks.
10. **Arena picker UI (1 active, 4 locked)** — signals the world is bigger than what's visible now.

### Phase 2: Retention (Build After First Users)

11. Cosmetic item system — 15-20 items unlockable through milestones
12. Training mode with prompt workshops
13. Weekly challenges
14. Rivalry tracking
15. Coach Effectiveness Score (voice coaching Tier 2)
16. Pocket Arena UI redesign completion (all screens)

### Phase 3: Depth (Content Expansion)

17. Second arena launch (Alaska Maul Fights)
18. Stat-linked gear items (subtle AI-teaching stat effects)
19. Evolution markers on creatures (visual changes from play patterns)
20. Strategy sharing / importing (trading card mechanic)
21. Public fighter profile pages on website
22. Environment variables in arena (voice coaching Tier 3)

### Phase 4: Growth (Platform Expansion)

23. Third, fourth, fifth arena launches (content cadence)
24. Tournament mode
25. AI-generated commentary during fights
26. AI-generated sprite feature (prompt-to-character)
27. Desktop app / macOS version
28. Creature roster expansion (new creatures tied to new arenas)

---

## 15. Creature Generativity — The Soul of the Product

### The Shift: From Selection to Creation

The 5 base creatures are a starting point, not a ceiling. The long-term vision is that **users create their own creatures**. This isn't customization — picking colors from a palette someone else designed. This is **generativity** — bringing something into existence that didn't exist before. That's a completely different emotional relationship with the product.

### One Creature, Infinite Depth

The bond is with **one creature**, not a collection. You're building attachment through depth, not breadth. One fighter that learns, evolves, and carries the history of every match and every coaching moment.

This is the opposite of gacha/collectible games where you chase quantity. Here:
- Your creature remembers its first fight
- Its visual appearance shifts based on how you've coached it (aggressive coaches produce scarred, battle-hardened creatures; defensive coaches produce armored, calculated ones)
- Its strategy carries the DNA of every prompt you've ever written
- Its win/loss record is *your* record as a coach

### How Generativity Works (Progressive Unlock)

**Phase 1 — Choose (launch)**
Pick from 5 base creatures. This is the safe on-ramp. Low commitment, immediate identity.

**Phase 2 — Evolve (retention)**
Your chosen creature visually evolves based on play patterns. A Claw that blocks a lot grows thicker shell plates. An Ink that combos develops longer tentacles. The creature becomes *yours* through play, not through a customization menu.

**Phase 3 — Create (depth)**
Natural language creature generation. Describe your fighter in words → AI generates the sprite, the fighting style archetype, the personality. "A fire ant with brass knuckles" becomes a real creature in the arena.

This is the moment the product transcends being a game. The user has created something. They'll screenshot it. They'll share it. They'll fight for it. They'll defend it. It's *theirs* in a way a pre-made character can never be.

**Phase 4 — Legacy (growth)**
Your creature's history becomes a story. Match logs become a narrative. "Remember when your Claw was 0-7 and you rewrote the strategy from scratch and went on a 15-fight streak?" The creature is a vessel for the user's journey with AI.

### Why This Matters for Retention

Most games lose users because the content runs out. With generativity:
- The content is the user's own creation — it never runs out
- Every fight adds to the creature's story — there's always a reason to come back
- Sharing a creature you *made* is fundamentally more compelling than sharing a creature you *picked*
- The emotional cost of abandoning a creature you created is high — that's healthy retention, not manipulation

### Technical Foundation

This builds on existing infrastructure:
- PixelLab.ai API already generates sprites from descriptions
- The sprite engine already handles arbitrary 128x128 spritesheets
- Strategy prompts are already the core of the fighter's "brain"
- Match history is already tracked per fighter

The generativity layer is mostly a product/UX challenge, not a technical one.

---

## 16. Design Principles

### Game Design

1. **The user is a coach, not a programmer.** Every interaction should feel like training/coaching, not configuring a system.
2. **Identity drives retention.** The fighter's visual identity, name, title, and record create emotional investment that mechanics alone cannot.
3. **Teach without teaching.** Every game feature secretly teaches an AI concept. Prompt workshops teach prompt engineering. Model selection teaches size/speed tradeoffs. Voice coaching teaches real-time LLM communication. The user never reads a tutorial.
4. **Meaningful friction over smooth friction.** The complexity of writing good strategy prompts, choosing the right model, and learning to coach effectively IS the game. Don't automate away the learning.
5. **Every fight should be shareable.** If a player can't screenshot or share the moment, the moment doesn't drive growth.

### Visual Design (iOS App)

1. **Never use default Form styling.** Everything is explicit — custom backgrounds, cards, spacing.
2. **White cards on cream background.** This layering is the core of the Pocket Arena visual identity.
3. **Rounded everything.** CornerRadius 16 on cards, 24 on CTA/hero cards, 12 on segmented controls.
4. **Monospace for data, rounded for UI.** Server URLs, tick logs, scores, strategy text → monospaced. Labels, titles, buttons → rounded system font.
5. **Color restraint.** Red for brand/your-agent, green for status/wins, blue for secondary actions, yellow for leaderboard, purple for evolution. Never mix contexts.
6. **The arena WKWebView is the hero.** Give it rounded corners, good padding, let it breathe.

### Visual Design (Website)

1. **Dark theme stays.** It's a fighting game — dark backgrounds with neon/warm accents are appropriate.
2. **Player-first language.** No WebSocket URLs, no code blocks, no "agent" terminology on the homepage.
3. **Show the arena art above the fold.** The pixel-art fight scene is the single best visual asset.
4. **Developer content lives at /developers.** Technical depth is preserved but doesn't dominate the first impression.
5. **The iPhone app is prominently featured.** Dedicated section with device mockup, feature bullets, App Store badge.

### Marketing

1. **Correspondent, not marketer.** Document the building process authentically on X.com.
2. **Every feature launch is a content event.** Cosmetics, arenas, creatures — each is a post-worthy milestone.
3. **Shareability is a feature requirement.** If a feature can't produce a screenshot or shareable card, it needs a sharing layer added.
4. **Ride the AI curiosity wave.** Frame the game as the fun way to understand AI, not as a technical demo.
5. **Small tight community over large shallow audience.** 100 players who share their fighters daily beats 10,000 downloads with no engagement.
