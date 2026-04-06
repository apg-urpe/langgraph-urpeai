---
title: "Sistema de Invitaciones con Magic Link"
---

## Resumen

El sistema de invitaciones ahora envía un **Magic Link** de Supabase al email del invitado. Esto permite que el usuario acceda directamente a la aplicación **sin necesidad de crear contraseña**.

## Flujo Completo

```
1. Admin crea invitación en TeamView
   ↓
2. Sistema crea:
   - Registro en wp_team_invitations
   - Registro en wp_team_humano (is_active=FALSE)
   - Envía Magic Link al email via Supabase Auth
   ↓
3. Usuario recibe email con Magic Link
   ↓
4. Click en Magic Link → /auth/callback?next=/invite/{token}
   ↓
5. Callback autentica automáticamente al usuario
   ↓
6. Redirect a /invite/{token} (usuario YA autenticado)
   ↓
7. Usuario completa nombre/apellido/teléfono
   ↓
8. Sistema activa al usuario (is_active=TRUE, vincula auth_uid)
   ↓
9. ✅ Acceso completo a la aplicación
```

## Archivos del Sistema

| Archivo | Propósito |
|---------|-----------|
| `app/api/invite/send-magic-link/route.ts` | Endpoint para enviar Magic Link |
| `store/teamStore.ts` | `createInvitation` llama al endpoint |
| `app/auth/callback/route.ts` | Maneja callback de Magic Link |
| `app/invite/[token]/page.tsx` | Página de aceptación de invitación |

## Configuración Requerida en Supabase

### 1. Variables de Entorno

Asegúrate de tener estas variables en tu `.env.local`:

```ini
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key  # Requerido para enviar magic links
NEXT_PUBLIC_APP_URL=https://tu-dominio.com     # Para construir URLs de redirect
```

### 2. Configurar URLs de Redirect

En **Supabase Dashboard → Authentication → URL Configuration**:

1. **Site URL**: `https://tu-dominio.com`
2. **Redirect URLs** (añadir):
   - `https://tu-dominio.com/auth/callback`
   - `https://tu-dominio.com/auth/callback?next=/invite/*`
   - `http://localhost:3000/auth/callback` (para desarrollo)

### 3. Configurar Email Templates (Opcional)

En **Supabase Dashboard → Authentication → Email Templates → Magic Link**:

El template por defecto funciona, pero puedes personalizarlo:

```html
<h2>Invitación a Urpe AI Lab</h2>
<p>Has sido invitado a unirte al equipo.</p>
<p>Haz clic en el siguiente enlace para acceder:</p>
<p><a href="{{ .ConfirmationURL }}">Acceder a mi cuenta</a></p>
<p>Este enlace expira en 1 hora.</p>
```

### 4. Habilitar Magic Links

En **Supabase Dashboard → Authentication → Providers → Email**:

- ✅ Enable Email provider
- ✅ Confirm email (puede estar deshabilitado para invitaciones)
- Magic Link enabled by default

## Comportamiento del Sistema

### Invitación Exitosa

1. Se muestra mensaje: "¡Invitación enviada! Se envió un Magic Link a email@ejemplo.com"
2. El link de respaldo queda disponible si el email no llega
3. El usuario recibe email con botón de acceso directo

### Si el Magic Link Falla

- La invitación se crea de todas formas
- El link de respaldo (`/invite/{token}`) sigue funcionando
- El usuario puede autenticarse manualmente

### Expiración

- **Magic Link**: 1 hora (configurable en Supabase)
- **Invitación**: 7 días (configurable en SQL)

## Seguridad

- El Magic Link es de un solo uso
- El token de invitación es UUID v4
- El `auth_uid` se vincula automáticamente al aceptar
- Las funciones SQL usan `SECURITY DEFINER`

## Troubleshooting

### "Invitación no encontrada"

Posibles causas:
1. Token inválido o expirado
2. La función RPC `create_team_invitation_v2` no está instalada
3. Error al crear el registro en `wp_team_humano`

**Solución**: Ejecutar el script SQL `scripts/TEAM_INVITATIONS_V2_SCHEMA.sql`

### Magic Link no llega

1. Verificar que `SUPABASE_SERVICE_ROLE_KEY` esté configurado
2. Revisar logs en Supabase Dashboard → Logs → Auth
3. Verificar configuración de email en Supabase

### Usuario no puede acceder después del Magic Link

1. Verificar que el callback está funcionando
2. Revisar que las URLs de redirect estén configuradas
3. Verificar que el hash de sesión se está procesando correctamente

## Logs de Debug

El sistema genera logs en:

```
[Magic Link] Sending to: email@ejemplo.com
[Magic Link] Sent successfully to: email@ejemplo.com
[TeamStore] Invitation V2 created: { email, inviteUrl, memberId }
[TeamStore] Magic Link sent to: email@ejemplo.com
```
