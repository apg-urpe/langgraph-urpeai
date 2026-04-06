/**
 * Activity Logger - Sistema de Auditoría de Actividades
 * 
 * Propósito:
 * - Registro completo de actividades del sistema en wp_actividades_log
 * - Auditoría para compliance y debugging
 * - Tracking de cambios con datos antes/después
 * - Soporte para diferentes tipos de entidades
 * 
 * Uso:
 * ```typescript
 * import { logActivity, ActivityType } from '@/lib/activity-logger';
 * 
 * await logActivity({
 *   tipo: 'contacto',
 *   accion: 'actualizar',
 *   descripcion: 'Actualizado estado del contacto',
 *   contactoId: 123,
 *   empresaId: 1,
 *   datosAntes: { estado: 'nuevo' },
 *   datosDespues: { estado: 'calificado' }
 * });
 * ```
 */

import { supabase } from './supabase-client';

export type ActivityType = 
  | 'contacto' 
  | 'cita' 
  | 'conversacion' 
  | 'tarea' 
  | 'campana' 
  | 'email' 
  | 'nota' 
  | 'auth' 
  | 'admin' 
  | 'sistema';

export type ActivityAction = 
  | 'crear' 
  | 'actualizar' 
  | 'eliminar' 
  | 'ver' 
  | 'exportar' 
  | 'importar' 
  | 'enviar' 
  | 'recibir' 
  | 'login' 
  | 'logout' 
  | 'signup'
  | 'password_reset'
  | 'error';

export interface ActivityLogParams {
  tipo: ActivityType;
  accion: ActivityAction;
  descripcion?: string;
  
  // IDs de entidades relacionadas
  agenteId?: number;
  empresaId?: number;
  contactoId?: number;
  usuarioId?: string;
  
  // Entidad genérica (para flexibilidad)
  entidadTipo?: string;
  entidadId?: string;
  
  // Datos de auditoría (para cambios)
  datosAntes?: Record<string, unknown>;
  datosDespues?: Record<string, unknown>;
  
  // Contexto de request
  ipOrigen?: string;
  userAgent?: string;
}

export interface ActivityLogEntry {
  tipo: string;
  accion: string;
  descripcion?: string;
  agente_id?: number;
  empresa_id?: number;
  contacto_id?: number;
  entidad_tipo?: string;
  datos_antes?: Record<string, unknown>;
  datos_despues?: Record<string, unknown>;
  usuario_id?: string;
  entidad_id?: string;
  ip_origen?: string;
  user_agent?: string;
  tipo_valido?: ActivityType;
}

/**
 * Log de actividad genérico
 */
export async function logActivity(params: ActivityLogParams): Promise<void> {
  try {
    // SECURITY: If empresa_id is missing and it's not a system/auth activity, warn
    if (!params.empresaId && !['auth', 'sistema'].includes(params.tipo)) {
      console.warn(`[ActivityLogger] Log initiated without empresaId for type: ${params.tipo}`);
    }

    const logEntry: ActivityLogEntry = {
      tipo: params.tipo,
      accion: params.accion,
      descripcion: params.descripcion,
      agente_id: params.agenteId,
      empresa_id: params.empresaId,
      contacto_id: params.contactoId,
      entidad_tipo: params.entidadTipo,
      datos_antes: params.datosAntes,
      datos_despues: params.datosDespues,
      usuario_id: params.usuarioId,
      entidad_id: params.entidadId,
      ip_origen: params.ipOrigen,
      user_agent: params.userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : undefined),
      tipo_valido: params.tipo
    };

    const { error } = await supabase
      .from('wp_actividades_log')
      .insert(logEntry);

    if (error) {
      console.error('[ActivityLogger] Failed to insert activity log:', error);
    }

    // Log en desarrollo
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Activity] ${params.tipo}.${params.accion}:`, params.descripcion);
    }
  } catch (error) {
    console.error('[ActivityLogger] Error logging activity:', error);
  }
}

/**
 * Log de creación de entidad
 */
export async function logCreate(
  tipo: ActivityType,
  entidadId: string | number,
  datos: Record<string, unknown>,
  context?: Pick<ActivityLogParams, 'empresaId' | 'contactoId' | 'descripcion'>
): Promise<void> {
  return logActivity({
    tipo,
    accion: 'crear',
    descripcion: context?.descripcion || `Creado ${tipo} #${entidadId}`,
    entidadId: String(entidadId),
    entidadTipo: tipo,
    datosDespues: datos,
    empresaId: context?.empresaId,
    contactoId: context?.contactoId
  });
}

