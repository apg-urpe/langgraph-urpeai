# 💬 Sistema de Menciones (@Mentions)

> Notificaciones contextuales mediante @usuario en comentarios y tareas

---

## 🎯 Propósito

El sistema de Menciones permite a los usuarios notificar a otros miembros del equipo mediante el uso de `@nombre` en comentarios, descripciones de tareas, notas de contacto y otros campos de texto. Esto facilita la colaboración y asegura que las personas correctas sean notificadas sobre conversaciones relevantes.

---

## 🏗️ Arquitectura Planeada

### Database Schema (Propuesto)

**Tabla**: `wp_mentions`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | bigserial | PK |
| `empresa_id` | bigint | FK multi-tenant |
| `mencionado_id` | bigint | Usuario mencionado (FK wp_team_humano) |
| `mencionador_id` | bigint | Usuario que menciona |
| `contexto_tipo` | enum | `'tarea'` \| `'comentario'` \| `'nota'` \| `'cita'` |
| `contexto_id` | bigint | ID del elemento donde ocurre la mención |
| `texto_origen` | text | Texto completo que contiene la mención |
| `leido` | boolean | Estado de lectura |
| `created_at` | timestamp | Fecha de la mención |

**Tabla**: `wp_notificaciones_mencion` (relacional)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `mencion_id` | bigint | FK a wp_mentions |
| `notificacion_id` | bigint | FK a wp_notificaciones_team |

---

## 📦 Tipos de Datos (Propuestos)

### MentionContext
```typescript
type MentionContext = 
  | 'task_comment'        // Comentario en tarea
  | 'task_description'    // Descripción de tarea
  | 'contact_note'        // Nota de contacto
  | 'appointment_note'    // Nota de cita
  | 'conversation_note'   // Nota en conversación
  | 'project_update';     // Actualización de proyecto
```

### Mention
```typescript
interface Mention {
  id: number;
  empresaId: number;
  mencionadoId: number;      // Quién es mencionado
  mencionadorId: number;     // Quién menciona
  contextoTipo: MentionContext;
  contextoId: number;
  textoOrigen: string;
  excerpt: string;           // Fragmento con contexto
  leido: boolean;
  createdAt: string;
  // Relaciones
  mencionado?: TeamMember;
  mencionador?: TeamMember;
}
```

### MentionSuggestion
```typescript
interface MentionSuggestion {
  id: number;
  nombre: string;
  apellido: string;
  email: string;
  avatar?: string;
  highlight?: string;        // Texto resaltado del match
}
```

---

## 🛠️ Componentes (Planificados)

| Componente | Propósito |
|------------|-----------|
| `MentionInput` | Input con autocompletado de @usuario |
| `MentionList` | Dropdown de sugerencias de usuarios |
| `MentionHighlighter` | Resaltado de @usuario en texto |
| `MentionNotification` | Notificación específica de mención |

---

## 🔧 Funcionalidades Planificadas

### 1. Autocompletado Inteligente
```
Usuario escribe: "@jua"
Sistema sugiere:
  - @juan.perez (Juan Pérez)
  - @juanita.gomez (Juanita Gómez)
```

### 2. Parseo de Menciones
```typescript
const texto = "Hola @maria.garcia, revisa esto con @pedro";
const menciones = parseMentions(texto);
// Result: ['maria.garcia', 'pedro']
```

### 3. Notificaciones en Tiempo Real
- Push notification al ser mencionado
- Badge en el Centro de Actividad
- Email opcional (si no está online)

### 4. Vistas de Contexto
Click en notificación de mención → Navegar directamente al:
- Comentario específico
- Tarea con el comentario
- Nota del contacto

---

## 🔄 Flujo de Datos (Propuesto)

```
Usuario escribe @nombre en input
         │
         ▼
+──────────────────────+
│  MentionInput detecta│
│  patrón @            │
+──────────────────────+
         │
         ▼
+──────────────────────+
│  fetchTeamMembers()  │
│  Sugerencias filtradas
+──────────────────────+
         │
         ▼
+──────────────────────+
│  Usuario selecciona  │
+──────────────────────+
         │
         ▼
+──────────────────────+
│  Submit comentario   │
+──────────────────────+
         │
         ▼
+──────────────────────+
│  parseMentions()     │
│  Extraer @usuarios   │
+──────────────────────+
         │
         ▼
+──────────────────────+
│  Crear notificaciones│
│  para cada mencionado│
+──────────────────────+
         │
         ▼
+──────────────────────+
│  WebSocket/Realtime  │
│  Notificación instant│
+──────────────────────+
```

---

## 📱 UX/UI Diseño Propuesto

### MentionInput
- Trigger: Caracter `@` en cualquier input de texto
- Lista desplegable con avatares y nombres
- Navegación con ↑ ↓ Enter
- Highlight del match en cada sugerencia

### Visualización
- Menciones renderizadas como chips/badges
- Color distintivo (ej: azul claro)
- Hover: Tooltip con info del usuario
- Click: Ir al perfil del usuario

### Notificación
```
┌─────────────────────────────────────┐
│ 🔔 Nueva mención                    │
│                                     │
│ @carlos.lopez te mencionó en:       │
│ "Tarea: Revisar propuesta"          │
│                                     │
│ "@juanita por favor revisa el..."   │
│                                     │
│ [Ver comentario]                    │
└─────────────────────────────────────┘
```

---

## 🛡️ Permisos y Reglas

| Regla | Descripción |
|-------|-------------|
| **No auto-mención** | No se puede mencionar a uno mismo |
| **Validación** | Solo usuarios activos de la empresa |
| **Rate limiting** | Máximo 10 menciones por mensaje |
| **Notificación** | Solo si el mencionado tiene acceso al contexto |

---

## 📋 Roadmap

- [ ] Componente MentionInput con autocompletado
- [ ] Parser de menciones (@username)
- [ ] Integración con comentarios de tareas
- [ ] Integración con notas de contacto
- [ ] Sistema de notificaciones de menciones
- [ ] Centro de Actividad - filtro "Menciones"
- [ ] Emails de menciones (opcional)
- [ ] Menciones en comentarios de citas

---

## 🔗 Documentación Relacionada

- [Notificaciones](../notifications/README.md)
- [Módulo de Tareas](../tasks/README.md)
- [Módulo de Equipo](../team/README.md)
- [Notas de Contacto](../contacts/README.md)

---

## 📝 Notas

> **Estado actual**: Este módulo está en fase de diseño. Las menciones actualmente no están implementadas en la plataforma.
> 
> Cuando se implemente, se integrará con:
> - Comentarios de tareas (Tareas V3)
> - Notas de contacto V2
> - Sistema de notificaciones existente

