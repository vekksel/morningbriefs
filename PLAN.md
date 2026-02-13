# Morning Brief — MVP Plan

> A web app that sends a daily Telegram message with: weather, local news, calendar events, and a motivational quote.

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | HTML/CSS/JS + Vite | Simple, fast, no heavy framework for MVP |
| Backend | Node.js + Express | Same language as frontend, huge ecosystem |
| Database | SQLite (on Beget server) | Zero config, file-based, enough for MVP |
| Bot | Telegram Bot API (`node-telegram-bot-api`) | Handles /start and message delivery |
| Workflow | n8n (already running on Beget) | Orchestrates daily briefing generation |
| Hosting | beget.com | Everything in one place: frontend, backend, n8n, DB |

---

## Deployment Plan

- **Hosting:** beget.com VPS (n8n instance already there)
  - VPS specs: 1 Core / 2 GB RAM / 15 GB NVMe (5.7 GB free) — plenty for our app
  - SSH access via PuTTY: confirmed
  - Node.js: supported (per Beget docs)
  - Git: installable on the VPS (Ubuntu)
- **Pipeline:**
  1. Develop locally on PC
  2. `git push` to GitHub
  3. SSH into Beget VPS → `git pull` → `pm2 restart`
  4. (Later we can automate this with a simple deploy script)
- **No separate DB server needed** — SQLite is a file on disk, lives next to the app
- **Process management:** PM2 (keeps Node.js app + bot running, auto-restarts on crash)

---

## Database Schema (SQLite)

```sql
CREATE TABLE users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id     INTEGER UNIQUE NOT NULL,   -- from Telegram Login, used to send messages
  telegram_name   TEXT,                       -- display name
  city            TEXT,                       -- city name for news
  lat             REAL,                       -- latitude for weather
  lon             REAL,                       -- longitude for weather
  timezone        TEXT,                       -- e.g. "Europe/Moscow"
  send_time       TEXT DEFAULT '07:00',       -- when to send the brief (local time)
  google_refresh_token TEXT,                  -- nullable, for Google Calendar OAuth2
  is_bot_started  INTEGER DEFAULT 0,          -- 1 when user sent /start to bot
  created_at      TEXT DEFAULT (datetime('now'))
);
```

---

## Stages

### Stage 1 — Project Skeleton & Database
**Goal:** Runnable backend with database ready.

- [ ] Init project structure:
  ```
  morning_brief/
  ├── frontend/        # static web app
  ├── backend/         # Express API server
  ├── bot/             # Telegram bot (can be part of backend)
  ├── n8n_workflow/    # existing workflow files
  ├── PLAN.md          # this file
  └── README.md
  ```
- [ ] `npm init` for backend, install deps: `express`, `better-sqlite3`, `jsonwebtoken`, `cors`
- [ ] Create SQLite database and users table
- [ ] Health-check endpoint: `GET /api/health` → `{ status: "ok" }`

---

### Stage 2 — Landing Page + Telegram Login
**Goal:** User can visit the site and log in with Telegram.

- [ ] Landing page explaining what Morning Brief does
- [ ] Telegram Login Widget (official widget from Telegram)
- [ ] Backend endpoint: `POST /auth/telegram`
  - Verifies Telegram login hash using bot token
  - Creates user in DB (or finds existing)
  - Returns JWT session token
- [ ] After login → frontend shows onboarding page

**How Telegram Login works (for reference):**
1. We embed Telegram's widget script on our page
2. User clicks "Log in with Telegram" → Telegram popup appears
3. User confirms on their phone
4. Popup closes, our JS callback receives user data (id, name, hash)
5. We send this to our backend, which verifies it's legit
6. Backend creates a session (JWT token stored in browser)

---

### Stage 3 — Onboarding
**Goal:** Collect user preferences (location, send time).

