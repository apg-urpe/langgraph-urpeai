# Manual Send Endpoints — AI Agent Context

> **Propósito de este documento:** Guía de configuración y uso de los endpoints de envío manual del sistema URPE AI Lab. Está escrito para que un agente de IA pueda entender cómo funcionan, cuándo usarlos y cómo estructurar las llamadas correctamente.

---

## Resumen del sistema

El sistema URPE AI Lab expone una API en `https://brain.urpeailab.com` que permite enviar mensajes directamente a contactos en Instagram o Facebook **sin activar el agente de IA conversacional**. Esto es útil para:

- Enviar notificaciones automáticas desde flujos externos (n8n, Zapier, etc.)
- Permitir a un agente de soporte humano enviar mensajes programáticamente
- Confirmar citas, enviar recordatorios, o responder consultas simples sin IA

Existen **dos endpoints** dependiendo de la plataforma de mensajería del contacto:

| Canal | Endpoint |
|---|---|
| GHL (Instagram o Facebook vía Go High Level) | `POST /api/v1/ghl/send` |
| ManyChat (Instagram o Facebook vía ManyChat) | `POST /api/v1/manychat/send` |

---

## Concepto clave: `contacto_id`

El único identificador que necesitas conocer es el **`contacto_id`** — un número entero que identifica al contacto en la tabla `wp_contactos` de Supabase.

El sistema se encarga de:
1. Buscar el contacto en la base de datos
2. Recuperar su `subscriber_id` (identificador en GHL o ManyChat)
3. Recuperar el `api_key` de la plataforma desde la última conversación
4. Detectar si el canal es Instagram o Facebook
5. Enviar el mensaje
6. Guardar el mensaje en la base de datos

**No necesitas saber el subscriber_id, el api_key ni el canal** — todo se resuelve automáticamente.

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

## Cómo determinar qué endpoint usar

Si tienes el `contacto_id` pero no sabes qué plataforma usa el contacto, puedes consultar la tabla `wp_conversaciones` en Supabase:

- Si el campo `canal` es `ghl_instagram` o `ghl_facebook` → usar **GHL send**
- Si el campo `canal` es `manychat` → usar **ManyChat send**

Alternativamente, el campo `subscriber_id` en `wp_contactos` es el mismo identificador para ambas plataformas — lo que cambia es a qué API se envía.

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
| `400` | Contacto sin `subscriber_id` | El contacto no ha enviado mensajes previos; no se puede contactar |
| `400` | Sin api_key de la plataforma | Igual que el anterior — sin historial previo no hay credenciales |

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
```

---

## Comportamiento interno del sistema (referencia técnica)

Cuando se llama a `/api/v1/ghl/send`:

1. Valida `X-Send-Key`
2. Hace `SELECT * FROM wp_contactos WHERE id = contacto_id`
3. Obtiene `subscriber_id` (= GHL contact_id) y `empresa_id`
4. Hace `SELECT * FROM wp_conversaciones WHERE contacto_id = ? AND canal LIKE 'ghl_%' ORDER BY created_at DESC LIMIT 1`
5. Desde los mensajes de esa conversación, extrae `metadata.ghl_api_key`, `metadata.location_id` y `metadata.canal`
6. Llama a `POST https://services.leadconnectorhq.com/conversations/messages` con `type: "IG"` o `type: "FB"`, `contactId`, `locationId` y `message`
7. Registra en `wp_mensajes` con `remitente="agente"`, `status="enviado"`, `metadata.envio_manual=true`

El mismo flujo aplica para `/api/v1/manychat/send`, pero llamando a `POST https://api.manychat.com/fb/sending/sendContent` con el `subscriber_id` y el token Bearer de ManyChat.

---

## Notas adicionales para el agente

- **No activa el agente IA:** Estos endpoints solo envían el mensaje indicado. No hay razonamiento, no hay contexto de conversación, no hay agentes de funnel ni contact_update.
- **El mensaje se guarda con `envio_manual: true`** en el campo `metadata` de `wp_mensajes`. Esto permite distinguirlos en auditorías.
- **El canal es auto-detectado:** No hay que especificar si es Instagram o Facebook. El sistema lo sabe por la conversación más reciente.
- **Burbujas solo en GHL:** El split por `---` solo funciona en el endpoint de GHL. ManyChat envía el mensaje como texto único.
- **Los errores de la API externa se devuelven en `ok: false`:** Si GHL o ManyChat rechaza el mensaje, la respuesta HTTP es `200` pero el campo `ok` es `false` y `error` contiene el detalle.
