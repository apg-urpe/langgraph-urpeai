# Sistema de Invitaciones V2

## Problema Original

El sistema de invitaciones anterior tenía un problema crítico de timing:

```
ANTES (Problemático):
1. Admin crea invitación → Solo wp_team_invitations
2. Usuario se autentica con Supabase Auth → ❌ No existe en wp_team_humano
3. fetchUserContext busca por email → ❌ No encuentra registro
4. Usuario ve "ACCESS_DENIED:NOT_REGISTERED"
5. Usuario acepta invitación → Crear wp_team_humano (MUY TARDE)
```

**El problema**: El registro en `wp_team_humano` se creaba al ACEPTAR la invitación, pero el usuario podía autenticarse ANTES de aceptar, causando que el auto-linking por email fallara.

---

## Solución V2

El nuevo sistema crea el registro en `wp_team_humano` **al momento de crear la invitación**, con `is_active = FALSE`:

```
DESPUÉS (V2 Robusto):
1. Admin crea invitación → wp_team_invitations + wp_team_humano (is_active=FALSE)
2. Usuario se autentica → ✅ Existe en wp_team_humano → Auto-link funciona
3. Usuario visita link → Completa nombre/apellido
4. Acepta invitación → UPDATE wp_team_humano (is_active=TRUE)
```

### Beneficios

| Aspecto | V1 | V2 |
|---------|----|----|
| Registro en wp_team_humano | Al aceptar | Al crear invitación |
| Auto-linking por email | Puede fallar | Siempre funciona |
| Race conditions | Posibles | Eliminadas |
| Orden de acciones | Importa | No importa |

---

## Funciones RPC

### `create_team_invitation_v2`

Crea la invitación Y el miembro inactivo en una sola transacción.

**Parámetros:**
- `p_email` - Email del invitado
- `p_rol` - Rol (asesor, supervisor, admin)
- `p_role_id` - ID del nivel de permisos
- `p_empresa_id` - Empresa que invita
- `p_invited_by` - ID del usuario que invita

**Retorna:**
- `success` - Boolean
- `message` - Mensaje descriptivo
- `invitation_id` - ID de la invitación
- `invitation_token` - Token UUID para el link
- `team_member_id` - ID del miembro creado (inactivo)

**Comportamientos:**
1. Si ya existe miembro ACTIVO → Error
2. Si ya existe invitación pendiente → Retorna la existente
3. Si existe miembro INACTIVO → Lo reutiliza
4. Si es nuevo → Crea miembro con `is_active=FALSE`

### `accept_team_invitation_v2`

Activa un miembro existente (UPDATE, no INSERT).

**Parámetros:**
- `p_token` - Token de la invitación
- `p_nombre` - Nombre del usuario
- `p_apellido` - Apellido del usuario
- `p_telefono` - Teléfono (opcional)
- `p_auth_uid` - UUID de Supabase Auth (opcional)

**Retorna:**
- `success` - Boolean
- `message` - Mensaje descriptivo
- `member_id` - ID del miembro activado
- `empresa_id` - ID de la empresa

---

## Archivos Modificados

### SQL
- `scripts/TEAM_INVITATIONS_V2_SCHEMA.sql` - Nuevas funciones RPC

### TypeScript
- `store/teamStore.ts`:
  - `createInvitation` → Usa `create_team_invitation_v2`
  - `acceptInvitation` → Usa `accept_team_invitation_v2`

### React
- `app/invite/[token]/page.tsx` → Textos actualizados

---

## Migración

Ejecutar en Supabase SQL Editor:

```sql
-- Ejecutar el script completo
\i scripts/TEAM_INVITATIONS_V2_SCHEMA.sql
```

O copiar y pegar el contenido del archivo directamente.

---

## Estado del Miembro

| Campo | Invitación Creada | Invitación Aceptada |
|-------|-------------------|---------------------|
| `is_active` | `FALSE` | `TRUE` |
| `nombre` | `'(Pendiente)'` | Nombre real |
| `apellido` | `''` | Apellido real |
| `email` | Email de invitación | (sin cambio) |
| `auth_uid` | `NULL` | UUID del auth |

---

## Flujo del Usuario

1. **Admin** crea invitación desde TeamView
2. **Sistema** crea:
   - Registro en `wp_team_invitations` (token, status='pending')
   - Registro en `wp_team_humano` (email, is_active=FALSE)
3. **Admin** copia link y lo envía al invitado
4. **Usuario** puede:
   - Autenticarse primero → Auto-linking funciona
   - Visitar el link primero → También funciona
5. **Usuario** visita `/invite/{token}`:
   - Ve empresa, rol asignado
   - Completa nombre, apellido, teléfono
   - Click "Unirme al equipo"
6. **Sistema** actualiza `wp_team_humano`:
   - `is_active = TRUE`
   - Datos del usuario
   - `auth_uid` si está logueado
7. **Usuario** es redirigido al login

---

## Consideraciones

### Miembros Huérfanos
Si un usuario nunca acepta la invitación, queda un registro con `is_active=FALSE`. Esto es intencional:
- No afecta el funcionamiento
- Permite reenviar invitaciones sin crear duplicados
- Se puede limpiar periódicamente si se desea

### Invitaciones Expiradas
La función `create_team_invitation_v2` cancela automáticamente invitaciones previas expiradas antes de crear una nueva.

### Seguridad
- Las funciones usan `SECURITY DEFINER` para operar con permisos elevados
- El token de invitación es UUID v4 (difícil de adivinar)
- Las invitaciones expiran en 7 días por defecto
