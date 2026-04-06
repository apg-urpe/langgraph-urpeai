# Reporte de Hallazgos: Sistema de Renderizado y Filtrado de Equipos

Este documento detalla la arquitectura técnica y el funcionamiento del sistema de renderizado del chat de Monica y la integración de filtros por equipo en el Dashboard.

## 1. Sistema de Renderizado del Chat (Monica)

El sistema utiliza un enfoque basado en bloques dinámicos (UI Blocks) siguiendo el **Protocolo v5**.

### Componentes Core
- **`SafeBlockRenderer.tsx`**: Actúa como un *Error Boundary* y validador. Utiliza `BlockValidator.ts` para asegurar que el JSON recibido del LLM sea correcto antes de intentar renderizarlo.
- **`VisualRenderer.tsx`**: Es el selector principal. Mapea el `type` del bloque (kpi_card, chart, table, form, etc.) al componente React correspondiente.
- **`ActionBlock.tsx`**: Especializado en renderizar botones de acción sugeridos por Monica, utilizando `BlockActions.tsx` para la disposición visual.
- **`ArtifactPanel.tsx`**: Gestiona la visualización de contenido complejo (HTML, Código, Documentos) en un panel lateral o modal, con soporte para edición visual.

### Estilo y Temas (`CardPalette.ts`)
Se implementa una paleta de colores minimalista de alto contraste con:
- **Temas**: `success`, `warning`, `error`, `info`, `special`, `neutral`, `primary`.
- **Efectos**: Glass morphism (transparencias), bordes interactivos y efectos *glow* (resplandor) basados en el estado del tema.

---

## 2. Gestión de Equipos (Team Humano)

La segmentación por equipos permite filtrar toda la analítica y gestión de contactos según la estructura organizacional.

### Grupos Lógicos (`TeamGroup`)
Definidos en `adminStore.ts` y filtrados en `team-filters.ts`:
1.  **Asesores**: Miembros con rol 'asesor' o `role_id: 3`.
2.  **Supervisores**: Miembros con rol 'supervisor' o `role_id: 2`.
3.  **Liderazgo**: Miembros con rol 'dueño'/'admin' o `role_id: 1`.
4.  **Activos/Inactivos**: Basado en el campo `is_active`.

### Componente de Filtrado (`TeamMemberFilter.tsx`)
- Permite selección individual o por grupos completos.
- **Restricción de Seguridad**: Si el usuario tiene `role_id: 3` (Asesor), el filtro se bloquea automáticamente a su propio ID, impidiendo ver datos de otros compañeros.

---

## 3. Integración en el Dashboard

El flujo de datos desde el filtro hasta la visualización es el siguiente:

1.  **Estado Global**: `adminStore.ts` guarda `globalTeamMemberIds`.
2.  **Hook de Datos**: `useAdminMetrics.ts` consume estos IDs mediante el hook `useCombinedTeamFilter`.
3.  **Consultas a Base de Datos**: El hook inyecta una cláusula `.in('team_humano_id', effectiveTeamMemberIds)` en todas las consultas de Supabase (contactos, citas, mensajes, etc.).
4.  **Actualización Reactiva**: Cambiar un filtro en la UI invalida la caché del dashboard y dispara un nuevo *fetch* de métricas segmentadas.

## 4. Documentación de Referencia
- **Protocolo UI**: `docs/core/UI_DYNAMIC_PROTOCOL_v5.md`
- **Arquitectura de Datos**: `docs/architecture/data-model.md`
- **Guía de Estilo**: `docs/contributing/code-style.md`
