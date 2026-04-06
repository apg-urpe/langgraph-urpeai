# Contact Details - Componentes

## Descripción
Componentes para la visualización y gestión del detalle de contacto en el panel de administración.

## Componentes

### ContactNotes.tsx
**Propósito**: Crear, editar, eliminar y mostrar notas de contacto.

**Props**:
- `contactId: number` - ID del contacto
- `notes: ContactNote[]` - Lista de notas del contacto
- `empresaId?: number` - ID de empresa para upload de archivos

**Estado Local**:
- `newNote`, `newTitle`, `newTags`, `isNewPinned` - Formulario de creación
- `selectedFiles`, `uploadError`, `isUploading` - Upload de archivos
- `submitError`, `submitSuccess` - Feedback de guardado
- `editingNoteId`, `editContent`, etc. - Modo edición
- `selectedNote` - Nota seleccionada para vista detallada

**Flujo de Datos**:
```
ContactNotes (UI)
    ↓ addContactNote()
contactStore.ts (Estado Global)
    ↓ supabase.insert()
wp_contactos_nota (Base de Datos)
```

**Manejo de Errores**:
- Si falla la inserción, se muestra mensaje en `submitError`
- Logs detallados en consola con prefijo `[ContactNotes]`

### NoteDetailModal.tsx
Modal para vista inmersiva de una nota con navegación secuencial.

### ContactPauseButton.tsx
Dropdown para pausar/desactivar contactos temporalmente.

### TransferContactModal.tsx
Modal para transferir contactos entre asesores.

### CreateContactModal.tsx
**Propósito**: Crear nuevos contactos desde el panel de administración.

**Props**:
- `onClose: () => void` - Callback al cerrar el modal
- `onSuccess?: (contactId: number) => void` - Callback al crear exitosamente

**Campos del Formulario**:
| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| nombre | text | No* | Nombre del contacto |
| apellido | text | No | Apellido del contacto |
| telefono | tel | No* | Número de teléfono |
| email | email | No | Correo electrónico |
| estado | select | Sí | prospecto/cliente/rechazado |
| es_calificado | select | Sí | pendiente/si/no |
| origen | select | Sí | whatsapp/web/referido/etc |
| notas | textarea | No | Notas adicionales |

*Se requiere al menos nombre O teléfono

**Flujo de Datos**:
```
CreateContactModal (UI)
    ↓ createContact()
contactStore.ts (Estado Global)
    ↓ supabase.insert()
wp_contactos (Base de Datos)
    ↓ onSuccess(contactId)
ContactsView → selectContact(id)
```

**Acceso**: Botón + minimalista en header de ContactsView

**Seguridad**:
- Bloqueado en Modo Observación (Dev Team)
- Requiere empresa_id seleccionada
- Auto-asigna team_humano_id del usuario actual

## Store: contactStore.ts

### Acciones de Contacto

| Acción | Descripción |
|--------|-------------|
| `createContact(payload)` | Crear nuevo contacto en la empresa seleccionada |

### Acciones de Notas

| Acción | Descripción |
|--------|-------------|
| `addContactNote(contactId, description, options)` | Crear nota con título, etiquetas, pineo |
| `updateContactNote(noteId, description, options)` | Actualizar nota existente |
| `deleteContactNote(noteId)` | Eliminar nota |

### Validaciones
- `userContext?.id` requerido para crear notas
- `isObservationMode` bloquea escrituras para dev team

## Sistema de Renderizado Inteligente (V4)

### Descripción
El sistema detecta automáticamente si el contenido de una nota es **Markdown** o **JSON**, y lo renderiza de forma apropiada.

### Componentes Nuevos

#### NoteContentRenderer.tsx
Componente que detecta el tipo de contenido y lo renderiza:
- **Markdown**: Usa `react-markdown` con soporte GFM (tablas, listas, código)
- **JSON**: Renderiza como propiedades campo-valor estilo Notion

```typescript
// Props
interface NoteContentRendererProps {
  content: string;       // Contenido raw de la nota
  className?: string;    // Clases CSS adicionales
  compact?: boolean;     // Vista compacta para lista
}

// Helpers exportados
detectContentType(content: string): 'markdown' | 'json' | 'text'
safeParseJson(content: string): { success: boolean; data: any }
```

#### PropertyEditor.tsx
Editor visual de propiedades JSON estilo Notion:
- **PropertyViewer**: Renderizado read-only de JSON como campos
- **PropertyEditor**: Edición inline de propiedades

**Tipos de propiedades detectadas automáticamente**:
| Tipo | Ejemplo | Renderizado |
|------|---------|-------------|
| `text` | "Hola mundo" | Input de texto |
| `number` | 42 | Input numérico |
| `boolean` | true/false | Toggle Sí/No |
| `date` | "2025-01-09" | Date picker |
| `url` | "https://..." | Link clickeable |
| `array` | [1, 2, 3] | Lista expandible |
| `object` | { a: 1 } | Propiedades anidadas |

### Flujo de UI

```
[Toggle: Texto | Propiedades]
         ↓
  Modo "Texto": textarea con Markdown
  Modo "Propiedades": PropertyEditor visual
         ↓
  Al guardar → JSON.stringify() si es propiedades
         ↓
  Al mostrar → NoteContentRenderer auto-detecta tipo
```

### Ejemplo de Uso

**Crear nota con propiedades**:
1. Click en toggle "Propiedades"
2. Click "Añadir propiedad"
3. Escribir nombre y seleccionar tipo
4. Editar valor
5. Guardar

**Resultado en BD**:
```json
{
  "nombre": "Juan Pérez",
  "telefono": "123456789",
  "interesado": true,
  "fecha_contacto": "2025-01-09"
}
```

## Base de Datos: wp_contactos_nota

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | serial | Primary key |
| contacto_id | integer | FK a wp_contactos |
| descripcion | text | Contenido (Markdown o JSON) |
| titulo | text | Título opcional (V2) |
| etiquetas | jsonb | Array de tags (V2) |
| es_fijado | boolean | Si aparece al inicio (V2) |
| archivos_urls | text[] | URLs de archivos adjuntos (V3) |
| visible_ia | boolean | Si la IA puede ver la nota (V4) |
| team_humano_id | integer | Autor de la nota |
| created_at | timestamptz | Fecha de creación |

## Archivos Adjuntos (V3)

**Funcionalidad**: Permite adjuntar imágenes y PDFs a las notas de contacto.

**Storage**: Bucket `notas` en Supabase Storage
- Tipos permitidos: JPEG, PNG, WebP, GIF, PDF
- Tamaño máximo: 5MB por archivo
- Ruta: `empresa_{id}/contacto_{id}/nota_{timestamp}.{ext}`

**Componentes**:
- `ContactNotes.tsx`: UI de upload con preview y feedback
- `NoteDetailModal.tsx`: Visualización de archivos adjuntos
- `lib/storage.ts`: Función `uploadNotaArchivo()`

**SQL Migration**: `scripts/NOTES_ARCHIVOS_SCHEMA.sql`

## Troubleshooting

### "No hay sesión de usuario activa"
- Causa: `userContext` es null
- Solución: Recargar la página para re-autenticar

### Nota no se guarda pero no hay error visible
- Revisar consola del navegador para logs `[ContactStore]`
- Verificar pestaña Network para ver respuesta de Supabase
- Posible problema de RLS en la tabla
