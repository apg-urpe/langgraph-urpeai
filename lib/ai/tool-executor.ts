/**
 * Monica AI Tool Executor
 * 
 * ⚠️ DEPRECATED: Este archivo es LEGACY
 * Las tools ahora están definidas e implementadas directamente en app/api/chat/route.ts
 * Este archivo se mantiene para compatibilidad con imports existentes.
 * 
 * Para nuevas tools, agregar directamente al objeto `tools` en route.ts.
 */

import { createClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';
import { getContacts, searchContactsDeep, getContactById } from '@/lib/dal';

// Server-side Supabase client (uses service role for full access)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Tool execution context
export interface ToolContext {
  enterpriseId: number;
  userId?: number;
}

// Tool result type
export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
}

function extractFunnelColor(descripcion: unknown): string | null {
  if (!descripcion) return null;

  let parsedValue = descripcion;
  if (typeof parsedValue === 'string') {
    try {
      parsedValue = JSON.parse(parsedValue);
    } catch {
      return null;
    }
  }

  if (!parsedValue || typeof parsedValue !== 'object' || Array.isArray(parsedValue)) {
    return null;
  }

  const color = (parsedValue as Record<string, unknown>).color;
  return typeof color === 'string' && color.trim().length > 0 ? color : null;
}

// ============================================
// TOOL IMPLEMENTATIONS
// ============================================

export async function executeGetContacts(
  args: {
    search?: string;
    estado?: string;
    es_calificado?: string;
    is_active?: boolean;
    etapa_embudo_id?: number;
    asesor_id?: number;
    limit?: number;
    order_by?: string;
  },
  ctx: ToolContext
): Promise<ToolResult> {
  // Usar DAL compartido
  const result = await getContacts(supabase, {
    enterpriseId: ctx.enterpriseId,
    userId: ctx.userId
  }, {
    search: args.search,
    estado: args.estado,
    es_calificado: args.es_calificado,
    is_active: args.is_active,
    etapa_embudo_id: args.etapa_embudo_id,
    asesor_id: args.asesor_id,
    limit: args.limit || 10,
    order_by: args.order_by as any
  });

  if (result.error) {
    return { success: false, error: result.error };
  }

  const contacts = result.data || [];
  const warnings: string[] = [];

  if (contacts.length === 0) {
    if (args.search) {
      warnings.push(`No se encontraron contactos con "${args.search}"`);
    } else if (args.estado || args.es_calificado || args.etapa_embudo_id || args.asesor_id) {
      warnings.push('No hay contactos con los filtros aplicados - intenta ampliar la búsqueda');
    } else {
      warnings.push('⚠️ No hay contactos registrados en esta empresa');
    }
  }

  return {
    success: true,
    data: {
      contacts,
      count: result.count || 0,
      filters: {
        search: args.search || null,
        estado: args.estado || null,
        es_calificado: args.es_calificado || null,
        is_active: args.is_active,
        etapa_embudo_id: args.etapa_embudo_id || null,
        asesor_id: args.asesor_id || null
      },
      message: contacts.length 
        ? `Encontré ${contacts.length} contacto(s)` 
        : 'No se encontraron contactos',
      warnings: warnings.length > 0 ? warnings : undefined
    }
  };
}

