/**
 * app.js — Telegram Web Client
 * Common utilities used across all pages
 */

// ── THEME ────────────────────────────────────────────────────────────────────
(function applyTheme(){
  const t = localStorage.getItem('tg-theme') || '';
  const el = document.getElementById('app') || document.getElementById('pg') || document.body;
  if (el) el.dataset.theme = t;
})();

// ── TOAST ────────────────────────────────────────────────────────────────────
let _toastTimer;
function showToast(msg, isError = false) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    document.body.appendChild(t);
    t.style.cssText = [
      'position:fixed', 'bottom:24px', 'left:50%',
      'transform:translateX(-50%) translateY(20px)',
      'padding:10px 20px', 'border-radius:8px',
      'font-size:14px', 'z-index:9999', 'opacity:0',
      'transition:all .3s', 'pointer-events:none', 'white-space:nowrap',
      'font-family:Roboto,system-ui,sans-serif', 'color:#fff'
    ].join(';');
  }
  t.textContent = msg;
  t.style.background = isError ? '#C0392B' : '#323234';
  t.style.opacity = '1';
  t.style.transform = 'translateX(-50%) translateY(0)';
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    t.style.opacity = '0';
    t.style.transform = 'translateX(-50%) translateY(20px)';
  }, 3000);
}

// ── FETCH JSON ────────────────────────────────────────────────────────────────
async function postJSON(url, data = {}) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return r.json();
}

// ── AVATAR UTILS ──────────────────────────────────────────────────────────────
const _AVATAR_COLORS = [
  '#2AABEE','#179CDE','#2CA5E0','#00A884',
  '#5ECA5A','#E44438','#FE7F2D','#9B59B6',
];
function avatarColor(id) {
  return _AVATAR_COLORS[Math.abs(parseInt(id) || 0) % _AVATAR_COLORS.length];
}
function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts.length === 1
    ? parts[0][0].toUpperCase()
    : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ── ESCAPE HTML ───────────────────────────────────────────────────────────────
function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── SOCKET.IO HELPERS ─────────────────────────────────────────────────────────
let _socket = null;
function getSocket() {
  if (!_socket) {
    _socket = io({ transports: ['websocket', 'polling'] });
    _socket.on('connect', () => console.log('[Socket] connected:', _socket.id));
    _socket.on('disconnect', () => console.log('[Socket] disconnected'));
  }
  return _socket;
}

// ── NOTIFICATION ──────────────────────────────────────────────────────────────
function sendNotification(title, body, icon = '/static/favicon.svg') {
  if (localStorage.getItem('tg-notif') === 'false') return;
  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon });
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(p => {
      if (p === 'granted') new Notification(title, { body, icon });
    });
  }
}

// ── LOGOUT ────────────────────────────────────────────────────────────────────
async function doLogout() {
  if (!confirm('Sign out of Telegram?')) return;
  try { await fetch('/api/auth/logout', { method: 'POST' }); } catch (e) {}
  window.location.href = '/login';
}
