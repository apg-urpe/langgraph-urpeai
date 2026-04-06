# Módulo de Gestión de Equipo

## Descripción
Sistema completo para gestionar miembros del equipo con soporte para invitaciones por link.

## Arquitectura

### Componentes
```
components/admin/team/
├── TeamView.tsx           # Vista principal con lista de miembros
├── TeamMemberModal.tsx    # Modal para crear/editar miembros completos
├── InviteTeamMemberModal.tsx  # Modal simplificado para invitaciones
└── README.md              # Esta documentación
```

### Store
- **`store/teamStore.ts`**: Estado global con acciones CRUD para miembros e invitaciones

### Tipos
- **`types/team.ts`**: Interfaces para miembros, invitaciones y payloads

### Base de Datos
- **`scripts/TEAM_INVITATIONS_SCHEMA.sql`**: Schema para tabla de invitaciones

---

## Sistema de Invitaciones

### Flujo
```
1. Líder abre modal "Invitar"
2. Ingresa: email + rol + role_id
3. Sistema genera token UUID único
4. Se muestra link copiable: /invite/{token}
5. Líder comparte link con el nuevo miembro
6. Nuevo miembro accede al link
7. Completa su información (nombre, apellido, teléfono)
8. Se crea automáticamente en wp_team_humano
9. Invitación se marca como "accepted"
```

### Tabla: `wp_team_invitations`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | BIGSERIAL | PK |
| token | UUID | Token único para el link |
| email | VARCHAR(255) | Email del invitado |
| rol | VARCHAR(50) | Rol del sistema (asesor, supervisor, admin) |
| role_id | INTEGER | ID del rol de permisos |
| empresa_id | INTEGER | FK a wp_empresa_perfil |
| invited_by | INTEGER | FK a wp_team_humano (quien invitó) |
| status | VARCHAR(20) | pending, accepted, expired, cancelled |
| expires_at | TIMESTAMPTZ | Fecha de expiración (default: 7 días) |
| accepted_at | TIMESTAMPTZ | Cuando se aceptó |
| team_member_id | INTEGER | FK al miembro creado |

### Estados de Invitación
- **pending**: Invitación activa esperando ser aceptada
- **accepted**: Ya fue aceptada y el miembro fue creado
- **expired**: Pasaron más de 7 días sin aceptar
- **cancelled**: El líder canceló la invitación

### Función RPC: `accept_team_invitation`
Función atómica que:
1. Valida que la invitación existe y está pendiente
2. Verifica que no esté expirada
3. Verifica que no exista ya un miembro con ese email
4. Crea el nuevo miembro en `wp_team_humano`
5. Actualiza la invitación a "accepted"

---

## Componentes

### TeamView.tsx
Vista principal que muestra:
- Lista de miembros del equipo
- Botón "Invitar" (abre InviteTeamMemberModal)
- Botón "Nuevo Miembro" (abre TeamMemberModal)
- Filtros por rol y búsqueda

### InviteTeamMemberModal.tsx
Modal simplificado con solo 3 campos:
- **Email**: Email del nuevo miembro
- **Rol**: asesor, supervisor, admin
- **Role ID**: Nivel de permisos

Al enviar, genera el link de invitación que el líder puede copiar y compartir.

### TeamMemberModal.tsx
Modal completo para crear miembros directamente con todos los campos:
- Información personal (nombre, apellido, email, teléfono)
- Rol y configuración
- Configuración de citas

---

## Página de Invitación

### Ruta: `/invite/[token]`
Página pública (sin auth requerido) donde el invitado:
1. Ve información de la empresa y rol asignado
2. Completa su nombre y apellido
3. Opcionalmente añade su teléfono
4. Se une al equipo

### Estados de la página
- **loading**: Verificando invitación
- **valid**: Mostrando formulario
- **expired**: Invitación expirada
- **used**: Ya fue aceptada
- **not_found**: No existe o fue cancelada
- **success**: Miembro creado exitosamente

---

## Store Actions

### Invitaciones
```typescript
// Obtener invitaciones de una empresa
fetchInvitations(empresaId: number): Promise<void>

// Crear nueva invitación
createInvitation(payload: CreateInvitationPayload): Promise<{
  invitation: TeamInvitation | null;
  inviteUrl: string | null;
}>

// Cancelar invitación
cancelInvitation(invitationId: number): Promise<boolean>

// Reenviar (extender expiración)
resendInvitation(invitationId: number): Promise<boolean>
```

### Funciones Standalone (sin auth)
```typescript
// Obtener invitación por token
getInvitationByToken(token: string): Promise<TeamInvitation | null>

// Aceptar invitación y crear miembro
acceptInvitation(payload: AcceptInvitationPayload): Promise<AcceptInvitationResult>
```

