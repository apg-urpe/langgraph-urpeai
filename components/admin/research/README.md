# Deep Research Module

> Vista de investigación avanzada con Firecrawl Agent integrada en el AdminPanel.

## Componentes

| Archivo | Descripción |
|---------|-------------|
| `DeepResearchView.tsx` | Vista principal con lista de trabajos y estado |
| `ResearchSearchCreate.tsx` | Input unificado con switch buscar/investigar |

## Características

- **Vista en AdminNavBar**: Icono Sparkles debajo de Calendario
- **Input unificado con switch**: Similar a TaskSearchCreate
  - **Modo Búsqueda** (🔍): Filtra investigaciones existentes
  - **Modo Investigación** (🌐): Inicia nueva investigación
- **Lista de trabajos**: Activos, Completados, Fallidos
- **Notificaciones in-app**: Integración con `wp_notificaciones_team`
- **Feedback visual**: Estados claros de procesamiento

## Flujo

```
1. Usuario hace clic en icono Sparkles (AdminNavBar)
2. Se abre DeepResearchView
3. Por defecto en modo "Buscar"
4. Click en icono 🌐 → Cambiar a modo "Investigar"
5. Escribe consulta → Enter o click Send
6. Job se crea y aparece en "En Proceso" con spinner
7. Polling cada 5s hasta completar
8. Al completar:
   - Se crea artefacto
   - Se crea notificación in-app
   - Job aparece en "Completadas"
9. Click "Ver resultado" → Abre artefacto
```

## Integración con Notificaciones

El tipo de notificación `deep_research` se añadió a:
- `types/notification.ts`
- `store/notificationsStore.ts` (initialStats)

Las notificaciones se crean en:
1. `ResearchSearchCreate.tsx` - Al iniciar investigación
2. `deepResearchStore.ts` - Al completar investigación
