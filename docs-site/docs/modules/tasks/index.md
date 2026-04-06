---
title: "Modulo Tareas"
---

# Modulo Tareas

Sistema de gestion de tareas con checklist, prioridades y asignacion por contexto.

---

## Proposito

El modulo de Tareas permite a los equipos comerciales organizar y dar seguimiento a todas las actividades pendientes dentro de Urpe AI Lab. Cada tarea puede vincularse a un contacto, una cita o un proyecto, asegurando que nada quede sin atencion.

Funcionalidades principales:

- **Crear y asignar tareas** a miembros del equipo
- **Checklist integrado** con items de verificacion por tarea
- **Prioridades visuales** con colores para identificar urgencia rapidamente
- **Contexto flexible** vinculando tareas a contactos, citas o proyectos
- **Filtros avanzados** por estado, prioridad, asignado, proyecto y fechas

---

## Sistema de Prioridades

Cada tarea tiene un nivel de prioridad que se refleja visualmente con colores:

| Nivel | Nombre | Color | Uso recomendado |
|-------|--------|-------|-----------------|
| 1 | Baja | Gris | Tareas sin urgencia, se pueden hacer cuando haya tiempo |
| 2 | Media | Azul | Tareas de rutina con plazo flexible |
| 3 | Alta | Ambar | Tareas importantes que requieren atencion pronto |
| 4 | Urgente | Rojo | Atencion inmediata, alta prioridad |

---

## Estados de una Tarea

Una tarea pasa por los siguientes estados:

| Estado | Descripcion |
|--------|-------------|
| Pendiente | Tarea creada, esperando ser iniciada |
| En progreso | Alguien esta trabajando en ella |
| Completada | Tarea finalizada exitosamente |
| Cancelada | Tarea descartada o ya no aplica |

---

## Checklist por Tarea

Cada tarea puede incluir un checklist con multiples items de verificacion. Esto permite desglosar una tarea compleja en pasos mas pequenos y trackear el progreso visualmente con una barra de avance.

Caracteristicas del checklist:

- Agregar, editar y eliminar items
- Marcar items como completados con un clic
- Reordenar items arrastrando
- Barra de progreso que muestra el porcentaje completado

---

## Vinculacion por Contexto

Las tareas no existen en el vacio. Se pueden vincular a diferentes entidades del CRM:

| Contexto | Ejemplo de uso |
|----------|----------------|
| **Contacto** | "Enviar propuesta comercial a Juan Perez" |
| **Cita** | "Preparar presentacion para la cita del viernes" |
| **Proyecto** | "Revisar entregables del proyecto X" |
| **General** | Tareas internas sin contexto especifico |

Desde la ficha de un contacto o un proyecto, se pueden ver todas las tareas asociadas.

---

## Filtros y Vistas

El modulo ofrece filtros para encontrar tareas rapidamente:

- **Por estado**: Pendiente, en progreso, completada, cancelada
- **Por prioridad**: Baja, media, alta, urgente
- **Por asignado**: Ver tareas de un miembro especifico
- **Por proyecto**: Filtrar por proyecto asociado
- **Por fechas**: Rango de fecha de vencimiento
- **Filtros rapidos**:
  - Ocultar completadas (toggle)
  - Ver solo mis tareas (toggle)

---

## Integracion con el Equipo

- Los supervisores y administradores pueden ver y gestionar las tareas de todo el equipo
- Los asesores ven unicamente sus tareas asignadas o creadas por ellos
- Las tareas vencidas generan notificaciones automaticas en el Centro de Actividad

---

## Documentacion Relacionada

- [Plan Tareas V3](./TAREAS_V3_PLAN.md)
- [Activity Logging](./ACTIVITY_LOGGING_PLAN.md)
- [Contactos](../contacts/)
- [Notificaciones](../notifications/)
