# Monica Deep Research

> Buscador avanzado con Firecrawl Agent para investigación profunda en la web.

## Descripción

**Monica Deep Research** es una característica que permite realizar investigaciones profundas en la web usando Firecrawl Agent. Los resultados se guardan automáticamente como artefactos y se notifica al usuario cuando la investigación está completa.

## Características

| Característica | Descripción |
|----------------|-------------|
| 🔍 **Búsqueda Avanzada** | Describe lo que necesitas y el agente busca en toda la web |
| 🌐 **Sin URLs Requeridas** | Solo describe lo que buscas, las URLs son opcionales |
| 📦 **Resultados como Artefactos** | Los resultados se guardan automáticamente en "Mis Artefactos" |
| ✨ **Formato con Gemini** | Los resultados son formateados por Gemini 3 Flash para máxima legibilidad |
| 🔔 **Notificaciones** | Alerta cuando la investigación está completa |
| ⚡ **Segundo Plano** | Funciona en segundo plano mientras sigues trabajando |
| 💜 **Tema Morado** | UI minimalista con tema morado distintivo |

## Arquitectura

### Diagrama de Flujo (con Webhooks)

```
┌─────────────────────────────────────────────────────────────────┐
│                    CLIENTE (Browser)                              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  🔍 Deep Research Panel                                   │   │
│  │  ┌────────────────────────────────────────────────────┐  │   │
│  │  │ Input: "¿Qué deseas investigar?"                   │  │   │
│  │  └────────────────────────────────────────────────────┘  │   │
│  │  [Buscar] → Inicia búsqueda                              │   │
│  │  💡 "Puedes cerrar esta pestaña, la búsqueda continuará" │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 POST /api/deep-research                          │
│  1. Guarda job en DB (wp_deep_research) con status='queued'     │
│  2. Llama a Firecrawl Agent API con webhook URL                 │
│  3. Retorna inmediatamente con status='processing'              │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┴─────────────────────┐
        │                                           │
        ▼                                           ▼
┌───────────────────┐                   ┌─────────────────────────┐
│ Cliente: Polling  │                   │ FIRECRAWL AGENT         │
│ (fallback 30s)    │                   │ - Investiga en la web   │
│ GET /api/deep-... │                   │ - Puede tardar 15+ min  │
└───────────────────┘                   └─────────────────────────┘
                                                    │
                                                    ▼ (cuando termina)
                              ┌─────────────────────────────────────┐
                              │   POST /api/deep-research/webhook   │
                              │   (Server-side processing)          │
                              │   1. Actualiza job status en DB     │
                              │   2. Crea Artifact automáticamente  │
                              │   3. Crea Notificación in-app       │
                              └─────────────────────────────────────┘
                                                    │
        ┌───────────────────────────────────────────┘
        ▼
┌─────────────────────────────────────────────────────────────────┐
│                    RESULTADO FINAL                               │
│  ✅ Job completado en DB                                         │
│  📦 Artifact guardado (visible en "Mis Artefactos")             │
│  🔔 Notificación creada (visible en campana de notificaciones)  │
│  📲 Browser notification (si permisos concedidos)               │
└─────────────────────────────────────────────────────────────────┘
```

### Beneficios de la Arquitectura Webhook

| Característica | Antes (Polling) | Ahora (Webhook) |
|----------------|-----------------|-----------------|
| **Cierre de pestaña** | ❌ Pierde polling | ✅ Webhook continúa |
| **Artifact creación** | Client-side | Server-side |
| **Notificación** | Client-side | Server-side |
| **Max duración** | 60 min (polling) | Ilimitado (webhook) |
| **Eficiencia** | Polling cada 10s | Solo 1 callback |

## Componentes

### Archivos Creados

