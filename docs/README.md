# 📚 Documentación - Urpe AI Lab v4.0

> **Business Intelligence Conversacional de Alto Rendimiento**

Bienvenido a la documentación oficial de Chat Urpe AI LAB. Esta guía proporciona toda la información necesaria para entender, desarrollar y mantener la plataforma.

---

## 🗺️ Mapa de Navegación

### 🚀 Inicio Rápido
| Documento | Descripción |
|-----------|-------------|
| [Instalación](./getting-started/README.md) | Guía de instalación y configuración inicial |
| [Variables de Entorno](./getting-started/environment-setup.md) | Configuración de credenciales y API keys |

### 🏗️ Arquitectura
| Documento | Descripción |
|-----------|-------------|
| [Contexto del Proyecto](./architecture/README.md) | Visión general, stack tecnológico y estructura |
| [Modelo de Datos](./architecture/data-model.md) | Esquema de base de datos Supabase |
| [Protocolo UI v5](./architecture/ui-protocol-v5.md) | Sistema de bloques dinámicos |
| [Capa de Datos](./architecture/data-layer.md) | Estrategia de sincronización y estado |

### 📦 Módulos del Sistema
| Módulo | Descripción | Estado |
|--------|-------------|--------|
| [Chat Principal](./modules/chat/README.md) | Asistente IA con function calling | ✅ Completo |
| [Contactos (CRM)](./modules/contacts/README.md) | Gestión de leads y clientes | ✅ Completo |
| [Tareas](./modules/tasks/README.md) | Sistema de tareas con checklist | ✅ Completo |
| [Calendario](./modules/calendar/README.md) | Gestión de citas y eventos | ✅ Completo |
| [Dashboard](./modules/dashboard/README.md) | Métricas y KPIs en tiempo real | ✅ Completo |
| [Finanzas](./modules/finance/README.md) | Servicios, pagos y cartera | ✅ Completo |
| [Marketing](./modules/marketing/README.md) | Campañas de email automatizadas | ✅ Completo |
| [Equipo](./modules/team/README.md) | Gestión de miembros y roles | ✅ Completo |
| [Gamificación](./modules/gamification/README.md) | Sistema de XP, niveles y medallas | ✅ Completo |
| [Monica AI](./modules/monica-ai/README.md) | Agentes y sub-agentes inteligentes | ✅ Completo |
| [Funnel](./modules/funnel/README.md) | Configuración de pipeline de ventas | ✅ Completo |
| [Marketing Audience Filters](./modules/marketing-audience-filters/README.md) | Segmentación avanzada de contactos | ✅ Completo |

### 🧪 Experimentales

| Módulo | Descripción | Estado |
|--------|-------------|--------|
| [Monica Lab](./modules/lab-agent/README.md) | Entorno experimental con Claude Opus | 🧪 Planificado |
| [Menciones (@Mentions)](./modules/mentions/README.md) | Sistema de notificaciones por @usuario | 📝 Diseño |

### 🔌 API y Endpoints
| Documento | Descripción |
|-----------|-------------|
| [API Reference](./api/README.md) | Documentación de endpoints |
| [Chat API](./api/chat-api.md) | Endpoint principal del chat |
| [Alerts API](./api/alerts-api.md) | Sistema de alertas |

### 🔗 Integraciones
| Integración | Descripción |
|-------------|-------------|
| [Supabase](./integrations/supabase.md) | Auth, Database, Realtime, Storage |
| [Gemini AI](./integrations/gemini.md) | Function calling y multimodal |
| [Nylas](./integrations/nylas.md) | Calendario y email |
| [MCP Tools](./integrations/mcp-tools.md) | Arquitectura de herramientas |

### 📱 Mobile
| Documento | Descripción |
|-----------|-------------|
| [UX Mobile](./mobile/README.md) | Guías de diseño responsive |
| [Notificaciones](./mobile/NOTIFICATIONS_MOBILE_CONTEXT.md) | Sistema de notificaciones |

### 🔧 Técnico
| Documento | Descripción |
|-----------|-------------|
| [Observabilidad](./technical/observability/README.md) | Logging, métricas y trazas |
| [Seguridad](./technical/security/README.md) | Multi-tenant, RLS, autenticación |
| [Performance](./technical/performance/README.md) | Optimización y monitoreo |

### 📋 Planes de Desarrollo
| Documento | Descripción | Estado |
|-----------|-------------|--------|
| [Multi-Session Chat](./MULTI_SESSION_CHAT_PLAN.md) | Chat con estado independiente por sesión + persistencia Supabase | ✅ Implementado |

### 📝 Contribución
| Documento | Descripción |
|-----------|-------------|
| [Guía de Contribución](./contributing/README.md) | Cómo contribuir al proyecto |
| [Estilo de Código](./contributing/code-style.md) | Convenciones y estándares |
| [Guía de Documentación](./contributing/documentation-guide.md) | Cómo documentar |

---

## 🎯 Stack Tecnológico

```
┌─────────────────────────────────────────────────────────────┐
│                      FRONTEND                                │
│  Next.js 14 │ React 18 │ TypeScript │ Tailwind CSS          │
├─────────────────────────────────────────────────────────────┤
│                       ESTADO                                 │
│  Zustand │ IndexedDB │ React Query (cache)                  │
├─────────────────────────────────────────────────────────────┤
│                      BACKEND                                 │
│  Supabase (PostgreSQL, Auth, Realtime, Edge Functions)      │
├─────────────────────────────────────────────────────────────┤
│                   INTELIGENCIA ARTIFICIAL                    │
│  Gemini 3 Flash │ Function Calling │ Vercel AI SDK          │
└─────────────────────────────────────────────────────────────┘
```

---

## 📊 Estructura del Proyecto

```
Chat-Urpe-AI-LAB-1.1/
├── app/                    # Rutas Next.js (API, auth, pages)
├── components/             # Componentes React reutilizables
│   ├── admin/              # Panel de administración
│   ├── chat/               # Interfaz del chat
│   └── notifications/      # Sistema de notificaciones
├── hooks/                  # Custom hooks (useChatReliable, etc.)
├── lib/                    # Utilidades y clientes
│   ├── ai/                 # Tools y ejecutores de Gemini
│   ├── dal/                # Data Access Layer
│   └── ui/                 # Block Registry y validadores
├── store/                  # Estado global (Zustand)
├── types/                  # Definiciones TypeScript
├── docs/                   # 📚 Esta documentación
└── scripts/                # SQL y utilidades
```

---

## 🔑 Credenciales Requeridas

| Variable | Descripción | Requerida |
|----------|-------------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Key pública de Supabase | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | Key privada (server-side) | ✅ |
| `GEMINI_API_KEY` | API Key de Google Gemini | ✅ |
| `NYLAS_CLIENT_ID` | Client ID de Nylas | Opcional |
| `NYLAS_API_KEY` | API Key de Nylas | Opcional |

---

## 📈 Versiones

| Versión | Fecha | Cambios Principales |
|---------|-------|---------------------|
| **4.0** | Dic 2024 | Migración a Gemini 3, Function Calling, Multi-agentes |
| 3.5 | Nov 2024 | Sistema de Gamificación, Tareas V2 |
| 3.0 | Oct 2024 | Dashboard dinámico, Marketing module |
| 2.0 | Sep 2024 | CRM completo, Finanzas |
| 1.0 | Ago 2024 | MVP Chat + Admin básico |

---

*Última actualización: Enero 2025*
