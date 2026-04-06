# Chat Components

## Componentes del Chat de Monica AI

### `RoleSelector`
Selector de roles de Monica AI para el header del chat:
- Dropdown con lista de roles disponibles
- Indicador del rol activo
- Sistema de favoritos
- Carga automática desde Supabase (`monica_roles`)
- Botón "+ Crear Nuevo Agente" en el footer
- Props: `compact` (boolean) para modo móvil

```tsx
import { RoleSelector } from '@/components/chat';

<RoleSelector />           // Desktop: icono + nombre + chevron
<RoleSelector compact />   // Mobile: solo icono
```

### `RoleEditorModal`
Modal para crear y editar agentes de Monica AI:
- **Tab Básico**: Nombre, descripción, categoría, color, temperatura
- **Tab Instrucciones**: System prompt y mensaje de bienvenida
- **Tab Herramientas**: Selección de tools habilitadas
- Soporte para crear nuevos roles o editar existentes
- Eliminación de roles (excepto el default)

```tsx
import { RoleEditorModal } from '@/components/chat';

<RoleEditorModal 
  isOpen={isOpen} 
  onClose={() => setIsOpen(false)}
  editingRole={roleToEdit}  // null para crear nuevo
/>
```

---

## Observabilidad de Monica AI

Componentes para visualizar los pasos intermedios de Gemini Function Calling.

### `JsonViewer`
Visor de JSON interactivo con:
- Nodos colapsables
- Syntax highlighting por tipo
- Botón de copiar
- Truncado de strings largos

#### `TraceAccordion`
Accordion inline que se muestra debajo de cada mensaje del asistente:
- Resumen de tools ejecutadas
- Tiempo total
- Lista de herramientas con status

#### `TraceDetailModal`
Modal completo con 3 tabs:
- **Timeline**: Vista cronológica del request
- **Tools**: Detalle de cada herramienta con args y respuesta
- **Raw JSON**: JSON completo del trace

### Uso

Solo visible para usuarios con `role_id = 1` (equipo de desarrollo).

```tsx
import { TraceAccordion, TraceDetailModal } from '@/components/chat';

// En el mensaje del asistente
{isDeveloper && trace && (
  <>
    <TraceAccordion 
      trace={trace} 
      onViewDetail={() => setShowModal(true)} 
    />
    <TraceDetailModal
      trace={trace}
      isOpen={showModal}
      onClose={() => setShowModal(false)}
    />
  </>
)}
```

### Estructura de Datos

Ver `types/observability.ts` para las interfaces `RequestTrace` y `ToolTrace`.
