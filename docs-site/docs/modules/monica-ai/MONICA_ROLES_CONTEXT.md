---
title: "Sistema de Roles Monica - Contexto y Arquitectura"
---

## 📋 Overview

**Monica Roles** es un sistema que permite crear agentes/personalidades personalizadas de Monica AI, similar a **GPTs de OpenAI** o **Gemas de Google**. Cada rol modifica el comportamiento de Monica mediante instrucciones personalizadas.

### Conceptos Clave
- **Todos son Monica**: El nombre siempre es "Monica", lo que cambia es el **rol**
- **Roles Públicos**: Creados por Urpe AI Lab (empresa_id = 13), visibles para todos
- **Roles Privados**: Creados por empresas/usuarios, solo visibles para su organización
- **Monica Default**: El rol clásico con acceso completo al CRM

---

## 🗄️ Database Schema

### Tabla Principal: `monica_roles`

```sql
CREATE TABLE adaptive_interface.monica_roles (
  id uuid PRIMARY KEY,
  
  -- Identificación
  nombre text NOT NULL,              -- "Asistente de Ventas"
  slug text UNIQUE NOT NULL,         -- "asistente-ventas"
  descripcion text,                  -- Descripción corta
  
  -- Comportamiento
  system_prompt text NOT NULL,       -- Instrucciones del rol
  welcome_message text,              -- Mensaje de bienvenida
  temperatura numeric(3,2),          -- 0.0 - 2.0
  max_tokens integer,                -- Límite de respuesta
  tools_enabled text[],              -- Tools CRM habilitadas
  
  -- Visuales
  avatar_url text,                   -- Avatar personalizado
  color_theme text,                  -- cyan, violet, emerald...
  icono text,                        -- Nombre icono Lucide
  
  -- Propiedad
  created_by uuid NOT NULL,          -- Usuario creador
  empresa_id bigint,                 -- NULL = público Urpe
  is_public boolean,                 -- Visible para todos
  is_default boolean,                -- Es Monica clásica
  is_active boolean,                 -- Habilitado
  
  -- Estadísticas
  usage_count integer,
  last_used_at timestamptz,
  
  -- Categorización
  categoria text,                    -- general, ventas, soporte...
  tags text[],
  metadata jsonb,
  
  -- Timestamps
  created_at timestamptz,
  updated_at timestamptz
);
```

### Tabla Secundaria: `monica_roles_favoritos`

```sql
CREATE TABLE adaptive_interface.monica_roles_favoritos (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  role_id uuid NOT NULL,
  created_at timestamptz,
  UNIQUE (user_id, role_id)
);
```

### Modificación a `chat_sessions`

```sql
ALTER TABLE adaptive_interface.chat_sessions 
ADD COLUMN role_id uuid REFERENCES adaptive_interface.monica_roles(id);
```

---

## 🎭 Tipos de Roles

### 1. Monica Default (Público)
- `empresa_id`: NULL
- `is_public`: true
- `is_default`: true
- Acceso completo a todas las tools
- Creado por Urpe AI Lab

### 2. Roles Compartidos (Urpe Lab)
- `empresa_id`: 13 (Urpe AI Lab)
- `is_public`: true
- Plantillas útiles para todos los clientes
- Ejemplos: Asistente de Ventas, Soporte Técnico, Marketing

### 3. Roles de Empresa
- `empresa_id`: ID de la empresa
- `is_public`: false
- Solo visible para usuarios de esa empresa
- Personalizados para el negocio específico

### 4. Roles Personales
- `created_by`: UUID del usuario
- `empresa_id`: NULL o empresa del usuario
- `is_public`: false
- Privados del usuario que los creó

---

## 🔧 Tools Habilitables

Cada rol puede habilitar/deshabilitar herramientas específicas:

| Tool | Descripción |
|------|-------------|
| `get_contacts` | Buscar/filtrar contactos |
| `get_contact_details` | Detalles de un contacto |
| `get_appointments` | Citas programadas |
| `get_conversations` | Conversaciones WhatsApp |
| `search_messages` | Buscar en mensajes |
| `get_team_members` | Miembros del equipo |
| `get_funnel_stages` | Etapas del embudo |
| `get_funnel_stats` | Estadísticas del embudo |
| `get_metrics` | KPIs del negocio |
| `get_tasks` | Tareas pendientes |
| `get_contact_notes` | Notas de contacto |
| `create_note` | Crear nota |
| `search_contacts_deep` | Búsqueda profunda |

---

## 🎨 Categorías de Roles

| Categoría | Icono | Descripción |
|-----------|-------|-------------|
| `general` | Sparkles | Asistente general |
| `ventas` | TrendingUp | Enfocado en ventas y conversiones |
| `soporte` | Headphones | Atención al cliente |
| `marketing` | Megaphone | Campañas y comunicación |
| `analisis` | BarChart3 | Análisis de datos y métricas |
| `custom` | Wand2 | Personalizado por usuario |

---

## 🖥️ Componentes UI

### 1. RoleSelector (Header del Chat)
- **Ubicación**: `ChatHeader.tsx`
- **Funcionalidad**: Dropdown para seleccionar rol activo
- **Visual**: Muestra icono + nombre del rol actual

### 2. RoleCard
- **Uso**: Lista de roles disponibles
- **Información**: Avatar, nombre, descripción, categoría, favorito

### 3. RoleEditorModal
- **Funcionalidad**: Crear/Editar roles personalizados
- **Campos**: Nombre, descripción, system prompt, tools, visuales

