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
  window.location.href = '/onboarding.html';
}

// ---- Load Telegram widget into a container ----

function loadTelegramWidget(container, botUsername) {
  const script = document.createElement('script');
  script.src = 'https://telegram.org/js/telegram-widget.js?22';
  script.setAttribute('data-telegram-login', botUsername);
  script.setAttribute('data-size', 'large');
  script.setAttribute('data-radius', '10');
  script.setAttribute('data-onauth', 'onTelegramAuth(user)');
  script.setAttribute('data-request-access', 'write');
  container.appendChild(script);
}

function loadDevButton(container) {
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
  note.style.cssText = 'color:#E8720C;font-size:0.8rem;margin-top:8px;';
  note.textContent = 'Dev mode — real Telegram Login will work after deploying to your domain';
  container.appendChild(note);
}

// ---- Scroll animations ----

function initScrollAnimations() {
  const sections = document.querySelectorAll('.section');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('fade-in');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  sections.forEach(section => {
    section.style.opacity = '0';
    section.style.transform = 'translateY(24px)';
    section.style.transition = 'opacity 0.7s ease, transform 0.7s ease';
    observer.observe(section);
  });

  // Add the fade-in style dynamically
  const style = document.createElement('style');
  style.textContent = '.fade-in { opacity: 1 !important; transform: translateY(0) !important; }';
  document.head.appendChild(style);
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

    const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    // Hero login widget
    const heroContainer = document.getElementById('telegram-login');
    if (heroContainer) {
      if (isDev) {
        loadDevButton(heroContainer);
      } else {
        loadTelegramWidget(heroContainer, config.botUsername);
      }
    }

    // Bottom CTA login widget
    const bottomContainer = document.getElementById('telegram-login-bottom');
    if (bottomContainer) {
      if (isDev) {
        loadDevButton(bottomContainer);
      } else {
        loadTelegramWidget(bottomContainer, config.botUsername);
      }
    }
  } catch (e) {
    console.error('Failed to load config:', e);
  }

  // Initialize scroll animations
  initScrollAnimations();
}

init();
