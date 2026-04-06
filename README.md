# 🚀 Chat Urpe AI LAB v4.6.0

<<<<<<< HEAD
> **Business Intelligence Conversacional de Alto Rendimiento**

Chat Urpe AI LAB es una plataforma de BI conversacional construida sobre Next.js, Supabase y Gemini. Combina un chat con herramientas de IA, un panel operativo de CRM y una capa de automatización para ventas, cartera, calendario, marketing y soporte interno.

---

## ✨ Qué resuelve
=======
Sistema de inteligencia artificial multi-agente basado en **LangGraph** con soporte para **MCP servers** y **OpenRouter**. Integrado con **Kapso (WhatsApp)** para automatización comercial.

## Stack principal

- **API**: `FastAPI`
- **Orquestación de agentes**: `LangGraph`
- **Provider LLM**: `OpenRouter`
- **Herramientas dinámicas**: `MCP servers`
- **Base de datos**: `Supabase`
- **Canal de mensajería**: `Kapso (WhatsApp)`
- **Email**: `Nylas`
>>>>>>> 7d28fb87fe340fd13ec7dc3d16d860ecc3a43c30

- **Chat con herramientas reales**: Monica puede consultar y actuar sobre datos del negocio usando function calling y control por roles.
- **CRM operativo**: contactos, embudo, asignaciones, historial y vistas enfocadas en productividad.
- **Cartera y finanzas**: servicios, pagos, comprobantes, mora y seguimiento de cobranza.
- **Calendario y agenda**: citas sincronizadas con Nylas, participantes e intentos de reconciliación.
- **Marketing y envíos**: campañas de email, audiencias, plantillas y trazabilidad de envíos.
- **Equipo y permisos**: roles, grupos, asignaciones y filtros por empresa.
- **Comunicación omnicanal**: WhatsApp, notificaciones, emails transaccionales y transcripciones.
- **IA extensible**: deep research, transcripción, automatizaciones, soporte a código y herramientas auxiliares.

---

<<<<<<< HEAD
## 🧠 Capacidades principales
=======
1. **`docs/PROJECT_CONTEXT.md`** — fuente de verdad del proyecto
2. **`docs/architecture/OVERVIEW.md`** — arquitectura y componentes
3. **`docs/API_ENDPOINTS.md`** — referencia de endpoints HTTP
4. **`app/agents/conversational.py`** — agente principal
5. **`app/api/kapso_routes.py`** — flujo de mensajes WhatsApp
>>>>>>> 7d28fb87fe340fd13ec7dc3d16d860ecc3a43c30

### Chat e IA
- **Monica AI**: editor de roles con herramientas habilitadas por permiso.
- **Multi-session chat**: sesiones persistentes con estado por conversación.
- **Tool routing**: el endpoint `/api/chat` expone herramientas según el rol y la configuración activa.
- **Fallbacks de modelo**: integración con Gemini y soporte adicional desde OpenRouter/OpenAI según la función.

### CRM y operación comercial
- **Contactos**: lista, detalle, actividad, notas, tareas, asignaciones y vistas especializadas.
- **Embudo**: etapas, estado comercial y contexto de uso para Monica.
- **Cartera**: foco en cobranza, saldos pendientes, mora, compromiso de pago y estado por servicio.
- **Tareas**: seguimiento operativo ligado a contactos y actividades.

### Calendar, finanzas y seguimiento
- **Calendario Nylas**: citas, participantes, sync y auto-reconciliación server-side.
- **Pagos y servicios**: registros, comprobantes, emails transaccionales y seguimiento de cobro.
- **Transcripciones**: soporte para grabaciones, invitación a notetaker y caché de videos.

### Marketing y mensajería
- **Email marketing**: redacción, borradores, envíos y seguimiento.
- **Audiencias**: filtros dinámicos y segmentación avanzada.
- **WhatsApp**: configuración y vistas operativas relacionadas con templates y envíos.
- **Notificaciones**: centro de actividad y alertas unificadas.

### Equipo y administración
- **Gestión de miembros**: grupos dinámicos, roles y permisos.
- **Asignaciones de contacto**: responsable principal, colaboradores y observadores.
- **Panel admin**: navegación por vistas operativas del negocio.

---

## 🛠️ Stack tecnológico

