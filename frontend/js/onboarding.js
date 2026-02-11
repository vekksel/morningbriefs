const API = window.location.origin;

// ---- Auth ----

function getToken() {
  return localStorage.getItem('token');
}

function getUser() {
  const u = localStorage.getItem('user');
  return u ? JSON.parse(u) : null;
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + getToken(),
  };
}

// Redirect to login if not authenticated
if (!getToken()) {
  window.location.href = '/';
}

// ---- State ----

let locationDone = false;
let timeDone = false;
let botDone = false;

const prefs = {
  city: null,
  lat: null,
  lon: null,
  timezone: null,
  sendTime: '07:00',
};

// ---- Step 1: Location ----

async function detectLocation() {
  const status = document.getElementById('detect-status');
  status.classList.remove('hidden', 'error');
  status.textContent = 'Определяем...';

  if (!navigator.geolocation) {
    status.textContent = 'Геолокация не поддерживается в этом браузере. Введите город вручную.';
    status.classList.add('error');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      prefs.lat = Math.round(pos.coords.latitude * 10000) / 10000;
      prefs.lon = Math.round(pos.coords.longitude * 10000) / 10000;

      // Reverse geocode via OpenStreetMap Nominatim (free, no API key)
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${prefs.lat}&lon=${prefs.lon}&format=json&accept-language=ru`
        );
        const data = await res.json();
        const addr = data.address || {};
        prefs.city = addr.city || addr.town || addr.village || addr.state || 'Unknown';
      } catch {
        prefs.city = `${prefs.lat}, ${prefs.lon}`;
      }

      // Detect timezone from coordinates
      prefs.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      status.classList.add('hidden');
      showLocationResult(prefs.city);
    },
    (err) => {
      status.textContent = 'Не удалось определить. Введите город вручную.';
      status.classList.add('error');
    },
    { timeout: 10000 }
  );
}

async function manualCity() {
  const input = document.getElementById('city-input');
  const city = input.value.trim();
  if (!city) return;

  prefs.city = city;
  prefs.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  // lat/lon will be looked up by n8n using city name
  prefs.lat = null;
  prefs.lon = null;

  showLocationResult(city);
}

function showLocationResult(city) {
  const resultBox = document.getElementById('location-result');
  document.getElementById('location-text').textContent = city;
  resultBox.classList.remove('hidden');
  locationDone = true;
  savePrefs();
}

// ---- Step 2: Send time ----

function saveTime() {
  const input = document.getElementById('send-time');
  prefs.sendTime = input.value;

  const resultBox = document.getElementById('time-result');
  document.getElementById('time-text').textContent = `Каждый день в ${prefs.sendTime}`;
  resultBox.classList.remove('hidden');
  timeDone = true;
  savePrefs();
}

// ---- Step 3: Bot connection ----

function initBotStep() {
  const user = getUser();
  if (!user) return;

  const link = document.getElementById('bot-link');
  // Deep link with user's telegram_id so bot knows who started it
  link.href = `https://t.me/mymorningbriefsbot?start=${user.telegramId}`;

  // If already connected, show result immediately
  if (user.isBotStarted) {
    onBotConnected();
    return;
  }

  // Poll every 3 seconds to check if user started the bot
  const interval = setInterval(async () => {
    try {
      const res = await fetch(`${API}/api/user`, { headers: authHeaders() });
      const data = await res.json();
      if (data.isBotStarted) {
        clearInterval(interval);
        // Update stored user
        localStorage.setItem('user', JSON.stringify(data));
        onBotConnected();
      }
    } catch { /* ignore */ }
  }, 3000);
}

function onBotConnected() {
  document.getElementById('bot-status').classList.add('hidden');
  document.getElementById('bot-result').classList.remove('hidden');
  botDone = true;
  checkAllDone();
}

// ---- Save preferences ----

async function savePrefs() {
  try {
    const res = await fetch(`${API}/api/user/preferences`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(prefs),
    });
    const data = await res.json();
    localStorage.setItem('user', JSON.stringify(data));
  } catch (e) {
    console.error('Failed to save preferences:', e);
  }
  checkAllDone();
}

function checkAllDone() {
  if (locationDone && timeDone && botDone) {
    document.getElementById('done-section').classList.remove('hidden');
    document.getElementById('done-time').textContent = prefs.sendTime;
  }
}

// ---- Init ----
initBotStep();
