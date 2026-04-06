# Mi Email IA Module

Módulo experimental del Lab que permite buscar, visualizar y analizar correos electrónicos con IA.

## Características

1. **Listado de correos** - Fetch de correos vía Nylas v3
2. **Búsqueda nativa** - Usa el motor de búsqueda de Gmail/Outlook
3. **Análisis IA** - Categorización, prioridad, resumen y extracción de tareas con Gemini
4. **Resumen ejecutivo** - Genera un resumen de los últimos 5 correos
5. **Persistencia local** - Cache en localStorage para acceso offline

## Componentes

| Componente | Descripción |
|------------|-------------|
| `EmailInboxView.tsx` | Vista principal con lista y búsqueda |
| `EmailCard.tsx` | Card de correo individual en la lista |
| `EmailDetailModal.tsx` | Modal con detalle completo y análisis IA |
| `EmailSummaryCard.tsx` | Card expandible con resumen IA |

## Dependencias

- **Nylas v3 API** - Para obtener correos (`NYLAS_API_KEY`, `NYLAS_API_URI`)
- **Google Gemini** - Para análisis IA (`GEMINI_API_KEY`)
- **Zustand + persist** - Estado local persistente

## Flujo de datos

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  EmailInboxView │────▶│   emailStore.ts  │────▶│  /api/emails/*  │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │                        │
                               ▼                        ▼
                        ┌──────────────┐          ┌──────────┐
                        │ localStorage │          │  Nylas   │
                        │   (cache)    │          │  Gemini  │
                        └──────────────┘          └──────────┘
```

## Uso

1. El usuario debe tener `grant_id` configurado en su perfil de `wp_team_humano`
2. Acceder desde el menú **Lab > Mi Email IA**
3. Los correos se cargan automáticamente al abrir la vista
4. Click en un correo para ver detalle
5. Click en "Analizar con IA" para obtener categoría, prioridad y tareas
6. Click en "Resumen IA" para generar resumen de los últimos 5 correos

## API Endpoints

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/emails` | GET | Lista de correos |
| `/api/emails/[emailId]` | GET | Detalle de un correo |
| `/api/emails/analyze` | POST | Analizar correo con IA |
| `/api/emails/summary` | POST | Generar resumen de varios correos |

## Configuración requerida

```env
NYLAS_API_KEY=your_api_key
NYLAS_API_URI=https://api.us.nylas.com
GEMINI_API_KEY=your_gemini_key
```

## Permisos

El usuario necesita:
- `grant_id` de Nylas vinculado a su cuenta de correo
- Este ID se obtiene tras autenticar con Nylas y se guarda en `wp_team_humano.grant_id`