/**
 * Log de actualización de entidad
 */
export async function logUpdate(
  tipo: ActivityType,
  entidadId: string | number,
  datosAntes: Record<string, unknown>,
  datosDespues: Record<string, unknown>,
  context?: Pick<ActivityLogParams, 'empresaId' | 'contactoId' | 'descripcion'>
): Promise<void> {
  return logActivity({
    tipo,
    accion: 'actualizar',
    descripcion: context?.descripcion || `Actualizado ${tipo} #${entidadId}`,
    entidadId: String(entidadId),
    entidadTipo: tipo,
    datosAntes,
    datosDespues,
    empresaId: context?.empresaId,
    contactoId: context?.contactoId
  });
}

/**
 * Log de eliminación de entidad
 */
export async function logDelete(
  tipo: ActivityType,
  entidadId: string | number,
  datos: Record<string, unknown>,
  context?: Pick<ActivityLogParams, 'empresaId' | 'contactoId' | 'descripcion'>
): Promise<void> {
  return logActivity({
    tipo,
    accion: 'eliminar',
    descripcion: context?.descripcion || `Eliminado ${tipo} #${entidadId}`,
    entidadId: String(entidadId),
    entidadTipo: tipo,
    datosAntes: datos,
    empresaId: context?.empresaId,
    contactoId: context?.contactoId
  });
}

/**
 * Log de autenticación
 */
export async function logAuth(
  accion: 'login' | 'logout' | 'signup' | 'password_reset',
  usuarioId?: string,
  context?: { ipOrigen?: string; userAgent?: string; descripcion?: string }
): Promise<void> {
  return logActivity({
    tipo: 'auth',
    accion,
    descripcion: context?.descripcion || `Usuario ${accion}`,
    usuarioId,
    ipOrigen: context?.ipOrigen,
    userAgent: context?.userAgent
  });
}

/**
 * Log de actividad de contacto
 */
export async function logContactActivity(
  accion: ActivityAction,
  contactoId: number,
  empresaId: number,
  descripcion?: string,
  datos?: { antes?: Record<string, unknown>; despues?: Record<string, unknown> },
  usuarioId?: string
): Promise<void> {
  return logActivity({
    tipo: 'contacto',
    accion,
    descripcion,
    contactoId,
    empresaId,
    datosAntes: datos?.antes,
    datosDespues: datos?.despues,
    usuarioId
  });
}

/**
 * Log de actividad de cita
 */
export async function logAppointmentActivity(
  accion: ActivityAction,
  citaId: number,
  empresaId: number,
  contactoId?: number,
  descripcion?: string,
  datos?: { antes?: Record<string, unknown>; despues?: Record<string, unknown> }
): Promise<void> {
  return logActivity({
    tipo: 'cita',
    accion,
    descripcion,
    entidadId: String(citaId),
    empresaId,
    contactoId,
    datosAntes: datos?.antes,
    datosDespues: datos?.despues
  });
}

/**
 * Log de actividad de campaña de email
 */
export async function logCampaignActivity(
  accion: ActivityAction,
  campanaId: number,
  empresaId: number,
  descripcion?: string,
  datos?: { antes?: Record<string, unknown>; despues?: Record<string, unknown> }
): Promise<void> {
  return logActivity({
    tipo: 'campana',
    accion,
    descripcion,
    entidadId: String(campanaId),
    empresaId,
    datosAntes: datos?.antes,
    datosDespues: datos?.despues
  });
}

/**
 * Log de actividad de tarea
 */
