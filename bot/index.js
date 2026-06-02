require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const TelegramBot = require('node-telegram-bot-api');
const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token || token === 'your_bot_token_here') {
  console.error('ERROR: Set your TELEGRAM_BOT_TOKEN in the .env file first!');
  process.exit(1);
}

// Same database as the backend
const dbPath = path.join(__dirname, '..', 'morning_brief.db');
const db = new Database(dbPath);

const bot = new TelegramBot(token, { polling: true });

const BASE_URL = process.env.BASE_URL || 'https://brief.aiiiru.com';

console.log('Morning Brief Bot started (polling)...');

// ---- Auth token helpers (same table as backend) ----

function generateSettingsLink(userId) {
  const tokenBytes = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min

  // Clean up expired tokens
  db.prepare("DELETE FROM auth_tokens WHERE expires_at < datetime('now')").run();
  db.prepare('INSERT INTO auth_tokens (token, user_id, expires_at) VALUES (?, ?, ?)').run(tokenBytes, userId, expiresAt);

  return `${BASE_URL}/onboarding.html?token=${tokenBytes}`;
}

// /start command — user connects the bot
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id;
  const name = msg.from.first_name || 'друг';

  // Upsert user: create if new, update if existing
  const existing = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId);

  if (existing) {
    db.prepare('UPDATE users SET is_bot_started = 1 WHERE telegram_id = ?').run(telegramId);
  } else {
    db.prepare('INSERT INTO users (telegram_id, telegram_name, is_bot_started) VALUES (?, ?, 1)')
      .run(telegramId, name);
  }

  const user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId);
  const settingsUrl = generateSettingsLink(user.id);

  const needsSetup = !user.city || !user.send_time;

  if (needsSetup) {
    bot.sendMessage(chatId,
      `Привет, ${name}! 👋\n\n` +
      `Чтобы получать утренний брифинг — настройте город, время отправки и (по желанию) Google Календарь.\n\n` +
      `Там же можно отправить себе тестовое сообщение, чтобы сразу увидеть, как выглядит бриф 👇`,
      {
        reply_markup: {
          inline_keyboard: [[
            { text: '⚙️ Настроить брифинг', url: settingsUrl }
          ]]
        }
      }
    );
  } else {
    bot.sendMessage(chatId,
      `Привет, ${name}! 👋\n\n` +
      `В настройках можно изменить город, время отправки, подключить Google Календарь — или отправить себе тестовый бриф прямо сейчас 👇`,
      {
        reply_markup: {
          inline_keyboard: [[
            { text: '⚙️ Настройки', url: settingsUrl }
          ]]
        }
      }
    );
  }
});

// Handle any other message — also send settings link
bot.on('message', (msg) => {
  if (msg.text && msg.text.startsWith('/start')) return; // already handled above

  const telegramId = msg.from.id;
  const user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId);

  if (user) {
    const settingsUrl = generateSettingsLink(user.id);
    bot.sendMessage(msg.chat.id,
      'Я отправляю утренние брифинги автоматически. Настройки — по кнопке ниже.',
      {
        reply_markup: {
          inline_keyboard: [[
            { text: '⚙️ Настройки', url: settingsUrl }
          ]]
        }
      }
    );
  } else {
    // Edge case: user messages bot without /start — create them
    const name = msg.from.first_name || 'друг';
    db.prepare('INSERT INTO users (telegram_id, telegram_name, is_bot_started) VALUES (?, ?, 1)')
      .run(telegramId, name);
    const newUser = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId);
    const settingsUrl = generateSettingsLink(newUser.id);

    bot.sendMessage(msg.chat.id,
      `Привет, ${name}! Чтобы получать утренний брифинг, настройте город и время отправки 👇`,
      {
        reply_markup: {
          inline_keyboard: [[
            { text: '⚙️ Настроить брифинг', url: settingsUrl }
          ]]
        }
      }
    );
  }
});
