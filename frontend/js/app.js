const API = window.location.origin;

// ---- Auth helpers ----

function getAuth() {
  const token = localStorage.getItem('token');
  const user = localStorage.getItem('user');
  if (token && user) {
    return { token, user: JSON.parse(user) };
  }
  return null;
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

  const style = document.createElement('style');
  style.textContent = '.fade-in { opacity: 1 !important; transform: translateY(0) !important; }';
  document.head.appendChild(style);
}

// ---- On page load ----

function init() {
  // If already logged in, go to onboarding/settings
  const auth = getAuth();
  if (auth) {
    window.location.href = '/onboarding.html';
    return;
  }

  initScrollAnimations();
}

init();
