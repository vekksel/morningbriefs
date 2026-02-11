const API = window.location.origin;

// ---- Auth helpers ----

function saveAuth(token, user) {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
}

function getAuth() {
  const token = localStorage.getItem('token');
  const user = localStorage.getItem('user');
  if (token && user) {
    return { token, user: JSON.parse(user) };
  }
  return null;
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.reload();
}

// ---- Telegram Login callback ----
// This function is called by the Telegram Login Widget after user logs in
window.onTelegramAuth = async function (tgUser) {
  try {
    const res = await fetch(`${API}/api/auth/telegram`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tgUser),
    });

    if (!res.ok) {
      const err = await res.json();
      alert('Login failed: ' + (err.error || 'Unknown error'));
      return;
    }

    const data = await res.json();
    saveAuth(data.token, data.user);
    showLoggedIn(data.user);
  } catch (e) {
    alert('Login failed: network error');
    console.error(e);
  }
};

// ---- UI state ----

function showLoggedIn(user) {
  document.querySelector('.landing').classList.add('hidden');
  const welcome = document.querySelector('.welcome');
  welcome.classList.add('visible');
  document.getElementById('user-name').textContent = user.telegramName || 'there';
}

// ---- On page load ----

async function init() {
  // Check if already logged in
  const auth = getAuth();
  if (auth) {
    showLoggedIn(auth.user);
    return;
  }

  // Load Telegram Login Widget dynamically
  try {
    const res = await fetch(`${API}/api/config`);
    const config = await res.json();

    const container = document.getElementById('telegram-login');

    // On localhost, Telegram widget won't work (needs real domain).
    // Show a dev test login button instead.
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = 'Test Login (dev mode)';
      btn.onclick = async () => {
        const r = await fetch(`${API}/api/auth/dev`, { method: 'POST' });
        const data = await r.json();
        saveAuth(data.token, data.user);
        showLoggedIn(data.user);
      };
      container.appendChild(btn);

      const note = document.createElement('p');
      note.style.cssText = 'color:#f0ad4e;font-size:0.8rem;margin-top:8px;';
      note.textContent = 'Dev mode — real Telegram Login will work after deploying to your domain';
      container.appendChild(note);
    } else {
      const script = document.createElement('script');
      script.src = 'https://telegram.org/js/telegram-widget.js?22';
      script.setAttribute('data-telegram-login', config.botUsername);
      script.setAttribute('data-size', 'large');
      script.setAttribute('data-radius', '10');
      script.setAttribute('data-onauth', 'onTelegramAuth(user)');
      script.setAttribute('data-request-access', 'write');
      container.appendChild(script);
    }
  } catch (e) {
    console.error('Failed to load config:', e);
  }
}

init();