### 4. RolesGallery
- **Ubicación**: Vista de configuración o modal
- **Filtros**: Por categoría, favoritos, recientes

---

## 📦 Store: `monicaRolesStore.ts`

```typescript
interface MonicaRolesState {
  // Estado
  roles: MonicaRole[];
  activeRoleId: string | null;
  favorites: string[];
  isLoading: boolean;
  
  // Acciones
  fetchRoles: () => Promise<void>;
  setActiveRole: (roleId: string) => void;
  createRole: (role: CreateRolePayload) => Promise<MonicaRole>;
  updateRole: (id: string, updates: Partial<MonicaRole>) => Promise<void>;
  deleteRole: (id: string) => Promise<void>;
  toggleFavorite: (roleId: string) => Promise<void>;
  
  // Selectores
  selectActiveRole: () => MonicaRole | null;
  selectDefaultRole: () => MonicaRole | null;
  selectRolesByCategory: (cat: string) => MonicaRole[];
}
```

---

## 🔄 Flujo de Datos

### Selección de Rol
```
Usuario selecciona rol → chatStore.setActiveRole(roleId)
                      → Próximo mensaje usa role.system_prompt
                      → API recibe roleId en request
                      → buildSystemPrompt() usa instrucciones del rol
```

### Nueva Sesión con Rol
```
createNewSession() → Si hay activeRole, asociar role_id
                  → Mostrar welcome_message del rol
                  → Persistir en chat_sessions.role_id
```

### Creación de Rol
```
Usuario abre RoleEditorModal → Llena formulario
                            → createRole() → INSERT en DB
                            → Refresh roles list
                            → Opcionalmente activar nuevo rol
```

---

## 🔐 Seguridad (RLS)

### Visibilidad de Roles
- **Públicos**: `is_public = true` → Todos ven
- **Empresa**: `empresa_id = user.empresa_id` → Solo esa empresa
- **Personales**: `created_by = auth.uid()` → Solo el creador

### Edición/Eliminación
- Solo el creador puede editar/eliminar sus roles
- Roles default no pueden eliminarse

---

## 📱 Integración en UI

### ChatHeader.tsx - Selector de Rol
```tsx
// Añadir entre "Nuevo Chat" y acciones de usuario
<RoleSelector 
  activeRole={activeRole}
  onSelectRole={setActiveRole}
/>
```

### Nuevo Flujo de Chat
1. Usuario abre app → Cargar roles disponibles
2. Mostrar rol activo en header (Monica por default)
3. Click en selector → Mostrar dropdown con roles
4. Seleccionar rol → Actualizar activeRoleId
5. Nuevo mensaje → Usar system_prompt del rol activo

---

## 🚀 Implementación por Fases

### Fase 1: Base de Datos ✅
- [x] Schema SQL para `monica_roles`
- [x] Schema SQL para `monica_roles_favoritos`
- [x] Modificación a `chat_sessions`
- [x] RLS Policies
- [x] Función helper `get_available_roles`

### Fase 2: Types y Store
- [ ] `types/monica.ts` - Interfaces TypeScript
- [ ] `store/monicaRolesStore.ts` - Estado Zustand
- [ ] Integración con `chatStore`

### Fase 3: UI Components
- [ ] `RoleSelector.tsx` - Dropdown en header
- [ ] `RoleCard.tsx` - Card para lista
- [ ] `RoleEditorModal.tsx` - Crear/Editar
- [ ] `RolesGallery.tsx` - Vista de galería

### Fase 4: Integración API
- [ ] Modificar `/api/chat/route.ts` para recibir roleId
- [ ] Usar `system_prompt` del rol en `buildSystemPrompt()`
- [ ] Filtrar `tools` según `tools_enabled` del rol

### Fase 5: UX Polish
- [ ] Animaciones de transición
- [ ] Onboarding para crear primer rol
- [ ] Plantillas predefinidas
- [ ] Estadísticas de uso

---

## 📊 Métricas de Éxito

- **Adopción**: % usuarios que crean roles custom
- **Retención**: Usuarios que vuelven a usar sus roles
- **Engagement**: Promedio de mensajes por sesión con rol
- **Satisfacción**: Feedback positivo en respuestas

---

## 🎯 Casos de Uso

### 1. Asesor de Ventas
```
Nombre: "Monica Ventas"
Prompt: "Enfócate en identificar oportunidades de venta, 
        calificar leads y sugerir próximos pasos..."
Tools: get_contacts, get_funnel_stats, get_metrics
```

### 2. Soporte Técnico
```
Nombre: "Monica Soporte"
Prompt: "Ayuda a resolver problemas de clientes, 
        busca en conversaciones previas..."
Tools: search_messages, get_conversations, get_contact_notes
```

### 3. Analista de Datos
```
Nombre: "Monica Analytics"
Prompt: "Genera reportes, analiza tendencias, 
        presenta datos con visualizaciones..."
Tools: get_metrics, get_funnel_stats, search_contacts_deep
```

---

## 📝 Notas de Implementación

### Compatibilidad Hacia Atrás
- Sesiones sin `role_id` usan Monica default
- API sigue funcionando sin cambios si no se envía roleId

### Performance
- Cachear roles por 5 minutos
- Lazy load de roles menos usados
- Prefetch rol default al iniciar

### Escalabilidad
- Límite de roles por usuario: 10
- Límite de roles por empresa: 50
- System prompt máximo: 8000 caracteres
