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
    """Placeholder del app (post-login). Por ahora redirige al login si no hay token."""
    _APP_HTML = """<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <meta name="theme-color" content="#080c1e">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <link rel="manifest" href="/events/manifest.json">
  <title>URPE AI — Events</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #080c1e;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Inter', -apple-system, sans-serif;
      color: #e2e8f0;
    }
    .center {
      text-align: center;
      padding: 40px 24px;
    }
    .icon { font-size: 48px; margin-bottom: 20px; }
    h1 { font-size: 22px; font-weight: 700; color: #7dd3fc; margin-bottom: 10px; }
    p { color: #64748b; font-size: 14px; line-height: 1.6; }
    .logout {
      margin-top: 32px;
      display: inline-block;
      padding: 10px 24px;
      border: 1px solid rgba(56,189,248,0.3);
      border-radius: 8px;
      color: #38bdf8;
      font-size: 13px;
      cursor: pointer;
      background: none;
      letter-spacing: 0.05em;
    }
  </style>
</head>
<body>
  <div class="center">
    <div class="icon">⚡</div>
    <h1>Conectado</h1>
    <p>El panel de eventos está en construcción.<br>Próximamente aquí verás las notificaciones en tiempo real.</p>
    <button class="logout" onclick="localStorage.removeItem('urpe_events_token'); window.location.href='/events'">
      Cerrar sesión
    </button>
  </div>
  <script>
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/events/sw.js').catch(() => {});
    }
    const token = localStorage.getItem('urpe_events_token');
    if (!token) window.location.href = '/events';
  </script>
</body>
</html>"""
    return HTMLResponse(_APP_HTML)
