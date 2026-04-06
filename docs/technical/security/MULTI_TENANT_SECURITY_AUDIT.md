# Auditoría de Seguridad Multi-Tenant

**Fecha**: 30 Diciembre 2024  
**Estado**: ✅ Corregido

## Resumen Ejecutivo

Se identificó y corrigió una vulnerabilidad de seguridad donde usuarios podían potencialmente acceder a datos de otras empresas. Este documento detalla los hallazgos y las correcciones implementadas.

---

## Conceptos Clave

| Campo | Descripción | Comportamiento |
|-------|-------------|----------------|
| `empresa_id` | Empresa donde trabaja el usuario (fijo) | Asignado al crear usuario, no cambia |
| `enterprise_id` | Empresa que se está visualizando | Solo `role_id=1` puede cambiarla |
| `role_id` | Rol del sistema | `role_id=1` = Dev Team (acceso especial) |

### Reglas de Negocio

1. **Si `enterprise_id` es NULL** → Se usa `empresa_id` como fallback
2. **Solo `role_id=1`** (Dev Team de empresa 13) puede cambiar de empresa para debug
3. **Todos los demás usuarios** solo pueden ver datos de su `empresa_id`

---

## Hallazgos y Correcciones

### 1. ✅ API Chat - Fallback inseguro a empresa 13

**Problema**: El código original hacía fallback a empresa 13 sin validación:
```typescript
// ❌ INSEGURO - Antes
const resolvedEnterpriseId = enterpriseId || enterpriseContext?.enterpriseId || 13;
```

**Corrección**: Ahora se valida contra la base de datos:
```typescript
// ✅ SEGURO - Después
const userAuthorizedEnterpriseId = teamMember.enterprise_id || teamMember.empresa_id;
// Solo role_id=1 puede acceder a otras empresas
if (userActualRoleId !== DEV_TEAM_ROLE_ID && requestedEnterpriseId !== userAuthorizedEnterpriseId) {
  return Response.json({ error: 'Acceso denegado' }, { status: 403 });
}
```

**Archivos modificados**:
- `app/api/chat/route.ts`
- `app/api/chat/route-v2.ts`

---

### 2. ✅ ContactStore - Cambio de empresa sin validación

**Problema**: `setSelectedEnterprise()` no bloqueaba cambios no autorizados.

**Corrección**: Agregada validación de seguridad:
```typescript
// ✅ SEGURO - Solo role_id=1 puede cambiar empresa
if (!isDevTeam && enterpriseId !== homeEnterpriseId && enterpriseId !== userContext?.empresaId) {
  logger.error('[ContactStore] ⛔ BLOCKED: Unauthorized enterprise switch attempt');
  return; // Bloquea silenciosamente
}
```

**Archivo modificado**: `store/contactStore.ts`

---

### 3. ✅ UserContext - Forzar empresa_id para no dev team

**Problema**: Usuarios con `enterprise_id` diferente de `empresa_id` veían "Sin empresa asignada" porque:
- `selectedEnterpriseId` era diferente de `empresa_id`
- `availableEnterprises` solo contenía su `empresa_id`
- No había match → UI mostraba error

**Corrección**: Para usuarios que NO son dev team, SIEMPRE usar `empresa_id`:
```typescript
const resolvedEnterpriseId = isDevTeam 
  ? (teamMember.enterprise_id || teamMember.empresa_id)
  : teamMember.empresa_id; // FORCE empresa_id for non-dev team
```

**Archivo modificado**: `store/contactStore.ts`

---

### 4. ✅ TeamMemberModal - Asignar enterprise_id al crear

**Problema**: Al crear nuevos miembros, no se asignaba `enterprise_id`.

**Corrección**: Ahora se asigna `enterprise_id = empresa_id` al crear:
```typescript
await createMember({
  ...formData,
  empresa_id: selectedEnterpriseId,
  enterprise_id: selectedEnterpriseId // Must always equal empresa_id
});
```

**Archivos modificados**: 
- `types/team.ts` - Agregado `enterprise_id` a `CreateTeamMemberPayload`
- `components/admin/team/TeamMemberModal.tsx`

---

## Capas de Protección

### Capa 1: Frontend (UI)
- `canSwitchEnterprise = userContext?.roleId === 1` - Solo dev team ve el selector
- Validación en `setSelectedEnterprise()` bloquea cambios no autorizados

### Capa 2: API Backend
- Validación en `/api/chat/route.ts` y `/api/chat/route-v2.ts`
- Consulta la DB para verificar `empresa_id` y `role_id` del usuario
- Retorna 403 si el usuario intenta acceder a otra empresa

