"""PWA de eventos — /events

Rutas:
  GET  /events              → Login page (PWA, mobile-first, navy futurista)
  GET  /events/manifest.json → Web App Manifest
  GET  /events/sw.js        → Service Worker
  GET  /events/verify-token → Verifica token (query: ?token=xxx)
"""

import logging

from fastapi import APIRouter, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse, Response

from app.core.config import get_settings

logger = logging.getLogger(__name__)
router = APIRouter()
settings = get_settings()


def _is_token_valid(token: str) -> bool:
    """Verifica si el token es válido (mismo que el debug panel)."""
    if not token:
        return False
    allowed = set(filter(None, [
        settings.KAPSO_DEBUG_TOKEN,
        settings.KAPSO_INTERNAL_TOKEN,
    ]))
    return token in allowed


# ─────────────────────────────────────────────────────────────
# Verify token endpoint
# ─────────────────────────────────────────────────────────────

@router.get("/events/verify-token")
async def verify_token(token: str = Query(default="")):
    if _is_token_valid(token):
        return JSONResponse({"ok": True})
    return JSONResponse({"ok": False, "error": "Token inválido"}, status_code=401)


# ─────────────────────────────────────────────────────────────
# PWA Manifest
# ─────────────────────────────────────────────────────────────

@router.get("/events/manifest.json")
async def pwa_manifest():
    manifest = {
        "name": "URPE AI Events",
        "short_name": "URPE Events",
        "description": "Panel de eventos en tiempo real — URPE AI Lab",
        "start_url": "/events",
        "display": "standalone",
        "background_color": "#080c1e",
        "theme_color": "#0d1b4b",
        "orientation": "portrait",
        "icons": [
            {
                "src": "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 192 192'><rect width='192' height='192' rx='32' fill='%230d1b4b'/><text x='96' y='130' font-size='100' text-anchor='middle' fill='%2338bdf8'>⚡</text></svg>",
                "sizes": "192x192",
                "type": "image/svg+xml",
            }
        ],
    }
    return JSONResponse(manifest, headers={"Content-Type": "application/manifest+json"})


# ─────────────────────────────────────────────────────────────
# Service Worker
# ─────────────────────────────────────────────────────────────

_SW_JS = """
const CACHE = 'urpe-events-v1';
const OFFLINE = ['/events'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(OFFLINE)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match('/events'))
    );
  }
});
"""


@router.get("/events/sw.js")
async def service_worker():
    return Response(
        content=_SW_JS,
        media_type="application/javascript",
        headers={"Cache-Control": "no-cache"},
    )


# ─────────────────────────────────────────────────────────────
# Login Page
# ─────────────────────────────────────────────────────────────

