# Manual Send Endpoints — AI Agent Context

> **Propósito de este documento:** Guía de configuración y uso de los endpoints de envío manual del sistema URPE AI Lab. Está escrito para que un agente de IA pueda entender cómo funcionan, cuándo usarlos y cómo estructurar las llamadas correctamente.

---

## Resumen del sistema

El sistema URPE AI Lab expone una API en `https://brain.urpeailab.com` que permite enviar mensajes directamente a contactos **sin activar el agente de IA conversacional**. Esto es útil para:

- Enviar notificaciones automáticas desde flujos externos (n8n, Zapier, etc.)
- Permitir a un asesor humano enviar mensajes programáticamente
- Confirmar citas, enviar recordatorios, o responder consultas simples sin IA

Existen **tres endpoints** dependiendo de la plataforma de mensajería del contacto:

| Canal | Endpoint |
|---|---|
| GHL (Instagram o Facebook vía Go High Level) | `POST /api/v1/ghl/send` |
| ManyChat (Instagram o Facebook vía ManyChat) | `POST /api/v1/manychat/send` |
| Kapso / WhatsApp | `POST /api/v1/kapso/send` |

### Inyección en memoria del agente

Los tres endpoints inyectan automáticamente el mensaje enviado en la tabla `agent_memory` de Supabase. Esto significa que la próxima vez que el contacto escriba, el agente de IA verá en su historial:

```
[Asesor humano]: <texto del mensaje enviado>
```

Esto permite que el agente entienda el contexto de lo que el asesor escribió manualmente y no trate la siguiente interacción como si no hubiera antecedentes.

---

## Concepto clave: `contacto_id`

El único identificador que necesitas conocer es el **`contacto_id`** — un número entero que identifica al contacto en la tabla `wp_contactos` de Supabase.

El sistema se encarga de:
1. Buscar el contacto en la base de datos
2. Recuperar su identificador en la plataforma (GHL contact_id, ManyChat subscriber_id, o teléfono)
3. Recuperar las credenciales y configuración del canal desde la última conversación
4. Enviar el mensaje
5. Guardar el mensaje en la base de datos
6. Inyectar el mensaje en la memoria del agente

**No necesitas saber el subscriber_id, el api_key, el phone_number_id ni el canal** — todo se resuelve automáticamente.

---

## Autenticación

Todos los endpoints `/send` requieren el header `X-Send-Key` con la clave secreta configurada en el servidor (variable de entorno `SEND_API_KEY`).

```
X-Send-Key: {valor_de_SEND_API_KEY}
Content-Type: application/json
```

Si la clave es incorrecta o está ausente, el servidor responde con HTTP `401`.

---

## Endpoint 1: GHL Send

### Cuándo usarlo
Cuando el contacto se comunicó originalmente a través de **Go High Level** (GHL). Esto incluye contactos de Instagram o Facebook que llegaron por el webhook `/api/v1/ghl/inbound`. Se reconocen porque su conversación tiene el canal `ghl_instagram` o `ghl_facebook` en la tabla `wp_conversaciones`.

### Llamada

```
POST https://brain.urpeailab.com/api/v1/ghl/send
```

**Headers:**
```
Content-Type: application/json
X-Send-Key: {SEND_API_KEY}
```

**Body:**
```json
{
  "contacto_id": 285318,
  "mensaje": "Hola, ¿en qué te puedo ayudar?"
}
```

**Campo opcional:**
```json
{
  "contacto_id": 285318,
  "mensaje": "Mensaje de ejemplo",
  "location_id": "ghl_location_id_aqui"
}
```
> `location_id` solo es necesario si el sistema no lo puede recuperar automáticamente desde la base de datos. En condiciones normales, omitirlo es correcto.

### Respuesta exitosa

```json
{
  "ok": true,
  "contacto_id": 285318,
  "contact_id": "ghl_contact_abc123",
  "guardado_en_db": true,
  "error": null
}
```

### Envío con múltiples burbujas

GHL soporta dividir un mensaje en burbujas separadas. Para enviar múltiples mensajes en secuencia, separa el texto con `\n\n---\n\n`:

```json
{
  "contacto_id": 285318,
  "mensaje": "Hola! Te escribimos de URPE.\n\n---\n\nTu consulta ha sido recibida. Te respondemos en breve."
}
```

Esto envía **dos mensajes separados** al contacto. Cada uno queda registrado individualmente en la base de datos.

---

## Endpoint 2: ManyChat Send

### Cuándo usarlo
Cuando el contacto se comunicó originalmente a través de **ManyChat**. Esto incluye contactos de Instagram o Facebook que llegaron por el webhook `/api/v1/manychat/inbound`. Se reconocen porque su conversación tiene el canal `manychat` en `wp_conversaciones`.

### Llamada

```
POST https://brain.urpeailab.com/api/v1/manychat/send
```

