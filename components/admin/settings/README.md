# Settings Components

Componentes reutilizables para la configuración de empresa.

## FullscreenTextEditor

Editor de texto con soporte para pantalla completa. **Estándar para edición de texto largo.**

### Características

| Feature | Descripción |
|---------|-------------|
| **Pantalla completa** | Modal que ocupa toda la pantalla para máxima concentración |
| **Modo edición/vista** | Toggle entre escribir y preview renderizado |
| **Detección automática** | Reconoce JSON vs Markdown automáticamente |
| **Atajos de teclado** | `Ctrl+S` para guardar, `ESC` para cerrar |
| **Confirmación de cambios** | Alerta si hay cambios sin guardar al cerrar |

### Uso

```tsx
import { FullscreenTextEditor } from './settings/FullscreenTextEditor';

// En un componente...
const [isOpen, setIsOpen] = useState(false);
const [content, setContent] = useState('');

{isOpen && (
  <FullscreenTextEditor
    label="Información Empresarial"
    value={content}
    onChange={setContent}
    onClose={() => setIsOpen(false)}
    disabled={!canEdit}
    placeholder="Escribe aquí..."
  />
)}
```

### Props

| Prop | Tipo | Requerido | Descripción |
|------|------|-----------|-------------|
| `label` | `string` | ✅ | Título del campo |
| `value` | `string` | ✅ | Valor actual del texto |
| `onChange` | `(value: string) => void` | ✅ | Callback cuando se guarda |
| `onClose` | `() => void` | ✅ | Callback cuando se cierra |
| `disabled` | `boolean` | ❌ | Modo solo lectura |
| `placeholder` | `string` | ❌ | Placeholder del textarea |

### Integración en RichTextAreaField

El componente `RichTextAreaField` en `SettingsView.tsx` ya integra el `FullscreenTextEditor`:

1. **Botón Maximize**: Abre el editor fullscreen
2. **Click en textarea**: También abre el editor fullscreen
3. **Preview compacto**: Muestra preview truncado con "Click para expandir"

### Flujo de Datos

```
RichTextAreaField (inline preview)
    │
    └── [Click] → FullscreenTextEditor (modal)
                      │
                      ├── Editar en fullscreen
                      ├── Preview con Markdown/JSON
                      │
                      └── [Guardar] → onChange() → Parent actualiza estado
```

### Diseño

- **Dark theme**: `bg-[#0a0a0c]` con bordes sutiles
- **Glass morphism**: Backdrop blur en overlay
- **Transiciones suaves**: Animaciones CSS para estados
- **Responsive**: Se adapta al tamaño de pantalla

### Estándar de Edición de Texto

Este componente es el **estándar oficial** para edición de campos de texto largo en la aplicación:

- ✅ Información empresarial
- ✅ Servicios generales
- ✅ Preguntas frecuentes
- ✅ Embudo de ventas
- ✅ Reglas de negocio
- ✅ Configuración de agentes

### Comparación con AgentFieldEditor

| Aspecto | FullscreenTextEditor | AgentFieldEditor |
|---------|---------------------|------------------|
| **Propósito** | Texto genérico | Campos de agente IA |
| **Historial** | ❌ | ✅ (versiones anteriores) |
| **Guardado** | Inmediato al cerrar | Con confirmación |
| **Ubicación** | Settings genéricos | Panel de agentes |
