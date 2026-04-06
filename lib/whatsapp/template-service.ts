import { supabaseAdmin as supabase } from '../supabase-admin';
import { WhatsAppConnection, WhatsAppTemplate } from '../../types/whatsapp-templates';

const KAPSO_BASE_URL = 'https://api.kapso.ai';

function getKapsoHeaders() {
  const apiKey = process.env.KAPSO_API_KEY;
  if (!apiKey) throw new Error('KAPSO_API_KEY no está configurado');
  return {
    'X-API-Key': apiKey,
    'Content-Type': 'application/json',
  };
}

/**
 * Obtiene el valor dinámico para una variable de plantilla {{index}}.
 */
function obtenerValorDinamico(index: number, payload: any = {}, contacto: any = {}) {
  const metadata = contacto.metadata && typeof contacto.metadata === 'object' ? contacto.metadata : {};
  const cartera = contacto.cartera && typeof contacto.cartera === 'object' ? contacto.cartera : {};
  
  const candidates: any[] = [
    payload[`var_${index}`],
    payload[index],
    payload[String(index)],
    metadata[`var_${index}`],
    metadata[index],
    cartera[`var_${index}`],
    cartera[index],
  ];

  if (index === 1) candidates.push(contacto.nombre);
  if (index === 2) candidates.push(contacto.apellido);
  if (index === 3) candidates.push(contacto.telefono);

  if (cartera.servicio_id) {
    if (index === 4) candidates.push(cartera.saldo_pendiente);
    if (index === 5) candidates.push(cartera.dias_mora);
    if (index === 6) candidates.push(cartera.nombre_servicio);
    if (index === 7) candidates.push(cartera.vencimiento);
  }

  const resolved = candidates.find((value) => value !== undefined && value !== null && value !== '');
  return resolved === undefined ? '' : String(resolved);
}

/**
 * Resuelve los parámetros de una plantilla basados en el texto original y los datos.
 */
function construirParametrosDesdeTexto(text: string, payload: any, contacto: any) {
  const matches = Array.from((text || '').matchAll(/{{(\d+)}}/g));

  return matches.map((match) => {
    const index = Number(match[1]);
    return {
      index,
      value: obtenerValorDinamico(index, payload, contacto),
    };
  });
}

/**
 * Renderiza el texto localmente para auditoría.
 */
function renderizarTexto(text: string, parametros: any[] = []) {
  let rendered = text || '';
  for (const parametro of parametros) {
    rendered = rendered.replaceAll(`{{${parametro.index}}}`, parametro.value);
  }
  return rendered;
}

/**
 * Construye la estructura de componentes requerida por Meta API.
 */
export function construirComponentesEnvio(template: any, payload: any, contacto: any) {
  const sourceComponents = Array.isArray(template.components) ? template.components : [];
  const components: any[] = [];
  const parametrosResueltos: any[] = [];
  let renderedBody: string | null = null;

  for (const component of sourceComponents) {
    const normalizedType = typeof component.type === 'string' ? component.type.toLowerCase() : null;
    if (!normalizedType) continue;

    if (normalizedType === 'buttons') {
      // Por ahora pasamos los botones si existen
      continue;
    }

    if (!component.text) continue;

    const parametros = construirParametrosDesdeTexto(component.text, payload, contacto);

    if (parametros.length === 0) {
      if (normalizedType === 'body') renderedBody = component.text;
      continue;
    }

    parametrosResueltos.push(
      ...parametros.map((parametro) => ({
        component: normalizedType,
        index: parametro.index,
        value: parametro.value,
      }))
    );

    components.push({
      type: normalizedType,
      parameters: parametros.map((parametro) => ({
        type: 'text',
        text: parametro.value,
      })),
    });

    if (normalizedType === 'body') {
      renderedBody = renderizarTexto(component.text, parametros);
    }
  }

  return {
    components,
    parametrosResueltos,
    renderedBody,
  };
}

/**
 * Envía un mensaje de plantilla a través de Kapso.
 */
export async function enviarMensajePlantilla(
  to: string, 
  templateName: string, 
  languageCode: string, 
  components: any[], 
  phoneNumberId: string
) {
  const url = `${KAPSO_BASE_URL}/meta/whatsapp/v24.0/${phoneNumberId}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    to: to.replace(/\D/g, ''),
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      components,
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: getKapsoHeaders() as any,
    body: JSON.stringify(payload),
  });

  const body = await response.json();

  if (!response.ok) {
    console.error(`[WhatsApp Service] Error enviando plantilla a ${to}:`, body);
    throw new Error(`Error Kapso: ${response.status}`);
  }

  return body;
}

/**
 * Obtiene la plantilla activa asociada a una clasificación de cartera.
 */
export async function obtenerTemplateActivaPorClasificacion(empresaId: number, numeroId: number, clasificacion: string) {
  const { data, error } = await supabase
    .from('wp_whatsapp_templates')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('numero_id', numeroId)
    .eq('clasificacion_interna', clasificacion)
    .eq('is_active', true)
    .eq('status', 'approved')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Error obteniendo plantilla activa por clasificación: ${error.message}`);
  }

  return data;
}

/**
 * Registra el resultado de un envío en la tabla de auditoría.
 */
export async function registrarEnvio(envio: {
  empresa_id: number;
  contacto_id: number;
  numero_id: number;
  template_id: number;
  mensaje_body: string | null;
  estado: 'sent' | 'failed';
  error_detalle?: string;
  metadata?: any;
}) {
  const { data, error } = await supabase
    .from('wp_whatsapp_template_envios')
    .insert([envio]);

  if (error) {
    console.error('[WhatsApp Service] Error registrando envío:', error);
  }

  return data;
}
