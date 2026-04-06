---
title: "Modulo Embudo de Ventas"
---

# Modulo Embudo de Ventas

Pipeline de ventas con etapas configurables, instrucciones para el agente IA y seguimiento automatico.

---

## Proposito

El modulo de Embudo permite a cada empresa definir su propio pipeline de ventas con etapas personalizadas. Estas etapas guian tanto al equipo humano como al agente IA Monica en el proceso de conversion de leads a clientes.

Cada etapa incluye instrucciones especificas que le indican al agente IA como debe comportarse, que acciones tomar y cuando avanzar al contacto a la siguiente etapa.

---

## Conceptos Clave

### Etapas del Embudo

El embudo se compone de etapas ordenadas que representan el recorrido de un lead hasta convertirse en cliente. Cada empresa configura sus propias etapas segun su proceso comercial.

Ejemplo tipico de embudo:

| Orden | Etapa | Descripcion |
|-------|-------|-------------|
| 1 | Nuevo Lead | Contacto recien ingresado, sin calificar |
| 2 | Contactado | Se hizo primer contacto, esperando respuesta |
| 3 | Interesado | Mostro interes en el producto o servicio |
| 4 | Cita Programada | Se agendo una reunion o demostracion |
| 5 | Propuesta Enviada | Se envio cotizacion o propuesta formal |
| 6 | Negociacion | En proceso de cierre |
| 7 | Cliente | Conversion exitosa |

### Configuracion por Etapa

Cada etapa tiene los siguientes elementos configurables:

| Elemento | Descripcion |
|----------|-------------|
| Nombre | Identificador unico de la etapa |
| Color | Color visual para identificar la etapa en el Kanban |
| Icono | Emoji representativo |
| Descripcion | Explicacion de que significa esta etapa |
| Instrucciones para IA | Como debe actuar Monica cuando un contacto esta en esta etapa |
| Acciones permitidas | Que puede hacer el agente (agendar cita, escalar, enviar info, etc.) |
| Criterios de avance | Condiciones para mover al contacto a la siguiente etapa |
| Senales de progreso | Indicadores de que el lead esta madurando |

---

## Instrucciones para el Agente IA

Cada etapa del embudo incluye instrucciones detalladas que el agente Monica utiliza para:

1. **Adaptar su tono y enfoque** segun la etapa del contacto
2. **Saber que acciones tomar** (agendar cita, enviar informacion, escalar a humano)
3. **Decidir cuando avanzar** al contacto a la siguiente etapa
4. **Identificar senales** de interes, objecion o abandono

Esto permite que el agente IA se comporte de manera diferente segun la etapa en que se encuentre cada contacto, sin necesidad de intervencion manual.

---

## Seguimiento Automatico (Follow-up)

Cada etapa puede tener configurado un sistema de seguimiento automatico:

| Configuracion | Descripcion |
|---------------|-------------|
| Activo | Si el follow-up esta habilitado para esta etapa |
| Horario | Rango de horas y dias permitidos para enviar mensajes |
| Seguimientos | Lista de mensajes con tiempos de espera entre cada uno |

Ejemplo: Si un contacto en la etapa "Contactado" no responde, el sistema puede enviar:

- Primer seguimiento a las 24 horas
- Segundo seguimiento a las 72 horas
- Tercer seguimiento a la semana

Los seguimientos respetan el horario configurado (por ejemplo, solo de lunes a viernes de 8:00 a 18:00).

---

## Vista Kanban

Los contactos se visualizan en un tablero Kanban donde cada columna representa una etapa del embudo. Desde esta vista se puede:

- Ver cuantos contactos hay en cada etapa
- Mover contactos entre etapas arrastrando
- Filtrar por etapa especifica
- Identificar rapidamente el estado del pipeline

---

## Colores por Defecto

Al crear nuevas etapas, el sistema sugiere colores predeterminados:

| Orden | Color |
|-------|-------|
| 1 | Gris |
| 2 | Rojo |
| 3 | Naranja |
| 4 | Ambar |
| 5 | Verde |
| 6 | Azul |
| 7 | Purpura |
| 8 | Rosa |

---

## Permisos

| Rol | Capacidades |
|-----|-------------|
| Admin / Supervisor | Crear, editar, reordenar y eliminar etapas |
| Asesor | Solo lectura de la configuracion del embudo |

Las etapas no se pueden eliminar si tienen contactos asignados. Primero se deben mover los contactos a otra etapa.

---

## Flujo de Configuracion

1. Ir a **Configuracion** y seleccionar **Embudo**
2. Crear etapas con el boton "Nueva Etapa"
3. Configurar para cada etapa:
   - Nombre, color e icono
   - Instrucciones para el agente IA
   - Mensajes de seguimiento automatico
4. Reordenar las etapas con las flechas de posicion
5. Guardar y verificar en la vista Kanban de contactos

---

## Documentacion Relacionada

- [Contactos](../contacts/)
- [Agente Monica AI](../monica-ai/)
- [Equipo](../team/)
