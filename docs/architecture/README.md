# 🏗️ Arquitectura del Sistema

> Visión general de la arquitectura de Urpe AI Lab v4.0

---

## 🎯 Identidad del Proyecto

**Chat Urpe AI LAB** es un dashboard de inteligencia de negocios conversacional de alto rendimiento con modo oscuro y enfoque en UI dinámica. Combina un asistente IA avanzado con un CRM empresarial completo.

---

## 📊 Stack Tecnológico

### Frontend
| Tecnología | Versión | Uso |
|------------|---------|-----|
| Next.js | 14.2 | Framework React con App Router |
| React | 18.2 | UI Components |
| TypeScript | 5.2 | Type safety |
| Tailwind CSS | 3.4 | Estilos (Dark Mode nativo) |
| Zustand | 4.5 | Estado global |
| Recharts | 2.x | Visualizaciones |
| Lucide React | - | Iconografía |

### Backend
| Tecnología | Uso |
|------------|-----|
| Supabase | Auth, Database, Realtime, Storage, Edge Functions |
| PostgreSQL | Base de datos principal |
| Row Level Security | Multi-tenancy |

### Inteligencia Artificial
| Tecnología | Uso |
|------------|-----|
| Gemini 3 Flash | Modelo principal de IA |
| Function Calling | Ejecución de herramientas |
| Vercel AI SDK | Streaming y gestión de respuestas |

---

## 🔄 Flujo de Datos

```
┌─────────────────────────────────────────────────────────────────┐
│                         USUARIO                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND (Next.js)                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │  ChatArea   │  │ AdminPanel  │  │   Stores    │              │
│  │  (Chat IA)  │  │   (CRM)     │  │  (Zustand)  │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    API ROUTES (Next.js)                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │  /api/chat  │  │ /api/alerts │  │ /api/health │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
┌─────────────────┐  ┌─────────────┐  ┌─────────────────┐
│   GEMINI API    │  │  SUPABASE   │  │  EXTERNAL APIs  │
│  (Function      │  │  Database   │  │  (Nylas, n8n)   │
│   Calling)      │  │  Auth       │  │                 │
└─────────────────┘  │  Realtime   │  └─────────────────┘
                     │  Storage    │
                     └─────────────┘
```

---

## 📁 Estructura de Directorios

```
Chat-Urpe-AI-LAB-1.1/
├── app/                        # Next.js App Router
│   ├── api/                    # API Routes
│   │   ├── chat/               # Endpoint principal del chat
│   │   ├── alerts/             # Sistema de alertas
│   │   └── health/             # Health check
│   ├── auth/                   # Flujo de autenticación
│   ├── layout.tsx              # Layout principal
│   └── page.tsx                # Página principal
│
├── components/                 # Componentes React
│   ├── admin/                  # Panel de administración
│   │   ├── contacts/           # Vistas de contactos
│   │   ├── tasks/              # Sistema de tareas
│   │   └── ...                 # Otros módulos
│   ├── chat/                   # Interfaz del chat
│   ├── mobile/                 # Componentes mobile-first
│   └── notifications/          # Sistema de notificaciones
│
├── hooks/                      # Custom React Hooks
│   ├── useChatReliable.ts      # Hook principal del chat
│   ├── useAdminMetrics.ts      # Métricas del dashboard
│   └── useNotifications.ts     # Gestión de notificaciones
│
├── lib/                        # Utilidades y servicios
│   ├── ai/                     # Sistema de IA
│   │   ├── tools.ts            # Definiciones de tools
│   │   ├── tool-executor.ts    # Ejecutor de tools
│   │   └── sub-agents/         # Sub-agentes especializados
│   ├── dal/                    # Data Access Layer
│   ├── ui/                     # Block Registry, Validators
│   └── supabase.ts             # Cliente Supabase
│
├── store/                      # Estado Global (Zustand)
│   ├── authStore.ts            # Autenticación
│   ├── chatStore.ts            # Estado del chat
│   ├── contactStore.ts         # CRM y contactos
│   ├── adminStore.ts           # Panel de admin
│   └── ...                     # Otros stores
│
├── types/                      # Definiciones TypeScript
│   ├── chat.ts                 # Tipos del chat
│   ├── contact.ts              # Tipos de contactos
│   └── ...                     # Otros tipos
│
├── docs/                       # 📚 Documentación
└── scripts/                    # SQL y utilidades
```

---

## 🔐 Seguridad Multi-Tenant

### Row Level Security (RLS)
Todas las tablas principales implementan RLS basado en `empresa_id`:

```sql
CREATE POLICY "Usuarios solo ven datos de su empresa"
ON wp_contactos FOR ALL
USING (empresa_id IN (SELECT get_user_empresa_ids()));
```

### Capas de Seguridad
1. **Capa BD**: RLS en Supabase
2. **Capa App**: Filtros en stores
3. **Capa API**: Validación de pertenencia

---

## 📚 Documentos Relacionados

- [Modelo de Datos](./data-model.md)
- [Protocolo UI v5](./ui-protocol-v5.md)
- [Capa de Datos](./data-layer.md)
- [Contexto Completo](./project-context.md)
