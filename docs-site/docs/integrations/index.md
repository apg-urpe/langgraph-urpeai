---
title: "Integraciones"
---

> Servicios conectados a Monica Inteligent

---

## Que son las integraciones

Monica Inteligent se conecta con servicios especializados para ofrecerte la mejor experiencia. Nosotros administramos todas las conexiones — tu equipo solo usa las funcionalidades.

---

## Integraciones Activas

| Servicio | Que aporta a la plataforma | Estado |
|----------|---------------------------|--------|
| [Supabase](./supabase) | Base de datos, autenticacion, sincronizacion en tiempo real y almacenamiento de archivos | Core |
| [Gemini AI](./gemini) | Motor de inteligencia artificial de Monica — chat, analisis, transcripcion y herramientas | Core |
| [Nylas](./nylas) | Sincronizacion de calendario (Google, Outlook) y bandeja de email | Activo |
| [OpenRouter](./openrouter-fallback) | Respaldo automatico de IA — si Gemini falla, el servicio sigue funcionando | Activo |
| [MCP Tools](./mcp-tools) | Sistema avanzado de herramientas para los agentes IA | Activo |

---

## Como funciona

```
Tu equipo usa Monica Inteligent
        ↓
   Plataforma (administrada por nosotros)
        ↓
    ┌──────────┐    ┌──────────┐    ┌──────────┐
    │ Gemini   │    │ Supabase │    │  Nylas   │
    │ (Monica) │    │ (Datos)  │    │(Calendar)│
    └──────────┘    └──────────┘    └──────────┘
```

Todas las integraciones estan preconfiguradas. No necesitas crear cuentas ni manejar credenciales — eso es parte del servicio que administramos.

---

## Documentacion por integracion

- [Supabase](./supabase) — Como se almacenan y protegen tus datos
- [Gemini AI](./gemini) — El motor de IA detras de Monica
- [Nylas](./nylas) — Calendario y email sincronizados
- [OpenRouter](./openrouter-fallback) — Sistema de alta disponibilidad
- [MCP Tools](./mcp-tools) — Herramientas avanzadas de los agentes