| Capa | Tecnologías |
|---|---|
| **Frontend** | Next.js 14, React 18, TypeScript, Tailwind CSS |
| **Estado** | Zustand |
| **Backend** | Supabase, PostgreSQL, RLS, Realtime, Edge Functions |
| **IA** | Gemini, Vercel AI SDK, OpenAI, OpenRouter, Firecrawl |
| **Integraciones** | Nylas, Kapso/WhatsApp, E2B |

---

## ⚙️ Requisitos

- **Node.js** 18 o superior.
- **npm** 9 o superior.
- **Cuenta Supabase** con proyecto activo.
- **API key de Gemini** para las funciones de IA principales.
- **Credenciales externas** según los módulos que vayas a usar: Nylas, OpenAI, OpenRouter, Firecrawl, E2B.

---

## 🚀 Instalación rápida

### 1. Clonar
```bash
git clone https://github.com/tonyurpe27/Chat-Urpe-AI-LAB-1.1.git
cd Chat-Urpe-AI-LAB-1.1
```

### 2. Instalar dependencias
```bash
npm install
```

### 3. Configurar variables de entorno
```bash
cp .env.example .env.local
```

Luego completa `.env.local` con tus credenciales.

### 4. Ejecutar en desarrollo
```bash
npm run dev
```

La app queda disponible en `http://localhost:3000`.

---

## 🔐 Variables de entorno

### Requeridas

| Variable | Uso |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL pública del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave pública de Supabase para el cliente |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave privada para endpoints server-side |
| `GEMINI_API_KEY` | IA principal de Monica y del chat |

### Opcionales según módulo

| Variable | Uso |
|---|---|
| `OPENROUTER_API_KEY` | Fallback cuando Gemini no responde |
| `E2B_API_KEY` | Sandbox de ejecución de código |
| `NYLAS_API_KEY` | Integración de calendario y correo |
| `NYLAS_API_URI` | Región/endpoint de Nylas |
| `NYLAS_CLIENT_ID` | OAuth de Nylas |
| `NEXT_PUBLIC_NYLAS_CLIENT_ID` | Cliente Nylas visible en frontend |
| `NYLAS_CALLBACK_URL` | URL de callback para OAuth |
| `FIRECRAWL_API_KEY` | Investigación web y scraping |
| `OPENAI_API_KEY` | Transcripción de audio y fallbacks |

> Revisa `.env.example` para la lista completa y el formato esperado.

---

## 🧪 Scripts disponibles

| Comando | Descripción |
|---|---|
| `npm run dev` | Levanta el entorno de desarrollo |
| `npm run build` | Genera el índice de docs y compila para producción |
| `npm run start` | Ejecuta la build de producción |
| `npm run lint` | Ejecuta ESLint sobre el proyecto |

---

## 📁 Estructura del proyecto

```text
<<<<<<< HEAD
Chat-Urpe-AI-LAB-1.1/
├── app/              # Rutas Next.js, API routes y páginas
├── components/       # UI por dominio: admin, chat, mobile, notifications
├── hooks/            # Hooks reutilizables
├── lib/              # Clientes, helpers, AI, DAL y utilidades
├── store/            # Estado global con Zustand
├── supabase/         # Edge functions y artefactos relacionados
├── scripts/          # SQL, migraciones y utilidades de mantenimiento
├── types/            # Tipos compartidos
├── docs/             # Documentación técnica y funcional
└── public/           # Assets públicos
```

---

## 📚 Documentación relacionada
=======
Kapso (WhatsApp)
  -> kapso-bridge (Node.js)
  -> FastAPI
       -> Agente Conversacional (LangGraph + MCP)   [principal]
       -> Agente de Embudo     (LangGraph)           [paralelo]
       -> Agente Contacto      (LangGraph)           [paralelo]
  -> Supabase (BD)
  -> OpenRouter (LLM)