- [ ] **Location detection (auto):**
  - Use browser's Geolocation API to auto-detect user's position
  - This shows a browser popup: "Allow this site to know your location?"
  - If allowed → we get lat/lon → reverse geocode to city name + timezone
  - If denied → show text input for city name (with autocomplete via OpenWeatherMap Geocoding API)
- [ ] **Send time picker:** Simple time input, default 07:00
- [ ] **"Connect your bot" step:**
  - Show a button/link: "Open Morning Brief Bot in Telegram"
  - Links to `t.me/YourBotName?start={telegram_id}`
  - We poll backend to check when `is_bot_started` becomes true
  - Show green checkmark when connected
- [ ] Save all preferences to DB via `POST /api/user/preferences`

---

### Stage 4 — Telegram Bot
**Goal:** Bot that receives /start and sends welcome message.

- [ ] Create bot via @BotFather (if not done already)
- [ ] Simple Node.js script:
  - Listens for `/start` command
  - Extracts `telegram_id` from message
  - Updates `is_bot_started = 1` in DB
  - Sends welcome message: "You're all set! Your first brief arrives tomorrow at {time}."
- [ ] Bot runs as a process on Beget alongside the backend

---

### Stage 5 — Google Calendar (Optional)
**Goal:** User can optionally connect Google Calendar to include events in their brief.

- [ ] **Skippable** during onboarding — button: "Connect Google Calendar (optional)"
- [ ] Backend endpoints:
  - `GET /auth/google` → redirects to Google's OAuth2 consent screen
    - Scope: `https://www.googleapis.com/auth/calendar.events.readonly`
  - `GET /auth/google/callback` → Google redirects back here with auth code
    - Exchange code for access_token + refresh_token
    - Store refresh_token in DB
    - Redirect user back to frontend with success indicator
- [ ] Frontend shows "Calendar connected" checkmark
- [ ] Backend utility function: `getEventsForUser(userId)`
  - Uses refresh_token to get fresh access_token
  - Calls Google Calendar API for today's events
  - Returns: event title, start time, end time, location

**What user sees:** Click "Connect Calendar" → Google page asks "Allow Morning Brief to view your calendar?" → they click Allow → back to our site → done.

---

### Stage 6 — Adapt n8n Workflow
**Goal:** Make the existing workflow multi-user and text-based.

**Changes from current workflow:**
- Replace hardcoded Config → fetch all active users from backend API
- Add loop to process each user
- Remove TTS/audio pipeline → replace with formatted text message via Telegram
- Replace Webhook trigger → Cron trigger (checks every minute, sends to users whose `send_time` matches current time in their timezone)

**New n8n flow:**
```
Cron (every minute)
  → HTTP Request: GET /api/users/due  (returns users whose brief is due now)
  → Loop over users:
      ├→ Weather (user's lat/lon)
      ├→ News (user's city)
      ├→ Calendar events (user's google token, if exists)
      └→ Quote (random)
      → AI: Format as nice text message
      → Telegram: Send message to user's chat_id
```

**Note:** This stage is done in n8n's visual editor. I'll provide exact specs and node configs, Ilyas wires them up.

---

### Stage 7 — Settings Page
**Goal:** User can update their preferences after initial setup.

- [ ] Authenticated page (must be logged in)
- [ ] Can change: city/location, send time
- [ ] Can connect/disconnect Google Calendar
- [ ] Can delete account (stops messages, removes data)

---

### Stage 8 — Fine-Tuning & Optimization
**Goal:** Improve scheduling efficiency, UX, weather/news quality, and multi-user scalability.

#### 8.1 — n8n Scheduling: Morning-Only Window
**Status:** Not started
**Problem:** Workflow runs every 1 min × 24 hours = 1440 idle executions/day.
**Solution:** Change Schedule Trigger cron to `* 4-11 * * *` (04:00–12:00 UTC). Covers 07:00–15:00 Moscow through 11:00–19:00 Vladivostok. Reduces to ~480 executions/day (67% reduction).

