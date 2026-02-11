const express = require('express');
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

  // Filter: keep only users whose send_time matches current time in their timezone
  // AND whose brief hasn't already been sent today (prevents duplicate sends)
  const dueUsers = users.filter(user => {
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

module.exports = router;