**Headers:**
```
Content-Type: application/json
X-Send-Key: {SEND_API_KEY}
```

**Body:**
```json
{
  "contacto_id": 142890,
  "mensaje": "Gracias por tu mensaje. En breve te contactamos."
}
```

### Respuesta exitosa

```json
{
  "ok": true,
  "contacto_id": 142890,
  "subscriber_id": "mc_subscriber_xyz789",
  "guardado_en_db": true,
  "error": null
}
```

---

## Endpoint 3: Kapso Send (WhatsApp)

### Cuándo usarlo
Cuando el contacto se comunicó a través de **WhatsApp vía Kapso**. Estos contactos llegaron por el webhook `/api/v1/kapso/inbound`. Se reconocen porque su conversación tiene el canal `whatsapp` en `wp_conversaciones`.

### Cómo funciona (diferencia técnica)

A diferencia de GHL y ManyChat donde FastAPI llama directamente a la API de la plataforma, Kapso funciona mediante un **bridge interno**. FastAPI envía el mensaje al bridge en `KAPSO_BRIDGE_URL/api/v1/dispatch`, y el bridge se encarga de enviarlo a WhatsApp vía la API de Kapso.

Para que este endpoint funcione, la variable de entorno `KAPSO_BRIDGE_URL` debe estar configurada en el servidor.

### Llamada

```
POST https://brain.urpeailab.com/api/v1/kapso/send
```

**Headers:**
```
Content-Type: application/json
X-Send-Key: {SEND_API_KEY}
```

**Body:**
```json
{
  "contacto_id": 198450,
  "mensaje": "Hola, te confirmamos tu consulta para mañana."
}
```

### Respuesta exitosa

```json
{
  "ok": true,
  "contacto_id": 198450,
  "telefono": "5219991234567",
  "guardado_en_db": true,
  "error": null
}
```

> A diferencia de GHL/ManyChat, la respuesta devuelve `telefono` (el número de WhatsApp del contacto) en lugar de `contact_id` o `subscriber_id`, ya que ese es el identificador usado en WhatsApp.

---

## Cómo determinar qué endpoint usar

Si tienes el `contacto_id` pero no sabes qué plataforma usa el contacto, consulta la tabla `wp_conversaciones` en Supabase:

- Si el campo `canal` es `ghl_instagram` o `ghl_facebook` → usar **GHL send**
- Si el campo `canal` es `manychat` → usar **ManyChat send**
- Si el campo `canal` es `whatsapp` → usar **Kapso send**

---

## Manejo de respuestas y errores

### Respuesta siempre HTTP 200 con campo `ok`

El endpoint siempre devuelve HTTP `200` si la petición fue procesada. El resultado real está en el campo `ok`:

```json
{ "ok": true, ... }   // Mensaje enviado correctamente
{ "ok": false, "error": "GHL error 400: ..." }  // Envío fallido
```

### Errores HTTP (no 200)

| Código | Causa | Acción |
|---|---|---|
| `401` | `X-Send-Key` ausente o incorrecta | Verificar la clave con el administrador del sistema |
| `404` | `contacto_id` no existe en Supabase | Verificar que el ID sea correcto |
| `400` | Contacto sin `subscriber_id` o `telefono` | El contacto no ha enviado mensajes previos; no se puede contactar |
| `400` | Sin credenciales de la plataforma | Sin historial previo no hay credenciales almacenadas |
| `400` | Sin `phone_number_id` (Kapso) | El contacto no ha enviado mensajes vía WhatsApp |
| `200` `ok:false` | Bridge no disponible (Kapso) | `KAPSO_BRIDGE_URL` no configurado o bridge caído |

### Prerequisito importante

El sistema recupera las credenciales desde la **última conversación activa** del contacto. Esto significa que **el contacto debe haber enviado al menos un mensaje previamente** al sistema para que existan credenciales almacenadas. Sin historial, el endpoint devuelve error `400`.

---

## Ejemplos completos con curl

### GHL — Un mensaje simple
```bash
curl -X POST https://brain.urpeailab.com/api/v1/ghl/send \
  -H "Content-Type: application/json" \
  -H "X-Send-Key: mi_clave_secreta" \
  -d '{
    "contacto_id": 285318,
    "mensaje": "Hola! Te confirmamos tu cita para mañana a las 10am."
  }'
```

### GHL — Mensaje con dos burbujas
```bash
curl -X POST https://brain.urpeailab.com/api/v1/ghl/send \
  -H "Content-Type: application/json" \
  -H "X-Send-Key: mi_clave_secreta" \
  -d '{
    "contacto_id": 285318,
    "mensaje": "Primera burbuja con el saludo.\n\n---\n\nSegunda burbuja con el detalle."
  }'
```

