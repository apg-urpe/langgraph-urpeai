import { supabaseAdmin as supabase } from '../supabase-admin';

export interface ObtenerServiciosConDeudaOptions {
  empresaId: number;
  contactoIds?: number[];
  limit?: number;
  excluirContactoIds?: number[];
}

/**
 * Obtiene contactos activos con teléfono para una empresa.
 */
export async function obtenerContactosParaEnvio(empresaId: number, contactoIds?: number[], limit: number = 100) {
  let query = supabase
    .from('wp_contactos')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('is_active', true)
    .not('telefono', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (contactoIds && contactoIds.length > 0) {
    query = query.in('id', contactoIds);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Error consultando contactos para envío: ${error.message}`);
  }

  return data || [];
}

/**
 * Obtiene servicios con saldo pendiente, incluyendo datos del contacto y pagos.
 * Filtra contactos que ya recibieron mensajes hoy.
 */
export async function obtenerServiciosConDeuda({ 
  empresaId, 
  contactoIds, 
  limit = 100, 
  excluirContactoIds = [] 
}: ObtenerServiciosConDeudaOptions) {        
  
  // 1. Obtener IDs de contactos que ya recibieron mensaje hoy para excluirlos
  const inicioDelDia = new Date();
  inicioDelDia.setHours(0, 0, 0, 0);

  const { data: enviosHoy } = await supabase
    .from('wp_whatsapp_template_envios')
    .select('contacto_id')
    .eq('empresa_id', empresaId)
    .eq('estado', 'sent')
    .gte('created_at', inicioDelDia.toISOString());

  // Combinar contactos enviados hoy + contactos ya procesados en batches anteriores
  const contactosEnviadosHoy = (enviosHoy || []).map(e => e.contacto_id);
  const contactosOmitidos = [...new Set([...contactosEnviadosHoy, ...excluirContactoIds])];

  // 2. Consultar servicios omitiendo esos contactos
  let query = supabase        
    .from('wp_crm_servicios') 
    .select(`
      *,
      contacto:wp_contactos!inner(*),
      pagos:wp_crm_pagos(fecha_pago, monto, estado)
    `)
    .eq('empresa_id', empresaId)
    .eq('contacto.empresa_id', empresaId)
    .gt('saldo_pendiente', 0) 
    .not('contacto.telefono', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (contactosOmitidos.length > 0) {
    query = query.not('contacto_id', 'in', `(${contactosOmitidos.join(',')})`);
  }

  if (contactoIds && contactoIds.length > 0) {
    query = query.in('contacto_id', contactoIds);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Error consultando servicios con deuda: ${error.message}`);
  }

  return data || [];
}
