---
title: "Centro de Actividad"
---

# Centro de Actividad

Sistema unificado de notificaciones inteligentes, alertas automaticas y novedades de la plataforma.

---

## Proposito

El Centro de Actividad es el punto central donde cada miembro del equipo recibe alertas sobre eventos importantes: citas proximas, tareas vencidas, mensajes urgentes, solicitudes de intervencion y actualizaciones de la plataforma.

Todo se unifica en una sola interfaz con dos secciones:

- **Notificaciones**: Alertas del sistema en tiempo real
- **Novedades**: Changelog con las ultimas mejoras de Urpe AI Lab

---

## Tipos de Notificacion

| Tipo | Descripcion |
|------|-------------|
| Nueva cita | Se programo una cita para el asesor |
| Intervencion humana | El agente IA solicita que un humano tome el control de la conversacion |
| Mensaje urgente | Un contacto envio un mensaje de alta prioridad |
| Tarea asignada | Se le asigno una nueva tarea al asesor |
| Recordatorio | Alerta de tiempo sobre una actividad proxima |
| Sistema | Notificaciones generales de la plataforma |
| Deep Research | Estado de investigaciones profundas del agente IA |

---

## Alertas Automaticas al Iniciar Sesion

Al entrar a la plataforma, el sistema verifica automaticamente (con un breve delay para no afectar la carga):

| Verificacion | Condicion | Resultado |
|--------------|-----------|-----------|
| **Citas proximas** | En las proximas 24 horas | Notificacion con urgencia segun tiempo restante |
| **Citas urgentes** | En menos de 2 horas | Notificacion marcada como urgente |
| **Tareas vencidas** | Fecha de vencimiento ya paso | Alerta de tarea vencida |
| **Tareas por vencer** | Vencen en las proximas 24 horas | Recordatorio de proximidad |

El sistema previene duplicados: no se repite una alerta de cita si ya se notifico en las ultimas 12 horas, ni de tarea si se notifico en las ultimas 6 horas.

---

## Funcionalidades

### Tiempo Real

Las notificaciones llegan en tiempo real. Cuando ocurre un evento (nueva cita, tarea asignada, etc.), la alerta aparece instantaneamente sin necesidad de recargar la pagina.

### Estados de Notificacion

Cada notificacion tiene un ciclo de vida:

| Estado | Descripcion |
|--------|-------------|
| No leida | Notificacion nueva, pendiente de atencion |
| Leida | El usuario ya la vio |
| Respondida | El usuario proporciono una respuesta (si se requeria) |

### Notificaciones con Respuesta

Algunas notificaciones requieren una accion por parte del usuario. Por ejemplo, cuando el agente IA solicita intervencion humana, el asesor puede responder directamente desde la notificacion indicando que accion tomo.

### Filtros

- **Todas**: Vista completa de notificaciones
- **No leidas**: Solo las pendientes de lectura
- **Requieren respuesta**: Notificaciones que necesitan accion
- **Busqueda**: Buscar por texto dentro de las notificaciones

### Acciones Rapidas

- Marcar todas como leidas con un solo clic
- Navegar directamente al contacto o tarea relacionada
- Responder notificaciones sin salir del panel

---

## Novedades (Changelog)

La seccion de Novedades muestra las ultimas actualizaciones y mejoras de la plataforma. Se indica con un punto azul cuando hay novedades no vistas.

---

## Comportamiento por Rol

| Rol | Comportamiento |
|-----|---------------|
| Admin / Supervisor | Recibe notificaciones de todo el equipo |
| Asesor | Recibe solo sus notificaciones personales |

---

## Documentacion Relacionada

- [Centro de Actividad - Contexto](./CENTRO_ACTIVIDAD_CONTEXT.md)
- [Notificaciones V2](./NOTIFICATIONS_V2_UPGRADE.md)
- [Tareas](../tasks/)
- [Contactos](../contacts/)
