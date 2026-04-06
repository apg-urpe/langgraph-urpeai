/**
 * API Route: /api/chat - Monica AI with Tools
 * 
 * Versión con UI Message Stream Protocol:
 * - Vercel AI SDK con streamText + toUIMessageStreamResponse()
 * - Tools habilitadas con multi-step support
 * - Soporte para attachments multimedia
 * 
 * @module app/api/chat/route
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { streamText, UIMessage, convertToModelMessages, stepCountIs } from 'ai';
import { z } from 'zod';
import { ChatRequestSchema, validateRequest } from '@/lib/api-schemas';
import docsIndex from '@/lib/docs-index.json';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

/**
 * Get user from Supabase - Hybrid authentication (cookies + header)
 * 1. First tries cookies (SSR standard)
 * 2. Falls back to Authorization header Bearer token
 */
async function getSupabaseUser(request: NextRequest) {
  // Method 1: Try cookies first (standard SSR approach)
  let response = NextResponse.next();
  const cookieSupabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  const { data: { user: cookieUser }, error: cookieError } = await cookieSupabase.auth.getUser();
  
  if (cookieUser && !cookieError) {
    logger.debug('[Auth] Authenticated via cookies');
    return { user: cookieUser, error: null };
  }

  // Method 2: Try Authorization header (Bearer token)
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    
    // Create a client and get user from token
    const tokenSupabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user: tokenUser }, error: tokenError } = await tokenSupabase.auth.getUser(token);
    
    if (tokenUser && !tokenError) {
      logger.debug('[Auth] Authenticated via Bearer token');
      return { user: tokenUser, error: null };
    }
    
    logger.warn('[Auth] Bearer token invalid:', tokenError?.message);
  }

  // Both methods failed
  logger.warn('[Auth] Both cookie and header auth failed. Cookie error:', cookieError?.message);
  return { user: null, error: cookieError || new Error('No valid authentication found') };
}

// Configuración centralizada de AI
import { google, GEMINI_MODEL, isGeminiConfigured, OPENROUTER_API_KEY, OPENROUTER_MODEL, OPENROUTER_API_URL } from '@/lib/ai/config';
import { verifyActiveTeamMember, getEffectiveEnterpriseId, isDevTeamRole, createSupabaseAdmin } from '@/lib/auth-security';
import { createOpenAI } from '@ai-sdk/openai';

import { MonicaRole, MonicaToolName } from '@/types/monica';
import { Attachment } from '@/types/chat';
import { ArtifactType, detectArtifactType, generateArtifactTitle } from '@/types/artifact';
import { formatCommitmentDayLabel, getLastConfirmedPaymentDate, getPortfolioAgingBucket, getPortfolioAgingLabel, getServiceCommitmentInfo } from '@/types/finance';
import { logger } from '@/lib/logger';

// Firecrawl API Config
const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY || '';
const FIRECRAWL_API_URL = 'https://api.firecrawl.dev/v1';

// E2B Code Execution Config
const E2B_API_KEY = process.env.E2B_API_KEY || '';

// Nylas Email API Config
const NYLAS_API_KEY = process.env.NYLAS_API_KEY || '';
const NYLAS_API_URI = process.env.NYLAS_API_URI || 'https://api.us.nylas.com';

// ============================================================================
// CONFIGURATION
// ============================================================================

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Modelo importado desde @/lib/ai/config
const DEFAULT_TIMEZONE = 'America/Lima';
const DEV_TEAM_ROLE_ID = 1;
const CHAT_ATTACHMENTS_CONTEXT_LIMIT = 5;
const CHAT_UPLOADS_BUCKET = 'chat-uploads';
const PAYMENT_RECEIPTS_BUCKET = 'comprobantes';
const ALLOWED_RECEIPT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const ARTIFACT_TYPES: ArtifactType[] = ['html', 'markdown', 'svg', 'mermaid', 'react', 'code', 'research'];

type FunnelStageRow = {
  id: number;
  nombre_etapa: string;
  descripcion?: unknown;
  orden_etapa: number | null;
};

function normalizeFunnelStageDescription(value: unknown): { color: string | null; icono: string | null; que_es: string | null; nota_importante: string | null; instrucciones_agente: string | null; acciones_agente: string[] | null; criterios_avance: string[] | null } | null {
  if (!value) return null;

  let parsedValue = value;
  if (typeof parsedValue === 'string') {
    try {
      parsedValue = JSON.parse(parsedValue);
    } catch {
      return null;
    }
  }

  if (typeof parsedValue !== 'object' || Array.isArray(parsedValue)) {
    return null;
  }

  const record = parsedValue as Record<string, unknown>;
  const readString = (field: string) => {
    const fieldValue = record[field];
    return typeof fieldValue === 'string' && fieldValue.trim().length > 0 ? fieldValue : null;
  };
  const readStringArray = (field: string) => {
    const fieldValue = record[field];
    return Array.isArray(fieldValue)
      ? fieldValue.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [];
  };

  return {
    color: readString('color'),
    icono: readString('icono'),
    que_es: readString('que_es'),
    nota_importante: readString('nota_importante'),
    instrucciones_agente: readString('instrucciones_agente'),
    acciones_agente: readStringArray('acciones_agente'),
    criterios_avance: readStringArray('criterios_avance')
  };
}

function formatFunnelStageForAgent(stage: FunnelStageRow) {
  const descripcion = normalizeFunnelStageDescription(stage.descripcion);
  const contextoAgente = [
    descripcion?.que_es ? `Qué es: ${descripcion.que_es}` : null,
    descripcion?.nota_importante ? `Nota importante: ${descripcion.nota_importante}` : null,
    descripcion?.instrucciones_agente ? `Instrucciones para el agente: ${descripcion.instrucciones_agente}` : null,
    descripcion?.criterios_avance?.length ? `Criterios de avance: ${descripcion.criterios_avance.join('; ')}` : null,
    descripcion?.acciones_agente?.length ? `Acciones sugeridas: ${descripcion.acciones_agente.join('; ')}` : null
  ].filter(Boolean).join(' ');

  return {
    id: stage.id,
    nombre: stage.nombre_etapa,
    orden: stage.orden_etapa,
    color: descripcion?.color ?? null,
    descripcion,
    queEs: descripcion?.que_es ?? null,
    notaImportante: descripcion?.nota_importante ?? null,
    instruccionesAgente: descripcion?.instrucciones_agente ?? null,
    accionesAgente: descripcion?.acciones_agente ?? [],
    criteriosAvance: descripcion?.criterios_avance ?? [],
    contextoAgente: contextoAgente || null
  };
}

function buildArtifactsInstructions(): string {
  return `
## 📦 Artifacts — Instrucciones de Uso

Tienes dos herramientas: **createArtifact** (crear nuevo) y **updateArtifact** (editar existente).

### ⚡ REGLA CRÍTICA: updateArtifact vs createArtifact
- Si el usuario pide **modificar, añadir, corregir, mejorar o cambiar** algo de un artifact que **ya existe en esta conversación**, USA **updateArtifact** con el artifactId del artifact previo.
- Solo usa **createArtifact** cuando el contenido es **completamente nuevo** y no tiene relación con un artifact existente.
- Cuando usas updateArtifact, envía el **contenido completo actualizado** (no solo el diff), porque reemplaza el contenido anterior.

### Cuándo USAR createArtifact (contenido nuevo):
1. **Código** (>15 líneas): scripts SQL, funciones JS/TS/Python, queries complejas
2. **HTML/CSS interactivo**: dashboards, landing pages, formularios, tablas estilizadas
3. **Diagramas Mermaid**: flowcharts, sequence diagrams, ERD, gantt
4. **SVG**: gráficos vectoriales, iconos personalizados
5. **Investigación estructurada**: reportes con datos JSON, comparativas, análisis profundos (type=research)
6. **Documentos largos**: guías, manuales, reportes de más de 500 palabras (type=markdown)

### Cuándo USAR updateArtifact (editar existente):
- "Agrega una sección de..." → updateArtifact
- "Cambia el color a..." → updateArtifact
- "Corrige el error en..." → updateArtifact
- "Añade un botón que..." → updateArtifact
- "Mejora el diseño de..." → updateArtifact
- "Traduce el artifact a..." → updateArtifact

### Cuándo NO usar artifacts:
- Respuestas cortas de texto (<15 líneas)
- Listas simples o bullet points breves
- Explicaciones conversacionales
- Fragmentos de código cortos que caben en el chat

### Parámetros importantes:
- **content**: El contenido completo y autosuficiente
- **type**: Indica siempre el tipo correcto: html | code | mermaid | svg | markdown | react | research
- **title**: Siempre incluye un título descriptivo y claro
- **language**: Para type=code, indica el lenguaje (javascript, python, sql, typescript, etc.)

### Después de crear/actualizar:
- Confirma al usuario con una frase breve qué se guardó o modificó
- Menciona que puede acceder al artifact desde la biblioteca (icono 📚 en el header)
`;
}