export async function logTaskActivity(
  accion: ActivityAction,
  tareaId: number,
  empresaId: number,
  contactoId?: number,
  descripcion?: string,
  datos?: { antes?: Record<string, unknown>; despues?: Record<string, unknown> }
): Promise<void> {
  return logActivity({
    tipo: 'tarea',
    accion,
    descripcion,
    entidadId: String(tareaId),
    empresaId,
    contactoId,
    datosAntes: datos?.antes,
    datosDespues: datos?.despues
  });
}

/**
 * Log de envío de email
 */
export async function logEmailSent(
  emailId: number,
  contactoId: number,
  empresaId: number,
  campanaId?: number,
  descripcion?: string
): Promise<void> {
  return logActivity({
    tipo: 'email',
    accion: 'enviar',
    descripcion: descripcion || `Email enviado a contacto #${contactoId}`,
    entidadId: String(emailId),
    contactoId,
    empresaId,
    datosDespues: { campanaId }
  });
}

/**
 * Batch logging para múltiples actividades
 */
export async function logActivityBatch(activities: ActivityLogParams[]): Promise<void> {
  if (activities.length === 0) return;

  const logEntries: ActivityLogEntry[] = activities.map(params => ({
    tipo: params.tipo,
    accion: params.accion,
    descripcion: params.descripcion,
    agente_id: params.agenteId,
    empresa_id: params.empresaId,
    contacto_id: params.contactoId,
    entidad_tipo: params.entidadTipo,
    datos_antes: params.datosAntes,
    datos_despues: params.datosDespues,
    usuario_id: params.usuarioId,
    entidad_id: params.entidadId,
    ip_origen: params.ipOrigen,
    user_agent: params.userAgent,
    tipo_valido: params.tipo
  }));

  try {
    const { error } = await supabase
      .from('wp_actividades_log')
      .insert(logEntries);

    if (error) {
      console.error('[ActivityLogger] Failed to batch insert activities:', error);
    }
  } catch (error) {
    console.error('[ActivityLogger] Error in batch logging:', error);
  }
}

/**
 * Query helper para obtener actividades recientes
 */
export async function getRecentActivities(
  empresaId: number,
  limit: number = 50,
  tipo?: ActivityType,
  contactoId?: number
): Promise<ActivityLogEntry[]> {
  try {
    let query = supabase
      .from('wp_actividades_log')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('fecha_creacion', { ascending: false })
      .limit(limit);

    if (tipo) {
      query = query.eq('tipo', tipo);
    }

    if (contactoId) {
      query = query.eq('contacto_id', contactoId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[ActivityLogger] Failed to fetch activities:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('[ActivityLogger] Error fetching activities:', error);
    return [];
  }
}

/**
 * Query helper para obtener timeline de una entidad
 */
export async function getEntityTimeline(
  entidadTipo: string,
  entidadId: string,
  limit: number = 100
): Promise<ActivityLogEntry[]> {
  try {
    const { data, error } = await supabase
      .from('wp_actividades_log')
      .select('*')
      .eq('entidad_tipo', entidadTipo)
      .eq('entidad_id', entidadId)
      .order('fecha_creacion', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[ActivityLogger] Failed to fetch entity timeline:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('[ActivityLogger] Error fetching entity timeline:', error);
    return [];
  }
}

/**
 * Wrapper para funciones con auto-logging de actividad
 */
export function withActivityLogging<T extends (...args: any[]) => Promise<any>>(
  tipo: ActivityType,
  accion: ActivityAction,
  fn: T,
  getContext?: (...args: Parameters<T>) => Partial<ActivityLogParams>
): T {
  return (async (...args: Parameters<T>) => {
    const context = getContext ? getContext(...args) : {};
    
    try {
      const result = await fn(...args);
      
      await logActivity({
        tipo,
        accion,
        ...context
      });
      
      return result;
    } catch (error) {
      await logActivity({
        tipo,
        accion: 'error',
        descripcion: `Error en ${tipo}.${accion}: ${error}`,
        ...context
      });
      throw error;
    }
  }) as T;
}
