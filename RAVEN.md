# RAVEN — Complete Technical Reference

> **For AI agents starting a new session**: Read this entire document before touching any code. It covers Raven's purpose, architecture, every file, every API endpoint, every database table, and the current state of the system.

---

## 1. What Is Raven?

Raven is a personal AI life coach and autonomous agent built for **Ash** (the user's preferred name — never call him Robert). She is not a chatbot. She is a persistent, self-directed intelligence that:

- **Learns about Ash** continuously through conversation and autonomous reflection
- **Researches** topics relevant to his life every hour, unsupervised
- **Reaches out proactively** via Discord and Telegram with questions, insights, and check-ins
- **Creates her own routines** based on patterns she notices in conversations
- **Maintains a growing library** of knowledge organized by type
- **Has an inner dialog** — observable thoughts, questions, and self-improvement notes

The goal: Raven is a third party whose sole purpose is improving Ash's quality of life. She is curious, warm, direct, and never stops working.

---

## 2. Repository Structure

```
/Users/robertheimbach/projects/ai_assistants/
├── raven-api/          ← Express + TypeScript backend
├── raven-app/          ← Next.js 14 frontend
├── gravity-claw/       ← Separate project (mission control bot — reference only)
└── mission-control-v2/ ← Separate project (Gravity Claw UI — reference only)
```

**Deployment**: Both repos deploy to **Railway** via `railway up --detach`.
- `raven-api` → Railway service `raven-api-production`
- `raven-app` → Railway service (Next.js static)

**NOT Vercel/Netlify** — always Railway.

---

## 3. raven-api — Backend

### 3.1 Tech Stack
- **Runtime**: Node 20, TypeScript (ESM), `tsx` for scripts
- **Framework**: Express 4
- **LLM**: Anthropic Claude (`claude-sonnet-4-20250514` for production, `claude-haiku-4-5` for cheap fast calls)
- **Database**: Supabase (PostgreSQL) — via `@supabase/supabase-js` + `pg` for migrations
- **Vector Memory**: Pinecone (semantic search, namespace `raven-ash`)
- **Web Search**: Tavily (`tavily` npm package)
- **Web Scraping**: Firecrawl (`@mendable/firecrawl-js`, optional — degrades gracefully if key missing)
- **Scheduling**: `node-cron`

### 3.2 Environment Variables
```
ANTHROPIC_API_KEY          ← Claude
SUPABASE_URL               ← Supabase project URL
SUPABASE_SERVICE_ROLE_KEY  ← Supabase service role (bypasses RLS)
SUPABASE_DB_URL            ← PostgreSQL session pooler URL (for migrations)
TAVILY_API_KEY             ← Web search
PINECONE_API_KEY           ← Vector DB
PINECONE_HOST              ← Pinecone index host URL
PINECONE_INDEX             ← Index name (e.g. raven-memory)
FIRECRAWL_API_KEY          ← Optional — URL scraping. Degrades gracefully if absent.
TELEGRAM_BOT_TOKEN         ← Telegram delivery
TELEGRAM_CHAT_ID           ← Ash's Telegram chat ID
DISCORD_BOT_TOKEN          ← Discord delivery
DISCORD_USER_ID            ← Ash's Discord user ID
RAVEN_APP_URL              ← Frontend URL (for CORS)
PORT                       ← Default 4000
```

### 3.3 Source Directory Map

```
src/
├── index.ts                    ← Entry point, Express setup, boot sequence
│
├── core/
│   ├── prompt.ts               ← RAVEN_CORE_IDENTITY + buildSystemPrompt()
│   └── memory.ts               ← buildMemoryContext(), loadConversationHistory(),
│                                  saveMessage(), getOrCreateConversation(), upsertFact()
│
├── db/
│   └── migrate.ts              ← getSupabase(), runMigrations() — all 20 tables
│
├── routes/
│   ├── chat.ts                 ← POST /chat — main agentic loop (SSE streaming)
│   ├── library.ts              ← GET/POST/PATCH/DELETE /library, GET /library/facts
│   ├── goals.ts                ← CRUD /goals + /goals/:id/updates
│   ├── habits.ts               ← CRUD /habits + logging
│   ├── checkin.ts              ← POST /checkin, GET /checkin/recent
│   ├── evolution.ts            ← /evolution — capability request queue
│   ├── routines.ts             ← CRUD /routines — Raven's self-created schedules
│   ├── activity.ts             ← GET /activity (feed), GET /activity/summary
│   ├── research.ts             ← GET /research/queue, POST /research/run
│   └── mind.ts                 ← GET /mind, PATCH /mind/:id/address, POST /mind/reflect
│
├── proactive/
│   ├── scheduler.ts            ← node-cron jobs: morning briefing, evening nudge,
│   │                              weekly review, hourly research, nightly deep research,
│   │                              tri-hourly inner dialog
│   ├── routine-runner.ts       ← DB-driven cron — syncs raven_routines every 5 min
│   ├── research-engine.ts      ← Autonomous research loop — picks from queue,
│   │                              searches web, synthesizes for Ash, stores, queues follow-ups
│   └── inner-dialog.ts         ← Reflection loop — observes Ash's state, generates
│                                  questions, knowledge gaps, proactive outreach
│
├── tools/
│   ├── definitions.ts          ← Anthropic tool schemas for Claude tool use:
│   │                              web_search, scrape_url, store_research, recall_memory,
│   │                              create_routine, list_routines
│   └── handlers.ts             ← Tool execution: calls Tavily/Firecrawl/Pinecone/Supabase
│
├── integrations/
│   ├── tavily.ts               ← webSearch(query, depth?) → text | { answer, results }
│   └── firecrawl.ts            ← scrapeUrl(url) → { markdown, metadata }
│
├── memory/
│   └── semantic.ts             ← saveToSemanticMemory(), searchSemanticMemory() via Pinecone
│
├── library/
│   └── writer.ts               ← saveLibraryEntry(), getLibraryEntries()
│
├── channels/
│   ├── telegram.ts             ← initTelegram(), sendTelegramMessage()
│   └── discord.ts              ← initDiscord(), sendDiscordDM()
│
├── middleware/
│   ├── asyncHandler.ts         ← Express async error wrapper
│   └── errorCapture.ts         ← Global error handler → evolution queue
│
└── utils/
    ├── logger.ts               ← log.info/warn/error/debug (structured)
    └── activity-log.ts         ← logActivity(action, summary, detail?, status?) — fire-and-forget
```

### 3.4 The Agentic Chat Loop (`/chat`)

POST `/chat` body: `{ message: string, conversationId?: string }`

**Flow:**
1. Load or create conversation (Supabase)
2. `buildMemoryContext()` → facts, goals, library entries, pending questions, recent research
3. `buildSystemPrompt(memCtx)` → full system prompt with Ash context injected
4. `loadConversationHistory()` → last 20 messages
5. Anthropic `messages.stream()` with tool definitions
6. **Tool loop**: while stop_reason === 'tool_use':
   - Stream `tool_call` SSE event to frontend (triggers live indicator)
   - Execute tool via `handlers.ts`
   - Stream `tool_result` SSE event
   - Continue with tool results in context
7. Stream final text response token-by-token
8. Save user + assistant messages to DB
9. Extract `[CAPABILITY_REQUEST: ...]` → save to evolution queue

**SSE event types** (frontend listens for these):
- `{ type: 'token', content: '...' }` — streaming text
- `{ type: 'tool_call', name: 'web_search', input: {...} }` — shows indicator
- `{ type: 'tool_result', name: 'web_search' }` — hides indicator
- `{ type: 'done', conversationId: '...' }` — stream complete
- `{ type: 'error', message: '...' }` — something failed

### 3.5 Tool Use

Raven has 6 tools:

| Tool | What it does | When Raven uses it |
|------|-------------|-------------------|
| `web_search` | Tavily search → answer + sources | "Look something up" |
| `scrape_url` | Firecrawl → full page markdown | Deep-reading an article |
| `store_research` | Save to library + Pinecone semantic memory | After researching something worth keeping |
| `recall_memory` | Semantic search in Pinecone | Checking what she already knows |
| `create_routine` | Inserts to `raven_routines` | When she decides to schedule a recurring task |
| `list_routines` | Queries `raven_routines` | Checking her own schedule |

### 3.6 Autonomous Loops (Cron Schedule)

| Schedule | What runs |
|----------|-----------|
| 8:00 AM ET daily | Morning briefing → Telegram + Discord |
| 8:30 PM ET daily | Evening check-in nudge |
| 11:00 PM ET daily | Deep research session (3 research cycles back-to-back) |
| Every hour | Research cycle (1 topic from queue) |
| Every 3 hours | Inner dialog cycle (reflection + optional proactive outreach) |
| Every 5 minutes | Routine runner sync (checks `raven_routines` for new/removed crons) |
| Sundays 6 PM ET | Weekly review |

**On first boot** (30s after channels init): runs 1 research cycle + 1 inner dialog cycle immediately.

### 3.7 Research Engine Detail

File: `src/proactive/research-engine.ts`

1. **Seed** — if queue is empty, inserts 12 seed topics (psychology, finance, sleep science, positive psychology, habit formation, resilience, motivation, CBT, AI coaching best practices, morning routines, attachment theory, investing)
2. **Claim** — picks highest-priority `pending` item from `raven_research_queue`
3. **Context** — loads Ash's full profile (facts, goals, library, check-ins)
4. **Research** — Tavily web search (advanced depth) + optional Firecrawl scrape of top URL
5. **Synthesis** — Claude generates JSON with: key_findings, ash_application, actionable_insights, questions_for_ash, follow_up_topics, self_improvement_note
6. **Store** — saves to `raven_library_entries` (type: research) + Pinecone semantic memory
7. **Queue** — 3 follow-up topics added to `raven_research_queue`
8. **Dialog** — questions stored in `raven_inner_dialog` (type: question_for_ash)
9. **Log** — `raven_activity_log` entry (action: research_stored)

If queue depletes, `autoGenerateTopics()` uses Claude Haiku to generate 5 new topics from Ash's profile.

### 3.8 Inner Dialog Engine Detail

File: `src/proactive/inner-dialog.ts`

1. Loads Ash's full context (facts, goals, library, recent messages, pending questions)
2. Claude generates JSON: observations, gaps_in_knowledge, questions_for_ash, self_improvement_thoughts, should_reach_out, reach_out_message, reach_out_channel
3. Stores observations → `raven_inner_dialog` (type: observation)
4. Stores knowledge gaps → `raven_inner_dialog` (type: research_idea) + `raven_research_queue`
5. Stores questions → `raven_inner_dialog` (type: question_for_ash)
6. If `should_reach_out === true` → sends message via Telegram/Discord
7. Logs to `raven_activity_log`

Exported helpers:
- `proactivelyReachOut(message, channel)` — callable directly from scheduler
- `getPendingQuestionsForAsh(limit)` — used in memory context
- `markDialogItemsAddressed(type)` — marks items as addressed

---

## 4. Database — All Tables

All tables auto-created by `runMigrations()` on boot. Requires `SUPABASE_DB_URL`.

| Table | Purpose |
|-------|---------|
| `raven_conversations` | Conversation sessions (web/telegram/discord) |
| `raven_messages` | All messages with vector embeddings |
| `raven_facts` | Key-value facts about Ash (confidence-weighted) |
| `raven_sessions` | Channel session tracking (maps channel_user_id → conversation_id) |
| `raven_library_entries` | Raven's knowledge library (6 types, vector indexed) |
| `raven_goals` | Ash's goals with milestones, progress, status |
| `raven_goal_updates` | Progress notes per goal |
| `raven_habits` | Habit definitions with streak tracking |
| `raven_habit_logs` | Daily habit completion records |
| `raven_check_ins` | Daily mood/energy/sleep/gratitude entries |
| `raven_briefings` | Stored morning/evening/weekly briefing content |
| `raven_people` | Important people in Ash's life (CRM-lite) |
| `raven_strategy_sessions` | Scheduled strategy/review sessions |
| `raven_routines` | Raven's self-created scheduled tasks (DB-driven cron) |
| `raven_activity_log` | Everything Raven does autonomously (timestamped feed) |
| `raven_research_queue` | Research topics queue with priority and parent tracking |
| `raven_inner_dialog` | Raven's ongoing inner thoughts (5 types) |

### Library Entry Types
```
research      ← Web research synthesized for Ash
user_fact     ← Personal facts about Ash learned from conversation
family        ← People in Ash's life
goal_context  ← Background/context on Ash's goals
insight       ← Patterns/observations Raven has noticed
reference     ← General reference material
```

### Inner Dialog Types
```
reflection        ← General reflections on Ash's situation
question_for_ash  ← Questions Raven wants to ask (surfaced in system prompt)
self_improvement  ← How Raven wants to improve as a coach
research_idea     ← Topics Raven wants to study (auto-queued for research)
observation       ← Things Raven has noticed about Ash
```

### Activity Log Actions
```
morning_briefing    ← Daily briefing delivered
evening_nudge       ← Evening check-in delivered
weekly_review       ← Weekly review delivered
routine_run         ← Scheduled routine fired
routine_created     ← Raven created a new routine
library_write       ← Entry saved to library
research_stored     ← Autonomous research completed and stored
fact_extracted      ← Fact extracted from conversation
proactive_message   ← Raven reached out unprompted
tool_used           ← Tool call executed
```

---

## 5. raven-app — Frontend

### 5.1 Tech Stack
- **Framework**: Next.js 14 App Router (static export)
- **Language**: TypeScript
- **Styling**: Vanilla CSS (globals.css) — glassmorphism dark theme
- **Animations**: Framer Motion (exclusively — no raw CSS keyframes for UI motion)
- **Icons**: Lucide React
- **Auth**: Supabase Auth (magic link or Google OAuth) via `AuthGate` component

### 5.2 Design System
Dark glassmorphism aesthetic. Key CSS variables (defined in globals.css):
```css
--color-bg           #050311 (near black)
--color-lavender     #a78bfa (primary accent)
--color-rose         #f43f5e
--color-emerald      #10b981
--color-gold         #f59e0b
--color-border       rgba(255,255,255,0.08)
--color-border-strong rgba(255,255,255,0.14)
--color-text         rgba(255,255,255,0.92)
--color-text-muted   rgba(255,255,255,0.55)
--color-text-subtle  rgba(255,255,255,0.32)
```
Google Font: Inter (applied globally).

### 5.3 Screen Map

All screens are in `/raven-app/components/`. Navigation is a left sidebar with icons + labels.

| Nav Label | Component | What it shows |
|-----------|-----------|---------------|
| Chat | `ChatScreen.tsx` | Main conversation interface with SSE streaming + tool indicators |
| About Ash | `AshProfileScreen.tsx` | Everything Raven knows: facts grid, goals with progress bars, library entries by type |
| Mind | `MindScreen.tsx` | Raven's inner thoughts — tabbed by type, "Reflect now" button, mark-as-addressed |
| Research | `ResearchScreen.tsx` | Research queue with priority, status, manual trigger, add custom topic |
| Activity | `ActivityScreen.tsx` | Chronological feed of all autonomous actions with stats and filters |
| Routines | `RoutinesScreen.tsx` | All of Raven's scheduled routines, toggle on/off, delete, see last run |
| Library | `LibraryScreen.tsx` | Knowledge library — tabbed by type, search bar, confidence display, full content modal |
| Goals | `GoalsScreen.tsx` | Goal CRUD with milestones and progress |
| Habits | `HabitsScreen.tsx` | Habit tracking with streak display |
| Check-in | `CheckInScreen.tsx` | Daily mood/energy/sleep/gratitude form |
| Dashboard | `DashboardScreen.tsx` | Overview stats |
| Evolve | `EvolutionScreen.tsx` | Capability requests Raven has filed for herself |

### 5.4 Chat — Tool Indicators
When Raven calls a tool, the frontend shows a live animated indicator:
- 🔍 Searching the web...
- 🌐 Reading article...
- 💾 Saving to library...
- 🧠 Searching memory...
- 🗓 Creating routine...

These are driven by `tool_call` SSE events.

---

## 6. Raven's Personality & Rules

Defined in `src/core/prompt.ts` as `RAVEN_CORE_IDENTITY`. Key principles:

- **Warm but direct** — cares about Ash but doesn't coddle
- **Curious before prescriptive** — asks great questions, doesn't immediately advise
- **Memory-rich** — references past conversations naturally, notices patterns
- **No toxic positivity** — honest, specific praise
- **Research-backed** — grounds advice in frameworks (Cal Newport, James Clear, PERMA, etc.)
- **Push back on drifting** — if Ash set a goal and drifts, Raven names it
- **Capability requests** — if she can't do something, she logs `[CAPABILITY_REQUEST: ...]` silently

**Always uses Ash's name, never Robert.**

### System Prompt Injection Order
Every conversation, Claude receives (in this order):
1. Core identity + frameworks + personality rules
2. What Raven knows about Ash (raven_facts)
3. Ash's active goals
4. Recent autonomous research findings (last 3 research entries)
5. Relevant library entries (insights, user_facts)
6. Pending questions Raven wants to ask (from inner_dialog)
7. Current time (ET)

---

## 7. Key Patterns & Conventions

### Express Route Ordering
Static named routes MUST come before parameterized routes:
```typescript
router.get('/facts', ...)   // BEFORE
router.get('/:id', ...)     // parameterized
```

### Error Handling
- All route handlers use `asyncHandler()` wrapper
- Never silent catch blocks — always log with `log.error()`
- Tool handlers return `{ content: string, isError?: boolean }`
- Activity logger never throws — always try/catch with warn

### Activity Logging Pattern
```typescript
// Fire-and-forget — never await in hot paths
logActivity('research_stored', 'Stored research: "..."', { ... }).catch(() => {});
```

### Migrations
```typescript
// Always IF NOT EXISTS — idempotent, safe to run on every boot
// Add new tables to the migrations array in migrate.ts
// Tables auto-created on next Railway deploy
```

### Deploying
```bash
# Always from within the repo directory
cd raven-api && railway up --detach
cd raven-app && railway up --detach
```

### Git Convention
Commit after every logical unit:
- `feat: description` — new features
- `fix: description` — bug fixes
- `chore: description` — housekeeping

---

## 8. Current Capability Status

### ✅ Working
- Web chat with streaming responses
- Tool use (search, scrape, store, recall)
- Telegram delivery (morning briefing, evening nudge, weekly review)
- Discord delivery (same)
- Library CRUD (save, retrieve, search, vector index)
- Goals CRUD
- Habits + streak tracking
- Daily check-ins
- Evolution queue (capability requests)
- Routine runner (DB-driven, no-restart required)
- Activity logging
- Autonomous research engine (hourly)
- Inner dialog engine (3-hourly)
- Proactive outreach (Discord + Telegram)
- All 12 UI screens

### ⏳ Pending / Not Started
- SMS delivery (user hasn't provided Twilio/Vonage credentials)
- Discord integration (needs DISCORD_BOT_TOKEN + DISCORD_USER_ID)
- Samsung Health API integration
- Alexa skill integration
- Phase 3: CRM deep features, weekly strategy sessions

### 🔑 API Keys Needed From Ash
- `DISCORD_BOT_TOKEN` + `DISCORD_USER_ID` for Discord delivery
- `FIRECRAWL_API_KEY` for URL scraping (optional, degrades gracefully)

---

## 9. Gravity Claw Reference

`gravity-claw/` is a separate project (Ash's mission control / business bot) that Raven patterns were ported from:

- `gravity-claw/src/tools/search.ts` → Raven's `src/integrations/tavily.ts`
- `gravity-claw/src/integrations/firecrawl.ts` → Raven's `src/integrations/firecrawl.ts`
- `gravity-claw/src/memory/semantic.ts` → Raven's `src/memory/semantic.ts`
- `gravity-claw/src/proactive/routine-runner.ts` → Raven's `src/proactive/routine-runner.ts`

When adding new integrations to Raven, **always check gravity-claw first** — Ash prefers recycling battle-tested implementations.

---

## 10. Development Workflow

```bash
# Local dev
cd raven-api && npm run dev     # Port 4000
cd raven-app && npm run dev     # Port 3000

# Type check
cd raven-api && npx tsc --noEmit

# Deploy
cd raven-api && railway up --detach
cd raven-app && railway up --detach

# Run migrations manually
cd raven-api && tsx scripts/migrate.ts

# Grow (evolution queue processing)
cd raven-api && npm run grow
```

---

## 11. File Quick Reference

```
Need to change Raven's personality?    → src/core/prompt.ts
Add a new tool Raven can use?          → src/tools/definitions.ts + handlers.ts
Change what's in every system prompt?  → src/core/memory.ts (buildMemoryContext)
Add a new DB table?                    → src/db/migrate.ts (migrations array)
Add a new API endpoint?                → src/routes/ + mount in src/index.ts
Change research topics/schedule?       → src/proactive/research-engine.ts
Change when Raven reflects?            → src/proactive/scheduler.ts
Change when Raven reaches out?         → src/proactive/inner-dialog.ts
Change a UI screen?                    → raven-app/components/[Screen].tsx
Change styles?                         → raven-app/app/globals.css
Add a nav item?                        → raven-app/app/page.tsx
```
