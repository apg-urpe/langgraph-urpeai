---
title: "Como esta Construida la Plataforma"
---

> Arquitectura y tecnologia detras de Urpe AI Lab

---

## Identidad del Proyecto

Urpe AI Lab es una plataforma SaaS de business intelligence conversacional. Combinamos un CRM empresarial completo con inteligencia artificial avanzada (Monica IA) en una interfaz dark mode de alto rendimiento.

**Nosotros administramos toda la infraestructura** — bases de datos, servidores, backups, seguridad y actualizaciones. Los clientes solo inician sesion y trabajan.

---

## Stack Tecnologico

| Capa | Tecnologia | Para que |
|------|------------|----------|
| **Frontend** | Next.js 14, React 18, TypeScript, Tailwind CSS | Interfaz web responsive y dark mode |
| **Estado** | Zustand, IndexedDB | Gestion de datos en cliente con persistencia offline |
| **Backend** | Supabase (PostgreSQL, Auth, Realtime, Storage) | Base de datos, autenticacion y sincronizacion en tiempo real |
| **IA** | Gemini 3 Flash, Function Calling, Vercel AI SDK | Motor de Monica IA con herramientas y streaming |
| **Integraciones** | Nylas, n8n | Calendario, email y automatizaciones |

---

## Flujo de Datos

```
Tu equipo (Web / Movil)
        ↓
   Interfaz Urpe AI Lab
    ├── Chat con Monica IA
    ├── CRM (Contactos, Pipeline, Tareas)
    └── Dashboard, Marketing, Finanzas
        ↓
   Capa de API (Autenticacion + Procesamiento)
        ↓
    ┌──────────┐    ┌──────────┐    ┌──────────────┐
    │ Gemini   │    │ Supabase │    │ APIs Externas │
    │ (Monica) │    │ (Datos)  │    │ (Nylas, n8n)  │
    └──────────┘    └──────────┘    └──────────────┘
```

---

## Seguridad Multi-Tenant

Cada empresa cliente tiene sus datos completamente aislados mediante tres capas de seguridad:

| Capa | Como funciona |
|------|---------------|
| **Base de datos** | Row Level Security (RLS) — cada consulta se filtra automaticamente por empresa |
| **Aplicacion** | Filtros en la capa de estado que solo cargan datos de la empresa activa |
| **API** | Validacion de pertenencia en cada endpoint antes de retornar datos |

Esto significa que **un usuario nunca puede ver datos de otra empresa**, incluso si intentara manipular la interfaz.

---

## Principios de Diseno

- **Dark mode nativo** — toda la interfaz esta disenada primero en oscuro
- **Mobile-first** — funciona completo en telefono, tablet y desktop
- **Tiempo real** — los cambios de un usuario se reflejan para todo el equipo al instante
- **IA integrada** — Monica tiene acceso de lectura a todos los modulos
- **Offline-capable** — los datos se persisten localmente y se sincronizan cuando hay conexion

---

## Documentos Relacionados

- [Modelo de Datos](./data-model.md) — Esquema completo de la base de datos
- [Contextos Empresariales](./enterprise-contexts.md) — Como funciona el multi-tenant
- [Database Context](./database-context-minimal.md) — Contexto de base de datos
