# Mi Email IA Module

> **Status**: Lab (Experimental)  
> **Versión**: 2.0.0  
> **Última actualización**: Enero 2025

Módulo experimental que permite buscar, visualizar y analizar correos electrónicos con IA desde el panel de administración.

## Filosofía de Diseño

- **Minimalismo**: Solo mostramos contenido relevante en markdown, sin el correo original
- **IA-First**: Al abrir un correo, se analiza automáticamente con Gemini
- **Auto-Mark as Read**: Los correos se marcan como leídos automáticamente al abrirlos
- **Preguntas Naturales**: Los usuarios pueden hacer preguntas sobre sus correos en lenguaje natural

## Características

| Feature | Descripción |
|---------|-------------|
| **Listado de correos** | Fetch de correos vía Nylas v3 API |
| **Búsqueda nativa** | Usa el motor de búsqueda de Gmail/Outlook |
| **Análisis IA automático** | Al abrir, categoriza, prioriza, resume y extrae tareas con Gemini |
| **Marcar como leído** | Auto-marca correos como leídos en Nylas al abrirlos |
| **Resumen ejecutivo** | Genera un resumen de los últimos 5 correos |
| **Preguntas al correo** | Hacer preguntas en lenguaje natural sobre los correos cargados |
| **Persistencia local** | Cache en localStorage para acceso offline |

## Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                 │
├─────────────────────────────────────────────────────────────────┤
│  components/admin/emails/                                        │
│  ├─ EmailInboxView.tsx      ← Vista principal                   │
│  ├─ EmailCard.tsx           ← Card de correo en lista           │
│  ├─ EmailDetailModal.tsx    ← Modal minimalista (solo resumen)  │
│  ├─ EmailQueryPanel.tsx     ← Preguntas al correo con IA        │
│  ├─ EmailSummaryCard.tsx    ← Card con resumen ejecutivo        │
│  └─ README.md               ← Documentación del componente      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                          STORE                                   │
├─────────────────────────────────────────────────────────────────┤
│  store/emailStore.ts (zustand + persist)                         │
│  ├─ emails: LocalEmail[]         ← Cache local de correos       │
│  ├─ analyses: Record<id, EmailAnalysis>  ← Análisis guardados   │
│  ├─ lastSummary: EmailSummary    ← Último resumen generado      │
│  └─ searchHistory: string[]      ← Historial de búsquedas       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         API ROUTES                               │
├─────────────────────────────────────────────────────────────────┤
│  app/api/emails/route.ts          ← GET: Lista de correos       │
│  app/api/emails/[emailId]/route.ts← GET: Detalle de correo      │
│  app/api/emails/[emailId]/mark-read/route.ts ← PUT: Marcar leído│
│  app/api/emails/analyze/route.ts  ← POST: Análisis con Gemini   │
│  app/api/emails/summary/route.ts  ← POST: Resumen de varios     │
│  app/api/emails/query/route.ts    ← POST: Preguntas al correo   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      EXTERNAL SERVICES                           │
├─────────────────────────────────────────────────────────────────┤
│  Nylas v3 API → Fetch de correos                                │
│  Google Gemini → Análisis y resumen con IA                      │
└─────────────────────────────────────────────────────────────────┘
```

## Tipos de Datos

### LocalEmail
```typescript
interface LocalEmail {
  id: string;              // ID de Nylas
  grantId: string;         // Grant del usuario
  subject: string;
  snippet: string;         // Preview corto
  body?: string;           // Cuerpo completo (on-demand)
  from: EmailParticipant[];
  to: EmailParticipant[];
  date: number;            // Unix timestamp
  unread: boolean;
  starred: boolean;
  hasAttachments: boolean;
  fetchedAt: number;       // Cuándo se guardó
}
```

### EmailAnalysis
```typescript
interface EmailAnalysis {
  emailId: string;
  categoria: 'ventas' | 'soporte' | 'interno' | 'personal' | 'marketing' | 'facturacion' | 'legal' | 'spam' | 'otro';
  prioridad: 'alta' | 'media' | 'baja';
  resumen: string;         // 2-3 oraciones
  tareas: string[];        // Acciones identificadas
  sentimiento: 'positivo' | 'neutral' | 'negativo';
  requiereRespuesta: boolean;
  palabrasClave: string[];
  analyzedAt: number;
}
```

## Configuración Requerida

### Variables de Entorno
```env
NYLAS_API_KEY=your_api_key
NYLAS_API_URI=https://api.us.nylas.com
GEMINI_API_KEY=your_gemini_key
```

### Requisitos de Usuario
El usuario debe tener un `grant_id` de Nylas configurado en su registro de `wp_team_humano`. Este grant se obtiene tras autenticar su cuenta de correo con Nylas.

## API Endpoints

### GET /api/emails
Lista correos del usuario.

**Parámetros:**
| Param | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `grant_id` | string | ✅ | ID del grant de Nylas |
| `limit` | number | ❌ | Máximo de resultados (default: 20) |
| `query` | string | ❌ | Búsqueda nativa |
| `unread` | boolean | ❌ | Solo no leídos |
| `received_after` | number | ❌ | Unix timestamp |
| `page_token` | string | ❌ | Paginación |

### GET /api/emails/[emailId]
Obtiene el cuerpo completo de un correo.

### POST /api/emails/analyze
Analiza un correo con Gemini.

**Body:**
```json
{
  "email_id": "abc123",
  "subject": "Propuesta comercial",
  "body": "Contenido del correo...",
  "from": "cliente@example.com"
}
```

### POST /api/emails/summary
Genera resumen de múltiples correos.

**Body:**
```json
{
  "emails": [
    { "id": "abc", "subject": "...", "snippet": "...", "from": "...", "date": 1234567890 }
  ]
}
```

## Flujo de Uso

1. **Acceso**: Menú Lab → Mi Email IA
2. **Sincronización**: Automática al abrir (si hay grant_id)
3. **Búsqueda**: Escribir en el buscador y presionar Enter
4. **Ver detalle**: Click en un correo
5. **Analizar**: Click en "Analizar con IA" en el modal
6. **Resumen**: Click en "Resumen IA" en el header

## Store Actions

```typescript
// Fetch
fetchEmails(grantId, enterpriseId, userId, params?)  // Obtener lista (todos requeridos)
fetchEmailBody(emailId)                              // Obtener body completo

