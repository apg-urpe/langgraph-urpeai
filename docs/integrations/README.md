# 🔗 Integraciones

> Conexiones con servicios externos

---

## 📋 Integraciones Disponibles

| Integración | Estado | Propósito |
|-------------|--------|-----------|
| [Supabase](./supabase.md) | ✅ Core | Auth, Database, Realtime, Storage |
| [Gemini AI](./gemini.md) | ✅ Core | Modelo de IA principal |
| [Nylas](./nylas.md) | ✅ Opcional | Calendario y email |
| [MCP Tools](./mcp-tools.md) | 🔄 En progreso | Arquitectura de herramientas |
| n8n | ⚠️ Legacy | Webhooks (deprecado) |

---

## 🏗️ Arquitectura de Integraciones

```
┌─────────────────────────────────────────────────────────────────┐
│                      URPE AI LAB                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│   SUPABASE    │     │  GEMINI AI    │     │    NYLAS      │
│  - Auth       │     │  - Chat       │     │  - Calendar   │
│  - Database   │     │  - Tools      │     │  - Email      │
│  - Realtime   │     │  - Multimodal │     │               │
│  - Storage    │     │               │     │               │
└───────────────┘     └───────────────┘     └───────────────┘
```

---

## 🔐 Credenciales Requeridas

### Core (Obligatorias)

| Variable | Servicio |
|----------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase |
| `GEMINI_API_KEY` | Google Gemini |

### Opcionales

| Variable | Servicio |
|----------|----------|
| `NYLAS_CLIENT_ID` | Nylas |
| `NYLAS_API_KEY` | Nylas |
| `N8N_WEBHOOK_URL` | n8n (legacy) |

---

## 📚 Documentación por Integración

- [Supabase](./supabase.md) - Configuración completa
- [Gemini AI](./gemini.md) - Modelos y function calling
- [Nylas](./nylas.md) - Calendario y email
- [MCP Tools](./mcp-tools.md) - Arquitectura de herramientas
