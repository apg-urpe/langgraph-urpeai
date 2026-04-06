---
title: "Modulo Equipo"
---

# Modulo Equipo

Gestion de miembros del equipo, roles, permisos e invitaciones.

---

## Proposito

El modulo de Equipo permite administrar quienes tienen acceso a la plataforma, que pueden hacer y como se organizan dentro de la empresa. Desde aqui se gestionan los miembros, se asignan roles con permisos granulares y se configura la disponibilidad para citas.

---

## Gestion de Miembros

Cada miembro del equipo tiene un perfil con la siguiente informacion:

### Datos Personales

- Nombre y apellido
- Email (usado para acceso a la plataforma)
- Telefono de contacto
- Zona horaria

### Configuracion de Citas

- Acepta citas (activar/desactivar)
- Duracion predeterminada de sus citas
- Disponibilidad por dia y horario
- Zona horaria para el calendario

### Integraciones

- URL de Calendly (sincronizacion de agenda)
- Slack ID (notificaciones por Slack)
- Grupo de WhatsApp

---

## Sistema de Roles y Permisos

Urpe AI Lab utiliza un sistema de roles que controla el acceso a las funcionalidades:

| Rol | Descripcion | Alcance |
|-----|-------------|---------|
| Admin / Dueno | Gestion completa de la empresa | Acceso total a todos los datos y configuraciones |
| Supervisor | Gestion del equipo | Acceso a datos de su equipo, configuracion limitada |
| Asesor | Operacion diaria | Solo acceso a sus propios datos y contactos asignados |

### Que puede hacer cada rol

| Funcionalidad | Admin | Supervisor | Asesor |
|---------------|-------|------------|--------|
| Ver todos los contactos | Si | Si | Solo los suyos |
| Gestionar equipo | Si | Si | No |
| Configurar embudo | Si | Si | Solo lectura |
| Ver dashboard completo | Si | Si | Solo sus metricas |
| Cambiar filtro de equipo | Si | Si | Bloqueado a su ID |
| Configurar integraciones | Si | No | No |

---

## Filtro Global de Equipo

El filtro de equipo es un selector presente en toda la plataforma que permite a supervisores y administradores ver los datos de un miembro especifico o de todo el equipo.

Comportamiento por rol:

- **Admin / Supervisor**: Pueden cambiar el filtro libremente para ver datos de cualquier miembro
- **Asesor**: El filtro esta bloqueado a su propio perfil, solo ve sus datos

Este filtro afecta las siguientes vistas:

- Dashboard
- Contactos
- Calendario
- Tareas

---

## Ciclo de Vida de un Miembro

| Accion | Descripcion |
|--------|-------------|
| Invitar | Se envia una invitacion por email para unirse a la plataforma |
| Activar | El miembro acepta la invitacion y configura su acceso |
| Editar | Actualizar datos, rol o configuracion |
| Archivar | Desactivar el miembro sin eliminar su historial |

El archivado es "suave": el historial de actividades, tareas y contactos del miembro se conserva intacto.

---

## Invitaciones

El sistema de invitaciones permite agregar nuevos miembros al equipo:

1. El administrador crea la invitacion con email y rol asignado
2. Se envia un enlace magico (magic link) al email del invitado
3. El invitado accede al enlace y configura su perfil
4. Queda activo en la plataforma con el rol asignado

---

## Documentacion Relacionada

- [Invitaciones V2](./INVITATIONS_V2.md)
- [Magic Link Invitations](./MAGIC_LINK_INVITATIONS.md)
- [Gamificacion](../gamification/)
