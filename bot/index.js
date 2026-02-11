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
    bot.sendMessage(chatId,
      `Привет, ${name}! Бот подключён.\n\n` +
      `Ваш утренний брифинг будет приходить каждый день в ${time}.\n\n` +
      `Можете вернуться на сайт — там появится зелёная галочка.`
    );
  } else {
    // User hasn't registered via web app yet
    bot.sendMessage(chatId,
      `Привет, ${name}! Чтобы начать, зарегистрируйтесь на сайте Morning Brief, ` +
      `а потом вернитесь сюда и нажмите /start ещё раз.`
    );
  }
});

// Handle any other message
bot.on('message', (msg) => {
  if (msg.text && msg.text.startsWith('/start')) return; // already handled above

  bot.sendMessage(msg.chat.id,
    'Я отправляю утренние брифинги автоматически. Управлять настройками можно на сайте.'
  );
});
