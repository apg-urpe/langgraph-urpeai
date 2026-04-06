---
title: "Supabase — Backend de la Plataforma"
---

> Como se almacenan y protegen tus datos

---

## Que es Supabase

Supabase es la infraestructura central de Monica Inteligent. Es el servicio que se encarga de:

- **Autenticacion** — login seguro con email y contrasena
- **Base de datos** — donde viven todos tus contactos, conversaciones, tareas y finanzas
- **Sincronizacion en tiempo real** — cuando un miembro de tu equipo hace un cambio, todos lo ven al instante
- **Almacenamiento** — archivos, imagenes, comprobantes y documentos
- **Aislamiento de datos** — cada empresa tiene su espacio privado, completamente separado de otros clientes

---

## Seguridad de tus datos

### Aislamiento Multi-Tenant

Cada empresa cliente tiene sus datos completamente aislados mediante **Row Level Security (RLS)**. Esto significa que:

- Un usuario de tu empresa **nunca** puede ver datos de otra empresa
- Las politicas de seguridad se aplican a nivel de base de datos, no solo de la aplicacion
- Incluso si alguien intentara manipular la interfaz, la base de datos bloquearia el acceso

### Capas de proteccion

| Capa | Como protege tus datos |
|------|------------------------|
| **Base de datos** | Filtros automaticos por empresa en cada consulta |
| **Autenticacion** | Sesiones seguras con tokens encriptados |
| **API** | Validacion de pertenencia antes de retornar datos |
| **Almacenamiento** | Archivos accesibles solo por miembros de tu empresa |

### Backups

Los datos se respaldan automaticamente. Nosotros administramos la infraestructura de backups como parte del servicio.

---

## Sincronizacion en Tiempo Real

Cuando tu equipo trabaja en la plataforma, los cambios se reflejan al instante para todos:

- Un asesor mueve un contacto en el pipeline → el lider de equipo lo ve inmediatamente
- Un nuevo mensaje llega por WhatsApp → aparece en la bandeja de todos los miembros con acceso
- Se registra un pago → el dashboard actualiza las metricas en vivo

No necesitas recargar la pagina — todo se sincroniza automaticamente.

---

## Almacenamiento de Archivos

La plataforma almacena diferentes tipos de archivos de forma segura:

| Tipo | Ejemplos | Acceso |
|------|----------|--------|
| **Comprobantes** | Recibos de pago, facturas | Solo miembros de la empresa |
| **Multimedia** | Imagenes, PDFs compartidos con contactos | Vinculados al contacto |
| **Avatares** | Fotos de perfil del equipo | Publico |
| **Chat** | Archivos enviados en conversaciones | Solo participantes |

---

## Para el equipo tecnico

::: tip Contexto tecnico
Supabase usa PostgreSQL como base de datos, con Row Level Security basado en `empresa_id`. La autenticacion usa el flujo PKCE de Supabase Auth. Los clientes frontend usan la key publica (anon) y las operaciones del servidor usan la key privada (service role). Mas detalles en la [guia de setup](/getting-started/environment-setup).
:::
