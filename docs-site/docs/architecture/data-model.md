---
title: "Modelo de Datos"
---

> Esquema de base de datos Supabase para Urpe AI Lab

---

## 🏢 Estructura Multi-Tenant y Contextos

El sistema utiliza dos tipos de identificadores de empresa para manejar la arquitectura multi-tenant y el modo observación:

### 1. empresa_id (Dueño del Dato / Contratación)
- **Definición**: Representa la empresa a la que pertenece **físicamente** un registro en la base de datos.
- **Uso Técnico**: Es el campo utilizado en las políticas de RLS (Row Level Security) y como llave foránea en todas las tablas (`wp_contactos`, `wp_team_humano`, `wp_tareas`, etc.).
- **Persistencia**: Es estático y define la pertenencia legal/estructural de la información.

### 2. enterpriseId / selectedEnterpriseId (Lente / Contexto de Observación)
- **Definición**: Representa la empresa que el usuario está **viendo** o **observando** en la interfaz en un momento dado.
- **Uso Técnico**: Se maneja principalmente en el `contactStore` (`selectedEnterpriseId`) y se pasa a las funciones del `DAL` y `Tool Executor`.
- **Dinamismo**: Permite que los miembros del equipo administrativo (Role 1 - Dev Team) cambien su "lente" para ver datos de diferentes empresas sin cambiar su `empresa_id` de contratación.

---

## 📊 Diagrama de Relaciones

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  wp_empresa_    │────<│  wp_team_       │────<│  wp_contactos   │
│  perfil         │     │  humano         │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        │                       │           ┌───────────┼───────────┐
        │                       │           │           │           │
        ▼                       ▼           ▼           ▼           ▼