_LOGIN_HTML = """<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <meta name="theme-color" content="#080c1e">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="URPE Events">
  <link rel="manifest" href="/events/manifest.json">
  <title>URPE AI — Events</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --navy-950: #050919;
      --navy-900: #080c1e;
      --navy-800: #0d1535;
      --navy-700: #0d1b4b;
      --navy-600: #0f2460;
      --blue-400: #38bdf8;
      --blue-300: #7dd3fc;
      --blue-200: #bae6fd;
      --blue-glow: rgba(56, 189, 248, 0.35);
      --blue-glow-soft: rgba(56, 189, 248, 0.12);
      --cyan-400: #22d3ee;
      --text-primary: #e2e8f0;
      --text-muted: #64748b;
      --text-dim: #94a3b8;
      --border: rgba(56, 189, 248, 0.18);
      --border-focus: rgba(56, 189, 248, 0.7);
      --glass: rgba(13, 27, 75, 0.55);
      --error: #f87171;
    }

    html, body {
      height: 100%;
      width: 100%;
      overflow: hidden;
    }

    body {
      background: var(--navy-900);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      color: var(--text-primary);
      position: relative;
    }

    /* ── Animated background grid ── */
    .bg-grid {
      position: fixed;
      inset: 0;
      background-image:
        linear-gradient(rgba(56,189,248,0.06) 1px, transparent 1px),
        linear-gradient(90deg, rgba(56,189,248,0.06) 1px, transparent 1px);
      background-size: 48px 48px;
      animation: grid-drift 20s linear infinite;
      z-index: 0;
    }

    @keyframes grid-drift {
      0%   { transform: translate(0, 0); }
      100% { transform: translate(48px, 48px); }
    }

    /* ── Glowing orbs ── */
    .orb {
      position: fixed;
      border-radius: 50%;
      filter: blur(80px);
      z-index: 0;
      pointer-events: none;
      animation: orb-float 8s ease-in-out infinite alternate;
    }

    .orb-1 {
      width: 320px; height: 320px;
      background: radial-gradient(circle, rgba(13,52,144,0.6) 0%, transparent 70%);
      top: -80px; left: -80px;
    }

    .orb-2 {
      width: 260px; height: 260px;
      background: radial-gradient(circle, rgba(6,128,193,0.45) 0%, transparent 70%);
      bottom: -60px; right: -60px;
      animation-delay: -4s;
    }

    .orb-3 {
      width: 180px; height: 180px;
      background: radial-gradient(circle, rgba(34,211,238,0.25) 0%, transparent 70%);
      top: 40%; left: 60%;
      animation-delay: -2s;
    }

    @keyframes orb-float {
      0%   { transform: translate(0, 0) scale(1); }
      100% { transform: translate(20px, -30px) scale(1.08); }
    }

    /* ── Scan line ── */
    .scanline {
      position: fixed;
      top: 0; left: 0; right: 0;
      height: 2px;
      background: linear-gradient(90deg, transparent, var(--blue-400), transparent);
      animation: scan 5s linear infinite;
      opacity: 0.4;
      z-index: 1;
    }

    @keyframes scan {
      0%   { top: -2px; }
      100% { top: 100vh; }
    }

    /* ── Login card ── */
    .card {
      position: relative;
      z-index: 10;
      width: 100%;
      max-width: 380px;
      margin: 0 20px;
      background: var(--glass);
      border: 1px solid var(--border);
      border-radius: 20px;
      padding: 44px 32px 40px;
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      box-shadow:
        0 0 0 1px rgba(56,189,248,0.08),
        0 20px 60px rgba(5,9,25,0.7),
        inset 0 1px 0 rgba(255,255,255,0.06);
    }

    /* ── Logo / brand ── */
    .brand {
      text-align: center;
      margin-bottom: 36px;
    }

    .brand-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 64px; height: 64px;
      border-radius: 18px;
      background: linear-gradient(135deg, var(--navy-700), var(--navy-600));
      border: 1px solid var(--border);
      font-size: 28px;
      margin-bottom: 18px;
      box-shadow: 0 0 24px var(--blue-glow), inset 0 1px 0 rgba(255,255,255,0.07);
      animation: icon-pulse 3s ease-in-out infinite;
    }

    @keyframes icon-pulse {
      0%, 100% { box-shadow: 0 0 24px var(--blue-glow), inset 0 1px 0 rgba(255,255,255,0.07); }
      50%       { box-shadow: 0 0 40px rgba(56,189,248,0.55), inset 0 1px 0 rgba(255,255,255,0.07); }
    }

    .brand-title {
      font-size: 22px;
      font-weight: 700;
      letter-spacing: 0.04em;
      background: linear-gradient(90deg, var(--blue-300), var(--cyan-400), var(--blue-200));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      line-height: 1.2;
    }

    .brand-sub {
      margin-top: 6px;
      font-size: 12px;
      font-weight: 500;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--text-muted);
    }

    /* ── Form ── */
    .form-label {
      display: block;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--text-dim);
      margin-bottom: 8px;
    }

    .input-wrap {
      position: relative;
      margin-bottom: 24px;
    }

    .input-wrap::before {
      content: '';
      position: absolute;
      inset: -1px;
      border-radius: 11px;
      background: linear-gradient(135deg, var(--blue-400), var(--cyan-400));
      opacity: 0;
      transition: opacity 0.3s;
      z-index: 0;
      pointer-events: none;
    }

    .input-wrap:focus-within::before {
      opacity: 0.6;
    }

    .token-input {
      position: relative;
      z-index: 1;
      width: 100%;
      padding: 14px 46px 14px 16px;
      background: rgba(8, 12, 30, 0.8);
      border: 1px solid var(--border);
      border-radius: 10px;
      color: var(--text-primary);
      font-size: 15px;
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
      letter-spacing: 0.06em;
      outline: none;
      transition: border-color 0.2s, background 0.2s;
      caret-color: var(--blue-400);
      -webkit-appearance: none;
    }

    .token-input::placeholder { color: var(--text-muted); letter-spacing: 0; font-family: inherit; }
    .token-input:focus { border-color: var(--border-focus); background: rgba(13, 21, 53, 0.9); }

    .input-eye {
      position: absolute;
      right: 14px;
      top: 50%;
      transform: translateY(-50%);
      z-index: 2;
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      padding: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: color 0.2s;
      -webkit-tap-highlight-color: transparent;
    }

    .input-eye:hover { color: var(--blue-400); }

    /* ── Submit button ── */
    .btn-login {
      width: 100%;
      padding: 15px;
      background: linear-gradient(135deg, #0d47a1, #0a2d7a, #0d1b4b);
      border: 1px solid rgba(56,189,248,0.35);
      border-radius: 12px;
      color: var(--blue-200);
      font-size: 15px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      cursor: pointer;
      position: relative;
      overflow: hidden;
      transition: border-color 0.2s, transform 0.1s;
      -webkit-tap-highlight-color: transparent;
      box-shadow: 0 4px 20px rgba(13,27,75,0.6), 0 0 0 1px rgba(56,189,248,0.08);
    }

    .btn-login::before {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(135deg, rgba(56,189,248,0.15), transparent 60%);
      opacity: 0;
      transition: opacity 0.3s;
    }

    .btn-login:hover::before { opacity: 1; }
    .btn-login:hover { border-color: rgba(56,189,248,0.7); }
    .btn-login:active { transform: scale(0.98); }

    .btn-login.loading {
      pointer-events: none;
      opacity: 0.7;
    }

    /* ── Error message ── */
    .error-msg {
      display: none;
      margin-top: 16px;
      padding: 12px 16px;
      border-radius: 10px;
      background: rgba(248, 113, 113, 0.12);
      border: 1px solid rgba(248, 113, 113, 0.25);
      color: var(--error);
      font-size: 13px;
      font-weight: 500;
      text-align: center;
      animation: shake 0.35s ease;
    }

    .error-msg.show { display: block; }

    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      25%       { transform: translateX(-6px); }
      75%       { transform: translateX(6px); }
    }

    /* ── Loading spinner (inside button) ── */
    .spinner {
      display: inline-block;
      width: 16px; height: 16px;
      border: 2px solid rgba(186,230,253,0.3);
      border-top-color: var(--blue-200);
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
      vertical-align: middle;
      margin-right: 8px;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* ── Footer ── */
    .card-footer {
      margin-top: 28px;
      text-align: center;
      font-size: 11px;
      color: var(--text-muted);
      letter-spacing: 0.05em;
    }

    .dot-pulse {
      display: inline-block;
      width: 6px; height: 6px;
      border-radius: 50%;
      background: var(--cyan-400);
      margin-right: 6px;
      vertical-align: middle;
      animation: dot-blink 2s ease-in-out infinite;
    }

    @keyframes dot-blink {
      0%, 100% { opacity: 1; box-shadow: 0 0 6px var(--cyan-400); }
      50%       { opacity: 0.3; box-shadow: none; }
    }

    /* ── Decorative corner lines ── */
    .corner { position: absolute; width: 20px; height: 20px; }
    .corner-tl { top: 14px; left: 14px; border-top: 2px solid var(--blue-400); border-left: 2px solid var(--blue-400); border-radius: 4px 0 0 0; }
    .corner-tr { top: 14px; right: 14px; border-top: 2px solid var(--blue-400); border-right: 2px solid var(--blue-400); border-radius: 0 4px 0 0; }
    .corner-bl { bottom: 14px; left: 14px; border-bottom: 2px solid var(--blue-400); border-left: 2px solid var(--blue-400); border-radius: 0 0 0 4px; }
    .corner-br { bottom: 14px; right: 14px; border-bottom: 2px solid var(--blue-400); border-right: 2px solid var(--blue-400); border-radius: 0 0 4px 0; }

    /* ── Safe area for notch ── */
    @supports (padding-bottom: env(safe-area-inset-bottom)) {
      body { padding-bottom: env(safe-area-inset-bottom); }
    }
  </style>
</head>
<body>

  <!-- Background effects -->
  <div class="bg-grid"></div>
  <div class="orb orb-1"></div>
  <div class="orb orb-2"></div>
  <div class="orb orb-3"></div>
  <div class="scanline"></div>

  <!-- Login card -->
  <div class="card" id="loginCard">
    <!-- Corner decorations -->
    <div class="corner corner-tl"></div>
    <div class="corner corner-tr"></div>
    <div class="corner corner-bl"></div>
    <div class="corner corner-br"></div>

    <!-- Brand -->
    <div class="brand">
      <div class="brand-icon">⚡</div>
      <div class="brand-title">URPE AI</div>
      <div class="brand-sub">Events Portal</div>
    </div>

    <!-- Form -->
    <form id="loginForm" autocomplete="off" onsubmit="return false;">
      <label class="form-label" for="tokenInput">Token de acceso</label>
      <div class="input-wrap">
        <input
          class="token-input"
          id="tokenInput"
          type="password"
          inputmode="text"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
          placeholder="Ingresa tu token..."
          maxlength="200"
        />
        <button class="input-eye" type="button" id="eyeBtn" aria-label="Mostrar / ocultar token">
          <svg id="eyeIcon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        </button>
      </div>

      <button class="btn-login" type="submit" id="loginBtn">
        Acceder
      </button>

      <div class="error-msg" id="errorMsg">Token inválido — verificá que sea el correcto</div>
    </form>

    <!-- Footer -->
    <div class="card-footer">
      <span class="dot-pulse"></span>Sistema activo
    </div>
  </div>

  <script>
    // ── Register service worker ──
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/events/sw.js').catch(() => {});
    }

    // ── Check if already logged in ──
    const TOKEN_KEY = 'urpe_events_token';
    const savedToken = localStorage.getItem(TOKEN_KEY);
    if (savedToken) {
      verifyAndRedirect(savedToken);
    }

    // ── Eye toggle ──
    const eyeBtn = document.getElementById('eyeBtn');
    const tokenInput = document.getElementById('tokenInput');
    const eyeIcon = document.getElementById('eyeIcon');
    let showToken = false;

    eyeBtn.addEventListener('click', () => {
      showToken = !showToken;
      tokenInput.type = showToken ? 'text' : 'password';
      eyeIcon.innerHTML = showToken
        ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>'
        : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
    });

    // ── Form submit ──
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const token = tokenInput.value.trim();
      if (!token) return;
      await doLogin(token);
    });

    // Enter key
    tokenInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('loginForm').dispatchEvent(new Event('submit'));
      }
    });

    async function doLogin(token) {
      const btn = document.getElementById('loginBtn');
      const err = document.getElementById('errorMsg');
      err.classList.remove('show');
      btn.classList.add('loading');
      btn.innerHTML = '<span class="spinner"></span>Verificando...';

      try {
        const res = await fetch('/events/verify-token?token=' + encodeURIComponent(token));
        const data = await res.json();

        if (data.ok) {
          localStorage.setItem(TOKEN_KEY, token);
          btn.innerHTML = '✓ Acceso concedido';
          btn.style.background = 'linear-gradient(135deg, #064e3b, #065f46)';
          btn.style.borderColor = 'rgba(52,211,153,0.5)';
          btn.style.color = '#6ee7b7';
          setTimeout(() => {
            window.location.href = '/events/app';
          }, 600);
        } else {
          showError();
        }
      } catch {
        showError('Error de conexión — intentá de nuevo');
      } finally {
        if (btn.classList.contains('loading')) {
          btn.classList.remove('loading');
          btn.innerHTML = 'Acceder';
        }
      }
    }

    async function verifyAndRedirect(token) {
      try {
        const res = await fetch('/events/verify-token?token=' + encodeURIComponent(token));
        const data = await res.json();
        if (data.ok) {
          window.location.href = '/events/app';
        } else {
          localStorage.removeItem(TOKEN_KEY);
        }
      } catch {}
    }

    function showError(msg) {
      const err = document.getElementById('errorMsg');
      const btn = document.getElementById('loginBtn');
      if (msg) err.textContent = msg;
      err.classList.add('show');
      btn.classList.remove('loading');
      btn.innerHTML = 'Acceder';
      tokenInput.focus();
    }
  </script>
</body>
</html>"""


