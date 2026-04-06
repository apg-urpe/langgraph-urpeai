# Funnel Configuration Module

Sistema de configuración de etapas del embudo de ventas para empresas.

## Arquitectura

### Componentes

| Componente | Propósito |
|------------|-----------|
| `FunnelConfigSection.tsx` | Vista principal que lista todas las etapas con opciones de CRUD y reordenamiento |
| `FunnelStageEditor.tsx` | Modal de edición completa con tabs para Básico, Instrucciones, Seguimiento y JSON |
| `FunnelKanbanView.tsx` | Vista Kanban de contactos por etapa (existente) |
| `FunnelTableView.tsx` | Vista tabla de contactos por etapa (existente) |

### Tipos (`types/contact.ts`)

```typescript
// Estructura del campo JSONB `descripcion`
interface FunnelStageDescripcion {
  titulo?: string;
  color?: string;          // Hex color e.g. "#10b981"
  icono?: string;          // Emoji
  que_es?: string;         // Descripción de la etapa
  instrucciones_agente?: string | { hacer: string[]; no_hacer: Array<{id, texto}> };
  acciones_agente?: string[];
  criterios_avance?: string[];
  entregables?: string[];
  senales?: Array<{ id: string; texto: string }>;
  condiciones_avance?: Array<{ id: string; campo: string; descripcion: string }>;
  nota_importante?: string;
  metadata?: Record<string, unknown>;
}

// Configuración de seguimientos automáticos
interface FunnelSeguimientoConfig {
  activo: boolean;
  horario: {
    inicio: string;        // "08:00"
    fin: string;           // "18:00"
    dias_permitidos: number[];  // [1,2,3,4,5] = Lun-Vie
  };
  seguimientos: Array<{
    numero: number;
    horas_espera: number;
    mensaje_template: string;
  }>;
}
```

### Store Actions (`contactStore.ts`)

| Acción | Descripción |
|--------|-------------|
| `createFunnelStage(payload)` | Crea nueva etapa |
| `updateFunnelStage(stageId, updates)` | Actualiza etapa existente |
| `deleteFunnelStage(stageId)` | Elimina etapa (solo si no tiene contactos) |
| `reorderFunnelStages(stageIds)` | Reordena etapas |

## Base de Datos

**Tabla**: `wp_empresa_embudo`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | bigserial | PK |
| `nombre_etapa` | varchar(100) | Nombre único por empresa |
| `orden_etapa` | integer | Posición en el embudo |
| `descripcion` | jsonb | Configuración para el agente IA |
| `empresa_id` | bigint | FK a `wp_empresa_perfil` |
| `configuracion_seguimiento` | jsonb | Config de seguimientos automáticos |
| `Respaldo` | json | Backup automático (trigger) |

### Constraints
- `UNIQUE(empresa_id, nombre_etapa)` - Nombres únicos por empresa
- `UNIQUE(empresa_id, orden_etapa)` - Orden único por empresa

### Triggers
- `trg_actualizar_fecha_wp_empresa_embudo` - Actualiza `fecha_actualizacion`
- `trg_respaldo_descripcion` - Crea backup en columna `Respaldo`
- `trg_auditoria_*` - Auditoría de cambios

## Uso

### Acceso
1. Ir a **Configuración** en el AdminPanel
2. Seleccionar la tab **Embudo**
3. Ver/Crear/Editar/Eliminar etapas

### Permisos
- **Roles 1, 2**: Pueden crear, editar, eliminar y reordenar etapas
- **Rol 3+**: Solo lectura

### Crear Nueva Etapa
1. Click en "Nueva Etapa"
2. Completar información básica (nombre, color, icono)
3. Agregar instrucciones para el agente IA
4. Configurar seguimientos automáticos (opcional)
5. Guardar

### Editar Etapa Existente
1. Click en el icono de lápiz
2. Modificar en cualquiera de las tabs:
   - **Básico**: Nombre, color, icono, descripción
   - **Instrucciones**: Comportamiento del agente IA, acciones, criterios
   - **Seguimiento**: Mensajes automáticos de follow-up
   - **JSON**: Edición directa del JSON
3. Guardar

### Reordenar Etapas
- Usar las flechas arriba/abajo en cada etapa
- El orden se persiste automáticamente

## Flujo de Datos

```
SettingsView
    └── FunnelConfigSection
            ├── fetchFunnelStages() → contactStore → Supabase
            ├── createFunnelStage() → contactStore → Supabase
            ├── updateFunnelStage() → contactStore → Supabase
            └── FunnelStageEditor (Modal)
                    ├── Tab Básico: nombre, color, icono
                    ├── Tab Instrucciones: IA config
                    ├── Tab Seguimiento: auto-followup
                    └── Tab JSON: raw editing
```

## Integración con Agente IA

El campo `descripcion` es leído por n8n/agente para determinar:
1. **Cómo responder** al contacto en esta etapa
2. **Qué acciones tomar** (ej: agendar cita, escalar)
3. **Cuándo avanzar** al contacto a la siguiente etapa

## Modo Observación

Las acciones de escritura están bloqueadas cuando un usuario del Dev Team (Rol 1) está en modo observación viendo una empresa que no es la suya.
