require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');
const authRouter = require('./auth');
const userRouter = require('./users');
const n8nRouter = require('./n8n');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve frontend static files
app.use(express.static(path.join(__dirname, '..', '..', 'frontend')));

// Public config (only non-secret values!)
app.get('/api/config', (req, res) => {
  res.json({
    botUsername: process.env.TELEGRAM_BOT_USERNAME,
  });
});

// Auth routes
app.use('/api/auth', authRouter);

// User routes
app.use('/api/user', userRouter);

// n8n-facing routes (API key auth)
app.use('/api/n8n', n8nRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Get count of registered users (handy for quick checks)
app.get('/api/stats', (req, res) => {
  const row = db.prepare('SELECT COUNT(*) as count FROM users').get();
  res.json({ users: row.count });
});

app.listen(PORT, () => {
  console.log(`Morning Brief API running on http://localhost:${PORT}`);
});
