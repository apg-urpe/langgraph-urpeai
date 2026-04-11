# URPE AI Lab — Contexto del Proyecto

## Stack
- **Backend**: FastAPI + Uvicorn (Python 3.11) — `main.py`
- **Agent Orchestration**: LangGraph
- **LLM**: OpenRouter via LangChain (`DEFAULT_MODEL=x-ai/grok-4.1-fast`)
- **Database**: Supabase (PostgREST + httpx pooled client)
- **Bridge**: Express.js Node 22 — `kapso-bridge/server.mjs` (port 3001)

## Deployments
- `test` branch → **Railway** (staging)
- `main` branch → **VPS** (production, Docker via GitHub Actions CI/CD)
- Para deployar a producción: commit en `test` → merge a `main` → push → CI/CD lo despliega automáticamente

## Canales de mensajería
| Canal | Entrada | Ruta FastAPI |
|-------|---------|-------------|
| WhatsApp | Kapso webhook → bridge → FastAPI | `/api/v1/kapso/inbound` |
| Instagram/Facebook (ManyChat) | ManyChat webhook → FastAPI | `/api/v1/manychat/inbound` |
| Instagram/Facebook (GHL) | GHL webhook → FastAPI | `/api/v1/ghl/inbound` |

## Paneles de Debug (bridge, puerto 3001)
| URL | Panel |
|-----|-------|
| `/debug/kapso` | WhatsApp — 11 cols: Hora/Contacto/ID/Tipo/Mensaje/Agente/Modelo/Rx/Total/Status/Detalle |
| `/debug/manychat` | ManyChat Instagram/FB |
| `/debug/ghl` | GHL Instagram/FB |
| `/debug/canales` | Todos los canales unificado (client-side, paginado, SSE incremental) |
| `/debug/kapso/visual` | Diagrama visual del grafo |

Nav bar: posiciones fijas `[Kapso][ManyChat][GHL][Ver visual]`; el panel activo se reemplaza por "Todos los canales".
Todos los links nav: mismo color `#93c5fd`. No hay "Ver JSON".

## Observabilidad
- `app/core/kapso_debug.py` — deque 200 eventos en memoria + persist a `debug_events` Supabase + SSE broadcast
- Canal guardado en `payload['_channel']` (no en columna separada)
- `app/api/debug_dashboard.py` — endpoint `/api/v1/debug/interactions` con paginación + `?since=` incremental
- `app/core/error_webhook.py` — notifica errores 500 a webhook; excluye rutas `/debug/*`

## Supabase Client
- `app/db/client.py` — httpx pooled, reintentos automáticos en 502/503/504 + HTML responses
- 3 intentos, delay 0.8s × intento

## Reglas importantes
- **Siempre trabajar en `test` primero**, luego merge → main para producción
- **Nunca mergear test→main con `ort` sin verificar archivos clave** — merges anteriores borraron imports en `debug_dashboard.py` y `server.mjs`
- Bridge (`server.mjs`) crashes → todos los endpoints caen; verificar antes de push a main
- `docs/` se COPY en el Docker image; cambios en docs requieren rebuild
- `RETRY_STUCK_ENABLED=false` desactiva el background loop de retry (útil para debug)
