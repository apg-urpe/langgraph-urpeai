---
title: "MCP Tools — Herramientas de los Agentes"
---

> Sistema avanzado de herramientas para Monica IA

---

## Que son las MCP Tools

MCP (Model Context Protocol) es el sistema que organiza y gestiona las herramientas que Monica puede usar. Cada herramienta es una accion especifica que Monica ejecuta cuando la necesita — buscar contactos, ver metricas, crear notas, etc.

---

## Como funciona

Cuando le haces una pregunta a Monica, ella decide automaticamente que herramientas necesita:

```
Tu: "Cuantos contactos nuevos tuvimos esta semana?"
        ↓
Monica analiza la pregunta
        ↓
Decide usar: herramienta "buscar_contactos" con filtro de fecha
        ↓
El sistema ejecuta la consulta en tu base de datos
        ↓
Monica recibe los resultados y genera tu respuesta
```

Todo esto sucede en segundos, de forma transparente.

---

## Herramientas Disponibles

### CRM & Contactos

| Herramienta | Que hace |
|-------------|----------|
| Buscar contactos | Encuentra leads por nombre, telefono, email o cualquier campo |
| Detalle de contacto | Perfil completo con historial de conversaciones, citas y notas |
| Contexto completo | Toda la informacion de un contacto en una sola consulta |
| Lead scoring | Ordena contactos por puntuacion de probabilidad de conversion |
| Crear nota | Agrega notas al perfil de un contacto |

### Calendario & Citas

| Herramienta | Que hace |
|-------------|----------|
| Ver citas | Lista citas programadas, realizadas o canceladas |
| Programar cita | Crea nuevas citas en el calendario |

### Metricas & Reportes

| Herramienta | Que hace |
|-------------|----------|
| Metricas del negocio | KPIs, tendencias, tasas de conversion |
| Estadisticas de funnel | Estado del pipeline de ventas |
| Metricas de campanas | Resultados de campanas de email marketing |

### Tareas & Proyectos

| Herramienta | Que hace |
|-------------|----------|
| Ver tareas | Lista tareas pendientes por prioridad y responsable |
| Listar proyectos | Proyectos activos con costos y estado |

### Comunicacion

| Herramienta | Que hace |
|-------------|----------|
| Historial de chats | Conversaciones previas de WhatsApp y web |
| Buscar en mensajes | Busca texto en el historial de mensajes |
| Historial de emails | Correos enviados en campanas de marketing |

### Busqueda Avanzada

| Herramienta | Que hace |
|-------------|----------|
| Sub-agente CRM | Delega busquedas complejas a un agente especializado que combina multiples consultas |

---

## Roles y Herramientas

Cada rol de Monica tiene acceso a un conjunto diferente de herramientas:

| Rol | Herramientas habilitadas |
|-----|--------------------------|
| **Default** | Todas las herramientas basicas |
| **Analista** | Enfasis en metricas y reportes |
| **Ventas** | Enfasis en contactos, funnel y seguimiento |
| **Soporte** | Enfasis en historial y resolucion |

Los administradores pueden personalizar que herramientas estan disponibles para cada rol desde el editor de roles.

---

## Trazabilidad

Cada vez que Monica usa una herramienta, queda registrado:
- Que herramienta uso
- Con que parametros
- Cuanto tardo en ejecutarse
- Si fue exitosa o no

Esto permite al equipo tecnico monitorear el rendimiento y diagnosticar problemas.

---

## Para el equipo tecnico

::: tip Contexto tecnico
El sistema de tools usa el formato de function calling nativo de Gemini con schemas JSON. Las herramientas se organizan en Toolsets (CRM, Analytics, Calendar) que se habilitan/deshabilitan por rol. El sub-agente CRM Searcher tiene un limite de 5 iteraciones y 3 tools por iteracion. Mas detalles en [Monica AI](/modules/monica-ai/) y el [Plan Multi-Agente](/modules/monica-ai/MULTI_AGENT_PLAN).
:::
