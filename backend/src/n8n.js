const express = require('express');
const { google } = require('googleapis');
const db = require('./database');

const router = express.Router();

// Simple API key check for n8n
function n8nAuth(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!key || key !== process.env.N8N_API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  next();
}

// GET /api/n8n/users/due — returns users whose brief should be sent right now
// n8n calls this every minute via cron
router.get('/users/due', n8nAuth, (req, res) => {
  // Get all active users (bot connected, have location set)
  const users = db.prepare(`
    SELECT id, telegram_id, telegram_name, city, lat, lon, timezone, send_time, google_refresh_token, last_brief_date
    FROM users
    WHERE is_bot_started = 1
      AND city IS NOT NULL
      AND lat IS NOT NULL
      AND lon IS NOT NULL
      AND timezone IS NOT NULL
  `).all();

  // ?test=true skips time filter (for manual testing / "Test bot" button)
  const skipTimeFilter = req.query.test === 'true';

  // Filter: keep only users whose send_time matches current time in their timezone
  // AND whose brief hasn't already been sent today (prevents duplicate sends)
  const dueUsers = users.filter(user => {
    if (skipTimeFilter) return true;

    try {
      const now = new Date();
      const userTime = now.toLocaleTimeString('en-GB', {
        timeZone: user.timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }); // e.g. "07:00"

      if (userTime !== user.send_time) return false;

      // Check if brief was already sent today in user's timezone
      if (user.last_brief_date) {
        const todayInUserTz = now.toLocaleDateString('en-CA', {
          timeZone: user.timezone,
        }); // "YYYY-MM-DD"
        if (user.last_brief_date === todayInUserTz) return false;
      }

      return true;
    } catch {
      // Invalid timezone — skip this user
      return false;
    }
  });

  res.json({
    count: dueUsers.length,
    users: dueUsers.map(u => ({
      id: u.id,
      telegramId: u.telegram_id,
      telegramName: u.telegram_name,
      city: u.city,
      lat: u.lat,
      lon: u.lon,
      timezone: u.timezone,
      sendTime: u.send_time,
      hasCalendar: !!u.google_refresh_token,
    })),
  });
});

// GET /api/n8n/users/:id — get full user data for a specific user (n8n may need this)
router.get('/users/:id', n8nAuth, (req, res) => {
  const user = db.prepare(`
    SELECT id, telegram_id, telegram_name, city, lat, lon, timezone, send_time, google_refresh_token
    FROM users WHERE id = ?
  `).get(req.params.id);

  if (!user) return res.status(404).json({ error: 'User not found' });

  res.json({
    id: user.id,
    telegramId: user.telegram_id,
    telegramName: user.telegram_name,
    city: user.city,
    lat: user.lat,
    lon: user.lon,
    timezone: user.timezone,
    sendTime: user.send_time,
    hasCalendar: !!user.google_refresh_token,
  });
});

// POST /api/n8n/users/:id/brief-sent — mark that today's brief was sent
router.post('/users/:id/brief-sent', n8nAuth, (req, res) => {
  const user = db.prepare('SELECT id, timezone FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Use user's timezone to determine "today"
  const now = new Date();
  const todayInUserTz = now.toLocaleDateString('en-CA', {
    timeZone: user.timezone || 'UTC',
  }); // "YYYY-MM-DD"

  db.prepare('UPDATE users SET last_brief_date = ? WHERE id = ?').run(todayInUserTz, user.id);

  res.json({ ok: true, date: todayInUserTz });
});

// GET /api/n8n/users/:id/calendar-events — today's Google Calendar events
router.get('/users/:id/calendar-events', n8nAuth, async (req, res) => {
  const user = db.prepare('SELECT google_refresh_token, timezone FROM users WHERE id = ?')
    .get(req.params.id);

  if (!user || !user.google_refresh_token) {
    return res.json({ events: [] });
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    oauth2Client.setCredentials({ refresh_token: user.google_refresh_token });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // Build today's start/end in user's timezone
    const tz = user.timezone || 'UTC';
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-CA', { timeZone: tz }); // "YYYY-MM-DD"

    // Calculate UTC offset for user's timezone
    const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
    const tzDate = new Date(now.toLocaleString('en-US', { timeZone: tz }));
    const offsetMin = Math.round((tzDate - utcDate) / 60000);
    const sign = offsetMin >= 0 ? '+' : '-';
    const absH = String(Math.floor(Math.abs(offsetMin) / 60)).padStart(2, '0');
    const absM = String(Math.abs(offsetMin) % 60).padStart(2, '0');
    const offsetStr = `${sign}${absH}:${absM}`;

    const timeMin = `${dateStr}T00:00:00${offsetStr}`;
    const timeMax = `${dateStr}T23:59:59${offsetStr}`;

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin,
      timeMax,
      timeZone: tz,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 20,
    });

    const events = (response.data.items || []).map(ev => {
      const isAllDay = !!ev.start.date;
      return {
        title: ev.summary || '(no title)',
        startTime: isAllDay ? ev.start.date : ev.start.dateTime,
        endTime: isAllDay ? ev.end.date : ev.end.dateTime,
        location: ev.location || null,
        isAllDay,
      };
    });

    res.json({ events });
  } catch (err) {
    // If token is revoked or expired, clear it and return empty
    if (err.code === 401 || err.code === 403 ||
        (err.response && (err.response.status === 401 || err.response.status === 403))) {
      console.log(`Clearing revoked Google token for user ${req.params.id}`);
      db.prepare('UPDATE users SET google_refresh_token = NULL WHERE id = ?')
        .run(req.params.id);
    } else {
      console.error('Calendar API error:', err.message);
    }
    res.json({ events: [] });
  }
});

// ---- Cached proxies (same city = 1 API call per 30 min) ----

const weatherCache = {};
const newsCache = {};
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// GET /api/n8n/weather?lat=X&lon=Y — cached OpenWeatherMap proxy
router.get('/weather', n8nAuth, async (req, res) => {
  const { lat, lon } = req.query;
  if (!lat || !lon) return res.status(400).json({ error: 'lat and lon required' });

  const key = `${lat},${lon}`;
  const now = Date.now();

  if (weatherCache[key] && (now - weatherCache[key].ts) < CACHE_TTL) {
    return res.json(weatherCache[key].data);
  }

  try {
    const apiKey = process.env.OPENWEATHERMAP_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'OPENWEATHERMAP_API_KEY not set' });

    const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&cnt=3&lang=ru&appid=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    // Only cache successful responses (don't cache API errors)
    if (data.cod === '200' || data.cod === 200) {
      weatherCache[key] = { data, ts: now };
    }
    res.json(data);
  } catch (e) {
    console.error('Weather proxy error:', e.message);
    res.status(502).json({ error: 'Weather fetch failed' });
  }
});

// GET /api/n8n/news?city=X — cached Google News RSS proxy
router.get('/news', n8nAuth, async (req, res) => {
  const { city } = req.query;
  if (!city) return res.status(400).json({ error: 'city required' });

  const key = city.toLowerCase();
  const now = Date.now();

  if (newsCache[key] && (now - newsCache[key].ts) < CACHE_TTL) {
    return res.type('text/xml').send(newsCache[key].data);
  }

  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(city)}&hl=ru-RU&gl=RU&ceid=RU:ru`;
    const response = await fetch(url);
    const text = await response.text();

    newsCache[key] = { data: text, ts: now };
    res.type('text/xml').send(text);
  } catch (e) {
    console.error('News proxy error:', e.message);
    res.status(502).json({ error: 'News fetch failed' });
  }
});

module.exports = router;
