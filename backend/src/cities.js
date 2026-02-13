const express = require('express');
const router = express.Router();
const db = require('./database');

// GET /api/cities — public, no auth required
router.get('/', (req, res) => {
  const cities = db.prepare('SELECT name_ru, name_en, lat, lon FROM cities ORDER BY name_ru').all();
  res.json(cities);
});

module.exports = router;
