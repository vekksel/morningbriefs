const express = require('express');
const db = require('./database');
const { authRequired } = require('./middleware');

const router = express.Router();

// GET /api/user — get current user's profile
router.get('/', authRequired, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
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
    isBotStarted: !!user.is_bot_started,
    hasCalendar: !!user.google_refresh_token,
  });
});

// PUT /api/user/preferences — update location, time, etc.
router.put('/preferences', authRequired, (req, res) => {
  const { city, lat, lon, timezone, sendTime } = req.body;

  const updates = [];
  const params = [];

  if (city !== undefined) { updates.push('city = ?'); params.push(city); }
  if (lat !== undefined) { updates.push('lat = ?'); params.push(lat); }
  if (lon !== undefined) { updates.push('lon = ?'); params.push(lon); }
  if (timezone !== undefined) { updates.push('timezone = ?'); params.push(timezone); }
  if (sendTime !== undefined) { updates.push('send_time = ?'); params.push(sendTime); }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  params.push(req.userId);
  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  res.json({
    id: user.id,
    telegramId: user.telegram_id,
    telegramName: user.telegram_name,
    city: user.city,
    lat: user.lat,
    lon: user.lon,
    timezone: user.timezone,
    sendTime: user.send_time,
    isBotStarted: !!user.is_bot_started,
    hasCalendar: !!user.google_refresh_token,
  });
});

module.exports = router;
