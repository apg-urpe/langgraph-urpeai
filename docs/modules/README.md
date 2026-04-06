# 📦 Módulos del Sistema

> Mapa completo de módulos de Urpe AI Lab

---

## 🗺️ Vista General

Urpe AI Lab se compone de módulos independientes que trabajan en conjunto para proporcionar una plataforma de Business Intelligence conversacional.

```
┌─────────────────────────────────────────────────────────────────┐
│                      CHAT PRINCIPAL                              │
│              Asistente IA con Function Calling                   │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│   CONTACTOS   │     │    TAREAS     │     │  CALENDARIO   │
│     (CRM)     │     │               │     │               │
└───────────────┘     └───────────────┘     └───────────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│   FINANZAS    │     │   MARKETING   │     │    EQUIPO     │
│               │     │               │     │               │
└───────────────┘     └───────────────┘     └───────────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│   DASHBOARD   │     │ GAMIFICACIÓN  │     │  MONICA AI    │
│   (Métricas)  │     │               │     │  (Agentes)    │
└───────────────┘     └───────────────┘     └───────────────┘
```

---

## 📋 Índice de Módulos

### Core

| Módulo | Descripción | Store | Componente Principal |
|--------|-------------|-------|---------------------|
| [Chat](./chat/README.md) | Asistente IA con tools | `chatStore` | `ChatArea.tsx` |
| [Dashboard](./dashboard/README.md) | KPIs y métricas | `adminStore` | `DashboardView.tsx` |
| [Centro de Actividad](./notifications/README.md) | Notificaciones + Novedades unificadas | `notificationsStore` | `NotificationDropdown.tsx` |
| [Novedades](./changelog/README.md) | Historial de cambios (tab en Centro de Actividad) | - | `NotificationDropdown.tsx` |

### CRM

| Módulo | Descripción | Store | Componente Principal |
|--------|-------------|-------|---------------------|
| [Contactos](./contacts/README.md) | Gestión de leads | `contactStore` | `ContactsView.tsx` |
| [Calendario](./calendar/README.md) | Citas y eventos | `contactStore` | `CalendarView.tsx` |
| [Tareas](./tasks/README.md) | Sistema de tareas | `tareasStore` | `TasksView.tsx` |
| [Funnel](./funnel/README.md) | Pipeline de ventas | `funnelStore` | `FunnelConfigSection.tsx` |

### Negocio

| Módulo | Descripción | Store | Componente Principal |
|--------|-------------|-------|---------------------|
| [Finanzas](./finance/README.md) | Servicios y pagos | `financeStore` | `FinanceView.tsx` |
| [Marketing](./marketing/README.md) | Campañas email | `marketingStore` | `MarketingView.tsx` |
| [Audience Filters](./marketing-audience-filters/README.md) | Segmentación de contactos | `marketingStore` | `FilterBuilder.tsx` |
| [Equipo](./team/README.md) | Gestión de miembros | `teamStore` | `TeamView.tsx` |

### Avanzados

| Módulo | Descripción | Store | Componente Principal |
|--------|-------------|-------|---------------------|
| [Gamificación](./gamification/README.md) | XP, niveles, medallas | `gamificationStore` | `UserProfileView.tsx` |
| [Monica AI](./monica-ai/README.md) | Multi-agentes | `chatStore` | `RoleEditorModal.tsx` |

### 🧪 Experimentales

| Módulo | Descripción | Store | Componente Principal | Estado |
|--------|-------------|-------|---------------------|--------|
| [Monica Lab](./lab-agent/README.md) | Entorno con Claude Opus | - | - | 🧪 Planificado |
| [Menciones](./mentions/README.md) | Notificaciones @usuario | - | - | 📝 Diseño |

---

## 🔄 Flujo de Datos

### Store → Component
```typescript
// Patrón típico de uso
const Component = () => {
  // 1. Obtener estado del store
  const contacts = useContactStore(state => state.contacts);
  const fetchContacts = useContactStore(state => state.fetchContacts);
  
  // 2. Cargar datos al montar
  useEffect(() => {
    fetchContacts(enterpriseId);
  }, [enterpriseId]);
  
  // 3. Renderizar
  return <ContactList contacts={contacts} />;
};
```

### Comunicación Inter-módulos
Los módulos se comunican a través de:
1. **IDs compartidos**: `contacto_id`, `empresa_id`
2. **Filtro global de equipo**: `adminStore.globalTeamFilter`
3. **Contexto de empresa**: `contactStore.selectedEnterprise`

---

## 🛠️ Añadir Nuevo Módulo

### 1. Crear Store
```typescript
// store/nuevoModuloStore.ts
export const useNuevoModuloStore = create<NuevoModuloState>()((set, get) => ({
  items: [],
  isLoading: false,
  
  fetchItems: async (enterpriseId: number) => {
    set({ isLoading: true });
    const { data } = await supabase
      .from('wp_nuevo_modulo')
      .select('*')
      .eq('empresa_id', enterpriseId);
    set({ items: data, isLoading: false });
  },
}));
```

### 2. Definir Tipos
```typescript
// types/nuevoModulo.ts
export interface NuevoModuloItem {
  id: number;
  empresa_id: number;
  nombre: string;
  // ...
}
```

### 3. Crear Componente Vista
```typescript
// components/admin/NuevoModuloView.tsx
export function NuevoModuloView() {
  const { items, fetchItems } = useNuevoModuloStore();
  // ...
}
```

### 4. Registrar en AdminPanel
```typescript
// components/admin/AdminPanel.tsx
case 'nuevoModulo':
  return <NuevoModuloView />;
```

### 5. Añadir a Navegación
```typescript
// components/admin/AdminNavBar.tsx
{ view: 'nuevoModulo', icon: IconName, label: 'Nuevo Módulo' }
```

---

## 📚 Documentación por Módulo

Cada módulo tiene su propia documentación detallada:

- **Lógica de negocio**: Reglas y flujos
- **Componentes**: UI y estructura
- **Store**: Estado y acciones
- **API/Tools**: Endpoints y herramientas IA