#### 8.2 — Cities Table + Autocomplete Location Selector
**Status:** Not started
**Problem:** Text input for city allows typos, no coordinate lookup. lat/lon not saved during onboarding (known bug).
**Solution:**
- Create `cities` table in SQLite: `name_ru`, `name_en`, `lat`, `lon` (loaded from `references/coordinates.csv`, ~300 cities)
- Frontend: replace text input with autocomplete search (type 2–3 letters → filtered dropdown)
- Keep "Detect my location" button (Geolocation API → match nearest city from list)
- On city select → auto-fill lat/lon in user record (fixes the lat/lon bug)
- Serve cities list as JSON to frontend (~15KB)

#### 8.3 — Weather Forecast Expansion + Clothing Advice
**Status:** Not started
**Problem:** Currently shows only current weather. OpenWeatherMap returns 5 forecast items per day (every 3 hours).
**Solution:**
- Show: current temp + conditions, day high/low (min/max from 3-hour forecasts)
- Key weather changes: "rain expected after 15:00", "clearing up by evening"
- Practical advice (in n8n Code node, simple if/else):
  - Rain probability > 50% → "Возьмите зонт" (Take an umbrella)
  - Temp < 0°C → "Одевайтесь теплее" (Bundle up)
  - Wind > 10 m/s → "Сильный ветер" (Strong wind)
  - Big temp swing (>10°C) → "Одевайтесь слоями" (Dress in layers)

#### 8.4 — Location-Filtered News
**Status:** Not started
**Problem:** Google News returns 5 most recent items — arbitrary, often irrelevant.
**Solution (MVP):**
- Add user's city to Google News search query → location-relevant results
- Reduce from 5 to 3 items (morning brief = concise)
- Future: LLM-based ranking/summarization (paid feature, adds cost + latency)

#### 8.5 — Multi-User Scalability: Weather/News Caching per City
**Status:** Not started
**Problem:** If 10 users are in Moscow, n8n makes 10 identical weather + news API calls.
**Solution:**
- Cache weather and news responses per city within a single workflow execution run
- In n8n: before API call, check if city was already fetched → reuse cached result
- Biggest performance win: N users in same city = 1 API call instead of N

#### 8.6 — Google Calendar: Leave as Optional
**Status:** Parked (decision made)
**Decision:** Too many permissions for new users. Leave as optional feature. Revisit if users request it.

---

## What's NOT in MVP (future / paid version)

- Audio podcast version (multi-speaker TTS)
- News topic/category preferences
- Multiple calendar support
- Subscription payments
- Custom prompt/tone settings

---

## Current Status

| Stage | Status | Notes |
|---|---|---|
| Stage 1 — Skeleton & DB | **DONE** | Backend runs, DB created, health endpoint works |
| Stage 2 — Landing + TG Login | **DONE** | Landing page, TG widget, auth endpoint, JWT |
| Stage 3 — Onboarding | **DONE** | Location, time picker, bot connect, prefs API |
| Stage 4 — Telegram Bot | **DONE** | /start handler, welcome msg, DB update |
| Stage 5 — Google Calendar | **DONE** | OAuth flow deployed, calendar connected |
| Stage 6 — n8n Workflow (Text MVP) | **DONE** | Importable JSON generated, backend API updated |
| Stage 7 — Settings Page | Not started | |
| Stage 8 — Fine-Tuning | Not started | See details below |

---

## Resolved Questions

- [x] Does Beget support Node.js apps? **Yes** (per Beget docs)
- [x] Does Beget have SSH + git access? **Yes** — SSH via PuTTY, git installable on Ubuntu VPS
- [x] Enough disk space? **Yes** — 5.7 GB free, app needs ~50 MB
- [x] Separate DB server? **No** — SQLite file on same VPS is fine for MVP

## Open Questions

- [x] What Telegram bot name/token to use? **Existing bot, token stored in .env**
- [x] Google Cloud project for OAuth2 — **Exists, Calendar API enabled**