| Archivo | Propósito |
|---------|-----------|
| `types/deep-research.ts` | Tipos e interfaces para Deep Research |
| `store/deepResearchStore.ts` | Estado global y acciones para búsquedas |
| `app/api/deep-research/route.ts` | API endpoint POST/GET para jobs |
| `app/api/deep-research/webhook/route.ts` | **Webhook** para callbacks de Firecrawl |
| `lib/research-formatter.server.ts` | **Formateador con Gemini 3 Flash** para convertir resultados a Markdown legible |
| `components/DeepResearchPanel.tsx` | UI del buscador con tema morado |
| `components/DeepResearchNotifications.tsx` | Notificaciones visuales de completado |
| `scripts/DEEP_RESEARCH_SCHEMA.sql` | Schema SQL para tabla `wp_deep_research` |

### Archivos Modificados

| Archivo | Cambio |
|---------|--------|
| `components/Sidebar.tsx` | Integración del DeepResearchPanel |
| `types/artifact.ts` | Añadido tipo 'research' a ArtifactType |
| `components/ArtifactSidebar.tsx` | Icono Sparkles para tipo research |
| `app/page.tsx` | DeepResearchNotifications en layout |
| `.env.example` | FIRECRAWL_API_KEY |

## Configuración

### Variables de Entorno

```env
# Firecrawl API (Deep Research / Web Scraping)
FIRECRAWL_API_KEY=your_firecrawl_api_key
```

### Obtener API Key

