# 👔 Módulo: Equipo

> Gestión de miembros y roles del equipo

---

## 🎯 Propósito

El módulo de Equipo proporciona:
- **Gestión de miembros**: Alta, edición, archivado
- **Sistema de roles**: Permisos granulares
- **Configuración de citas**: Disponibilidad y duración
- **Asignación automática**: Balance de carga

---

## 🏗️ Componentes

| Componente | Ubicación | Propósito |
|------------|-----------|-----------|
| `TeamView.tsx` | `/components/admin/` | Vista principal |
| `TeamMemberModal.tsx` | `/components/admin/` | Crear/editar miembro |
| `TeamMemberFilter.tsx` | `/components/admin/filters/` | Filtro global |

---

## 💾 Modelo de Datos

### wp_team_humano
```typescript
interface TeamMember {
  id: number;
  empresa_id: number;
  auth_uid: string | null;    // Firebase/Supabase Auth
  nombre: string;
  apellido: string;
  email: string;
  telefono: string | null;
  rol: 'asesor' | 'supervisor' | 'dueño' | 'admin' | 'n/a';
  role_id: number;            // FK → system_roles
  is_active: boolean;
  deleted: string | null;     // Soft delete timestamp
  
  // Configuración de citas
  acepta_citas: boolean;
  duracion_cita_minutos: number;
  disponibilidad: object;     // Horarios
  timezone: string;
  
  // Integraciones
  calendly: string | null;
  slack_id: string | null;
  
  // Gamificación
  metadata: {
    gamification: GamificationProfile;
  };
  
  created_at: string;
  updated_at: string;
}
```

### system_roles
```typescript
interface SystemRole {
  id: number;
  nombre: string;
  descripcion: string;
  enterprise_id: number | null;  // null = global
  permisos: Record<string, boolean>;
}
```

---

## 🔐 Sistema de Permisos

### Roles Predefinidos

| Role ID | Nombre | Permisos |
|---------|--------|----------|
| 1 | Dev Team | Full access, modo observación |
| 2 | Admin/Dueño | Gestión completa de empresa |
| 3 | Asesor | Solo sus propios datos |

### Verificación de Permisos
```typescript
// En stores/componentes
const canEdit = [1, 2].includes(userContext.role_id);
const isRestricted = userContext.role_id === 3;
```

---

## 🔄 Store: `teamStore.ts`

```typescript
// Estado
members: TeamMember[];
systemRoles: SystemRole[];
selectedMember: TeamMember | null;

// CRUD
fetchMembers(enterpriseId)
createMember(payload)
updateMember(memberId, updates)
deleteMember(memberId)  // Soft delete

// Utilidades
getRoleName(roleId)
canEditTeam(userRoleId)
```

---

## 🌐 Filtro Global de Equipo

### Estado en `adminStore.ts`
```typescript
globalTeamFilter: {
  selectedMemberId: number | null;
  isRestricted: boolean;
}
```

### Comportamiento
- **Roles 1-2**: Pueden cambiar el filtro libremente
- **Role 3**: Filtro bloqueado a su propio ID

### Vistas que respetan el filtro
- Dashboard
- Contactos
- Calendario
- Tareas

---

## 👤 Configuración de Miembro

### Información Personal
- Nombre y apellido
- Email y teléfono
- Rol y permisos

### Configuración de Citas
- Acepta citas (toggle)
- Duración por defecto
- Timezone
- Disponibilidad por día/hora

### Integraciones
- Calendly URL
- Slack ID
- Grupo WhatsApp

---

## 📚 Documentación Relacionada

- [Gamificación](../gamification/README.md)
- [Seguridad](../../technical/security/README.md)
- [Filtro Global](../../architecture/README.md)
