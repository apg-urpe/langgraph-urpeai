# Nylas API Integration

Esta carpeta contiene los endpoints para la integración con Nylas (calendario y email).

## Endpoints

### `POST /api/nylas/notetaker`
Invita a Monica (Nylas Notetaker) a una reunión de video.

**Body (JSON):**
- `meeting_link` (requerido): URL de la reunión (Google Meet, Teams, Zoom)
- `team_humano_id` (requerido): ID del miembro del equipo
- `appointment_id` (opcional): ID de la cita en wp_citas
- `join_time` (opcional): Unix timestamp para programar la unión
- `name` (opcional): Nombre del notetaker (default: "Monica AI")

**Plataformas soportadas:**
- Google Meet (`meet.google.com`)
- Microsoft Teams (`teams.microsoft.com`)
- Zoom (`zoom.us`, `zoom.com`)

**Respuesta exitosa:**
```json
{
  "success": true,
  "notetaker_id": "...",
  "message": "Monica ha sido invitada a la reunión."
}
```

### `GET /api/nylas/notetaker`
Obtiene el estado de un notetaker.

**Query params:**
- `id` (requerido): ID del notetaker
- `grant_id` (requerido): Grant ID del usuario

### `GET /api/nylas/notetaker-media`
Obtiene las URLs de los media files de un Nylas Notetaker (video MP4, thumbnail, etc).

**Flujo con cache (Supabase Storage):**
1. Verifica si la transcripción tiene `video_url` (cacheado en Supabase Storage) → sirve signed URL directo
2. Si no hay cache, intenta grant-scoped (`/v3/grants/{id}/notetakers/{id}`) y luego standalone (`/v3/notetakers/{id}`)
3. Si Nylas devuelve `media_available`, sirve las URLs temporales Y auto-cachea el video en Supabase Storage (fire-and-forget)
4. Si el notetaker expiró (404 en ambos endpoints), devuelve `state: 'not_found'` con diagnóstico

**Query params:**
- `notetaker_id` (requerido): ID del notetaker
- `grant_id` (opcional): Grant ID del usuario (mejora lookup pero no es necesario si hay cache)

**Respuestas:**
- `{ state: 'available', source: 'cache'|'nylas', media: { recording, thumbnail } }` — Video disponible
- `{ state: 'processing' }` — El media aún se está procesando
- `{ state: 'not_found', diagnostic: {...} }` — Notetaker expirado (>14 días) o eliminado
- `{ state: 'expired' }` — Los archivos expiraron (Nylas retiene media máximo 14 días)

**Seguridad:** Verifica acceso empresarial con 3 estrategias en cascada (grant → cita → transcripcion.grant_id). Role 1 tiene acceso total.

### `POST /api/nylas/notetaker-webhook`
Webhook endpoint para recibir eventos `notetaker.media` de Nylas y auto-descargar grabaciones a Supabase Storage.

**Setup en Nylas Dashboard:**
- Webhook URL: `https://<tu-dominio>/api/nylas/notetaker-webhook`
- Events: `notetaker.media`

**Flujo:**
1. Nylas envía evento `notetaker.media` cuando el media está listo (`state: available`)
2. El webhook descarga la grabación MP4 del URL temporal
3. La sube al bucket `notetaker-recordings` en Supabase Storage
4. Actualiza la transcripción con `video_url` y `video_cached_at`

**Verificación:** Nylas envía un GET con `?challenge=<valor>` para verificar el endpoint.

**Importante:** Sin este webhook, los videos solo se cachean cuando un usuario los reproduce por primera vez (auto-cache en el proxy). El webhook es la forma recomendada para garantizar que TODOS los videos se almacenen antes de que Nylas los elimine (14 días).

**Requisitos:**
- Bucket `notetaker-recordings` en Supabase Storage (privado, 500MB max)
- Columnas `video_url` y `video_cached_at` en tabla `transcripciones` (ver `scripts/NOTETAKER_VIDEO_CACHE.sql`)
- Variable `NYLAS_WEBHOOK_SECRET` (opcional, para validación HMAC)

### `GET /api/nylas/events`
Obtiene eventos del calendario desde Nylas.

**Query params:**
- `grant_id` (requerido): ID del grant de Nylas del usuario
- `start`: Fecha de inicio (ISO string)
- `end`: Fecha de fin (ISO string)
- `calendar_id`: ID del calendario (default: 'primary')

### `GET /api/nylas/auth`
Inicia el flujo OAuth para conectar una cuenta de Google/Microsoft.

**Query params:**
- `team_member_id` (requerido): ID del miembro del equipo en `wp_team_humano`
- `provider`: 'google' | 'microsoft' (default: 'google')
- `redirect_after`: URL a la que redirigir después del callback

**Flujo:**
1. Usuario hace clic en "Conectar con Google/Microsoft"
2. Se redirige a `/api/nylas/auth` con los parámetros
3. Nylas redirige al proveedor (Google/Microsoft) para autorización
4. Después de autorizar, el proveedor redirige a Nylas
5. Nylas redirige a `/api/nylas/callback` con el código
6. El callback intercambia el código por tokens y guarda el `grant_id`

### `GET /api/nylas/callback`
Maneja el callback OAuth de Nylas. **No llamar directamente.**

Recibe el código de autorización, lo intercambia por tokens, y actualiza `wp_team_humano` con el nuevo `grant_id`.

## Variables de Entorno

```env
NYLAS_API_KEY=your_nylas_api_key           # API Key de Nylas (para llamadas server-side)
NYLAS_API_URI=https://api.us.nylas.com     # URI de la API de Nylas
NYLAS_CLIENT_ID=your_nylas_client_id       # Client ID para OAuth
```

## Configuración en Nylas Dashboard

1. Crear una aplicación en [Nylas Dashboard](https://dashboard.nylas.com)
2. Configurar los Callback URIs:
   - Desarrollo: `http://localhost:3000/api/nylas/callback`
   - Producción: `https://tu-dominio.com/api/nylas/callback`
3. Habilitar los conectores necesarios (Google, Microsoft)
4. Copiar el Client ID y API Key a las variables de entorno

## Uso en Componentes

```tsx
import { NylasConnectPrompt } from '@/components/admin/NylasConnectPrompt';
import { useNylasConnect } from '@/hooks/useNylasConnect';

// Opción 1: Usar el componente completo
<NylasConnectPrompt
  teamMemberId={userContext.id}
  title="Conecta tu cuenta"
  onSuccess={() => window.location.reload()}
/>

// Opción 2: Usar el hook para UI personalizada
const { connectGoogle, connectMicrosoft, isConnecting, error } = useNylasConnect({
  teamMemberId: userContext.id,
  redirectAfter: '/admin',
});
```

## Base de Datos

El `grant_id` se almacena en la tabla `wp_team_humano`:

```sql
-- Columna grant_id en wp_team_humano
grant_id text null
```

## Manejo de Errores

### Error 404 en llamadas a Nylas
Indica que el `grant_id` es inválido o expiró. El usuario debe reconectar su cuenta.

### Error 401
La API Key de Nylas es inválida. Verificar `NYLAS_API_KEY`.

## Scopes Solicitados

Para Google:
- `https://www.googleapis.com/auth/calendar` - Acceso al calendario
- `https://www.googleapis.com/auth/gmail.readonly` - Leer emails
- `https://www.googleapis.com/auth/gmail.modify` - Marcar como leído/no leído
