---
title: "Modulos de la Plataforma"
---

> Todo lo que puedes hacer con Urpe AI Lab

---

## Vista General

Urpe AI Lab se compone de modulos independientes que trabajan en conjunto. Todos los datos estan conectados — un contacto tiene conversaciones, citas, tareas, pagos y campanas de marketing vinculados automaticamente.

```
┌─────────────────────────────────────────────────────────────────┐
│                      CHAT & MONICA IA                            │
│              Asistente IA con acceso a todos los datos           │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│   CONTACTOS   │     │    TAREAS     │     │  CALENDARIO   │
│     (CRM)     │     │               │     │               │
└───────────────┘     └───────────────┘     └───────────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│   FINANZAS    │     │   MARKETING   │     │    EQUIPO     │
│               │     │               │     │               │
└───────────────┘     └───────────────┘     └───────────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│   DASHBOARD   │     │ GAMIFICACION  │     │    FUNNEL     │
│   (Metricas)  │     │               │     │  (Pipeline)   │
└───────────────┘     └───────────────┘     └───────────────┘
```

---

## Modulos Principales

### Comunicacion & IA

| Modulo | Que hace |
|--------|----------|
| [Chat Principal](./chat/) | Interfaz de Monica IA con herramientas inteligentes, multimedia y streaming |
| [Monica AI](./monica-ai/) | Motor de IA con multi-agentes, roles personalizables y analisis profundo |
| [Notificaciones](./notifications/) | Centro de actividad con alertas inteligentes y recordatorios automaticos |
| [Novedades](./changelog/) | Historial de cambios y actualizaciones de la plataforma |

### CRM & Ventas

| Modulo | Que hace |
|--------|----------|
| [Contactos](./contacts/) | Gestion de leads y clientes con busqueda avanzada y lead scoring |
| [Calendario](./calendar/) | Citas, eventos y sincronizacion con Google Calendar / Outlook |
| [Tareas](./tasks/) | Tareas con checklist, prioridades y asignacion a equipo |
| [Funnel](./funnel/) | Pipeline de ventas configurable con etapas e instrucciones para IA |

### Negocio & Operaciones

| Modulo | Que hace |
|--------|----------|
| [Finanzas](./finance/) | Servicios contratados, pagos, cartera pendiente y comprobantes |
| [Marketing](./marketing/) | Campanas de email con audiencias dinamicas y secuencias automaticas |
| [Audiencias](./marketing-audience-filters/) | Segmentacion avanzada de contactos con filtros combinados |
| [Equipo](./team/) | Roles, permisos, invitaciones y filtro global por miembro |

### Productividad & Herramientas

| Modulo | Que hace |
|--------|----------|
| [Dashboard](./dashboard/) | KPIs, metricas de equipo, tendencias y distribucion de funnel |
| [Gamificacion](./gamification/) | XP, niveles, medallas, rachas y rankings para motivar al equipo |
| [Deep Research](./deep-research/) | Investigacion profunda en la web asistida por IA |
| [Artefactos](./artifacts/) | Documentos, codigo y visualizaciones generadas por Monica |
| [Email Intelligence](./email-intelligence/) | Bandeja unificada con categorizacion y analisis por IA |
| [Multimedia](./multimedia/) | Envio y analisis de imagenes, PDFs, audio y video con IA |

---

## Como se Conectan

Todos los modulos comparten datos a traves de:

1. **Contactos como eje central** — cada conversacion, cita, tarea, pago y campana esta vinculada a un contacto
2. **Filtro global de equipo** — filtra todos los modulos por miembro del equipo
3. **Contexto de empresa** — cada empresa ve solo sus propios datos (multi-tenant)
4. **Monica IA** — tiene acceso de lectura a todos los modulos para responder consultas

---

## Documentacion por Modulo

Cada modulo tiene su propia documentacion con:

- **Que hace** — para que sirve y a quien ayuda
- **Funcionalidades** — que puedes hacer con el
- **Experiencia de usuario** — capturas de pantalla y flujos
- **Documentos relacionados** — contexto profundo para equipos tecnicos
