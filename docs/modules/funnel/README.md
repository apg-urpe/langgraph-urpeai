# 📊 Módulo de Embudo de Ventas (Funnel)

> Gestión de pipeline de ventas con etapas configurables e instrucciones para IA

---

## 🎯 Propósito

El módulo de Embudo permite a las empresas definir y gestionar su pipeline de ventas personalizado, con etapas que guían tanto a los agentes humanos como al agente IA de Monica en el proceso de conversión de leads a clientes.

---

## 🏗️ Arquitectura

### Database Schema

**Tabla Principal**: `wp_empresa_embudo`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | bigserial | PK |
| `nombre_etapa` | varchar(100) | Nombre único por empresa |
| `orden_etapa` | integer | Posición en el embudo (1, 2, 3...) |
| `descripcion` | jsonb | Configuración rica para el agente IA |
| `empresa_id` | bigint | FK multi-tenant |
| `configuracion_seguimiento` | jsonb | Mensajes de follow-up automáticos |
| `created_at` | timestamp | Fecha de creación |
| `fecha_actualizacion` | timestamp | Última modificación |

### Constraints
- `UNIQUE(empresa_id, nombre_etapa)` - Nombres únicos por empresa
- `UNIQUE(empresa_id, orden_etapa)` - Orden único por empresa

### Triggers
- `trg_actualizar_fecha_wp_empresa_embudo` - Auto-update `fecha_actualizacion`
- `trg_respaldo_descripcion` - Backup automático en columna `Respaldo`

---

## 📦 Tipos de Datos

### FunnelStage
```typescript
interface FunnelStage {
  id: number;
  nombre_etapa: string;
  orden_etapa: number;
  descripcion: FunnelStageDescripcion;
  configuracion_seguimiento?: FunnelSeguimientoConfig;
  empresa_id: number;
  created_at: string;
}
```

### FunnelStageDescripcion (JSONB)
```typescript
interface FunnelStageDescripcion {
  titulo?: string;
  color?: string;          // Hex color e.g. "#10b981"
  icono?: string;          // Emoji para visualización
  que_es?: string;         // Descripción de la etapa
  instrucciones_agente?: string | {
    hacer: string[];
    no_hacer: Array<{ id: string; texto: string }>;
  };
  acciones_agente?: string[];
  criterios_avance?: string[];
  entregables?: string[];
  senales?: Array<{ id: string; texto: string }>;
  condiciones_avance?: Array<{ id: string; campo: string; descripcion: string }>;
  nota_importante?: string;
  metadata?: Record<string, unknown>;
}
```

### FunnelSeguimientoConfig
```typescript
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

---

## 🛠️ Componentes

### UI Components

| Componente | Ubicación | Propósito |
|------------|-----------|-----------|
| `FunnelConfigSection` | `components/admin/funnel/` | Vista principal de configuración |
| `FunnelStageEditor` | `components/admin/funnel/` | Modal de edición de etapas |
| `ContactsFunnelView` | `components/admin/` | Vista Kanban de contactos por etapa |

### Store Actions (`contactStore.ts`)

| Acción | Descripción | Retorno |
|--------|-------------|---------|
| `fetchFunnelStages()` | Carga todas las etapas de la empresa | `FunnelStage[]` |
| `createFunnelStage(payload)` | Crea nueva etapa | `boolean` |
| `updateFunnelStage(id, updates)` | Actualiza etapa existente | `boolean` |
| `deleteFunnelStage(id)` | Elimina etapa (solo si sin contactos) | `boolean` |
| `reorderFunnelStages(ids)` | Reordena etapas | `boolean` |

---

## 🔌 Integración con Agente IA

El campo `descripcion` es leído por n8n/agente para determinar:

1. **Cómo responder** al contacto según su etapa actual
2. **Qué acciones tomar** (ej: agendar cita, escalar, enviar info)
3. **Cuándo avanzar** al contacto a la siguiente etapa
4. **Señales de progreso** que indican maduración del lead

### Ejemplo de Uso por IA
```typescript
// El agente consulta la etapa actual del contacto
const stage = await getContactFunnelStage(contactId);

// Usa las instrucciones para contextualizar su respuesta
const prompt = `
  El contacto está en etapa: ${stage.nombre_etapa}
  Instrucciones para esta etapa: ${stage.descripcion.instrucciones_agente}
  Acciones permitidas: ${stage.descripcion.acciones_agente?.join(', ')}
`;
```

---

## 👥 Permisos

| Rol | Capacidades |
|-----|-------------|
| **1 (Dev/Admin)** | CRUD completo, reordenar, eliminar |
| **2 (Team Lead)** | CRUD completo, reordenar |
| **3+ (Asesor)** | Solo lectura |

---

## 📱 Flujo de Uso

### Configuración (Roles 1-2)
1. Navegar a **Configuración** → **Embudo**
2. Crear etapas con el botón "Nueva Etapa"
3. Configurar:
   - **Básico**: Nombre, color, icono
   - **Instrucciones**: Comportamiento del agente IA
   - **Seguimiento**: Mensajes automáticos de follow-up
   - **JSON**: Edición avanzada
4. Reordenar con flechas arriba/abajo

### Uso en Contactos
1. En vista de contactos, ver Kanban por etapas
2. Mover contactos entre etapas arrastrando
3. Filtrar por etapa específica

---

## 🔗 Relaciones

```
wp_empresa_embudo (1)
    │
    ├─── N ── wp_contactos (etapa_embudo FK)
    │
    └─── N ── wp_crm_servicios (etapa_embudo_id FK)
```

---

## 🎨 Colores por Defecto

| Orden | Color | Hex |
|-------|-------|-----|
| 1 | Gris | `#6b7280` |
| 2 | Rojo | `#ef4444` |
| 3 | Naranja | `#f97316` |
| 4 | Ámbar | `#f59e0b` |
| 5 | Verde | `#10b981` |
| 6 | Azul | `#3b82f6` |
| 7 | Púrpura | `#8b5cf6` |
| 8 | Rosa | `#ec4899` |

---

## 📝 Notas de Implementación

- El orden de etapas es crítico: define el flujo de ventas
- Las etapas no se pueden eliminar si tienen contactos asignados
- El backup JSON en `Respaldo` permite recuperación de configuraciones
- Los seguimientos automáticos respetan el horario configurado

---

## 📚 Documentación Relacionada

- [Configuración de Empresa](../team/README.md)
- [Módulo de Contactos](../contacts/README.md)
- [Agente Monica AI](../monica-ai/README.md)