---

## Permisos
- **Roles 1, 2, 3**: Pueden invitar y gestionar equipo
- **Otros roles**: Solo pueden ver miembros

---

## Migración SQL

Ejecutar en Supabase SQL Editor:
```sql
-- Ver archivo: scripts/TEAM_INVITATIONS_SCHEMA.sql
```

Este script crea:
- Tabla `wp_team_invitations`
- Índices optimizados
- Función `accept_team_invitation`
- Políticas RLS

---

## Helpers

```typescript
// Generar URL de invitación
generateInviteUrl(token: string): string

// Verificar si está expirada
isInvitationExpired(expiresAt: string): boolean

// Formatear tiempo restante
getInvitationTimeRemaining(expiresAt: string): string
// Retorna: "5d 3h", "2h", "45m", "Expirada"

// Validar formato de token UUID
isValidInvitationToken(token: string): boolean

// Sanitizar y validar email
sanitizeEmail(email: string): string | null
```

---

## Sistema de Robustez (v2.0)

### Validación con Zod
Los payloads de invitación se validan en runtime con Zod schemas:

```typescript
// Crear invitación
validateCreateInvitation(payload): { success, data } | { success: false, error }

// Aceptar invitación  
validateAcceptInvitation(payload): { success, data } | { success: false, error }
```

**Schemas disponibles:**
- `EmailSchema`: Validación de email con sanitización
- `InvitationTokenSchema`: Validación de UUID v4
- `TeamRolSchema`: Enum de roles válidos
- `CreateInvitationSchema`: Payload completo de creación
- `AcceptInvitationSchema`: Payload completo de aceptación

### Retry Logic
La función `acceptInvitation` incluye:
- **2 reintentos automáticos** con backoff exponencial
- **Errores no-reintentables** identificados (duplicados, FK violations)
- **Mensajes de error amigables** mapeados desde errores técnicos

### UX Mejorada en `/invite/[token]`
- **Procesamiento de Magic Link tokens**: Detecta y establece sesión desde hash fragment
- **Indicador de estado de autenticación**: Muestra si el usuario está autenticado
- **Validación de token** antes de consultar DB
- **Detección de conexión** online/offline en tiempo real
- **Countdown actualizado** cada minuto
- **Validación de formulario** en tiempo real con feedback visual
- **Estado de error recuperable** con botón "Reintentar"
- **Estados diferenciados**: not_found vs cancelled vs expired vs authenticating
- **Bloqueo de submit** si pierde conexión mientras llena formulario

### API de Vinculación Post-Login
**Endpoint**: `POST /api/invite/link-auth`

Vincula auth_uid cuando el auto-linking directo falla:
```typescript
// Request
{ email: string, auth_uid: string }

// Response
{ success: true, member_id: number, empresa_id: number }
```

**Casos de uso**:
- Usuario aceptó invitación sin estar autenticado
- Auto-linking por email falló por RLS
- Usuario creado manualmente sin auth_uid

### Logging Estructurado
Todos los eventos críticos se registran con contexto:
```typescript
logger.debug('[TeamStore] Fetching invitation by token:', { token: 'abc123...' });
logger.warn('[TeamStore] Invalid token format:', { token: 'invalid...' });
logger.error('[TeamStore] Database error:', { code, message, hint });
logger.info('[TeamStore] Invitation accepted:', { member_id, empresa_id });
```

---

## Flujo de Vinculación auth_uid (v3.0)

### Problema Resuelto
El Magic Link redirige con tokens en el hash fragment, pero la página no los procesaba correctamente, causando que el `auth_uid` no se vinculara.

### Solución Implementada

1. **Procesamiento de tokens del hash fragment** en `/invite/[token]/page.tsx`:
   - Detecta `#access_token=xxx&refresh_token=xxx`
   - Establece sesión con `supabase.auth.setSession()`
   - Limpia el hash del URL por seguridad

2. **Estado de autenticación visible**:
   - Indicador verde: "Sesión verificada - Conectado como email@..."
   - Indicador azul: "Acceso sin sesión - Usa el Magic Link..."

3. **Fallback en `fetchUserContext`**:
   - Intenta auto-linking directo primero
   - Si falla, usa API `/api/invite/link-auth` con service_role

### Flujo Completo
```
1. Admin crea invitación → RPC crea miembro inactivo + invitación
2. API envía Magic Link al email
3. Usuario hace clic → /auth/callback procesa tokens
4. Redirect a /invite/{token}#access_token=xxx
5. Página procesa hash → establece sesión
6. Usuario completa datos → acceptInvitation con auth_uid
7. Miembro se activa con auth_uid vinculado
8. Login posterior → encuentra por auth_uid ✓
```
