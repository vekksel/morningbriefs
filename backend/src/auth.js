const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('./database');

/**
 * Verify that login data actually came from Telegram.
 * Algorithm: https://core.telegram.org/widgets/login#checking-authorization
 */
function verifyTelegramLogin(data) {
  const { hash, ...rest } = data;
  if (!hash) return false;

  // Build check string: sorted "key=value" pairs joined by \n
  const checkString = Object.keys(rest)
    .sort()
    .map(key => `${key}=${rest[key]}`)
    .join('\n');

  // Secret key = SHA256 of bot token
  const secretKey = crypto
    .createHash('sha256')
    .update(process.env.TELEGRAM_BOT_TOKEN)
    .digest();

  // HMAC-SHA256 of the check string
  const hmac = crypto
    .createHmac('sha256', secretKey)
    .update(checkString)
    .digest('hex');

  return hmac === hash;
}

/**
 * Check that auth_date is not too old (max 1 day)
 */
function isAuthFresh(authDate) {
  const now = Math.floor(Date.now() / 1000);
  return now - authDate < 86400; // 24 hours
}

/**
 * Express router for auth endpoints
 */
const express = require('express');
const router = express.Router();

// POST /api/auth/telegram — verify login & return JWT
router.post('/telegram', (req, res) => {
  const data = req.body;

  if (!verifyTelegramLogin(data)) {
    return res.status(401).json({ error: 'Invalid Telegram login data' });
  }

  if (!isAuthFresh(data.auth_date)) {
    return res.status(401).json({ error: 'Login expired, please try again' });
  }

  // Upsert user: create if new, update name if existing
  const telegramId = Number(data.id);
  const telegramName = [data.first_name, data.last_name].filter(Boolean).join(' ');

  const existing = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId);

  if (existing) {
    db.prepare('UPDATE users SET telegram_name = ? WHERE telegram_id = ?')
      .run(telegramName, telegramId);
  } else {
    db.prepare('INSERT INTO users (telegram_id, telegram_name) VALUES (?, ?)')
      .run(telegramId, telegramName);
  }

  const user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId);

  // Create JWT
  const token = jwt.sign(
    { userId: user.id, telegramId: user.telegram_id },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );

  res.json({
    token,
    user: {
      id: user.id,
      telegramId: user.telegram_id,
      telegramName: user.telegram_name,
      city: user.city,
      sendTime: user.send_time,
      isBotStarted: !!user.is_bot_started,
      hasCalendar: !!user.google_refresh_token,
    },
  });
});

// POST /api/auth/dev — test login for local development (no Telegram needed)
router.post('/dev', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }

  const telegramId = 999999999;
  const telegramName = 'Test User';

  const existing = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId);
  if (!existing) {
    db.prepare('INSERT INTO users (telegram_id, telegram_name) VALUES (?, ?)')
      .run(telegramId, telegramName);
  }

  const user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId);

  const token = jwt.sign(
    { userId: user.id, telegramId: user.telegram_id },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );

  res.json({
    token,
    user: {
      id: user.id,
      telegramId: user.telegram_id,
      telegramName: user.telegram_name,
      city: user.city,
      sendTime: user.send_time,
      isBotStarted: !!user.is_bot_started,
      hasCalendar: !!user.google_refresh_token,
    },
  });
});

module.exports = router;