```

## Agentes disponibles

| Agente | Archivo | Endpoint |
|--------|---------|----------|
| Conversacional | `app/agents/conversational.py` | `POST /api/v1/chat` |
| Embudo (Funnel) | `app/agents/funnel.py` | `POST /api/v1/funnel/analyze` |
| Actualización de Contacto | `app/agents/contact_update.py` | Interno (desde Kapso) |

## Estructura del Proyecto

```text
├── main.py                              # Punto de entrada FastAPI
├── requirements.txt                     # Dependencias Python
├── package.json                         # Utilidades Node (kapso-bridge + benchmarks)
├── docker-compose.yml                   # Configuración Docker
├── Dockerfile
├── railway-start.sh                     # Script de inicio en Railway
├── nixpacks.toml                        # Config Railway
├── .env.example
│
├── app/
│   ├── api/
│   │   ├── routes.py                   # Endpoint principal de chat
│   │   ├── funnel_routes.py            # Endpoints funnel agent + debug dashboard
│   │   ├── kapso_routes.py             # Endpoints WhatsApp/Kapso
│   │   ├── scheduling_routes.py        # Endpoints de agendamiento
│   │   ├── graph_routes.py             # Endpoints debug del grafo
│   │   ├── db_routes.py                # Endpoints utilitarios de BD
│   │   └── debug_dashboard.py          # Dashboard de debug conversacional
│   │
│   ├── agents/
│   │   ├── conversational.py           # Agente conversacional (LangGraph + MCP)
│   │   ├── funnel.py                   # Agente de embudo
│   │   └── contact_update.py           # Agente de actualización de contacto
│   │
│   ├── core/
│   │   ├── config.py                   # Configuración central (variables de entorno)
│   │   ├── cache.py                    # Cache de respuestas con TTL de 5 min
│   │   ├── error_webhook.py            # Notificaciones de error via webhook
│   │   ├── funnel_debug.py             # Buffer circular de debug del funnel agent
│   │   ├── kapso_debug.py              # Utilidades de debug de Kapso
│   │   └── kapso_prompt.py             # System prompts de Kapso
│   │
│   ├── db/
│   │   ├── client.py                   # Cliente Supabase async con connection pooling
│   │   └── queries.py                  # Funciones de consulta a BD
│   │
│   ├── mcp_client/
│   │   └── client.py                   # Cliente MCP para herramientas dinámicas
│   │
│   ├── nylas_client/
│   │   └── client.py                   # Cliente de email Nylas
│   │
│   ├── schemas/
│   │   ├── chat.py                     # Schemas del agente conversacional
│   │   ├── funnel.py                   # Schemas del funnel agent
│   │   ├── contact_update.py           # Schemas de actualización de contacto
│   │   ├── channel.py                  # Schemas de configuración de canal
│   │   ├── kapso.py                    # Schemas de Kapso/WhatsApp
│   │   └── scheduling.py               # Schemas de agendamiento
│   │
│   └── services/
│       └── channel_adapter.py          # Adaptadores de canal/plataforma
│
├── kapso-bridge/
│   └── server.mjs                      # Bridge Node.js para webhook Kapso
│
├── docs/                               # Documentación
│   ├── PROJECT_CONTEXT.md
│   ├── API_ENDPOINTS.md
│   ├── FUNNEL_AGENT.md
│   ├── FUNNEL_DEBUG_DASHBOARD.md
│   ├── AGENT_TESTING_PROTOCOL.md
│   ├── BENCHMARK_REAL_FLOW_RESULTS.md
│   ├── RAILWAY_KAPSO_DEPLOY.md
│   ├── NEXT_STEPS.md
│   └── architecture/OVERVIEW.md
│
├── scripts/                            # Scripts de benchmark y utilidades
│   ├── benchmark_parallel_langgraph.py
│   ├── documented_real_flow_langgraph.py
│   └── test_funnel_agent.py
│
└── benchmarks/                         # Benchmarks comparativos históricos (Vercel AI SDK)
```
>>>>>>> 7d28fb87fe340fd13ec7dc3d16d860ecc3a43c30

- **Índice general**: [docs/README.md](./docs/README.md)
- **Inicio rápido**: [docs/getting-started/README.md](./docs/getting-started/README.md)
- **Variables de entorno**: [docs/getting-started/environment-setup.md](./docs/getting-started/environment-setup.md)
- **Arquitectura**: [docs/architecture/README.md](./docs/architecture/README.md)
- **Módulos del sistema**: [docs/modules/README.md](./docs/modules/README.md)
- **Contexto y protocolo UI**: [docs/core/contexto.md](./docs/core/contexto.md)
- **Contribución**: [docs/contributing/README.md](./docs/contributing/README.md)
- **API**: [docs/api/README.md](./docs/api/README.md)

---

## 🔎 Notas importantes

<<<<<<< HEAD
- **Multi-tenant**: la app trabaja por empresa y depende de políticas RLS en Supabase.
- **Seguridad**: nunca expongas `SUPABASE_SERVICE_ROLE_KEY` en el cliente.
- **Chat**: varias herramientas se habilitan por rol y por endpoint, no por UI solamente.
- **Calendario**: la sincronización con Nylas puede requerir reconciliación server-side.
- **Build**: `npm run build` también genera el índice de documentación.

---
=======
Crear `.env` a partir de `.env.example`:

```env
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
DEFAULT_MODEL=x-ai/grok-4.1-fast