┌─────────────────┐     ┌─────────────────┐  ┌─────────┐  ┌─────────┐
│  wp_empresa_    │     │  wp_citas       │  │wp_notas │  │wp_conv. │
│  embudo         │     │                 │  │         │  │         │
└─────────────────┘     └─────────────────┘  └─────────┘  └─────────┘
```

---

## 🏢 Tablas Principales

### wp_empresa_perfil
Perfiles de empresas/clientes (multi-tenant).

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | bigserial | PK |
| `nombre` | text | Nombre de la empresa |
| `email` | text | Email de contacto |
| `telefono` | text | Teléfono principal |
| `metadata` | jsonb | Datos flexibles |
| `created_at` | timestamptz | Fecha creación |

### wp_team_humano
Miembros del equipo de cada empresa.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | bigserial | PK |
| `empresa_id` | bigint | FK → wp_empresa_perfil |
| `auth_uid` | uuid | FK → auth.users |
| `nombre` | text | Nombre |
| `apellido` | text | Apellido |
| `email` | text | Email |
| `rol` | text | asesor/supervisor/dueño/admin |
| `role_id` | int | FK → system_roles (permisos) |
| `is_active` | boolean | Estado activo |
| `metadata` | jsonb | Gamificación, config |
| `created_at` | timestamptz | Fecha creación |

### wp_contactos
Leads y clientes del CRM.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | bigserial | PK |
| `empresa_id` | bigint | FK → wp_empresa_perfil |
| `team_humano_id` | bigint | FK → wp_team_humano (asesor asignado) |
| `nombre` | text | Nombre |
| `apellido` | text | Apellido |
| `telefono` | text | Teléfono (WhatsApp) |
| `email` | text | Email |
| `estado` | text | prospecto/cliente/calificado/... |
| `es_calificado` | text | si/no/evaluando |
| `origen` | text | Origen del lead |
| `etapa_embudo` | bigint | FK → wp_empresa_embudo |
| `is_active` | boolean | Contacto activo |
| `paused_until` | timestamptz | Pausa temporal |
| `metadata` | jsonb | Tags, datos custom |
| `ultima_interaccion` | timestamptz | Última actividad |
| `created_at` | timestamptz | Fecha creación |

---

## 📅 Citas y Calendario

### wp_citas
Gestión de citas y eventos.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | bigserial | PK |
| `empresa_id` | bigint | FK → wp_empresa_perfil |
| `contacto_id` | bigint | FK → wp_contactos |
| `team_humano_id` | bigint | FK → wp_team_humano |
| `titulo` | text | Título de la cita |
| `descripcion` | text | Descripción |
| `fecha_inicio` | timestamptz | Inicio |
| `fecha_fin` | timestamptz | Fin |
| `estado` | text | programada/confirmada/cancelada/completada |
| `tipo` | text | llamada/videollamada/presencial |
| `metadata` | jsonb | Datos adicionales |

---

## ✅ Tareas y Proyectos

### wp_proyectos
Contenedores de tareas.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | bigserial | PK |
| `empresa_id` | bigint | FK → wp_empresa_perfil |
| `nombre` | text | Nombre del proyecto |
| `descripcion` | text | Descripción |
| `estado` | text | activo/pausado/completado |
| `contacto_id` | bigint | FK → wp_contactos (opcional) |
| `servicio_id` | bigint | FK → wp_crm_servicios (opcional) |

### wp_tareas
Unidad de trabajo con checklist.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | bigserial | PK |
| `empresa_id` | bigint | FK → wp_empresa_perfil |
| `proyecto_id` | bigint | FK → wp_proyectos |
| `titulo` | text | Título |
| `descripcion` | text | Descripción |
| `estado` | text | pendiente/en_progreso/completada/cancelada |
| `prioridad` | int | 1-4 (baja a urgente) |
| `asignado_a` | bigint | FK → wp_team_humano |
| `contacto_id` | bigint | FK → wp_contactos (contexto) |
| `cita_id` | bigint | FK → wp_citas (contexto) |
| `fecha_vencimiento` | timestamptz | Deadline |

### wp_tareas_items
Checklist de cada tarea.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | bigserial | PK |
| `tarea_id` | bigint | FK → wp_tareas |
| `descripcion` | text | Texto del item |
| `completado` | boolean | Estado |
| `orden` | int | Posición en lista |

---

## 💬 Conversaciones

### wp_conversaciones
Registro de conversaciones WhatsApp/Web.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | bigserial | PK |
| `contacto_id` | bigint | FK → wp_contactos |
| `agente_id` | bigint | FK → wp_team_humano |
| `canal` | text | whatsapp/web |
| `estado` | text | abierto/cerrado/pausado |
| `resumen` | text | Resumen auto-generado |
| `fecha_inicio` | timestamptz | Inicio |

### wp_mensajes / wp_conversacion_mensajes
Mensajes individuales.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | bigserial | PK |
| `conversacion_id` | bigint | FK → wp_conversaciones |
| `contenido` | text | Cuerpo del mensaje |
| `remitente` | text | cliente/agente/sistema/asistente |
| `tipo` | text | texto/imagen/audio/video/archivo |
| `estado` | text | enviado/entregado/leido/fallido |
| `created_at` | timestamptz | Timestamp |

---

## 💰 Finanzas

### wp_crm_servicios
Servicios contratados.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | bigserial | PK |
| `empresa_id` | bigint | FK → wp_empresa_perfil |
| `contacto_id` | bigint | FK → wp_contactos |
| `nombre` | text | Nombre del servicio |
| `valor_total` | decimal | Monto total |
| `saldo_pendiente` | decimal | Monto pendiente |
| `estado` | text | activo/completado/cancelado |

### wp_crm_pagos
Historial de abonos.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | bigserial | PK |
| `servicio_id` | bigint | FK → wp_crm_servicios |
| `monto` | decimal | Monto del pago |
| `fecha_pago` | timestamptz | Fecha |
| `comprobante_url` | text | URL en Storage |
| `metadata` | jsonb | Datos adicionales |

---

## 📧 Marketing

### wp_email_campanas
Campañas de email.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | bigserial | PK |
| `empresa_id` | bigint | FK (null = sistema) |
| `nombre` | text | Nombre |
| `descripcion` | text | Descripción |
| `estado` | text | borrador/activa/pausada/archivada |
| `cadencia_dias` | int | Días entre toques |
| `total_toques` | int | Número de emails |

### wp_email_contacto_campana
Enrollments de contactos.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | bigserial | PK |
| `campana_id` | bigint | FK → wp_email_campanas |
| `contacto_id` | bigint | FK → wp_contactos |
| `estado` | text | activo/completado/cancelado/pausado |
| `toque_actual` | int | Progreso |

---

## 🎮 Gamificación

Los datos de gamificación se almacenan en `wp_team_humano.metadata.gamification`:

```json
{
  "xp": 450,
  "level": 3,
  "streak": {
    "current": 5,
    "longest": 12,
    "lastActivityDate": "2024-12-28"
  },
  "badges": ["velocista_bronce", "comunicador_plata"],
  "missions": [...]
}
```

---

## 🔐 Seguridad Multi-Tenant

Todas las tablas principales implementan RLS:

```sql
-- Ejemplo política RLS
CREATE POLICY "tenant_isolation" ON wp_contactos
FOR ALL USING (
  empresa_id IN (SELECT get_user_empresa_ids())
);
```

**Función helper:**
```sql
CREATE FUNCTION get_user_empresa_ids() RETURNS SETOF bigint AS $$
  SELECT empresa_id FROM wp_team_humano 
  WHERE auth_uid = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER;
```

---

## 📁 Storage Buckets

| Bucket | Visibilidad | Contenido |
|--------|-------------|-----------|
| `comprobantes` | Público | Recibos de pago |
| `contratos` | Privado | Documentos legales |
| `avatars` | Público | Fotos de perfil |
| `chat-uploads` | Privado | Archivos del chat |
