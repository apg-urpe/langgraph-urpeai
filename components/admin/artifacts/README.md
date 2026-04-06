# Artefactos - Módulo Lab

> **Status**: Lab (Experimental)  
> **Versión**: 1.0.0

Vista de gestión de artefactos generados por Monica en el sistema.

## Características

| Feature | Descripción |
|---------|-------------|
| **Listado** | Grid de artefactos del usuario |
| **Búsqueda** | Por título y contenido |
| **Filtros** | Por tipo y favoritos |
| **Preview** | Vista previa del contenido |
| **Acciones** | Abrir, marcar favorito |

## Componentes

- `ArtifactsView.tsx` - Vista principal con grid de artefactos

## Dependencias

- `artifactStore.ts` - Estado de artefactos (Zustand)
- `types/artifact.ts` - Tipos TypeScript
- `ArtifactPanel.tsx` - Panel de visualización/edición

## Uso

Acceso desde: **Lab → Artefactos**

## Flujo

1. Usuario abre la vista
2. Se cargan artefactos del usuario via `fetchArtifacts`
3. Usuario puede filtrar/buscar
4. Click en artefacto → abre `ArtifactPanel` para preview/edición
