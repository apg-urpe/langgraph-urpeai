# Hooks - Urpe AI Lab

Colección de hooks personalizados de React para la aplicación.

## Índice

| Hook | Propósito | Categoría |
|------|-----------|-----------|
| `useChatReliable` | Streaming de chat AI con manejo de errores | Chat AI |
| `useAdminMetrics` | Métricas del dashboard administrativo | Dashboard |
| `useDraftStorage` | Persistencia de borradores en localStorage | UX |
| `useContactProfileContext` | Contexto del perfil de contacto | CRM |
| `useEngagement` | Tracking de engagement de usuarios | Analytics |
| `useNotifications` | Gestión de notificaciones push | Notifications |
| `useStartupNotifications` | Notificaciones de inicio de sesión | Notifications |
| `useNylasConnect` | Conexión OAuth con Nylas Calendar | Integrations |
| `useSupabase` | Cliente Supabase tipado | Database |
| `useVersionChecker` | Verificación de versiones de la app | App Lifecycle |

---

## useDraftStorage

Sistema de persistencia de borradores que evita pérdida de texto al cambiar de vista.

### Características
- **Debounce automático** (500ms) para evitar escrituras excesivas
- **TTL de 48 horas** con auto-limpieza
- **Límite de 20 borradores** por namespace
- **Tamaño máximo** de 50KB por borrador

### Uso Básico

```tsx
import { useDraftStorage } from '../hooks/useDraftStorage';

const MyComponent = ({ contactId }) => {
  const [content, setContent, clearDraft, hasDraft] = useDraftStorage(
    'contact_note',           // namespace
    `note_${contactId}`,      // key único
    ''                        // valor inicial
  );

  const handleSubmit = async () => {
    await saveToServer(content);
    clearDraft(); // Limpiar después de guardar exitosamente
  };

  return (
    <textarea 
      value={content} 
      onChange={(e) => setContent(e.target.value)}
      placeholder={hasDraft ? "Borrador guardado..." : "Escribe aquí..."}
    />
  );
};
```

### Namespaces Disponibles

| Namespace | Uso |
|-----------|-----|
| `contact_note` | Notas de contacto |
| `chat_input` | Input del chat Monica |
| `task_form` | Formulario de tareas |
| `message_reply` | Respuestas a mensajes WhatsApp |
| `campaign_form` | Formulario de campañas |
| `team_member_form` | Formulario de equipo |
| `search_query` | Queries de búsqueda |

### Hooks Adicionales

#### `useDraftForm` - Para formularios con múltiples campos

```tsx
import { useDraftForm } from '../hooks/useDraftStorage';

const { values, setValue, setValues, clearAll, hasDraft } = useDraftForm(
  'task_form',
  `task_${taskId}`,
  { titulo: '', descripcion: '', prioridad: 2 }
);

// Usar
setValue('titulo', 'Mi tarea');
setValues({ titulo: 'X', descripcion: 'Y' });
clearAll(); // Limpiar todo el formulario
```

#### `useDraftInput` - Para inputs simples

```tsx
import { useDraftInput } from '../hooks/useDraftStorage';

const { value, onChange, clear, hasDraft } = useDraftInput(
  'search_query',
  'contacts_search',
  ''
);

return <input value={value} onChange={onChange} />;
```

### Componentes Integrados

| Componente | Campo(s) Persistido(s) |
|------------|------------------------|
| `ContactNotes.tsx` | Contenido, título, tags de notas |
| `InputArea.tsx` | Input del chat por sesión |
| `TaskModal.tsx` | Título y descripción de nuevas tareas |
| `ConversationMessages.tsx` | Mensaje de respuesta por conversación |

### Funciones de Utilidad (lib/draft-storage.ts)

```tsx
import { 
  cleanupExpiredDrafts,  // Limpiar borradores expirados
  getDraftStorageStats   // Obtener estadísticas
} from '../lib/draft-storage';

// Estadísticas
const stats = getDraftStorageStats();
console.log(stats.totalDrafts, stats.totalSizeBytes);

// Limpieza manual
const cleaned = cleanupExpiredDrafts();
```

### Notas de Rendimiento

- Los borradores se guardan con debounce de 500ms
- La limpieza automática se ejecuta 5 segundos después de cargar la app
- Cada namespace tiene un límite de 20 borradores (FIFO)
- Los borradores expiran después de 48 horas sin modificación

---

## useChatReliable

Hook para conexión confiable al chat de Monica AI con manejo de errores y reintentos.

Ver `docs/modules/chat/README.md` para documentación completa.

---

## useAdminMetrics

Hook para obtener métricas del dashboard administrativo.

Ver `docs/modules/dashboard/README.md` para documentación completa.

---

## useEngagement

Hook para tracking de engagement y adopción de usuarios.

Ver `docs/modules/engagement/README.md` para documentación completa.

---

## useNotifications

Inicializa el sistema de notificaciones en tiempo real.

```tsx
import { useNotifications } from '../hooks/useNotifications';

function App() {
  useNotifications(); // Inicia suscripción a notificaciones
  return <AppContent />;
}
```

### Features

- Suscripción a Supabase Realtime para notificaciones instantáneas
- Fetch inicial de notificaciones no leídas
- Cleanup automático al cambiar de empresa o desmontar
- Depende de `user.id` y `selectedEnterpriseId`

---

## useSupabase

Hook para obtener cliente Supabase autenticado con el token del usuario.

```tsx
import { useSupabase } from '../hooks/useSupabase';

function MyComponent() {
  const { supabase, session } = useSupabase();
  
  const fetchData = async () => {
    const { data } = await supabase
      .from('wp_contactos')
      .select('*')
      .limit(10);
  };
}
```

### Características

- Cliente memoizado (solo cambia cuando cambia el token)
- Headers de autorización automáticos
- `persistSession: false` - la sesión se maneja en `authStore`
- Fallback si no hay sesión activa

---

## useNylasConnect

Hook para gestionar la conexión OAuth con Nylas Calendar.

Ver `docs/modules/calendar/README.md` para documentación completa.

---

## useStartupNotifications

Hook para mostrar notificaciones contextuales al iniciar la aplicación.

Ver `docs/modules/notifications/README.md` para documentación completa.

---

## useVersionChecker

Hook para verificar y notificar sobre nuevas versiones de la aplicación.

Ver `docs/modules/app-lifecycle/README.md` para documentación completa.

---

## useContactProfileContext

Hook para obtener el contexto completo del perfil de contacto seleccionado.

Ver `docs/modules/crm/README.md` para documentación completa.
