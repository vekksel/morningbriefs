const express = require('express');
const jwt = require('jsonwebtoken');
const { google } = require('googleapis');
const db = require('./database');
const { authRequired } = require('./middleware');

const router = express.Router();

function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

// GET /api/auth/google?token=JWT
// Redirects user to Google OAuth consent screen
router.get('/', (req, res) => {
  const token = req.query.token;
  if (!token) {
    return res.status(400).json({ error: 'Missing token parameter' });
  }

  // Verify JWT to make sure it's a valid user
  try {
    jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const oauth2Client = createOAuth2Client();
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar.events.readonly'],
    state: token, // pass JWT as state so we get it back in callback
  });

  res.redirect(url);
});

// GET /api/auth/google/callback
// Google redirects here after user approves/denies
router.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;

  // User denied access
  if (error) {
    return res.redirect('/onboarding.html?calendar=denied');
  }

  if (!code || !state) {
    return res.redirect('/onboarding.html?calendar=error');
  }

  // Verify state (JWT) to get userId
  let payload;
  try {
    payload = jwt.verify(state, process.env.JWT_SECRET);
  } catch {
    return res.redirect('/onboarding.html?calendar=error');
  }

  // Exchange code for tokens
  try {
    const oauth2Client = createOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      console.error('No refresh_token received from Google');
      return res.redirect('/onboarding.html?calendar=error');
    }

    // Save refresh token in DB
    db.prepare('UPDATE users SET google_refresh_token = ? WHERE id = ?')
      .run(tokens.refresh_token, payload.userId);

    res.redirect('/onboarding.html?calendar=connected');
  } catch (err) {
    console.error('Google OAuth token exchange error:', err.message);
    res.redirect('/onboarding.html?calendar=error');
  }
});

// POST /api/auth/google/disconnect
// Revokes Google access and clears token from DB
router.post('/disconnect', authRequired, async (req, res) => {
  const user = db.prepare('SELECT google_refresh_token FROM users WHERE id = ?')
    .get(req.userId);

  if (!user || !user.google_refresh_token) {
    return res.json({ ok: true }); // already disconnected
  }

  // Try to revoke the token at Google
  try {
    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials({ refresh_token: user.google_refresh_token });
    await oauth2Client.revokeToken(user.google_refresh_token);
  } catch (err) {
    // Token might already be revoked — that's fine, we still clear it
    console.log('Google revoke notice:', err.message);
  }

  // Clear token from DB
  db.prepare('UPDATE users SET google_refresh_token = NULL WHERE id = ?')
    .run(req.userId);

  res.json({ ok: true });
});

module.exports = router;
