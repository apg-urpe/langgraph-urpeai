# Email Marketing Module

> **Ubicación**: Menu Lab → "Email Marketing"  
> **Estado**: MVP Completo

## Descripción

Módulo completo para gestión de audiencias, campañas de email marketing, historial de envíos y analíticas. Permite crear segmentos de contactos reutilizables en múltiples campañas.

## Arquitectura

### Componentes

| Archivo | Propósito |
|---------|-----------|
| `EmailMarketingView.tsx` | Vista principal con 4 tabs |
| `AudiencesTab.tsx` | Lista de audiencias + preview contactos |
| `CampaignsTab.tsx` | Lista de campañas con estados |
| `SendsTab.tsx` | Historial de envíos con filtros |
| `AnalyticsTab.tsx` | Métricas y estadísticas |
| `CreateAudienceModal.tsx` | Crear audiencia (3 pasos) |
| `EditAudienceModal.tsx` | Editar audiencia + vista previa contactos |
| `CreateCampaignModal.tsx` | Crear campaña (3 pasos) |
| `EditCampaignModal.tsx` | Editar campaña + cambiar estado |
| `FilterBuilder.tsx` | Constructor visual de filtros |
| `ContactSelector.tsx` | Selector de contactos para audiencias estáticas |

### Store

- **`store/emailMarketingStore.ts`**: Estado global
  - `fetchAudiences` / `createAudience` / `updateAudience` / `deleteAudience`
  - `fetchCampaigns` / `createCampaign` / `updateCampaign` / `deleteCampaign`
  - `previewAudienceCount` / `previewAudienceContacts`

### Tipos

- **`types/marketing.ts`**: 
  - `MarketingAudience` - Contenedor de audiencias
  - `AudienceContact` - Relación audiencia-contacto
  - `MarketingCampaignV2` - Campañas con estados
  - `CampaignEnrollment` - Inscripciones de contactos

### Base de Datos

| Script | Contenido |
|--------|-----------|
| `MARKETING_AUDIENCIAS_SCHEMA.sql` | Audiencias y relaciones |
| `EMAIL_ENVIOS_SCHEMA.sql` | Historial de envíos |

## Estados de Campaña

| Estado | Descripción |
|--------|-------------|
| `borrador` | Campaña en edición |
| `activa` | Enviando emails según cadencia |
| `pausada` | Detenida temporalmente |
| `archivada` | Completada o descartada |

## Estados de Envío

| Estado | Descripción |
|--------|-------------|
| `enviado` | Email enviado al servidor |
| `entregado` | Confirmación de entrega |
| `abierto` | Email abierto por destinatario |
| `click` | Click en enlace del email |
| `rebotado` | Email rechazado |
| `fallido` | Error en envío |

## Filtros de Audiencia Dinámica

### Campos Directos (wp_contactos)

| Campo | Operadores |
|-------|------------|
| Fecha creación | después de, antes de, entre |
| Última interacción | hace menos/más de X días |
| Estado | igual a, diferente de |
| Etapa embudo | igual a, vacío |
| Es calificado | sí, no, evaluando |
| Origen | contiene, igual a |
| Asesor asignado | igual a, vacío |

### Campos Cross-Table (Tablas Relacionadas)

| Campo | Valores | Tabla Origen |
|-------|---------|--------------|
| **Estado de Cita** | Con Citas Completadas, Programadas, Confirmadas, Canceladas, Sin Ninguna Cita | `wp_citas` |
| **Estado de Cartera** | Con Saldo Pendiente, Al Día, Sin Servicios | `wp_crm_servicios` |

#### Implementación Técnica
Los filtros cross-table usan un **two-query pattern**:
1. Primera query: Obtener IDs de contactos que cumplen la condición en la tabla relacionada
2. Segunda query: Filtrar `wp_contactos` usando `.in('id', contactIds)` o `.not('id', 'in', ...)`

Esto es necesario porque **PostgREST no soporta subqueries inline**.

#### Aislamiento Multi-Tenant
Todas las consultas cross-table incluyen filtro por `empresa_id` para garantizar aislamiento de datos entre empresas.

## Seguridad

- **RLS Policies**: Datos solo visibles para empresa propietaria
- **Roles**: Solo roles 1-2 pueden crear/editar
- **Aislamiento**: Filtro por `empresa_id` en todas las queries

## Flujo de Uso

```
1. Crear Audiencia
   → Nombre + Tipo (Dinámica/Estática)
   → Configurar filtros o seleccionar contactos
   → Vista previa de contactos

2. Crear Campaña
   → Nombre + Descripción
   → Seleccionar audiencia
   → Configurar cadencia + instrucciones IA

3. Activar Campaña
   → Cambiar estado a "Activa"
   → Los envíos aparecen en tab Envíos

4. Monitorear
   → Ver estadísticas en tab Analíticas
   → Filtrar envíos por estado/campaña/audiencia
```

## Archivos Relacionados

- `scripts/MARKETING_AUDIENCIAS_SCHEMA.sql`
- `scripts/EMAIL_ENVIOS_SCHEMA.sql`
- `types/marketing.ts`
- `store/emailMarketingStore.ts`
