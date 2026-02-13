require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const TelegramBot = require('node-telegram-bot-api');
const Database = require('better-sqlite3');
const path = require('path');

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token || token === 'your_bot_token_here') {
  console.error('ERROR: Set your TELEGRAM_BOT_TOKEN in the .env file first!');
  process.exit(1);
}

// Same database as the backend
const dbPath = path.join(__dirname, '..', 'morning_brief.db');
const db = new Database(dbPath);

const bot = new TelegramBot(token, { polling: true });

console.log('Morning Brief Bot started (polling)...');

// /start command — user connects the bot
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id;
  const name = msg.from.first_name || 'друг';

  // Check if user exists in DB (registered via web app)
  const user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId);

  if (user) {
    // Mark bot as connected
    db.prepare('UPDATE users SET is_bot_started = 1 WHERE telegram_id = ?').run(telegramId);

    const time = user.send_time || '07:00';
    const needsSetup = !user.city || !user.send_time;

    if (needsSetup) {
      bot.sendMessage(chatId,
        `Привет, ${name}! Бот подключён ✅\n\n` +
        `Осталось настроить город и время — это займёт минуту.`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '⚙️ Настроить бриф', url: 'https://brief.rusvet.online/onboarding.html' }
            ]]
          }
        }
      );
    } else {
      bot.sendMessage(chatId,
        `Привет, ${name}! Бот подключён ✅\n\n` +
        `Ваш утренний брифинг будет приходить каждый день в ${time}.`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '⚙️ Настройки', url: 'https://brief.rusvet.online/onboarding.html' }
            ]]
          }
        }
      );
    }
  } else {
    // User hasn't registered via web app yet
    bot.sendMessage(chatId,
      `Привет, ${name}! Чтобы получать утренние брифинги, войдите через Telegram на нашем сайте — это займёт пару секунд.`,
      {
        reply_markup: {
          inline_keyboard: [[
            { text: '🚀 Войти на сайте', url: 'https://brief.rusvet.online' }
          ]]
        }
      }
    );
  }
});

// Handle any other message
bot.on('message', (msg) => {
  if (msg.text && msg.text.startsWith('/start')) return; // already handled above

  bot.sendMessage(msg.chat.id,
    'Я отправляю утренние брифинги автоматически. Настройки — по кнопке ниже.',
    {
      reply_markup: {
        inline_keyboard: [[
          { text: '⚙️ Настройки', url: 'https://brief.rusvet.online/onboarding.html' }
        ]]
      }
    }
  );
});
