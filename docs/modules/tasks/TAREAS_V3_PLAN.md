# 📋 Sistema de Gestión de Tareas v3 - Plan de Diseño

## 📑 Índice
1. [Resumen Ejecutivo](#resumen-ejecutivo)
2. [Arquitectura de Datos](#arquitectura-de-datos)
3. [Relaciones de Entidades](#relaciones-de-entidades)
4. [Componentes UI](#componentes-ui)
5. [Sistema de Notificaciones](#sistema-de-notificaciones)
6. [Fases de Implementación](#fases-de-implementación)

---

## 🎯 Resumen Ejecutivo

### Objetivos v3
| Feature | Estado v2 | Objetivo v3 |
|---------|-----------|-------------|
| Detalle de tarjeta | Básico | Vista expandida con tabs |
| Comentarios | Implementado | + Menciones + Reacciones |
| Múltiples miembros | Tabla `wp_tareas_asignados` | UI mejorada + Roles claros |
| Proyecto ↔ Contacto/Servicio | No existe | Relación directa |
| Media attachments | No existe | Sistema completo |
| Etiquetas | `wp_etiquetas_equipo` | UI visual + Filtros |
| Historial de cambios | No existe | Activity log completo |
| Notificaciones | Triggers básicos | Sistema en-app completo |
| Markdown | No | Soporte completo |
| Costos en proyecto | No existe | Sistema financiero |

### Stack Técnico
- **Database**: Supabase (PostgreSQL + RLS + Triggers)
- **Frontend**: React + TypeScript + Zustand
- **UI**: Tailwind CSS + Lucide Icons
- **Markdown**: react-markdown + remark-gfm
- **Storage**: Supabase Storage (bucket: `task-attachments`)

---

## 🗄️ Arquitectura de Datos

### 1. Modificaciones a Tablas Existentes

#### `wp_tareas` (Actualización)
```sql
ALTER TABLE wp_tareas
ADD COLUMN IF NOT EXISTS descripcion_md TEXT,           -- Descripción en Markdown
ADD COLUMN IF NOT EXISTS portada_url TEXT,              -- Imagen de portada (opcional)
ADD COLUMN IF NOT EXISTS tiempo_estimado_min INTEGER,   -- Tiempo estimado en minutos
ADD COLUMN IF NOT EXISTS tiempo_real_min INTEGER,       -- Tiempo real invertido
ADD COLUMN IF NOT EXISTS costo_estimado DECIMAL(12,2),  -- Costo estimado
ADD COLUMN IF NOT EXISTS costo_real DECIMAL(12,2),      -- Costo real
ADD COLUMN IF NOT EXISTS moneda VARCHAR(3) DEFAULT 'USD';
```

#### `wp_proyectos` (Actualización)
```sql
ALTER TABLE wp_proyectos
ADD COLUMN IF NOT EXISTS contacto_id INTEGER REFERENCES wp_contactos(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS servicio_id INTEGER REFERENCES wp_crm_servicios(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS presupuesto DECIMAL(12,2),
ADD COLUMN IF NOT EXISTS gasto_actual DECIMAL(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS moneda VARCHAR(3) DEFAULT 'USD',
ADD COLUMN IF NOT EXISTS fecha_inicio DATE,
ADD COLUMN IF NOT EXISTS fecha_fin_estimada DATE,
ADD COLUMN IF NOT EXISTS fecha_fin_real DATE;

CREATE INDEX IF NOT EXISTS idx_proyectos_contacto ON wp_proyectos(contacto_id) WHERE contacto_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_proyectos_servicio ON wp_proyectos(servicio_id) WHERE servicio_id IS NOT NULL;
```

### 2. Nuevas Tablas

#### `wp_tareas_media` (Archivos adjuntos)
```sql
CREATE TABLE wp_tareas_media (
    id BIGSERIAL PRIMARY KEY,
    tarea_id INTEGER NOT NULL REFERENCES wp_tareas(id) ON DELETE CASCADE,
    
    -- Información del archivo
    nombre_archivo VARCHAR(255) NOT NULL,
    tipo_mime VARCHAR(100) NOT NULL,
    tamaño_bytes BIGINT NOT NULL,
    storage_path TEXT NOT NULL,           -- Path en Supabase Storage
    url_publica TEXT,                     -- URL firmada (opcional)
    
    -- Metadatos
    descripcion VARCHAR(500),
    es_portada BOOLEAN DEFAULT FALSE,     -- Si es la imagen de portada
    
    -- Auditoría
    subido_por INTEGER REFERENCES wp_team_humano(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tareas_media_tarea ON wp_tareas_media(tarea_id);
CREATE INDEX idx_tareas_media_tipo ON wp_tareas_media(tipo_mime);
```

#### `wp_tareas_etiquetas` (Relación muchos a muchos)
```sql
CREATE TABLE wp_tareas_etiquetas (
    tarea_id INTEGER NOT NULL REFERENCES wp_tareas(id) ON DELETE CASCADE,
    etiqueta_id INTEGER NOT NULL REFERENCES wp_etiquetas_equipo(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (tarea_id, etiqueta_id)
);

CREATE INDEX idx_tareas_etiquetas_etiqueta ON wp_tareas_etiquetas(etiqueta_id);
```

#### `wp_tareas_historial` (Activity Log)
```sql
CREATE TABLE wp_tareas_historial (
    id BIGSERIAL PRIMARY KEY,
    tarea_id INTEGER NOT NULL REFERENCES wp_tareas(id) ON DELETE CASCADE,
    
    -- Acción realizada
    accion VARCHAR(50) NOT NULL,          -- 'created', 'status_changed', 'assigned', 'comment_added', etc.
    campo_modificado VARCHAR(50),         -- Campo que cambió (si aplica)
    valor_anterior TEXT,                  -- Valor anterior (JSON o string)
    valor_nuevo TEXT,                     -- Valor nuevo
    
    -- Contexto
    autor_id INTEGER REFERENCES wp_team_humano(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}',          -- Datos adicionales
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tareas_historial_tarea ON wp_tareas_historial(tarea_id, created_at DESC);
CREATE INDEX idx_tareas_historial_autor ON wp_tareas_historial(autor_id);
CREATE INDEX idx_tareas_historial_accion ON wp_tareas_historial(accion);
```

#### `wp_tareas_reacciones` (Reacciones a comentarios)
```sql
CREATE TABLE wp_tareas_reacciones (
    comentario_id INTEGER NOT NULL REFERENCES wp_tareas_comentarios(id) ON DELETE CASCADE,
    usuario_id INTEGER NOT NULL REFERENCES wp_team_humano(id) ON DELETE CASCADE,
    emoji VARCHAR(10) NOT NULL,           -- '👍', '❤️', '🎉', etc.
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (comentario_id, usuario_id, emoji)
);
```

#### `wp_proyectos_costos` (Registro de costos)
```sql
CREATE TABLE wp_proyectos_costos (
    id BIGSERIAL PRIMARY KEY,
    proyecto_id INTEGER NOT NULL REFERENCES wp_proyectos(id) ON DELETE CASCADE,
    
    -- Detalle del costo
    concepto VARCHAR(255) NOT NULL,
    categoria VARCHAR(50) DEFAULT 'general', -- 'personal', 'licencias', 'infraestructura', 'servicios', 'general'
    monto DECIMAL(12,2) NOT NULL,
    moneda VARCHAR(3) DEFAULT 'USD',
    
    -- Vinculación opcional
    tarea_id INTEGER REFERENCES wp_tareas(id) ON DELETE SET NULL,
    
    -- Fechas
    fecha_costo DATE NOT NULL DEFAULT CURRENT_DATE,
    
    -- Auditoría
    registrado_por INTEGER REFERENCES wp_team_humano(id) ON DELETE SET NULL,
    comprobante_url TEXT,
    notas TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_proyectos_costos_proyecto ON wp_proyectos_costos(proyecto_id);
CREATE INDEX idx_proyectos_costos_fecha ON wp_proyectos_costos(fecha_costo);
CREATE INDEX idx_proyectos_costos_categoria ON wp_proyectos_costos(categoria);
```

### 3. RLS Policies

```sql
-- Tareas Media
ALTER TABLE wp_tareas_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY tareas_media_policy ON wp_tareas_media
    FOR ALL USING (
        EXISTS (SELECT 1 FROM wp_tareas t WHERE t.id = tarea_id AND t.empresa_id = get_current_user_empresa_id())
    );

-- Tareas Etiquetas
ALTER TABLE wp_tareas_etiquetas ENABLE ROW LEVEL SECURITY;
CREATE POLICY tareas_etiquetas_policy ON wp_tareas_etiquetas
    FOR ALL USING (
        EXISTS (SELECT 1 FROM wp_tareas t WHERE t.id = tarea_id AND t.empresa_id = get_current_user_empresa_id())
    );

-- Tareas Historial
ALTER TABLE wp_tareas_historial ENABLE ROW LEVEL SECURITY;
CREATE POLICY tareas_historial_policy ON wp_tareas_historial
    FOR ALL USING (
        EXISTS (SELECT 1 FROM wp_tareas t WHERE t.id = tarea_id AND t.empresa_id = get_current_user_empresa_id())
    );

-- Proyectos Costos
ALTER TABLE wp_proyectos_costos ENABLE ROW LEVEL SECURITY;
CREATE POLICY proyectos_costos_policy ON wp_proyectos_costos
    FOR ALL USING (
        EXISTS (SELECT 1 FROM wp_proyectos p WHERE p.id = proyecto_id AND p.empresa_id = get_current_user_empresa_id())
    );

-- Reacciones
ALTER TABLE wp_tareas_reacciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY tareas_reacciones_policy ON wp_tareas_reacciones
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM wp_tareas_comentarios c 
            JOIN wp_tareas t ON t.id = c.tarea_id 
            WHERE c.id = comentario_id AND t.empresa_id = get_current_user_empresa_id()
        )
    );
```

---

## 🔗 Relaciones de Entidades

### Diagrama de Relaciones

```
                    ┌─────────────────┐
                    │  wp_contactos   │
                    └────────┬────────┘
                             │ 1:N
                             ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ wp_crm_servicios│◄───│  wp_proyectos   │───►│  wp_tareas      │
└─────────────────┘    └────────┬────────┘    └────────┬────────┘
        1:1                     │ 1:N                  │
                                ▼                      │
                    ┌─────────────────────┐            │
                    │ wp_proyectos_costos │            │
                    └─────────────────────┘            │
                                                       │
        ┌──────────────────────────────────────────────┼──────────────────────────────┐
        │                      │                       │                              │
        ▼                      ▼                       ▼                              ▼
┌───────────────┐    ┌─────────────────┐    ┌─────────────────┐           ┌─────────────────┐
│wp_tareas_media│    │wp_tareas_items  │    │wp_tareas_asign..│           │wp_tareas_coment.│
└───────────────┘    └─────────────────┘    └─────────────────┘           └────────┬────────┘
                                                                                   │
                                                    ┌──────────────────────────────┤
                                                    ▼                              ▼
                                        ┌─────────────────────┐         ┌──────────────────┐
                                        │wp_tareas_etiquetas  │         │wp_tareas_reaccio.│
                                        └─────────────────────┘         └──────────────────┘
```

### Casos de Uso de Relaciones

#### 1. Proyecto vinculado a Contacto + Servicio
```typescript
// Ejemplo: Proyecto de implementación para cliente
const proyecto = {
  nombre: "Implementación CRM - Empresa ABC",
  contacto_id: 123,        // Cliente principal
  servicio_id: 456,        // Servicio contratado
  presupuesto: 5000,
  moneda: 'USD'
};
```

#### 2. Tarea con múltiples miembros y etiquetas
```typescript
// Relaciones de una tarea completa
const tarea = {
  id: 1,
  titulo: "Configurar integraciones",
  proyecto_id: 1,
  descripcion_md: "## Objetivo\n- Configurar WhatsApp\n- Configurar Email",
  
  // Múltiples miembros
  asignados: [
    { team_humano_id: 1, rol: 'responsable' },
    { team_humano_id: 2, rol: 'colaborador' },
    { team_humano_id: 3, rol: 'revisor' }
  ],
  
  // Etiquetas
  etiquetas: [
    { id: 1, nombre: 'Desarrollo', color: 'blue' },
    { id: 2, nombre: 'Urgente', color: 'rose' }
  ],
  
  // Media
  media: [
    { nombre_archivo: 'diagrama.png', tipo_mime: 'image/png' },
    { nombre_archivo: 'requisitos.pdf', tipo_mime: 'application/pdf' }
  ]
};
```

---

## 🎨 Componentes UI

### 1. Vista de Detalle de Tarea (`TaskDetailModal.tsx`)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ [←]  Configurar integraciones                              [⋮] [Editar] [×] │
│ ═══════════════════════════════════════════════════════════════════════════ │
│                                                                             │
│ ┌─────────────────────────────────────┐  ┌───────────────────────────────┐ │
│ │                                     │  │ ESTADO                        │ │
│ │  ## Descripción (Markdown)          │  │ ┌──────────────────────────┐  │ │
│ │                                     │  │ │ 🔵 En Progreso      [▾] │  │ │
│ │  - Configurar API WhatsApp          │  │ └──────────────────────────┘  │ │
│ │  - Configurar servidor de email     │  │                               │ │
│ │  - Pruebas de integración           │  │ ASIGNADOS                     │ │
│ │                                     │  │ [👤 Juan R. - Responsable]    │ │
│ │  > Nota: Ver documentación...       │  │ [👤 María L. - Colaborador]   │ │
│ │                                     │  │ [+ Añadir miembro]            │ │
│ │                                     │  │                               │ │
│ │  ┌──────────────────────────────┐   │  │ ETIQUETAS                     │ │
│ │  │ 📎 diagrama.png    [×]      │   │  │ [🔵 Desarrollo] [🔴 Urgente]  │ │
│ │  │ 📎 requisitos.pdf  [×]      │   │  │ [+ Añadir etiqueta]           │ │
│ │  │ [+ Añadir archivos]         │   │  │                               │ │
│ │  └──────────────────────────────┘   │  │ FECHAS                        │ │
│ │                                     │  │ 📅 Vence: 28 Dic 2024         │ │
│ └─────────────────────────────────────┘  │ ⏱️ Estimado: 4h               │ │
│                                          │ 💰 Costo: $200                │ │
│ ═══════════════════════════════════════  │                               │ │
│ [Descripción] [Checklist] [Comentarios] [Historial] │                    │ │
│ ─────────────────────────────────────────           │ PROYECTO            │ │
│ ┌──────────────────────────────────────┐            │ 📁 Implementación   │ │
│ │ 💬 Comentarios                       │            │    CRM - ABC        │ │
│ │                                      │            │                     │ │
│ │ [👤 Juan] hace 2h                    │            │ CONTACTO            │ │
│ │ Ya terminé la configuración de WA   │            │ 👤 Carlos Pérez     │ │
│ │ [👍 2] [❤️ 1]                        │            │    Empresa ABC      │ │
│ │                                      │            └─────────────────────┘ │
│ │ [👤 María] hace 1h                   │                                    │
│ │ @Juan perfecto, voy con el email    │                                    │
│ │                                      │                                    │
│ │ ┌────────────────────────┐ [Enviar] │                                    │
│ │ │ Escribe un comentario...│         │                                    │
│ │ └────────────────────────┘          │                                    │
│ └──────────────────────────────────────┘                                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2. Estructura de Tabs

| Tab | Contenido |
|-----|-----------|
| **Descripción** | Markdown renderizado + Media gallery |
| **Checklist** | Items con asignación individual |
| **Comentarios** | Thread con menciones y reacciones |
| **Historial** | Timeline de cambios (Activity log) |

### 3. Sidebar de Proyecto con Costos

```
┌─────────────────────────────────────┐
│ 📁 Implementación CRM - Empresa ABC │
│ ═══════════════════════════════════ │
│                                     │
│ CLIENTE                             │
│ 👤 Carlos Pérez - Empresa ABC       │
│                                     │
│ SERVICIO VINCULADO                  │
│ 📋 Implementación CRM Pro           │
│    Valor: $5,000 USD                │
│                                     │
│ PRESUPUESTO                         │
│ ┌─────────────────────────────────┐ │
│ │ Presupuesto:     $5,000.00      │ │
│ │ Gastado:         $2,350.00      │ │
│ │ Disponible:      $2,650.00      │ │
│ │ ████████████░░░░░░░░░░░  47%    │ │
│ └─────────────────────────────────┘ │
│                                     │
│ DESGLOSE DE COSTOS                  │
│ ┌─────────────────────────────────┐ │
│ │ 👥 Personal        $1,500.00    │ │
│ │ 🔧 Licencias       $500.00      │ │
│ │ 🖥️ Infraestructura $200.00      │ │
│ │ 📦 Servicios       $150.00      │ │
│ │                                 │ │
│ │ [+ Registrar costo]             │ │
│ └─────────────────────────────────┘ │
│                                     │
│ PROGRESO                            │
│ ████████████████░░░░░░░░░░░  65%    │
│ 8/12 tareas completadas             │
│                                     │
│ FECHAS                              │
│ 📅 Inicio: 01 Dic 2024              │
│ 📅 Fin estimado: 15 Ene 2025        │
└─────────────────────────────────────┘
```

### 4. Componentes Nuevos a Crear

| Componente | Ubicación | Propósito |
|------------|-----------|-----------|
| `TaskDetailModal.tsx` | `components/admin/tasks/` | Vista completa de tarea |
| `TaskDescription.tsx` | `components/admin/tasks/` | Editor/Viewer Markdown |
| `TaskComments.tsx` | `components/admin/tasks/` | Sistema de comentarios |
| `TaskHistory.tsx` | `components/admin/tasks/` | Activity log |
| `TaskMedia.tsx` | `components/admin/tasks/` | Galería de archivos |
| `TaskAssignees.tsx` | `components/admin/tasks/` | Gestión de asignados |
| `TaskLabels.tsx` | `components/admin/tasks/` | Selector de etiquetas |
| `ProjectCosts.tsx` | `components/admin/tasks/` | Registro de costos |
| `ProjectFinanceSummary.tsx` | `components/admin/tasks/` | Resumen financiero |

---

## 🔔 Sistema de Notificaciones

### Tipos de Notificaciones Automáticas

| Trigger | Notificación | Destinatarios |
|---------|--------------|---------------|
| Tarea asignada | "X te asignó la tarea: Y" | Usuario asignado |
| Mención en comentario | "X te mencionó en: Y" | Usuario mencionado |
| Estado cambiado | "La tarea X cambió a: Estado" | Todos los asignados |
| Fecha vencimiento próxima | "La tarea X vence mañana" | Responsable |
| Tarea vencida | "La tarea X está vencida" | Responsable + Supervisor |
| Comentario nuevo | "Nuevo comentario en: X" | Otros asignados |
| Checklist item completado | "X completó: Item en Tarea" | Responsable (si otro completó) |
| Costo registrado | "Nuevo costo $X en proyecto Y" | Creador del proyecto |

### Triggers SQL

```sql
-- Trigger: Notificar cambio de estado
CREATE OR REPLACE FUNCTION notify_task_status_change()
RETURNS TRIGGER AS $$
DECLARE
    v_tarea_titulo VARCHAR;
    v_empresa_id INTEGER;
    v_autor_nombre VARCHAR;
    v_asignado_id INTEGER;
BEGIN
    IF OLD.estado = NEW.estado THEN RETURN NEW; END IF;
    
    SELECT titulo, empresa_id INTO v_tarea_titulo, v_empresa_id
    FROM wp_tareas WHERE id = NEW.id;
    
    -- Registrar en historial
    INSERT INTO wp_tareas_historial (tarea_id, accion, campo_modificado, valor_anterior, valor_nuevo, autor_id)
    VALUES (NEW.id, 'status_changed', 'estado', OLD.estado, NEW.estado, 
            (SELECT id FROM wp_team_humano WHERE auth_uid = auth.uid() LIMIT 1));
    
    -- Notificar a todos los asignados
    FOR v_asignado_id IN 
        SELECT team_humano_id FROM wp_tareas_asignados WHERE tarea_id = NEW.id
    LOOP
        INSERT INTO wp_notificaciones_team (
            tipo, mensaje, empresa_id, asesor_id, visto, fecha_envio, origen,
            metadata
        ) VALUES (
            'tarea_estado',
            'La tarea "' || v_tarea_titulo || '" cambió a: ' || NEW.estado,
            v_empresa_id,
            v_asignado_id,
            FALSE,
            NOW(),
            'trigger_tareas_v3',
            jsonb_build_object('tarea_id', NEW.id, 'estado_anterior', OLD.estado, 'estado_nuevo', NEW.estado)
        );
    END LOOP;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notify_task_status ON wp_tareas;
CREATE TRIGGER trigger_notify_task_status
    AFTER UPDATE OF estado ON wp_tareas
    FOR EACH ROW EXECUTE FUNCTION notify_task_status_change();
```

### Notificaciones en Frontend

```typescript
// types/notification.ts (extensión)
export type NotificationType = 
  | 'tarea_asignada'
  | 'tarea_mencion'
  | 'tarea_estado'
  | 'tarea_vencimiento'
  | 'tarea_vencida'
  | 'tarea_comentario'
  | 'tarea_item_completado'
  | 'proyecto_costo';

// Hook para escuchar notificaciones en tiempo real
const useTaskNotifications = () => {
  useEffect(() => {
    const channel = supabase
      .channel('task-notifications')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'wp_notificaciones_team',
        filter: `asesor_id=eq.${userId}`
      }, (payload) => {
        // Mostrar toast notification
        showNotification(payload.new);
      })
      .subscribe();
      
    return () => supabase.removeChannel(channel);
  }, [userId]);
};
```

---

## 📦 Tipos TypeScript v3

### Archivo: `types/tasks-v3.ts`

```typescript
// ============================================================================
// TASK MANAGEMENT V3
// ============================================================================

import { Task, TaskItem, TaskStatus, TaskPriority, Project } from './contact';

// Media attachments
export interface TaskMedia {
  id: number;
  tarea_id: number;
  nombre_archivo: string;
  tipo_mime: string;
  tamaño_bytes: number;
  storage_path: string;
  url_publica?: string | null;
  descripcion?: string | null;
  es_portada: boolean;
  subido_por?: number | null;
  created_at: string;
  
  // Joined
  uploader?: { id: number; nombre: string; apellido: string } | null;
}

// Etiquetas vinculadas
export interface TaskLabel {
  tarea_id: number;
  etiqueta_id: number;
  created_at: string;
  
  // Joined
  etiqueta: {
    id: number;
    nombre: string;
    color: string;
  };
}

// Historial de actividad
export type HistoryAction = 
  | 'created'
  | 'status_changed'
  | 'assigned'
  | 'unassigned'
  | 'comment_added'
  | 'item_completed'
  | 'item_uncompleted'
  | 'label_added'
  | 'label_removed'
  | 'media_uploaded'
  | 'media_deleted'
  | 'due_date_changed'
  | 'priority_changed'
  | 'description_updated';

export interface TaskHistory {
  id: number;
  tarea_id: number;
  accion: HistoryAction;
  campo_modificado?: string | null;
  valor_anterior?: string | null;
  valor_nuevo?: string | null;
  autor_id?: number | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  
  // Joined
  autor?: { id: number; nombre: string; apellido: string } | null;
}

// Reacciones a comentarios
export type ReactionEmoji = '👍' | '❤️' | '🎉' | '😄' | '😮' | '🤔';

export interface CommentReaction {
  comentario_id: number;
  usuario_id: number;
  emoji: ReactionEmoji;
  created_at: string;
  
  // Joined
  usuario?: { id: number; nombre: string } | null;
}

// Costos de proyecto
export type CostCategory = 'personal' | 'licencias' | 'infraestructura' | 'servicios' | 'general';

export interface ProjectCost {
  id: number;
  proyecto_id: number;
  concepto: string;
  categoria: CostCategory;
  monto: number;
  moneda: string;
  tarea_id?: number | null;
  fecha_costo: string;
  registrado_por?: number | null;
  comprobante_url?: string | null;
  notas?: string | null;
  created_at: string;
  
  // Joined
  registrador?: { id: number; nombre: string; apellido: string } | null;
  tarea?: { id: number; titulo: string } | null;
}

// Extensión de Task para V3
export interface TaskV3 extends Task {
  descripcion_md?: string | null;
  portada_url?: string | null;
  tiempo_estimado_min?: number | null;
  tiempo_real_min?: number | null;
  costo_estimado?: number | null;
  costo_real?: number | null;
  moneda?: string;
  
  // Relaciones V3
  media?: TaskMedia[];
  etiquetas?: TaskLabel[];
  historial?: TaskHistory[];
  reacciones?: Record<number, CommentReaction[]>; // comentario_id -> reactions
}

// Extensión de Project para V3
export interface ProjectV3 extends Project {
  contacto_id?: number | null;
  servicio_id?: number | null;
  presupuesto?: number | null;
  gasto_actual?: number | null;
  moneda?: string;
  fecha_inicio?: string | null;
  fecha_fin_estimada?: string | null;
  fecha_fin_real?: string | null;
  
  // Relaciones
  contacto?: { id: number; nombre: string; apellido: string; telefono?: string } | null;
  servicio?: { id: number; nombre_servicio: string; valor_total: number } | null;
  costos?: ProjectCost[];
}

// Constantes
export const COST_CATEGORY_LABELS: Record<CostCategory, string> = {
  personal: 'Personal',
  licencias: 'Licencias',
  infraestructura: 'Infraestructura',
  servicios: 'Servicios Externos',
  general: 'General'
};

export const COST_CATEGORY_ICONS: Record<CostCategory, string> = {
  personal: 'Users',
  licencias: 'Key',
  infraestructura: 'Server',
  servicios: 'Package',
  general: 'Receipt'
};

export const REACTION_EMOJIS: ReactionEmoji[] = ['👍', '❤️', '🎉', '😄', '😮', '🤔'];

// Helpers
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
}

export function getCostCategoryIcon(category: CostCategory): string {
  return COST_CATEGORY_ICONS[category] || 'Receipt';
}
```

---

## 🚀 Fases de Implementación

### Fase 1: Base de Datos (2-3 días)
- [ ] Crear script SQL `TAREAS_V3_SCHEMA.sql`
- [ ] Migrar estructura existente
- [ ] Implementar RLS policies
- [ ] Crear triggers de notificación
- [ ] Testing de queries

### Fase 2: Store y Tipos (2-3 días)
- [ ] Actualizar `types/contact.ts` con tipos v3
- [ ] Crear `types/tasks-v3.ts`
- [ ] Actualizar `tareasStore.ts` con nuevas acciones
- [ ] Actualizar `proyectosStore.ts` con costos
- [ ] Implementar cache inteligente

### Fase 3: Componentes UI - Core (3-4 días)
- [ ] `TaskDetailModal.tsx` - Vista principal
- [ ] `TaskDescription.tsx` - Markdown editor/viewer
- [ ] `TaskChecklist.tsx` - Refactor con asignación
- [ ] `TaskAssignees.tsx` - Gestión de miembros

### Fase 4: Componentes UI - Features (3-4 días)
- [ ] `TaskComments.tsx` - Con menciones y reacciones
- [ ] `TaskHistory.tsx` - Activity log
- [ ] `TaskMedia.tsx` - Upload y galería
- [ ] `TaskLabels.tsx` - Selector de etiquetas

### Fase 5: Proyectos y Finanzas (2-3 días)
- [ ] `ProjectDetail.tsx` - Vista de proyecto
- [ ] `ProjectCosts.tsx` - Registro de costos
- [ ] `ProjectFinanceSummary.tsx` - Resumen financiero
- [ ] Vincular proyecto con contacto/servicio

### Fase 6: Notificaciones (1-2 días)
- [ ] Implementar triggers restantes
- [ ] Integrar con sistema de notificaciones existente
- [ ] Toast notifications en UI
- [ ] Badge counters

### Fase 7: Testing y Polish (2-3 días)
- [ ] Testing end-to-end
- [ ] Optimización de queries
- [ ] Responsive design mobile
- [ ] Documentación

---

## 📊 Métricas de Éxito

| Métrica | Objetivo |
|---------|----------|
| Tiempo de carga de detalle | < 500ms |
| Upload de archivos | < 3s para 5MB |
| Notificaciones en tiempo real | < 1s latencia |
| Adopción de comentarios | > 50% de tareas |
| Uso de etiquetas | > 70% de tareas |

---

## 📚 Referencias

- **Sistema actual v2**: `TAREAS_V2_FULL_DEPLOY.sql`
- **Tipos actuales**: `types/contact.ts` (líneas 781-1079)
- **Store actual**: `store/tareasStore.ts`
- **Componentes actuales**: `components/admin/tasks/`
- **Finanzas**: `types/finance.ts`

---

*Documento creado: 26 Dic 2024*
*Versión: 3.0-draft*