function buildContactMarkdownTag(contactName: string, contactId: number): string {
  const normalizedName = contactName
    .replace(/[\[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return `[${normalizedName || `Contacto #${contactId}`}](contact://${contactId})`;
}

function buildTemplateMarkdownTag(templateName: string, templateId: number): string {
  const normalizedName = templateName
    .replace(/[\[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return `[📝 ${normalizedName || `Plantilla #${templateId}`}](template://${templateId})`;
}

function buildContactTaggingInstructions(): string {
  return `
## 🏷️ Etiquetas de Contacto
Cuando menciones un contacto real del CRM encontrado con searchContacts o getContactContext, usa SOLO el formato exacto:
\`[Nombre Apellido](contact://ID)\`

Reglas obligatorias:
- Si la tool devuelve una propiedad \`etiquetaMarkdown\`, cópiala EXACTAMENTE como viene.
- NO uses HTML como \`<a href="contact://...">\`.
- NO uses variantes como \`contact:123\`, \`contact:/123\`, \`contact//123\` o URLs web para contactos.
- NO pongas la etiqueta entre backticks ni bloques de código.
- NO inventes IDs. Si no tienes un ID real, menciona el nombre sin enlace.
- Si hay varios resultados posibles, aclara cuál es antes de profundizar.

Ejemplo correcto:
- \`[Juan López](contact://4521)\`

Ejemplos incorrectos:
- \`<a href="contact://4521">Juan López</a>\`
- \`[Juan López](contact:4521)\`
- \`\`[Juan López](contact://4521)\`\`

## 📝 Etiquetas de Plantilla
Cuando crees un borrador de plantilla WhatsApp con createTemplateDraft, incluye la etiqueta en tu respuesta para que el usuario pueda navegar al borrador:
\`[📝 nombre_plantilla](template://ID)\`

Reglas:
- Si la tool devuelve \`etiquetaMarkdown\`, cópiala EXACTAMENTE.
- El usuario podrá hacer clic en la etiqueta para ir a la pantalla de plantillas y ver/editar su borrador.
- NO inventes IDs de plantilla.

## 🤖 Creación de Plantillas WhatsApp
Puedes crear borradores de plantillas WhatsApp directamente desde el chat usando la herramienta createTemplateDraft.

Flujo recomendado:
1. El usuario te pide crear una plantilla o te comparte un brief/intención (ej: "crea una plantilla de bienvenida", "hazme un template de cobranza", "un día antes del pago quiero recordar la cuota")
2. Si el usuario NO te da el texto final, debes redactarlo tú a partir del objetivo, timing, sector, tono y resultado esperado
3. Convierte notas sueltas o borradores del usuario en una versión final más clara, natural y profesional; NO copies literalmente un texto flojo si puedes mejorarlo
4. Antes de decir que la plantilla fue creada, DEBES llamar a createTemplateDraft
5. Incluye la etiqueta del borrador en tu respuesta para que el usuario navegue a editarlo

Tips para redactar plantillas:
- Usa variables \`{{1}}\`, \`{{2}}\` para datos dinámicos (nombre, monto, fecha, etc.)
- El body tiene máximo 1024 caracteres
- El nombre debe ser en minúsculas con guiones bajos (ej: bienvenida_nuevo_cliente)
- Categorías: utility (transaccional), marketing (promocional), authentication (verificación)
- Sé profesional, directo y personalizado al sector de la empresa
- Redacta para aprobación de Meta: evita claims dudosos, promesas sensibles, presión excesiva, amenazas o lenguaje confuso
- Si la intención es operativa o transaccional (recordatorios, pagos, citas, seguimiento de proceso), prioriza \`utility\`
- Si el caso es cobranza preventiva, usa tono sereno, claro y orientado a ayuda; recuerda la acción requerida sin sonar hostil
- Si corresponde, sugiere variables útiles como nombre, monto, fecha de pago, referencia o canal de ayuda
`;
}

// ============================================================================
// TEMPORAL CONTEXT
// ============================================================================

function getTemporalContext(timezone: string = DEFAULT_TIMEZONE): string {
  try {
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = { timeZone: timezone };
    
    const hour = parseInt(new Intl.DateTimeFormat('en-US', { ...options, hour: 'numeric', hour12: false }).format(now));
    
    let periodo: string;
    if (hour >= 5 && hour < 12) periodo = 'mañana';
    else if (hour >= 12 && hour < 18) periodo = 'tarde';
    else periodo = 'noche';
    
    const horaCompleta = new Intl.DateTimeFormat('es-ES', { 
      ...options, hour: '2-digit', minute: '2-digit', hour12: false 
    }).format(now);
    
    const fechaCompleta = new Intl.DateTimeFormat('es-ES', { 
      ...options, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' 
    }).format(now);

    return `## ⏰ Contexto Temporal
- **Hora actual**: ${horaCompleta} (${periodo})
- **Fecha**: ${fechaCompleta}
`;
  } catch {
    return '';
  }
}

// ============================================================================
// ROLE FETCHING
// ============================================================================

async function fetchMonicaRole(roleId: string): Promise<MonicaRole | null> {
  try {
    const { data, error } = await supabase
      .schema('adaptive_interface')
      .from('monica_roles')
      .select('*')
      .eq('id', roleId)
      .eq('is_active', true)
      .single();

    if (error || !data) return null;
    return data as MonicaRole;
  } catch {
    return null;
  }
}

 const ROLE_TOOL_ROUTE_MAP: Record<MonicaToolName, string[]> = {
   search_crm: ['searchContacts'],
   get_contact_360: ['getContactContext'],
   get_contacts: ['searchContacts', 'countContacts'],
   create_note: ['createNote'],
   get_portfolio: ['getContactPortfolio', 'getServiceLedger'],
   get_collection_queue: ['getCollectionQueue'],
   register_payment: ['registerPayment'],
   attach_payment_receipt: ['attachPaymentReceipt'],
   update_service_commitment: ['updateServiceCollectionSettings'],
   get_pipeline: ['getFunnelStages', 'getFunnelStats'],
   get_business_metrics: ['getMetrics'],
   get_conversational_intelligence: ['getConversationalIntelligence'],
   get_appointments: ['getAppointments'],
   update_appointment_status: ['updateAppointmentStatus'],
   get_tasks: ['getTasks'],
   get_projects: ['getProjects'],
   get_team_members: ['getTeamMembers'],
   get_contact_assignments: ['getContactAssignments'],
   manage_contact_assignments: ['manageContactAssignments'],
   get_funnel_stats: ['getFunnelStats'],
   get_funnel_stages: ['getFunnelStages'],
   update_contact_stage: ['updateContactStage'],
   search_emails: ['searchEmails'],
   get_email_detail: ['getEmailDetail'],
   search_documentation: ['searchDocumentation'],
   create_template_draft: ['createTemplateDraft']
 };

 function selectToolsForMonicaRole<T extends Record<string, unknown>>(tools: T, role?: MonicaRole | null): T {
   if (!role?.tools_enabled?.length) {
     return tools;
   }

   const managedToolKeys = new Set(Object.values(ROLE_TOOL_ROUTE_MAP).flat());
   const allowedToolKeys = new Set<string>();

   for (const toolName of role.tools_enabled) {
     const mappedKeys = ROLE_TOOL_ROUTE_MAP[toolName];
     if (!mappedKeys) continue;
     mappedKeys.forEach((key) => allowedToolKeys.add(key));
   }

   return Object.fromEntries(
     Object.entries(tools).filter(([toolKey]) => !managedToolKeys.has(toolKey) || allowedToolKeys.has(toolKey))
   ) as T;
 }

// ============================================================================
// SYSTEM PROMPT BUILDER (Sin Tools)
// ============================================================================

function buildSystemPrompt(
  enterpriseContext: any, 
  userTimezone?: string, 
  role?: MonicaRole | null
): string {
  // Si hay un rol personalizado, usarlo
  if (role?.system_prompt) {
    let promptStr = role.system_prompt;
    
    if (enterpriseContext?.identity?.nombre) {
      promptStr += `\n## Empresa: ${enterpriseContext.identity.nombre}\n`;
      if (enterpriseContext.identity.rubro) promptStr += `- **Rubro**: ${enterpriseContext.identity.rubro}\n`;
    }
    
    promptStr += buildContactTaggingInstructions();
    promptStr += `
## 📅 Uso de herramientas de calendario
- Para gestionar calendario, usa primero listConnectedCalendars y luego listCalendarEvents / getCalendarEventDetail.
- Para crear/editar/eliminar eventos, usa exclusivamente IDs reales (calendarId/eventId) retornados por tools previas.
- NUNCA inventes IDs de evento o calendario.
`;

    // Agregar contexto completo del cliente
    promptStr += buildContactContext(enterpriseContext);
    promptStr += buildArtifactsInstructions();
    promptStr += '\n' + getTemporalContext(userTimezone);
    return promptStr;
  }

  // === MONICA FULL CONTEXT PROMPT ===
  const empresaNombre = enterpriseContext?.identity?.nombre || 'la empresa';
  const enterpriseServices = enterpriseContext?.identity?.servicios || enterpriseContext?.business?.services;
  const enterpriseInfo = enterpriseContext?.identity?.informacion || enterpriseContext?.business?.info;
  
  let promptStr = `Eres **Monica**, asistente comercial IA del CRM **Urpe AI Lab**.

## Tu Identidad
- Te llamas **Monica**
- Trabajas dentro del CRM "Urpe AI Lab" de **${empresaNombre}**
- El **Usuario** que te escribe es un miembro del equipo comercial

## Tu Rol
- Tienes acceso COMPLETO al historial del cliente desde el primer día
- Ayudas al Usuario a responder preguntas sobre el contexto del cliente
- Puedes analizar conversaciones, citas, pagos, tareas y toda la información disponible
- Puedes CREAR, EDITAR, ELIMINAR y gestionar tareas y subtareas directamente desde el chat

## Instrucciones
- Responde siempre en español
- Sé concisa, clara y proactiva
- Usa el contexto del cliente para personalizar cada respuesta
- Menciona datos específicos cuando sea relevante (fechas, montos, nombres)
- Mantén un tono profesional pero cercano
- Si te preguntan algo que no está en el contexto, indícalo claramente
`;

  // Usuario actual que hace la pregunta
  if (enterpriseContext?.identity?.usuario) {
    const u = enterpriseContext.identity.usuario;
    promptStr += `\n## 👤 Usuario Actual (quien te escribe)\n`;
    promptStr += `- **Nombre**: ${u.nombre}\n`;
    if (u.rol) promptStr += `- **Rol**: ${u.rol}\n`;
    promptStr += `\n`;
  }

  // Servicios de la empresa
  if (enterpriseServices) {
    promptStr += `\n## 🏢 Servicios de la Empresa\n${enterpriseServices}\n`;
  }
  if (enterpriseInfo) {
    promptStr += `\n## ℹ️ Información Empresarial\n${enterpriseInfo}\n`;
  }

  promptStr += buildContactTaggingInstructions();
  promptStr += `
## 📅 Uso de herramientas de calendario
- Para gestionar calendario, usa primero listConnectedCalendars y luego listCalendarEvents / getCalendarEventDetail.
- Para crear/editar/eliminar eventos, usa exclusivamente IDs reales (calendarId/eventId) retornados por tools previas.
- NUNCA inventes IDs de evento o calendario.
`;

  // Contexto completo del cliente
  promptStr += buildContactContext(enterpriseContext);
  promptStr += buildArtifactsInstructions();
  promptStr += '\n' + getTemporalContext(userTimezone);
  
  return promptStr;
}

// Helper para construir el contexto completo del cliente
function buildContactContext(enterpriseContext: any): string {
  if (!enterpriseContext?.contact) return '';
  
  const c = enterpriseContext.contact;
  let ctx = '';
  
  // === HEADER DEL CLIENTE ===
  ctx += `\n# 👤 CLIENTE: ${c.nombre || ''} ${c.apellido || ''}\n\n`;
  
  // === INFORMACIÓN DE CONTACTO ===
  ctx += `## Información de Contacto\n`;
  if (c.telefono) ctx += `- **Teléfono**: ${c.telefono}\n`;
  if (c.email) ctx += `- **Email**: ${c.email}\n`;
  if (c.estado) ctx += `- **Estado**: ${c.estado}\n`;
  if (c.es_calificado) ctx += `- **Calificación**: ${c.es_calificado}\n`;
  if (c.origen) ctx += `- **Origen**: ${c.origen}\n`;
  if (c.is_active === false) ctx += `- **⚠️ Contacto INACTIVO**\n`;
  if (c.paused_until) ctx += `- **⏸️ Pausado hasta**: ${c.paused_until}\n`;
  ctx += `\n`;
  
  // === EMBUDO ===
  if (c.embudo) {
    ctx += `## 📊 Etapa del Embudo\n`;
    ctx += `- **Etapa Actual**: ${c.embudo.nombre || 'Sin etapa'}\n`;
    if (c.embudo.descripcion) {
      const desc = typeof c.embudo.descripcion === 'object' 
        ? JSON.stringify(c.embudo.descripcion) 
        : c.embudo.descripcion;
      ctx += `- **Descripción**: ${desc}\n`;
    }
    ctx += `\n`;
  }
  
  // === ASESOR ===
  if (c.asesor) {
    ctx += `## 👨‍💼 Asesor Asignado\n`;
    ctx += `- **Nombre**: ${c.asesor.nombre}\n`;
    if (c.asesor.email) ctx += `- **Email**: ${c.asesor.email}\n`;
    if (c.asesor.rol) ctx += `- **Rol**: ${c.asesor.rol}\n`;
    ctx += `\n`;
  }
  
  // === FECHAS IMPORTANTES ===
  if (c.fechas_importantes) {
    ctx += `## 📅 Fechas Importantes\n`;
    const f = c.fechas_importantes;
    if (f.creacion) ctx += `- **Cliente desde**: ${formatDate(f.creacion)}\n`;
    if (f.ultima_interaccion) ctx += `- **Última interacción**: ${formatDate(f.ultima_interaccion)}\n`;
    if (f.primera_cita) ctx += `- **Primera cita**: ${formatDate(f.primera_cita)}\n`;
    if (f.proxima_cita) ctx += `- **Próxima cita**: ${formatDateTime(f.proxima_cita)}\n`;
    if (f.ultimo_pago) ctx += `- **Último pago**: ${formatDate(f.ultimo_pago)}\n`;
    ctx += `\n`;
  }
  
  // === CONVERSACIONES CON MENSAJES ===
  if (c.conversaciones?.length > 0) {
    ctx += `## 💬 Historial de Conversaciones (${c.conversaciones.length})\n`;
    c.conversaciones.forEach((conv: any, idx: number) => {
      ctx += `\n### Conversación ${idx + 1} (${conv.canal || 'Chat'}) - ${conv.status || 'abierta'}\n`;
      ctx += `**Fecha**: ${formatDateTime(conv.fecha_inicio)}\n`;
      if (conv.resumen) ctx += `**Resumen**: ${conv.resumen}\n`;
      
      if (conv.mensajes?.length > 0) {
        ctx += `**Mensajes (${conv.mensajes.length}):**\n`;
        conv.mensajes.slice(-20).forEach((msg: any) => { // Últimos 20 mensajes por conversación
          const fecha = formatDateTime(msg.fecha);
          const contenido = (msg.contenido || '').slice(0, 500); // Limitar longitud
          ctx += `- [${fecha}] **${msg.remitente}**: ${contenido}\n`;
        });
      }
    });
    ctx += `\n`;
  }
  
  // === CITAS ===
  if (c.citas?.length > 0) {
    ctx += `## 📆 Historial de Citas (${c.citas.length})\n`;
    c.citas.forEach((cita: any) => {
      ctx += `- **${cita.titulo || 'Cita'}** (${cita.estado || 'pendiente'})\n`;
      ctx += `  - Fecha: ${formatDateTime(cita.fecha_hora)}\n`;
      if (cita.tipo) ctx += `  - Tipo: ${cita.tipo}\n`;
      if (cita.duracion) ctx += `  - Duración: ${cita.duracion} min\n`;
      if (cita.descripcion) ctx += `  - Descripción: ${cita.descripcion}\n`;
    });
    ctx += `\n`;
  }
  
  // === TRANSCRIPCIONES ===
  if (c.transcripciones?.length > 0) {
    ctx += `## 🎙️ Transcripciones de Reuniones (${c.transcripciones.length})\n`;
    c.transcripciones.forEach((t: any) => {
      ctx += `\n### ${t.cita_titulo || 'Reunión'} - ${formatDate(t.fecha)}\n`;
      if (t.duracion) ctx += `**Duración**: ${Math.round(t.duracion / 60)} minutos\n`;
      if (t.resumen) ctx += `**Resumen**: ${t.resumen}\n`;
      if (t.resumen_cita) ctx += `**Conclusiones**: ${t.resumen_cita}\n`;
      if (t.transcripcion_completa) {
        const transcripcion = t.transcripcion_completa.slice(0, 3000); // Limitar
        ctx += `**Transcripción**:\n${transcripcion}\n`;
      }
    });
    ctx += `\n`;
  }
  
  // === NOTAS (solo las visibles para IA) ===
  const notasVisibles = c.notas?.filter((n: any) => n.visible_ia !== false) || [];
  if (notasVisibles.length > 0) {
    ctx += `## 📝 Notas del Equipo (${notasVisibles.length})\n`;
    notasVisibles.forEach((nota: any) => {
      const pinned = nota.es_fijado ? '📌 ' : '';
      ctx += `- ${pinned}**${nota.titulo || 'Nota'}** (${formatDate(nota.fecha)})\n`;
      ctx += `  ${nota.descripcion || ''}\n`;
      if (nota.autor) ctx += `  *Por: ${nota.autor}*\n`;
      if (nota.etiquetas?.length) ctx += `  Tags: ${nota.etiquetas.join(', ')}\n`;
    });
    ctx += `\n`;
  }
  
  // === TAREAS ===
  if (c.tareas?.length > 0) {
    ctx += `## ✅ Tareas (${c.tareas.length})\n`;
    const prioridadEmoji: Record<number, string> = { 1: '🟢', 2: '🟡', 3: '🟠', 4: '🔴' };
    c.tareas.forEach((tarea: any) => {
      const emoji = prioridadEmoji[tarea.prioridad] || '';
      ctx += `- ${emoji} **${tarea.titulo}** [${tarea.estado}]\n`;
      if (tarea.descripcion) ctx += `  ${tarea.descripcion}\n`;
      if (tarea.asignado_a) ctx += `  *Asignado a: ${tarea.asignado_a}*\n`;
      if (tarea.fecha_vencimiento) ctx += `  *Vence: ${formatDate(tarea.fecha_vencimiento)}*\n`;
      if (tarea.items?.length > 0) {
        ctx += `  Checklist:\n`;
        tarea.items.forEach((item: any) => {
          const check = item.completado ? '☑️' : '⬜';
          ctx += `    ${check} ${item.texto}\n`;
        });
      }
    });
    ctx += `\n`;
  }
  
  // === CARTERA/SERVICIOS ===
  if (c.cartera?.servicios?.length > 0) {
    ctx += `## 💰 Cartera de Servicios\n`;
    const r = c.cartera.resumen;
    if (r) {
      ctx += `**Resumen Financiero:**\n`;
      ctx += `- Total Contratado: $${(r.total_contratado || 0).toLocaleString()}\n`;
      ctx += `- Total Pagado: $${(r.total_pagado || 0).toLocaleString()}\n`;
      ctx += `- Saldo Pendiente: $${(r.total_pendiente || 0).toLocaleString()}\n\n`;
    }
    
    ctx += `**Servicios Contratados:**\n`;
    c.cartera.servicios.forEach((s: any) => {
      ctx += `\n### ${s.nombre} (${s.estado})\n`;
      if (s.tipo) ctx += `- Tipo: ${s.tipo}\n`;
      ctx += `- Valor: $${(s.valor_total || 0).toLocaleString()}\n`;
      ctx += `- Pagado: $${(s.saldo_pagado || 0).toLocaleString()}\n`;
      ctx += `- Pendiente: $${(s.saldo_pendiente || 0).toLocaleString()}\n`;
      if (s.fecha_inicio) ctx += `- Inicio: ${formatDate(s.fecha_inicio)}\n`;
      if (s.fecha_fin) ctx += `- Fin: ${formatDate(s.fecha_fin)}\n`;
      
      if (s.pagos?.length > 0) {
        ctx += `- Historial de pagos:\n`;
        s.pagos.forEach((p: any) => {
          ctx += `  - $${(p.monto || 0).toLocaleString()} (${p.metodo || 'N/A'}) - ${formatDate(p.fecha)} [${p.estado}]\n`;
        });
      }
    });
    ctx += `\n`;
  }
  
  // === METADATA ===
  if (c.metadata && Object.keys(c.metadata).length > 0) {
    ctx += `## 🏷️ Metadata/Tags\n`;
    ctx += `\`\`\`json\n${JSON.stringify(c.metadata, null, 2)}\n\`\`\`\n\n`;
  }
  
  return ctx;
}

// Helpers de formateo
function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return 'N/A';
  try {
    return new Date(dateStr).toLocaleDateString('es-ES');
  } catch {
    return dateStr;
  }
}

function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return 'N/A';
  try {
    return new Date(dateStr).toLocaleString('es-ES');
  } catch {
    return dateStr;
  }
}

const PAYMENT_STATUS_VALUES = ['confirmado', 'pendiente', 'rechazado', 'anulado'] as const;
const SERVICE_STATUS_VALUES = ['activo', 'finalizado', 'cancelado', 'pendiente_pago'] as const;
const APPOINTMENT_STATUS_VALUES = ['pendiente', 'confirmada', 'realizada', 'reagendada', 'cancelada', 'no_asistio'] as const;
const CONTACT_ASSIGNMENT_ROLE_VALUES = ['colaborador', 'observador'] as const;
const CONTACT_ASSIGNMENT_OPERATION_VALUES = ['set_primary', 'clear_primary', 'add_assignment', 'update_assignment_role', 'remove_assignment'] as const;

function toNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDateOrNull(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getTodayReferenceDate(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
}

function isInvoiceOverdue(invoice: any, referenceDate = getTodayReferenceDate()): boolean {
  const pendingBalance = toNumber(invoice?.saldo_pendiente);
  if (pendingBalance <= 0) return false;

  const dueDate = parseDateOrNull(invoice?.fecha_vencimiento);
  return invoice?.estado === 'vencida'
    || (invoice?.estado === 'emitida' && !!dueDate && dueDate.getTime() < referenceDate.getTime());
}

function countOverdueInvoices(invoices: any[] = [], referenceDate = getTodayReferenceDate()): number {
  return invoices.filter(invoice => isInvoiceOverdue(invoice, referenceDate)).length;
}

function buildContactDisplayName(contact: any): string {
  return `${contact?.nombre || ''} ${contact?.apellido || ''}`.trim() || '(Sin nombre)';
}

function getAssignmentRoleLabel(role: string | null | undefined, isPrimary?: boolean): string {
  if (isPrimary || role === 'principal') return 'Responsable';
  if (role === 'observador') return 'Observador';
  return 'Colaborador';
}

type SerializedContactAssignment = {
  id: number | string | null;
  teamMemberId: number | null;
  nombre: string;
  email: string | null;
  rol: string;
  rolClave: string;
  esPrincipal: boolean;
  activo: boolean;
  createdAt: string | null;
};

function serializeContactAssignmentRecord(assignment: any): SerializedContactAssignment {
  return {
    id: assignment.id,
    teamMemberId: assignment.team_humano_id,
    nombre: buildContactDisplayName({
      nombre: assignment.team_nombre,
      apellido: assignment.team_apellido
    }),
    email: assignment.team_email || null,
    rol: getAssignmentRoleLabel(assignment.rol_asignacion, assignment.es_principal),
    rolClave: assignment.es_principal ? 'principal' : (assignment.rol_asignacion || 'colaborador'),
    esPrincipal: !!assignment.es_principal,
    activo: assignment.team_is_active !== false,
    createdAt: assignment.created_at
  };
}

function buildAssignmentsSummaryLines(assignments: any[]) {
  if (!assignments.length) {
    return ['- Sin miembros asignados'];
  }

  return assignments.map((assignment: any) => {
    const member = serializeContactAssignmentRecord(assignment);
    const inactiveTag = member.activo ? '' : ' · inactivo';
    return `- ${member.nombre} (${member.rol})${inactiveTag}`;
  });
}

async function fetchContactAssignmentsForTool(contactId: number, enterpriseId: number) {
  try {
    const { data, error } = await supabase.rpc('get_contacto_asignaciones', { p_contacto_id: contactId });

    if (error) {
      const { data: rawAssignments, error: rawError } = await supabase
        .from('wp_contacto_team_asignaciones')
        .select('id, contacto_id, team_humano_id, es_principal, rol_asignacion, empresa_id, asignado_por, created_at, updated_at')
        .eq('contacto_id', contactId)
        .eq('empresa_id', enterpriseId)
        .order('es_principal', { ascending: false })
        .order('created_at', { ascending: true });

      if (rawError || !rawAssignments) {
        throw rawError || error;
      }

      const teamIds = rawAssignments.map(assignment => assignment.team_humano_id).filter(Boolean);
      if (teamIds.length === 0) {
        return rawAssignments;
      }

      const { data: teamData, error: teamError } = await supabase
        .from('wp_team_humano')
        .select('id, nombre, apellido, email, rol, is_active')
        .in('id', teamIds);

      if (teamError) {
        throw teamError;
      }

      const teamById = new Map((teamData || []).map(member => [member.id, member]));

      return rawAssignments.map((assignment) => {
        const team = teamById.get(assignment.team_humano_id);
        return {
          ...assignment,
          team_nombre: team?.nombre,
          team_apellido: team?.apellido,
          team_email: team?.email,
          team_rol: team?.rol,
          team_is_active: team?.is_active,
        };
      });
    }

    return data || [];
  } catch (error) {
    logger.error('[Chat API] Error fetching contact assignments', { contactId, enterpriseId, error });
    throw error;
  }
}

async function notifyResponsibleAssignment(params: {
  contactId: number;
  contactName: string;
  enterpriseId: number;
  advisorId: number;
}) {
  try {
    await supabase
      .from('wp_notificaciones_team')
      .insert({
        tipo: 'sistema',
        contacto_id: params.contactId,
        mensaje: `Te han asignado como responsable del contacto ${params.contactName}`,
        asesor_id: params.advisorId,
        empresa_id: params.enterpriseId,
        requiere_respuesta: false,
        origen: 'asignacion_responsable_contacto',
        fecha_envio: new Date().toISOString(),
        visto: false,
        estado: 'pendiente',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
  } catch (error) {
    logger.warn('[Chat API] Unable to create responsible assignment notification', {
      contactId: params.contactId,
      advisorId: params.advisorId,
      error
    });
  }
}

function buildFinanceSummary(services: any[]) {
  const currencyCount = new Map<string, number>();

  const totals = services.reduce((acc, service) => {
    const moneda = service?.moneda || 'USD';
    currencyCount.set(moneda, (currencyCount.get(moneda) || 0) + 1);

    const valorTotal = toNumber(service?.valor_total);
    const saldoPagado = toNumber(service?.saldo_pagado);
    const saldoPendiente = toNumber(service?.saldo_pendiente);

    acc.totalContratado += valorTotal;
    acc.totalPagado += saldoPagado;
    acc.totalPendiente += saldoPendiente;
    if (service?.estado === 'activo' || service?.estado === 'pendiente_pago') acc.serviciosActivos += 1;
    if (service?.estado === 'finalizado') acc.serviciosCompletados += 1;
    return acc;
  }, {
    totalContratado: 0,
    totalPagado: 0,
    totalPendiente: 0,
    serviciosActivos: 0,
    serviciosCompletados: 0
  });

  const moneda = Array.from(currencyCount.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || services[0]?.moneda || 'USD';

  return {
    ...totals,
    moneda
  };
}

function serializePaymentRecord(payment: any) {
  return {
    id: payment.id,
    servicioId: payment.servicio_id,
    contactoId: payment.contacto_id,
    monto: toNumber(payment.monto),
    moneda: payment.moneda || 'USD',
    fechaPago: payment.fecha_pago,
    metodoPago: payment.metodo_pago || null,
    referencia: payment.referencia || null,
    estado: payment.estado,
    nota: payment.nota || null,
    comprobanteUrl: payment.comprobante_url || null,
    createdAt: payment.created_at,
    updatedAt: payment.updated_at
  };
}

function serializeInvoiceRecord(invoice: any) {
  return {
    id: invoice.id,
    numeroFactura: invoice.numero_factura,
    servicioId: invoice.servicio_id || null,
    contactoId: invoice.contacto_id,
    estado: invoice.estado,
    moneda: invoice.moneda || 'USD',
    total: toNumber(invoice.total),
    montoPagado: toNumber(invoice.monto_pagado),
    saldoPendiente: toNumber(invoice.saldo_pendiente),
    fechaEmision: invoice.fecha_emision,
    fechaVencimiento: invoice.fecha_vencimiento || null,
    pdfUrl: invoice.pdf_url || null,
    isOverdue: isInvoiceOverdue(invoice)
  };
}

function buildPortfolioQueueItem(service: any, payments: any[] = [], invoices: any[] = []) {
  const normalizedService = {
    ...service,
    valor_total: toNumber(service?.valor_total),
    saldo_pagado: toNumber(service?.saldo_pagado),
    saldo_pendiente: toNumber(service?.saldo_pendiente),
    cuota_mensual: service?.cuota_mensual === null || service?.cuota_mensual === undefined ? null : toNumber(service.cuota_mensual)
  };

  const commitmentInfo = getServiceCommitmentInfo({
    dia_compromiso_pago: normalizedService.dia_compromiso_pago ?? null,
    cuota_mensual: normalizedService.cuota_mensual,
    saldo_pendiente: normalizedService.saldo_pendiente,
    saldo_pagado: normalizedService.saldo_pagado,
    fecha_inicio: normalizedService.fecha_inicio,
    pagos: payments
  });
  const agingBucket = getPortfolioAgingBucket(commitmentInfo);
  const overdueInvoices = countOverdueInvoices(invoices);
  const lastPaymentDate = getLastConfirmedPaymentDate(payments);
  const amount = commitmentInfo.currentCommitmentAmount || normalizedService.saldo_pendiente || 0;

  let title = 'Próximo seguimiento';
  let severity: 'critical' | 'warning' | 'neutral' | 'success' = 'success';
  let priority = 10;

  if (agingBucket === 'mas_de_30') {
    title = 'Mora crítica';
    severity = 'critical';
    priority = 100;
  } else if (agingBucket === 'de_8_a_30') {
    title = 'En mora';
    severity = 'critical';
    priority = 90;
  } else if (agingBucket === 'de_1_a_7') {
    title = 'Cobro atrasado';
    severity = 'warning';
    priority = 80;
  } else if (agingBucket === 'vence_hoy') {
    title = 'Vence hoy';
    severity = 'warning';
    priority = 70;
  } else if (agingBucket === 'sin_configurar') {
    title = 'Configurar compromiso';
    severity = 'neutral';
    priority = 60;
  } else if (overdueInvoices > 0) {
    title = 'Factura vencida';
    severity = 'critical';
    priority = 65;
  } else if (normalizedService.estado === 'pendiente_pago') {
    title = 'Pendiente por confirmar';
    severity = 'neutral';
    priority = 40;
  }

  return {
    service: normalizedService,
    title,
    severity,
    priority,
    agingBucket,
    agingLabel: getPortfolioAgingLabel(agingBucket),
    amount,
    overdueInvoices,
    dueDate: commitmentInfo.dueDate,
    lastPaymentDate,
    commitment: {
      configuredDay: commitmentInfo.configuredDay,
      label: formatCommitmentDayLabel(commitmentInfo.configuredDay),
      dueDate: commitmentInfo.dueDate ? commitmentInfo.dueDate.toISOString() : null,
      currentCommitmentAmount: commitmentInfo.currentCommitmentAmount,
      daysOverdue: commitmentInfo.daysOverdue,
      status: commitmentInfo.status,
      ciclosImpagos: commitmentInfo.ciclosImpagos,
      deudaAcumulada: commitmentInfo.deudaAcumulada,
      diasSinPago: commitmentInfo.diasSinPago,
      paymentBehavior: commitmentInfo.paymentBehavior,
      moraEstructural: commitmentInfo.moraEstructural,
    }
  };
}

function sortPortfolioQueueItems(items: any[]) {
  return [...items].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    if (b.overdueInvoices !== a.overdueInvoices) return b.overdueInvoices - a.overdueInvoices;
    if (b.commitment.daysOverdue !== a.commitment.daysOverdue) {
      return b.commitment.daysOverdue - a.commitment.daysOverdue;
    }
    return toNumber(b.service?.saldo_pendiente) - toNumber(a.service?.saldo_pendiente);
  });
}

function buildQueueStats(items: any[]) {
  return items.reduce((acc, item) => {
    acc.total += 1;
    if (item.commitment.daysOverdue > 0) acc.overdue += 1;
    if (item.overdueInvoices > 0) acc.overdueInvoices += item.overdueInvoices;
    if (item.agingBucket === 'vence_hoy') acc.dueToday += 1;
    if (item.agingBucket === 'de_1_a_7') acc.bucket1to7 += 1;
    if (item.agingBucket === 'de_8_a_30') acc.bucket8to30 += 1;
    if (item.agingBucket === 'mas_de_30') acc.bucket31plus += 1;
    if (item.agingBucket === 'sin_configurar') acc.unconfigured += 1;
    acc.totalCommitmentThisCycle += toNumber(item.commitment.currentCommitmentAmount);
    if (item.commitment.daysOverdue > 0 || item.commitment.status === 'vence_hoy' || item.overdueInvoices > 0) {
      acc.totalDueNow += toNumber(item.amount);
    }
    return acc;
  }, {
    total: 0,
    overdue: 0,
    overdueInvoices: 0,
    dueToday: 0,
    bucket1to7: 0,
    bucket8to30: 0,
    bucket31plus: 0,
    unconfigured: 0,
    totalCommitmentThisCycle: 0,
    totalDueNow: 0
  });
}

function buildServiceActionHint(item: any): string {
  if (item.agingBucket === 'mas_de_30' || item.agingBucket === 'de_8_a_30') {
    return 'Registrar pago o escalar la cobranza hoy mismo.';
  }
  if (item.agingBucket === 'de_1_a_7') {
    return 'Dar seguimiento inmediato y dejar trazabilidad en tareas o notas.';
  }
  if (item.overdueInvoices > 0) {
    return 'Revisar facturas vencidas asociadas y validar el próximo paso de cobranza.';
  }
  if (item.agingBucket === 'vence_hoy') {
    return 'Confirmar el pago hoy o programar seguimiento para el cierre del día.';
  }
  if (item.agingBucket === 'sin_configurar') {
    return 'Configurar día de compromiso y monto mensual propuesto para ordenar la cobranza.';
  }
  if (item.service?.estado === 'pendiente_pago') {
    return 'Validar el estado del pago pendiente y actualizar el servicio.';
  }
  return 'Mantener seguimiento del próximo compromiso de pago.';
}

// ============================================================================
// ATTACHMENT HELPERS
// ============================================================================

type SerializableAttachment = Pick<Attachment, 'name' | 'type' | 'data' | 'url' | 'storagePath'>;

function normalizeAttachment(attachment: any): SerializableAttachment | null {
  if (!attachment || typeof attachment !== 'object') return null;

  const name = typeof attachment.name === 'string' && attachment.name.trim().length > 0
    ? attachment.name.trim()
    : 'adjunto';
  const type = typeof attachment.type === 'string' && attachment.type.trim().length > 0
    ? attachment.type.trim()
    : 'application/octet-stream';
  const data = typeof attachment.data === 'string' ? attachment.data : '';
  const url = typeof attachment.url === 'string' && attachment.url.trim().length > 0
    ? attachment.url.trim()
    : undefined;
  const storagePath = typeof attachment.storagePath === 'string' && attachment.storagePath.trim().length > 0
    ? attachment.storagePath.trim()
    : undefined;

  if (!data && !url && !storagePath) return null;

  return {
    name,
    type,
    data,
    url,
    storagePath
  };
}

function isImageAttachment(attachment: SerializableAttachment): boolean {
  return attachment.type.startsWith('image/');
}

function getAttachmentSummaryLine(attachment: SerializableAttachment, index: number): string {
  const parts = [`[${index}] ${attachment.name}`];
  if (attachment.type) parts.push(`tipo: ${attachment.type}`);
  if (attachment.url) parts.push('url disponible');
  return `- ${parts.join(' · ')}`;
}

function buildAttachmentSummaryText(attachments: SerializableAttachment[], title: string): string {
  if (!attachments.length) return '';
  return `${title}\n${attachments.map((attachment, index) => getAttachmentSummaryLine(attachment, index)).join('\n')}`;
}

function attachmentToMessagePart(attachment: SerializableAttachment): any | null {
  if (!isImageAttachment(attachment)) return null;

  if (attachment.data?.startsWith('data:')) {
    try {
      const base64Data = attachment.data.split(',')[1];
      if (!base64Data) return null;

      return {
        type: 'image',
        image: base64Data,
        mimeType: attachment.type
      };
    } catch {
      return null;
    }
  }

  if (attachment.url) {
    return {
      type: 'image',
      image: new URL(attachment.url),
      mimeType: attachment.type
    };
  }

  return null;
}

function buildMessageContent(text: string | undefined, attachments: SerializableAttachment[] = [], title?: string): any {
  const normalizedText = typeof text === 'string' ? text.trim() : '';
  const imageParts = attachments
    .map(attachmentToMessagePart)
    .filter(Boolean);
  const summary = buildAttachmentSummaryText(attachments, title || 'Adjuntos');
  const textParts = [summary, normalizedText].filter(Boolean).join('\n\n');

  if (imageParts.length === 0) {
    return textParts;
  }

  return [
    ...(textParts ? [{ type: 'text', text: textParts }] : []),
    ...imageParts
  ];
}

function getAttachmentIdentity(attachment: SerializableAttachment): string {
  return attachment.storagePath || attachment.url || `${attachment.name}:${attachment.type}:${attachment.data.slice(0, 24)}`;
}

function collectRecentChatAttachments(
  historyMessages: Array<{ attachments?: any[] }> = [],
  currentAttachments: any[] = [],
  limit: number = CHAT_ATTACHMENTS_CONTEXT_LIMIT
): SerializableAttachment[] {
  const flattenedHistory = historyMessages.flatMap((message) =>
    (message.attachments || [])
      .map(normalizeAttachment)
      .filter((attachment): attachment is SerializableAttachment => Boolean(attachment))
  );
  const flattenedCurrent = currentAttachments
    .map(normalizeAttachment)
    .filter((attachment): attachment is SerializableAttachment => Boolean(attachment));

  const recent = [...flattenedHistory, ...flattenedCurrent]
    .filter((attachment, index, self) => {
      const key = getAttachmentIdentity(attachment);
      return self.findIndex((candidate) => (
        getAttachmentIdentity(candidate) === key
      )) === index;
    })
    .slice(-limit)
    .reverse();

  return recent;
}

function selectChatImageAttachment(
  attachments: SerializableAttachment[],
  attachmentIndex: number = 0
): { selected: SerializableAttachment | null; imageAttachments: SerializableAttachment[] } {
  const imageAttachments = attachments.filter(isImageAttachment);
  const selected = imageAttachments[attachmentIndex] || null;
  return { selected, imageAttachments };
}

function getExtensionFromMimeType(mimeType: string): string {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/gif') return 'gif';
  const parts = mimeType.split('/');
  return parts[1] || 'bin';
}

function buildReceiptStoragePath(enterpriseId: number, contactId: number, paymentId: number, fileName: string, mimeType: string): string {
  const safeBaseName = fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 40) || 'comprobante';
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).slice(2, 8);
  const extension = getExtensionFromMimeType(mimeType);

  return `empresa_${enterpriseId}/contacto_${contactId}/pago_${paymentId}_${timestamp}_${randomSuffix}_${safeBaseName}.${extension}`;
}

async function resolveAttachmentBuffer(attachment: SerializableAttachment): Promise<Buffer | null> {
  if (attachment.data?.startsWith('data:')) {
    const base64Data = attachment.data.split(',')[1];
    if (!base64Data) return null;
    return Buffer.from(base64Data, 'base64');
  }

  if (attachment.storagePath) {
    const { data, error } = await supabase.storage
      .from(CHAT_UPLOADS_BUCKET)
      .download(attachment.storagePath);

    if (error || !data) {
      logger.error('[Chat API] No se pudo descargar adjunto del chat', error);
      return null;
    }

    return Buffer.from(await data.arrayBuffer());
  }

  return null;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export async function POST(req: NextRequest) {
  const body = await req.json();
  
  // 1. VALIDATION: Zod schema for ChatRequest (Anti-Error standard)
  const validation = validateRequest(ChatRequestSchema, body);
  
  if (!validation.success) {
    logger.error('[Chat API] Validation failed:', validation.error);
    return Response.json({ 
      error: 'Invalid request payload', 
      details: validation.error 
    }, { status: 400 });
  }

  const { 
    chatInput, 
    history, 
    enterpriseContext, 
    enterpriseId, 
    userId,
    userRoleId, 
    sessionId, 
    userTimezone, 
    roleId,
    attachments 
  } = validation.data;

  // ============================================
  // SECURITY: Session & Enterprise Validation
  // ============================================
  const { user, error: authError } = await getSupabaseUser(req);
  
  if (authError || !user) {
    logger.error('[Chat API] Authentication failed:', authError?.message);
    return Response.json({ 
      error: 'Sesión inválida o expirada', 
      details: 'Por favor, inicia sesión nuevamente.' 
    }, { status: 401 });
  }

  // Use session user ID instead of body-provided userId for security
  const sessionUserId = user.id;

  logger.debug('[Chat API] Fetching context for session user:', sessionUserId);

  // ============================================
  // SECURITY: Verify user is active and not archived
  // ============================================
  const securityCheck = await verifyActiveTeamMember(
    createSupabaseAdmin(),
    sessionUserId,
    user.email
  );

  if (!securityCheck.success || !securityCheck.teamMember) {
    logger.error('[Chat API] Security check failed:', securityCheck.error);
    return Response.json({ 
      error: securityCheck.error?.message || 'Acceso denegado',
      code: securityCheck.error?.code
    }, { status: securityCheck.error?.httpStatus || 403 });
  }

  const teamMember = securityCheck.teamMember;
  const userAuthorizedEnterpriseId = getEffectiveEnterpriseId(teamMember);
  const userActualRoleId = teamMember.role_id;
  let resolvedEnterpriseId: number;

  if (!enterpriseId) {
    resolvedEnterpriseId = userAuthorizedEnterpriseId;
  } else {
    const requestedEnterpriseId = enterpriseId;
    
    if (userActualRoleId === DEV_TEAM_ROLE_ID) {
      resolvedEnterpriseId = requestedEnterpriseId;
    } else {
      if (requestedEnterpriseId !== userAuthorizedEnterpriseId) {
        logger.error('[Chat API] Unauthorized enterprise access:', { userId, requestedEnterpriseId });
        return Response.json({ error: 'Acceso denegado' }, { status: 403 });
      }
      resolvedEnterpriseId = userAuthorizedEnterpriseId;
    }
  }

  logger.debug('[Chat API] Context resolved:', { resolvedEnterpriseId, userId, userActualRoleId });

  // ============================================
  // FETCH ROLE (if specified)
  // ============================================
  const monicaRole = roleId ? await fetchMonicaRole(roleId) : null;
  const sanitizedEnterpriseContext = enterpriseContext;
  const systemPrompt = buildSystemPrompt(sanitizedEnterpriseContext, userTimezone, monicaRole);
  
  const promptSizeChars = systemPrompt.length;
  const promptSizeEstTokens = Math.round(promptSizeChars / 4);
  logger.info(`[Chat API] Prompt built. Size: ~${promptSizeChars} chars (~${promptSizeEstTokens} tokens)`);

  if (promptSizeChars > 30000) {
    logger.warn(`[Chat API] Large prompt detected (${promptSizeChars} chars). Performance may be affected.`);
  }

  // ============================================
  // BUILD MESSAGES
  // ============================================
  const messages: any[] = [];
  const normalizedCurrentAttachments = (attachments || [])
    .map(normalizeAttachment)
    .filter((attachment): attachment is SerializableAttachment => Boolean(attachment));
  const recentHistoryAttachments = collectRecentChatAttachments(history || [], [], CHAT_ATTACHMENTS_CONTEXT_LIMIT);
  const recentChatAttachments = collectRecentChatAttachments(history || [], attachments || [], CHAT_ATTACHMENTS_CONTEXT_LIMIT);
  const recentHistoryAttachmentKeys = new Set(recentHistoryAttachments.map(getAttachmentIdentity));
  
  if (history?.length) {
    for (const msg of history.slice(-20)) {
      const normalizedHistoryAttachments = (msg.attachments || [])
        .map(normalizeAttachment)
        .filter((attachment): attachment is SerializableAttachment => Boolean(attachment))
        .filter((attachment) => recentHistoryAttachmentKeys.has(getAttachmentIdentity(attachment)));

      messages.push({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: buildMessageContent(
          msg.content,
          normalizedHistoryAttachments,
          normalizedHistoryAttachments.length > 0 ? 'Adjuntos recientes del chat' : undefined
        )
      });
    }
  }

  messages.push({
    role: 'user',
    content: buildMessageContent(
      chatInput,
      normalizedCurrentAttachments,
      normalizedCurrentAttachments.length > 0 ? 'Adjuntos del mensaje actual' : undefined
    )
  });

  logger.info('[Chat API] Starting stream with UI Message Protocol + Tools');
  logger.info('[Chat API] Messages count:', messages.length);

  const contactSelectFields = 'id, nombre, apellido, telefono, email, estado, team_humano_id';
  const serviceSelectFields = `
    id, empresa_id, contacto_id, nombre_servicio, tipo_servicio, descripcion,
    moneda, valor_total, saldo_pagado, saldo_pendiente, cuota_mensual,
    dia_compromiso_pago, estado, fecha_inicio, fecha_fin, contrato_url, metadata,
    created_at, updated_at,
    contacto:wp_contactos!contacto_id(id, nombre, apellido, telefono, email, team_humano_id)
  `;

  // ============================================
  // SECURITY: Role 3 contact visibility filter
  // Mirrors dashboard logic from searchSlice.ts
  // ============================================
  const isRole3User = userActualRoleId === 3;
  let _cachedVisibleContactIds: number[] | null = null;

  async function getVisibleContactIdsForRole3(): Promise<number[]> {
    if (_cachedVisibleContactIds !== null) return _cachedVisibleContactIds;

    const [assignmentsRes, legacyRes] = await Promise.all([
      supabase
        .from('wp_contacto_team_asignaciones')
        .select('contacto_id')
        .eq('empresa_id', resolvedEnterpriseId)
        .eq('team_humano_id', teamMember.id),
      supabase
        .from('wp_contactos')
        .select('id')
        .eq('empresa_id', resolvedEnterpriseId)
        .eq('team_humano_id', teamMember.id)
    ]);

    _cachedVisibleContactIds = Array.from(new Set<number>([
      ...(assignmentsRes.data || []).map((a: any) => a.contacto_id),
      ...(legacyRes.data || []).map((c: any) => c.id)
    ]));

    logger.debug('[Chat API] Role 3 visible contacts resolved', {
      teamMemberId: teamMember.id,
      visibleCount: _cachedVisibleContactIds.length
    });

    return _cachedVisibleContactIds;
  }

  // ============================================
  // TOOLS DEFINITIONS - Refactored for Stability
  // - Flat string errors (no objects)
  // - Rich context in success responses
  // - Explicit ID usage guidance
  // ============================================
  const tools = {
    // ─────────────────────────────────────────────────────────────────
    // TOOL 1: searchContacts - Búsqueda de contactos en CRM
    // ─────────────────────────────────────────────────────────────────
    searchContacts: {
      description: `Busca contactos en el CRM por nombre, teléfono, email o palabra clave.

USAR CUANDO: "Busca a Juan", "Contactos con teléfono 555", "¿Tenemos a María?"

RETORNA: Lista con {id, nombre, telefono, email, estado}. 
⚠️ IMPORTANTE: Guarda los IDs retornados para usarlos en getContactContext.

EJEMPLO:
Usuario: "busca a francisco"
→ searchContacts({query: "francisco"})
→ Retorna: [{id: 4521, nombre: "Francisco López"...}]
→ Si el usuario dice "dame más info del primero", usa getContactContext({contactId: 4521})`,
      inputSchema: z.object({
        query: z.string()
          .min(2, 'Mínimo 2 caracteres')
          .describe('Texto a buscar: nombre, apellido, teléfono o email'),
        limit: z.number().min(1).max(50).optional().default(15)
          .describe('Máximo de resultados (1-50). Default: 15')
      }),
      execute: async ({ query, limit }: { query: string; limit?: number }) => {
        const startTime = Date.now();
        logger.info('[Tool:searchContacts] Executing', { query, limit, enterpriseId: resolvedEnterpriseId });
        
        try {
          const sanitizedQuery = query.replace(/[%_]/g, '').trim();
          if (sanitizedQuery.length < 2) {
            return { success: false, error: 'El término de búsqueda debe tener al menos 2 caracteres.' };
          }
          
          let searchQuery = supabase
            .from('wp_contactos')
            .select(`
              id, nombre, apellido, telefono, email, estado, es_calificado, ultima_interaccion,
              asesor:wp_team_humano!team_humano_id(id, nombre, apellido)
            `, { count: 'exact' })
            .eq('empresa_id', resolvedEnterpriseId)
            .or(`nombre.ilike.%${sanitizedQuery}%,apellido.ilike.%${sanitizedQuery}%,telefono.ilike.%${sanitizedQuery}%,email.ilike.%${sanitizedQuery}%`);

          // SECURITY: Role 3 can only see their assigned contacts
          if (isRole3User) {
            const visibleIds = await getVisibleContactIdsForRole3();
            if (visibleIds.length === 0) {
              return { success: true, resumen: 'No tienes contactos asignados.', total: 0, contactos: [] };
            }
            searchQuery = searchQuery.in('id', visibleIds);
          }

          const { data: contacts, error, count } = await searchQuery
            .order('ultima_interaccion', { ascending: false, nullsFirst: false })
            .limit(limit || 15);
          
          if (error) {
            logger.error('[Tool:searchContacts] DB error', error);
            return { success: false, error: `Error de base de datos: ${error.message}` };
          }
          
          const results = contacts?.map((c: any, idx: number) => {
            const asesor = Array.isArray(c.asesor) ? c.asesor[0] : c.asesor;
            const fullName = `${c.nombre || ''} ${c.apellido || ''}`.trim() || '(Sin nombre)';
            return {
              posicion: idx + 1,
              id: c.id,
              nombre: fullName,
              telefono: c.telefono || '-',
              email: c.email || '-',
              estado: c.estado || 'Prospecto',
              calificado: c.es_calificado === 'si' || c.es_calificado === true ? 'Sí' : 'No',
              asesor: asesor ? `${asesor.nombre || ''} ${asesor.apellido || ''}`.trim() : 'Sin asignar',
              etiquetaMarkdown: buildContactMarkdownTag(fullName, c.id)
            };
          }) || [];
          
          logger.info('[Tool:searchContacts] Success', { found: results.length, totalMatch: count });
          
          // Build human-readable summary for AI
          const resumen = results.length === 0
            ? `No encontré contactos que coincidan con "${sanitizedQuery}". Intenta con otro término.`
            : results.length === 1
              ? `Encontré 1 contacto: ${results[0].nombre} (ID: ${results[0].id}, Tel: ${results[0].telefono})`
              : `Encontré ${results.length} contactos para "${sanitizedQuery}":\n${results.map(r => `${r.posicion}. ${r.nombre} (ID: ${r.id})`).join('\n')}`;
          
          return {
            success: true,
            resumen,
            total: results.length,
            contactos: results,
            _instruccion: results.length > 0 
              ? `Para ver detalles de un contacto, usa getContactContext con el ID. Ej: getContactContext({contactId: ${results[0].id}}). Si mencionas un contacto en la respuesta final, copia EXACTAMENTE su propiedad etiquetaMarkdown. Ejemplo: ${results[0].etiquetaMarkdown}`
              : null
          };
        } catch (err: any) {
          logger.error('[Tool:searchContacts] Exception', err);
          return { success: false, error: `Error inesperado: ${err.message}` };
        }
      }
    },

    // ─────────────────────────────────────────────────────────────────
    // TOOL 2: getContactContext - Contexto completo de UN contacto
    // ─────────────────────────────────────────────────────────────────
    getContactContext: {
      description: `Obtiene el historial COMPLETO de un contacto: perfil, conversaciones, citas y notas.

USAR CUANDO: "Dame más info de ese contacto", "¿Qué hablamos con Juan?", "El primero" (después de buscar)

⚠️ REQUISITO: Debes tener un ID válido de searchContacts. NO inventes IDs.

FLUJO CORRECTO:
1. Usuario: "Busca a Juan" → searchContacts → Retorna id:4521
2. Usuario: "Dame info del primero" → getContactContext({contactId: 4521})

FLUJO INCORRECTO:
❌ Usuario: "Info de Juan" → getContactContext({contactId: 12345}) ← ID inventado
✅ Correcto: Primero buscar con searchContacts, luego usar el ID real`,
      inputSchema: z.object({
        contactId: z.number().int().positive()
          .describe('ID numérico del contacto. DEBE venir de una búsqueda previa con searchContacts.')
      }),
      execute: async ({ contactId }: { contactId: number }) => {
        const startTime = Date.now();
        logger.info('[Tool:getContactContext] Executing', { contactId, enterpriseId: resolvedEnterpriseId });

        try {
          // SECURITY: Role 3 can only access their assigned contacts
          if (isRole3User) {
            const visibleIds = await getVisibleContactIdsForRole3();
            if (!visibleIds.includes(contactId)) {
              logger.warn('[Tool:getContactContext] Role 3 access denied', { contactId, teamMemberId: teamMember.id });
              return { success: false, error: `Contacto con ID ${contactId} no encontrado. Usa searchContacts para buscar tus contactos asignados.` };
            }
          }

          // Fetch contact with funnel stage
          const { data: contact, error: contactError } = await supabase
            .from('wp_contactos')
            .select(`
              id, nombre, apellido, telefono, email, estado, es_calificado, 
              origen, created_at, ultima_interaccion, metadata,
              etapa:wp_empresa_embudo!etapa_embudo(id, nombre_etapa)
            `)
            .eq('id', contactId)
            .eq('empresa_id', resolvedEnterpriseId)
            .maybeSingle();
          
          if (contactError) {
            logger.error('[Tool:getContactContext] DB error', contactError);
            return { success: false, error: `Error de base de datos: ${contactError.message}` };
          }
          
          if (!contact) {
            logger.warn('[Tool:getContactContext] Contact not found', { contactId });
            return { 
              success: false, 
              error: `Contacto con ID ${contactId} no encontrado. Usa searchContacts para buscar el contacto correcto.`
            };
          }
          
          // Parallel fetch related data
          const [conversationsRes, appointmentsRes, notesRes] = await Promise.all([
            supabase
              .from('wp_conversaciones')
              .select('id, canal, status, fecha_inicio, resumen')
              .eq('contacto_id', contactId)
              .order('fecha_inicio', { ascending: false })
              .limit(5),
            supabase
              .from('wp_citas')
              .select('id, titulo, fecha_hora, estado, tipo, duracion')
              .eq('contacto_id', contactId)
              .order('fecha_hora', { ascending: false })
              .limit(5),
            supabase
              .from('wp_contactos_nota')
              .select('id, descripcion, created_at')
              .eq('contacto_id', contactId)
              .order('created_at', { ascending: false })
              .limit(5)
          ]);
          
          const nombreCompleto = `${contact.nombre || ''} ${contact.apellido || ''}`.trim() || '(Sin nombre)';
          const etapaNombre = (contact.etapa as any)?.nombre_etapa || 'Sin etapa';
          const conversaciones = conversationsRes.data || [];
          const citas = appointmentsRes.data || [];
          const notas = notesRes.data || [];
          
          // Build comprehensive summary for AI
          const resumenParts = [
            `📋 **${nombreCompleto}** (ID: ${contact.id})`,
            `- Tel: ${contact.telefono || 'No registrado'}`,
            `- Email: ${contact.email || 'No registrado'}`,
            `- Estado: ${contact.estado || 'Prospecto'} | Calificado: ${contact.es_calificado === 'si' ? 'Sí' : 'No'}`,
            `- Etapa embudo: ${etapaNombre}`,
            `- Origen: ${contact.origen || 'Desconocido'}`,
            `- Cliente desde: ${contact.created_at ? new Date(contact.created_at).toLocaleDateString('es') : 'N/A'}`,
            `- Última interacción: ${contact.ultima_interaccion ? new Date(contact.ultima_interaccion).toLocaleDateString('es') : 'Sin registro'}`
          ];
          
          if (conversaciones.length > 0) {
            resumenParts.push(`\n💬 **Conversaciones recientes (${conversaciones.length}):**`);
            conversaciones.forEach(c => {
              resumenParts.push(`- ${c.canal || 'Chat'}: ${c.resumen || '(Sin resumen)'} [${c.status || 'activo'}]`);
            });
          } else {
            resumenParts.push(`\n💬 Sin conversaciones registradas`);
          }
          
          if (citas.length > 0) {
            resumenParts.push(`\n📅 **Citas (${citas.length}):**`);
            citas.forEach(a => {
              const fecha = a.fecha_hora ? new Date(a.fecha_hora).toLocaleString('es') : 'Sin fecha';
              resumenParts.push(`- ${a.titulo || 'Cita'}: ${fecha} [${a.estado || 'pendiente'}]`);
            });
          } else {
            resumenParts.push(`\n📅 Sin citas registradas`);
          }
          
          if (notas.length > 0) {
            resumenParts.push(`\n📝 **Notas del equipo (${notas.length}):**`);
            notas.forEach(n => {
              const fecha = n.created_at ? new Date(n.created_at).toLocaleDateString('es') : '';
              const texto = (n.descripcion || '').substring(0, 100);
              resumenParts.push(`- ${fecha}: ${texto}${(n.descripcion || '').length > 100 ? '...' : ''}`);
            });
          } else {
            resumenParts.push(`\n📝 Sin notas registradas`);
          }
          
          logger.info('[Tool:getContactContext] Success', { 
            contactId, 
            conversations: conversaciones.length,
            appointments: citas.length,
            notes: notas.length
          });
          
          return {
            success: true,
            resumen: resumenParts.join('\n'),
            contacto: {
              id: contact.id,
              nombre: nombreCompleto,
              etiquetaMarkdown: buildContactMarkdownTag(nombreCompleto, contact.id),
              telefono: contact.telefono,
              email: contact.email,
              estado: contact.estado || 'Prospecto',
              calificado: contact.es_calificado === 'si' ? 'Sí' : 'No',
              origen: contact.origen,
              etapa: etapaNombre,
              clienteDesde: contact.created_at,
              ultimaInteraccion: contact.ultima_interaccion
            },
            conversaciones: conversaciones.map(c => ({
              id: c.id,
              canal: c.canal,
              estado: c.status,
              resumen: c.resumen || '(Sin resumen)'
            })),
            citas: citas.map(a => ({
              id: a.id,
              titulo: a.titulo,
              fecha: a.fecha_hora,
              estado: a.estado
            })),
            notas: notas.map(n => ({
              id: n.id,
              texto: n.descripcion,
              fecha: n.created_at
            })),
            totales: {
              conversaciones: conversaciones.length,
              citas: citas.length,
              notas: notas.length
            },
            _instruccion: `Si mencionas este contacto en la respuesta final, copia EXACTAMENTE esta etiqueta: ${buildContactMarkdownTag(nombreCompleto, contact.id)}`
          };
        } catch (err: any) {
          logger.error('[Tool:getContactContext] Exception', err);
          return { success: false, error: `Error inesperado: ${err.message}` };
        }
      }
    },

    // ─────────────────────────────────────────────────────────────────
    // TOOL 3: createNote - Crear nota para un contacto
    // ─────────────────────────────────────────────────────────────────
    createNote: {
      description: `Crea una nota en el historial de un contacto.

USAR CUANDO: "Anota que Juan llamó", "Registra que pidió cotización", "Guarda esta info"

⚠️ REQUISITO: Necesitas el contactId de searchContacts.

EJEMPLO:
1. searchContacts({query: "Juan"}) → Retorna id: 4521
2. createNote({contactId: 4521, texto: "Llamó interesado en plan premium"})`,
      inputSchema: z.object({
        contactId: z.number().int().positive()
          .describe('ID del contacto. DEBE venir de searchContacts.'),
        texto: z.string().min(3).max(2000)
          .describe('Contenido de la nota. Sé descriptivo.')
      }),
      execute: async ({ contactId, texto }: { contactId: number; texto: string }) => {
        const startTime = Date.now();
        logger.info('[Tool:createNote] Executing', { contactId, textoLength: texto.length });
        
        try {
          // Verify contact exists
          const { data: contact, error: verifyError } = await supabase
            .from('wp_contactos')
            .select('id, nombre, apellido')
            .eq('id', contactId)
            .eq('empresa_id', resolvedEnterpriseId)
            .maybeSingle();
          
          if (verifyError) {
            return { success: false, error: `Error de base de datos: ${verifyError.message}` };
          }
          
          if (!contact) {
            return { 
              success: false, 
              error: `Contacto con ID ${contactId} no encontrado. Usa searchContacts para buscar el contacto correcto.`
            };
          }
          
          // Create the note
          const { data: note, error: insertError } = await supabase
            .from('wp_contactos_nota')
            .insert({
              contacto_id: contactId,
              descripcion: texto.trim(),
              team_humano_id: teamMember.id
            })
            .select('id, descripcion, created_at')
            .single();
          
          if (insertError) {
            logger.error('[Tool:createNote] Insert error', insertError);
            return { success: false, error: `Error al guardar: ${insertError.message}` };
          }
          
          const contactName = `${contact.nombre || ''} ${contact.apellido || ''}`.trim() || 'el contacto';
          
          logger.info('[Tool:createNote] Success', { noteId: note.id, contactId });
          
          return {
            success: true,
            resumen: `✅ Nota guardada para ${contactName}`,
            nota: {
              id: note.id,
              texto: note.descripcion,
              fecha: note.created_at,
              contacto: contactName
            }
          };
        } catch (err: any) {
          logger.error('[Tool:createNote] Exception', err);
          return { success: false, error: `Error inesperado: ${err.message}` };
        }
      }
    },

    getContactPortfolio: {
      description: `💼 OBTENER CARTERA DE UN CONTACTO

Consulta la cartera financiera completa de un contacto: servicios, saldos, pagos, facturas y señales operativas.

USAR CUANDO:
- "¿Cómo está la cartera de Juan?"
- "Muéstrame servicios y pagos del contacto"
- "¿Qué tiene pendiente este cliente?"

RETORNA: resumen financiero, servicios, señales de mora y cola operativa por servicio.
⚠️ IMPORTANTE: Usa el contactId real obtenido de searchContacts o getContactContext.`,
      inputSchema: z.object({
        contactId: z.number().int().positive()
          .describe('ID del contacto. Usa searchContacts o getContactContext para obtenerlo.'),
        includeInvoices: z.boolean().optional().default(false)
          .describe('Incluir detalle de facturas en la respuesta.'),
        includePayments: z.boolean().optional().default(true)
          .describe('Incluir detalle de pagos en la respuesta.')
      }),
      execute: async ({ contactId, includeInvoices = false, includePayments = true }: {
        contactId: number;
        includeInvoices?: boolean;
        includePayments?: boolean;
      }) => {
        logger.info('[Tool:getContactPortfolio] Executing', { contactId, includeInvoices, includePayments, enterpriseId: resolvedEnterpriseId });

        try {
          // SECURITY: Role 3 can only access their assigned contacts' portfolio
          if (isRole3User) {
            const visibleIds = await getVisibleContactIdsForRole3();
            if (!visibleIds.includes(contactId)) {
              logger.warn('[Tool:getContactPortfolio] Role 3 access denied', { contactId, teamMemberId: teamMember.id });
              return { success: false, error: `Contacto con ID ${contactId} no encontrado. Usa searchContacts para buscar tus contactos asignados.` };
            }
          }

          const { data: contact, error: contactError } = await supabase
            .from('wp_contactos')
            .select(contactSelectFields)
            .eq('id', contactId)
            .eq('empresa_id', resolvedEnterpriseId)
            .maybeSingle();

          if (contactError) {
            return { success: false, error: `Error de base de datos: ${contactError.message}` };
          }

          if (!contact) {
            return { success: false, error: `Contacto con ID ${contactId} no encontrado. Usa searchContacts para ubicar el contacto correcto.` };
          }

          const { data: services, error: servicesError } = await supabase
            .from('wp_crm_servicios')
            .select(serviceSelectFields)
            .eq('empresa_id', resolvedEnterpriseId)
            .eq('contacto_id', contactId)
            .order('created_at', { ascending: false });

          if (servicesError) {
            return { success: false, error: `Error de base de datos: ${servicesError.message}` };
          }

          const serviceRows = services || [];
          const serviceIds = serviceRows.map(service => service.id).filter(Boolean);

          const [paymentsRes, invoicesRes] = serviceIds.length > 0
            ? await Promise.all([
                supabase
                  .from('wp_crm_pagos')
                  .select('id, empresa_id, servicio_id, contacto_id, monto, moneda, fecha_pago, metodo_pago, referencia, estado, nota, comprobante_url, created_at, updated_at')
                  .eq('empresa_id', resolvedEnterpriseId)
                  .eq('contacto_id', contactId)
                  .in('servicio_id', serviceIds)
                  .order('fecha_pago', { ascending: false }),
                supabase
                  .from('wp_facturas')
                  .select('id, empresa_id, contacto_id, servicio_id, numero_factura, estado, moneda, total, monto_pagado, saldo_pendiente, fecha_emision, fecha_vencimiento, pdf_url, created_at')
                  .eq('empresa_id', resolvedEnterpriseId)
                  .eq('contacto_id', contactId)
                  .order('created_at', { ascending: false })
              ])
            : [
                { data: [], error: null },
                { data: [], error: null }
              ];

          if (paymentsRes.error) {
            return { success: false, error: `Error de base de datos: ${paymentsRes.error.message}` };
          }

          if (invoicesRes.error) {
            return { success: false, error: `Error de base de datos: ${invoicesRes.error.message}` };
          }

          const payments = paymentsRes.data || [];
          const invoices = invoicesRes.data || [];
          const paymentsByService = new Map<number, any[]>();
          const invoicesByService = new Map<number, any[]>();

          payments.forEach(payment => {
            paymentsByService.set(payment.servicio_id, [...(paymentsByService.get(payment.servicio_id) || []), payment]);
          });

          invoices.forEach(invoice => {
            if (!invoice.servicio_id) return;
            invoicesByService.set(invoice.servicio_id, [...(invoicesByService.get(invoice.servicio_id) || []), invoice]);
          });

          const queueSource = serviceRows.map(service => buildPortfolioQueueItem(
            service,
            paymentsByService.get(service.id) || [],
            invoicesByService.get(service.id) || []
          ));
          const sortedQueue = sortPortfolioQueueItems(queueSource.filter(item => item.service.estado !== 'cancelado' && (toNumber(item.service.saldo_pendiente) > 0 || item.overdueInvoices > 0)));
          const queue = sortedQueue.map(item => ({
            serviceId: item.service.id,
            serviceName: item.service.nombre_servicio,
            title: item.title,
            priority: item.priority,
            severity: item.severity,
            agingBucket: item.agingBucket,
            agingLabel: item.agingLabel,
            amount: toNumber(item.amount),
            dueDate: item.commitment.dueDate,
            overdueInvoices: item.overdueInvoices,
            lastPaymentDate: item.lastPaymentDate ? item.lastPaymentDate.toISOString() : null,
            commitment: item.commitment,
            actionHint: buildServiceActionHint(item)
          }));

          const summary = buildFinanceSummary(serviceRows);
          const contactName = buildContactDisplayName(contact);
          const lastPaymentDate = getLastConfirmedPaymentDate(payments);
          const servicesPayload = serviceRows.map(service => {
            const servicePayments = paymentsByService.get(service.id) || [];
            const serviceInvoices = invoicesByService.get(service.id) || [];
            const queueItem = buildPortfolioQueueItem(service, servicePayments, serviceInvoices);
            const proposedMonthlyAmount = service.cuota_mensual === null || service.cuota_mensual === undefined ? null : toNumber(service.cuota_mensual);
            return {
              id: service.id,
              nombre: service.nombre_servicio,
              tipo: service.tipo_servicio || 'general',
              descripcion: service.descripcion || null,
              moneda: service.moneda || 'USD',
              valorTotal: toNumber(service.valor_total),
              saldoPagado: toNumber(service.saldo_pagado),
              saldoPendiente: toNumber(service.saldo_pendiente),
              cuotaMensual: proposedMonthlyAmount,
              montoMensualPropuesto: proposedMonthlyAmount,
              proposedMonthlyAmount,
              diaCompromisoPago: service.dia_compromiso_pago ?? null,
              estado: service.estado,
              fechaInicio: service.fecha_inicio,
              fechaFin: service.fecha_fin || null,
              contratoUrl: service.contrato_url || null,
              porcentajePagado: toNumber(service.valor_total) > 0 ? Math.min(100, Math.round((toNumber(service.saldo_pagado) / toNumber(service.valor_total)) * 100)) : 0,
              agingBucket: queueItem.agingBucket,
              agingLabel: queueItem.agingLabel,
              overdueInvoices: queueItem.overdueInvoices,
              lastPaymentDate: queueItem.lastPaymentDate ? queueItem.lastPaymentDate.toISOString() : null,
              commitment: queueItem.commitment,
              actionHint: buildServiceActionHint(queueItem),
              pagos: includePayments ? servicePayments.map(serializePaymentRecord) : undefined,
              facturas: includeInvoices ? serviceInvoices.map(serializeInvoiceRecord) : undefined
            };
          });

          const signals = {
            overdueServices: sortedQueue.filter(item => item.commitment.daysOverdue > 0 || item.overdueInvoices > 0).length,
            servicesWithoutCommitment: sortedQueue.filter(item => item.commitment.status === 'sin_configurar' && toNumber(item.service.saldo_pendiente) > 0).length,
            overdueInvoices: countOverdueInvoices(invoices),
            lastPaymentDate: lastPaymentDate ? lastPaymentDate.toISOString() : null
          };

          const resumen = serviceRows.length === 0
            ? `💼 **${contactName}** no tiene servicios registrados en cartera.`
            : [
                `💼 **Cartera de ${contactName}**`,
                `- Servicios: ${serviceRows.length}`,
                `- Total contratado: ${summary.moneda} ${summary.totalContratado.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                `- Total pagado: ${summary.moneda} ${summary.totalPagado.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                `- Total pendiente: ${summary.moneda} ${summary.totalPendiente.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                `- Servicios en mora: ${signals.overdueServices}`,
                `- Facturas vencidas: ${signals.overdueInvoices}`,
                `- Sin compromiso configurado: ${signals.servicesWithoutCommitment}`
              ].join('\n');

          return {
            success: true,
            resumen,
            contact: {
              id: contact.id,
              nombre: contactName,
              etiquetaMarkdown: buildContactMarkdownTag(contactName, contact.id),
              telefono: contact.telefono || null,
              email: contact.email || null,
              estado: contact.estado || null
            },
            summary,
            services: servicesPayload,
            signals,
            queue,
            queueStats: buildQueueStats(sortedQueue),
            _instruccion: serviceRows.length > 0 ? `Usa serviceId real para profundizar con getServiceLedger. Para mutaciones financieras usa registerPayment o updateServiceCollectionSettings.` : null
          };
        } catch (err: any) {
          logger.error('[Tool:getContactPortfolio] Exception', err);
          return { success: false, error: `Error inesperado: ${err.message}` };
        }
      }
    },

    getServiceLedger: {
      description: `📒 OBTENER LEDGER DE UN SERVICIO

Obtiene el detalle financiero y operativo de un servicio específico: saldo, pagos, compromiso y facturas.

USAR CUANDO:
- "Abre el detalle del servicio 123"
- "¿Qué pagos tiene este servicio?"
- "¿Por qué está en mora este servicio?"

RETORNA: servicio, pagos, facturas, compromiso actual y siguiente acción sugerida.`,
      inputSchema: z.object({
        serviceId: z.number().int().positive()
          .describe('ID del servicio en cartera.')
      }),
      execute: async ({ serviceId }: { serviceId: number }) => {
        logger.info('[Tool:getServiceLedger] Executing', { serviceId, enterpriseId: resolvedEnterpriseId });

        try {
          const { data: service, error: serviceError } = await supabase
            .from('wp_crm_servicios')
            .select(serviceSelectFields)
            .eq('id', serviceId)
            .eq('empresa_id', resolvedEnterpriseId)
            .maybeSingle();

          if (serviceError) {
            return { success: false, error: `Error de base de datos: ${serviceError.message}` };
          }

          if (!service) {
            return { success: false, error: `Servicio con ID ${serviceId} no encontrado en esta empresa.` };
          }

          // SECURITY: Role 3 can only access their assigned contacts' services
          if (isRole3User && service.contacto_id) {
            const visibleIds = await getVisibleContactIdsForRole3();
            if (!visibleIds.includes(service.contacto_id)) {
              logger.warn('[Tool:getServiceLedger] Role 3 access denied', { serviceId, contactoId: service.contacto_id, teamMemberId: teamMember.id });
              return { success: false, error: `Servicio con ID ${serviceId} no encontrado.` };
            }
          }

          const [paymentsRes, invoicesRes] = await Promise.all([
            supabase
              .from('wp_crm_pagos')
              .select('id, empresa_id, servicio_id, contacto_id, monto, moneda, fecha_pago, metodo_pago, referencia, estado, nota, comprobante_url, created_at, updated_at')
              .eq('empresa_id', resolvedEnterpriseId)
              .eq('servicio_id', serviceId)
              .order('fecha_pago', { ascending: false }),
            supabase
              .from('wp_facturas')
              .select('id, empresa_id, contacto_id, servicio_id, numero_factura, estado, moneda, total, monto_pagado, saldo_pendiente, fecha_emision, fecha_vencimiento, pdf_url, created_at')
              .eq('empresa_id', resolvedEnterpriseId)
              .eq('servicio_id', serviceId)
              .order('created_at', { ascending: false })
          ]);

          if (paymentsRes.error) {
            return { success: false, error: `Error de base de datos: ${paymentsRes.error.message}` };
          }

          if (invoicesRes.error) {
            return { success: false, error: `Error de base de datos: ${invoicesRes.error.message}` };
          }

          const payments = paymentsRes.data || [];
          const invoices = invoicesRes.data || [];
          const queueItem = buildPortfolioQueueItem(service, payments, invoices);
          const contact = Array.isArray(service.contacto) ? service.contacto[0] : service.contacto;
          const contactName = buildContactDisplayName(contact);
          const totalPaymentsRecorded = payments.reduce((sum, payment) => sum + toNumber(payment.monto), 0);
          const totalPaymentsConfirmed = payments
            .filter(payment => payment.estado === 'confirmado')
            .reduce((sum, payment) => sum + toNumber(payment.monto), 0);
          const invoiceBalance = invoices.reduce((sum, invoice) => sum + toNumber(invoice.saldo_pendiente), 0);

          const proposedMonthlyAmount = service.cuota_mensual === null || service.cuota_mensual === undefined ? null : toNumber(service.cuota_mensual);
          const resumen = [
            `📒 **${service.nombre_servicio}** (ID: ${service.id})`,
            `- Contacto: ${contact ? buildContactMarkdownTag(contactName, contact.id) : 'Sin contacto'}`,
            `- Estado: ${service.estado}`,
            `- Saldo pendiente: ${service.moneda || 'USD'} ${toNumber(service.saldo_pendiente).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            `- Compromiso: ${queueItem.commitment.label} · ${queueItem.agingLabel}`,
            `- Pagos registrados: ${payments.length}`,
            `- Facturas: ${invoices.length} (${queueItem.overdueInvoices} vencidas)`,
            `- Siguiente acción: ${buildServiceActionHint(queueItem)}`
          ].join('\n');

          return {
            success: true,
            resumen,
            contact: contact ? {
              id: contact.id,
              nombre: contactName,
              etiquetaMarkdown: buildContactMarkdownTag(contactName, contact.id),
              telefono: contact.telefono || null,
              email: contact.email || null
            } : null,
            service: {
              id: service.id,
              nombre: service.nombre_servicio,
              tipo: service.tipo_servicio || 'general',
              descripcion: service.descripcion || null,
              moneda: service.moneda || 'USD',
              valorTotal: toNumber(service.valor_total),
              saldoPagado: toNumber(service.saldo_pagado),
              saldoPendiente: toNumber(service.saldo_pendiente),
              cuotaMensual: proposedMonthlyAmount,
              montoMensualPropuesto: proposedMonthlyAmount,
              proposedMonthlyAmount,
              diaCompromisoPago: service.dia_compromiso_pago ?? null,
              estado: service.estado,
              fechaInicio: service.fecha_inicio,
              fechaFin: service.fecha_fin || null,
              contratoUrl: service.contrato_url || null,
              metadata: service.metadata || null
            },
            commitment: queueItem.commitment,
            queue: {
              title: queueItem.title,
              priority: queueItem.priority,
              severity: queueItem.severity,
              agingBucket: queueItem.agingBucket,
              agingLabel: queueItem.agingLabel,
              amount: toNumber(queueItem.amount),
              overdueInvoices: queueItem.overdueInvoices,
              dueDate: queueItem.commitment.dueDate,
              lastPaymentDate: queueItem.lastPaymentDate ? queueItem.lastPaymentDate.toISOString() : null
            },
            payments: payments.map(serializePaymentRecord),
            invoices: invoices.map(serializeInvoiceRecord),
            totals: {
              totalPaymentsRecorded,
              totalPaymentsConfirmed,
              invoiceBalance,
              overdueInvoices: queueItem.overdueInvoices,
              paymentsCount: payments.length,
              invoicesCount: invoices.length
            },
            nextActionHint: buildServiceActionHint(queueItem),
            _instruccion: `Para registrar un pago usa registerPayment({serviceId: ${service.id}, amount: ..., confirm: false}). Para ajustar compromiso usa updateServiceCollectionSettings({serviceId: ${service.id}, ...}).`
          };
        } catch (err: any) {
          logger.error('[Tool:getServiceLedger] Exception', err);
          return { success: false, error: `Error inesperado: ${err.message}` };
        }
      }
    },

    getCollectionQueue: {
      description: `📋 OBTENER COLA DE COBRANZA

Lista los servicios prioritarios de cartera a nivel empresa con la misma lógica operativa de la mesa de cobranza.

USAR CUANDO:
- "¿A quién debo cobrar hoy?"
- "Dame los casos más urgentes de cartera"
- "Muéstrame cartera vencida"

RETORNA: items priorizados, métricas por bucket y señales de urgencia.`,
      inputSchema: z.object({
        limit: z.number().int().min(1).max(100).optional().default(20)
          .describe('Máximo de items retornados.'),
        onlyOverdue: z.boolean().optional().default(false)
          .describe('true = solo casos vencidos, vence hoy o con facturas vencidas.'),
        onlyWithInvoicesOverdue: z.boolean().optional().default(false)
          .describe('true = solo servicios con al menos una factura vencida.'),
        teamMemberId: z.number().int().positive().optional()
          .describe('Filtrar por asesor/responsable del contacto.')
      }),
      execute: async ({ limit = 20, onlyOverdue = false, onlyWithInvoicesOverdue = false, teamMemberId }: {
        limit?: number;
        onlyOverdue?: boolean;
        onlyWithInvoicesOverdue?: boolean;
        teamMemberId?: number;
      }) => {
        // SECURITY: Role 3 can only see their own collection queue
        if (isRole3User) {
          teamMemberId = teamMember.id;
        }

        logger.info('[Tool:getCollectionQueue] Executing', { limit, onlyOverdue, onlyWithInvoicesOverdue, teamMemberId, enterpriseId: resolvedEnterpriseId });

        try {
          if (teamMemberId) {
            const { data: teamMemberCheck, error: teamMemberError } = await supabase
              .from('wp_team_humano')
              .select('id')
              .eq('id', teamMemberId)
              .eq('empresa_id', resolvedEnterpriseId)
              .eq('is_active', true)
              .maybeSingle();

            if (teamMemberError) {
              return { success: false, error: `Error de base de datos: ${teamMemberError.message}` };
            }

            if (!teamMemberCheck) {
              return { success: false, error: `Miembro del equipo con ID ${teamMemberId} no encontrado o inactivo. Usa getTeamMembers para obtener IDs válidos.` };
            }
          }

          let contactIdsFilter: number[] | null = null;

          if (teamMemberId) {
            const { data: contactRows, error: contactRowsError } = await supabase
              .from('wp_contactos')
              .select('id')
              .eq('empresa_id', resolvedEnterpriseId)
              .eq('team_humano_id', teamMemberId);

            if (contactRowsError) {
              return { success: false, error: `Error de base de datos: ${contactRowsError.message}` };
            }

            contactIdsFilter = (contactRows || []).map(row => row.id);

            if (contactIdsFilter.length === 0) {
              return {
                success: true,
                resumen: 'No hay servicios de cartera para los contactos asignados a ese miembro del equipo.',
                items: [],
                stats: buildQueueStats([]),
                filters: { limit, onlyOverdue, onlyWithInvoicesOverdue, teamMemberId }
              };
            }
          }

          let servicesQuery = supabase
            .from('wp_crm_servicios')
            .select(serviceSelectFields)
            .eq('empresa_id', resolvedEnterpriseId)
            .neq('estado', 'cancelado')
            .order('created_at', { ascending: false });

          if (contactIdsFilter) {
            servicesQuery = servicesQuery.in('contacto_id', contactIdsFilter);
          }

          const { data: services, error: servicesError } = await servicesQuery;

          if (servicesError) {
            return { success: false, error: `Error de base de datos: ${servicesError.message}` };
          }

          const serviceRows = services || [];
          const serviceIds = serviceRows.map(service => service.id).filter(Boolean);

          if (serviceIds.length === 0) {
            return {
              success: true,
              resumen: 'No hay servicios en cartera para construir la cola de cobranza.',
              items: [],
              stats: buildQueueStats([]),
              filters: { limit, onlyOverdue, onlyWithInvoicesOverdue, teamMemberId }
            };
          }

          const [paymentsRes, invoicesRes] = await Promise.all([
            supabase
              .from('wp_crm_pagos')
              .select('id, empresa_id, servicio_id, contacto_id, monto, moneda, fecha_pago, metodo_pago, referencia, estado, nota, comprobante_url, created_at, updated_at')
              .eq('empresa_id', resolvedEnterpriseId)
              .in('servicio_id', serviceIds)
              .order('fecha_pago', { ascending: false }),
            supabase
              .from('wp_facturas')
              .select('id, empresa_id, contacto_id, servicio_id, numero_factura, estado, moneda, total, monto_pagado, saldo_pendiente, fecha_emision, fecha_vencimiento, pdf_url, created_at')
              .eq('empresa_id', resolvedEnterpriseId)
              .in('servicio_id', serviceIds)
              .order('created_at', { ascending: false })
          ]);

          if (paymentsRes.error) {
            return { success: false, error: `Error de base de datos: ${paymentsRes.error.message}` };
          }

          if (invoicesRes.error) {
            return { success: false, error: `Error de base de datos: ${invoicesRes.error.message}` };
          }

          const paymentsByService = new Map<number, any[]>();
          const invoicesByService = new Map<number, any[]>();

          (paymentsRes.data || []).forEach(payment => {
            paymentsByService.set(payment.servicio_id, [...(paymentsByService.get(payment.servicio_id) || []), payment]);
          });

          (invoicesRes.data || []).forEach(invoice => {
            if (!invoice.servicio_id) return;
            invoicesByService.set(invoice.servicio_id, [...(invoicesByService.get(invoice.servicio_id) || []), invoice]);
          });

          let queueItems = serviceRows
            .filter(service => toNumber(service.saldo_pendiente) > 0 || countOverdueInvoices(invoicesByService.get(service.id) || []) > 0)
            .map(service => buildPortfolioQueueItem(
              service,
              paymentsByService.get(service.id) || [],
              invoicesByService.get(service.id) || []
            ));

          if (onlyOverdue) {
            queueItems = queueItems.filter(item => item.commitment.daysOverdue > 0 || item.commitment.status === 'vence_hoy' || item.overdueInvoices > 0);
          }

          if (onlyWithInvoicesOverdue) {
            queueItems = queueItems.filter(item => item.overdueInvoices > 0);
          }

          const sortedQueue = sortPortfolioQueueItems(queueItems);
          const stats = buildQueueStats(sortedQueue);
          const items = sortedQueue.slice(0, limit).map(item => {
            const contact = Array.isArray(item.service.contacto) ? item.service.contacto[0] : item.service.contacto;
            const contactName = buildContactDisplayName(contact);
            const proposedMonthlyAmount = item.service.cuota_mensual === null || item.service.cuota_mensual === undefined ? null : toNumber(item.service.cuota_mensual);
            return {
              serviceId: item.service.id,
              serviceName: item.service.nombre_servicio,
              serviceStatus: item.service.estado,
              contact: contact ? {
                id: contact.id,
                nombre: contactName,
                etiquetaMarkdown: buildContactMarkdownTag(contactName, contact.id),
                telefono: contact.telefono || null,
                email: contact.email || null
              } : null,
              title: item.title,
              priority: item.priority,
              severity: item.severity,
              agingBucket: item.agingBucket,
              agingLabel: item.agingLabel,
              amount: toNumber(item.amount),
              currency: item.service.moneda || 'USD',
              cuotaMensual: proposedMonthlyAmount,
              montoMensualPropuesto: proposedMonthlyAmount,
              proposedMonthlyAmount,
              dueDate: item.commitment.dueDate,
              overdueInvoices: item.overdueInvoices,
              pendingBalance: toNumber(item.service.saldo_pendiente),
              lastPaymentDate: item.lastPaymentDate ? item.lastPaymentDate.toISOString() : null,
              commitment: item.commitment,
              actionHint: buildServiceActionHint(item)
            };
          });

          const resumen = items.length === 0
            ? 'No hay items que cumplan los filtros solicitados en la cola de cobranza.'
            : [
                `📋 **Cola de cobranza**`,
                `- Casos evaluados: ${sortedQueue.length}`,
                `- En mora: ${stats.overdue}`,
                `- Facturas vencidas: ${stats.overdueInvoices}`,
                `- Vence hoy: ${stats.dueToday}`,
                `- Top prioridad: ${items[0].title} · ${items[0].serviceName}`
              ].join('\n');

          return {
            success: true,
            resumen,
            items,
            stats,
            filters: { limit, onlyOverdue, onlyWithInvoicesOverdue, teamMemberId }
          };
        } catch (err: any) {
          logger.error('[Tool:getCollectionQueue] Exception', err);
          return { success: false, error: `Error inesperado: ${err.message}` };
        }
      }
    },

    registerPayment: {
      description: `💳 REGISTRAR PAGO

Registra un pago en cartera. Usa confirmación en dos pasos para evitar mutaciones financieras accidentales.

USAR CUANDO:
- "Registra un pago de 500 al servicio 123"
- "Anota un abono pendiente"
- "Confirma este pago en cartera"

FLUJO RECOMENDADO:
1. Llama con confirm:false para obtener un preview.
2. Solo usa confirm:true cuando el usuario ya confirmó el monto y el servicio.

RETORNA: preview o pago creado con saldos actualizados.`,
      inputSchema: z.object({
        serviceId: z.number().int().positive()
          .describe('ID del servicio al que pertenece el pago.'),
        amount: z.number().positive()
          .describe('Monto del pago.'),
        paymentDate: z.string().optional()
          .describe('Fecha del pago en formato ISO o YYYY-MM-DD.'),
        paymentMethod: z.string().max(100).optional()
          .describe('Método de pago.'),
        reference: z.string().max(200).optional()
          .describe('Referencia, operación o código del pago.'),
        status: z.enum(PAYMENT_STATUS_VALUES).optional().default('confirmado')
          .describe('Estado del pago.'),
        note: z.string().max(2000).optional()
          .describe('Nota interna del pago.'),
        confirm: z.boolean().optional().default(false)
          .describe('false = preview, true = ejecutar registro del pago.')
      }),
      execute: async ({ serviceId, amount, paymentDate, paymentMethod, reference, status = 'confirmado', note, confirm = false }: {
        serviceId: number;
        amount: number;
        paymentDate?: string;
        paymentMethod?: string;
        reference?: string;
        status?: typeof PAYMENT_STATUS_VALUES[number];
        note?: string;
        confirm?: boolean;
      }) => {
        logger.info('[Tool:registerPayment] Executing', { serviceId, amount, status, confirm, enterpriseId: resolvedEnterpriseId });

        try {
          const normalizedAmount = toNumber(amount);
          if (normalizedAmount <= 0) {
            return { success: false, error: 'El monto debe ser mayor que 0.' };
          }

          const { data: service, error: serviceError } = await supabase
            .from('wp_crm_servicios')
            .select(serviceSelectFields)
            .eq('id', serviceId)
            .eq('empresa_id', resolvedEnterpriseId)
            .maybeSingle();

          if (serviceError) {
            return { success: false, error: `Error de base de datos: ${serviceError.message}` };
          }

          if (!service) {
            return { success: false, error: `Servicio con ID ${serviceId} no encontrado en esta empresa.` };
          }

          const contact = Array.isArray(service.contacto) ? service.contacto[0] : service.contacto;
          const contactName = buildContactDisplayName(contact);
          const currentPaid = toNumber(service.saldo_pagado);
          const currentPending = toNumber(service.saldo_pendiente);
          const impactsBalance = status === 'confirmado';
          const estimatedPaid = impactsBalance ? currentPaid + normalizedAmount : currentPaid;
          const estimatedPending = impactsBalance ? currentPending - normalizedAmount : currentPending;
          const warnings = [] as string[];

          if (impactsBalance && normalizedAmount > currentPending) {
            warnings.push('El monto excede el saldo pendiente actual del servicio.');
          }

          if (!confirm) {
            const resumen = [
              `⚠️ **Preview de registro de pago**`,
              `- Servicio: ${service.nombre_servicio} (ID: ${service.id})`,
              `- Contacto: ${contact ? buildContactMarkdownTag(contactName, contact.id) : 'Sin contacto'}`,
              `- Monto: ${service.moneda || 'USD'} ${normalizedAmount.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
              `- Estado del pago: ${status}`,
              impactsBalance
                ? `- Saldo estimado tras registrar: ${service.moneda || 'USD'} ${estimatedPending.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : '- Este estado no impactará el saldo pagado del servicio.'
            ].join('\n');

            return {
              success: true,
              resumen,
              requiresConfirmation: true,
              preview: {
                serviceId: service.id,
                serviceName: service.nombre_servicio,
                contactId: contact?.id || service.contacto_id,
                amount: normalizedAmount,
                currency: service.moneda || 'USD',
                status,
                paymentDate: paymentDate || new Date().toISOString(),
                paymentMethod: paymentMethod || null,
                reference: reference || null,
                note: note || null,
                impactsBalance,
                currentPaid,
                currentPending,
                estimatedPaid,
                estimatedPending,
                warnings
              },
              _instruccion: `Si el usuario confirma, vuelve a llamar registerPayment con los mismos datos y confirm:true para ejecutar el registro. Si además quiere adjuntar un comprobante desde el chat, después usa attachPaymentReceipt con el paymentId creado.`
            };
          }

          const { data: payment, error: paymentError } = await supabase
            .from('wp_crm_pagos')
            .insert({
              empresa_id: resolvedEnterpriseId,
              servicio_id: service.id,
              contacto_id: service.contacto_id,
              monto: normalizedAmount,
              moneda: service.moneda || 'USD',
              fecha_pago: paymentDate || new Date().toISOString(),
              metodo_pago: paymentMethod || null,
              referencia: reference || null,
              estado: status,
              nota: note || null,
              registrado_por: teamMember.id,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .select('id, empresa_id, servicio_id, contacto_id, monto, moneda, fecha_pago, metodo_pago, referencia, estado, nota, comprobante_url, created_at, updated_at')
            .single();

          if (paymentError) {
            return { success: false, error: `Error al registrar pago: ${paymentError.message}` };
          }

          const { data: refreshedService, error: refreshedServiceError } = await supabase
            .from('wp_crm_servicios')
            .select(serviceSelectFields)
            .eq('id', service.id)
            .eq('empresa_id', resolvedEnterpriseId)
            .maybeSingle();

          if (refreshedServiceError) {
            return { success: false, error: `Pago registrado, pero no se pudo refrescar el servicio: ${refreshedServiceError.message}` };
          }

          const resumen = [
            `✅ **Pago registrado**`,
            `- Servicio: ${service.nombre_servicio} (ID: ${service.id})`,
            `- Contacto: ${contact ? buildContactMarkdownTag(contactName, contact.id) : 'Sin contacto'}`,
            `- Pago ID: ${payment.id}`,
            `- Monto: ${payment.moneda || 'USD'} ${toNumber(payment.monto).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            `- Estado: ${payment.estado}`,
            refreshedService && payment.estado === 'confirmado'
              ? `- Nuevo saldo pendiente: ${refreshedService.moneda || 'USD'} ${toNumber(refreshedService.saldo_pendiente).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : '- El saldo del servicio no cambió porque el pago no quedó confirmado.'
          ].join('\n');

          return {
            success: true,
            resumen,
            payment: serializePaymentRecord(payment),
            service: refreshedService ? {
              id: refreshedService.id,
              nombre: refreshedService.nombre_servicio,
              estado: refreshedService.estado,
              saldoPagado: toNumber(refreshedService.saldo_pagado),
              saldoPendiente: toNumber(refreshedService.saldo_pendiente),
              moneda: refreshedService.moneda || 'USD'
            } : null,
            warnings,
            _instruccion: `Si el usuario adjuntó una imagen en el chat y quiere asociarla como comprobante, usa attachPaymentReceipt({paymentId: ${payment.id}, confirm: false}).`
          };
        } catch (err: any) {
          logger.error('[Tool:registerPayment] Exception', err);
          return { success: false, error: `Error inesperado: ${err.message}` };
        }
      }
    },

    attachPaymentReceipt: {
      description: `🧾 ADJUNTAR COMPROBANTE A UN PAGO

Toma una imagen reciente enviada en el chat actual y la asocia como comprobante de un pago existente en cartera.

USAR CUANDO:
- "Adjunta esta imagen al pago 123"
- "Guarda este comprobante en el pago recién registrado"
- "Sube esta captura como comprobante"

FLUJO RECOMENDADO:
1. Llama con confirm:false para validar el pago y la imagen.
2. Solo usa confirm:true cuando el usuario confirme que la imagen correcta debe quedar asociada al pago.

IMPORTANTE:
- Esta tool solo usa imágenes recientes del chat actual.
- El índice de adjunto se interpreta sobre las imágenes recientes disponibles (0 = la más reciente).`,
      inputSchema: z.object({
        paymentId: z.number().int().positive()
          .describe('ID del pago existente en cartera.'),
        attachmentIndex: z.number().int().min(0).optional().default(0)
          .describe('Índice de la imagen reciente del chat a usar. 0 = la más reciente.'),
        confirm: z.boolean().optional().default(false)
          .describe('false = preview, true = ejecutar subida y asociación del comprobante.')
      }),
      execute: async ({ paymentId, attachmentIndex = 0, confirm = false }: {
        paymentId: number;
        attachmentIndex?: number;
        confirm?: boolean;
      }) => {
        logger.info('[Tool:attachPaymentReceipt] Executing', {
          paymentId,
          attachmentIndex,
          confirm,
          enterpriseId: resolvedEnterpriseId,
          recentAttachments: recentChatAttachments.length
        });

        try {
          const { data: payment, error: paymentError } = await supabase
            .from('wp_crm_pagos')
            .select('id, empresa_id, servicio_id, contacto_id, monto, moneda, fecha_pago, metodo_pago, referencia, estado, nota, comprobante_url, created_at, updated_at')
            .eq('id', paymentId)
            .eq('empresa_id', resolvedEnterpriseId)
            .maybeSingle();

          if (paymentError) {
            return { success: false, error: `Error de base de datos: ${paymentError.message}` };
          }

          if (!payment) {
            return { success: false, error: `Pago con ID ${paymentId} no encontrado en esta empresa.` };
          }

          const { selected, imageAttachments } = selectChatImageAttachment(recentChatAttachments, attachmentIndex);

          if (imageAttachments.length === 0 || !selected) {
            return {
              success: false,
              error: 'No hay imágenes recientes disponibles en este chat para usar como comprobante. Envía una imagen y vuelve a intentarlo.'
            };
          }

          if (!ALLOWED_RECEIPT_IMAGE_TYPES.includes(selected.type)) {
            return {
              success: false,
              error: `Tipo de archivo no permitido para comprobante: ${selected.type}. Usa JPG, PNG, WEBP o GIF.`
            };
          }

          if (!confirm) {
            const resumen = [
              `⚠️ **Preview de comprobante de pago**`,
              `- Pago ID: ${payment.id}`,
              `- Monto: ${(payment.moneda || 'USD')} ${toNumber(payment.monto).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
              `- Imagen seleccionada: ${selected.name}`,
              payment.comprobante_url
                ? '- El comprobante actual será reemplazado.'
                : '- El pago no tiene comprobante todavía.'
            ].join('\n');

            return {
              success: true,
              resumen,
              requiresConfirmation: true,
              preview: {
                paymentId: payment.id,
                attachmentIndex,
                attachmentName: selected.name,
                attachmentType: selected.type,
                availableImages: imageAttachments.map((attachment, index) => ({
                  index,
                  name: attachment.name,
                  type: attachment.type
                })),
                existingReceiptUrl: payment.comprobante_url || null
              },
              _instruccion: `Si el usuario confirma, vuelve a llamar attachPaymentReceipt con los mismos datos y confirm:true.`
            };
          }

          const buffer = await resolveAttachmentBuffer(selected);
          if (!buffer) {
            return { success: false, error: 'No se pudo leer la imagen seleccionada del chat para subirla como comprobante.' };
          }

          const storagePath = buildReceiptStoragePath(
            resolvedEnterpriseId,
            payment.contacto_id,
            payment.id,
            selected.name,
            selected.type
          );

          const { error: uploadError } = await supabase.storage
            .from(PAYMENT_RECEIPTS_BUCKET)
            .upload(storagePath, buffer, {
              cacheControl: '3600',
              upsert: true,
              contentType: selected.type
            });

          if (uploadError) {
            return { success: false, error: `Error al subir comprobante: ${uploadError.message}` };
          }

          const { data: receiptUrlData } = supabase.storage
            .from(PAYMENT_RECEIPTS_BUCKET)
            .getPublicUrl(storagePath);

          const comprobanteUrl = receiptUrlData.publicUrl;

          const { data: updatedPayment, error: updateError } = await supabase
            .from('wp_crm_pagos')
            .update({
              comprobante_url: comprobanteUrl,
              updated_at: new Date().toISOString()
            })
            .eq('id', payment.id)
            .eq('empresa_id', resolvedEnterpriseId)
            .select('id, empresa_id, servicio_id, contacto_id, monto, moneda, fecha_pago, metodo_pago, referencia, estado, nota, comprobante_url, created_at, updated_at')
            .single();

          if (updateError) {
            return { success: false, error: `Comprobante subido, pero no se pudo actualizar el pago: ${updateError.message}` };
          }

          const resumen = [
            `✅ **Comprobante asociado al pago**`,
            `- Pago ID: ${updatedPayment.id}`,
            `- Archivo: ${selected.name}`,
            `- Monto: ${(updatedPayment.moneda || 'USD')} ${toNumber(updatedPayment.monto).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          ].join('\n');

          return {
            success: true,
            resumen,
            payment: serializePaymentRecord(updatedPayment),
            receipt: {
              fileName: selected.name,
              mimeType: selected.type,
              url: comprobanteUrl,
              storagePath
            }
          };
        } catch (err: any) {
          logger.error('[Tool:attachPaymentReceipt] Exception', err);
          return { success: false, error: `Error inesperado: ${err.message}` };
        }
      }
    },

    updateServiceCollectionSettings: {
      description: `⚙️ AJUSTAR CONFIGURACIÓN DE COBRANZA DE UN SERVICIO

Actualiza campos operativos de cobranza del servicio: día de compromiso, monto mensual propuesto, estado y fecha de fin.

USAR CUANDO:
- "Pon el compromiso del servicio 123 en el día 15"
- "Ajusta el monto mensual propuesto del servicio"
- "Marca este servicio como finalizado"

FLUJO RECOMENDADO:
1. Llama con confirm:false para ver el preview.
2. Solo usa confirm:true cuando el usuario ya confirmó el cambio.

RETORNA: preview o servicio actualizado con nuevo compromiso.`,
      inputSchema: z.object({
        serviceId: z.number().int().positive()
          .describe('ID del servicio a actualizar.'),
        commitmentDay: z.number().int().min(1).max(31).nullable().optional()
          .describe('Nuevo día de compromiso de pago. null para quitarlo.'),
        diaCompromisoPago: z.number().int().min(1).max(31).nullable().optional()
          .describe('Alias de commitmentDay.'),
        proposedMonthlyAmount: z.number().min(0).nullable().optional()
          .describe('Nuevo monto mensual propuesto. Alias semántico de monthlyFee. null para quitarlo.'),
        montoMensualPropuesto: z.number().min(0).nullable().optional()
          .describe('Alias en español de monthlyFee.'),
        monthlyFee: z.number().min(0).nullable().optional()
          .describe('Nueva cuota mensual. null para quitarla.'),
        cuotaMensual: z.number().min(0).nullable().optional()
          .describe('Alias de monthlyFee.'),
        status: z.enum(SERVICE_STATUS_VALUES).optional()
          .describe('Nuevo estado del servicio.'),
        endDate: z.string().nullable().optional()
          .describe('Nueva fecha de fin. null para quitarla.'),
        fechaFin: z.string().nullable().optional()
          .describe('Alias de endDate.'),
        confirm: z.boolean().optional().default(false)
          .describe('false = preview, true = ejecutar actualización.')
      }),
      execute: async ({ serviceId, commitmentDay, diaCompromisoPago, proposedMonthlyAmount, montoMensualPropuesto, monthlyFee, cuotaMensual, status, endDate, fechaFin, confirm = false }: {
        serviceId: number;
        commitmentDay?: number | null;
        diaCompromisoPago?: number | null;
        proposedMonthlyAmount?: number | null;
        montoMensualPropuesto?: number | null;
        monthlyFee?: number | null;
        cuotaMensual?: number | null;
        status?: typeof SERVICE_STATUS_VALUES[number];
        endDate?: string | null;
        fechaFin?: string | null;
        confirm?: boolean;
      }) => {
        logger.info('[Tool:updateServiceCollectionSettings] Executing', { serviceId, status, confirm, enterpriseId: resolvedEnterpriseId });

        try {
          const { data: service, error: serviceError } = await supabase
            .from('wp_crm_servicios')
            .select(serviceSelectFields)
            .eq('id', serviceId)
            .eq('empresa_id', resolvedEnterpriseId)
            .maybeSingle();

          if (serviceError) {
            return { success: false, error: `Error de base de datos: ${serviceError.message}` };
          }

          if (!service) {
            return { success: false, error: `Servicio con ID ${serviceId} no encontrado en esta empresa.` };
          }

          const normalizedCommitmentDay = commitmentDay !== undefined ? commitmentDay : diaCompromisoPago;
          const normalizedMonthlyFee = proposedMonthlyAmount !== undefined
            ? proposedMonthlyAmount
            : montoMensualPropuesto !== undefined
              ? montoMensualPropuesto
              : monthlyFee !== undefined
                ? monthlyFee
                : cuotaMensual;
          const normalizedEndDate = endDate !== undefined ? endDate : fechaFin;

          const updateData: Record<string, unknown> = {};
          if (normalizedCommitmentDay !== undefined) updateData.dia_compromiso_pago = normalizedCommitmentDay;
          if (normalizedMonthlyFee !== undefined) updateData.cuota_mensual = normalizedMonthlyFee;
          if (status !== undefined) updateData.estado = status;
          if (normalizedEndDate !== undefined) updateData.fecha_fin = normalizedEndDate;

          if (Object.keys(updateData).length === 0) {
            return { success: false, error: 'No se proporcionaron cambios para actualizar el servicio.' };
          }

          const previewService = {
            ...service,
            dia_compromiso_pago: updateData.dia_compromiso_pago !== undefined ? updateData.dia_compromiso_pago : service.dia_compromiso_pago,
            cuota_mensual: updateData.cuota_mensual !== undefined ? updateData.cuota_mensual : service.cuota_mensual,
            estado: updateData.estado !== undefined ? updateData.estado : service.estado,
            fecha_fin: updateData.fecha_fin !== undefined ? updateData.fecha_fin : service.fecha_fin
          };

          const currentQueue = buildPortfolioQueueItem(service, [], []);
          const nextQueue = buildPortfolioQueueItem(previewService, [], []);
          const contact = Array.isArray(service.contacto) ? service.contacto[0] : service.contacto;
          const contactName = buildContactDisplayName(contact);

          if (!confirm) {
            const cambios = [] as string[];
            if (updateData.dia_compromiso_pago !== undefined) cambios.push(`compromiso → ${formatCommitmentDayLabel(normalizedCommitmentDay)}`);
            if (updateData.cuota_mensual !== undefined) cambios.push(`monto mensual propuesto → ${normalizedMonthlyFee === null ? 'Sin definir' : normalizedMonthlyFee}`);
            if (updateData.estado !== undefined) cambios.push(`estado → ${status}`);
            if (updateData.fecha_fin !== undefined) cambios.push(`fecha fin → ${normalizedEndDate || 'Sin fecha'}`);

            const resumen = [
              `⚠️ **Preview de actualización de servicio**`,
              `- Servicio: ${service.nombre_servicio} (ID: ${service.id})`,
              `- Contacto: ${contact ? buildContactMarkdownTag(contactName, contact.id) : 'Sin contacto'}`,
              `- Cambios: ${cambios.join(', ')}`,
              `- Estado actual de cobranza: ${currentQueue.agingLabel}`,
              `- Estado estimado tras cambio: ${nextQueue.agingLabel}`
            ].join('\n');

            return {
              success: true,
              resumen,
              requiresConfirmation: true,
              preview: {
                serviceId: service.id,
                serviceName: service.nombre_servicio,
                current: {
                  commitmentDay: service.dia_compromiso_pago ?? null,
                  monthlyFee: service.cuota_mensual === null || service.cuota_mensual === undefined ? null : toNumber(service.cuota_mensual),
                  proposedMonthlyAmount: service.cuota_mensual === null || service.cuota_mensual === undefined ? null : toNumber(service.cuota_mensual),
                  montoMensualPropuesto: service.cuota_mensual === null || service.cuota_mensual === undefined ? null : toNumber(service.cuota_mensual),
                  status: service.estado,
                  endDate: service.fecha_fin || null,
                  agingLabel: currentQueue.agingLabel,
                  commitment: currentQueue.commitment
                },
                proposed: {
                  commitmentDay: previewService.dia_compromiso_pago ?? null,
                  monthlyFee: previewService.cuota_mensual === null || previewService.cuota_mensual === undefined ? null : toNumber(previewService.cuota_mensual),
                  proposedMonthlyAmount: previewService.cuota_mensual === null || previewService.cuota_mensual === undefined ? null : toNumber(previewService.cuota_mensual),
                  montoMensualPropuesto: previewService.cuota_mensual === null || previewService.cuota_mensual === undefined ? null : toNumber(previewService.cuota_mensual),
                  status: previewService.estado,
                  endDate: previewService.fecha_fin || null,
                  agingLabel: nextQueue.agingLabel,
                  commitment: nextQueue.commitment
                }
              },
              _instruccion: `Si el usuario confirma, vuelve a llamar updateServiceCollectionSettings con los mismos datos y confirm:true.`
            };
          }

          const { data: updatedService, error: updateError } = await supabase
            .from('wp_crm_servicios')
            .update({
              ...updateData,
              updated_at: new Date().toISOString()
            })
            .eq('id', service.id)
            .eq('empresa_id', resolvedEnterpriseId)
            .select(serviceSelectFields)
            .single();

          if (updateError) {
            return { success: false, error: `Error al actualizar servicio: ${updateError.message}` };
          }

          const updatedQueue = buildPortfolioQueueItem(updatedService, [], []);
          const cambios = [] as string[];
          if (updateData.dia_compromiso_pago !== undefined) cambios.push(`compromiso ${formatCommitmentDayLabel(updatedService.dia_compromiso_pago)}`);
          if (updateData.cuota_mensual !== undefined) cambios.push(`monto mensual propuesto ${updatedService.cuota_mensual === null ? 'sin definir' : updatedService.cuota_mensual}`);
          if (updateData.estado !== undefined) cambios.push(`estado ${updatedService.estado}`);
          if (updateData.fecha_fin !== undefined) cambios.push(`fecha fin ${updatedService.fecha_fin || 'sin fecha'}`);

          const resumen = [
            `✅ **Servicio actualizado**`,
            `- Servicio: ${updatedService.nombre_servicio} (ID: ${updatedService.id})`,
            `- Cambios aplicados: ${cambios.join(', ')}`,
            `- Nuevo estado de cobranza: ${updatedQueue.agingLabel}`,
            `- Próxima acción sugerida: ${buildServiceActionHint(updatedQueue)}`
          ].join('\n');

          return {
            success: true,
            resumen,
            service: {
              id: updatedService.id,
              nombre: updatedService.nombre_servicio,
              estado: updatedService.estado,
              cuotaMensual: updatedService.cuota_mensual === null || updatedService.cuota_mensual === undefined ? null : toNumber(updatedService.cuota_mensual),
              montoMensualPropuesto: updatedService.cuota_mensual === null || updatedService.cuota_mensual === undefined ? null : toNumber(updatedService.cuota_mensual),
              proposedMonthlyAmount: updatedService.cuota_mensual === null || updatedService.cuota_mensual === undefined ? null : toNumber(updatedService.cuota_mensual),
              diaCompromisoPago: updatedService.dia_compromiso_pago ?? null,
              fechaFin: updatedService.fecha_fin || null,
              saldoPendiente: toNumber(updatedService.saldo_pendiente),
              moneda: updatedService.moneda || 'USD'
            },
            commitment: updatedQueue.commitment,
            nextActionHint: buildServiceActionHint(updatedQueue)
          };
        } catch (err: any) {
          logger.error('[Tool:updateServiceCollectionSettings] Exception', err);
          return { success: false, error: `Error inesperado: ${err.message}` };
        }
      }
    },

    // ─────────────────────────────────────────────────────────────────
    // TOOL 4: countContacts - Contar contactos con filtros
    // ─────────────────────────────────────────────────────────────────
    countContacts: {
      description: `Cuenta cuántos contactos hay en el CRM, opcionalmente filtrados.

USAR CUANDO: "¿Cuántos contactos tenemos?", "Total de clientes", "¿Cuántos prospectos?"

RETORNA: Total con filtros aplicados`,
      inputSchema: z.object({
        estado: z.enum(['prospecto', 'cliente', 'rembolsos solicitado', 'rembolso realizado', 'rechazado'])
          .optional()
          .describe('Filtrar por estado (SIEMPRE en minúsculas)'),
        calificado: z.boolean().optional()
          .describe('true = solo calificados, false = solo no calificados')
      }),
      execute: async ({ estado, calificado }: { estado?: string; calificado?: boolean }) => {
        const startTime = Date.now();
        logger.info('[Tool:countContacts] Executing', { estado, calificado, enterpriseId: resolvedEnterpriseId });
        
        try {
          let query = supabase
            .from('wp_contactos')
            .select('id', { count: 'exact', head: true })
            .eq('empresa_id', resolvedEnterpriseId);

          // SECURITY: Role 3 can only count their assigned contacts
          if (isRole3User) {
            const visibleIds = await getVisibleContactIdsForRole3();
            if (visibleIds.length === 0) {
              return { success: true, resumen: 'No tienes contactos asignados.', total: 0, filtros: 'ninguno' };
            }
            query = query.in('id', visibleIds);
          }

          if (estado) query = query.eq('estado', estado.toLowerCase());
          if (calificado !== undefined) query = query.eq('es_calificado', calificado ? 'si' : 'no');

          const { count, error } = await query;
          
          if (error) {
            logger.error('[Tool:countContacts] DB error', error);
            return { success: false, error: `Error de base de datos: ${error.message}` };
          }
          
          const filtros = [];
          if (estado) filtros.push(`estado: ${estado}`);
          if (calificado !== undefined) filtros.push(`calificados: ${calificado ? 'sí' : 'no'}`);
          
          const resumen = filtros.length > 0
            ? `Hay ${count || 0} contactos con ${filtros.join(', ')}`
            : `Hay ${count || 0} contactos en total`;
          
          logger.info('[Tool:countContacts] Success', { count });
          
          return {
            success: true,
            resumen,
            total: count || 0,
            filtros: filtros.length > 0 ? filtros.join(', ') : 'ninguno'
          };
        } catch (err: any) {
          logger.error('[Tool:countContacts] Exception', err);
          return { success: false, error: `Error inesperado: ${err.message}` };
        }
      }
    },

    // ─────────────────────────────────────────────────────────────────
    // TOOL 5: getConversationalIntelligence - Análisis de conversaciones RAW
    // ─────────────────────────────────────────────────────────────────
    getConversationalIntelligence: {
      description: `🔬 ANÁLISIS DE CONVERSACIONES RAW - BIG DATA CUALITATIVO

Obtiene bloques de conversaciones con TODOS los mensajes para análisis profundo de patrones, tendencias y comportamientos.

📊 DATOS QUE RETORNA:
- Métricas del periodo (chats totales, creados, reactivados, mensajes enviados/recibidos)
- Conversaciones con mensajes completos (contenido real)
- Clasificación: conversación creada vs reactivada
- Teléfono del contacto para tracking

🎯 CUÁNDO USAR (ANÁLISIS CUALITATIVO):
- "Analiza por qué abandonan los prospectos"
- "Busca patrones en las conversaciones del mes"
- "¿Qué preguntas hacen antes de abandonar?"
- "Identifica tendencias de comunicación"
- "Evalúa la calidad de respuestas del agente"
- "Detecta objeciones comunes"
- "Análisis de enero", "Patrones de diciembre"

⚠️ LÍMITES:
- Máximo 500 conversaciones por llamada
- Si necesitas más datos, usa ventanas de fechas diferentes
- Para datos cuantitativos simples usa countContacts

💡 EJEMPLO:
Para analizar enero 2026:
getConversationalIntelligence({ start_date: "2026-01-01", end_date: "2026-01-31", limite: 200 })`,
      inputSchema: z.object({
        start_date: z.string()
          .describe('Fecha inicio YYYY-MM-DD (ej: 2026-01-01). REQUERIDO.'),
        end_date: z.string()
          .describe('Fecha fin YYYY-MM-DD (ej: 2026-01-31). REQUERIDO.'),
        ordenar_por: z.enum(['created_at', 'updated_at'])
          .optional()
          .describe('Campo para ordenar: created_at o updated_at. Default: updated_at'),
        orden: z.enum(['desc', 'asc'])
          .optional()
          .describe('Dirección: desc (recientes primero) o asc. Default: desc'),
        limite: z.number().int().min(1).max(500)
          .optional()
          .describe('Máximo de conversaciones (1-500). Default: 100')
      }),
      execute: async ({ start_date, end_date, ordenar_por, orden, limite }: { 
        start_date: string; 
        end_date: string; 
        ordenar_por?: 'created_at' | 'updated_at';
        orden?: 'desc' | 'asc';
        limite?: number;
      }) => {
        const startTime = Date.now();
        logger.info('[Tool:getConversationalIntelligence] Executing', { 
          start_date, end_date, limite, enterpriseId: resolvedEnterpriseId 
        });
        
        try {
          // Llamar a la Edge Function de Supabase
          const response = await fetch(
            'https://vecspltvmyopwbjzerow.supabase.co/functions/v1/-obtener_mensajes_conversaciones',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseServiceKey}`
              },
              body: JSON.stringify({
                empresa_id: resolvedEnterpriseId,
                fecha_inicio: start_date,
                fecha_fin: end_date,
                ordenar_por: ordenar_por || 'updated_at',
                orden: orden || 'desc',
                limite: limite || 100
              })
            }
          );

          if (!response.ok) {
            const errorText = await response.text();
            logger.error('[Tool:getConversationalIntelligence] Edge Function error', { 
              status: response.status, error: errorText 
            });
            return { 
              success: false, 
              error: `Error en edge function (${response.status}): ${errorText.substring(0, 200)}` 
            };
          }

          const data = await response.json();
          
          // Mapear respuesta de la edge function
          const periodo = data.periodo_evaluado || {};
          const metricas = data.metricas_periodo || {};
          const muestra = data.muestra || {};
          const conversaciones = muestra.conversaciones || [];
          
          logger.info('[Tool:getConversationalIntelligence] Success', {
            conversaciones_count: conversaciones.length,
            metricas_chats_total: metricas.chats_total
          });

          // Generar resumen para el modelo
          const totalMensajes = conversaciones.reduce(
            (sum: number, c: any) => sum + (c.mensajes_count || 0), 0
          );
          
          const canales = conversaciones.reduce((acc: Record<string, number>, c: any) => {
            const canal = c.canal || 'desconocido';
            acc[canal] = (acc[canal] || 0) + 1;
            return acc;
          }, {});

          const canalesStr = Object.entries(canales).map(([k, v]) => `${k}: ${v}`).join(', ');
          const resumenParaAnalisis = `
📅 Periodo: ${start_date} a ${end_date}
📊 Métricas del periodo completo:
- Chats totales: ${metricas.chats_total || 0}
- Nuevos (creados): ${metricas.chats_creados || 0}
- Reactivados: ${metricas.chats_reactivados || 0}
- Mensajes: ${metricas.mensajes_total || 0} (enviados: ${metricas.mensajes_enviados || 0}, recibidos: ${metricas.mensajes_recibidos || 0})

📦 Muestra obtenida: ${conversaciones.length} conversaciones con ${totalMensajes} mensajes
📱 Por canal: ${canalesStr}

🔍 Analiza los mensajes de cada conversación para identificar patrones, tendencias y comportamientos.
`.trim();

          return {
            success: true,
            resumen: resumenParaAnalisis,
            periodo: {
              fecha_inicio: periodo.fecha_inicio || start_date,
              fecha_fin: periodo.fecha_fin || end_date
            },
            metricas: {
              chats_total: metricas.chats_total || 0,
              chats_creados: metricas.chats_creados || 0,
              chats_reactivados: metricas.chats_reactivados || 0,
              mensajes_total: metricas.mensajes_total || 0,
              mensajes_enviados: metricas.mensajes_enviados || 0,
              mensajes_recibidos: metricas.mensajes_recibidos || 0
            },
            muestra: {
              total: conversaciones.length,
              conversaciones: conversaciones.slice(0, 50).map((c: any) => ({
                id_conversacion: c.id_conversacion,
                contacto_id: c.contacto_id,
                telefono: c.telefono,
                created_at: c.created_at,
                canal: c.canal,
                estado: c.estado,
                mensajes_count: c.mensajes_count || 0,
                mensajes: (c.mensajes || []).slice(0, 20).map((m: any) => ({
                  contenido: (m.contenido || '').substring(0, 500),
                  remitente: m.remitente || 'desconocido',
                  timestamp: m.timestamp || ''
                }))
              }))
            }
          };
        } catch (err: any) {
          logger.error('[Tool:getConversationalIntelligence] Exception', err);
          return { success: false, error: `Error inesperado: ${err.message}` };
        }
      }
    },

    // ─────────────────────────────────────────────────────────────────
    // TOOL 6: webSearch - Búsqueda en Internet (Firecrawl)
    // ─────────────────────────────────────────────────────────────────
    ...(FIRECRAWL_API_KEY ? {
      webSearch: {
        description: `🔎 BÚSQUEDA EN INTERNET

Busca información en la web y opcionalmente extrae el contenido de los resultados.

USAR CUANDO:
- "Busca en internet sobre [tema]"
- "Qué se dice en la web de [empresa]"
- "Investiga [tema] online"
- "Encuentra información sobre [producto/servicio]"

EJEMPLOS:
- webSearch({query: "mejores prácticas CRM 2024"})
- webSearch({query: "competidores de [empresa]", limit: 5})
- webSearch({query: "Urpe AI Lab opiniones", scrapeResults: true})

RETORNA: Lista de resultados con título, URL, descripción y opcionalmente contenido.

💡 TIPS:
- Sin scrapeResults: Rápido, retorna solo títulos/descripciones
- Con scrapeResults: Más lento, pero obtiene el contenido completo`,
        inputSchema: z.object({
          query: z.string()
            .min(2, 'La búsqueda debe tener al menos 2 caracteres')
            .describe('Término de búsqueda en internet'),
          limit: z.number().int().min(1).max(10)
            .optional()
            .describe('Número máximo de resultados (default: 5, max: 10)'),
          scrapeResults: z.boolean()
            .optional()
            .describe('Extraer contenido de los resultados (default: false)')
        }),
        execute: async ({ query, limit = 5, scrapeResults = false }: { 
          query: string; 
          limit?: number; 
          scrapeResults?: boolean; 
        }) => {
          const startTime = Date.now();
          logger.info('[Tool:webSearch] Executing', { query, limit, scrapeResults });
          
          try {
            const requestBody: Record<string, unknown> = { query, limit };
            
            if (scrapeResults) {
              requestBody.scrapeOptions = {
                formats: ['markdown'],
                onlyMainContent: true
              };
            }

            const response = await fetch(`${FIRECRAWL_API_URL}/search`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${FIRECRAWL_API_KEY}`
              },
              body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
              const errorText = await response.text();
              logger.error('[Tool:webSearch] API error', { status: response.status, error: errorText });
              
              if (response.status === 402) {
                return { success: false, error: 'Créditos de Firecrawl agotados.' };
              }
              if (response.status === 429) {
                return { success: false, error: 'Rate limit alcanzado. Intenta en unos segundos.' };
              }
              
              return { success: false, error: `Error de búsqueda (${response.status})` };
            }

            const data = await response.json();
            
            if (!data.success) {
              return { success: false, error: data.error || 'Error en búsqueda web' };
            }

            const results = (data.data || []).map((item: any) => {
              const result: any = {
                title: item.title || item.metadata?.title || 'Sin título',
                url: item.url || item.metadata?.sourceURL || '',
                description: item.description || item.metadata?.description || ''
              };

              if (scrapeResults && item.markdown) {
                const MAX_CONTENT = 3000;
                result.content = item.markdown.length > MAX_CONTENT 
                  ? item.markdown.substring(0, MAX_CONTENT) + '...'
                  : item.markdown;
              }

              return result;
            });

            const durationMs = Date.now() - startTime;
            logger.info('[Tool:webSearch] Success', { query, resultsCount: results.length, durationMs });

            const resumen = results.length === 0
              ? `No encontré resultados para "${query}".`
              : `Encontré ${results.length} resultados para "${query}":\n${results.map((r: any, i: number) => `${i+1}. ${r.title}\n   ${r.url}`).join('\n')}`;

            return {
              success: true,
              resumen,
              resultados: results,
              total: results.length,
              scraped: scrapeResults
            };
          } catch (err: any) {
            logger.error('[Tool:webSearch] Exception', err);
            return { success: false, error: `Error inesperado: ${err.message}` };
          }
        }
      },

      // ─────────────────────────────────────────────────────────────────
      // TOOL 7: webScrape - Scraping de URL (Firecrawl)
      // ─────────────────────────────────────────────────────────────────
      webScrape: {
        description: `🌐 SCRAPING DE PÁGINAS WEB

Extrae el contenido completo de una página web específica.

USAR CUANDO:
- "Lee el contenido de esta URL"
- "Extrae información de [url]"
- "Qué dice esta página web"
- "Analiza el contenido de [sitio]"

EJEMPLOS:
- webScrape({url: "https://example.com/about"})
- webScrape({url: "https://blog.example.com/article", onlyMainContent: true})

RETORNA: Título, contenido en markdown, y metadata de la página.

⚠️ NOTA: Para buscar en múltiples sitios, usa webSearch primero.`,
        inputSchema: z.object({
          url: z.string()
            .url('URL inválida')
            .describe('URL completa de la página a scrapear'),
          onlyMainContent: z.boolean()
            .optional()
            .describe('Extraer solo contenido principal (default: true)'),
          includeLinks: z.boolean()
            .optional()
            .describe('Incluir links encontrados (default: false)')
        }),
        execute: async ({ url, onlyMainContent = true, includeLinks = false }: { 
          url: string; 
          onlyMainContent?: boolean; 
          includeLinks?: boolean; 
        }) => {
          const startTime = Date.now();
          logger.info('[Tool:webScrape] Executing', { url });
          
          try {
            const formats: string[] = ['markdown'];
            if (includeLinks) formats.push('links');

            const response = await fetch(`${FIRECRAWL_API_URL}/scrape`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${FIRECRAWL_API_KEY}`
              },
              body: JSON.stringify({ url, formats, onlyMainContent })
            });

            if (!response.ok) {
              const errorText = await response.text();
              logger.error('[Tool:webScrape] API error', { status: response.status, error: errorText });
              
              if (response.status === 402) {
                return { success: false, error: 'Créditos de Firecrawl agotados.' };
              }
              if (response.status === 429) {
                return { success: false, error: 'Rate limit alcanzado. Intenta en unos segundos.' };
              }
              
              return { success: false, error: `Error de scraping (${response.status})` };
            }

            const data = await response.json();
            
            if (!data.success) {
              return { success: false, error: data.error || 'Error en scraping' };
            }

            const scraped = data.data;
            let content = scraped.markdown || '';
            const MAX_CONTENT_LENGTH = 15000;
            if (content.length > MAX_CONTENT_LENGTH) {
              content = content.substring(0, MAX_CONTENT_LENGTH) + '\n\n... [contenido truncado]';
            }

            const durationMs = Date.now() - startTime;
            logger.info('[Tool:webScrape] Success', { url, contentLength: content.length, durationMs });

            const title = scraped.metadata?.title || '';
            const resumen = `📄 **${title || 'Página web'}**\nURL: ${url}\nContenido: ${content.length} caracteres extraídos`;

            return {
              success: true,
              resumen,
              titulo: title,
              contenido: content,
              url: scraped.metadata?.sourceURL || url,
              links: includeLinks ? scraped.links?.slice(0, 20) : undefined,
              metadata: {
                description: scraped.metadata?.description,
                language: scraped.metadata?.language
              }
            };
          } catch (err: any) {
            logger.error('[Tool:webScrape] Exception', err);
            return { success: false, error: `Error inesperado: ${err.message}` };
          }
        }
      }
    } : {}),

    // ─────────────────────────────────────────────────────────────────
    // TOOL 8: executePython - Ejecución de código Python (E2B Sandbox)
    // ─────────────────────────────────────────────────────────────────
    ...(E2B_API_KEY ? {
      executePython: {
        description: `🐍 EJECUTAR CÓDIGO PYTHON

Ejecuta código Python en un entorno seguro y aislado (sandbox). Perfecto para cálculos, análisis de datos, y procesamiento.

USAR CUANDO:
- "Calcula el promedio de estos números"
- "Genera un gráfico de ventas"
- "Procesa estos datos y dame estadísticas"
- "Analiza este CSV"
- "Haz un cálculo matemático complejo"

CAPACIDADES:
- Cálculos matemáticos y estadísticos
- Procesamiento de datos con pandas
- Gráficos con matplotlib/plotly
- Análisis de texto
- Cualquier código Python válido

EJEMPLOS:
- executePython({code: "import math; print(math.sqrt(144))"})
- executePython({code: "data = [1,2,3,4,5]; print(sum(data)/len(data))"})

RETORNA: stdout, stderr, resultados (gráficos, tablas, etc.), y errores si los hay.

⚠️ TIMEOUT: 30 segundos por defecto. Código largo puede requerir más tiempo.`,
        inputSchema: z.object({
          code: z.string()
            .min(1, 'El código no puede estar vacío')
            .describe('Código Python a ejecutar'),
          timeout: z.number().int().min(5000).max(120000)
            .optional()
            .describe('Tiempo máximo en ms (default: 30000, max: 120000)')
        }),
        execute: async ({ code, timeout = 30000 }: { code: string; timeout?: number }) => {
          const startTime = Date.now();
          logger.info('[Tool:executePython] Executing', { codeLength: code.length, timeout });
          
          try {
            // Dynamic import to avoid build issues if not installed
            let Sandbox;
            try {
              const e2b = require('@e2b/code-interpreter');
              Sandbox = e2b.Sandbox;
            } catch (e) {
              logger.error('[Tool:executePython] E2B SDK not installed');
              return { 
                success: false, 
                error: 'E2B SDK no instalado. Ejecuta: npm install @e2b/code-interpreter' 
              };
            }
            
            logger.info('[Tool:executePython] Creating sandbox...');
            const sbx = await Sandbox.create({ 
              apiKey: E2B_API_KEY, 
              timeoutMs: timeout 
            });
            
            try {
              logger.info('[Tool:executePython] Running code...');
              const execution = await sbx.runCode(code);
              
              const durationMs = Date.now() - startTime;
              logger.info('[Tool:executePython] Success', { durationMs });
              
              // Format results for AI
              const stdout = execution.logs.stdout || [];
              const stderr = execution.logs.stderr || [];
              const results = execution.results || [];
              const error = execution.error;
              
              if (error) {
                return {
                  success: false,
                  error: `${error.name}: ${error.value}\n${error.traceback || ''}`,
                  stdout: stdout.join('\n'),
                  stderr: stderr.join('\n')
                };
              }
              
              // Build human-readable summary
              const outputLines = stdout.length > 0 ? stdout.join('\n') : '';
              const hasVisuals = results.some((r: any) => r.png || r.svg || r.html);
              
              let resumen = '✅ Código ejecutado correctamente';
              if (outputLines) {
                resumen += `\n\n📤 **Salida:**\n\`\`\`\n${outputLines.substring(0, 2000)}${outputLines.length > 2000 ? '...' : ''}\n\`\`\``;
              }
              if (hasVisuals) {
                resumen += '\n\n📊 Se generaron visualizaciones (gráficos/imágenes).';
              }
              
              return {
                success: true,
                resumen,
                stdout: stdout,
                stderr: stderr,
                results: results.map((r: any) => ({
                  type: r.type,
                  text: r.text,
                  html: r.html,
                  png: r.png ? '[imagen base64]' : undefined,
                  svg: r.svg ? '[svg]' : undefined
                })),
                durationMs
              };
            } finally {
              await sbx.kill();
            }
          } catch (err: any) {
            logger.error('[Tool:executePython] Exception', err);
            
            if (err.message?.includes('timeout')) {
              return { success: false, error: 'El código tardó demasiado. Intenta con código más simple o aumenta el timeout.' };
            }
            
            return { success: false, error: `Error de ejecución: ${err.message}` };
          }
        }
      }
    } : {}),

    // ─────────────────────────────────────────────────────────────────
    // TOOL 9: getAppointments - Citas programadas
    // ─────────────────────────────────────────────────────────────────
    getAppointments: {
      description: `📅 OBTENER CITAS PROGRAMADAS

Consulta citas del CRM con filtros opcionales.

USAR CUANDO:
- "¿Qué citas tenemos hoy/mañana/esta semana?"
- "Citas de Juan" (después de buscar contacto)
- "Próximas citas pendientes"
- "Citas completadas del mes"

FILTROS:
- contactId: Citas de un contacto específico
- estado: pendiente, confirmada, completada, cancelada, no_asistio
- proximas: true = solo futuras

RETORNA: Lista de citas con fecha, título, estado y contacto.`,
      inputSchema: z.object({
        contactId: z.number().int().positive().optional()
          .describe('ID del contacto (de searchContacts)'),
        estado: z.enum(['pendiente', 'confirmada', 'completada', 'cancelada', 'no_asistio']).optional()
          .describe('Filtrar por estado'),
        proximas: z.boolean().optional()
          .describe('true = solo citas futuras'),
        limit: z.number().int().min(1).max(50).optional().default(10)
          .describe('Máximo de resultados (default: 10)')
      }),
      execute: async ({ contactId, estado, proximas, limit = 10 }: {
        contactId?: number;
        estado?: string;
        proximas?: boolean;
        limit?: number;
      }) => {
        logger.info('[Tool:getAppointments] Executing', { contactId, estado, proximas, enterpriseId: resolvedEnterpriseId });
        
        try {
          let query = supabase
            .from('wp_citas')
            .select(`
              id, titulo, descripcion, fecha_hora, duracion, estado, ubicacion,
              contacto:wp_contactos!contacto_id(id, nombre, apellido, telefono)
            `)
            .eq('empresa_id', resolvedEnterpriseId);

          // SECURITY: Role 3 can only see appointments for their assigned contacts
          if (isRole3User) {
            const visibleIds = await getVisibleContactIdsForRole3();
            if (visibleIds.length === 0) {
              return { success: true, resumen: 'No tienes citas para tus contactos asignados.', citas: [], total: 0 };
            }
            query = query.in('contacto_id', visibleIds);
          }

          if (contactId) query = query.eq('contacto_id', contactId);
          if (estado) query = query.eq('estado', estado);
          
          if (proximas) {
            query = query.gte('fecha_hora', new Date().toISOString());
            query = query.order('fecha_hora', { ascending: true });
          } else {
            query = query.order('fecha_hora', { ascending: false });
          }

          query = query.limit(limit);

          const { data, error } = await query;
          if (error) {
            return { success: false, error: `Error de base de datos: ${error.message}` };
          }

          const citas = (data || []).map(c => {
            const contacto = Array.isArray(c.contacto) ? c.contacto[0] : c.contacto;
            return {
              id: c.id,
              titulo: c.titulo || 'Cita',
              fecha: c.fecha_hora,
              duracion: c.duracion,
              estado: c.estado || 'pendiente',
              ubicacion: c.ubicacion,
              contacto: contacto ? `${contacto.nombre || ''} ${contacto.apellido || ''}`.trim() : 'Sin contacto',
              contactoTel: contacto?.telefono
            };
          });

          const resumen = citas.length === 0
            ? proximas ? 'No hay citas próximas programadas.' : 'No se encontraron citas con esos filtros.'
            : `${citas.length} cita(s) encontrada(s):\n${citas.map((c, i) => 
                `${i+1}. ${c.titulo} - ${new Date(c.fecha).toLocaleString('es')} [${c.estado}] - ${c.contacto}`
              ).join('\n')}`;

          return {
            success: true,
            resumen,
            citas,
            total: citas.length
          };
        } catch (err: any) {
          logger.error('[Tool:getAppointments] Exception', err);
          return { success: false, error: `Error inesperado: ${err.message}` };
        }
      }
    },

    updateAppointmentStatus: {
      description: `🔄 ACTUALIZAR ESTADO DE CITA

Actualiza el estado de una cita del CRM usando su ID, incluso si no tiene contacto asociado.

USAR CUANDO:
- "Marca la cita 123 como confirmada"
- "Cancela la cita 456"
- "La cita 789 no asistió"

FLUJO RECOMENDADO:
1. Usa confirm:false para ver el preview.
2. Solo usa confirm:true cuando el usuario confirme el cambio.

RETORNA: preview o cita actualizada con el nuevo estado.`,
      inputSchema: z.object({
        appointmentId: z.number().int().positive()
          .describe('ID de la cita a actualizar.'),
        status: z.enum(APPOINTMENT_STATUS_VALUES)
          .describe('Nuevo estado de la cita.'),
        confirm: z.boolean().optional().default(false)
          .describe('false = preview, true = ejecutar actualización.')
      }),
      execute: async ({ appointmentId, status, confirm = false }: {
        appointmentId: number;
        status: typeof APPOINTMENT_STATUS_VALUES[number];
        confirm?: boolean;
      }) => {
        logger.info('[Tool:updateAppointmentStatus] Executing', {
          appointmentId,
          status,
          confirm,
          enterpriseId: resolvedEnterpriseId
        });

        try {
          const { data: appointment, error: appointmentError } = await supabase
            .from('wp_citas')
            .select(`
              id,
              titulo,
              estado,
              fecha_hora,
              contacto_id,
              empresa_id,
              team_humano_id,
              event_id,
              metadata,
              contacto:wp_contactos!contacto_id(id, nombre, apellido)
            `)
            .eq('id', appointmentId)
            .eq('empresa_id', resolvedEnterpriseId)
            .single();

          if (appointmentError || !appointment) {
            logger.warn('[Tool:updateAppointmentStatus] Appointment not found', {
              appointmentId,
              enterpriseId: resolvedEnterpriseId,
              error: appointmentError?.message
            });
            return { success: false, error: 'Cita no encontrada o sin acceso para esta empresa.' };
          }

          const contacto = Array.isArray(appointment.contacto) ? appointment.contacto[0] : appointment.contacto;
          const contactName = buildContactDisplayName(contacto);
          const currentStatus = appointment.estado || 'pendiente';

          if (!confirm) {
            const resumen = [
              `⚠️ **Preview de actualización de cita**`,
              `- Cita: ${appointment.titulo || 'Cita'} (ID: ${appointment.id})`,
              `- Fecha: ${appointment.fecha_hora ? formatDateTime(appointment.fecha_hora) : 'Sin fecha'}`,
              `- Contacto: ${contacto ? buildContactMarkdownTag(contactName, contacto.id) : 'Sin contacto'}`,
              `- Estado actual: ${currentStatus}`,
              `- Estado propuesto: ${status}`
            ].join('\n');

            return {
              success: true,
              resumen,
              requiresConfirmation: true,
              preview: {
                appointmentId: appointment.id,
                appointmentTitle: appointment.titulo || 'Cita',
                currentStatus,
                proposedStatus: status,
                contactId: contacto?.id || null,
                hasContact: !!contacto
              },
              _instruccion: `Si el usuario confirma, vuelve a llamar updateAppointmentStatus con appointmentId:${appointment.id}, status:'${status}' y confirm:true.`
            };
          }

          if (status === currentStatus) {
            return {
              success: true,
              resumen: `La cita ${appointment.id} ya está en estado "${status}".`,
              appointment: {
                id: appointment.id,
                titulo: appointment.titulo || 'Cita',
                estado: currentStatus,
                contacto_id: appointment.contacto_id || null,
                hasContact: !!contacto
              }
            };
          }

          const syncStatuses = new Set(['cancelada', 'reagendada']);
          if (syncStatuses.has(status) && NYLAS_API_KEY) {
            const nylasEventId = appointment.metadata?.nylas_event_id || appointment.event_id;

            if (nylasEventId && appointment.team_humano_id) {
              const { data: teamMember, error: teamError } = await supabase
                .from('wp_team_humano')
                .select('grant_id')
                .eq('id', appointment.team_humano_id)
                .single();

              if (!teamError && teamMember?.grant_id) {
                const nylasUrl = `${NYLAS_API_URI}/v3/grants/${teamMember.grant_id}/events/${encodeURIComponent(nylasEventId)}?calendar_id=primary`;
                const response = await fetch(nylasUrl, {
                  method: 'DELETE',
                  headers: {
                    'Authorization': `Bearer ${NYLAS_API_KEY}`,
                    'Accept': 'application/json'
                  }
                });

                if (!response.ok && response.status !== 404) {
                  const details = await response.text();
                  logger.warn('[Tool:updateAppointmentStatus] Nylas delete warning', {
                    appointmentId: appointment.id,
                    nylasEventId,
                    status,
                    details
                  });
                }
              }
            }
          }

          const { error: updateError } = await supabase
            .from('wp_citas')
            .update({
              estado: status,
              updated_at: new Date().toISOString()
            })
            .eq('id', appointment.id)
            .eq('empresa_id', resolvedEnterpriseId);

          if (updateError) {
            logger.error('[Tool:updateAppointmentStatus] Update error', updateError);
            return { success: false, error: `No pude actualizar la cita: ${updateError.message}` };
          }

          return {
            success: true,
            resumen: [
              `✅ **Cita actualizada**`,
              `- Cita: ${appointment.titulo || 'Cita'} (ID: ${appointment.id})`,
              `- Nuevo estado: ${status}`,
              `- Contacto: ${contacto ? buildContactMarkdownTag(contactName, contacto.id) : 'Sin contacto'}`
            ].join('\n'),
            appointment: {
              id: appointment.id,
              titulo: appointment.titulo || 'Cita',
              estado: status,
              contacto_id: appointment.contacto_id || null,
              hasContact: !!contacto
            }
          };
        } catch (err: any) {
          logger.error('[Tool:updateAppointmentStatus] Exception', err);
          return { success: false, error: `Error inesperado: ${err.message}` };
        }
      }
    },

    // ─────────────────────────────────────────────────────────────────
    // TOOL 10: getTasks - Tareas del CRM
    // ─────────────────────────────────────────────────────────────────
    getTasks: {
      description: `✅ OBTENER TAREAS

Consulta tareas del CRM con filtros opcionales.

USAR CUANDO:
- "¿Qué tareas tenemos pendientes?"
- "Tareas de Juan" (miembro del equipo)
- "Buscar tareas de Monica v2"
- "Tareas urgentes"

FILTROS:
- search: Buscar en título/descripción
- estado: pendiente, en_progreso, completada, cancelada
- prioridad: 1=baja, 2=media, 3=alta, 4=urgente

RETORNA: Lista de tareas con ID, título, estado, prioridad y asignado.

⚠️ IMPORTANTE: Los IDs retornados se usan en las otras tools de tareas:
- createTask: Crear nueva tarea
- updateTask({taskId: ID, ...}): Editar tarea
- deleteTask({taskId: ID}): Eliminar tarea
- manageTaskItems({taskId: ID, ...}): Gestionar subtareas/checklist`,
      inputSchema: z.object({
        search: z.string().optional()
          .describe('Buscar en título y descripción'),
        estado: z.enum(['pendiente', 'en_progreso', 'completada', 'cancelada']).optional()
          .describe('Filtrar por estado'),
        prioridad: z.number().int().min(1).max(4).optional()
          .describe('Prioridad: 1=baja, 2=media, 3=alta, 4=urgente'),
        asignadoId: z.number().int().positive().optional()
          .describe('ID del miembro asignado'),
        limit: z.number().int().min(1).max(50).optional().default(20)
          .describe('Máximo de resultados (default: 20)')
      }),
      execute: async ({ search, estado, prioridad, asignadoId, limit = 20 }: {
        search?: string;
        estado?: string;
        prioridad?: number;
        asignadoId?: number;
        limit?: number;
      }) => {
        // SECURITY: Role 3 can only see their own tasks
        if (isRole3User) {
          asignadoId = teamMember.id;
        }

        logger.info('[Tool:getTasks] Executing', { search, estado, prioridad, asignadoId, enterpriseId: resolvedEnterpriseId });

        try {
          let query = supabase
            .from('wp_tareas')
            .select(`
              id, titulo, descripcion, estado, prioridad, fecha_vencimiento,
              asignado:wp_team_humano!asignado_a(id, nombre, apellido),
              proyecto:wp_proyectos!proyecto_id(id, nombre)
            `)
            .eq('empresa_id', resolvedEnterpriseId);

          if (search) {
            query = query.or(`titulo.ilike.%${search}%,descripcion.ilike.%${search}%`);
          }
          if (estado) query = query.eq('estado', estado);
          if (prioridad) query = query.eq('prioridad', prioridad);
          if (asignadoId) query = query.eq('asignado_a', asignadoId);

          query = query
            .order('prioridad', { ascending: false })
            .order('fecha_vencimiento', { ascending: true, nullsFirst: false })
            .limit(limit);

          const { data, error } = await query;
          if (error) {
            return { success: false, error: `Error de base de datos: ${error.message}` };
          }

          const prioridadEmoji: Record<number, string> = { 1: '🟢', 2: '🟡', 3: '🟠', 4: '🔴' };
          
          const tareas = (data || []).map(t => {
            const asignado = Array.isArray(t.asignado) ? t.asignado[0] : t.asignado;
            const proyecto = Array.isArray(t.proyecto) ? t.proyecto[0] : t.proyecto;
            return {
              id: t.id,
              titulo: t.titulo,
              estado: t.estado || 'pendiente',
              prioridad: t.prioridad || 2,
              prioridadLabel: prioridadEmoji[t.prioridad || 2] || '🟡',
              vencimiento: t.fecha_vencimiento,
              asignado: asignado ? `${asignado.nombre || ''} ${asignado.apellido || ''}`.trim() : 'Sin asignar',
              proyecto: proyecto?.nombre || null
            };
          });

          const resumen = tareas.length === 0
            ? search ? `No se encontraron tareas con "${search}".` : 'No hay tareas con esos filtros.'
            : `${tareas.length} tarea(s):\n${tareas.map((t, i) => 
                `${i+1}. ${t.prioridadLabel} ${t.titulo} [${t.estado}] - ${t.asignado}`
              ).join('\n')}`;

          return {
            success: true,
            resumen,
            tareas,
            total: tareas.length
          };
        } catch (err: any) {
          logger.error('[Tool:getTasks] Exception', err);
          return { success: false, error: `Error inesperado: ${err.message}` };
        }
      }
    },

    // ─────────────────────────────────────────────────────────────────
    // TOOL 10b: createTask - Crear tarea
    // ─────────────────────────────────────────────────────────────────
    createTask: {
      description: `➕ CREAR TAREA

Crea una nueva tarea en el CRM. Puede vincularse a un contacto, proyecto o miembro del equipo.

USAR CUANDO:
- "Crea una tarea para llamar a Juan mañana"
- "Añade tarea urgente: revisar contrato"
- "Crea tarea para el proyecto X asignada a María"
- "Registra pendiente: enviar cotización al contacto 4521"

PARÁMETROS:
- titulo (requerido): Descripción clara de la tarea
- prioridad: 1=baja, 2=media(default), 3=alta, 4=urgente
- asignado_a: ID del miembro del equipo (usa getTeamMembers para obtener IDs)
- contacto_id: ID del contacto vinculado (usa searchContacts para obtener IDs)
- proyecto_id: ID del proyecto (usa getProjects para obtener IDs)
- fecha_vencimiento: Fecha límite en formato ISO (YYYY-MM-DD)
- items: Lista de subtareas/checklist

⚠️ IMPORTANTE: Para asignar a alguien, primero usa getTeamMembers para obtener su ID.
Para vincular a un contacto, primero usa searchContacts para obtener su ID.

RETORNA: Tarea creada con ID, título, estado y asignado.`,
      inputSchema: z.object({
        titulo: z.string().min(1).max(500)
          .describe('Título/descripción de la tarea'),
        descripcion: z.string().max(5000).optional()
          .describe('Descripción detallada (opcional)'),
        prioridad: z.number().int().min(1).max(4).optional().default(2)
          .describe('Prioridad: 1=baja, 2=media, 3=alta, 4=urgente'),
        estado: z.enum(['pendiente', 'en_progreso']).optional().default('pendiente')
          .describe('Estado inicial (default: pendiente)'),
        contacto_id: z.number().int().positive().optional()
          .describe('ID del contacto vinculado (de searchContacts)'),
        proyecto_id: z.number().int().positive().optional()
          .describe('ID del proyecto (de getProjects)'),
        asignado_a: z.number().int().positive().optional()
          .describe('ID del miembro del equipo asignado (de getTeamMembers)'),
        fecha_vencimiento: z.string().optional()
          .describe('Fecha límite ISO: YYYY-MM-DD o YYYY-MM-DDTHH:mm:ss'),
        items: z.array(z.string().min(1).max(500)).max(20).optional()
          .describe('Lista de subtareas/checklist (máximo 20)')
      }),
      execute: async ({ titulo, descripcion, prioridad = 2, estado = 'pendiente', contacto_id, proyecto_id, asignado_a, fecha_vencimiento, items }: {
        titulo: string;
        descripcion?: string;
        prioridad?: number;
        estado?: string;
        contacto_id?: number;
        proyecto_id?: number;
        asignado_a?: number;
        fecha_vencimiento?: string;
        items?: string[];
      }) => {
        logger.info('[Tool:createTask] Executing', { titulo, prioridad, contacto_id, asignado_a, enterpriseId: resolvedEnterpriseId });
        
        try {
          // Validar contacto_id si se proporciona
          if (contacto_id) {
            const { data: contactCheck, error: contactErr } = await supabase
              .from('wp_contactos')
              .select('id')
              .eq('id', contacto_id)
              .eq('empresa_id', resolvedEnterpriseId)
              .maybeSingle();
            
            if (contactErr || !contactCheck) {
              return { success: false, error: `Contacto con ID ${contacto_id} no encontrado en esta empresa. Usa searchContacts para buscar el contacto correcto.` };
            }
          }

          // Validar asignado_a si se proporciona
          if (asignado_a) {
            const { data: memberCheck, error: memberErr } = await supabase
              .from('wp_team_humano')
              .select('id, nombre, apellido')
              .eq('id', asignado_a)
              .eq('empresa_id', resolvedEnterpriseId)
              .eq('is_active', true)
              .maybeSingle();
            
            if (memberErr || !memberCheck) {
              return { success: false, error: `Miembro del equipo con ID ${asignado_a} no encontrado o inactivo. Usa getTeamMembers para obtener IDs válidos.` };
            }
          }

          // Validar proyecto_id si se proporciona
          if (proyecto_id) {
            const { data: projCheck, error: projErr } = await supabase
              .from('wp_proyectos')
              .select('id')
              .eq('id', proyecto_id)
              .eq('empresa_id', resolvedEnterpriseId)
              .maybeSingle();
            
            if (projErr || !projCheck) {
              return { success: false, error: `Proyecto con ID ${proyecto_id} no encontrado. Usa getProjects para obtener IDs válidos.` };
            }
          }

          // Crear la tarea
          const { data: task, error: taskError } = await supabase
            .from('wp_tareas')
            .insert({
              titulo,
              descripcion: descripcion || null,
              prioridad,
              estado,
              empresa_id: resolvedEnterpriseId,
              creado_por: teamMember.id,
              asignado_a: asignado_a || null,
              contacto_id: contacto_id || null,
              proyecto_id: proyecto_id || null,
              fecha_vencimiento: fecha_vencimiento || null
            })
            .select(`
              id, titulo, descripcion, estado, prioridad, fecha_vencimiento, created_at,
              asignado:wp_team_humano!asignado_a(id, nombre, apellido),
              contacto:wp_contactos!contacto_id(id, nombre, apellido),
              proyecto:wp_proyectos!proyecto_id(id, nombre)
            `)
            .single();

          if (taskError) {
            logger.error('[Tool:createTask] DB error', taskError);
            return { success: false, error: `Error al crear tarea: ${taskError.message}` };
          }

          // Crear asignación en wp_tareas_asignados
          const targetAsignadoId = asignado_a || teamMember.id;
          await supabase
            .from('wp_tareas_asignados')
            .insert({
              tarea_id: task.id,
              team_humano_id: targetAsignadoId,
              rol: 'responsable',
              asignado_por: teamMember.id
            });

          // Crear subtareas/items si se proporcionan
          let itemsCreated = 0;
          if (items && items.length > 0) {
            const itemsToInsert = items.map((texto, index) => ({
              tarea_id: task.id,
              texto,
              orden: index
            }));

            const { error: itemsError } = await supabase
              .from('wp_tareas_items')
              .insert(itemsToInsert);

            if (itemsError) {
              logger.warn('[Tool:createTask] Error creating items:', itemsError);
            } else {
              itemsCreated = items.length;
            }
          }

          const asignado = Array.isArray(task.asignado) ? task.asignado[0] : task.asignado;
          const contacto = Array.isArray(task.contacto) ? task.contacto[0] : task.contacto;
          const proyecto = Array.isArray(task.proyecto) ? task.proyecto[0] : task.proyecto;
          const prioridadEmoji: Record<number, string> = { 1: '🟢', 2: '🟡', 3: '🟠', 4: '🔴' };
          const prioridadLabel: Record<number, string> = { 1: 'Baja', 2: 'Media', 3: 'Alta', 4: 'Urgente' };

          const resumenParts = [
            `✅ **Tarea creada exitosamente**`,
            `- **Título**: ${task.titulo}`,
            `- **ID**: ${task.id}`,
            `- **Prioridad**: ${prioridadEmoji[task.prioridad]} ${prioridadLabel[task.prioridad] || 'Media'}`,
            `- **Estado**: ${task.estado}`,
          ];
          
          if (asignado) resumenParts.push(`- **Asignado a**: ${asignado.nombre || ''} ${asignado.apellido || ''}`.trim());
          if (contacto) resumenParts.push(`- **Contacto**: ${buildContactMarkdownTag(`${contacto.nombre || ''} ${contacto.apellido || ''}`.trim(), contacto.id)}`.trim());
          if (proyecto) resumenParts.push(`- **Proyecto**: ${proyecto.nombre}`);
          if (task.fecha_vencimiento) resumenParts.push(`- **Vencimiento**: ${new Date(task.fecha_vencimiento).toLocaleDateString('es-ES')}`);
          if (itemsCreated > 0) resumenParts.push(`- **Subtareas**: ${itemsCreated} creadas`);

          logger.info('[Tool:createTask] Success', { taskId: task.id });

          return {
            success: true,
            resumen: resumenParts.join('\n'),
            tarea: {
              id: task.id,
              titulo: task.titulo,
              estado: task.estado,
              prioridad: task.prioridad,
              asignado: asignado ? `${asignado.nombre || ''} ${asignado.apellido || ''}`.trim() : 'Sin asignar',
              contacto: contacto ? { id: contacto.id, nombre: `${contacto.nombre || ''} ${contacto.apellido || ''}`.trim() } : null,
              proyecto: proyecto?.nombre || null,
              vencimiento: task.fecha_vencimiento,
              subtareas: itemsCreated
            },
            _instruccion: `Tarea ID ${task.id} creada. Para editarla usa updateTask({taskId: ${task.id}, ...}). Para ver todas las tareas usa getTasks.`
          };
        } catch (err: any) {
          logger.error('[Tool:createTask] Exception', err);
          return { success: false, error: `Error inesperado: ${err.message}` };
        }
      }
    },

    // ─────────────────────────────────────────────────────────────────
    // TOOL 10c: updateTask - Editar tarea existente
    // ─────────────────────────────────────────────────────────────────
    updateTask: {
      description: `✏️ EDITAR TAREA

Actualiza una tarea existente: cambiar estado, prioridad, asignado, fechas, etc.

USAR CUANDO:
- "Marca la tarea 42 como completada"
- "Cambia la prioridad de la tarea a urgente"
- "Asigna la tarea 15 a María"
- "Aplaza el vencimiento de la tarea al viernes"
- "Actualiza la descripción de la tarea 8"

⚠️ REQUISITO: Necesitas el taskId de getTasks.

FLUJO CORRECTO:
1. getTasks({search: "contrato"}) → Retorna [{id: 42, ...}]
2. updateTask({taskId: 42, estado: "completada"})

RETORNA: Tarea actualizada con los nuevos valores.`,
      inputSchema: z.object({
        taskId: z.number().int().positive()
          .describe('ID de la tarea (obtenido de getTasks)'),
        titulo: z.string().min(1).max(500).optional()
          .describe('Nuevo título'),
        descripcion: z.string().max(5000).nullable().optional()
          .describe('Nueva descripción (null para borrar)'),
        estado: z.enum(['pendiente', 'en_progreso', 'completada', 'cancelada']).optional()
          .describe('Nuevo estado'),
        prioridad: z.number().int().min(1).max(4).optional()
          .describe('Nueva prioridad: 1=baja, 2=media, 3=alta, 4=urgente'),
        asignado_a: z.number().int().positive().nullable().optional()
          .describe('ID del nuevo asignado (null para desasignar)'),
        proyecto_id: z.number().int().positive().nullable().optional()
          .describe('ID del proyecto (null para desvincular)'),
        fecha_vencimiento: z.string().nullable().optional()
          .describe('Nueva fecha límite ISO (null para quitar)')
      }),
      execute: async ({ taskId, titulo, descripcion, estado, prioridad, asignado_a, proyecto_id, fecha_vencimiento }: {
        taskId: number;
        titulo?: string;
        descripcion?: string | null;
        estado?: string;
        prioridad?: number;
        asignado_a?: number | null;
        proyecto_id?: number | null;
        fecha_vencimiento?: string | null;
      }) => {
        logger.info('[Tool:updateTask] Executing', { taskId, estado, prioridad, asignado_a, enterpriseId: resolvedEnterpriseId });
        
        try {
          // Verificar que la tarea existe y pertenece a la empresa
          const { data: existing, error: findError } = await supabase
            .from('wp_tareas')
            .select('id, titulo, estado, prioridad, asignado_a, fecha_vencimiento')
            .eq('id', taskId)
            .eq('empresa_id', resolvedEnterpriseId)
            .maybeSingle();

          if (findError || !existing) {
            return { success: false, error: `Tarea con ID ${taskId} no encontrada. Usa getTasks para buscar la tarea correcta.` };
          }

          // Validar asignado_a si se proporciona
          if (asignado_a !== undefined && asignado_a !== null) {
            const { data: memberCheck } = await supabase
              .from('wp_team_humano')
              .select('id')
              .eq('id', asignado_a)
              .eq('empresa_id', resolvedEnterpriseId)
              .eq('is_active', true)
              .maybeSingle();
            
            if (!memberCheck) {
              return { success: false, error: `Miembro del equipo con ID ${asignado_a} no encontrado o inactivo. Usa getTeamMembers.` };
            }
          }

          // Construir payload de actualización
          const updateData: Record<string, unknown> = {};
          if (titulo !== undefined) updateData.titulo = titulo;
          if (descripcion !== undefined) updateData.descripcion = descripcion;
          if (estado !== undefined) {
            updateData.estado = estado;
            if (estado === 'completada') {
              updateData.fecha_completada = new Date().toISOString();
            } else {
              updateData.fecha_completada = null;
            }
          }
          if (prioridad !== undefined) updateData.prioridad = prioridad;
          if (asignado_a !== undefined) updateData.asignado_a = asignado_a;
          if (proyecto_id !== undefined) updateData.proyecto_id = proyecto_id;
          if (fecha_vencimiento !== undefined) updateData.fecha_vencimiento = fecha_vencimiento;

          if (Object.keys(updateData).length === 0) {
            return { success: false, error: 'No se proporcionaron campos para actualizar.' };
          }

          const { data: updated, error: updateError } = await supabase
            .from('wp_tareas')
            .update(updateData)
            .eq('id', taskId)
            .eq('empresa_id', resolvedEnterpriseId)
            .select(`
              id, titulo, descripcion, estado, prioridad, fecha_vencimiento, fecha_completada,
              asignado:wp_team_humano!asignado_a(id, nombre, apellido),
              proyecto:wp_proyectos!proyecto_id(id, nombre)
            `)
            .single();

          if (updateError) {
            logger.error('[Tool:updateTask] DB error', updateError);
            return { success: false, error: `Error al actualizar: ${updateError.message}` };
          }

          const asignado = Array.isArray(updated.asignado) ? updated.asignado[0] : updated.asignado;
          const proyecto = Array.isArray(updated.proyecto) ? updated.proyecto[0] : updated.proyecto;
          const prioridadEmoji: Record<number, string> = { 1: '🟢', 2: '🟡', 3: '🟠', 4: '🔴' };
          const prioridadLabel: Record<number, string> = { 1: 'Baja', 2: 'Media', 3: 'Alta', 4: 'Urgente' };

          // Describir qué cambió
          const cambios: string[] = [];
          if (titulo !== undefined) cambios.push(`título → "${updated.titulo}"`);
          if (estado !== undefined) cambios.push(`estado → ${updated.estado}`);
          if (prioridad !== undefined) cambios.push(`prioridad → ${prioridadEmoji[updated.prioridad]} ${prioridadLabel[updated.prioridad]}`);
          if (asignado_a !== undefined) cambios.push(`asignado → ${asignado ? `${asignado.nombre} ${asignado.apellido || ''}`.trim() : 'Sin asignar'}`);
          if (fecha_vencimiento !== undefined) cambios.push(`vencimiento → ${updated.fecha_vencimiento ? new Date(updated.fecha_vencimiento).toLocaleDateString('es-ES') : 'Sin fecha'}`);
          if (proyecto_id !== undefined) cambios.push(`proyecto → ${proyecto?.nombre || 'Sin proyecto'}`);
          if (descripcion !== undefined) cambios.push('descripción actualizada');

          const resumen = `✏️ **Tarea #${updated.id} actualizada**\n- **${updated.titulo}**\n- Cambios: ${cambios.join(', ')}`;

          logger.info('[Tool:updateTask] Success', { taskId, cambios });

          return {
            success: true,
            resumen,
            tarea: {
              id: updated.id,
              titulo: updated.titulo,
              estado: updated.estado,
              prioridad: updated.prioridad,
              asignado: asignado ? `${asignado.nombre || ''} ${asignado.apellido || ''}`.trim() : 'Sin asignar',
              proyecto: proyecto?.nombre || null,
              vencimiento: updated.fecha_vencimiento
            },
            cambios
          };
        } catch (err: any) {
          logger.error('[Tool:updateTask] Exception', err);
          return { success: false, error: `Error inesperado: ${err.message}` };
        }
      }
    },

    // ─────────────────────────────────────────────────────────────────
    // TOOL 10d: deleteTask - Eliminar tarea
    // ─────────────────────────────────────────────────────────────────
    deleteTask: {
      description: `🗑️ ELIMINAR TAREA

Elimina permanentemente una tarea del CRM.

USAR CUANDO:
- "Elimina la tarea 42"
- "Borra esa tarea"
- "Quita la tarea de llamar a Juan"

⚠️ REQUISITO: Necesitas el taskId de getTasks.
⚠️ ACCIÓN IRREVERSIBLE: La tarea y sus subtareas serán eliminadas permanentemente.

FLUJO CORRECTO:
1. getTasks({search: "contrato"}) → Retorna [{id: 42, ...}]
2. deleteTask({taskId: 42})

RETORNA: Confirmación de eliminación.`,
      inputSchema: z.object({
        taskId: z.number().int().positive()
          .describe('ID de la tarea a eliminar (obtenido de getTasks)')
      }),
      execute: async ({ taskId }: { taskId: number }) => {
        logger.info('[Tool:deleteTask] Executing', { taskId, enterpriseId: resolvedEnterpriseId });
        
        try {
          // Verificar que la tarea existe y pertenece a la empresa
          const { data: existing, error: findError } = await supabase
            .from('wp_tareas')
            .select('id, titulo, estado')
            .eq('id', taskId)
            .eq('empresa_id', resolvedEnterpriseId)
            .maybeSingle();

          if (findError || !existing) {
            return { success: false, error: `Tarea con ID ${taskId} no encontrada. Usa getTasks para buscar la tarea correcta.` };
          }

          // Eliminar subtareas/items primero
          await supabase
            .from('wp_tareas_items')
            .delete()
            .eq('tarea_id', taskId);

          // Eliminar asignaciones
          await supabase
            .from('wp_tareas_asignados')
            .delete()
            .eq('tarea_id', taskId);

          // Eliminar comentarios
          await supabase
            .from('wp_tareas_comentarios')
            .delete()
            .eq('tarea_id', taskId);

          // Eliminar etiquetas
          await supabase
            .from('wp_tareas_etiquetas')
            .delete()
            .eq('tarea_id', taskId);

          // Eliminar la tarea
          const { error: deleteError } = await supabase
            .from('wp_tareas')
            .delete()
            .eq('id', taskId)
            .eq('empresa_id', resolvedEnterpriseId);

          if (deleteError) {
            logger.error('[Tool:deleteTask] DB error', deleteError);
            return { success: false, error: `Error al eliminar: ${deleteError.message}` };
          }

          logger.info('[Tool:deleteTask] Success', { taskId, titulo: existing.titulo });

          return {
            success: true,
            resumen: `🗑️ **Tarea eliminada**: "${existing.titulo}" (ID: ${taskId})`,
            tareaEliminada: {
              id: existing.id,
              titulo: existing.titulo,
              estado: existing.estado
            }
          };
        } catch (err: any) {
          logger.error('[Tool:deleteTask] Exception', err);
          return { success: false, error: `Error inesperado: ${err.message}` };
        }
      }
    },

    // ─────────────────────────────────────────────────────────────────
    // TOOL 10e: manageTaskItems - Gestionar subtareas/checklist
    // ─────────────────────────────────────────────────────────────────
    manageTaskItems: {
      description: `☑️ GESTIONAR SUBTAREAS / CHECKLIST

Añade, completa o elimina subtareas de una tarea existente.

USAR CUANDO:
- "Añade subtarea 'Revisar contrato' a la tarea 42"
- "Marca como completado el item 5"
- "Elimina la subtarea 8"
- "Agrega estos pasos a la tarea: paso1, paso2, paso3"

ACCIONES:
- add: Añadir nuevas subtareas (requiere items[])
- toggle: Marcar/desmarcar una subtarea (requiere itemId + completado)
- delete: Eliminar una subtarea (requiere itemId)

⚠️ Para obtener los IDs de subtareas, primero usa getTasks para ver la tarea con sus items.

RETORNA: Estado actualizado de las subtareas.`,
      inputSchema: z.object({
        taskId: z.number().int().positive()
          .describe('ID de la tarea padre'),
        action: z.enum(['add', 'toggle', 'delete'])
          .describe('Acción: add=añadir, toggle=completar/descompletar, delete=eliminar'),
        items: z.array(z.string().min(1).max(500)).max(20).optional()
          .describe('Textos de nuevas subtareas (solo para action=add)'),
        itemId: z.number().int().positive().optional()
          .describe('ID de la subtarea (para toggle/delete)'),
        completado: z.boolean().optional()
          .describe('true=completar, false=descompletar (solo para toggle)')
      }),
      execute: async ({ taskId, action, items, itemId, completado }: {
        taskId: number;
        action: 'add' | 'toggle' | 'delete';
        items?: string[];
        itemId?: number;
        completado?: boolean;
      }) => {
        logger.info('[Tool:manageTaskItems] Executing', { taskId, action, itemId, enterpriseId: resolvedEnterpriseId });
        
        try {
          // Verificar que la tarea existe y pertenece a la empresa
          const { data: taskCheck, error: taskErr } = await supabase
            .from('wp_tareas')
            .select('id, titulo')
            .eq('id', taskId)
            .eq('empresa_id', resolvedEnterpriseId)
            .maybeSingle();

          if (taskErr || !taskCheck) {
            return { success: false, error: `Tarea con ID ${taskId} no encontrada. Usa getTasks para buscar la tarea correcta.` };
          }

          // === ADD ===
          if (action === 'add') {
            if (!items || items.length === 0) {
              return { success: false, error: 'Se requiere al menos una subtarea en el campo "items".' };
            }

            // Obtener el orden máximo actual
            const { data: existingItems } = await supabase
              .from('wp_tareas_items')
              .select('orden')
              .eq('tarea_id', taskId)
              .order('orden', { ascending: false })
              .limit(1);

            const maxOrden = existingItems?.[0]?.orden ?? -1;

            const itemsToInsert = items.map((texto, index) => ({
              tarea_id: taskId,
              texto,
              orden: maxOrden + 1 + index
            }));

            const { data: created, error: insertError } = await supabase
              .from('wp_tareas_items')
              .insert(itemsToInsert)
              .select('id, texto, orden, completado');

            if (insertError) {
              return { success: false, error: `Error al crear subtareas: ${insertError.message}` };
            }

            logger.info('[Tool:manageTaskItems] Added items', { taskId, count: created?.length });

            return {
              success: true,
              resumen: `☑️ **${created?.length || 0} subtarea(s) añadida(s)** a "${taskCheck.titulo}":\n${(created || []).map(i => `- ⬜ ${i.texto}`).join('\n')}`,
              itemsCreados: created,
              total: (created || []).length
            };
          }

          // === TOGGLE ===
          if (action === 'toggle') {
            if (!itemId) {
              return { success: false, error: 'Se requiere "itemId" para toggle.' };
            }

            // Verificar que el item pertenece a la tarea
            const { data: item, error: itemErr } = await supabase
              .from('wp_tareas_items')
              .select('id, texto, completado, tarea_id')
              .eq('id', itemId)
              .eq('tarea_id', taskId)
              .maybeSingle();

            if (itemErr || !item) {
              return { success: false, error: `Subtarea con ID ${itemId} no encontrada en la tarea ${taskId}.` };
            }

            const newStatus = completado !== undefined ? completado : !item.completado;

            const { data: updated, error: toggleErr } = await supabase
              .from('wp_tareas_items')
              .update({ 
                completado: newStatus,
                completado_por: newStatus ? teamMember.id : null,
                completado_at: newStatus ? new Date().toISOString() : null
              })
              .eq('id', itemId)
              .select('id, texto, completado')
              .single();

            if (toggleErr) {
              return { success: false, error: `Error al actualizar subtarea: ${toggleErr.message}` };
            }

            const emoji = updated.completado ? '☑️' : '⬜';
            logger.info('[Tool:manageTaskItems] Toggled item', { itemId, completado: updated.completado });

            return {
              success: true,
              resumen: `${emoji} Subtarea "${updated.texto}" ${updated.completado ? 'completada' : 'reabierta'}`,
              item: updated
            };
          }

          // === DELETE ===
          if (action === 'delete') {
            if (!itemId) {
              return { success: false, error: 'Se requiere "itemId" para eliminar.' };
            }

            // Verificar que el item pertenece a la tarea
            const { data: item, error: itemErr } = await supabase
              .from('wp_tareas_items')
              .select('id, texto, tarea_id')
              .eq('id', itemId)
              .eq('tarea_id', taskId)
              .maybeSingle();

            if (itemErr || !item) {
              return { success: false, error: `Subtarea con ID ${itemId} no encontrada en la tarea ${taskId}.` };
            }

            const { error: delErr } = await supabase
              .from('wp_tareas_items')
              .delete()
              .eq('id', itemId);

            if (delErr) {
              return { success: false, error: `Error al eliminar subtarea: ${delErr.message}` };
            }

            logger.info('[Tool:manageTaskItems] Deleted item', { itemId, texto: item.texto });

            return {
              success: true,
              resumen: `🗑️ Subtarea eliminada: "${item.texto}"`,
              itemEliminado: { id: item.id, texto: item.texto }
            };
          }

          return { success: false, error: `Acción "${action}" no reconocida. Usa: add, toggle o delete.` };
        } catch (err: any) {
          logger.error('[Tool:manageTaskItems] Exception', err);
          return { success: false, error: `Error inesperado: ${err.message}` };
        }
      }
    },

    // ─────────────────────────────────────────────────────────────────
    // TOOL 11: getProjects - Proyectos
    // ─────────────────────────────────────────────────────────────────
    getProjects: {
      description: `📁 OBTENER PROYECTOS

Lista proyectos de la empresa con sus tareas y progreso.

USAR CUANDO:
- "¿Qué proyectos tenemos?"
- "Buscar proyecto Monica v2"
- "Proyectos activos"
- "Estado del proyecto X"

RETORNA: Lista de proyectos con nombre, estado y progreso.`,
      inputSchema: z.object({
        search: z.string().optional()
          .describe('Buscar en nombre y descripción'),
        estado: z.enum(['activo', 'pausado', 'completado', 'cancelado']).optional()
          .describe('Filtrar por estado'),
        limit: z.number().int().min(1).max(50).optional().default(20)
          .describe('Máximo de resultados (default: 20)')
      }),
      execute: async ({ search, estado, limit = 20 }: {
        search?: string;
        estado?: string;
        limit?: number;
      }) => {
        logger.info('[Tool:getProjects] Executing', { search, estado, enterpriseId: resolvedEnterpriseId });
        
        try {
          let query = supabase
            .from('wp_proyectos')
            .select(`
              id, nombre, descripcion, estado, color, created_at,
              creador:wp_team_humano!creado_por(id, nombre, apellido)
            `)
            .eq('empresa_id', resolvedEnterpriseId);

          if (search) {
            query = query.or(`nombre.ilike.%${search}%,descripcion.ilike.%${search}%`);
          }
          if (estado) query = query.eq('estado', estado);

          query = query.order('created_at', { ascending: false }).limit(limit);

          const { data, error } = await query;
          if (error) {
            return { success: false, error: `Error de base de datos: ${error.message}` };
          }

          const proyectos = (data || []).map(p => {
            const creador = Array.isArray(p.creador) ? p.creador[0] : p.creador;
            return {
              id: p.id,
              nombre: p.nombre,
              descripcion: p.descripcion,
              estado: p.estado || 'activo',
              creador: creador ? `${creador.nombre || ''} ${creador.apellido || ''}`.trim() : 'Desconocido'
            };
          });

          const resumen = proyectos.length === 0
            ? 'No hay proyectos registrados.'
            : `${proyectos.length} proyecto(s):\n${proyectos.map((p, i) => 
                `${i+1}. ${p.nombre} [${p.estado}]`
              ).join('\n')}`;

          return {
            success: true,
            resumen,
            proyectos,
            total: proyectos.length,
            _instruccion: proyectos.length > 0 
              ? `Para ver tareas de un proyecto, usa getTasks con el nombre del proyecto en search.`
              : null
          };
        } catch (err: any) {
          logger.error('[Tool:getProjects] Exception', err);
          return { success: false, error: `Error inesperado: ${err.message}` };
        }
      }
    },

    // ─────────────────────────────────────────────────────────────────
    // TOOL 12: getTeamMembers - Miembros del equipo
    // ─────────────────────────────────────────────────────────────────
    getTeamMembers: {
      description: `👥 OBTENER MIEMBROS DEL EQUIPO

Lista los asesores y miembros del equipo.

USAR CUANDO:
- "¿Quiénes están en el equipo?"
- "Lista de asesores"
- "¿Quién es el responsable de X?"

RETORNA: Lista con nombre, email, rol y estado de cada miembro.`,
      inputSchema: z.object({
        soloActivos: z.boolean().optional().default(true)
          .describe('true = solo miembros activos (default: true)')
      }),
      execute: async ({ soloActivos = true }: { soloActivos?: boolean }) => {
        logger.info('[Tool:getTeamMembers] Executing', { soloActivos, enterpriseId: resolvedEnterpriseId });
        
        try {
          let query = supabase
            .from('wp_team_humano')
            .select('id, nombre, apellido, email, rol, is_active, especialidad')
            .eq('empresa_id', resolvedEnterpriseId);

          if (soloActivos) query = query.eq('is_active', true);

          query = query.order('nombre');

          const { data, error } = await query;
          if (error) {
            return { success: false, error: `Error de base de datos: ${error.message}` };
          }

          const miembros = (data || []).map(m => ({
            id: m.id,
            nombre: `${m.nombre || ''} ${m.apellido || ''}`.trim() || 'Sin nombre',
            email: m.email || '-',
            rol: m.rol || 'asesor',
            activo: m.is_active,
            especialidad: m.especialidad
          }));

          const resumen = miembros.length === 0
            ? 'No hay miembros del equipo registrados.'
            : `${miembros.length} miembro(s) del equipo:\n${miembros.map((m, i) => 
                `${i+1}. ${m.nombre} (${m.rol}) - ${m.email}`
              ).join('\n')}`;

          return {
            success: true,
            resumen,
            miembros,
            total: miembros.length
          };
        } catch (err: any) {
          logger.error('[Tool:getTeamMembers] Exception', err);
          return { success: false, error: `Error inesperado: ${err.message}` };
        }
      }
    },

    getContactAssignments: {
      description: `👥 OBTENER ASIGNACIONES DE UN CONTACTO

Consulta responsable, colaboradores y observadores de un contacto.

USAR CUANDO:
- "¿Quién es el responsable de este contacto?"
- "Muéstrame sus colaboradores"
- "¿Tiene observadores asignados?"

RETORNA: responsable actual, lista completa de asignaciones y conteos por rol.`,
      inputSchema: z.object({
        contactId: z.number().int().positive()
          .describe('ID del contacto. Usa searchContacts o getContactContext para obtenerlo.')
      }),
      execute: async ({ contactId }: { contactId: number }) => {
        logger.info('[Tool:getContactAssignments] Executing', { contactId, enterpriseId: resolvedEnterpriseId });

        try {
          const { data: contact, error: contactError } = await supabase
            .from('wp_contactos')
            .select(contactSelectFields)
            .eq('id', contactId)
            .eq('empresa_id', resolvedEnterpriseId)
            .maybeSingle();

          if (contactError) {
            return { success: false, error: `Error de base de datos: ${contactError.message}` };
          }

          if (!contact) {
            return { success: false, error: `Contacto con ID ${contactId} no encontrado. Usa searchContacts para ubicar el contacto correcto.` };
          }

          const rawAssignments = await fetchContactAssignmentsForTool(contactId, resolvedEnterpriseId);
          const assignments = rawAssignments.map(serializeContactAssignmentRecord);
          let responsible = assignments.find((assignment: SerializedContactAssignment) => assignment.esPrincipal) || null;

          if (!responsible && contact.team_humano_id) {
            const { data: fallbackMember } = await supabase
              .from('wp_team_humano')
              .select('id, nombre, apellido, email, is_active')
              .eq('id', contact.team_humano_id)
              .eq('empresa_id', resolvedEnterpriseId)
              .maybeSingle();

            if (fallbackMember) {
              responsible = {
                id: null,
                teamMemberId: fallbackMember.id,
                nombre: buildContactDisplayName(fallbackMember),
                email: fallbackMember.email || null,
                rol: 'Responsable',
                rolClave: 'principal',
                esPrincipal: true,
                activo: fallbackMember.is_active !== false,
                createdAt: null
              };
            }
          }

          const collaborators = assignments.filter((assignment: SerializedContactAssignment) => assignment.rolClave === 'colaborador');
          const observers = assignments.filter((assignment: SerializedContactAssignment) => assignment.rolClave === 'observador');
          const contactName = buildContactDisplayName(contact);
          const summaryLines = [
            `👥 **Asignaciones de ${contactName}**`,
            responsible
              ? `- Responsable: ${responsible.nombre}`
              : '- Responsable: Sin asignar',
            `- Colaboradores: ${collaborators.length}`,
            `- Observadores: ${observers.length}`,
            ...buildAssignmentsSummaryLines(assignments)
          ];

          return {
            success: true,
            resumen: summaryLines.join('\n'),
            contact: {
              id: contact.id,
              nombre: contactName,
              etiquetaMarkdown: buildContactMarkdownTag(contactName, contact.id),
              estado: contact.estado || null
            },
            responsible,
            collaborators,
            observers,
            assignments,
            totals: {
              total: assignments.length,
              collaborators: collaborators.length,
              observers: observers.length,
              hasResponsible: !!responsible
            },
            _instruccion: `Para cambiar responsable o gestionar colaboradores/observadores usa manageContactAssignments con contactId ${contact.id}.`
          };
        } catch (err: any) {
          logger.error('[Tool:getContactAssignments] Exception', err);
          return { success: false, error: `Error inesperado: ${err.message}` };
        }
      }
    },

    manageContactAssignments: {
      description: `🛠️ GESTIONAR ASIGNACIONES DE CONTACTO

Cambia responsable y gestiona colaboradores u observadores con confirmación en dos pasos.

OPERACIONES:
- set_primary: asignar o cambiar responsable
- clear_primary: dejar el contacto sin responsable
- add_assignment: agregar colaborador u observador
- update_assignment_role: cambiar rol de un miembro ya asignado
- remove_assignment: quitar un miembro asignado

FLUJO RECOMENDADO:
1. Usa confirm:false para obtener un preview.
2. Solo usa confirm:true cuando el usuario confirme el cambio.

IMPORTANTE:
- Usa IDs reales de contacto y miembro del equipo.
- Para conocer el estado actual, usa getContactAssignments antes de mutar.`,
      inputSchema: z.object({
        operation: z.enum(CONTACT_ASSIGNMENT_OPERATION_VALUES)
          .describe('Tipo de cambio a ejecutar sobre las asignaciones del contacto.'),
        contactId: z.number().int().positive()
          .describe('ID del contacto. Usa searchContacts o getContactContext para obtenerlo.'),
        teamMemberId: z.number().int().positive().optional()
          .describe('ID del miembro del equipo afectado por la operación.'),
        role: z.enum(CONTACT_ASSIGNMENT_ROLE_VALUES).optional()
          .describe('Rol secundario para add_assignment o update_assignment_role.'),
        confirm: z.boolean().optional().default(false)
          .describe('false = preview, true = ejecutar el cambio.')
      }),
      execute: async ({ operation, contactId, teamMemberId, role, confirm = false }: {
        operation: (typeof CONTACT_ASSIGNMENT_OPERATION_VALUES)[number];
        contactId: number;
        teamMemberId?: number;
        role?: (typeof CONTACT_ASSIGNMENT_ROLE_VALUES)[number];
        confirm?: boolean;
      }) => {
        logger.info('[Tool:manageContactAssignments] Executing', {
          operation,
          contactId,
          teamMemberId,
          role,
          confirm,
          enterpriseId: resolvedEnterpriseId
        });

        try {
          const { data: contact, error: contactError } = await supabase
            .from('wp_contactos')
            .select('id, nombre, apellido, estado, empresa_id, team_humano_id')
            .eq('id', contactId)
            .eq('empresa_id', resolvedEnterpriseId)
            .maybeSingle();

          if (contactError) {
            return { success: false, error: `Error de base de datos: ${contactError.message}` };
          }

          if (!contact) {
            return { success: false, error: `Contacto con ID ${contactId} no encontrado en esta empresa.` };
          }

          const rawAssignments = await fetchContactAssignmentsForTool(contactId, resolvedEnterpriseId);
          const assignments = rawAssignments.map(serializeContactAssignmentRecord);
          const currentResponsible = assignments.find((assignment: SerializedContactAssignment) => assignment.esPrincipal) || null;
          const targetAssignmentRaw = teamMemberId
            ? rawAssignments.find((assignment: any) => assignment.team_humano_id === teamMemberId)
            : null;

          let targetMember: any = null;
          if (teamMemberId) {
            const { data: member, error: memberError } = await supabase
              .from('wp_team_humano')
              .select('id, nombre, apellido, email, is_active')
              .eq('id', teamMemberId)
              .eq('empresa_id', resolvedEnterpriseId)
              .maybeSingle();

            if (memberError) {
              return { success: false, error: `Error de base de datos: ${memberError.message}` };
            }

            if (!member) {
              return { success: false, error: `Miembro del equipo con ID ${teamMemberId} no encontrado en esta empresa. Usa getTeamMembers para obtener IDs válidos.` };
            }

            targetMember = member;
          }

          const contactName = buildContactDisplayName(contact);
          const targetMemberName = targetMember ? buildContactDisplayName(targetMember) : null;
          const warnings: string[] = [];
          let previewTitle = '';
          let previewDescription = '';

          if (operation === 'set_primary') {
            if (!teamMemberId || !targetMember) {
              return { success: false, error: 'Debes indicar teamMemberId para asignar responsable.' };
            }
            if (targetMember.is_active === false && contact.team_humano_id !== targetMember.id) {
              return { success: false, error: 'No puedes asignar como responsable a un miembro inactivo.' };
            }
            if (currentResponsible?.teamMemberId === teamMemberId) {
              return { success: false, error: `${targetMemberName} ya es el responsable actual del contacto.` };
            }

            previewTitle = 'Cambio de responsable';
            previewDescription = currentResponsible
              ? `Se reemplazará a ${currentResponsible.nombre} por ${targetMemberName} como responsable.`
              : `Se asignará a ${targetMemberName} como responsable del contacto.`;
          }

          if (operation === 'clear_primary') {
            if (!currentResponsible && !contact.team_humano_id) {
              return { success: false, error: 'Este contacto ya no tiene responsable asignado.' };
            }

            previewTitle = 'Quitar responsable';
            previewDescription = 'El contacto quedará sin responsable principal.';
          }

          if (operation === 'add_assignment') {
            if (!teamMemberId || !targetMember) {
              return { success: false, error: 'Debes indicar teamMemberId para agregar una asignación.' };
            }
            if (!role) {
              return { success: false, error: 'Debes indicar role para agregar una asignación.' };
            }
            if (targetMember.is_active === false) {
              return { success: false, error: 'No puedes agregar miembros inactivos al equipo del contacto.' };
            }
            if (targetAssignmentRaw) {
              return { success: false, error: `${targetMemberName} ya forma parte del equipo del contacto. Usa update_assignment_role si quieres cambiar su rol.` };
            }

            previewTitle = 'Agregar al equipo del contacto';
            previewDescription = `Se agregará a ${targetMemberName} como ${getAssignmentRoleLabel(role)}.`;
          }

          if (operation === 'update_assignment_role') {
            if (!teamMemberId || !targetMember) {
              return { success: false, error: 'Debes indicar teamMemberId para cambiar el rol de una asignación.' };
            }
            if (!role) {
              return { success: false, error: 'Debes indicar role para actualizar el rol de una asignación.' };
            }
            if (!targetAssignmentRaw) {
              return { success: false, error: `${targetMemberName} no está asignado a este contacto.` };
            }
            if (targetAssignmentRaw.es_principal) {
              return { success: false, error: 'No puedes cambiar el rol secundario del responsable actual. Usa set_primary o clear_primary según corresponda.' };
            }
            if ((targetAssignmentRaw.rol_asignacion || 'colaborador') === role) {
              return { success: false, error: `${targetMemberName} ya tiene el rol ${getAssignmentRoleLabel(role)}.` };
            }

            previewTitle = 'Actualizar rol de asignación';
            previewDescription = `Se cambiará el rol de ${targetMemberName} a ${getAssignmentRoleLabel(role)}.`;
          }

          if (operation === 'remove_assignment') {
            if (!teamMemberId || !targetMember) {
              return { success: false, error: 'Debes indicar teamMemberId para quitar una asignación.' };
            }
            if (!targetAssignmentRaw) {
              return { success: false, error: `${targetMemberName} no está asignado a este contacto.` };
            }

            previewTitle = 'Quitar miembro del equipo del contacto';
            previewDescription = `Se eliminará la asignación de ${targetMemberName}.`;

            if (targetAssignmentRaw.es_principal) {
              const nextResponsibleCandidate = rawAssignments
                .filter((assignment: any) => assignment.id !== targetAssignmentRaw.id)
                .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0];

              if (nextResponsibleCandidate) {
                warnings.push(`Al quitar al responsable actual, ${buildContactDisplayName({ nombre: nextResponsibleCandidate.team_nombre, apellido: nextResponsibleCandidate.team_apellido })} quedará como nuevo responsable por las reglas actuales de la base de datos.`);
              } else {
                warnings.push('Al quitar al responsable actual, el contacto quedará sin responsable.');
              }
            }
          }

          const preview = {
            operation,
            contactId: contact.id,
            contactName,
            currentResponsible: currentResponsible?.nombre || null,
            targetMemberId: teamMemberId || null,
            targetMemberName,
            role: role || null,
            description: previewDescription,
            warnings,
            currentAssignments: assignments
          };

          if (!confirm) {
            return {
              success: true,
              resumen: [
                `⚠️ **Preview de ${previewTitle.toLowerCase()}**`,
                `- Contacto: ${buildContactMarkdownTag(contactName, contact.id)}`,
                `- Acción: ${previewTitle}`,
                `- Detalle: ${previewDescription}`,
                ...(warnings.length ? warnings.map(warning => `- Aviso: ${warning}`) : [])
              ].join('\n'),
              requiresConfirmation: true,
              preview,
              _instruccion: 'Si el usuario confirma, vuelve a llamar manageContactAssignments con los mismos datos y confirm:true.'
            };
          }

          if (operation === 'set_primary' && teamMemberId && targetMember) {
            if (targetAssignmentRaw) {
              const { error } = await supabase
                .from('wp_contacto_team_asignaciones')
                .update({ es_principal: true, rol_asignacion: 'principal' })
                .eq('id', targetAssignmentRaw.id);

              if (error) {
                return { success: false, error: `Error al actualizar responsable: ${error.message}` };
              }
            } else {
              const { error } = await supabase
                .from('wp_contacto_team_asignaciones')
                .insert({
                  contacto_id: contact.id,
                  team_humano_id: teamMemberId,
                  es_principal: true,
                  rol_asignacion: 'principal',
                  empresa_id: resolvedEnterpriseId,
                  asignado_por: teamMember.id
                });

              if (error) {
                return { success: false, error: `Error al asignar responsable: ${error.message}` };
              }
            }

            await notifyResponsibleAssignment({
              contactId: contact.id,
              contactName,
              enterpriseId: resolvedEnterpriseId,
              advisorId: teamMemberId
            });
          }

          if (operation === 'clear_primary') {
            const { error } = await supabase
              .from('wp_contactos')
              .update({ team_humano_id: null })
              .eq('id', contact.id)
              .eq('empresa_id', resolvedEnterpriseId);

            if (error) {
              return { success: false, error: `Error al quitar responsable: ${error.message}` };
            }
          }

          if (operation === 'add_assignment' && teamMemberId && targetMember && role) {
            const { error } = await supabase
              .from('wp_contacto_team_asignaciones')
              .insert({
                contacto_id: contact.id,
                team_humano_id: teamMemberId,
                es_principal: false,
                rol_asignacion: role,
                empresa_id: resolvedEnterpriseId,
                asignado_por: teamMember.id
              });

            if (error) {
              return { success: false, error: `Error al agregar asignación: ${error.message}` };
            }
          }

          if (operation === 'update_assignment_role' && targetAssignmentRaw && role) {
            const { error } = await supabase
              .from('wp_contacto_team_asignaciones')
              .update({ rol_asignacion: role })
              .eq('id', targetAssignmentRaw.id);

            if (error) {
              return { success: false, error: `Error al actualizar rol de asignación: ${error.message}` };
            }
          }

          if (operation === 'remove_assignment' && targetAssignmentRaw) {
            const removedWasPrimary = !!targetAssignmentRaw.es_principal;

            const { error } = await supabase
              .from('wp_contacto_team_asignaciones')
              .delete()
              .eq('id', targetAssignmentRaw.id);

            if (error) {
              return { success: false, error: `Error al eliminar asignación: ${error.message}` };
            }

            if (removedWasPrimary) {
              const updatedAssignments = await fetchContactAssignmentsForTool(contact.id, resolvedEnterpriseId);
              const newResponsible = updatedAssignments.find((assignment: any) => assignment.es_principal);

              if (newResponsible?.team_humano_id) {
                await notifyResponsibleAssignment({
                  contactId: contact.id,
                  contactName,
                  enterpriseId: resolvedEnterpriseId,
                  advisorId: newResponsible.team_humano_id
                });
              }
            }
          }

          const updatedAssignmentsRaw = await fetchContactAssignmentsForTool(contact.id, resolvedEnterpriseId);
          const updatedAssignments = updatedAssignmentsRaw.map(serializeContactAssignmentRecord);
          const updatedResponsible = updatedAssignments.find((assignment: SerializedContactAssignment) => assignment.esPrincipal) || null;
          const updatedCollaborators = updatedAssignments.filter((assignment: SerializedContactAssignment) => assignment.rolClave === 'colaborador');
          const updatedObservers = updatedAssignments.filter((assignment: SerializedContactAssignment) => assignment.rolClave === 'observador');

          return {
            success: true,
            resumen: [
              `✅ **${previewTitle} ejecutado**`,
              `- Contacto: ${buildContactMarkdownTag(contactName, contact.id)}`,
              updatedResponsible
                ? `- Responsable actual: ${updatedResponsible.nombre}`
                : '- Responsable actual: Sin asignar',
              `- Colaboradores: ${updatedCollaborators.length}`,
              `- Observadores: ${updatedObservers.length}`
            ].join('\n'),
            contact: {
              id: contact.id,
              nombre: contactName,
              etiquetaMarkdown: buildContactMarkdownTag(contactName, contact.id)
            },
            responsible: updatedResponsible,
            assignments: updatedAssignments,
            totals: {
              total: updatedAssignments.length,
              collaborators: updatedCollaborators.length,
              observers: updatedObservers.length
            },
            warnings
          };
        } catch (err: any) {
          logger.error('[Tool:manageContactAssignments] Exception', err);
          return { success: false, error: `Error inesperado: ${err.message}` };
        }
      }
    },

    // ─────────────────────────────────────────────────────────────────
    // TOOL 13: getMetrics - Métricas y KPIs (Alineado con Dashboard)
    // ─────────────────────────────────────────────────────────────────
    getMetrics: {
      description: `📊 OBTENER MÉTRICAS DEL NEGOCIO

Consulta KPIs: contactos nuevos, citas agendadas, conversaciones, tasa de conversión y efectividad.

USAR CUANDO:
- "¿Cuántos contactos nuevos esta semana?"
- "Métricas del mes" / "Métricas de febrero"
- "Resumen de hoy"
- "KPIs del trimestre"

PERÍODOS RELATIVOS: today, week, month, quarter, year
RANGOS EXACTOS: Usa dateFrom y dateTo para rangos específicos (ej: "métricas de febrero" → dateFrom: "2026-02-01", dateTo: "2026-02-28")

IMPORTANTE: Si el usuario pide métricas de un mes específico, usa dateFrom/dateTo en vez de periodo.

RETORNA: Contactos nuevos, citas agendadas, conversaciones, tasa de conversión contacto→cita, efectividad de citas.`,
      inputSchema: z.object({
        periodo: z.enum(['today', 'week', 'month', 'quarter', 'year']).optional()
          .describe('Período relativo (default: week). Ignorado si se provee dateFrom/dateTo.'),
        dateFrom: z.string().optional()
          .describe('Fecha inicio ISO (ej: "2026-02-01T00:00:00.000Z"). Usar para rangos exactos.'),
        dateTo: z.string().optional()
          .describe('Fecha fin ISO (ej: "2026-02-28T23:59:59.999Z"). Usar para rangos exactos.'),
        teamMemberIds: z.array(z.number().int().positive()).optional()
          .describe('IDs de miembros del equipo para filtrar. Vacío = todos.')
      }),
      execute: async ({ periodo, dateFrom, dateTo, teamMemberIds }: {
        periodo?: string; dateFrom?: string; dateTo?: string; teamMemberIds?: number[]
      }) => {
        // SECURITY: Role 3 can only see their own metrics
        if (isRole3User) {
          teamMemberIds = [teamMember.id];
        }

        logger.info('[Tool:getMetrics] Executing', { periodo, dateFrom, dateTo, teamMemberIds, enterpriseId: resolvedEnterpriseId });

        try {
          // Calculate date range - prefer explicit dates over relative period
          let startISO: string;
          let endISO: string;
          let periodoLabel: string;

          if (dateFrom && dateTo) {
            startISO = dateFrom;
            endISO = dateTo;
            const fromDate = new Date(dateFrom);
            const toDate = new Date(dateTo);
            periodoLabel = `del ${fromDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })} al ${toDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}`;
          } else {
            const now = new Date();
            let startDate = new Date();
            const effectivePeriod = periodo || 'week';

            switch (effectivePeriod) {
              case 'today':
                startDate.setHours(0, 0, 0, 0);
                break;
              case 'week':
                startDate.setDate(now.getDate() - 7);
                break;
              case 'month':
                startDate.setMonth(now.getMonth() - 1);
                break;
              case 'quarter':
                startDate.setMonth(now.getMonth() - 3);
                break;
              case 'year':
                startDate.setFullYear(now.getFullYear() - 1);
                break;
            }

            startISO = startDate.toISOString();
            endISO = now.toISOString();

            const labels: Record<string, string> = {
              today: 'hoy',
              week: 'esta semana (últimos 7 días)',
              month: 'este mes (últimos 30 días)',
              quarter: 'este trimestre',
              year: 'este año'
            };
            periodoLabel = labels[effectivePeriod] || effectivePeriod;
          }

          // Build queries with consistent filters (aligned with Dashboard)
          // All queries use created_at for date filtering (same as Dashboard)
          const buildContactQuery = () => {
            let q = supabase
              .from('wp_contactos')
              .select('id', { count: 'exact', head: true })
              .eq('empresa_id', resolvedEnterpriseId)
              .gte('created_at', startISO)
              .lte('created_at', endISO);
            if (teamMemberIds && teamMemberIds.length > 0) q = q.in('team_humano_id', teamMemberIds);
            return q;
          };

          const buildAppointmentQuery = () => {
            let q = supabase
              .from('wp_citas')
              .select('id, estado', { count: 'exact' })
              .eq('empresa_id', resolvedEnterpriseId)
              .gte('created_at', startISO)
              .lte('created_at', endISO);
            if (teamMemberIds && teamMemberIds.length > 0) q = q.in('team_humano_id', teamMemberIds);
            return q;
          };

          const buildConversationQuery = () => {
            let q = supabase
              .from('wp_conversaciones')
              .select('id', { count: 'exact', head: true })
              .eq('empresa_id', resolvedEnterpriseId)
              .gte('fecha_inicio', startISO)
              .lte('fecha_inicio', endISO);
            return q;
          };

          const buildMessageQuery = () => {
            return supabase
              .from('wp_mensajes')
              .select('id', { count: 'exact', head: true })
              .eq('empresa_id', resolvedEnterpriseId)
              .gte('created_at', startISO)
              .lte('created_at', endISO);
          };

          const [newContactsRes, appointmentsRes, conversationsRes, messagesRes] = await Promise.all([
            buildContactQuery(),
            buildAppointmentQuery(),
            buildConversationQuery(),
            buildMessageQuery()
          ]);

          const newContacts = newContactsRes.count || 0;
          const totalAppointments = appointmentsRes.count || 0;
          const appointmentData = appointmentsRes.data || [];
          const completedAppointments = appointmentData.filter((a: any) => 
            ['completada', 'realizada'].includes((a.estado || '').toLowerCase())
          ).length;
          const cancelledAppointments = appointmentData.filter((a: any) => 
            (a.estado || '').toLowerCase() === 'cancelada'
          ).length;
          const activeConversations = conversationsRes.count || 0;
          const totalMessages = messagesRes.count || 0;

          // Calculate rates (same as Dashboard)
          const conversionRate = newContacts > 0 
            ? Math.round((totalAppointments / newContacts) * 100) 
            : 0;
          const closedAppointments = completedAppointments + cancelledAppointments;
          const effectivenessRate = closedAppointments > 0 
            ? Math.round((completedAppointments / closedAppointments) * 100) 
            : 0;

          const teamFilterLabel = teamMemberIds && teamMemberIds.length > 0 
            ? ` (filtrado por ${teamMemberIds.length} miembro(s))` 
            : '';

          const resumen = `📊 **Métricas ${periodoLabel}**${teamFilterLabel}
- Contactos nuevos: ${newContacts}
- Citas agendadas: ${totalAppointments} (${completedAppointments} completadas, ${cancelledAppointments} canceladas)
- Conversaciones: ${activeConversations}
- Mensajes totales: ${totalMessages}
- Tasa de conversión (contacto→cita): ${conversionRate}%
- Efectividad de citas: ${effectivenessRate}%`;

          return {
            success: true,
            resumen,
            metricas: {
              periodoLabel,
              dateRange: { from: startISO, to: endISO },
              newContacts,
              totalAppointments,
              completedAppointments,
              cancelledAppointments,
              activeConversations,
              totalMessages,
              conversionRate,
              effectivenessRate,
              teamMemberIds: teamMemberIds || []
            }
          };
        } catch (err: any) {
          logger.error('[Tool:getMetrics] Exception', err);
          return { success: false, error: `Error inesperado: ${err.message}` };
        }
      }
    },

    // ─────────────────────────────────────────────────────────────────
    // TOOL 14: getFunnelStats - Estadísticas del embudo
    // ─────────────────────────────────────────────────────────────────
    getFunnelStats: {
      description: `📈 ESTADÍSTICAS DEL EMBUDO DE VENTAS

Obtiene las etapas del embudo con conteo de contactos por etapa.

USAR CUANDO:
- "¿Cómo está el embudo?"
- "Contactos por etapa"
- "Pipeline de ventas"
- "¿Cuántos hay en cada etapa?"

RETORNA: Etapas con nombre, color y cantidad de contactos.`,
      inputSchema: z.object({}),
      execute: async () => {
        logger.info('[Tool:getFunnelStats] Executing', { enterpriseId: resolvedEnterpriseId });
        
        try {
          const { data: stages } = await supabase
            .from('wp_empresa_embudo')
            .select('id, nombre_etapa, descripcion, orden_etapa')
            .eq('empresa_id', resolvedEnterpriseId)
            .order('orden_etapa');

          let funnelContactsQuery = supabase
            .from('wp_contactos')
            .select('etapa_embudo')
            .eq('empresa_id', resolvedEnterpriseId);

          // SECURITY: Role 3 can only see their assigned contacts in funnel
          if (isRole3User) {
            const visibleIds = await getVisibleContactIdsForRole3();
            if (visibleIds.length > 0) {
              funnelContactsQuery = funnelContactsQuery.in('id', visibleIds);
            }
          }

          const { data: contacts } = await funnelContactsQuery;

          const stageCounts: Record<number, number> = {};
          (contacts || []).forEach(c => {
            if (c.etapa_embudo) {
              stageCounts[c.etapa_embudo] = (stageCounts[c.etapa_embudo] || 0) + 1;
            }
          });

          const formatStage = (stage: FunnelStageRow) => formatFunnelStageForAgent(stage);

          const stats = (stages || []).map(stage => {
            const etapa = formatStage(stage as FunnelStageRow);
            return {
              id: etapa.id,
              nombre: etapa.nombre,
              color: etapa.color,
              orden: etapa.orden,
              contactos: stageCounts[stage.id] || 0,
              contextoAgente: etapa.contextoAgente
            };
          });

          const totalContacts = Object.values(stageCounts).reduce((a, b) => a + b, 0);

          const resumen = stats.length === 0
            ? 'No hay etapas de embudo configuradas.'
            : `📈 **Embudo de ventas** (${totalContacts} contactos total):\n${stats.map(s => 
                `- ${s.nombre}: ${s.contactos} contacto(s)`
              ).join('\n')}`;

          return {
            success: true,
            resumen,
            etapas: stats,
            totalContactos: totalContacts
          };
        } catch (err: any) {
          logger.error('[Tool:getFunnelStats] Exception', err);
          return { success: false, error: `Error inesperado: ${err.message}` };
        }
      }
    },

    getFunnelStages: {
      description: `📋 LISTAR ETAPAS DEL EMBUDO

Obtiene la lista ordenada de etapas del embudo comercial de la empresa.

USAR CUANDO:
- "¿Qué etapas existen en el embudo?"
- "Muéstrame la lista de etapas"
- Antes de cambiar la etapa de un contacto

RETORNA: id, nombre, orden, color y contexto operativo por etapa para que Monica sepa cuándo usarla.
⚠️ IMPORTANTE: Usa los IDs reales retornados aquí para cambiar la etapa de un contacto.`,
      inputSchema: z.object({}),
      execute: async () => {
        logger.info('[Tool:getFunnelStages] Executing', { enterpriseId: resolvedEnterpriseId });

        try {
          const { data: stages, error } = await supabase
            .from('wp_empresa_embudo')
            .select('id, nombre_etapa, descripcion, orden_etapa')
            .eq('empresa_id', resolvedEnterpriseId)
            .order('orden_etapa');

          if (error) {
            logger.error('[Tool:getFunnelStages] DB error', error);
            return { success: false, error: `Error de base de datos: ${error.message}` };
          }

          const formatStage = (stage: FunnelStageRow) => formatFunnelStageForAgent(stage);
          const etapas = (stages || []).map((stage) => formatStage(stage as FunnelStageRow));

          const resumen = etapas.length === 0
            ? 'No hay etapas de embudo configuradas.'
            : `📋 **Etapas del embudo**:\n${etapas.map((etapa) => `- ${etapa.nombre} (ID: ${etapa.id})${etapa.queEs ? ` — ${etapa.queEs}` : ''}`).join('\n')}`;

          return {
            success: true,
            resumen,
            etapas,
            total: etapas.length,
            _instruccion: etapas.length > 0
              ? `Antes de mover un contacto, revisa queEs, instruccionesAgente y criteriosAvance de la etapa objetivo. Luego usa updateContactStage con contactId y stageId. Ej: updateContactStage({contactId: 123, stageId: ${etapas[0].id}})`
              : null
          };
        } catch (err: any) {
          logger.error('[Tool:getFunnelStages] Exception', err);
          return { success: false, error: `Error inesperado: ${err.message}` };
        }
      }
    },

    updateContactStage: {
      description: `🔄 CAMBIAR ETAPA DE UN CONTACTO

Actualiza la etapa del embudo de un contacto específico.

USAR CUANDO:
- "Mueve a Juan a negociación"
- "Cambia este contacto a cierre"
- "Pasa el lead a la siguiente etapa"

REQUISITO: Antes de usar esta herramienta, consulta getFunnelStages para obtener el contexto y usar un stageId real.

RETORNA: Confirmación del cambio, etapa anterior y etapa nueva.`,
      inputSchema: z.object({
        contactId: z.number().int().positive()
          .describe('ID del contacto a actualizar'),
        stageId: z.number().int().positive()
          .describe('ID real de la nueva etapa, obtenido de getFunnelStages'),
        notas: z.string().max(500).optional()
          .describe('Nota opcional para trazabilidad del cambio')
      }),
      execute: async ({ contactId, stageId, notas }: { contactId: number; stageId: number; notas?: string }) => {
        logger.info('[Tool:updateContactStage] Executing', { contactId, stageId, enterpriseId: resolvedEnterpriseId });

        try {
          const { data: contact, error: contactError } = await supabase
            .from('wp_contactos')
            .select('id, nombre, apellido, etapa_embudo')
            .eq('id', contactId)
            .eq('empresa_id', resolvedEnterpriseId)
            .single();

          if (contactError || !contact) {
            logger.warn('[Tool:updateContactStage] Contact not found', { contactId, enterpriseId: resolvedEnterpriseId, error: contactError?.message });
            return { success: false, error: 'Contacto no encontrado o sin acceso para esta empresa.' };
          }

          const { data: stages, error: stagesError } = await supabase
            .from('wp_empresa_embudo')
            .select('id, nombre_etapa, descripcion, orden_etapa')
            .eq('empresa_id', resolvedEnterpriseId)
            .order('orden_etapa');

          if (stagesError) {
            logger.error('[Tool:updateContactStage] Stage fetch error', stagesError);
            return { success: false, error: `No pude consultar las etapas del embudo: ${stagesError.message}` };
          }

          const formatStage = (stage: FunnelStageRow) => formatFunnelStageForAgent(stage);
          const etapas = (stages || []).map((stage) => formatStage(stage as FunnelStageRow));
          const targetStage = etapas.find((stage) => stage.id === stageId);
          if (!targetStage) {
            return { success: false, error: `La etapa ${stageId} no existe en el embudo de esta empresa.` };
          }

          const previousStage = etapas.find((stage) => stage.id === contact.etapa_embudo) || null;
          const contactName = `${contact.nombre || ''} ${contact.apellido || ''}`.trim() || `Contacto ${contact.id}`;

          if (contact.etapa_embudo === stageId) {
            return {
              success: true,
              resumen: `${contactName} ya está en la etapa "${targetStage.nombre}". No hice cambios.`,
              contacto: {
                id: contact.id,
                nombre: contactName
              },
              etapaAnterior: previousStage ? { id: previousStage.id, nombre: previousStage.nombre, color: previousStage.color, queEs: previousStage.queEs } : null,
              etapaNueva: {
                id: targetStage.id,
                nombre: targetStage.nombre,
                color: targetStage.color,
                queEs: targetStage.queEs,
                notaImportante: targetStage.notaImportante,
                instruccionesAgente: targetStage.instruccionesAgente,
                criteriosAvance: targetStage.criteriosAvance
              },
              changed: false
            };
          }

          const timestamp = new Date().toISOString();

          const { error: updateError } = await supabase
            .from('wp_contactos')
            .update({
              etapa_embudo: stageId,
              updated_at: timestamp
            })
            .eq('id', contactId)
            .eq('empresa_id', resolvedEnterpriseId);

          if (updateError) {
            logger.error('[Tool:updateContactStage] Contact update error', updateError);
            return { success: false, error: `No pude actualizar la etapa del contacto: ${updateError.message}` };
          }

          const { error: historyError } = await supabase
            .from('wp_contacto_estado_embudo')
            .upsert({
              contacto_id: contactId,
              etapa_actual: stageId,
              etapa_anterior: contact.etapa_embudo,
              origen_cambio: 'ia',
              notas: notas || `Cambio de etapa desde chat por IA a ${targetStage.nombre}`,
              fecha_ultimo_cambio: timestamp
            }, { onConflict: 'contacto_id' });

          if (historyError) {
            logger.warn('[Tool:updateContactStage] History upsert warning', historyError);
          }

          return {
            success: true,
            resumen: previousStage
              ? `${contactName} pasó de "${previousStage.nombre}" a "${targetStage.nombre}".`
              : `${contactName} fue asignado a la etapa "${targetStage.nombre}".`,
            contacto: {
              id: contact.id,
              nombre: contactName
            },
            etapaAnterior: previousStage ? { id: previousStage.id, nombre: previousStage.nombre, color: previousStage.color, queEs: previousStage.queEs } : null,
            etapaNueva: {
              id: targetStage.id,
              nombre: targetStage.nombre,
              color: targetStage.color,
              queEs: targetStage.queEs,
              notaImportante: targetStage.notaImportante,
              instruccionesAgente: targetStage.instruccionesAgente,
              criteriosAvance: targetStage.criteriosAvance
            },
            changed: true,
            historialRegistrado: !historyError
          };
        } catch (err: any) {
          logger.error('[Tool:updateContactStage] Exception', err);
          return { success: false, error: `Error inesperado: ${err.message}` };
        }
      }
    },

    // ─────────────────────────────────────────────────────────────────
    // TOOL 15: createArtifact - Persistir artefactos desde Monica
    // ─────────────────────────────────────────────────────────────────
    createArtifact: {
      description: `📦 CREAR ARTEFACTO

Guarda contenido persistente en la biblioteca de artifacts del usuario.

USAR CUANDO:
- Generas código largo o estructurado
- Generas HTML/CSS interactivo
- Generas Mermaid/SVG
- Generas investigación o documento largo

RETORNA: artifactId, title, type y metadata para referenciar en la respuesta.`,
      inputSchema: z.object({
        content: z.string().min(1).max(50000)
          .describe('Contenido completo del artifact'),
        title: z.string().max(200).optional()
          .describe('Título opcional del artifact'),
        type: z.enum(['html', 'markdown', 'svg', 'mermaid', 'react', 'code', 'research']).optional()
          .describe('Tipo de artifact. Si no se envía, se detecta automáticamente.'),
        language: z.string().max(50).optional()
          .describe('Lenguaje de programación (si type=code). Ej: javascript, python, sql'),
        description: z.string().max(1000).optional()
          .describe('Descripción breve del artifact'),
        tags: z.array(z.string().max(40)).max(10).optional()
          .describe('Tags opcionales para clasificación')
      }),
      execute: async ({ content, title, type, language, description, tags }: {
        content: string;
        title?: string;
        type?: ArtifactType;
        language?: string;
        description?: string;
        tags?: string[];
      }) => {
        logger.info('[Tool:createArtifact] Executing', {
          contentLength: content.length,
          requestedType: type,
          hasTitle: !!title,
          sessionId
        });

        try {
          const detectedType = type || detectArtifactType(content);
          const safeType: ArtifactType = ARTIFACT_TYPES.includes(detectedType) ? detectedType : 'markdown';
          const safeTitle = (title && title.trim()) ? title.trim() : generateArtifactTitle(content, safeType);

          // Ensure session exists in DB before linking (avoids FK violation)
          let safeSessionId: string | null = sessionId || null;
          if (safeSessionId) {
            const { data: sessionExists } = await supabase
              .schema('adaptive_interface')
              .from('chat_sessions')
              .select('id')
              .eq('id', safeSessionId)
              .single();
            if (!sessionExists) {
              // Upsert the session so artifact stays linked to conversation
              const { error: upsertErr } = await supabase
                .schema('adaptive_interface')
                .from('chat_sessions')
                .upsert({
                  id: safeSessionId,
                  user_id: sessionUserId,
                  title: 'New Analysis',
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                }, { onConflict: 'id' });
              if (upsertErr) {
                logger.warn('[Tool:createArtifact] Failed to upsert session, setting to null', { sessionId: safeSessionId, error: upsertErr.message });
                safeSessionId = null;
              } else {
                logger.info('[Tool:createArtifact] Session upserted for artifact linking', { sessionId: safeSessionId });
              }
            }
          }

          const { data, error } = await supabase
            .from('artifacts')
            .insert({
              user_id: sessionUserId,
              session_id: safeSessionId,
              message_id: null,
              title: safeTitle,
              content,
              type: safeType,
              language: language?.trim() || null,
              description: description?.trim() || null,
              tags: tags?.length ? tags.slice(0, 10) : []
            })
            .select('id, title, type, created_at')
            .single();

          if (error || !data) {
            logger.error('[Tool:createArtifact] Insert error', error);
            return { success: false, error: `No pude crear el artifact: ${error?.message || 'error desconocido'}` };
          }

          logger.info('[Tool:createArtifact] Success', {
            artifactId: data.id,
            type: data.type,
            sessionId
          });

          return {
            success: true,
            resumen: `✅ Artifact creado: ${data.title} (${data.type})`,
            artifact: {
              id: data.id,
              title: data.title,
              type: data.type,
              createdAt: data.created_at,
              sessionId: sessionId || null
            },
            artifactId: data.id,
            artifactType: data.type,
            title: data.title
          };
        } catch (err: any) {
          logger.error('[Tool:createArtifact] Exception', err);
          return { success: false, error: `Error inesperado al crear artifact: ${err.message}` };
        }
      }
    },

    // ─────────────────────────────────────────────────────────────────
    // TOOL 16: updateArtifact - Editar artefactos existentes
    // ─────────────────────────────────────────────────────────────────
    updateArtifact: {
      description: `✏️ ACTUALIZAR ARTEFACTO EXISTENTE

Modifica el contenido de un artifact que ya fue creado en esta conversación.

USAR CUANDO el usuario pide:
- Agregar, quitar o cambiar algo de un artifact previo
- Corregir errores en un artifact existente
- Mejorar, traducir o extender un artifact
- Cualquier modificación sobre contenido que YA fue guardado como artifact

⚠️ IMPORTANTE: Envía el contenido COMPLETO actualizado (no solo el diff). El contenido reemplaza al anterior y se crea una nueva versión automáticamente.

REQUIERE: artifactId del artifact a actualizar (lo obtuviste del resultado de createArtifact previo).`,
      inputSchema: z.object({
        artifactId: z.string().uuid()
          .describe('ID del artifact a actualizar (UUID del createArtifact previo)'),
        content: z.string().min(1).max(50000)
          .describe('Contenido COMPLETO actualizado del artifact'),
        title: z.string().max(200).optional()
          .describe('Nuevo título (opcional, mantiene el anterior si no se envía)'),
        description: z.string().max(1000).optional()
          .describe('Descripción del cambio realizado'),
      }),
      execute: async ({ artifactId, content, title, description }: {
        artifactId: string;
        content: string;
        title?: string;
        description?: string;
      }) => {
        logger.info('[Tool:updateArtifact] Executing', {
          artifactId,
          contentLength: content.length,
          hasNewTitle: !!title,
          sessionId
        });

        try {
          // 1. Verify artifact exists and belongs to this user
          const { data: existing, error: fetchErr } = await supabase
            .from('artifacts')
            .select('id, title, type, content')
            .eq('id', artifactId)
            .eq('user_id', sessionUserId)
            .single();

          if (fetchErr || !existing) {
            logger.warn('[Tool:updateArtifact] Artifact not found or access denied', { artifactId });
            return { success: false, error: `Artifact no encontrado o sin acceso (id: ${artifactId})` };
          }

          // 2. Create a new version with the OLD content before overwriting
          const { error: versionErr } = await supabase
            .from('artifact_versions')
            .insert({
              artifact_id: artifactId,
              content: existing.content,
              title: existing.title,
              change_description: description?.trim() || 'Actualización desde chat',
              is_auto_save: false,
            });

          if (versionErr) {
            logger.warn('[Tool:updateArtifact] Failed to create version (non-blocking)', versionErr);
          }

          // 3. Update the artifact with new content
          const updatePayload: Record<string, any> = {
            content,
            updated_at: new Date().toISOString(),
          };
          if (title?.trim()) updatePayload.title = title.trim();

          const { data: updated, error: updateErr } = await supabase
            .from('artifacts')
            .update(updatePayload)
            .eq('id', artifactId)
            .eq('user_id', sessionUserId)
            .select('id, title, type, updated_at')
            .single();

          if (updateErr || !updated) {
            logger.error('[Tool:updateArtifact] Update error', updateErr);
            return { success: false, error: `No pude actualizar el artifact: ${updateErr?.message || 'error desconocido'}` };
          }

          logger.info('[Tool:updateArtifact] Success', {
            artifactId: updated.id,
            type: updated.type,
          });

          return {
            success: true,
            resumen: `✅ Artifact actualizado: ${updated.title} (${updated.type})`,
            artifact: {
              id: updated.id,
              title: updated.title,
              type: updated.type,
              updatedAt: updated.updated_at,
              sessionId: sessionId || null
            },
            artifactId: updated.id,
            artifactType: updated.type,
            title: updated.title
          };
        } catch (err: any) {
          logger.error('[Tool:updateArtifact] Exception', err);
          return { success: false, error: `Error inesperado al actualizar artifact: ${err.message}` };
        }
      }
    },

    // ─────────────────────────────────────────────────────────────────
    // TOOL 17: searchEmails - Buscar correos (SEGURO: grant_id desde DB)
    // ─────────────────────────────────────────────────────────────────
    ...(NYLAS_API_KEY ? {
      searchEmails: {
        description: `📧 BUSCAR EN CORREOS ELECTRÓNICOS

Busca correos en la bandeja del usuario autenticado. La búsqueda se realiza directamente en el servidor de correo (Gmail/Outlook).

USAR CUANDO:
- "¿Tengo correos de Juan?"
- "Busca facturas del mes pasado"
- "Correos con adjuntos de esta semana"
- "¿Qué me envió marketing@empresa.com?"

FILTROS DISPONIBLES:
- query: Búsqueda general en asunto y cuerpo
- from: Filtrar por remitente
- subject: Buscar en asunto
- hasAttachment: Solo con adjuntos
- receivedAfter/receivedBefore: Rango de fechas (formato YYYY-MM-DD)

⚠️ SEGURIDAD: Solo accede a la bandeja del usuario actual. No se puede leer correo de otros.

RETORNA: Lista de correos con remitente, asunto, fecha y preview.`,
        inputSchema: z.object({
          query: z.string().optional()
            .describe('Búsqueda general (asunto + cuerpo). Ej: "factura", "reunión"'),
          from: z.string().optional()
            .describe('Filtrar por email del remitente'),
          subject: z.string().optional()
            .describe('Buscar en el asunto del correo'),
          hasAttachment: z.boolean().optional()
            .describe('true = solo correos con adjuntos'),
          receivedAfter: z.string().optional()
            .describe('Fecha inicio YYYY-MM-DD (ej: 2026-01-01)'),
          receivedBefore: z.string().optional()
            .describe('Fecha fin YYYY-MM-DD (ej: 2026-01-31)'),
          limit: z.number().int().min(1).max(50).optional().default(20)
            .describe('Máximo de resultados (default: 20, max: 50)')
        }),
        execute: async ({ query, from, subject, hasAttachment, receivedAfter, receivedBefore, limit = 20 }: {
          query?: string;
          from?: string;
          subject?: string;
          hasAttachment?: boolean;
          receivedAfter?: string;
          receivedBefore?: string;
          limit?: number;
        }) => {
          const startTime = Date.now();
          logger.info('[Tool:searchEmails] Executing', { query, from, subject, enterpriseId: resolvedEnterpriseId });

          try {
            // ═══════════════════════════════════════════════════════
            // SEGURIDAD: Obtener grant_id desde la DB, NO del cliente
            // ═══════════════════════════════════════════════════════
            const { data: memberData, error: memberError } = await supabase
              .from('wp_team_humano')
              .select('grant_id')
              .eq('id', teamMember.id)
              .single();

            if (memberError || !memberData?.grant_id) {
              logger.warn('[Tool:searchEmails] No grant_id for user', { memberId: teamMember.id });
              return {
                success: false,
                error: 'No tienes un correo conectado. Ve a Configuración > Integraciones para conectar tu cuenta de correo.'
              };
            }

            const secureGrantId = memberData.grant_id;

            // Construir URL de búsqueda Nylas V3
            const nylasUrl = new URL(`${NYLAS_API_URI}/v3/grants/${secureGrantId}/messages`);
            nylasUrl.searchParams.set('limit', String(Math.min(limit, 50)));

            // Construir search_query_native para búsquedas complejas
            const queryParts: string[] = [];
            if (query) queryParts.push(query);
            if (from) queryParts.push(`from:${from}`);
            if (subject) queryParts.push(`subject:(${subject})`);
            if (hasAttachment) queryParts.push('has:attachment');

            if (receivedAfter) {
              const ts = Math.floor(new Date(receivedAfter).getTime() / 1000);
              if (!isNaN(ts) && ts > 0) nylasUrl.searchParams.set('received_after', String(ts));
            }
            if (receivedBefore) {
              const ts = Math.floor(new Date(receivedBefore + 'T23:59:59').getTime() / 1000);
              if (!isNaN(ts) && ts > 0) nylasUrl.searchParams.set('received_before', String(ts));
            }

            if (queryParts.length > 0) {
              nylasUrl.searchParams.set('search_query_native', queryParts.join(' '));
            }

            logger.info('[Tool:searchEmails] Fetching from Nylas', { url: nylasUrl.toString().replace(secureGrantId, '***') });

            const response = await fetch(nylasUrl.toString(), {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${NYLAS_API_KEY}`,
                'Content-Type': 'application/json',
              },
            });

            if (!response.ok) {
              const errorText = await response.text();
              logger.error('[Tool:searchEmails] Nylas error', { status: response.status, error: errorText });

              if (response.status === 404) {
                return { success: false, error: 'Tu conexión de correo ha expirado. Reconecta tu cuenta en Configuración.' };
              }
              return { success: false, error: `Error al buscar correos (${response.status})` };
            }

            const data = await response.json();
            const emails = (data.data || []).slice(0, limit);

            const results = emails.map((e: any, i: number) => {
              const fromName = e.from?.[0]?.name || e.from?.[0]?.email || 'Desconocido';
              const fromEmail = e.from?.[0]?.email || '';
              const date = e.date ? new Date(e.date * 1000).toLocaleString('es-ES', {
                day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
              }) : 'Sin fecha';
              const hasAtt = Array.isArray(e.attachments) && e.attachments.length > 0;

              return {
                posicion: i + 1,
                id: e.id,
                de: fromName,
                deEmail: fromEmail,
                asunto: e.subject || '(Sin asunto)',
                fecha: date,
                preview: (e.snippet || '').substring(0, 150),
                leido: !e.unread,
                adjuntos: hasAtt ? e.attachments.length : 0
              };
            });

            const durationMs = Date.now() - startTime;
            logger.info('[Tool:searchEmails] Success', { found: results.length, durationMs });

            const filtrosTexto = [];
            if (query) filtrosTexto.push(`"${query}"`);
            if (from) filtrosTexto.push(`de: ${from}`);
            if (subject) filtrosTexto.push(`asunto: ${subject}`);
            if (hasAttachment) filtrosTexto.push('con adjuntos');
            if (receivedAfter) filtrosTexto.push(`desde: ${receivedAfter}`);
            if (receivedBefore) filtrosTexto.push(`hasta: ${receivedBefore}`);

            const resumen = results.length === 0
              ? `No encontré correos${filtrosTexto.length > 0 ? ` con ${filtrosTexto.join(', ')}` : ''}. Intenta con otros términos.`
              : `📧 ${results.length} correo(s) encontrado(s)${filtrosTexto.length > 0 ? ` (${filtrosTexto.join(', ')})` : ''}:\n${results.map((r: any) =>
                  `${r.posicion}. **${r.asunto}** - De: ${r.de} (${r.fecha})${r.adjuntos > 0 ? ' 📎' : ''}${!r.leido ? ' 🔵' : ''}`
                ).join('\n')}`;

            return {
              success: true,
              resumen,
              correos: results,
              total: results.length,
              _instruccion: results.length > 0
                ? `Para ver el contenido completo de un correo, usa getEmailDetail con el ID. Ej: getEmailDetail({emailId: "${results[0].id}"})`
                : null
            };
          } catch (err: any) {
            logger.error('[Tool:searchEmails] Exception', err);
            return { success: false, error: `Error inesperado: ${err.message}` };
          }
        }
      },

      // ─────────────────────────────────────────────────────────────────
      // TOOL 17: getEmailDetail - Detalle completo de un correo (SEGURO)
      // ─────────────────────────────────────────────────────────────────
      getEmailDetail: {
        description: `📩 VER CONTENIDO COMPLETO DE UN CORREO

Obtiene el cuerpo completo y metadata de un correo específico.

USAR CUANDO:
- "Muéstrame ese correo" (después de buscar)
- "¿Qué dice el correo de la factura?"
- "Lee el primer correo"

⚠️ REQUISITO: Necesitas el emailId de searchEmails.

FLUJO CORRECTO:
1. searchEmails({query: "factura"}) → Retorna [{id: "abc123"...}]
2. getEmailDetail({emailId: "abc123"})

⚠️ SEGURIDAD: Solo accede a correos de tu propia cuenta.

RETORNA: Asunto, remitente, fecha, cuerpo en texto plano, y lista de adjuntos.`,
        inputSchema: z.object({
          emailId: z.string().min(1)
            .describe('ID del correo (obtenido de searchEmails)')
        }),
        execute: async ({ emailId }: { emailId: string }) => {
          const startTime = Date.now();
          logger.info('[Tool:getEmailDetail] Executing', { emailId });

          try {
            // ═══════════════════════════════════════════════════════
            // SEGURIDAD: Obtener grant_id desde la DB, NO del cliente
            // ═══════════════════════════════════════════════════════
            const { data: memberData, error: memberError } = await supabase
              .from('wp_team_humano')
              .select('grant_id')
              .eq('id', teamMember.id)
              .single();

            if (memberError || !memberData?.grant_id) {
              return {
                success: false,
                error: 'No tienes un correo conectado. Ve a Configuración > Integraciones.'
              };
            }

            const secureGrantId = memberData.grant_id;

            // Fetch email completo desde Nylas
            const nylasUrl = `${NYLAS_API_URI}/v3/grants/${secureGrantId}/messages/${encodeURIComponent(emailId)}`;

            const response = await fetch(nylasUrl, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${NYLAS_API_KEY}`,
                'Content-Type': 'application/json',
              },
            });

            if (!response.ok) {
              const errorText = await response.text();
              logger.error('[Tool:getEmailDetail] Nylas error', { status: response.status, error: errorText });

              if (response.status === 404) {
                return { success: false, error: 'Correo no encontrado. Puede haber sido eliminado o el ID es incorrecto.' };
              }
              return { success: false, error: `Error al obtener correo (${response.status})` };
            }

            const data = await response.json();
            const message = data.data;

            // Extraer cuerpo - convertir HTML a texto plano
            const htmlBody = message.body || '';
            const bodyText = htmlBody
              .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
              .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
              .replace(/<br\s*\/?>/gi, '\n')
              .replace(/<\/p>/gi, '\n\n')
              .replace(/<\/div>/gi, '\n')
              .replace(/<[^>]+>/g, '')
              .replace(/&nbsp;/g, ' ')
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&quot;/g, '"')
              .replace(/&#39;/g, "'")
              .replace(/\n{3,}/g, '\n\n')
              .trim();

            // Limitar longitud del body para no saturar el contexto
            const MAX_BODY_LENGTH = 8000;
            const truncatedBody = bodyText.length > MAX_BODY_LENGTH
              ? bodyText.substring(0, MAX_BODY_LENGTH) + '\n\n... [contenido truncado]'
              : bodyText;

            const fromName = message.from?.[0]?.name || message.from?.[0]?.email || 'Desconocido';
            const fromEmail = message.from?.[0]?.email || '';
            const toList = (message.to || []).map((t: any) => t.email || t.name).join(', ');
            const date = message.date
              ? new Date(message.date * 1000).toLocaleString('es-ES', {
                  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                  hour: '2-digit', minute: '2-digit'
                })
              : 'Sin fecha';

            const attachments = (message.attachments || []).map((a: any) => ({
              nombre: a.filename || 'Sin nombre',
              tipo: a.content_type || 'unknown',
              tamaño: a.size ? `${Math.round(a.size / 1024)}KB` : 'Desconocido'
            }));

            const durationMs = Date.now() - startTime;
            logger.info('[Tool:getEmailDetail] Success', { emailId, bodyLength: truncatedBody.length, durationMs });

            const resumen = `📩 **${message.subject || '(Sin asunto)'}**
- **De**: ${fromName} (${fromEmail})
- **Para**: ${toList}
- **Fecha**: ${date}
${attachments.length > 0 ? `- **Adjuntos**: ${attachments.map((a: any) => `${a.nombre} (${a.tamaño})`).join(', ')}` : ''}

**Contenido:**
${truncatedBody.substring(0, 3000)}${truncatedBody.length > 3000 ? '...' : ''}`;

            return {
              success: true,
              resumen,
              correo: {
                id: emailId,
                asunto: message.subject || '(Sin asunto)',
                de: fromName,
                deEmail: fromEmail,
                para: toList,
                fecha: date,
                cuerpo: truncatedBody,
                adjuntos: attachments,
                leido: !message.unread
              }
            };
          } catch (err: any) {
            logger.error('[Tool:getEmailDetail] Exception', err);
            return { success: false, error: `Error inesperado: ${err.message}` };
          }
        }
      },

      listConnectedCalendars: {
        description: `📆 LISTAR CALENDARIOS CONECTADOS

Obtiene los calendarios disponibles del usuario autenticado en Nylas.

USAR CUANDO:
- "¿Qué calendarios tengo conectados?"
- "Lista mis calendarios"

RETORNA: id, nombre, is_primary, read_only, timezone.`,
        inputSchema: z.object({
          limit: z.number().int().min(1).max(50).optional().default(20)
            .describe('Máximo de calendarios a retornar (default 20, max 50)')
        }),
        execute: async ({ limit = 20 }: { limit?: number }) => {
          try {
            const { data: memberData, error: memberError } = await supabase
              .from('wp_team_humano')
              .select('grant_id')
              .eq('id', teamMember.id)
              .single();

            if (memberError || !memberData?.grant_id) {
              return {
                success: false,
                error: 'No tienes un calendario conectado. Ve a Configuración > Integraciones para conectar tu cuenta.'
              };
            }

            const nylasUrl = new URL(`${NYLAS_API_URI}/v3/grants/${memberData.grant_id}/calendars`);
            nylasUrl.searchParams.set('limit', String(Math.min(limit, 50)));

            const response = await fetch(nylasUrl.toString(), {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${NYLAS_API_KEY}`,
                'Accept': 'application/json',
              },
            });

            if (!response.ok) {
              const errorText = await response.text();
              return { success: false, error: `Error al listar calendarios (${response.status}): ${errorText}` };
            }

            const data = await response.json();
            const calendars = (data.data || []).map((c: any) => ({
              id: c.id,
              nombre: c.name || 'Sin nombre',
              primary: !!c.is_primary,
              readOnly: !!c.read_only,
              timezone: c.timezone || null,
            }));

            return {
              success: true,
              resumen: calendars.length === 0
                ? 'No se encontraron calendarios conectados.'
                : `Encontré ${calendars.length} calendario(s):\n${calendars.map((c: any, i: number) => `${i + 1}. ${c.nombre} (ID: ${c.id})${c.primary ? ' [principal]' : ''}${c.readOnly ? ' [solo lectura]' : ''}`).join('\n')}`,
              calendarios: calendars,
              total: calendars.length,
            };
          } catch (err: any) {
            return { success: false, error: `Error inesperado: ${err.message}` };
          }
        }
      },

      listCalendarEvents: {
        description: `📅 LISTAR EVENTOS DEL CALENDARIO

Lista eventos de calendario de la persona autenticada con filtros por rango de fecha.

USAR CUANDO:
- "¿Qué tengo esta semana?"
- "Muestra eventos de mañana"
- "Lista eventos del calendario principal"`,
        inputSchema: z.object({
          calendarId: z.string().optional().describe('ID de calendario (default: primary)'),
          start: z.string().optional().describe('Fecha inicio ISO o YYYY-MM-DD'),
          end: z.string().optional().describe('Fecha fin ISO o YYYY-MM-DD'),
          limit: z.number().int().min(1).max(100).optional().default(20)
        }),
        execute: async ({ calendarId = 'primary', start, end, limit = 20 }: {
          calendarId?: string;
          start?: string;
          end?: string;
          limit?: number;
        }) => {
          try {
            const { data: memberData, error: memberError } = await supabase
              .from('wp_team_humano')
              .select('grant_id')
              .eq('id', teamMember.id)
              .single();

            if (memberError || !memberData?.grant_id) {
              return { success: false, error: 'No tienes un calendario conectado. Ve a Configuración > Integraciones.' };
            }

            const nylasUrl = new URL(`${NYLAS_API_URI}/v3/grants/${memberData.grant_id}/events`);
            nylasUrl.searchParams.set('calendar_id', calendarId);
            nylasUrl.searchParams.set('limit', String(Math.min(limit, 100)));
            if (start) nylasUrl.searchParams.set('start', String(Math.floor(new Date(start).getTime() / 1000)));
            if (end) nylasUrl.searchParams.set('end', String(Math.floor(new Date(end).getTime() / 1000)));

            const response = await fetch(nylasUrl.toString(), {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${NYLAS_API_KEY}`,
                'Accept': 'application/json',
              },
            });

            if (!response.ok) {
              const errorText = await response.text();
              return { success: false, error: `Error al listar eventos (${response.status}): ${errorText}` };
            }

            const data = await response.json();
            const events = (data.data || []).map((e: any) => ({
              id: e.id,
              titulo: e.title || '(Sin título)',
              estado: e.status || 'unknown',
              inicio: e.when?.start_time || null,
              fin: e.when?.end_time || null,
              calendarId: e.calendar_id || calendarId,
            }));

            return {
              success: true,
              resumen: events.length === 0
                ? 'No encontré eventos para ese rango/filtro.'
                : `Encontré ${events.length} evento(s):\n${events.map((e: any, i: number) => `${i + 1}. ${e.titulo} (ID: ${e.id})`).join('\n')}`,
              eventos: events,
              total: events.length,
              _instruccion: events.length > 0
                ? `Para ver detalle de un evento usa getCalendarEventDetail con eventId. Ej: getCalendarEventDetail({eventId: "${events[0].id}"})`
                : null
            };
          } catch (err: any) {
            return { success: false, error: `Error inesperado: ${err.message}` };
          }
        }
      },

      getCalendarEventDetail: {
        description: `🔎 DETALLE DE EVENTO DE CALENDARIO

Obtiene detalles completos de un evento específico por eventId.`,
        inputSchema: z.object({
          eventId: z.string().min(1).describe('ID del evento en Nylas'),
          calendarId: z.string().optional().describe('ID de calendario (default: primary)')
        }),
        execute: async ({ eventId, calendarId = 'primary' }: { eventId: string; calendarId?: string }) => {
          try {
            const { data: memberData, error: memberError } = await supabase
              .from('wp_team_humano')
              .select('grant_id')
              .eq('id', teamMember.id)
              .single();

            if (memberError || !memberData?.grant_id) {
              return { success: false, error: 'No tienes un calendario conectado. Ve a Configuración > Integraciones.' };
            }

            const nylasUrl = `${NYLAS_API_URI}/v3/grants/${memberData.grant_id}/events/${encodeURIComponent(eventId)}?calendar_id=${encodeURIComponent(calendarId)}`;
            const response = await fetch(nylasUrl, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${NYLAS_API_KEY}`,
                'Accept': 'application/json',
              },
            });

            if (!response.ok) {
              const errorText = await response.text();
              return { success: false, error: `Error al obtener detalle (${response.status}): ${errorText}` };
            }

            const data = await response.json();
            const event = data.data || data;

            return {
              success: true,
              resumen: `Evento: ${event.title || '(Sin título)'} | Estado: ${event.status || 'unknown'} | ID: ${event.id}`,
              evento: event,
            };
          } catch (err: any) {
            return { success: false, error: `Error inesperado: ${err.message}` };
          }
        }
      },

      createCalendarEvent: {
        description: `➕ CREAR EVENTO EN CALENDARIO

Crea un evento directo en Nylas para la persona autenticada.`,
        inputSchema: z.object({
          title: z.string().min(1).max(200),
          startTime: z.string().describe('Fecha/hora inicio en ISO (ej: 2026-03-06T10:00:00-05:00)'),
          endTime: z.string().describe('Fecha/hora fin en ISO (ej: 2026-03-06T10:30:00-05:00)'),
          timezone: z.string().optional(),
          calendarId: z.string().optional().default('primary'),
          description: z.string().optional(),
          location: z.string().optional(),
          participants: z.array(z.object({
            email: z.string().email(),
            name: z.string().optional(),
          })).optional(),
          withMeet: z.boolean().optional().default(false)
        }),
        execute: async ({ title, startTime, endTime, timezone, calendarId = 'primary', description, location, participants, withMeet = false }: {
          title: string;
          startTime: string;
          endTime: string;
          timezone?: string;
          calendarId?: string;
          description?: string;
          location?: string;
          participants?: Array<{ email: string; name?: string }>;
          withMeet?: boolean;
        }) => {
          try {
            const { data: memberData, error: memberError } = await supabase
              .from('wp_team_humano')
              .select('grant_id')
              .eq('id', teamMember.id)
              .single();

            if (memberError || !memberData?.grant_id) {
              return { success: false, error: 'No tienes un calendario conectado. Ve a Configuración > Integraciones.' };
            }

            const startTs = Math.floor(new Date(startTime).getTime() / 1000);
            const endTs = Math.floor(new Date(endTime).getTime() / 1000);

            const requestBody: any = {
              title,
              when: {
                start_time: startTs,
                end_time: endTs,
              },
              busy: true,
            };

            if (timezone) {
              requestBody.when.start_timezone = timezone;
              requestBody.when.end_timezone = timezone;
            }
            if (description) requestBody.description = description;
            if (location) requestBody.location = location;
            if (participants?.length) requestBody.participants = participants;
            if (withMeet) {
              requestBody.conferencing = {
                provider: 'Google Meet',
                autocreate: {}
              };
            }

            const nylasUrl = `${NYLAS_API_URI}/v3/grants/${memberData.grant_id}/events?calendar_id=${encodeURIComponent(calendarId)}`;
            const response = await fetch(nylasUrl, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${NYLAS_API_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
              const errorText = await response.text();
              return { success: false, error: `Error al crear evento (${response.status}): ${errorText}` };
            }

            const data = await response.json();
            const event = data.data || data;

            return {
              success: true,
              resumen: `Evento creado: ${event.title || title} (ID: ${event.id})`,
              evento: event,
            };
          } catch (err: any) {
            return { success: false, error: `Error inesperado: ${err.message}` };
          }
        }
      },

      updateCalendarEvent: {
        description: `✏️ ACTUALIZAR EVENTO DE CALENDARIO

Actualiza un evento existente por eventId.`,
        inputSchema: z.object({
          eventId: z.string().min(1),
          calendarId: z.string().optional().default('primary'),
          title: z.string().optional(),
          description: z.string().optional(),
          location: z.string().optional(),
          startTime: z.string().optional(),
          endTime: z.string().optional(),
          timezone: z.string().optional(),
          participants: z.array(z.object({ email: z.string().email(), name: z.string().optional() })).optional()
        }),
        execute: async ({ eventId, calendarId = 'primary', title, description, location, startTime, endTime, timezone, participants }: {
          eventId: string;
          calendarId?: string;
          title?: string;
          description?: string;
          location?: string;
          startTime?: string;
          endTime?: string;
          timezone?: string;
          participants?: Array<{ email: string; name?: string }>;
        }) => {
          try {
            const { data: memberData, error: memberError } = await supabase
              .from('wp_team_humano')
              .select('grant_id')
              .eq('id', teamMember.id)
              .single();

            if (memberError || !memberData?.grant_id) {
              return { success: false, error: 'No tienes un calendario conectado. Ve a Configuración > Integraciones.' };
            }

            const requestBody: any = {};
            if (title) requestBody.title = title;
            if (description !== undefined) requestBody.description = description;
            if (location !== undefined) requestBody.location = location;
            if (participants) requestBody.participants = participants;
            if (startTime || endTime) {
              requestBody.when = {};
              if (startTime) requestBody.when.start_time = Math.floor(new Date(startTime).getTime() / 1000);
              if (endTime) requestBody.when.end_time = Math.floor(new Date(endTime).getTime() / 1000);
              if (timezone) {
                if (startTime) requestBody.when.start_timezone = timezone;
                if (endTime) requestBody.when.end_timezone = timezone;
              }
            }

            const nylasUrl = `${NYLAS_API_URI}/v3/grants/${memberData.grant_id}/events/${encodeURIComponent(eventId)}?calendar_id=${encodeURIComponent(calendarId)}`;
            const response = await fetch(nylasUrl, {
              method: 'PUT',
              headers: {
                'Authorization': `Bearer ${NYLAS_API_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
              const errorText = await response.text();
              return { success: false, error: `Error al actualizar evento (${response.status}): ${errorText}` };
            }

            const data = await response.json();
            const event = data.data || data;
            return {
              success: true,
              resumen: `Evento actualizado: ${event.title || '(Sin título)'} (ID: ${event.id || eventId})`,
              evento: event,
            };
          } catch (err: any) {
            return { success: false, error: `Error inesperado: ${err.message}` };
          }
        }
      },

      deleteCalendarEvent: {
        description: `🗑️ ELIMINAR EVENTO DE CALENDARIO

Elimina un evento de calendario por eventId en la cuenta conectada del usuario.`,
        inputSchema: z.object({
          eventId: z.string().min(1),
          calendarId: z.string().optional().default('primary')
        }),
        execute: async ({ eventId, calendarId = 'primary' }: { eventId: string; calendarId?: string }) => {
          try {
            const { data: memberData, error: memberError } = await supabase
              .from('wp_team_humano')
              .select('grant_id')
              .eq('id', teamMember.id)
              .single();

            if (memberError || !memberData?.grant_id) {
              return { success: false, error: 'No tienes un calendario conectado. Ve a Configuración > Integraciones.' };
            }

            const nylasUrl = `${NYLAS_API_URI}/v3/grants/${memberData.grant_id}/events/${encodeURIComponent(eventId)}?calendar_id=${encodeURIComponent(calendarId)}`;
            const response = await fetch(nylasUrl, {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${NYLAS_API_KEY}`,
                'Accept': 'application/json',
              },
            });

            if (!response.ok && response.status !== 404) {
              const errorText = await response.text();
              return { success: false, error: `Error al eliminar evento (${response.status}): ${errorText}` };
            }

            return {
              success: true,
              resumen: response.status === 404
                ? `El evento ${eventId} no existía (o ya fue eliminado).`
                : `Evento eliminado correctamente (ID: ${eventId}).`,
              eventId,
            };
          } catch (err: any) {
            return { success: false, error: `Error inesperado: ${err.message}` };
          }
        }
      }
    } : {}),

    // ─────────────────────────────────────────────────────────────────
    // TOOL: searchDocumentation - Buscar en la documentación del sistema
    // ─────────────────────────────────────────────────────────────────
    searchDocumentation: {
      description: `Busca información en la documentación técnica de la plataforma Monica CRM / Urpe AI Lab.

USAR CUANDO: El usuario pregunta cómo funciona algo del sistema, qué módulos existen, cómo se configura algo, arquitectura, integraciones, o cualquier pregunta sobre la plataforma.

EJEMPLOS:
- "¿Cómo funciona el embudo de ventas?" → searchDocumentation({query: "embudo funnel ventas"})
- "¿Qué integraciones tiene Monica?" → searchDocumentation({query: "integraciones"})
- "¿Cómo se configura Nylas?" → searchDocumentation({query: "nylas calendario configuración"})
- "Explícame la arquitectura" → searchDocumentation({query: "arquitectura"})

NO USAR: Para buscar contactos, citas, métricas o datos del CRM. Para eso usa las otras herramientas.

RETORNA: Documentos relevantes con extractos. Si el usuario necesita más detalle, puedes hacer una segunda búsqueda más específica o pedir el documento completo con action: "read".`,
      inputSchema: z.object({
        query: z.string().min(2).describe('Términos de búsqueda: "calendario nylas", "arquitectura supabase", "funnel ventas", etc.'),
        action: z.enum(['search', 'read']).optional().default('search')
          .describe('search = buscar documentos relevantes, read = leer un documento completo por su path'),
        docPath: z.string().optional()
          .describe('Solo para action=read. Path del documento, ej: "modules/chat/main-chat-context.md"'),
        section: z.string().optional()
          .describe('Filtrar por sección: api, architecture, core, modules, integrations, technical, mobile, getting-started'),
      }),
      execute: async ({ query, action, docPath, section }: { query: string; action?: string; docPath?: string; section?: string }) => {
        logger.info('[Tool:searchDocumentation] Executing', { query, action, docPath, section });

        const docs = docsIndex as Array<{ path: string; section: string; title: string; headers: string[]; content: string; size: number }>;

        // READ mode: return full document
        if (action === 'read' && docPath) {
          const doc = docs.find(d => d.path === docPath);
          if (!doc) {
            return { success: false, error: `Documento no encontrado: ${docPath}. Usa action=search para encontrar documentos disponibles.` };
          }
          // Trim content to avoid flooding context (max ~8000 chars)
          const trimmed = doc.content.length > 8000
            ? doc.content.slice(0, 8000) + '\n\n... [documento truncado, pide secciones específicas si necesitas más]'
            : doc.content;
          return {
            success: true,
            resumen: `Documento: ${doc.title} (${doc.section}/${doc.path})`,
            contenido: trimmed,
          };
        }

        // SEARCH mode
        const terms = query.toLowerCase().split(/\s+/).filter(t => t.length >= 2);
        if (terms.length === 0) {
          return { success: false, error: 'Proporciona al menos un término de búsqueda con 2+ caracteres.' };
        }

        let filteredDocs = docs;
        if (section) {
          filteredDocs = docs.filter(d => d.section === section);
        }

        const scored = filteredDocs.map(doc => {
          const lower = doc.content.toLowerCase();
          const titleLower = (doc.title || '').toLowerCase();
          const pathLower = doc.path.toLowerCase();
          let score = 0;
          const snippets: string[] = [];

          for (const term of terms) {
            // Frequency in content
            const freq = (lower.split(term).length - 1);
            if (freq > 0) score += Math.min(freq, 10);
            // Boost title matches
            if (titleLower.includes(term)) score += 8;
            // Boost path matches
            if (pathLower.includes(term)) score += 5;
            // Boost header matches
            for (const h of doc.headers) {
              if (h.toLowerCase().includes(term)) score += 4;
            }
          }

          // Collect matching line snippets (max 3)
          if (score > 0) {
            const lines = doc.content.split('\n');
            for (const line of lines) {
              if (snippets.length >= 3) break;
              const lineLower = line.toLowerCase();
              if (terms.some(t => lineLower.includes(t)) && line.trim().length > 10) {
                snippets.push(line.trim().slice(0, 150));
              }
            }
          }

          return { path: doc.path, title: doc.title, section: doc.section, score, snippets };
        })
        .filter(r => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);

        if (scored.length === 0) {
          // List available sections as fallback
          const sections = [...new Set(docs.map(d => d.section))].sort();
          return {
            success: true,
            resumen: `No encontré documentos para "${query}". Secciones disponibles: ${sections.join(', ')}. Intenta con otros términos o filtra por sección.`,
            resultados: [],
          };
        }

        return {
          success: true,
          resumen: `Encontré ${scored.length} documentos relevantes para "${query}". Los más relevantes están primero.`,
          resultados: scored.map(r => ({
            path: r.path,
            titulo: r.title,
            seccion: r.section,
            relevancia: r.score,
            extractos: r.snippets,
          })),
          _instruccion: 'Si el usuario necesita más detalle de un documento específico, usa searchDocumentation con action="read" y docPath del documento.',
        };
      }
    },

    // ── CREATE TEMPLATE DRAFT ──────────────────────────────────────
    createTemplateDraft: {
      description: `Crea un borrador de plantilla WhatsApp directamente desde el chat.

USAR CUANDO: "Crea una plantilla de bienvenida", "Hazme un template de cobranza", "Redacta una plantilla para recordatorio de pago", "Necesito un mensaje de seguimiento como plantilla".

TAMBIÉN USAR CUANDO el usuario solo comparte un brief, intención o contexto y espera que Monica redacte el mensaje final. Ejemplos:
- "Un día antes de la fecha de pago quiero un recordatorio preventivo"
- "Necesito una plantilla más elegante para seguimiento"
- "Mejora esta idea y conviértela en plantilla"

⚠️ IMPORTANTE:
- Usa el contexto de la conversación para redactar el contenido más relevante.
- Si el usuario no entrega el texto final, redacta tú el body_text completo antes de llamar a la tool.
- Si el usuario sí entrega un borrador, mejóralo antes de guardarlo cuando notes repeticiones, rigidez o baja claridad.
- El nombre de la plantilla DEBE ser minúsculas con guiones bajos (ej: bienvenida_nuevo_cliente).
- El body admite variables dinámicas: {{1}} para nombre, {{2}} para monto, etc.
- Máximo 1024 caracteres en el body.
- La plantilla se guarda como BORRADOR para que el usuario la revise antes de enviar a Meta.
- Para recordatorios de pago o cobranza preventiva, normalmente la categoría correcta es utility y la clasificación puede ser cobranza_preventiva.
- Redacta pensando en aprobación de Meta: lenguaje claro, respetuoso, útil y sin presión indebida.

EJEMPLO:
Usuario: "Crea una plantilla de recordatorio de pago"
→ createTemplateDraft({
    template_name: "recordatorio_pago",
    meta_category: "utility",
    body_text: "Hola {{1}}, te recordamos que tienes un pago pendiente de {{2}} con vencimiento el {{3}}. ¿Podemos ayudarte?",
    clasificacion_interna: "cobranza"
  })

RETORNA: Borrador creado con etiqueta de navegación.`,

      inputSchema: z.object({
        template_name: z.string()
          .min(3)
          .max(100)
          .describe('Nombre de la plantilla en minúsculas con guiones bajos. Ej: recordatorio_pago, bienvenida_cliente, recordatorio_pago_preventivo'),
        language_code: z.enum(['es', 'en', 'pt_BR', 'es_AR', 'es_MX']).optional().default('es')
          .describe('Idioma de la plantilla. Default: es (Español)'),
        meta_category: z.enum(['utility', 'marketing', 'authentication']).optional().default('utility')
          .describe('Categoría Meta: utility (transaccional), marketing (promocional), authentication (verificación). Para recordatorios operativos o de pago suele corresponder utility.'),
        clasificacion_interna: z.string().optional()
          .describe('Clasificación interna libre. Ej: cobranza, cobranza_preventiva, bienvenida, seguimiento, recordatorio'),
        body_text: z.string()
          .min(10)
          .max(1024)
          .describe('Texto FINAL del body de la plantilla. Si el usuario solo dio un brief, Monica debe redactar aquí la versión final mejorada. Usa {{1}}, {{2}} para variables dinámicas.'),
        header_text: z.string().max(60).optional()
          .describe('Texto del encabezado (máx 60 chars). Opcional. Úsalo solo si realmente aporta claridad.'),
        footer_text: z.string().max(60).optional()
          .describe('Texto del pie de mensaje (máx 60 chars). Opcional. Útil para firma corta o canal de ayuda.'),
        buttons: z.array(z.object({
          type: z.enum(['QUICK_REPLY', 'URL', 'PHONE_NUMBER']),
          text: z.string().max(25),
          url: z.string().optional(),
          phone_number: z.string().optional()
        })).max(3).optional()
          .describe('Botones opcionales (máx 3). QUICK_REPLY solo necesita text, URL necesita url, PHONE_NUMBER necesita phone_number. Añádelos solo si mejoran la conversión o la asistencia.')
      }),

      execute: async ({
        template_name,
        language_code,
        meta_category,
        clasificacion_interna,
        body_text,
        header_text,
        footer_text,
        buttons
      }: {
        template_name: string;
        language_code?: string;
        meta_category?: string;
        clasificacion_interna?: string;
        body_text: string;
        header_text?: string;
        footer_text?: string;
        buttons?: Array<{ type: string; text: string; url?: string; phone_number?: string }>;
      }) => {
        logger.info('[Tool:createTemplateDraft] Executing', {
          template_name,
          language_code,
          meta_category,
          bodyLength: body_text.length,
          enterpriseId: resolvedEnterpriseId
        });

        // SECURITY: Only roles 1 and 2 can create template drafts
        if (isRole3User) {
          return { success: false, error: 'No tienes permisos para crear plantillas de WhatsApp. Contacta a tu supervisor.' };
        }

        try {
          // Normalize template name
          const normalizedName = template_name
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, '_')
            .replace(/[^a-z0-9_]/g, '')
            .replace(/^_+|_+$/g, '')
            .replace(/_+/g, '_');

          if (!/^[a-z][a-z0-9_]*$/.test(normalizedName)) {
            return {
              success: false,
              error: `El nombre "${normalizedName}" no es válido. Debe empezar con letra, solo minúsculas, números y guiones bajos.`
            };
          }

          // Get an active WhatsApp number for this enterprise
          const { data: numero, error: numError } = await supabase
            .from('wp_numeros')
            .select('id, id_kapso, telefono, nombre')
            .eq('empresa_id', resolvedEnterpriseId)
            .eq('activo', true)
            .not('id_kapso', 'is', null)
            .limit(1)
            .maybeSingle();

          if (numError || !numero) {
            return {
              success: false,
              error: 'No hay números de WhatsApp activos configurados para esta empresa. El administrador debe configurar un número en Ajustes > WhatsApp primero.'
            };
          }

          // Build components array (Meta format)
          const components: Array<{ type: string; format?: string; text?: string; buttons?: Array<{ type: string; text: string; url?: string; phone_number?: string }> }> = [];

          if (header_text?.trim()) {
            components.push({
              type: 'HEADER',
              format: 'TEXT',
              text: header_text.trim()
            });
          }

          components.push({
            type: 'BODY',
            text: body_text.trim()
          });

          if (footer_text?.trim()) {
            components.push({
              type: 'FOOTER',
              text: footer_text.trim()
            });
          }

          if (buttons && buttons.length > 0) {
            components.push({
              type: 'BUTTONS',
              buttons: buttons.map(b => ({
                type: b.type,
                text: b.text,
                ...(b.url ? { url: b.url } : {}),
                ...(b.phone_number ? { phone_number: b.phone_number } : {})
              }))
            });
          }

          // Check for duplicate name
          const { data: existing } = await supabase
            .from('wp_whatsapp_templates')
            .select('id')
            .eq('numero_id', numero.id)
            .eq('template_name', normalizedName)
            .eq('language_code', language_code || 'es')
            .maybeSingle();

          if (existing) {
            return {
              success: false,
              error: `Ya existe una plantilla con el nombre "${normalizedName}" para el idioma ${language_code || 'es'}. Usa otro nombre.`
            };
          }

          // Extract header type
          const headerComponent = components.find(c => c.type === 'HEADER');
          const headerType = headerComponent?.format || null;

          const resolvedCategory = meta_category || 'utility';
          const insertPayloadBase = {
            empresa_id: resolvedEnterpriseId,
            numero_id: numero.id,
            provider: 'kapso',
            provider_phone_id: numero.id_kapso,
            template_name: normalizedName,
            language_code: language_code || 'es',
            clasificacion_interna: clasificacion_interna || null,
            status: 'draft',
            is_active: true,
            header_type: headerType,
            components,
            variables_schema: [],
            example_payload: {},
            metadata: { created_from: 'monica_chat', created_by_team_member: teamMember.id }
          };

          const categoryPayloadVariants: Array<Record<string, string>> = [
            { meta_category: resolvedCategory },
            { category: resolvedCategory },
            { meta_category: resolvedCategory, category: resolvedCategory }
          ];

          let template: { id: number; template_name: string; status: string; language_code: string } | null = null;
          let insertError: any = null;

          for (const categoryPayload of categoryPayloadVariants) {
            const result = await supabase
              .from('wp_whatsapp_templates')
              .insert({
                ...insertPayloadBase,
                ...categoryPayload
              })
              .select('id, template_name, status, language_code')
              .single();

            template = result.data;
            insertError = result.error;

            if (!insertError) {
              break;
            }

            const insertMessage = typeof insertError?.message === 'string'
              ? insertError.message.toLowerCase()
              : '';

            const shouldRetryWithAnotherCategoryShape =
              insertMessage.includes('meta_category') ||
              insertMessage.includes('column "category" of relation "wp_whatsapp_templates" violates not-null constraint') ||
              insertMessage.includes("could not find the 'category' column") ||
              insertMessage.includes("could not find the 'meta_category' column");

            if (!shouldRetryWithAnotherCategoryShape) {
              break;
            }

            logger.warn('[Tool:createTemplateDraft] Retrying insert with alternate category field', {
              categoryPayloadKeys: Object.keys(categoryPayload),
              error: insertError.message
            });
          }

          if (insertError) {
            logger.error('[Tool:createTemplateDraft] Insert error', insertError);
            return { success: false, error: `Error al guardar borrador: ${insertError.message}` };
          }

          if (!template) {
            logger.error('[Tool:createTemplateDraft] Insert completed without template payload');
            return { success: false, error: 'Error al guardar borrador: no se recibió respuesta de la plantilla creada.' };
          }

          const etiquetaMarkdown = buildTemplateMarkdownTag(normalizedName, template.id);

          // Detect variables used
          const varMatches = body_text.match(/\{\{\d+\}\}/g) || [];
          const variablesInfo = varMatches.length > 0
            ? `Variables detectadas: ${varMatches.join(', ')}`
            : 'Sin variables dinámicas';

          logger.info('[Tool:createTemplateDraft] Success', { templateId: template.id, name: normalizedName });

          return {
            success: true,
            resumen: `✅ Borrador de plantilla "${normalizedName}" creado exitosamente.`,
            plantilla: {
              id: template.id,
              nombre: normalizedName,
              estado: 'draft',
              idioma: template.language_code,
              categoria: resolvedCategory,
              variables: variablesInfo,
              numero: `${numero.telefono || ''} (${numero.nombre || 'Principal'})`,
              etiquetaMarkdown
            },
            _instruccion: `Incluye la etiqueta ${etiquetaMarkdown} en tu respuesta para que el usuario pueda navegar al borrador. Recuérdale que puede ir a Ajustes > Plantillas WhatsApp para revisar, editar y enviar a aprobación de Meta.`
          };
        } catch (err: any) {
          logger.error('[Tool:createTemplateDraft] Exception', err);
          return { success: false, error: `Error inesperado: ${err.message}` };
        }
      }
    }
  };

  const activeTools = selectToolsForMonicaRole(tools, monicaRole);

  logger.info('[Chat API] Active tools resolved', {
    roleId: monicaRole?.id || null,
    roleSlug: monicaRole?.slug || null,
    activeToolCount: Object.keys(activeTools).length,
    activeTools: Object.keys(activeTools)
  });

  // ============================================
  // STREAM RESPONSE - UI Message Protocol con Fallback
  // ============================================
  
  // Configurar cliente OpenRouter para fallback
  const openrouter = OPENROUTER_API_KEY ? createOpenAI({
    apiKey: OPENROUTER_API_KEY,
    baseURL: OPENROUTER_API_URL,
  }) : null;

  try {
    logger.info('[Chat API] Intentando con Gemini...');
    
    const result = streamText({
      model: google(GEMINI_MODEL),
      system: systemPrompt,
      messages: messages,
      tools: activeTools,
      stopWhen: stepCountIs(15), // Máximo 15 iteraciones de tools
      temperature: 0.7,
      onStepFinish: ({ text, toolCalls, toolResults, finishReason }) => {
        logger.info('[Chat API] Step finished', { 
          hasText: !!text,
          toolCalls: toolCalls?.length || 0,
          finishReason 
        });
      },
      onFinish: ({ text, usage, steps }) => {
        logger.info('[Chat API] Stream finished successfully with Gemini', { 
          sessionId, 
          tokens: usage.totalTokens,
          textLength: text.length,
          totalSteps: steps?.length || 1
        });
      },
      onError: (err) => {
        logger.error('[Chat API] Stream error callback:', err);
      }
    });

    // UI Message Stream Protocol - Soporta tools y multi-step
    return result.toUIMessageStreamResponse();

  } catch (error: any) {
    logger.error('[Chat API] Gemini failed:', error);
    
    // FALLBACK: Intentar con OpenRouter si está configurado
    if (openrouter && OPENROUTER_API_KEY) {
      try {
        logger.warn('[Chat API] Gemini falló. Intentando con OpenRouter fallback...');
        
        const fallbackResult = streamText({
          model: openrouter(OPENROUTER_MODEL) as any, // Type assertion para compatibilidad
          system: systemPrompt,
          messages: messages,
          tools: activeTools,
          stopWhen: stepCountIs(15),
          temperature: 0.7,
          onFinish: ({ text, usage, steps }) => {
            logger.info('[Chat API] Stream finished successfully with OpenRouter fallback', { 
              sessionId, 
              tokens: usage.totalTokens,
              textLength: text.length,
              totalSteps: steps?.length || 1
            });
          }
        });

        return fallbackResult.toUIMessageStreamResponse();
        
      } catch (fallbackError: any) {
        logger.error('[Chat API] OpenRouter fallback también falló:', fallbackError);
        
        return Response.json({ 
          error: 'Error en ambos servicios de IA',
          details: `Gemini: ${error.message}. OpenRouter: ${fallbackError.message}` 
        }, { status: 500 });
      }
    }
    
    // Si no hay OpenRouter configurado, retornar error de Gemini
    if (error.message?.includes('quota') || error.status === 429) {
      return Response.json({ 
        error: 'Límite de peticiones alcanzado', 
        details: 'El servicio de IA está saturado. Configura OPENROUTER_API_KEY como respaldo.' 
      }, { status: 429 });
    }

    return Response.json({ 
      error: 'Error al generar respuesta',
      details: error.message || 'Stream failed. Considera configurar OpenRouter como respaldo.' 
    }, { status: 500 });
  }
}