### ManyChat — Facebook o Instagram
```bash
curl -X POST https://brain.urpeailab.com/api/v1/manychat/send \
  -H "Content-Type: application/json" \
  -H "X-Send-Key: mi_clave_secreta" \
  -d '{
    "contacto_id": 142890,
    "mensaje": "Tu pedido ha sido confirmado. Número de seguimiento: #123456"
  }'
```

### Kapso — WhatsApp
```bash
curl -X POST https://brain.urpeailab.com/api/v1/kapso/send \
  -H "Content-Type: application/json" \
  -H "X-Send-Key: mi_clave_secreta" \
  -d '{
    "contacto_id": 198450,
    "mensaje": "Hola Monica, tu cita está confirmada para el jueves a las 3pm."
  }'
```

---

## Variables de entorno necesarias en el servidor

Para que los endpoints funcionen, el servidor debe tener configuradas:

```env
# Autenticación de los endpoints /send
SEND_API_KEY=clave_secreta_para_envios

# Supabase (necesario para hacer lookups)
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=service_role_key

# GHL fallback (opcional — se usa solo si no hay api_key en la conversación)
GHL_API_KEY=Bearer xxxx

# Kapso bridge (requerido para el endpoint /api/v1/kapso/send)
KAPSO_BRIDGE_URL=http://localhost:3001
```

---

## Comportamiento interno del sistema (referencia técnica)

### `/api/v1/ghl/send`
1. Valida `X-Send-Key`
2. `SELECT * FROM wp_contactos WHERE id = contacto_id`
3. Obtiene `subscriber_id` (= GHL contact_id) y `empresa_id`
4. `SELECT * FROM wp_conversaciones WHERE contacto_id = ? AND canal LIKE 'ghl_%' ORDER BY created_at DESC`
5. Desde los mensajes de esa conversación, extrae `metadata.ghl_api_key`, `metadata.location_id` y `metadata.canal`
6. Llama a `POST https://services.leadconnectorhq.com/conversations/messages` con `type: "IG"/"FB"`, `contactId`, `locationId` y `message`
7. Registra en `wp_mensajes` con `remitente="agente"`, `status="enviado"`, `metadata.envio_manual=true`
8. Inserta en `agent_memory` con `role="assistant"`, `content="[Asesor humano]: mensaje"`, `model="asesor_humano"`

### `/api/v1/manychat/send`
1. Valida `X-Send-Key`
2. `SELECT * FROM wp_contactos WHERE id = contacto_id`
3. Obtiene `subscriber_id` y `empresa_id`
4. `SELECT * FROM wp_conversaciones WHERE contacto_id = ? AND canal = 'manychat' ORDER BY created_at DESC`
5. Extrae `metadata.manychat_api_key` y `metadata.canal`
6. Llama a la ManyChat Dynamic Message API con el subscriber_id y el Bearer token
7. Registra en `wp_mensajes` y en `agent_memory`

### `/api/v1/kapso/send`
1. Valida `X-Send-Key`
2. `SELECT * FROM wp_contactos WHERE id = contacto_id` → obtiene `telefono`
3. `SELECT * FROM wp_conversaciones WHERE contacto_id = ? AND canal = 'whatsapp' ORDER BY created_at DESC`
4. Extrae `metadata.phone_number_id` de los mensajes de la conversación
5. Llama a `POST {KAPSO_BRIDGE_URL}/api/v1/dispatch` con `recipient_phone`, `phone_number_id`, `reply_text` y `reply_type="text"`
6. El bridge reenvía el mensaje a WhatsApp vía la API de Kapso
7. Registra en `wp_mensajes` y en `agent_memory` con `memory_session_id = str(contacto_id)`

---

## Notas adicionales para el agente

- **No activa el agente IA:** Estos endpoints solo envían el mensaje indicado. No hay razonamiento, no hay contexto de conversación, no hay agentes de funnel ni contact_update.
- **Memoria del agente:** Los tres endpoints inyectan el mensaje en `agent_memory` como `[Asesor humano]: texto`. El agente verá este mensaje en su historial la próxima vez que el contacto escriba.
- **El mensaje se guarda con `envio_manual: true`** en el campo `metadata` de `wp_mensajes`. Esto permite distinguirlos en auditorías.
- **El canal es auto-detectado:** No hay que especificar si es Instagram, Facebook o WhatsApp. El sistema lo sabe por la conversación más reciente.
- **Burbujas solo en GHL:** El split por `---` solo funciona en el endpoint de GHL. ManyChat y Kapso envían el mensaje como texto único.
- **Los errores de la API externa se devuelven en `ok: false`:** Si GHL, ManyChat o el bridge de Kapso rechaza el mensaje, la respuesta HTTP es `200` pero el campo `ok` es `false` y `error` contiene el detalle.
- **Kapso depende del bridge:** Si `KAPSO_BRIDGE_URL` no está configurado o el bridge está caído, el endpoint devuelve `ok: false` con el mensaje "Bridge no disponible".