export async function executeGetContactDetails(
  args: { contact_id: number },
  ctx: ToolContext
): Promise<ToolResult> {
  try {
    // Get contact with security check
    const { data: contact, error: contactError } = await supabase
      .from('wp_contactos')
      .select('*')
      .eq('id', args.contact_id)
      .eq('empresa_id', ctx.enterpriseId)
      .single();

    if (contactError || !contact) {
      return { success: false, error: 'Contacto no encontrado o sin acceso' };
    }

    // Fetch related data in parallel
    const [conversationsRes, appointmentsRes, notesRes, funnelRes] = await Promise.all([
      supabase
        .from('wp_conversaciones')
        .select('id, fecha_inicio, status, resumen')
        .eq('contacto_id', args.contact_id)
        .order('fecha_inicio', { ascending: false })
        .limit(5),
      
      supabase
        .from('wp_citas')
        .select('id, titulo, fecha_hora, estado, duracion')
        .eq('contacto_id', args.contact_id)
        .order('fecha_hora', { ascending: false })
        .limit(5),

      supabase
        .from('wp_contactos_nota')
        .select('id, titulo, descripcion, created_at, es_fijado')
        .eq('contacto_id', args.contact_id)
        .neq('visible_ia', false) // Solo notas visibles para IA
        .order('created_at', { ascending: false })
        .limit(5),

      contact.etapa_embudo
        ? supabase
            .from('wp_empresa_embudo')
            .select('nombre_etapa, descripcion')
            .eq('id', contact.etapa_embudo)
            .eq('empresa_id', ctx.enterpriseId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null })
    ]);

    return {
      success: true,
      data: {
        contact,
        conversations: conversationsRes.data || [],
        appointments: appointmentsRes.data || [],
        notes: notesRes.data || [],
        funnelStage: funnelRes.data
          ? {
              nombre_etapa: funnelRes.data.nombre_etapa,
              color: extractFunnelColor(funnelRes.data.descripcion)
            }
          : null
      }
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ============================================
// DEEP SEARCH - Búsqueda Profunda Multi-Fuente (usa DAL)
// ============================================

export async function executeSearchContactsDeep(
  args: {
    query: string;
    scope?: 'all' | 'contacts' | 'messages' | 'metadata' | 'notes';
    include_inactive?: boolean;
    limit?: number;
  },
  ctx: ToolContext
): Promise<ToolResult> {
  logger.debug('[SearchContactsDeep] Context:', { enterpriseId: ctx.enterpriseId, userId: ctx.userId, query: args.query });
  
  // Usar DAL compartido
  const result = await searchContactsDeep(supabase, {
    enterpriseId: ctx.enterpriseId,
    userId: ctx.userId
  }, {
    query: args.query,
    scope: args.scope,
    include_inactive: args.include_inactive,
    limit: args.limit || 15
  });

  if (result.error) {
    return { success: false, error: result.error };
  }

  const contacts = result.data || [];
  const searchTerm = args.query.trim();
  const scope = args.scope || 'all';

  return {
    success: true,
    data: {
      contacts,
      count: contacts.length,
      query: searchTerm,
      scope,
      message: contacts.length 
        ? `Encontré ${contacts.length} contacto(s) para "${searchTerm}"`
        : `No se encontraron contactos para "${searchTerm}"`
    }
  };
}

export async function executeGetAppointments(
  args: {
    contact_id?: number;
    asesor_id?: number;
    estado?: string;
    fecha_desde?: string;
    fecha_hasta?: string;
    proximas?: boolean;
    limit?: number;
  },
  ctx: ToolContext
): Promise<ToolResult> {
  try {
    const limit = Math.min(args.limit || 10, 50);

    let query = supabase
      .from('wp_citas')
      .select(`
        id,
        titulo,
        descripcion,
        fecha_hora,
        duracion,
        estado,
        ubicacion,
        contacto_id,
        team_humano_id,
        contact:wp_contactos(id, nombre, apellido, telefono)
      `)
      .eq('empresa_id', ctx.enterpriseId);

    if (args.contact_id) query = query.eq('contacto_id', args.contact_id);
    if (args.asesor_id) query = query.eq('team_humano_id', args.asesor_id);
    if (args.estado) query = query.eq('estado', args.estado);
    
    if (args.proximas) {
      query = query.gte('fecha_hora', new Date().toISOString());
    } else {
      if (args.fecha_desde) query = query.gte('fecha_hora', args.fecha_desde);
      if (args.fecha_hasta) query = query.lte('fecha_hora', args.fecha_hasta);
    }

    query = query.order('fecha_hora', { ascending: args.proximas ?? false }).limit(limit);

    const { data, error } = await query;
    if (error) throw error;

    const appointments = (data || []).map(apt => ({
      ...apt,
      contact: Array.isArray(apt.contact) ? apt.contact[0] : apt.contact
    }));

    const warnings: string[] = [];
    if (appointments.length === 0) {
      if (args.proximas) {
        warnings.push('No hay citas próximas programadas');
      } else if (args.contact_id) {
        warnings.push('Este contacto no tiene citas registradas');
      } else {
        warnings.push('No se encontraron citas con los filtros aplicados');
      }
    }

    return {
      success: true,
      data: {
        appointments,
        count: appointments.length,
        filters: {
          contact_id: args.contact_id || null,
          asesor_id: args.asesor_id || null,
          estado: args.estado || null,
          proximas: args.proximas || false
        },
        warnings: warnings.length > 0 ? warnings : undefined
      }
    };
  } catch (err: any) {
    logger.error('[GetAppointments] Error:', err);
    return { success: false, error: err.message };
  }
}

export async function executeGetConversations(
  args: {
    contact_id?: number;
    status?: string;
    limit?: number;
  },
  ctx: ToolContext
): Promise<ToolResult> {
  try {
    const limit = Math.min(args.limit || 10, 30);

    let query = supabase
      .from('wp_conversaciones')
      .select(`
        id,
        fecha_inicio,
        status,
        resumen,
        contacto_id,
        contact:wp_contactos(id, nombre, apellido, telefono)
      `)
      .eq('empresa_id', ctx.enterpriseId);

    if (args.contact_id) query = query.eq('contacto_id', args.contact_id);
    if (args.status) query = query.eq('status', args.status);

    query = query.order('fecha_inicio', { ascending: false }).limit(limit);

    const { data, error } = await query;
    if (error) throw error;

    const conversations = (data || []).map(conv => ({
      ...conv,
      contact: Array.isArray(conv.contact) ? conv.contact[0] : conv.contact
    }));

    const warnings: string[] = [];
    if (conversations.length === 0) {
      if (args.contact_id) {
        warnings.push('Este contacto no tiene conversaciones registradas');
      } else {
        warnings.push('No hay conversaciones en la empresa - verificar integración de WhatsApp');
      }
    }

    return {
      success: true,
      data: {
        conversations,
        count: conversations.length,
        filters: {
          contact_id: args.contact_id || null,
          status: args.status || null
        },
        warnings: warnings.length > 0 ? warnings : undefined
      }
    };
  } catch (err: any) {
    logger.error('[GetConversations] Error:', err);
    return { success: false, error: err.message };
  }
}

export async function executeSearchMessages(
  args: {
    query: string;
    contact_id?: number;
    limit?: number;
  },
  ctx: ToolContext
): Promise<ToolResult> {
  try {
    const limit = Math.min(args.limit || 20, 50);
    const searchTerm = `%${args.query}%`;

    // First get conversations for this enterprise
    let convQuery = supabase
      .from('wp_conversaciones')
      .select('id')
      .eq('empresa_id', ctx.enterpriseId);
    
    if (args.contact_id) convQuery = convQuery.eq('contacto_id', args.contact_id);

    const { data: conversations } = await convQuery;
    const convIds = conversations?.map(c => c.id) || [];

    if (convIds.length === 0) {
      return { success: true, data: { messages: [], count: 0 } };
    }

    // Search messages in those conversations
    const { data: messages, error } = await supabase
      .from('wp_mensajes')
      .select(`
        id,
        contenido,
        remitente,
        timestamp,
        conversacion_id,
        conversation:wp_conversaciones(
          contacto_id,
          contact:wp_contactos(id, nombre, apellido)
        )
      `)
      .in('conversacion_id', convIds)
      .ilike('contenido', searchTerm)
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (error) throw error;

    const results = (messages || []).map(msg => ({
      id: msg.id,
      contenido: msg.contenido,
      remitente: msg.remitente,
      timestamp: msg.timestamp,
      contact: (msg.conversation as any)?.contact
    }));

    const warnings: string[] = [];
    if (results.length === 0) {
      warnings.push(`No se encontraron mensajes con "${args.query}"`);
    }

    return {
      success: true,
      data: {
        messages: results,
        count: results.length,
        query: args.query,
        warnings: warnings.length > 0 ? warnings : undefined
      }
    };
  } catch (err: any) {
    logger.error('[SearchMessages] Error:', err);
    return { success: false, error: err.message };
  }
}

export async function executeGetTeamMembers(
  args: {
    is_active?: boolean;
    rol?: string;
  },
  ctx: ToolContext
): Promise<ToolResult> {
  try {
    let query = supabase
      .from('wp_team_humano')
      .select('id, nombre, apellido, email, rol, is_active, especialidad')
      .eq('empresa_id', ctx.enterpriseId);

    if (args.is_active !== false) query = query.eq('is_active', true);
    if (args.rol) query = query.eq('rol', args.rol);

    query = query.order('nombre');

    const { data, error } = await query;
    if (error) throw error;

    const members = data || [];
    const warnings: string[] = [];

    if (members.length === 0) {
      warnings.push('⚠️ No hay miembros del equipo registrados - la empresa puede no estar configurada correctamente');
    }

    return {
      success: true,
      data: {
        members,
        count: members.length,
        filters: { is_active: args.is_active !== false, rol: args.rol || null },
        warnings: warnings.length > 0 ? warnings : undefined
      }
    };
  } catch (err: any) {
    logger.error('[GetTeamMembers] Error:', err);
    return { success: false, error: err.message };
  }
}

export async function executeGetFunnelStages(
  ctx: ToolContext
): Promise<ToolResult> {
  try {
    const { data, error } = await supabase
      .from('wp_empresa_embudo')
      .select('id, nombre_etapa, descripcion, orden_etapa')
      .eq('empresa_id', ctx.enterpriseId)
      .order('orden_etapa');

    if (error) throw error;

    const stages = (data || []).map((stage: any) => ({
      ...stage,
      color: extractFunnelColor(stage.descripcion)
    }));
    const warnings: string[] = [];

    if (stages.length === 0) {
      warnings.push('⚠️ No hay etapas de embudo configuradas - el pipeline de ventas está vacío');
    }

    return {
      success: true,
      data: {
        stages,
        count: stages.length,
        enterpriseId: ctx.enterpriseId,
        warnings: warnings.length > 0 ? warnings : undefined
      }
    };
  } catch (err: any) {
    logger.error('[GetFunnelStages] Error:', err);
    return { success: false, error: err.message };
  }
}

export async function executeGetFunnelStats(
  args: { asesor_id?: number },
  ctx: ToolContext
): Promise<ToolResult> {
  try {
    // Get stages
    const { data: stages } = await supabase
      .from('wp_empresa_embudo')
      .select('id, nombre_etapa, descripcion, orden_etapa')
      .eq('empresa_id', ctx.enterpriseId)
      .order('orden_etapa');

    // Get contact counts per stage
    let contactQuery = supabase
      .from('wp_contactos')
      .select('etapa_embudo')
      .eq('empresa_id', ctx.enterpriseId);

    if (args.asesor_id) contactQuery = contactQuery.eq('team_humano_id', args.asesor_id);

    const { data: contacts } = await contactQuery;

    // Count contacts per stage
    const stageCounts: Record<number, number> = {};
    (contacts || []).forEach(c => {
      if (c.etapa_embudo) {
        stageCounts[c.etapa_embudo] = (stageCounts[c.etapa_embudo] || 0) + 1;
      }
    });

    const stats = (stages || []).map((stage: any) => ({
      ...stage,
      color: extractFunnelColor(stage.descripcion),
      contactCount: stageCounts[stage.id] || 0
    }));

    const totalContacts = Object.values(stageCounts).reduce((a, b) => a + b, 0);

    return {
      success: true,
      data: {
        stages: stats,
        totalContacts,
        stagesCount: stages?.length || 0
      }
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function executeGetMetrics(
  args: {
    period?: string;
    asesor_id?: number;
  },
  ctx: ToolContext
): Promise<ToolResult> {
  try {
    // Calculate date range
    const now = new Date();
    let startDate = new Date();

    switch (args.period) {
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
      default:
        startDate.setDate(now.getDate() - 7); // Default: last 7 days
    }

    const startISO = startDate.toISOString();

    // Build queries - handle asesor_id filter correctly
    let contactsQuery = supabase
      .from('wp_contactos')
      .select('id', { count: 'exact', head: true })
      .eq('empresa_id', ctx.enterpriseId);
    
    if (args.asesor_id) {
      contactsQuery = contactsQuery.eq('team_humano_id', args.asesor_id);
    }

    let newContactsQuery = supabase
      .from('wp_contactos')
      .select('id', { count: 'exact', head: true })
      .eq('empresa_id', ctx.enterpriseId)
      .gte('created_at', startISO);
    
    if (args.asesor_id) {
      newContactsQuery = newContactsQuery.eq('team_humano_id', args.asesor_id);
    }

    let appointmentsQuery = supabase
      .from('wp_citas')
      .select('id, estado', { count: 'exact' })
      .eq('empresa_id', ctx.enterpriseId)
      .gte('fecha_hora', startISO);
    
    if (args.asesor_id) {
      appointmentsQuery = appointmentsQuery.eq('team_humano_id', args.asesor_id);
    }

    let conversationsQuery = supabase
      .from('wp_conversaciones')
      .select('id', { count: 'exact', head: true })
      .eq('empresa_id', ctx.enterpriseId)
      .gte('fecha_inicio', startISO);

    // Parallel queries for metrics
    const [contactsRes, newContactsRes, appointmentsRes, conversationsRes] = await Promise.all([
      contactsQuery,
      newContactsQuery,
      appointmentsQuery,
      conversationsQuery
    ]);

    // Calculate appointment stats
    const appointments = appointmentsRes.data || [];
    const completedAppointments = appointments.filter(a => a.estado === 'completada').length;

    const totalContacts = contactsRes.count || 0;
    const newContacts = newContactsRes.count || 0;
    const totalAppointments = appointmentsRes.count || 0;
    const activeConversations = conversationsRes.count || 0;

    // Calculate conversion rate
    const conversionRate = (totalContacts > 0 && totalAppointments > 0) 
      ? Math.round((totalAppointments / totalContacts) * 100) 
      : 0;

    // Build warnings for anomaly detection
    const warnings: string[] = [];
    if (totalContacts === 0) {
      warnings.push('⚠️ No hay contactos registrados para esta empresa');
    }
    if (activeConversations === 0 && totalContacts > 0) {
      warnings.push('⚠️ No hay conversaciones en el período - verificar integración de WhatsApp');
    }

    return {
      success: true,
      data: {
        period: args.period || 'week',
        periodStart: startISO,
        periodEnd: now.toISOString(),
        enterpriseId: ctx.enterpriseId,
        filters: { asesor_id: args.asesor_id || null },
        metrics: {
          totalContacts,
          newContacts,
          totalAppointments,
          completedAppointments,
          activeConversations,
          conversionRate
        },
        warnings: warnings.length > 0 ? warnings : undefined,
        _debug: {
          queryErrors: {
            contacts: contactsRes.error?.message,
            newContacts: newContactsRes.error?.message,
            appointments: appointmentsRes.error?.message,
            conversations: conversationsRes.error?.message
          }
        }
      }
    };
  } catch (err: any) {
    logger.error('[GetMetrics] Error:', err);
    return { success: false, error: err.message };
  }
}

export async function executeGetTasks(
  args: {
    estado?: string;
    asignado_a?: number;
    contact_id?: number;
    proyecto_id?: number;
    prioridad?: number;
    search?: string;
    limit?: number;
  },
  ctx: ToolContext
): Promise<ToolResult> {
  try {
    const limit = Math.min(args.limit || 20, 50);

    let query = supabase
      .from('wp_tareas')
      .select(`
        id,
        titulo,
        descripcion,
        estado,
        prioridad,
        fecha_vencimiento,
        asignado_a,
        contacto_id,
        proyecto_id,
        created_at,
        asignado:wp_team_humano!asignado_a(id, nombre, apellido),
        contacto:wp_contactos!contacto_id(id, nombre, apellido),
        proyecto:wp_proyectos!proyecto_id(id, nombre)
      `)
      .eq('empresa_id', ctx.enterpriseId);

    if (args.estado) query = query.eq('estado', args.estado);
    if (args.asignado_a) query = query.eq('asignado_a', args.asignado_a);
    if (args.contact_id) query = query.eq('contacto_id', args.contact_id);
    if (args.proyecto_id) query = query.eq('proyecto_id', args.proyecto_id);
    if (args.prioridad) query = query.eq('prioridad', args.prioridad);
    
    // Búsqueda por texto en título o descripción
    if (args.search) {
      query = query.or(`titulo.ilike.%${args.search}%,descripcion.ilike.%${args.search}%`);
    }

    query = query.order('prioridad', { ascending: false })
      .order('fecha_vencimiento', { ascending: true, nullsFirst: false })
      .limit(limit);

    const { data, error } = await query;
    if (error) throw error;

    const tasks = (data || []).map(task => ({
      ...task,
      asignado: Array.isArray(task.asignado) ? task.asignado[0] : task.asignado,
      contacto: Array.isArray(task.contacto) ? task.contacto[0] : task.contacto,
      proyecto: Array.isArray(task.proyecto) ? task.proyecto[0] : task.proyecto
    }));

    const warnings: string[] = [];
    if (tasks.length === 0) {
      if (args.search) {
        warnings.push(`No se encontraron tareas con "${args.search}"`);
      } else if (args.estado) {
        warnings.push(`No hay tareas en estado "${args.estado}"`);
      } else if (args.asignado_a) {
        warnings.push('Este miembro no tiene tareas asignadas');
      } else {
        warnings.push('No hay tareas registradas con los filtros aplicados');
      }
    }

    return {
      success: true,
      data: {
        tasks,
        count: tasks.length,
        filters: {
          estado: args.estado || null,
          asignado_a: args.asignado_a || null,
          contact_id: args.contact_id || null,
          proyecto_id: args.proyecto_id || null
        },
        warnings: warnings.length > 0 ? warnings : undefined
      }
    };
  } catch (err: any) {
    logger.error('[GetTasks] Error:', err);
    return { success: false, error: err.message };
  }
}

export async function executeGetContactNotes(
  args: {
    contact_id: number;
    limit?: number;
  },
  ctx: ToolContext
): Promise<ToolResult> {
  try {
    const limit = Math.min(args.limit || 10, 30);

    // Verify contact belongs to enterprise
    const { data: contact } = await supabase
      .from('wp_contactos')
      .select('id')
      .eq('id', args.contact_id)
      .eq('empresa_id', ctx.enterpriseId)
      .single();

    if (!contact) {
      return { success: false, error: 'Contacto no encontrado' };
    }

    const { data, error } = await supabase
      .from('wp_contactos_nota')
      .select(`
        id,
        titulo,
        descripcion,
        etiquetas,
        es_fijado,
        visible_ia,
        created_at,
        author:wp_team_humano!team_humano_id(nombre, apellido)
      `)
      .eq('contacto_id', args.contact_id)
      .neq('visible_ia', false) // Solo notas visibles para IA (true o null)
      .order('es_fijado', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    const notes = data || [];
    const warnings: string[] = [];
    
    if (notes.length === 0) {
      warnings.push('Este contacto no tiene notas registradas');
    }

    return {
      success: true,
      data: {
        notes,
        count: notes.length,
        contact_id: args.contact_id,
        warnings: warnings.length > 0 ? warnings : undefined
      }
    };
  } catch (err: any) {
    logger.error('[GetContactNotes] Error:', err);
    return { success: false, error: err.message };
  }
}

// ============================================
// GET FULL CONTACT CONTEXT - Vista 360° (Importado de sub-agent)
// ============================================

export async function executeGetFullContactContext(
  args: { contact_id: number },
  ctx: ToolContext
): Promise<ToolResult> {
  try {
    logger.debug('[GetFullContactContext] Args:', { contact_id: args.contact_id, enterpriseId: ctx.enterpriseId });
    
    // Primero verificar que el contacto existe y pertenece a la empresa
    const { data: basicContact, error: basicError } = await supabase
      .from('wp_contactos')
      .select('id, empresa_id, etapa_embudo, team_humano_id')
      .eq('id', args.contact_id)
      .single();

    if (basicError || !basicContact) {
      logger.warn('[GetFullContactContext] Contact not found (basic):', { 
        contact_id: args.contact_id,
        error: basicError?.message 
      });
      return { success: false, error: 'Contacto no encontrado' };
    }

    // Verificar pertenencia a empresa basándose en el contexto de observación actual (enterpriseId)
    if (basicContact.empresa_id !== ctx.enterpriseId) {
      logger.warn('[GetFullContactContext] Enterprise mismatch:', { 
        contact_id: args.contact_id, 
        contact_empresa_id: basicContact.empresa_id,
        ctx_enterpriseId: ctx.enterpriseId
      });
      return { success: false, error: `Acceso denegado: El contacto pertenece a la empresa ID ${basicContact.empresa_id}, pero el contexto actual es ID ${ctx.enterpriseId}` };
    }

    // Obtener contacto completo con relaciones (especificando FK para evitar ambigüedad)
    const { data: contact, error: contactError } = await supabase
      .from('wp_contactos')
      .select(`
        *,
        etapa:wp_empresa_embudo!etapa_embudo(id, nombre_etapa),
        asesor:wp_team_humano!team_humano_id(id, nombre, apellido, email)
      `)
      .eq('id', args.contact_id)
      .single();

    if (contactError || !contact) {
      logger.warn('[GetFullContactContext] Contact fetch error:', { 
        contact_id: args.contact_id, 
        error: contactError?.message 
      });
      return { success: false, error: `Error al obtener contacto: ${contactError?.message}` };
    }

    // Obtener todos los datos relacionados en paralelo
    const [
      conversationsRes,
      appointmentsRes,
      tasksRes,
      notesRes,
      multimediaRes,
      enrollmentsRes
    ] = await Promise.all([
      // Conversaciones recientes
      supabase
        .from('wp_conversaciones')
        .select('id, fecha_inicio, status, resumen')
        .eq('contacto_id', args.contact_id)
        .order('fecha_inicio', { ascending: false })
        .limit(5),

      // Citas (pasadas y futuras)
      supabase
        .from('wp_citas')
        .select(`
          id, titulo, fecha_hora, duracion, estado, ubicacion,
          asesor:wp_team_humano!team_humano_id(id, nombre, apellido)
        `)
        .eq('contacto_id', args.contact_id)
        .order('fecha_hora', { ascending: false })
        .limit(10),

      // Tareas relacionadas
      supabase
        .from('wp_tareas')
        .select(`
          id, titulo, estado, prioridad, fecha_vencimiento,
          asignado:wp_team_humano!asignado_a(id, nombre, apellido)
        `)
        .eq('contacto_id', args.contact_id)
        .order('prioridad', { ascending: false })
        .limit(10),

      // Notas (solo visibles para IA)
      supabase
        .from('wp_contactos_nota')
        .select('id, titulo, descripcion, es_fijado, created_at')
        .eq('contacto_id', args.contact_id)
        .neq('visible_ia', false) // Solo notas visibles para IA
        .order('es_fijado', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(10),

      // Multimedia
      supabase
        .from('wp_multimedia')
        .select('id, tipo, url, descripcion, created_at')
        .eq('contacto_id', args.contact_id)
        .order('created_at', { ascending: false })
        .limit(5),

      // Campañas inscritas
      supabase
        .from('wp_email_contacto_campana')
        .select(`
          id, estado, created_at,
          campana:wp_email_campanas(id, nombre)
        `)
        .eq('contacto_id', args.contact_id)
        .limit(5)
    ]);

    // Calcular resumen de actividad
    const now = new Date();
    const lastInteraction = contact.ultima_interaccion 
      ? new Date(contact.ultima_interaccion) 
      : null;
    const daysSinceInteraction = lastInteraction 
      ? Math.floor((now.getTime() - lastInteraction.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    const upcomingAppointments = (appointmentsRes.data || [])
      .filter(a => new Date(a.fecha_hora) > now);
    const pastAppointments = (appointmentsRes.data || [])
      .filter(a => new Date(a.fecha_hora) <= now);

    const pendingTasks = (tasksRes.data || [])
      .filter(t => t.estado === 'pendiente' || t.estado === 'en_progreso');

    return {
      success: true,
      data: {
        contact: {
          ...contact,
          etapa: Array.isArray(contact.etapa) ? contact.etapa[0] : contact.etapa,
          asesor: Array.isArray(contact.asesor) ? contact.asesor[0] : contact.asesor
        },
        conversations: conversationsRes.data || [],
        appointments: {
          upcoming: upcomingAppointments,
          past: pastAppointments.slice(0, 5)
        },
        tasks: {
          pending: pendingTasks,
          all: tasksRes.data || []
        },
        notes: notesRes.data || [],
        multimedia: multimediaRes.data || [],
        campaigns: (enrollmentsRes.data || []).map(e => ({
          ...e,
          campana: Array.isArray(e.campana) ? e.campana[0] : e.campana
        })),
        summary: {
          daysSinceInteraction,
          totalConversations: conversationsRes.data?.length || 0,
          upcomingAppointmentsCount: upcomingAppointments.length,
          pendingTasksCount: pendingTasks.length,
          notesCount: notesRes.data?.length || 0,
          hasMultimedia: (multimediaRes.data?.length || 0) > 0,
          campaignsEnrolled: enrollmentsRes.data?.length || 0
        }
      }
    };
  } catch (err: any) {
    logger.error('[GetFullContactContext] Error:', err);
    return { success: false, error: err.message };
  }
}

export async function executeCreateNote(
  args: {
    contact_id: number;
    titulo?: string;
    descripcion: string;
    etiquetas?: string[];
  },
  ctx: ToolContext
): Promise<ToolResult> {
  try {
    // Verify contact belongs to enterprise
    const { data: contact } = await supabase
      .from('wp_contactos')
      .select('id')
      .eq('id', args.contact_id)
      .eq('empresa_id', ctx.enterpriseId)
      .single();

    if (!contact) {
      return { success: false, error: 'Contacto no encontrado' };
    }

    const { data, error } = await supabase
      .from('wp_contactos_nota')
      .insert({
        contacto_id: args.contact_id,
        titulo: args.titulo || null,
        descripcion: args.descripcion,
        etiquetas: args.etiquetas || [],
        team_humano_id: ctx.userId || null
      })
      .select()
      .single();

    if (error) throw error;

    return {
      success: true,
      data: {
        note: data,
        message: 'Nota creada exitosamente'
      }
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ============================================
// MAIN EXECUTOR
// ============================================

export async function executeGetConversationalIntelligence(
  args: {
    start_date?: string;
    end_date?: string;
    incluir_metadata?: boolean;
    ordenar_por?: string;
    orden?: string;
    limite?: number;
    query?: string;
  },
  ctx: ToolContext
): Promise<ToolResult> {
  try {
    const response = await fetch(
      'https://vecspltvmyopwbjzerow.supabase.co/functions/v1/-obtener_mensajes_conversaciones',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({
          empresa_id: ctx.enterpriseId,
          fecha_inicio: args.start_date,
          fecha_fin: args.end_date,
          incluir_metadata: args.incluir_metadata ?? true,
          ordenar_por: args.ordenar_por || 'fecha_inicio',
          orden: args.orden || 'desc',
          limite: args.limite || 500,
          query: args.query
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('[ConversationalIntelligence] Edge Function error:', errorText);
      return { success: false, error: `Error en la función de inteligencia: ${response.statusText}` };
    }

    const data = await response.json();
    return { success: true, data };
  } catch (err: any) {
    logger.error('[ConversationalIntelligence] Exception:', err);
    return { success: false, error: err.message };
  }
}

export async function executeTool(
  toolName: string,
  args: Record<string, any>,
  ctx: ToolContext
): Promise<ToolResult> {
  logger.debug(`[ToolExecutor] Executing ${toolName}`, args);

  switch (toolName) {
    // Herramientas de Lectura
    case 'search_contacts_deep':
      return executeSearchContactsDeep(args as any, ctx);
    case 'get_full_contact_context':
      return executeGetFullContactContext(args as { contact_id: number }, ctx);
    case 'get_conversational_intelligence':
      return executeGetConversationalIntelligence(args as any, ctx);
    
    // Herramientas de Escritura
    case 'create_note':
      return executeCreateNote(args as { contact_id: number; titulo?: string; descripcion: string; etiquetas?: string[] }, ctx);
    
    default:
      return { success: false, error: `Tool "${toolName}" not implemented` };
  }
}
