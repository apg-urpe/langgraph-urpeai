# 👥 Módulo: Contactos (CRM)

> Sistema de gestión de leads y clientes

---

## 🎯 Propósito

El módulo de Contactos es el corazón del CRM de Urpe AI Lab:
- **Gestión de leads**: Captura, calificación y seguimiento
- **Pipeline de ventas**: Embudo configurable por etapas
- **Historial completo**: Conversaciones, citas, notas, multimedia
- **Búsqueda avanzada**: Multi-nivel con scoring inteligente

---

## 🏗️ Componentes

### Vistas Principales

| Componente | Ubicación | Propósito |
|------------|-----------|-----------|
| `ContactsView.tsx` | `/components/admin/contacts/` | Lista con búsqueda |
| `ContactsFunnelView.tsx` | `/components/admin/` | Vista Kanban/Tabla |
| `ContactDetailPanel.tsx` | `/components/admin/` | Panel de detalle |

### Panel de Detalle - Tabs

| Tab | Componente | Contenido |
|-----|------------|-----------|
| Conversaciones | `ConversationHistory` | Historial de chats |
| Citas | `ContactAppointments` | Citas del contacto |
| Multimedia | `ContactMultimedia` | Archivos compartidos |
| Notas | `ContactNotes` | Base de conocimiento |
| Tareas | `ContactTasks` | Tareas relacionadas |
| Marketing | `ContactMarketingTab` | Campañas enrolladas |
| Monica AI | `ContactAIChat` | Chat contextual |

---

## 💾 Modelo de Datos

### wp_contactos
```typescript
interface Contact {
  id: number;
  empresa_id: number;
  team_humano_id: number | null;  // Asesor asignado
  nombre: string;
  apellido: string;
  telefono: string;
  email: string;
  estado: 'prospecto' | 'cliente' | 'calificado' | ...;
  es_calificado: 'si' | 'no' | 'evaluando';
  origen: string;
  etapa_embudo: number | null;
  is_active: boolean;
  paused_until: string | null;  // Pausa temporal
  metadata: Record<string, any>;
  ultima_interaccion: string;
  created_at: string;
}
```

### Relaciones
- `wp_contactos_nota` - Notas del contacto
- `wp_conversaciones` - Conversaciones
- `wp_citas` - Citas programadas
- `wp_multimedia` - Archivos compartidos
- `wp_email_contacto_campana` - Campañas de marketing

---

## 🔍 Sistema de Búsqueda

### Niveles de Búsqueda

| Nivel | Latencia | Alcance |
|-------|----------|---------|
| Local | 0ms | Memoria (filtrado en cliente) |
| Básica | 100ms | Campos principales |
| Super | 500ms | Contactos + mensajes + notas + metadata |

### Alcances Disponibles

| Scope | Campos Buscados |
|-------|-----------------|
| `all` (Super) | Todos los campos + mensajes + notas |
| `basic` | nombre, apellido, teléfono, email |
| `messages` | Contenido de mensajes |
| `metadata` | Campos JSONB personalizados |

---

## 🚦 Sistema de Pausa

### Estados de Contacto

| Estado | `is_active` | `paused_until` | UI |
|--------|-------------|----------------|-----|
| Activo | `true` | `null` | Verde |
| Pausado | `false` | `timestamp` | Ámbar + countdown |
| Desactivado | `false` | `null` | Rojo |

### Acciones
```typescript
pauseContact(contactId, durationMinutes)  // 5, 15, 30, null (permanente)
reactivateContact(contactId)              // Reactiva inmediatamente
```

---

## 📊 Lead Scoring

### Algoritmo de Puntuación
```typescript
function calculateLeadScore(contact: Contact): number {
  let score = 0;
  
  // Estado base
  if (contact.es_calificado === 'si') score += 30;
  if (contact.estado === 'cliente') score += 20;
  
  // Actividad reciente
  const daysSinceInteraction = getDaysSince(contact.ultima_interaccion);
  if (daysSinceInteraction < 1) score += 25;
  else if (daysSinceInteraction < 7) score += 15;
  
  // Contexto adicional
  if (contact.metadata?.tags?.includes('vip')) score += 15;
  
  return Math.min(score, 100);
}
```

---

## 🔄 Flujo de Datos

### Store Principal: `contactStore.ts`

```typescript
// Estado
contacts: Contact[];
selectedContact: Contact | null;
filters: ContactFilters;

// Acciones principales
fetchContacts(enterpriseId, filters?)
fetchContactDetails(contactId)
updateContactField(contactId, field, value)
updateContactStage(contactId, stageId)

// Notas
addContactNote(contactId, content)
updateContactNote(noteId, content)
deleteContactNote(noteId)

// Pausa
pauseContact(contactId, minutes)
reactivateContact(contactId)
```

---

## 📚 Documentación Relacionada

- [Contexto del Perfil](./CONTACT_PROFILE_CONTEXT.md)
- [Búsqueda Profunda](./SEARCH_CONTACTS_DEEP_CONTEXT.md)
- [UI Square Style](./CONTACTS_LIST_SQUARE_UI.md)
- [Mejoras de Notas](./NOTES_IMPROVEMENT_PLAN.md)
- [**🚀 Optimización Pipeline**](./PIPELINE_OPTIMIZATION_PLAN.md) - Plan de mejora vista Kanban