// AI
analyzeEmail(emailId)             // Analizar con Gemini
generateSummary(count?)           // Resumen de últimos N
queryEmails(question)             // Preguntas al correo (retorna markdown)

// Actions
markAsRead(emailId)               // Marcar como leído en Nylas

// UI
selectEmail(emailId)              // Seleccionar correo
setSearchQuery(query)             // Cambiar búsqueda

// Cache
clearCache()                      // Limpiar todo
setGrantId(grantId)               // Cambiar grant
```

## Selectores

```typescript
selectEmails(state)               // Lista de correos
selectSelectedEmail(state)        // Correo seleccionado
selectEmailAnalysis(id)(state)    // Análisis de un correo
selectLastSummary(state)          // Último resumen
selectIsCacheFresh(state)         // ¿Cache válido?
selectUnreadCount(state)          // Conteo de no leídos
```

## Lógica de Negocio

### Prioridades (IA)
- **Alta**: Urgente, deadline cercano, problema crítico, cliente importante
- **Media**: Requiere acción pero no urgente
- **Baja**: Informativo, no requiere acción inmediata

### Categorías (IA)
- `ventas`: Oportunidades comerciales, cotizaciones, propuestas
- `soporte`: Tickets, problemas técnicos, quejas
- `interno`: Comunicaciones del equipo
- `personal`: Mensajes no laborales
- `marketing`: Newsletters, promociones
- `facturacion`: Facturas, pagos, cobranza
- `legal`: Contratos, términos, compliance
- `spam`: Correo no deseado
- `otro`: Sin clasificar

### Cache
- **Duración**: 5 minutos
- **Persistencia**: localStorage
- **Invalidación**: Al cambiar grant_id o refresh manual

## Archivos del Módulo

```
types/
└── email.ts                 # Tipos TypeScript

store/
└── emailStore.ts            # Zustand store con persist

app/api/emails/
├── route.ts                 # GET lista
├── [emailId]/route.ts       # GET detalle
├── analyze/route.ts         # POST análisis
└── summary/route.ts         # POST resumen

components/admin/emails/
├── EmailInboxView.tsx       # Vista principal
├── EmailCard.tsx            # Card en lista
├── EmailDetailModal.tsx     # Modal detalle
├── EmailSummaryCard.tsx     # Card resumen
└── README.md                # Docs del componente
```

## Flujo de Usuario v2

1. **Acceso**: Menú Lab → Mi Email IA
2. **Sincronización**: Automática al abrir (si hay grant_id)
3. **Búsqueda**: Escribir en el buscador y presionar Enter
4. **Preguntas IA**: Panel expandible para preguntas en lenguaje natural
5. **Ver correo**: Click en un correo → Auto-analiza con Gemini + Marca como leído
6. **Resultado**: Modal minimalista con solo el resumen IA (sin correo original)

## API Endpoints Nuevos (v2)

### PUT /api/emails/[emailId]/mark-read
Marca un correo como leído en Nylas.

**Query Params:**
- `grant_id` (requerido): ID del grant de Nylas

**Response:**
```json
{ "success": true, "message": "Email marcado como leído", "emailId": "xxx" }
```

### POST /api/emails/query
Hace preguntas en lenguaje natural sobre los correos cargados.

**Body:**
```json
{
  "question": "¿Qué facturas llegaron este mes?",
  "grant_id": "xxx",
  "emails": [{ "id": "...", "subject": "...", "snippet": "...", "from": "...", "date": 1234567890 }]
}
```

**Response:**
```json
{ "success": true, "answer": "# Resumen\n\nEncontré 3 facturas...", "emailsAnalyzed": 20 }
```

## Próximas Mejoras

- [x] ~~Marcar como leído/no leído desde la UI~~ ✅ v2.0
- [x] ~~Preguntas al correo con IA~~ ✅ v2.0
- [ ] Archivar correos
- [ ] Responder directamente desde el panel
- [ ] Webhooks para sincronización en tiempo real
- [ ] Filtros avanzados (por categoría, prioridad, fecha)
- [ ] Exportar análisis a tareas en el sistema
