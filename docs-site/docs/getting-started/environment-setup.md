---
title: "Configuracion del Entorno de Desarrollo"
---

> Guia para el equipo tecnico interno de Monica Inteligent

::: tip Nota
Esta pagina es para el equipo de desarrollo de Monica Inteligent. Si eres usuario de la plataforma, no necesitas esta informacion — tu cuenta ya esta configurada y lista para usar.
:::

---

## Que necesitas

Para trabajar en el desarrollo de la plataforma necesitas credenciales de acceso a los servicios que soportan Monica Inteligent. El equipo de infraestructura te proporcionara las credenciales necesarias.

---

## Servicios y Credenciales

### Supabase — Backend principal

Supabase es el corazon de la infraestructura: autenticacion, base de datos, sincronizacion en tiempo real y almacenamiento de archivos.

| Credencial | Uso | Quien la proporciona |
|------------|-----|---------------------|
| URL del proyecto | Conexion al backend | Equipo de infraestructura |
| Key publica | Operaciones del cliente web | Equipo de infraestructura |
| Key privada (service role) | Operaciones del servidor | Solo administradores |

### Gemini AI — Motor de Monica

Gemini 3 Flash es el modelo de IA que potencia a Monica. Se necesita una API Key de Google AI Studio.

| Credencial | Uso | Donde obtenerla |
|------------|-----|-----------------|
| API Key de Gemini | Procesamiento de IA, function calling, analisis multimedia | [Google AI Studio](https://aistudio.google.com) |

### Nylas — Calendario y Email (opcional)

Nylas conecta la plataforma con Google Calendar, Outlook y bandejas de email.

| Credencial | Uso |
|------------|-----|
| Client ID | Identificacion de la app |
| API Key | Operaciones de calendario y email |

### OpenRouter — Respaldo de IA (opcional)

OpenRouter funciona como sistema de respaldo automatico cuando Gemini tiene problemas de disponibilidad.

| Credencial | Uso |
|------------|-----|
| API Key | Acceso a modelos de respaldo |

---

## Seguridad

- Las credenciales de produccion **nunca** se comparten por canales no seguros
- La key privada de Supabase (service role) tiene acceso completo a la base de datos — solo administradores deben tenerla
- Las credenciales de cada entorno (desarrollo, staging, produccion) son diferentes
- El equipo de infraestructura rota las keys periodicamente

---

## Entornos

| Entorno | Proposito | Quien tiene acceso |
|---------|-----------|-------------------|
| **Desarrollo** | Pruebas locales del equipo | Todos los desarrolladores |
| **Produccion** | Plataforma en vivo para clientes | Solo administradores via Vercel |

---

## Verificacion

Una vez configurado, la plataforma deberia conectar sin errores a:
- Autenticacion de Supabase
- Base de datos
- API de Gemini (al enviar el primer mensaje en el chat)

Si algo falla, contacta al equipo de infraestructura.

---

## Recursos relacionados

- [Primeros Pasos](/getting-started/) — Guia general de la plataforma
- [Arquitectura](/architecture/) — Como esta construida la plataforma
- [Guia del Equipo Dev](/contributing/) — Convenciones y flujo de trabajo
