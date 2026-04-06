# Types - Urpe AI Lab

Definiciones de tipos TypeScript para todo el sistema. Tipado estricto con interfaces para entidades, stores, componentes y APIs.

## Índice de Tipos

| Archivo | Entidades Principales | Descripción |
|---------|----------------------|-------------|
| `chat.ts` | `Message`, `UIBlock`, `Attachment` | Sistema de chat con Monica AI |
| `contact.ts` | `Contact`, `Conversation`, `Appointment` | CRM - Contactos, conversaciones, citas |
| `agent.ts` | `AgentTool`, `AgentConfig`, `AgentContext` | Herramientas y configuración de agentes AI |
| `artifact.ts` | `Artifact`, `ArtifactBlock`, `ArtifactContent` | Sistema de artefactos generados |
| `team.ts` | `TeamMember`, `TeamRole`, `EnterpriseProfile` | Equipos, roles y empresas |
| `tasks-v3.ts` | `TaskV3`, `ProjectV3`, `TaskComment` | Sistema de tareas v3 |
| `finance.ts` | `Transaction`, `Budget`, `InvoiceItem` | Finanzas y presupuestos |
| `invoice.ts` | `Invoice`, `InvoiceLine`, `Payment` | Facturación y pagos |
| `marketing.ts` | `Campaign`, `Audience`, `Template` | Marketing y campañas |
| `notification.ts` | `Notification`, `NotificationPrefs` | Sistema de notificaciones |
| `gamification.ts` | `Badge`, `Achievement`, `PointsLog` | Gamificación y logros |
| `monica.ts` | `MonicaSession`, `MonicaContext` | Contexto y sesiones de Monica |
| `deep-research.ts` | `ResearchJob`, `ResearchResult` | Deep Research Jobs |
| `email.ts` | `EmailTemplate`, `EmailCampaign` | Email y campañas de correo |
| `dal.ts` | `QueryOptions`, `FilterParams` | Data Access Layer utilities |
| `observability.ts` | `Trace`, `LogEntry`, `MetricPoint` | Observabilidad y trazas |

---

## Convenciones

### Naming

- **Interfaces**: PascalCase (ej: `Contact`, `UIBlock`)
- **Types**: PascalCase con sufijo descriptivo (ej: `MessageFeedback`, `MultimediaTipo`)
- **Enums**: PascalCase (ej: `TaskStatus`, `AppointmentState`)

### Campos Opcionales

```typescript
// Preferir undefined sobre null en TypeScript
nombre?: string;        // ✅ Puede no existir
telefono: string | null; // ✅ Puede ser null explícitamente
```

### Metadata Flexible

La mayoría de entidades incluyen campo `metadata` para extensibilidad:

```typescript
interface Contact {
  // Campos fijos del schema
  id: number;
  nombre?: string;
  
  // Campos dinámicos
  metadata?: Record<string, unknown>;
}
```

---

## Categorías por Dominio

### CRM (`contact.ts`)

Entidades principales del Customer Relationship Management:

- `Contact` - Personas/clientes
- `Conversation` - Hilos de conversación
- `ConversationMessage` - Mensajes individuales
- `Appointment` - Citas y reuniones
- `Multimedia` - Archivos adjuntos

### Chat AI (`chat.ts`, `monica.ts`)

Comunicación con agentes AI:

- `Message` - Mensajes del chat
- `UIBlock` - Bloques de UI renderizables
- `Attachment` - Archivos adjuntos
- `MonicaSession` - Sesiones persistentes

### Agentes (`agent.ts`)

Herramientas y configuración de AI:

- `AgentTool` - Definición de herramienta
- `AgentContext` - Contexto de ejecución
- `ToolResult` - Resultado de ejecución

### Tareas (`tasks-v3.ts`)

Sistema de gestión de tareas:

- `TaskV3` - Tarea individual
- `ProjectV3` - Proyecto con tareas
- `TaskComment` - Comentarios
- `TaskHistory` - Historial de cambios

### Equipos (`team.ts`)

Gestión de equipos y permisos:

- `TeamMember` - Miembro del equipo
- `TeamRole` - Rol y permisos
- `EnterpriseProfile` - Perfil de empresa

---

## Uso en Stores

Los stores usan estos tipos para garantizar type safety:

```typescript
// store/contactStore.ts
import { Contact, ContactFilters } from '../types/contact';

interface ContactState {
  contacts: Contact[];
  filters: ContactFilters;
  selectedContact: Contact | null;
}
```

---

## Relaciones entre Entidades

```
Enterprise (1) ───< (*) Contact
                        │
                        ├──< (*) Conversation
                        │           │
                        │           └──< (*) ConversationMessage
                        │
                        ├──< (*) Appointment
                        │
                        └──< (*) Multimedia

Team (1) ───< (*) TeamMember ─── (*) Role
```

---

## Verificación de Tipos

Ejecutar type checking del proyecto:

```bash
npm run type-check
# o
npx tsc --noEmit
```

---

*Última actualización: 2026-02-03*
