---
title: "Nylas — Calendario y Email"
---

> Sincronizacion de calendario y bandeja de email

---

## Que es Nylas

Nylas es el servicio que conecta Monica Inteligent con tus cuentas de Google Calendar, Outlook y bandejas de email. Gracias a Nylas, tu equipo puede gestionar citas y correos sin salir de la plataforma.

---

## Calendario Sincronizado

### Que puedes hacer

| Funcionalidad | Descripcion |
|---------------|-------------|
| **Ver tu agenda** | Tus eventos de Google Calendar o Outlook aparecen directamente en Monica Inteligent |
| **Crear citas** | Las citas creadas en la plataforma se sincronizan con tu calendario externo |
| **Vistas de equipo** | Ve la agenda de todo tu equipo en vista de columnas (cada miembro una columna) |
| **Tipos de cita** | Llamada, videollamada o presencial — cada una con su flujo |

### Calendarios soportados

| Proveedor | Estado |
|-----------|--------|
| Google Calendar | Activo |
| Microsoft Outlook | Activo |
| Apple Calendar | Disponible via Nylas |

### Disponibilidad

Cada miembro del equipo puede configurar:
- **Duracion de citas** — slots de 15, 30, 45 o 60 minutos
- **Horarios disponibles** — dias y horas en las que aceptan citas
- **Zona horaria** — para equipos distribuidos geograficamente

---

## Email Intelligence

### Bandeja unificada

Con la integracion de Nylas, Monica Inteligent puede acceder a tu bandeja de email para:

| Capacidad | Descripcion |
|-----------|-------------|
| **Categorizacion automatica** | Monica clasifica emails como ventas, soporte, interno, personal, marketing, legal o spam |
| **Prioridad** | Cada email recibe una prioridad (alta, media, baja) basada en su contenido |
| **Sentimiento** | Detecta si el email tiene tono positivo, negativo o neutro |
| **Resumen** | Genera resumenes automaticos de emails largos |
| **Preguntas** | Puedes preguntarle a Monica sobre tus correos: "Que emails de ventas recibi hoy?" |

### Proveedores soportados

| Proveedor | Estado |
|-----------|--------|
| Gmail | Activo |
| Outlook / Office 365 | Activo |
| IMAP generico | Disponible |

---

## Privacidad

- La conexion con tu cuenta de email es segura y encriptada
- Monica Inteligent solo lee los emails — no envia correos sin tu autorizacion
- Puedes desconectar tu cuenta en cualquier momento
- Los datos de email se procesan pero no se almacenan permanentemente

---

## Para el equipo tecnico

::: tip Contexto tecnico
Nylas se integra via su API REST v3. Los calendarios usan webhook events para sincronizacion bidireccional. El email usa la API de mensajes con scopes de lectura. Credenciales: NYLAS_CLIENT_ID y NYLAS_API_KEY en el entorno. Mas detalles en la [guia de setup](/getting-started/environment-setup).
:::