SUPABASE_URL=https://...supabase.co
SUPABASE_SERVICE_KEY=...
SUPABASE_EDGE_FUNCTION_URL=https://...supabase.co/functions/v1
SUPABASE_EDGE_FUNCTION_TOKEN=...   # opcional

KAPSO_API_KEY=...
KAPSO_WEBHOOK_SECRET=...
KAPSO_INTERNAL_TOKEN=...
KAPSO_BASE_URL=https://api.kapso.ai/meta/whatsapp
INTERNAL_AGENT_API_URL=http://127.0.0.1:8000/api/v1/kapso/inbound
```
>>>>>>> 7d28fb87fe340fd13ec7dc3d16d860ecc3a43c30

## 📌 Estado del proyecto

<<<<<<< HEAD
Chat Urpe AI LAB evoluciona como una plataforma operativa unificada para chat, CRM, cartera, calendario y automatización empresarial asistida por IA.
=======
```bash
# Solo el backend Python
python main.py

# Con el bridge de Kapso (en otra terminal)
npm run kapso:bridge
```
>>>>>>> 7d28fb87fe340fd13ec7dc3d16d860ecc3a43c30

---

<<<<<<< HEAD
<div align="center">
  <sub>Actualizado para reflejar el estado actual del repositorio.</sub>
</div>
=======
- Swagger UI: `http://localhost:8080/docs`
- Documentación de endpoints: `docs/API_ENDPOINTS.md`
- Debug funnel: `http://localhost:8080/api/v1/funnel/debug`

## Ejemplos rápidos

### Chat conversacional

```bash
curl -X POST http://localhost:8080/api/v1/chat \
  -H "Content-Type: application/json" \
  -d '{
    "system_prompt": "Eres un asistente de ventas de la empresa X.",
    "message": "¿Cuáles son los productos disponibles?",
    "max_tokens": 512
  }'
```

### Chat con MCP servers

```bash
curl -X POST http://localhost:8080/api/v1/chat \
  -H "Content-Type: application/json" \
  -d '{
    "system_prompt": "Eres el asistente de Marketia.",
    "message": "Busca los clientes activos",
    "mcp_servers": [
      { "url": "https://marketia.app.n8n.cloud/mcp/aa0f6b46-...", "name": "marketia-crm" }
    ]
  }'
```

### Análisis de embudo

```bash
curl -X POST http://localhost:8080/api/v1/funnel/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "contacto_id": 1234,
    "empresa_id": 5,
    "agente_id": 10,
    "conversacion_id": 999
  }'
```

## Optimizaciones

- **Cache TTL 5 min** → 0.5ms hit vs ~4s full
- **Connection pooling HTTP/2** → 20 conexiones máx, 10 keep-alive
- **Carga paralela MCP tools** → `asyncio.gather`
- **Carga paralela contexto funnel** → 4 queries simultáneas
- **Cache de instancias LLM** por modelo + parámetros
- **Timeout defensivo** en ejecución del grafo y discovery MCP
- **Límite de iteraciones** en agentes para evitar loops infinitos
- **Retry automático** de mensajes atascados cada 10 minutos (background task)

## Despliegue

Ver `docs/RAILWAY_KAPSO_DEPLOY.md` para instrucciones de Railway.

## Benchmarks históricos

Los benchmarks comparativos con `Vercel AI SDK` se conservan en `benchmarks/` como referencia histórica. El stack de producción es `LangGraph`. Ver `docs/BENCHMARK_REAL_FLOW_RESULTS.md` para resultados.
>>>>>>> 7d28fb87fe340fd13ec7dc3d16d860ecc3a43c30
