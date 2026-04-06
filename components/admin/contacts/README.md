# Componentes de Contactos

## Estructura de Archivos

```
contacts/
├── ContactCard.tsx        # Tarjeta de contacto con score visual
├── ContactsFilter.tsx     # Filtros de contactos (estado, etapa, etc)
├── ContactSearchInput.tsx # Buscador avanzado reutilizable (NUEVO)
└── README.md             # Esta documentación
```

## ContactSearchInput

Componente reutilizable para búsqueda avanzada de contactos con **scope automático progresivo**.

### Características

1. **Búsqueda Progresiva Automática** (como el buscador principal):
   - **Nivel 1 (0ms)**: Filtro local instantáneo para feedback inmediato
   - **Nivel 2 (100ms)**: Búsqueda básica en servidor (nombre, teléfono, email)
   - **Nivel 3 (800ms)**: Super búsqueda automática (mensajes, metadata, conversaciones)

2. **Indicador de Scope Automático**:
   - El icono cambia automáticamente según el nivel de búsqueda activo
   - **Básica** (Users icon): Búsqueda rápida inicial
   - **Super Búsqueda** (Sparkles icon): Búsqueda profunda activada automáticamente

3. **Normalización de Teléfono**: Detecta automáticamente búsquedas por teléfono y normaliza el formato para encontrar coincidencias.

4. **Match Preview**: Muestra un fragmento del texto donde se encontró la coincidencia (mensajes, metadata).

### Props

```typescript
interface ContactSearchInputProps {
  selectedContact: Contact | null;      // Contacto actualmente seleccionado
  onSelectContact: (contact: Contact | null) => void;  // Callback al seleccionar
  placeholder?: string;                 // Placeholder del input
  disabled?: boolean;                   // Deshabilitar el input
  autoFocus?: boolean;                  // Auto-focus al montar
  maxResults?: number;                  // Máximo de resultados (default: 8)
  className?: string;                   // Clases CSS adicionales
}
```

### Uso

```tsx
import { ContactSearchInput } from '@/components/admin/contacts/ContactSearchInput';

// En un formulario
<ContactSearchInput
  selectedContact={formData.selectedContact}
  onSelectContact={(contact) => {
    if (contact) {
      setFormData(prev => ({
        ...prev,
        contacto_id: contact.id,
        selectedContact: contact
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        contacto_id: undefined,
        selectedContact: null
      }));
    }
  }}
  placeholder="Buscar contacto..."
  maxResults={6}
/>
```

### Integraciones

El componente está integrado en:

- **QuickScheduleModal**: Modal para agendar citas desde el calendario
- *(Futuro)* TaskModal: Asignar contacto a tareas
- *(Futuro)* TransferContactModal: Transferir contactos

### Dependencias

- `@/store/contactStore`: Para acceder a la lista de contactos cargados
- `@/lib/supabase-client`: Para búsquedas profundas en el servidor
- `@/lib/ui-helpers`: Para normalización de teléfono

---

## ContactCard

Tarjeta visual de contacto con score de lead y badges de estado.

### Features

- Avatar con iniciales y color dinámico
- Badge de calificación (Zap icon)
- Indicador de pausa/desactivación
- Barra de score con gradientes
- Tags y origen
- Highlight de términos de búsqueda

---

## ContactsFilter

Panel de filtros para la lista de contactos.

### Filtros Disponibles

- **Equipo**: Selector de miembros (sincronizado con filtro global del header)
- **Etapa Embudo**: Dropdown con etapas configuradas por empresa
- **Estado**: Prospecto, Cliente, Calificado, No Calificado, Evaluando
- **Calificación**: Sí, No, Evaluando
