/**
 * AI Email Composer + Nylas Send API
 * 
 * POST /api/nylas/send-email
 * 
 * Flujo:
 * 1. Auth + security check
 * 2. Si mode=draft → genera borrador con Gemini (contexto 360° + campaña)
 * 3. Si mode=send  → envía email vía Nylas + registra en wp_email_envio
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { verifyActiveTeamMember, createSupabaseAdmin } from '@/lib/auth-security';
import { GEMINI_API_KEY, GEMINI_MODEL, buildGeminiUrl } from '@/lib/ai/config';
import { buildEmailHtml, extractPlainText, type EmailSection, type EmailData } from '@/lib/email-template';
import { isMarketingEmailMetadata } from '@/lib/email-metadata';

export const dynamic = 'force-dynamic';

const NYLAS_API_KEY = process.env.NYLAS_API_KEY;
const NYLAS_API_URI = process.env.NYLAS_API_URI || 'https://api.us.nylas.com';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// ============================================================================
// AUTH HELPER (same pattern as events/route.ts)
// ============================================================================

async function getAuthUser(request: NextRequest) {
  let response = NextResponse.next();
  const cookieSupabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return request.cookies.get(name)?.value; },
        set(name: string, value: string, options: CookieOptions) { response.cookies.set({ name, value, ...options }); },
        remove(name: string, options: CookieOptions) { response.cookies.set({ name, value: '', ...options }); },
      },
    }
  );

  const { data: { user: cookieUser }, error: cookieError } = await cookieSupabase.auth.getUser();
  if (cookieUser && !cookieError) return { user: cookieUser, error: null };

  const { data: { session }, error: sessionError } = await cookieSupabase.auth.getSession();
  if (session?.user && !sessionError) {
    console.log('[API/Nylas/SendEmail] Auth recovered via getSession refresh');
    return { user: session.user, error: null };
  }

  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const tokenSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data: { user: tokenUser }, error: tokenError } = await tokenSupabase.auth.getUser(token);
    if (tokenUser && !tokenError) return { user: tokenUser, error: null };
    console.warn('[API/Nylas/SendEmail] Bearer token invalid:', tokenError?.message);
  }

  console.warn('[API/Nylas/SendEmail] All auth methods failed. Cookie error:', cookieError?.message, '| Session error:', sessionError?.message);
  return { user: null, error: cookieError || sessionError || new Error('No valid authentication found') };
}

async function resolveAllowedCampaign(campaignId: number, empresaId: number | null | undefined) {
  if (!empresaId) return null;

  const { data, error } = await supabaseAdmin
    .from('wp_email_campanas')
    .select('id, nombre, descripcion, instrucciones_ai, total_toques, empresa_id')
    .eq('id', campaignId)
    .or(`empresa_id.eq.${empresaId},empresa_id.is.null`)
    .maybeSingle();

  if (error) throw error;
  return data;
}

// ============================================================================
// CONTEXT BUILDER: Arma contexto 360° del contacto para el prompt
// ============================================================================

async function buildFullContactContext(contactId: number): Promise<{
  contact: any;
  conversations: any[];
  notes: any[];
  appointments: any[];
  funnelStatus: any;
  funnelStage: any;
  services: any[];
  transcriptions: any[];
  previousEmails: any[];
  enterprise: any;
}> {
  const [
    contactRes,
    convsRes,
    notesRes,
    appointmentsRes,
    funnelRes,
    servicesRes,
    transcriptionsRes,
    emailsRes,
  ] = await Promise.all([
    supabaseAdmin.from('wp_contactos').select('*').eq('id', contactId).single(),
    supabaseAdmin.from('wp_conversaciones').select('id, resumen, canal, fecha_inicio, estado')
      .eq('contacto_id', contactId).order('fecha_inicio', { ascending: false }).limit(5),
    supabaseAdmin.from('wp_contactos_nota').select('titulo, descripcion, created_at')
      .eq('contacto_id', contactId).order('created_at', { ascending: false }).limit(10),
    supabaseAdmin.from('wp_citas').select('titulo, estado, fecha_hora, descripcion, evaluacion_asesor, resumen_conversacion')
      .eq('contacto_id', contactId).order('fecha_hora', { ascending: false }).limit(5),
    supabaseAdmin.from('wp_embudo_contacto').select('etapa_actual, notas, fecha_ultimo_cambio')
      .eq('contacto_id', contactId).order('fecha_ultimo_cambio', { ascending: false }).limit(1),
    supabaseAdmin.from('wp_crm_servicios').select('nombre_servicio, tipo_servicio, estado, valor_total, saldo_pagado, saldo_pendiente')
      .eq('contacto_id', contactId).limit(10),
    supabaseAdmin.from('wp_transcripciones').select('resumen, resumen_cita, transcripcion, duracion, created_at')
      .eq('contacto_id', contactId).order('created_at', { ascending: false }).limit(3),
    supabaseAdmin.from('wp_email_envio').select('asunto, estado, enviado_en, cuerpo_texto, secuencia, metadata')
      .eq('contacto_id', contactId).order('created_at', { ascending: false }).limit(10),
  ]);

  const contact = contactRes.data;

  // Fetch enterprise profile
  let enterprise = null;
  if (contact?.empresa_id) {
    const { data: empData } = await supabaseAdmin
      .from('wp_empresa_perfil')
      .select('nombre, rubro, servicios_generales, reglas_negocio, canal_comunicacion, informacion_empresarial')
      .eq('id', contact.empresa_id)
      .single();
    enterprise = empData;
  }

  // Fetch funnel stage name
  let funnelStage = null;
  const funnelStatus = funnelRes.data?.[0] || null;
  if (funnelStatus?.etapa_actual) {
    const { data: stageData } = await supabaseAdmin
      .from('wp_empresa_embudo')
      .select('nombre_etapa, orden_etapa, descripcion')
      .eq('id', funnelStatus.etapa_actual)
      .single();
    funnelStage = stageData;
  }

  // Fetch recent messages for top conversations
  const convIds = (convsRes.data || []).map((c: any) => c.id);
  let messages: any[] = [];
  if (convIds.length > 0) {
    const { data: msgsData } = await supabaseAdmin
      .from('wp_conversacion_mensajes')
      .select('conversacion_id, remitente, cuerpo, mensaje, contenido, created_at')
      .in('conversacion_id', convIds)
      .order('created_at', { ascending: false })
      .limit(30);
    messages = msgsData || [];
  }

  // Attach messages to conversations
  const conversations = (convsRes.data || []).map((conv: any) => ({
    ...conv,
    messages: messages
      .filter((m: any) => m.conversacion_id === conv.id)
      .slice(0, 8)
      .map((m: any) => ({
        remitente: m.remitente,
        contenido: (m.cuerpo || m.mensaje || m.contenido || '').slice(0, 500),
        fecha: m.created_at,
      }))
  }));

  return {
    contact,
    conversations,
    notes: notesRes.data || [],
    appointments: appointmentsRes.data || [],
    funnelStatus,
    funnelStage,
    services: servicesRes.data || [],
    transcriptions: transcriptionsRes.data || [],
    previousEmails: (emailsRes.data || []).filter((email: any) => isMarketingEmailMetadata(email.metadata)),
    enterprise,
  };
}

function formatContextForPrompt(ctx: Awaited<ReturnType<typeof buildFullContactContext>>): string {
  const parts: string[] = [];
  const c = ctx.contact;

  parts.push(`## Contacto`);
  parts.push(`- Nombre: ${c.nombre || ''} ${c.apellido || ''}`);
  if (c.email) parts.push(`- Email: ${c.email}`);
  if (c.telefono) parts.push(`- Teléfono: ${c.telefono}`);
  if (c.estado) parts.push(`- Estado: ${c.estado}`);
  if (c.es_calificado) parts.push(`- Calificación: ${c.es_calificado}`);
  if (c.origen) parts.push(`- Origen: ${c.origen}`);
  if (c.etapa_emocional) parts.push(`- Etapa emocional: ${c.etapa_emocional}`);
  if (c.metadata) parts.push(`- Metadata: ${JSON.stringify(c.metadata)}`);

  if (ctx.funnelStage) {
    parts.push(`\n## Etapa del embudo`);
    parts.push(`- Etapa: ${ctx.funnelStage.nombre_etapa} (orden ${ctx.funnelStage.orden_etapa})`);
  }

  if (ctx.conversations.length > 0) {
    parts.push(`\n## Historial de conversaciones (${ctx.conversations.length})`);
    for (const conv of ctx.conversations) {
      parts.push(`### [${conv.canal}] ${conv.resumen || 'Sin resumen'} (${conv.fecha_inicio ? new Date(conv.fecha_inicio).toLocaleDateString('es-ES') : ''})`);
      for (const msg of conv.messages || []) {
        if (msg.contenido) parts.push(`  ${msg.remitente}: ${msg.contenido}`);
      }
    }
  }

  if (ctx.appointments.length > 0) {
    parts.push(`\n## Citas (${ctx.appointments.length})`);
    for (const a of ctx.appointments) {
      parts.push(`- ${a.titulo || 'Sin título'} [${a.estado}] (${a.fecha_hora ? new Date(a.fecha_hora).toLocaleDateString('es-ES') : ''})`);
      if (a.resumen_conversacion) parts.push(`  Resumen: ${a.resumen_conversacion.slice(0, 300)}`);
    }
  }

  if (ctx.notes.length > 0) {
    parts.push(`\n## Notas (${ctx.notes.length})`);
    for (const n of ctx.notes) {
      parts.push(`- ${n.titulo || 'Nota'}: ${(n.descripcion || '').slice(0, 300)}`);
    }
  }

  if (ctx.services.length > 0) {
    const totalContratado = ctx.services.reduce((s: number, sv: any) => s + (sv.valor_total || 0), 0);
    const totalPagado = ctx.services.reduce((s: number, sv: any) => s + (sv.saldo_pagado || 0), 0);
    parts.push(`\n## Cartera: $${totalContratado.toLocaleString()} contratado, $${totalPagado.toLocaleString()} pagado`);
    for (const s of ctx.services) {
      parts.push(`- ${s.nombre_servicio || 'Servicio'}: $${s.valor_total || 0} [${s.estado}]`);
    }
  }

  if (ctx.transcriptions.length > 0) {
    parts.push(`\n## Transcripciones de reuniones (${ctx.transcriptions.length})`);
    for (const t of ctx.transcriptions) {
      if (t.resumen_cita) parts.push(`- Resumen: ${t.resumen_cita.slice(0, 500)}`);
      if (t.transcripcion) parts.push(`  Transcripción: ${t.transcripcion.slice(0, 1500)}`);
    }
  }

  if (ctx.previousEmails.length > 0) {
    parts.push(`\n## Emails previos enviados (${ctx.previousEmails.length})`);
    for (const e of ctx.previousEmails) {
      parts.push(`- [${e.estado}] Asunto: "${e.asunto}" (Toque #${e.secuencia}) ${e.enviado_en ? new Date(e.enviado_en).toLocaleDateString('es-ES') : ''}`);
    }
  }

  return parts.join('\n');
}

// ============================================================================
// AI PROMPT BUILDER
// ============================================================================

function buildEmailMessages(
  ctx: Awaited<ReturnType<typeof buildFullContactContext>>,
  advisor: { nombre: string; apellido: string; email: string; rol: string },
  campaign: { nombre: string; descripcion: string | null; instrucciones_ai: string | null } | null,
  customInstructions: string | null,
  touchNumber: number,
  totalTouches: number | null
): Array<{ role: string; parts: Array<{ text: string }> }> {
  const contactName = `${ctx.contact.nombre || ''} ${ctx.contact.apellido || ''}`.trim() || 'Contacto';
  const contextStr = formatContextForPrompt(ctx);
  const now = new Date();
  const hora = now.getHours();
  const saludo = hora < 12 ? 'Buenos días' : hora < 18 ? 'Buenas tardes' : 'Buenas noches';

  // ── Message 1: System context ──
  const systemContext = `Eres un redactor de emails comerciales experto. Actúas como ${advisor.nombre} ${advisor.apellido}, ${advisor.rol}.
Email de envío: ${advisor.email}

## Empresa:
${ctx.enterprise?.nombre || 'Empresa'}${ctx.enterprise?.rubro ? ` — ${ctx.enterprise.rubro}` : ''}
${ctx.enterprise?.servicios_generales ? `Servicios: ${ctx.enterprise.servicios_generales.slice(0, 500)}` : ''}

## Dinámica del negocio:
- La IA maneja la conversación inicial por chat/WhatsApp
- Tú (${advisor.nombre}) haces seguimiento y cierre vía email
- Si la conversación quedó inconclusa sin cita, invita a continuar

## Contexto completo del contacto:
${contextStr}

## Reglas de estilo:
- Primera persona, como el asesor humano
- Idioma del historial de conversación (si no hay, español)
- Párrafos cortos, franjas de información
- Detecta sistema representacional (visual/auditivo/kinestésico) y adáptalo
- Sin compromisos explícitos (fechas, horas específicas)
- Sin citas pasadas como futuras
- Sin repetir preguntas ya hechas en chat
- No te presentes como "humano"
- No inventes datos no proporcionados
- No añadas recordatorios de eventos pasados

## Contexto temporal:
Hoy es ${now.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} a las ${now.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}.
Usa "${saludo}" como saludo si es apropiado.`;

  // ── Message 2: Model acknowledgment ──
  const modelAck = `Entendido. Tengo el contexto completo de ${contactName}. Generaré un JSON con subject y sections[] siguiendo el esquema de secciones HTML. Listo para las instrucciones.`;

  // ── Message 3: Specific instruction ──
  const instructionParts: string[] = [];
  instructionParts.push(`Redacta el email #${touchNumber}${totalTouches ? ` de ${totalTouches}` : ''} para ${contactName} (${ctx.contact.email}).`);

  if (campaign) {
    instructionParts.push(`\nCampaña: "${campaign.nombre}"`);
    if (campaign.descripcion) instructionParts.push(`Descripción: ${campaign.descripcion}`);
    if (campaign.instrucciones_ai) instructionParts.push(`Instrucciones de campaña: ${campaign.instrucciones_ai}`);
  } else {
    instructionParts.push('\nEs un email libre (sin campaña). Redacta un seguimiento personalizado basado en el contexto.');
  }

  if (customInstructions) {
    instructionParts.push(`\nInstrucciones adicionales del asesor:\n${customInstructions}`);
  }

  instructionParts.push(`
## Estrategias de persuasión (elige 2):
Escasez | Urgencia | FOMO | Prueba Social | Autoridad | Reciprocidad | Storytelling | Simplicidad

## Formato de respuesta (JSON estricto):
El email se renderizará en una plantilla HTML corporativa profesional. Genera un JSON con secciones:

{
  "subject": "Asunto corto, relevante, sin emojis, max 60 caracteres",
  "sections": [
    { "type": "header", "title": "Título visual del email", "subtitle": "Subtítulo breve" },
    { "type": "greeting", "text": "Hola **${contactName}**," },
    { "type": "paragraph", "text": "Primer párrafo introductorio..." },
    { "type": "paragraph", "text": "Segundo párrafo con más detalle..." },
    ...más secciones según necesidad...,
    { "type": "closing", "text": "Mensaje de cierre cordial.\\nQuedamos a su disposición." }
  ]
}

## TIPOS DE SECCIÓN DISPONIBLES:
- **header**: Título y subtítulo del email (banner superior). OBLIGATORIO, siempre primero.
  { "type": "header", "title": "...", "subtitle": "..." }
- **greeting**: Saludo personalizado al contacto. Usa **negritas** con doble asterisco.
  { "type": "greeting", "text": "Hola **Nombre**," }
- **paragraph**: Párrafo de texto libre. Soporta **negritas** y \\n para saltos de línea.
  { "type": "paragraph", "text": "..." }
- **status_box**: Caja de estado destacada. variant: "success" | "warning" | "info"
  { "type": "status_box", "status": "CONFIRMADO", "message": "Tu solicitud fue procesada", "variant": "success" }
- **details_box**: Tabla de datos clave-valor.
  { "type": "details_box", "title": "Detalles", "items": [{"label": "Servicio", "value": "Consulta"}, {"label": "Estado", "value": "ACTIVO"}] }
- **button**: Botón CTA. variant: "primary" | "secondary"
  { "type": "button", "text": "Escríbenos por WhatsApp", "url": "https://wa.me/...", "variant": "primary" }
- **checklist**: Lista con checks verdes.
  { "type": "checklist", "title": "Lo que incluye", "items": ["Beneficio 1", "Beneficio 2"] }
- **quote**: Cita destacada en caja oscura.
  { "type": "quote", "text": "Cita o testimonio destacado", "author": "Autor" }
- **info_box**: Caja informativa. variant: "info" | "example" | "warning"
  { "type": "info_box", "title": "💡 Dato importante", "text": "Contenido informativo...", "variant": "info" }
- **steps**: Lista numerada de pasos.
  { "type": "steps", "title": "Próximos Pasos", "items": ["Paso 1", "Paso 2", "Paso 3"] }
- **closing**: Mensaje de cierre (último). Soporta \\n para saltos de línea.
  { "type": "closing", "text": "Mensaje de cierre..." }

## REGLAS DE COMPOSICIÓN:
- SIEMPRE incluir: header + greeting + al menos 2 párrafos/secciones + closing
- El header.title debe ser atractivo y relevante al contexto (NO repetir el subject)
- Usar button para CTA principal (WhatsApp, email, o link relevante)
- Mínimo 5 secciones, máximo 10
- NO usar TODAS las secciones disponibles — elige las más relevantes al contexto
- Las secciones de datos (details_box, status_box) solo si hay información real y relevante
- Ve directo al grano, sin relleno genérico
- El CTA debe ser claro y accionable`);

  return [
    { role: 'user', parts: [{ text: systemContext }] },
    { role: 'model', parts: [{ text: modelAck }] },
    { role: 'user', parts: [{ text: instructionParts.join('\n') }] },
  ];
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export async function POST(req: NextRequest) {
  if (!GEMINI_API_KEY) {
    return NextResponse.json({ error: 'Gemini API Key not configured' }, { status: 500 });
  }

  // Auth
  const { user, error: authError } = await getAuthUser(req);
  if (!user || authError) {
    return NextResponse.json({ error: 'No autorizado. Inicia sesión.' }, { status: 401 });
  }

  const securityCheck = await verifyActiveTeamMember(createSupabaseAdmin(), user.id, user.email);
  if (!securityCheck.success || !securityCheck.teamMember) {
    return NextResponse.json(
      { error: securityCheck.error?.message || 'Acceso denegado' },
      { status: securityCheck.error?.httpStatus || 403 }
    );
  }

  try {
    const body = await req.json();
    const {
      contactId,
      campaignId,
      customInstructions,
      mode = 'draft', // 'draft' | 'save-draft' | 'send'
      editedSubject,
      editedBody,
      draftId: bodyDraftId,
      editedBodyHtml,
    } = body;

    if (!contactId) {
      return NextResponse.json({ error: 'contactId es requerido' }, { status: 400 });
    }

    // ================================================================
    // MODE: DRAFT — Generate email with AI
    // ================================================================
    if (mode === 'draft') {
      // 1. Build full context
      const ctx = await buildFullContactContext(contactId);
      if (!ctx.contact) {
        return NextResponse.json({ error: 'Contacto no encontrado' }, { status: 404 });
      }

      if (!ctx.contact.email) {
        return NextResponse.json({ error: 'El contacto no tiene email registrado' }, { status: 400 });
      }

      // 2. Get advisor info
      const teamMember = securityCheck.teamMember;
      const { data: advisorData } = await supabaseAdmin
        .from('wp_team_humano')
        .select('nombre, apellido, email, rol, grant_id')
        .eq('id', teamMember.id)
        .single();

      const advisor = {
        nombre: advisorData?.nombre || teamMember.nombre || '',
        apellido: advisorData?.apellido || teamMember.apellido || '',
        email: advisorData?.email || teamMember.email || '',
        rol: advisorData?.rol || 'Asesor',
      };

      // 3. Get campaign if selected
      let campaign = null;
      if (campaignId) {
        const campData = await resolveAllowedCampaign(campaignId, ctx.contact.empresa_id);
        if (!campData) {
          return NextResponse.json({ error: 'La campaña seleccionada no pertenece a la empresa del contacto' }, { status: 403 });
        }
        campaign = campData;
      }

      // 4. Calculate touch number
      const touchNumber = ctx.previousEmails.length + 1;
      const totalTouches = campaign?.total_toques || null;

      // 5. Build multi-turn prompt
      const messages = buildEmailMessages(ctx, advisor, campaign, customInstructions || null, touchNumber, totalTouches);

      // 6. Call Gemini (multi-turn, GEMINI_MODEL for better reasoning)
      const geminiUrl = buildGeminiUrl(GEMINI_MODEL);
      console.log(`[SendEmail] Calling Gemini (${GEMINI_MODEL}) for contact ${contactId}, campaign ${campaignId || 'libre'}`);

      const geminiResponse = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: messages,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 4096,
            topP: 0.9,
            responseMimeType: 'application/json',
          }
        })
      });

      if (!geminiResponse.ok) {
        const errorText = await geminiResponse.text();
        console.error('[SendEmail] Gemini error:', geminiResponse.status, errorText);
        return NextResponse.json({ error: 'Error al generar email con IA' }, { status: 500 });
      }

      const geminiData = await geminiResponse.json();
      const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
      console.log('[SendEmail] Gemini raw response length:', rawText.length, '| preview:', rawText.slice(0, 200));

      // Parse JSON response
      let draft: { subject: string; sections: EmailSection[] };
      try {
        draft = JSON.parse(rawText);
      } catch {
        // Fallback: try to extract from markdown code block
        const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
          draft = JSON.parse(jsonMatch[1].trim());
        } else {
          console.error('[SendEmail] Failed to parse Gemini response:', rawText.slice(0, 500));
          return NextResponse.json({ error: 'Error al parsear respuesta de IA', raw: rawText }, { status: 500 });
        }
      }

      // Validate draft has actual content
      if (!draft.subject && (!draft.sections || draft.sections.length === 0)) {
        console.error('[SendEmail] Gemini returned empty draft. Raw:', rawText.slice(0, 500));
        return NextResponse.json({ error: 'La IA generó un borrador vacío. Intenta de nuevo.', raw: rawText }, { status: 500 });
      }

      // Ensure sections is an array
      if (!Array.isArray(draft.sections)) {
        draft.sections = [];
      }

      // 7. Build HTML from sections using corporate template
      const contactName = `${ctx.contact.nombre || ''} ${ctx.contact.apellido || ''}`.trim() || 'Contacto';
      const emailContext = {
        contactName,
        contactEmail: ctx.contact.email,
        enterpriseName: ctx.enterprise?.nombre || 'Empresa',
        enterpriseColor: undefined, // default #0D1B2A
        advisorName: `${advisor.nombre} ${advisor.apellido}`.trim(),
        advisorEmail: advisor.email,
        unsubscribeUrl: undefined,
      };

      const bodyHtml = buildEmailHtml({ subject: draft.subject, sections: draft.sections }, emailContext);
      const bodyText = extractPlainText(draft.sections);

      // 8. Save draft to DB (wp_email_envio with estado='borrador')
      const envioData: Record<string, unknown> = {
        contacto_id: contactId,
        secuencia: touchNumber,
        estado: 'borrador',
        asunto: draft.subject || 'Sin asunto',
        cuerpo_html: bodyHtml,
        cuerpo_texto: bodyText,
        remitente_team_humano: securityCheck.teamMember.id,
        metadata: {
          email_kind: 'marketing',
          sent_via: 'ai_email_composer',
          grant_id: advisorData?.grant_id || null,
          sections: draft.sections,
        },
      };

      if (campaignId) {
        envioData.campana_id = campaignId;
      }

      const { data: savedDraft, error: dbError } = await supabaseAdmin
        .from('wp_email_envio')
        .insert(envioData)
        .select('id')
        .single();

      if (dbError) {
        console.error('[SendEmail] DB draft insert error:', dbError);
        // Non-blocking — still return draft to user
      }

      const draftId = savedDraft?.id || null;
      console.log(`[SendEmail] Draft saved to DB with id: ${draftId}`);

      return NextResponse.json({
        success: true,
        mode: 'draft',
        draftId,
        draft: {
          subject: draft.subject || 'Sin asunto',
          bodyHtml,
          bodyText,
          sections: draft.sections,
        },
        contact: {
          id: ctx.contact.id,
          nombre: ctx.contact.nombre,
          apellido: ctx.contact.apellido,
          email: ctx.contact.email,
        },
        advisor: {
          nombre: advisor.nombre,
          apellido: advisor.apellido,
          email: advisor.email,
          hasGrant: !!advisorData?.grant_id,
        },
        touchNumber,
        totalTouches,
      });
    }

    // ================================================================
    // MODE: SAVE-DRAFT — Update existing draft in DB
    // ================================================================
    if (mode === 'save-draft') {
      const { draftId, editedSubject: newSubject, editedBodyHtml: newBodyHtml } = body;

      if (!draftId) {
        return NextResponse.json({ error: 'draftId es requerido para save-draft' }, { status: 400 });
      }

      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (newSubject !== undefined) updateData.asunto = newSubject;
      if (newBodyHtml !== undefined) updateData.cuerpo_html = newBodyHtml;

      const { error: dbError } = await supabaseAdmin
        .from('wp_email_envio')
        .update(updateData)
        .eq('id', draftId)
        .eq('estado', 'borrador');

      if (dbError) {
        console.error('[SendEmail] DB save-draft error:', dbError);
        return NextResponse.json({ error: 'Error al guardar borrador' }, { status: 500 });
      }

      return NextResponse.json({ success: true, mode: 'saved', draftId });
    }

    // ================================================================
    // MODE: SEND — Send email via Nylas (uses stored HTML from draft)
    // ================================================================
    if (mode === 'send') {
      const { draftId, editedSubject: sendSubject, editedBodyHtml: sendBodyHtml } = body;

      // Either draftId (load from DB) or inline subject+bodyHtml required
      if (!draftId && (!sendSubject || !sendBodyHtml)) {
        return NextResponse.json({ error: 'draftId o (editedSubject + editedBodyHtml) son requeridos para enviar' }, { status: 400 });
      }

      if (!NYLAS_API_KEY) {
        return NextResponse.json({ error: 'Nylas API Key not configured' }, { status: 500 });
      }

      // Get advisor grant_id
      const { data: advisorData } = await supabaseAdmin
        .from('wp_team_humano')
        .select('grant_id, email, nombre, apellido, empresa_id')
        .eq('id', securityCheck.teamMember.id)
        .single();

      if (!advisorData?.grant_id) {
        return NextResponse.json({
          error: 'No tienes un email conectado. Conecta tu cuenta en Configuración > Integraciones.',
          code: 'NO_GRANT'
        }, { status: 400 });
      }

      // Get contact email
      const { data: contact } = await supabaseAdmin
        .from('wp_contactos')
        .select('id, nombre, apellido, email, empresa_id')
        .eq('id', contactId)
        .single();

      if (!contact?.email) {
        return NextResponse.json({ error: 'El contacto no tiene email' }, { status: 400 });
      }

      // Verify same enterprise
      if (securityCheck.teamMember.role_id !== 1 && securityCheck.teamMember.empresa_id !== contact.empresa_id) {
        return NextResponse.json({ error: 'No puedes enviar emails a contactos de otra empresa' }, { status: 403 });
      }

      if (campaignId) {
        const campData = await resolveAllowedCampaign(campaignId, contact.empresa_id);
        if (!campData) {
          return NextResponse.json({ error: 'La campaña seleccionada no pertenece a la empresa del contacto' }, { status: 403 });
        }
      }

      // Resolve email content: from draftId or from inline params
      let finalSubject = sendSubject;
      let finalBodyHtml = sendBodyHtml;
      let finalBodyText = body.editedBody || '';
      let existingMetadata: Record<string, unknown> = {};

      if (draftId) {
        const { data: draftRow } = await supabaseAdmin
          .from('wp_email_envio')
          .select('asunto, cuerpo_html, cuerpo_texto, metadata')
          .eq('id', draftId)
          .single();

        if (draftRow) {
          finalSubject = finalSubject || draftRow.asunto;
          finalBodyHtml = finalBodyHtml || draftRow.cuerpo_html;
          finalBodyText = finalBodyText || draftRow.cuerpo_texto || '';
          existingMetadata = (draftRow.metadata && typeof draftRow.metadata === 'object' && !Array.isArray(draftRow.metadata))
            ? draftRow.metadata as Record<string, unknown>
            : {};
        }
      }

      if (!finalSubject || !finalBodyHtml) {
        return NextResponse.json({ error: 'No se pudo resolver el contenido del email' }, { status: 400 });
      }

      // Send via Nylas V3
      const contactName = `${contact.nombre || ''} ${contact.apellido || ''}`.trim() || 'Contacto';
      const nylasUrl = `${NYLAS_API_URI}/v3/grants/${advisorData.grant_id}/messages/send`;

      console.log(`[SendEmail] Sending HTML email via Nylas grant ${advisorData.grant_id} to ${contact.email}`);

      const nylasResponse = await fetch(nylasUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${NYLAS_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subject: finalSubject,
          body: finalBodyHtml,
          to: [{ name: contactName, email: contact.email }],
          tracking_options: {
            opens: true,
            links: false,
            thread_replies: false,
          }
        })
      });

      if (!nylasResponse.ok) {
        const errorText = await nylasResponse.text();
        console.error(`[SendEmail] Nylas error: ${nylasResponse.status} ${errorText}`);

        let userMessage = 'Error al enviar email';
        if (nylasResponse.status === 404) {
          userMessage = 'Tu conexión de email expiró. Reconecta tu cuenta en Configuración.';
        }

        return NextResponse.json({
          error: userMessage,
          code: 'NYLAS_SEND_FAILED',
          details: errorText,
        }, { status: nylasResponse.status });
      }

      const nylasData = await nylasResponse.json();
      const sentMessage = nylasData.data || nylasData;

      console.log(`[SendEmail] ✅ Email sent successfully. Nylas message ID: ${sentMessage.id}`);

      // Update or insert in wp_email_envio
      if (draftId) {
        // Update existing draft → enviado
        const { error: dbError } = await supabaseAdmin
          .from('wp_email_envio')
          .update({
            estado: 'enviado',
            asunto: finalSubject,
            cuerpo_html: finalBodyHtml,
            cuerpo_texto: finalBodyText,
            enviado_en: new Date().toISOString(),
            email_id: sentMessage.id || null,
            thread_id: sentMessage.thread_id || null,
            metadata: {
              ...existingMetadata,
              email_kind: (existingMetadata.email_kind === 'transactional' ? 'transactional' : 'marketing'),
              sent_via: 'ai_email_composer',
              grant_id: advisorData.grant_id,
              nylas_message_id: sentMessage.id,
            },
          })
          .eq('id', draftId);

        if (dbError) {
          console.error('[SendEmail] DB update error (non-blocking):', dbError);
        }
      } else {
        // Insert new record (direct send without saved draft)
        const envioData: Record<string, unknown> = {
          contacto_id: contactId,
          secuencia: 1,
          estado: 'enviado',
          asunto: finalSubject,
          cuerpo_html: finalBodyHtml,
          cuerpo_texto: finalBodyText,
          enviado_en: new Date().toISOString(),
          email_id: sentMessage.id || null,
          thread_id: sentMessage.thread_id || null,
          remitente_team_humano: securityCheck.teamMember.id,
          metadata: {
            email_kind: 'marketing',
            sent_via: 'ai_email_composer',
            grant_id: advisorData.grant_id,
            nylas_message_id: sentMessage.id,
          },
        };
        if (campaignId) envioData.campana_id = campaignId;

        const { error: dbError } = await supabaseAdmin
          .from('wp_email_envio')
          .insert(envioData);

        if (dbError) {
          console.error('[SendEmail] DB insert error (non-blocking):', dbError);
        }
      }

      return NextResponse.json({
        success: true,
        mode: 'sent',
        messageId: sentMessage.id,
        threadId: sentMessage.thread_id,
      });
    }

    return NextResponse.json({ error: `Modo inválido: ${mode}. Usar 'draft', 'save-draft' o 'send'` }, { status: 400 });

  } catch (error: any) {
    console.error('[SendEmail] Exception:', error);
    return NextResponse.json({ error: 'Error interno del servidor', details: error.message }, { status: 500 });
  }
}