1. Visita [firecrawl.dev](https://firecrawl.dev)
2. Crea una cuenta o inicia sesión
3. Ve a "API Keys" en el dashboard
4. Copia tu API key y añádela a `.env.local`

## Uso

### Desde el Sidebar

1. Expande el panel "Deep Research" en el menú lateral
2. Escribe tu consulta de investigación
3. Presiona Enter o el botón de búsqueda
4. Espera a que se complete (funciona en segundo plano)
5. Recibirás una notificación cuando esté listo
6. El resultado aparecerá en "Mis Artefactos"

### Ejemplos de Consultas

```
"Encuentra las 5 startups de IA más prometedoras de 2024 y su financiación"

"Compara los precios y características de Slack vs Microsoft Teams"

"Extrae información de contacto de empresas de tecnología en México"

"Resume los últimos artículos sobre web scraping y automatización"
```

## API Reference

### POST /api/deep-research

Inicia una nueva investigación.

**Request:**
```json
{
  "prompt": "Find the founders of Firecrawl",
  "urls": ["https://firecrawl.dev"],  // Opcional
  "schema": { ... },  // Opcional - JSON Schema
  "jobId": "research-123",
  "userId": "user-uuid"
}
```

**Response:**
```json
{
  "success": true,
  "firecrawlJobId": "fc-job-123",
  "status": "processing"
}
```

### GET /api/deep-research?jobId=xxx

Consulta el estado de una investigación.

**Response (Processing):**
```json
{
  "success": true,
  "status": "processing"
}
```

**Response (Completed):**
```json
{
  "success": true,
  "status": "completed",
  "data": { ... },
  "creditsUsed": 15,
  "expiresAt": "2024-12-15T00:00:00.000Z"
}
```

## Store (Zustand)

### Estado

```typescript
interface DeepResearchState {
  jobs: DeepResearchJob[];
  activeJobId: string | null;
  panel: DeepResearchPanelState;
  isSubmitting: boolean;
  error: string | null;
}
```

### Acciones Principales

```typescript
// Iniciar una investigación
startResearch(userId: string, payload: CreateResearchPayload): Promise<string | null>

// Cancelar una investigación
cancelResearch(jobId: string): void

// Consultar estado de un job
pollJobStatus(jobId: string): Promise<void>
```

### Selectores

```typescript
selectJobs(state)           // Todos los jobs
selectActiveJobs(state)     // Jobs en proceso
selectCompletedJobs(state)  // Jobs completados
selectHasActiveJobs(state)  // ¿Hay jobs activos?
selectRecentJobs(state)     // Últimos 10 jobs
```

## Eventos

### deep-research-complete

Se dispara cuando una investigación se completa exitosamente.

```typescript
window.addEventListener('deep-research-complete', (event: CustomEvent) => {
  const { jobId, artifactId, prompt } = event.detail;
  // Abrir artefacto, mostrar notificación, etc.
});
```

## Notificaciones

### Browser Notifications

El sistema solicita permisos para notificaciones del navegador. Cuando una investigación se completa:

1. Se muestra una notificación del navegador (si está permitido)
2. Se muestra una notificación en la UI (siempre)
3. Al hacer clic, se abre el artefacto resultado

## Costos y Límites

### Pricing de Firecrawl

- **5 runs gratis/día** para explorar
- Pricing dinámico basado en complejidad
- Ver créditos usados en cada resultado

### Recomendaciones

- Sé específico en tus consultas para reducir costos
- Usa URLs específicas si conoces las fuentes
- Monitorea el uso de créditos

## Troubleshooting

### "Servicio de investigación no configurado"

Verifica que `FIRECRAWL_API_KEY` está configurado en `.env.local`.

### "Error al iniciar la investigación"

1. Verifica tu API key de Firecrawl
2. Revisa que tienes créditos disponibles
3. Verifica la consola del navegador para más detalles

### "Tiempo de espera agotado"

Con la nueva arquitectura webhook, las investigaciones pueden tardar más de 15 minutos sin problema. Si ves este error:
1. Verifica que `NEXT_PUBLIC_APP_URL` esté configurado correctamente para que Firecrawl pueda llamar al webhook
2. El webhook requiere que la URL sea accesible desde Internet (no funciona en localhost sin túnel)

### El webhook no funciona en desarrollo local

El webhook requiere una URL pública. Opciones:
1. Usa [ngrok](https://ngrok.com) para exponer tu localhost
2. Configura `NEXT_PUBLIC_APP_URL` con la URL de ngrok
3. En producción (Vercel), funciona automáticamente

## Base de Datos

### Tabla `wp_deep_research`

```sql
-- Ejecutar en Supabase SQL Editor
-- Ver: scripts/DEEP_RESEARCH_SCHEMA.sql

CREATE TABLE IF NOT EXISTS public.wp_deep_research (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    local_job_id TEXT UNIQUE NOT NULL,
    user_id UUID NOT NULL,
    empresa_id BIGINT,
    prompt TEXT NOT NULL,
    urls TEXT[],
    schema JSONB,
    firecrawl_job_id TEXT,
    status TEXT NOT NULL DEFAULT 'queued',
    data JSONB,
    artifact_id UUID REFERENCES public.artifacts(id),
    credits_used INTEGER,
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Procesamiento con Gemini 3 Flash

Los resultados de Firecrawl (datos JSON crudos) son automáticamente procesados por **Gemini 3 Flash** para generar un documento Markdown legible y bien estructurado.

### Flujo de Formateo

```
Firecrawl Data (JSON) → Gemini 3 Flash → Markdown → Artifact (type: 'markdown')
```

### Características del Formateo

| Aspecto | Descripción |
|---------|-------------|
| **Estructura** | Encabezados jerárquicos (# ## ###) para secciones |
| **Listas** | Viñetas para elementos y tablas para datos comparables |
| **Enlaces** | URLs convertidas a formato `[texto](url)` |
| **Énfasis** | Negritas para términos importantes |
| **Código** | Backticks para valores técnicos |

### Fallback

Si Gemini no está disponible (API key faltante o error), el sistema usa un formateador básico que convierte el JSON a Markdown simple.

### Archivo Responsable

- `lib/research-formatter.server.ts` - Función `formatResearchWithGemini()`

## Roadmap

- [x] ~~Historial de investigaciones persistente~~ (Implementado con `wp_deep_research`)
- [x] ~~Webhooks para procesamiento server-side~~ (Implementado)
- [x] ~~Investigaciones de larga duración (+15 min)~~ (Implementado)
- [x] ~~Formateo inteligente con Gemini~~ (Implementado)
- [ ] Soporte para schemas personalizados en la UI
- [ ] Exportar resultados a diferentes formatos
- [ ] Templates de consultas frecuentes
