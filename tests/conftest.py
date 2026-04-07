"""
Configuración global de pytest.

Este archivo se carga ANTES que cualquier test o import de la app,
lo que nos permite inyectar variables de entorno ficticias para que
pydantic-settings no falle por credenciales faltantes.

En CI (sin .env) los valores de abajo son los que se usan.
En local con .env real, los valores del .env tienen prioridad
(setdefault no sobreescribe variables ya definidas).
"""
import os

# ── Credenciales falsas para tests (sin llamadas reales) ─────────────────────
os.environ.setdefault("OPENROUTER_API_KEY", "test-openrouter-key")
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-supabase-service-key")
os.environ.setdefault("NYLAS_API_KEY", "test-nylas-key")
os.environ.setdefault("ERROR_WEBHOOK_URL", "https://n8n.test/webhook/error")

# Limpiar el caché de settings para que tome los valores de arriba
# (solo necesario si ya se importó get_settings antes del conftest)
try:
    from app.core.config import get_settings
    get_settings.cache_clear()
except Exception:
    pass
