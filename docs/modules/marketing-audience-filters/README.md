# 🎯 Filtros de Audiencia (Marketing)

> Sistema avanzado de segmentación de contactos para campañas de marketing

---

## 🎯 Propósito

El sistema de Filtros de Audiencia permite a los equipos de marketing crear segmentaciones dinámicas y estáticas de contactos basadas en múltiples criterios. Estas audiencias se utilizan para campañas de email automatizadas, reportes y análisis de cohortes.

---

## 🏗️ Arquitectura

### Database Schema

**Tabla Principal**: `wp_email_audiencias`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | bigserial | PK |
| `empresa_id` | bigint | FK multi-tenant |
| `nombre` | varchar(200) | Nombre de la audiencia |
| `descripcion` | text | Descripción opcional |
| `tipo` | enum | `'estatica'` \| `'dinamica'` |
| `filtros_json` | jsonb | Configuración de filtros (audiencias dinámicas) |
| `creado_por` | bigint | FK a `wp_team_humano` |
| `created_at` | timestamp | Fecha de creación |
| `updated_at` | timestamp | Última actualización |

**Tabla Relacional**: `wp_email_audiencia_contacto`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `audiencia_id` | bigint | FK a audiencia |
| `contacto_id` | bigint | FK a contacto |
| `created_at` | timestamp | Fecha de inclusión |

---

## 📦 Tipos de Datos

### FilterField
Campos disponibles para filtrar:
```typescript
type FilterField = 
  | 'created_at'           // Fecha de creación del contacto
  | 'ultima_interaccion'   // Última actividad
  | 'estado'               // Estado del contacto
  | 'etapa_embudo'         // Etapa en el funnel de ventas
  | 'es_calificado'        // Si está calificado
  | 'origen'               // Origen del lead
  | 'metadata'             // Campos personalizados JSON
  | 'team_humano_id'       // Asesor asignado
  | 'appointment_status'   // Estado de citas
  | 'portfolio_status'     // Estado de cartera
  | 'last_payment_date'    // Último pago
  | 'total_paid'           // Total pagado
  | 'total_pending'        // Total pendiente
  | 'service_type';        // Tipo de servicio contratado
```

### FilterOperator
Operadores disponibles:
```typescript
type FilterOperator = 
  | 'eq'        // Igual a
  | 'neq'       // No igual a
  | 'gt'        // Mayor que
  | 'lt'        // Menor que
  | 'gte'       // Mayor o igual que
  | 'lte'       // Menor o igual que
  | 'contains'  // Contiene texto
  | 'is_null'   // Es nulo
  | 'is_not_null'; // No es nulo
```

### FilterCondition
Condición individual:
```typescript
interface FilterCondition {
  id: string;           // UUID de la condición
  field: FilterField;   // Campo a filtrar
  operator: FilterOperator;
  value: string | number | boolean | null;
}
```

### AudienceFilters
Configuración completa de filtros:
```typescript
interface AudienceFilters {
  logic: 'AND' | 'OR';     // Lógica entre condiciones
  conditions: FilterCondition[];
}
```

---

## 🛠️ Componentes

### UI Components

| Componente | Ubicación | Propósito |
|------------|-----------|-----------|
| `FilterBuilder` | `components/admin/email-marketing/` | Constructor visual de filtros |
| `AudiencesTab` | `components/admin/email-marketing/` | Gestión de audiencias |
| `EditAudienceModal` | `components/admin/email-marketing/` | Crear/editar audiencia |

### Store Actions (`emailMarketingStore`)

| Acción | Descripción |
|--------|-------------|
| `previewAudienceCount(empresaId, filters)` | Obtiene conteo estimado de contactos |
| `previewAudienceContacts(empresaId, filters, limit)` | Muestra muestra de contactos que coinciden |
| `createAudience(payload)` | Crea nueva audiencia |
| `updateAudience(id, payload)` | Actualiza audiencia existente |
| `fetchAudiences(empresaId)` | Lista todas las audiencias |

---

## 🔧 Uso del Filter Builder

### Crear Audiencia Dinámica
1. Ir a **Marketing** → **Audiencias**
2. Click en "Nueva Audiencia"
3. Seleccionar tipo "Dinámica"
4. Configurar condiciones:
   ```
   (estado = 'cliente' AND ultima_interaccion > '2024-01-01')
   OR
   (etapa_embudo = 5 AND es_calificado = true)
   ```
5. Ver preview en tiempo real
6. Guardar audiencia

### Tipos de Audiencia

| Tipo | Descripción | Uso |
|------|-------------|-----|
| **Estática** | Lista fija de contactos seleccionados manualmente | Campañas puntuales, comunicados |
| **Dinámica** | Query que se evalúa en tiempo de ejecución | Campañas automatizadas, newsletters |

---

## 📊 Ejemplos de Filtros Comunes

### Clientes Activos
```json
{
  "logic": "AND",
  "conditions": [
    { "id": "1", "field": "estado", "operator": "eq", "value": "cliente" },
    { "id": "2", "field": "ultima_interaccion", "operator": "gte", "value": "2024-01-01" }
  ]
}
```

### Leads Calificados sin Asesor
```json
{
  "logic": "AND",
  "conditions": [
    { "id": "1", "field": "es_calificado", "operator": "eq", "value": true },
    { "id": "2", "field": "team_humano_id", "operator": "is_null" }
  ]
}
```

### Deudores (Cartera)
```json
{
  "logic": "AND",
  "conditions": [
    { "id": "1", "field": "total_pending", "operator": "gt", "value": 0 },
    { "id": "2", "field": "portfolio_status", "operator": "neq", "value": "al_dia" }
  ]
}
```

---

## 🔌 Integración con Campañas

Las audiencias se utilizan en campañas de email:

```typescript
// Crear campaña con audiencia
const campaign = await createCampaign({
  empresa_id: 123,
  nombre: 'Promoción Verano',
  audiencia_id: 456,  // ← ID de audiencia
  cadencia_dias: 7,
  total_toques: 3
});
```

---

## 🎨 UI/UX

### FilterBuilder Features
- **Drag & drop** para reordenar condiciones
- **Preview en tiempo real** del conteo de contactos
- **Validación visual** de condiciones válidas
- **Modo avanzado** para edición JSON directa

### Estados Visuales
- 🟢 **Activa**: Audiencia válida con contactos
- 🟡 **Vacía**: Filtro válido pero sin resultados
- 🔴 **Inválida**: Error en configuración de filtros

---

## 📝 Notas de Implementación

- Las audiencias dinámicas se evalúan en tiempo real al enviar campañas
- Las estáticas requieren gestión manual de contactos
- El preview usa `COUNT(*)` optimizado para performance
- Las condiciones se traducen a queries SQL dinámicas

---

## 📚 Documentación Relacionada

- [Módulo de Marketing](../marketing/README.md)
- [Módulo de Contactos](../contacts/README.md)
- [Módulo de Finanzas](../finance/README.md)
