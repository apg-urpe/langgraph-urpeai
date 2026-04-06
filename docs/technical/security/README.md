# 🛡️ Seguridad

> Multi-tenant, RLS, autenticación y autorización

---

## 🎯 Principios

La seguridad de Urpe AI Lab se basa en:
- **Defense in depth**: Múltiples capas de protección
- **Least privilege**: Mínimos permisos necesarios
- **Multi-tenancy**: Aislamiento completo por empresa
- **Audit trail**: Registro de todas las acciones

---

## 🏗️ Arquitectura de Seguridad

```
┌─────────────────────────────────────────────────────────────────┐
│                    CAPA 1: AUTENTICACIÓN                         │
│                    Supabase Auth + PKCE                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    CAPA 2: AUTORIZACIÓN                          │
│                    Sistema de Roles                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    CAPA 3: RLS                                   │
│                    Row Level Security                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    CAPA 4: APLICACIÓN                            │
│                    Filtros en Stores                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔐 Autenticación

### Flujo PKCE
```typescript
// 1. Login
const { data, error } = await supabase.auth.signInWithPassword({
  email, password
});

// 2. Verificar sesión
const { data: { session } } = await supabase.auth.getSession();

// 3. Logout
await supabase.auth.signOut();
```

### Tokens
- **Access Token**: JWT de corta duración (~1h)
- **Refresh Token**: Para renovar access token
- **Storage**: HttpOnly cookies (automático)

---

## 👥 Sistema de Roles

| Role ID | Nombre | Permisos |
|---------|--------|----------|
| 1 | Dev Team | Full access + modo observación |
| 2 | Admin/Dueño | Gestión completa de empresa |
| 3 | Asesor | Solo sus propios datos |

### Verificación
```typescript
const canEdit = [1, 2].includes(userContext.role_id);
const canViewAll = [1, 2].includes(userContext.role_id);
const isRestricted = userContext.role_id === 3;
```

---

## 🔒 Row Level Security (RLS)

### Función Helper
```sql
CREATE OR REPLACE FUNCTION get_user_empresa_ids()
RETURNS SETOF bigint AS $$
  SELECT empresa_id 
  FROM wp_team_humano 
  WHERE auth_uid = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER;
```

### Política Típica
```sql
CREATE POLICY "tenant_isolation" ON wp_contactos
FOR ALL USING (
  empresa_id IN (SELECT get_user_empresa_ids())
);
```

### Tablas Protegidas
- `wp_contactos`
- `wp_conversaciones`
- `wp_citas`
- `wp_tareas`
- `wp_team_humano`
- Y todas las tablas con `empresa_id`

---

## 👁️ Modo Observación

Para el equipo de desarrollo (role 1):

```typescript
// Constantes
export const URPE_LAB_ENTERPRISE_ID = 13;
export const DEV_TEAM_ROLE_ID = 1;

// Estado
isObservationMode: boolean  // true cuando role 1 ve empresa != 13
```

### Restricciones
- ✅ Puede **ver** datos de cualquier empresa
- ❌ No puede **escribir** en empresas ajenas
- 🏠 Siempre puede volver a Urpe AI Lab (ID 13)

---

## 🚫 Acciones Bloqueadas

En modo observación se bloquean:
- `addContactNote`
- `updateContactNote`
- `deleteContactNote`
- `updateContactField`
- `updateContactStage`
- `pauseContact`
- `reactivateContact`
- `sendDirectMessage`

---

## 📝 Auditoría

Todas las acciones se registran en:
- `wp_actividades_log` (CRM)
- `activity_logs` (Chat)

Ver [Observabilidad](../observability/README.md)

---

## 📚 Documentación Relacionada

- [Seguridad y Observabilidad](./SECURITY_OBSERVABILITY.md)
- [Modelo de Datos](../../architecture/data-model.md)
- [Supabase](../../integrations/supabase.md)
