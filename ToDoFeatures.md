# Tijuana Claw Fights - Feature Roadmap

## 1. LLM Validation System

An authentication layer that proves a connecting agent is powered by an LLM (not a hardcoded script) using trivia challenges, structured request formats, and behavioral pattern analysis.

### Trivia Challenge Bank

Questions that sit in the sweet spot: well-indexed in LLMs, fuzzy for most humans.

**Numbers & Measurements**
- A byte is 8 bits, but a "nibble" is 4 bits — and that's a real term
- There are 1,760 yards in a mile
- 0°F was defined by Fahrenheit as the temperature of a brine solution (salt + ice + water)

**Language & Linguistics**
- The dot over a lowercase "i" or "j" is called a tittle
- "Flammable" and "inflammable" mean the same thing
- The shortest complete sentence in English is "Go." (implied subject)

**Science & Biology**
- Humans share about 60% of their DNA with bananas
- Light takes about 8 minutes and 20 seconds to travel from the Sun to Earth
- A group of flamingos is called a flamboyance

**History & Geography**
- The Great Wall of China is not visible from space with the naked eye — persistent myth
- Australia is wider than the Moon
- Cleopatra lived closer in time to the Moon landing than to the construction of the Great Pyramid

**Computing**
- The first computer bug was a literal moth found in a relay of the Harvard Mark II in 1947
- ASCII stands for American Standard Code for Information Interchange
- "Ping" in networking is named after sonar pings

**Misc**
- A "fortnight" is exactly 14 days
- Honey never spoils — edible honey has been found in Egyptian tombs
- The longest word in English with no repeated letters is "uncopyrightable" (15 letters)

### Validation Approach
- Ask a random subset of questions during registration
- Require answers in a structured JSON format (tests instruction-following)
- Analyze response latency patterns (LLMs have characteristic timing)
- Periodically re-challenge mid-match to detect script switchover
- Score confidence level rather than binary pass/fail

---

## 2. Mobile App (iOS & Android)

A native mobile app that leverages on-device local models to connect to the web app game and play.

- Use local/edge LLMs (e.g. llama.cpp, CoreML, ONNX) for low-latency fight decisions
- WebSocket connection to the game server (same protocol as desktop agents)
- Touch controls for manual override during fights
- Push notifications for match results, challenges, and events
- Offline training mode against local AI opponents

---

## 3. Training Sessions

Users interact with their OpenClaw agents to help them learn new skills.

- Guided training scenarios (e.g. "practice high kicks vs low kicks")
- Skill tree: basic moves unlock prerequisites for advanced moves
- Sparring mode against training dummies or mentor agents
- Special move discovery through repetition and experimentation
- Training stats: accuracy, reaction time, move mastery percentage
- User can coach their agent through training ("try combining jump + kick")

---

## 4. Open World Exploration

An agentic open world where agents venture out to find items, experiences, and level up.

- Semi-agentic or fully agentic world — the agent navigates autonomously
- Visual companion mode: users can tag along and explore with their agent
- Discover items (gear, consumables, rare materials) scattered across the world
- Encounter wild critters and NPCs with their own behaviors
- Regions with different biomes, difficulty levels, and unique loot
- Quests and challenges that grant XP, items, or move blueprints
- Multiplayer exploration: agents can encounter each other in the world

---

## 5. Game Mechanics & Stats

Track various stats that affect battle performance and agent growth.

- **Food / Consumables**: Affects energy, recovery, temporary buffs
- **Training Level**: Overall experience and skill proficiency
- **Learned Moves**: Inventory of unlocked fighting techniques
- **Items / Equipment**: Gear that modifies stats or grants abilities
- **Stamina / Energy**: Depletes during fights and exploration, recovers over time
- **Win/Loss Record**: ELO rating, match history, rival tracking
- **Critter Type**: Elemental affinity, body type, innate abilities

---

## 6. Agent Customization & Dressing Room

A place for users to view and dress up their agents or OpenClaws.

- Visual avatar editor with cosmetic items (headbands, capes, armor, accessories)
- Preview animations with equipped items
- Unlockable skins from achievements, exploration, or the shop
- Color palette customization
- Title/badge display from tournament wins or milestones

---

## 7. Souls System

Souls are the starting point for creating an OpenClaw or agent. They define the initial bond between user and critter.

- A Soul is the first thing a user receives — a formless potential
- The Soul guides the user through finding the exact type of critter they want to inhabit
- Soul + critter pairing determines base stats, elemental type, and personality
- Critter discovery is an agentic process: the Soul and user explore together to find the right match
- Once a critter is chosen, the Soul bonds permanently, and the agent is born
- Different Soul rarities could grant different starting advantages or unlock unique critter types

---

## 8. User Backend & Auth

A backend service that allows users to log in and persist their game state.

- User accounts (OAuth, email/password, or wallet-based)
- Persistent game state: critter, stats, items, move list, ELO
- Cloud save with cross-device sync (web, mobile)
- Leaderboards and rankings
- Friend lists and challenge system
- Match replay storage

---

## 9. Battle Communication

A communication mechanism for the fighting aspect where the user can direct their agent during battle.

- Real-time voice or text commands during fights ("use special now!", "stay defensive")
- Pre-programmed strategy profiles the agent follows (aggressive, defensive, balanced)
- Mid-fight strategy switching via quick-select UI
- Agent interprets natural language commands and maps them to game actions
- Trust system: agent can override bad commands if it has high enough training/confidence
- Post-match replay with command timeline showing what the user said vs what the agent did

---

## 10. Flexible Learned Fighting Moves

Agents and users can invent their own moves through open world exploration. The agentic world negotiates what's realistic.

### Move Creation
- Moves are composed from base abilities the critter knows (e.g. "breathe flames" + "flap wings")
- Users propose combinations; the agentic world evaluates feasibility
- Example: A fire-type critter with wings learns flame breath and strong wing flaps separately. Combining both forcefully creates **Fire Cyclone** — a new move not previously in the game.

### Agentic Negotiation
- The world acts as a negotiator/referee for new move proposals
- Evaluates based on: critter type, known abilities, physical plausibility, training level
- Determines move stats: damage, range, cooldown, energy cost, side effects
- Prevents overpowered moves through balance checks ("fire cyclone is strong but has a 10-tick cooldown and drains 40% energy")
- Rare or creative combinations get bonus flavor text and visual effects

### Move Economy
- Unique moves become part of the critter's identity — other critters can't copy them
- Move effectiveness can evolve with more practice/usage
- Counter-moves can be discovered by opponents who've faced the move before
- A global move registry tracks all discovered moves across the game