### Capa 3: Data Access Layer (DAL)
- `lib/dal/contacts.ts` - Todos los queries filtran por `ctx.enterpriseId`
- El `enterpriseId` viene del `ToolContext` validado en la API

### Capa 4: Supabase RLS
- Políticas RLS en tablas críticas (`wp_crm_servicios`, `wp_crm_pagos`)
- Filtran automáticamente por `empresa_id` del usuario autenticado

---

## Stores Auditados

| Store | Filtrado | Estado |
|-------|----------|--------|
| `contactStore.ts` | `selectedEnterpriseId` validado | ✅ Seguro |
| `tareasStore.ts` | Usa `selectedEnterpriseId` de contactStore | ✅ Seguro |
| `proyectosStore.ts` | Usa `selectedEnterpriseId` de contactStore | ✅ Seguro |
| `teamStore.ts` | Recibe `empresaId` como parámetro | ✅ Seguro |
| `financeStore.ts` | Recibe `empresaId` como parámetro | ✅ Seguro |
| `marketingStore.ts` | Usa `enterpriseId` de contactStore | ✅ Seguro |
| `notificationsStore.ts` | Filtra por `empresa_id` del team member | ✅ Seguro |

---

## APIs Auditadas

| API | Protección | Estado |
|-----|------------|--------|
| `/api/chat` | Validación de enterpriseId + role_id | ✅ Seguro |
| `/api/chat (v2)` | Validación de enterpriseId + role_id | ✅ Seguro |
| `/api/emails` | Usa `grant_id` específico por usuario | ✅ Seguro |
| `/api/nylas/events` | Usa `grant_id` específico por usuario | ✅ Seguro |
| `/api/nylas/auth` | Usa `team_member_id` específico | ✅ Seguro |
| `/api/deep-research` | Recibe `empresaId` del contexto validado | ✅ Seguro |
| `/api/monica` | Usa contexto de contacto (ya filtrado) | ✅ Seguro |

---

## Flujo de Validación Seguro

```
┌─────────────────────────────────────────────────────────────┐
│ Usuario envía request                                       │
└─────────────────────────┬───────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. API extrae userId del request                            │
└─────────────────────────┬───────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Consulta DB: empresa_id, enterprise_id, role_id          │
│    SELECT empresa_id, enterprise_id, role_id                │
│    FROM wp_team_humano WHERE id = userId                    │
└─────────────────────────┬───────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Calcula userAuthorizedEnterpriseId                       │
│    = enterprise_id || empresa_id                            │
└─────────────────────────┬───────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Valida acceso                                            │
│    - role_id = 1 → Acceso a cualquier empresa               │
│    - role_id ≠ 1 → Solo acceso a userAuthorizedEnterpriseId │
└─────────────────────────┬───────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Ejecuta operación con resolvedEnterpriseId               │
└─────────────────────────────────────────────────────────────┘
```

---

## Recomendaciones Adicionales

### Pendientes de Implementar

1. **RLS en más tablas**: Verificar que todas las tablas tengan políticas RLS
2. **Audit logging**: Registrar intentos de acceso no autorizado
3. **Rate limiting**: Limitar intentos de acceso fallidos

### Scripts SQL Recomendados

```sql
-- Asegurar que enterprise_id = empresa_id si es NULL
UPDATE wp_team_humano 
SET enterprise_id = empresa_id 
WHERE enterprise_id IS NULL;

-- Política RLS genérica para tablas con empresa_id
CREATE POLICY "Restrict by empresa_id" ON [table_name]
FOR ALL
USING (empresa_id = (
  SELECT COALESCE(enterprise_id, empresa_id) 
  FROM wp_team_humano 
  WHERE auth_uid = auth.uid() 
  LIMIT 1
));
```

---

## Constantes de Seguridad

```typescript
// Definidas en: store/contactStore.ts y app/api/chat/route.ts
const DEV_TEAM_ROLE_ID = 1;        // Rol del equipo de desarrollo
const URPE_LAB_ENTERPRISE_ID = 13; // Empresa base del dev team
```

---

## Changelog

| Fecha | Cambio | Archivos |
|-------|--------|----------|
| 2024-12-30 | Validación de enterpriseId en APIs | `route.ts`, `route-v2.ts` |
| 2024-12-30 | Bloqueo de cambio de empresa no autorizado | `contactStore.ts` |
| 2024-12-30 | Fallback enterprise_id → empresa_id | `contactStore.ts` |
