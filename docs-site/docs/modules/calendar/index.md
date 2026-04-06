---
title: "Modulo Calendario"
---

# Calendario

> Gestion de citas y eventos del equipo comercial

---

## Proposito

El modulo de Calendario permite a tu equipo gestionar todas las citas y reuniones con clientes y prospectos desde un solo lugar. Ofrece multiples vistas para adaptarse al flujo de trabajo de cada asesor.

**Funciones principales:**

- Crear, editar y cancelar citas vinculadas a contactos del CRM
- Visualizar la agenda del equipo por dia, semana o mes
- Filtrar citas por miembro del equipo
- Sincronizacion con Google Calendar y otros calendarios externos

---

## Vistas del Calendario

### Vista Mensual

- Cuadricula de dias con indicadores de color por tipo de cita
- Click en un dia para ver el detalle de citas programadas
- Navegacion rapida entre meses

### Vista Semanal

- Timeline por horas con todas las citas del equipo
- Arrastrar y soltar para reagendar citas rapidamente
- Vista lado a lado de multiples asesores

### Vista Diaria (Columnas por Equipo)

La vista mas detallada, con una columna por cada asesor activo:

- Timeline de 8:00 a 20:00 con slots por hora
- Click en una celda vacia para crear una cita con fecha, hora y asesor preseleccionados
- Si se aplica el filtro global de equipo, solo se muestra la columna del asesor seleccionado
- Columna "Sin asignar" para citas sin asesor

### Crear Nueva Cita

Hay dos formas rapidas de crear una cita:

| Metodo | Descripcion |
|--------|-------------|
| Boton "+" en la barra de herramientas | Abre el formulario de nueva cita desde cualquier vista |
| Click en slot vacio (vista diaria) | Pre-rellena fecha, hora y asesor segun la celda seleccionada |

---

## Estados de Cita

| Estado | Color | Descripcion |
|--------|-------|-------------|
| Programada | Azul | Pendiente de confirmar por el contacto |
| Confirmada | Verde | El contacto confirmo la cita |
| Cancelada | Rojo | La cita fue cancelada |
| Completada | Gris | La cita ya se realizo |

---

## Tipos de Cita

- **Llamada**: Cita telefonica con el contacto
- **Videollamada**: Reunion virtual por video
- **Presencial**: Reunion en persona con ubicacion

---

## Filtro Global de Equipo

El calendario respeta el filtro global de equipo disponible en todo el panel de administracion. Si un supervisor selecciona un asesor especifico en el filtro, el calendario muestra solo las citas de ese asesor.

---

## Integracion con Calendarios Externos

Urpe AI Lab se integra con Google Calendar y Outlook mediante Nylas, lo que permite:

- Sincronizacion bidireccional de citas
- Ver disponibilidad real del asesor
- Evitar conflictos de agenda

---

## Documentacion Relacionada

- [Contactos](../contacts/)
- [Equipo](../team/)
