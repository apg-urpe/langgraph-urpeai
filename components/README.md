# Components - Documentación

## ChatSidebar

### Descripción
Sidebar lateral que muestra el historial completo de sesiones de chat cuando el AdminPanel está cerrado (modo pantalla completa del chat).

### Lógica de Negocio
- **Visibilidad**: Solo se muestra en desktop (`md:block`) cuando `isAdminPanelOpen === false`
- **Estado colapsable**: El sidebar puede colapsarse/expandirse con `isChatSidebarOpen`
- **Funcionalidades incluidas**:
  - Lista de sesiones de chat ordenadas por fecha
  - Botón "Nuevo Análisis" para crear nueva sesión
  - Eliminar sesiones (con confirmación de doble click)
  - Menú de perfil de usuario (instrucciones, novedades, cerrar sesión)

### Props
```typescript
interface ChatSidebarProps {
  sessions: ChatSession[];           // Lista de sesiones
  activeSessionId: string;           // ID de sesión activa
  onNewChat: () => void;             // Crear nueva sesión
  onSelectSession: (id: string) => void;  // Seleccionar sesión
  onDeleteSession?: (id: string) => void; // Eliminar sesión
  isOpen: boolean;                   // Estado abierto/cerrado
  onToggle: () => void;              // Toggle del sidebar
}
```

### Archivos Relacionados
- `app/page.tsx` - Integración del componente en el layout principal
- `components/ChatHeader.tsx` - Header del chat que oculta historial cuando sidebar está visible
- `store/chatStore.ts` - Estado de sesiones y acciones

### Comportamiento
1. **Desktop con AdminPanel abierto**: ChatSidebar oculto, historial disponible en ChatHeader
2. **Desktop con AdminPanel cerrado**: ChatSidebar visible con historial completo
3. **Mobile**: ChatSidebar oculto, historial siempre en modal via ChatHeader

---

## ChatHeader

### Cambios Relacionados
El botón de historial en `ChatHeader` ahora detecta si el AdminPanel está cerrado:
- Si `isAdminPanelOpen === true`: Muestra botón de historial (sidebar oculto)
- Si `isAdminPanelOpen === false`: Oculta botón de historial en desktop (sidebar visible)
- Mobile: Siempre muestra botón de historial (sidebar no disponible)
