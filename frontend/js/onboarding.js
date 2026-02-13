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
let calendarDone = false;

const prefs = {
  city: null,
  lat: null,
  lon: null,
  timezone: null,
  sendTime: '07:00',
};

// ---- Step 1: Location ----

let citiesList = [];

async function loadCities() {
  try {
    const res = await fetch(`${API}/api/cities`);
    citiesList = await res.json();
  } catch (e) {
    console.error('Failed to load cities:', e);
  }
}

function selectCity(city) {
  prefs.city = city.name_ru;
  prefs.lat = city.lat;
  prefs.lon = city.lon;
  prefs.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  document.getElementById('city-input').value = city.name_ru;
  document.getElementById('city-dropdown').classList.add('hidden');
  showLocationResult(city.name_ru);
}

function initAutocomplete() {
  const input = document.getElementById('city-input');
  const dropdown = document.getElementById('city-dropdown');

  input.addEventListener('input', () => {
    const query = input.value.trim().toLowerCase();
    if (query.length < 2) {
      dropdown.classList.add('hidden');
      return;
    }

    const matches = citiesList
      .filter(c => c.name_ru.toLowerCase().startsWith(query))
      .slice(0, 8);

    if (matches.length === 0) {
      dropdown.classList.add('hidden');
      return;
    }

    dropdown.innerHTML = '';
    matches.forEach(city => {
      const item = document.createElement('div');
      item.className = 'city-dropdown-item';
      item.textContent = city.name_ru;
      item.addEventListener('click', () => selectCity(city));
      dropdown.appendChild(item);
    });
    dropdown.classList.remove('hidden');
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.city-autocomplete')) {
      dropdown.classList.add('hidden');
    }
  });
}

// Haversine distance in km
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function findNearestCity(lat, lon) {
  let nearest = null;
  let minDist = Infinity;
  for (const city of citiesList) {
    const dist = haversineDistance(lat, lon, city.lat, city.lon);
    if (dist < minDist) {
      minDist = dist;
      nearest = city;
    }
  }
  return nearest;
}

async function detectLocation() {
  const status = document.getElementById('detect-status');
  status.classList.remove('hidden', 'error');
  status.textContent = 'Определяем...';

  if (!navigator.geolocation) {
    status.textContent = 'Геолокация не поддерживается. Выберите город из списка.';
    status.classList.add('error');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      const nearest = findNearestCity(lat, lon);

      if (nearest) {
        status.classList.add('hidden');
        selectCity(nearest);
      } else {
        status.textContent = 'Не удалось определить город. Выберите из списка.';
        status.classList.add('error');
      }
    },
    () => {
      status.textContent = 'Не удалось определить. Выберите город из списка.';
      status.classList.add('error');
    },
    { timeout: 10000 }
  );
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

// ---- Step 4: Google Calendar (optional) ----

function initCalendarStep() {
  const user = getUser();
  const token = getToken();
  if (!token) return;

  // Set connect button URL
  const link = document.getElementById('calendar-link');
  link.href = `${API}/api/auth/google?token=${token}`;

  // Check URL params (returning from Google OAuth)
  const params = new URLSearchParams(window.location.search);
  const calendarStatus = params.get('calendar');

  if (calendarStatus === 'connected') {
    onCalendarConnected();
    // Clean URL
    window.history.replaceState({}, '', window.location.pathname);
    return;
  }

  if (calendarStatus === 'denied') {
    skipCalendar('Доступ отклонён');
    window.history.replaceState({}, '', window.location.pathname);
    return;
  }

  if (calendarStatus === 'error') {
    skipCalendar('Ошибка подключения');
    window.history.replaceState({}, '', window.location.pathname);
    return;
  }

  // If already connected (returning user), show result
  if (user && user.hasCalendar) {
    onCalendarConnected();
  }
}

function onCalendarConnected() {
  const resultBox = document.getElementById('calendar-result');
  document.getElementById('calendar-text').textContent = 'Календарь подключён';
  resultBox.classList.remove('hidden');
  document.getElementById('calendar-link').classList.add('hidden');
  const skipLink = document.querySelector('#step-4 .skip-link');
  if (skipLink) skipLink.classList.add('hidden');
  calendarDone = true;
  checkAllDone();
}

function skipCalendar(text) {
  const resultBox = document.getElementById('calendar-result');
  document.getElementById('calendar-text').textContent = text || 'Пропущено';
  resultBox.classList.remove('hidden');
  document.getElementById('calendar-link').classList.add('hidden');
  const skipLink = document.querySelector('#step-4 .skip-link');
  if (skipLink) skipLink.classList.add('hidden');
  calendarDone = true;
  checkAllDone();
}

function checkAllDone() {
  if (locationDone && timeDone && botDone && calendarDone) {
    document.getElementById('done-section').classList.remove('hidden');
    document.getElementById('done-time').textContent = prefs.sendTime;
  }
}

// ---- Init ----
loadCities().then(() => initAutocomplete());
initBotStep();
initCalendarStep();