@router.get("/events", response_class=HTMLResponse)
async def events_login(request: Request):
    """Login page de la PWA de eventos."""
    # Si viene con token en query, pre-rellena el campo (opcional)
    return HTMLResponse(_LOGIN_HTML)


@router.get("/events/app", response_class=HTMLResponse)
async def events_app(request: Request):
    """Panel de debug con paginación — muestra debug_events desde Supabase de 10 en 10."""
    _APP_HTML = """<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <meta name="theme-color" content="#080c1e">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <link rel="manifest" href="/events/manifest.json">
  <title>URPE AI — Debug</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --navy-900: #080c1e;
      --navy-800: #0d1535;
      --navy-700: #0d1b4b;
      --blue-400: #38bdf8;
      --blue-300: #7dd3fc;
      --blue-200: #bae6fd;
      --cyan-400: #22d3ee;
      --green-400: #4ade80;
      --red-400:   #f87171;
      --amber-400: #fbbf24;
      --text-primary: #e2e8f0;
      --text-muted:   #64748b;
      --text-dim:     #94a3b8;
      --border:       rgba(56,189,248,0.15);
      --border-strong:rgba(56,189,248,0.32);
      --card-bg:      rgba(13,21,53,0.7);
      --header-h: 54px;
    }

    html, body {
      min-height: 100%;
      background: var(--navy-900);
      color: var(--text-primary);
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      overflow-x: hidden;
    }

    /* ── Header ── */
    .header {
      position: fixed;
      top: 0; left: 0; right: 0;
      height: var(--header-h);
      background: rgba(5,9,25,0.95);
      border-bottom: 1px solid var(--border);
      backdrop-filter: blur(12px);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 16px;
      z-index: 100;
    }

    .header-brand {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 700;
      font-size: 15px;
      background: linear-gradient(90deg, var(--blue-300), var(--cyan-400));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .header-actions { display: flex; align-items: center; gap: 8px; }

    .btn-icon {
      background: none;
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--blue-400);
      padding: 6px 12px;
      cursor: pointer;
      font-size: 13px;
      transition: border-color .2s, background .2s;
    }
    .btn-icon:hover { border-color: var(--border-strong); background: rgba(56,189,248,.08); }
    .btn-icon:disabled { opacity: .5; cursor: default; }

    /* ── Main ── */
    .main {
      padding-top: calc(var(--header-h) + 14px);
      padding-bottom: 28px;
      max-width: 880px;
      margin: 0 auto;
      padding-left: 12px;
      padding-right: 12px;
    }

    /* ── Filters ── */
    .filter-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 10px;
    }

    .filter-label {
      font-size: 11px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: .08em;
      white-space: nowrap;
    }

    .pill-group { display: flex; gap: 6px; flex-wrap: wrap; }

    .pill {
      padding: 5px 12px;
      border-radius: 20px;
      border: 1px solid var(--border);
      background: none;
      color: var(--text-dim);
      font-size: 12px;
      cursor: pointer;
      transition: all .2s;
      white-space: nowrap;
    }
    .pill:hover { border-color: var(--border-strong); color: var(--blue-300); }
    .pill.active { border-color: var(--blue-400); background: rgba(56,189,248,.12); color: var(--blue-400); }

    /* ── Stats ── */
    .stats {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-bottom: 16px;
    }
    @media (max-width: 480px) { .stats { grid-template-columns: repeat(2, 1fr); } }

    .stat-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 12px 14px;
    }
    .stat-label { font-size: 10px; text-transform: uppercase; letter-spacing: .1em; color: var(--text-muted); margin-bottom: 6px; }
    .stat-value { font-size: 22px; font-weight: 700; line-height: 1; }

    /* ── Interaction cards ── */
    .interactions-list { display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px; }

    .icard {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 14px 16px;
      cursor: pointer;
      transition: border-color .2s, background .2s;
      position: relative;
    }
    .icard:hover { border-color: var(--border-strong); background: rgba(13,27,75,.8); }
    .icard.open  { border-color: var(--blue-400); }

    .icard-row1 {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 8px;
    }
    .icard-time { font-size: 11px; color: var(--text-muted); white-space: nowrap; }
    .icard-badges { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }

    .badge {
      padding: 2px 8px;
      border-radius: 20px;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: .04em;
    }
    .b-ok    { background:rgba(74,222,128,.15);  color:var(--green-400); border:1px solid rgba(74,222,128,.25); }
    .b-err   { background:rgba(248,113,113,.15); color:var(--red-400);   border:1px solid rgba(248,113,113,.25); }
    .b-proc  { background:rgba(251,191,36,.15);  color:var(--amber-400); border:1px solid rgba(251,191,36,.25); }
    .b-sup   { background:rgba(148,163,184,.15); color:var(--text-dim);  border:1px solid rgba(148,163,184,.25); }
    .b-wa    { background:rgba(34,197,94,.1);    color:#4ade80; border:1px solid rgba(34,197,94,.2); }
    .b-mc    { background:rgba(96,165,250,.1);   color:#60a5fa; border:1px solid rgba(96,165,250,.2); }
    .b-ig    { background:rgba(217,70,239,.1);   color:#e879f9; border:1px solid rgba(217,70,239,.2); }
    .b-ghl   { background:rgba(251,146,60,.1);   color:#fb923c; border:1px solid rgba(251,146,60,.2); }

    .icard-contact { display:flex; align-items:baseline; gap:8px; margin-bottom:6px; }
    .contact-name  { font-size:14px; font-weight:600; }
    .contact-phone { font-size:12px; color:var(--text-muted); font-family:'SF Mono',monospace; }

    .icard-msg {
      font-size: 13px;
      color: var(--text-dim);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 8px;
    }

    .icard-meta { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
    .meta-item  { font-size:11px; color:var(--text-muted); }
    .meta-item span { color:var(--text-dim); }

    .chevron {
      position: absolute;
      top: 14px; right: 14px;
      color: var(--text-muted);
      font-size: 12px;
      transition: transform .2s;
    }
    .icard.open .chevron { transform: rotate(180deg); }

    /* ── Detail drawer ── */
    .icard-detail {
      margin-top: 14px;
      padding-top: 14px;
      border-top: 1px solid var(--border);
      display: none;
    }
    .icard.open .icard-detail { display: block; }

    .detail-sec { margin-bottom: 14px; }
    .detail-lbl { font-size:10px; text-transform:uppercase; letter-spacing:.1em; color:var(--text-muted); margin-bottom:4px; }

    .detail-pre {
      font-family: 'SF Mono','Consolas',monospace;
      font-size: 11px;
      color: var(--blue-300);
      background: rgba(8,12,30,.6);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px 12px;
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 220px;
      overflow-y: auto;
    }

    .timeline { display:flex; flex-direction:column; gap:6px; }

    .t-item {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 8px 10px;
      background: rgba(8,12,30,.5);
      border: 1px solid var(--border);
      border-radius: 8px;
      font-size: 12px;
    }
    .t-dot { width:8px; height:8px; border-radius:50%; background:var(--blue-400); margin-top:3px; flex-shrink:0; }
    .t-dot.ok  { background:var(--green-400); }
    .t-dot.err { background:var(--red-400); }
    .t-name { font-weight:600; color:var(--blue-300); margin-bottom:2px; }
    .t-ts   { font-size:10px; color:var(--text-muted); margin-bottom:2px; }
    .t-data { color:var(--text-dim); font-size:11px; word-break:break-word; }

    /* ── Pagination ── */
    .pagination {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 16px 0;
    }

    .btn-page {
      padding: 8px 18px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: var(--card-bg);
      color: var(--blue-400);
      font-size: 13px;
      cursor: pointer;
      transition: all .2s;
    }
    .btn-page:hover:not(:disabled) { border-color:var(--blue-400); background:rgba(56,189,248,.1); }
    .btn-page:disabled { opacity:.38; cursor:not-allowed; }

    .page-info { font-size:13px; color:var(--text-dim); min-width:140px; text-align:center; }

    /* ── States ── */
    .state-msg { text-align:center; padding:48px 24px; color:var(--text-muted); font-size:14px; }
    .spin {
      display: inline-block;
      width: 30px; height: 30px;
      border: 3px solid rgba(56,189,248,.2);
      border-top-color: var(--blue-400);
      border-radius: 50%;
      animation: spin .8s linear infinite;
      margin-bottom: 12px;
    }
    @keyframes spin { to { transform:rotate(360deg); } }

    ::-webkit-scrollbar { width:4px; }
    ::-webkit-scrollbar-track { background:transparent; }
    ::-webkit-scrollbar-thumb { background:rgba(56,189,248,.2); border-radius:2px; }

    @supports (padding-bottom: env(safe-area-inset-bottom)) {
      .main { padding-bottom: calc(28px + env(safe-area-inset-bottom)); }
    }
  </style>
</head>
<body>

  <header class="header">
    <div class="header-brand">⚡ URPE Debug</div>
    <div class="header-actions">
      <button class="btn-icon" id="refreshBtn" onclick="loadData()">⟳ Refrescar</button>
      <button class="btn-icon" onclick="doLogout()">Salir</button>
    </div>
  </header>

  <main class="main">

    <!-- Filters -->
    <div class="filter-row">
      <span class="filter-label">Canal</span>
      <div class="pill-group" id="chFilters">
        <button class="pill active" data-ch="">Todos</button>
        <button class="pill" data-ch="whatsapp">WhatsApp</button>
        <button class="pill" data-ch="manychat">ManyChat</button>
        <button class="pill" data-ch="ghl_instagram">GHL IG</button>
        <button class="pill" data-ch="ghl_facebook">GHL FB</button>
      </div>
    </div>
    <div class="filter-row" style="margin-bottom:16px">
      <span class="filter-label">Período</span>
      <div class="pill-group" id="dFilters">
        <button class="pill" data-d="7">7d</button>
        <button class="pill active" data-d="30">30d</button>
        <button class="pill" data-d="90">90d</button>
        <button class="pill" data-d="365">1 año</button>
      </div>
    </div>

    <!-- Stats -->
    <div class="stats">
      <div class="stat-card">
        <div class="stat-label">Total</div>
        <div class="stat-value" id="sTotal">—</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">OK</div>
        <div class="stat-value" style="color:var(--green-400)" id="sOk">—</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Errores</div>
        <div class="stat-value" style="color:var(--red-400)" id="sErr">—</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Avg</div>
        <div class="stat-value" style="font-size:16px;padding-top:3px" id="sAvg">—</div>
      </div>
    </div>

    <!-- List -->
    <div class="interactions-list" id="iList">
      <div class="state-msg"><div class="spin"></div><br>Cargando eventos...</div>
    </div>

    <!-- Pagination -->
    <div class="pagination" id="pgBar" style="display:none">
      <button class="btn-page" id="btnPrev" onclick="goPage(curPage - 1)">← Anterior</button>
      <span class="page-info" id="pgInfo">Página 1 de 1</span>
      <button class="btn-page" id="btnNext" onclick="goPage(curPage + 1)">Siguiente →</button>
    </div>

  </main>

  <script>
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/events/sw.js').catch(() => {});
    }

    // ── Auth ──────────────────────────────────────────────────────────────────
    const TOKEN_KEY = 'urpe_events_token';
    if (!localStorage.getItem(TOKEN_KEY)) window.location.href = '/events';

    function doLogout() {
      localStorage.removeItem(TOKEN_KEY);
      window.location.href = '/events';
    }

    // ── State ─────────────────────────────────────────────────────────────────
    let curPage = 1;
    let totPages = 1;
    let curChannel = '';
    let curDays = 30;
    const LIMIT = 10;

    // ── Helpers ───────────────────────────────────────────────────────────────
    function esc(s) {
      if (s == null) return '—';
      const d = document.createElement('div');
      d.textContent = String(s);
      return d.innerHTML;
    }

    function fmtTime(iso) {
      if (!iso) return '—';
      try {
        const d = new Date(iso);
        return d.toLocaleDateString('es-AR', {day:'2-digit', month:'2-digit', year:'2-digit'})
          + ' ' + d.toLocaleTimeString('es-AR', {hour:'2-digit', minute:'2-digit', second:'2-digit'});
      } catch { return iso; }
    }

    function chBadge(ch) {
      const map = {
        whatsapp:      ['WA',     'b-wa'],
        manychat:      ['MC',     'b-mc'],
        ghl_instagram: ['GHL IG', 'b-ghl'],
        ghl_facebook:  ['GHL FB', 'b-ghl'],
        instagram:     ['IG',     'b-ig'],
      };
      if (!ch) return '';
      const [lbl, cls] = map[ch] || [ch, 'b-mc'];
      return `<span class="badge ${cls}">${esc(lbl)}</span>`;
    }

    function stBadge(st) {
      const map = { ok:'b-ok', error:'b-err', processing:'b-proc', suprimido:'b-sup' };
      return `<span class="badge ${map[st]||'b-proc'}">${esc(st||'processing')}</span>`;
    }

    function dotCls(stage) {
      if (['run_agent_done','slash_command_done','kapso_send_done'].includes(stage)) return 'ok';
      if (['inbound_error','error','exception','http_error'].includes(stage)) return 'err';
      return '';
    }

    function stageDataHtml(detail) {
      const skip = new Set(['stage','ts']);
      return Object.entries(detail)
        .filter(([k,v]) => !skip.has(k) && v != null && v !== '')
        .map(([k,v]) => {
          const val = typeof v === 'object' ? JSON.stringify(v) : String(v);
          return `<div><strong>${esc(k)}:</strong> ${esc(val.length > 300 ? val.slice(0,300)+'…' : val)}</div>`;
        }).join('');
    }

    // ── Render ────────────────────────────────────────────────────────────────
    function renderStats(stats) {
      if (!stats) return;
      document.getElementById('sTotal').textContent = stats.total ?? '—';
      document.getElementById('sOk').textContent    = stats.ok    ?? '—';
      document.getElementById('sErr').textContent   = stats.errors ?? '—';
      document.getElementById('sAvg').textContent   = stats.avg_ms != null ? stats.avg_ms + ' ms' : '—';
    }

    function renderList(items) {
      const list = document.getElementById('iList');
      if (!items || !items.length) {
        list.innerHTML = '<div class="state-msg">Sin interacciones en este período.</div>';
        return;
      }

      list.innerHTML = items.map((item, i) => {
        const stages = (item.stages_detail || []).map(s => `
          <div class="t-item">
            <div class="t-dot ${dotCls(s.stage)}"></div>
            <div style="flex:1;min-width:0">
              <div class="t-name">${esc(s.stage)}</div>
              <div class="t-ts">${fmtTime(s.ts)}</div>
              <div class="t-data">${stageDataHtml(s)}</div>
            </div>
          </div>`).join('');

        return `
        <div class="icard" id="ic${i}" onclick="toggleCard(${i})">
          <span class="chevron">▼</span>
          <div class="icard-row1">
            <span class="icard-time">${fmtTime(item.started_at)}</span>
            <div class="icard-badges">
              ${chBadge(item.channel)}
              ${stBadge(item.status)}
            </div>
          </div>
          <div class="icard-contact">
            <span class="contact-name">${esc(item.contact_name || 'Desconocido')}</span>
            ${item.from_phone ? `<span class="contact-phone">${esc(item.from_phone)}</span>` : ''}
          </div>
          ${item.message_text ? `<div class="icard-msg">${esc(item.message_text)}</div>` : ''}
          <div class="icard-meta">
            ${item.agent_name  ? `<div class="meta-item">Agente: <span>${esc(item.agent_name)}</span></div>`  : ''}
            ${item.model_used  ? `<div class="meta-item">Modelo: <span>${esc(item.model_used)}</span></div>`  : ''}
            ${item.duration_ms != null ? `<div class="meta-item">⏱ <span>${item.duration_ms} ms</span></div>` : ''}
          </div>

          <div class="icard-detail">
            ${item.message_text ? `
            <div class="detail-sec">
              <div class="detail-lbl">Mensaje completo</div>
              <div class="detail-pre">${esc(item.message_text)}</div>
            </div>` : ''}
            ${item.response_preview ? `
            <div class="detail-sec">
              <div class="detail-lbl">Respuesta</div>
              <div class="detail-pre">${esc(item.response_preview)}</div>
            </div>` : ''}
            ${item.error ? `
            <div class="detail-sec">
              <div class="detail-lbl" style="color:var(--red-400)">Error</div>
              <div class="detail-pre" style="color:var(--red-400)">${esc(item.error)}</div>
            </div>` : ''}
            <div class="detail-sec">
              <div class="detail-lbl">Timeline</div>
              <div class="timeline">${stages || '<div style="color:var(--text-muted);font-size:12px;padding:8px">Sin detalle disponible.</div>'}</div>
            </div>
          </div>
        </div>`;
      }).join('');
    }

    function renderPagination(page, pages, total) {
      const bar = document.getElementById('pgBar');
      if (!pages || pages <= 1) { bar.style.display = 'none'; return; }
      bar.style.display = 'flex';
      document.getElementById('pgInfo').textContent = `Página ${page} de ${pages}  ·  ${total} total`;
      document.getElementById('btnPrev').disabled = page <= 1;
      document.getElementById('btnNext').disabled = page >= pages;
    }

    function toggleCard(i) {
      document.getElementById('ic' + i)?.classList.toggle('open');
    }

    // ── Data fetch ────────────────────────────────────────────────────────────
    async function loadData() {
      const list = document.getElementById('iList');
      list.innerHTML = '<div class="state-msg"><div class="spin"></div><br>Cargando...</div>';
      document.getElementById('pgBar').style.display = 'none';

      const btn = document.getElementById('refreshBtn');
      btn.disabled = true;
      btn.textContent = '⌛';

      try {
        let url = `/api/v1/debug/interactions?page=${curPage}&limit=${LIMIT}&days=${curDays}`;
        if (curChannel) url += `&channel=${encodeURIComponent(curChannel)}`;

        const res = await fetch(url, { cache: 'no-store' });
        if (res.status === 401) { doLogout(); return; }

        const data = await res.json();
        totPages = data.pages || 1;

        renderStats(data.stats);
        renderList(data.interactions);
        renderPagination(data.page, data.pages, data.total);
      } catch (err) {
        list.innerHTML = `<div class="state-msg">Error cargando datos: ${esc(err.message)}</div>`;
      } finally {
        btn.disabled = false;
        btn.textContent = '⟳ Refrescar';
      }
    }

    function goPage(p) {
      if (p < 1 || p > totPages) return;
      curPage = p;
      loadData();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // ── Filter wiring ─────────────────────────────────────────────────────────
    document.getElementById('chFilters').addEventListener('click', e => {
      const pill = e.target.closest('.pill');
      if (!pill) return;
      document.querySelectorAll('#chFilters .pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      curChannel = pill.dataset.ch;
      curPage = 1;
      loadData();
    });

    document.getElementById('dFilters').addEventListener('click', e => {
      const pill = e.target.closest('.pill');
      if (!pill) return;
      document.querySelectorAll('#dFilters .pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      curDays = parseInt(pill.dataset.d);
      curPage = 1;
      loadData();
    });

    // ── Boot ──────────────────────────────────────────────────────────────────
    loadData();
  </script>
</body>
</html>"""
    return HTMLResponse(_APP_HTML)
