import * as carteraService from './cartera-service';
import * as templateService from '../whatsapp/template-service';
import { supabaseAdmin as supabase } from '../supabase-admin';
import { EnvioResult } from '../../types/whatsapp-templates';

export interface EnvioCarteraOptions {
  empresaId: number;
  numeroId: number;
  templateId?: number;
  templateName?: string;
  languageCode?: string;
  contactoIds?: number[];
  payload?: any;
  limit?: number;
  enviadoPor?: number;
  excluirContactoIds?: number[];
  ignorarRegla20Dias?: boolean;
}

/**
 * Ejecuta el flujo completo de envío de cartera para una empresa.
 */
export async function ejecutarEnvioCartera(options: EnvioCarteraOptions) {
  const {
    empresaId,
    numeroId,
    templateId,
    templateName,
    languageCode = 'es',
    contactoIds,
    payload = {},
    limit = 100,
    enviadoPor,
    excluirContactoIds = [],
    ignorarRegla20Dias = false,
  } = options;

  if (!empresaId || !numeroId) {
    throw new Error('empresaId y numeroId son requeridos');
  }

  // 1. Obtener datos del número de WhatsApp
  const { data: numero, error: numError } = await supabase
    .from('wp_numeros')
    .select('*')
    .eq('id', numeroId)
    .single();

  if (numError || !numero) {
    throw new Error(`No se encontró el número id=${numeroId}: ${numError?.message}`);
  }

  // 2. Obtener deudores calificados
  const { deudores, totalAnalizados } = await carteraService.obtenerRegistrosParaEnvio({
    empresaId,
    contactoIds,
    limit,
    excluirContactoIds,
  });

  console.log(`[Cartera Workflow] Analizando ${deudores.length} deudores (de ${totalAnalizados} analizados)`);

  let exitosos = 0;
  let fallidos = 0;
  let omitidos = 0;
  const resultados: any[] = [];

  for (const deudor of deudores) {
    try {
      // 3. Regla: Límite de 1 mensaje de cartera por día
      const { data: envioHoy } = await supabase
        .from('wp_whatsapp_template_envios')
        .select('id')
        .eq('empresa_id', empresaId)
        .eq('contacto_id', deudor.contacto_id)
        .eq('estado', 'sent')
        .like('clasificacion_interna', 'cartera_%')
        .gte('created_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString())
        .limit(1);

      if (envioHoy && envioHoy.length > 0) {
        omitidos++;
        continue;
      }

      // 4. Resolver Plantilla
      let template: any = null;
      if (templateId) {
        const { data } = await supabase.from('wp_whatsapp_templates').select('*').eq('id', templateId).single();
        template = data;
      } else if (templateName) {
        template = await templateService.obtenerTemplateActivaPorClasificacion(empresaId, numeroId, templateName);
      } else {
        template = await templateService.obtenerTemplateActivaPorClasificacion(
          empresaId, 
          numeroId, 
          deudor.cartera.clasificacion_interna
        );
      }

      if (!template) {
        omitidos++;
        continue;
      }

      // 5. Regla de los 20 días
      if (!ignorarRegla20Dias) {
        const fechaCorte = new Date();
        fechaCorte.setDate(fechaCorte.getDate() - 20);

        const { data: envioReciente } = await supabase
          .from('wp_whatsapp_template_envios')
          .select('id')
          .eq('empresa_id', empresaId)
          .eq('contacto_id', deudor.contacto_id)
          .eq('template_id', template.id)
          .eq('estado', 'sent')
          .gt('created_at', fechaCorte.toISOString())
          .limit(1);

        if (envioReciente && envioReciente.length > 0) {
          omitidos++;
          continue;
        }
      }

      // 6. Mapear y Enviar
      const { components, renderedBody } = templateService.construirComponentesEnvio(
        template, 
        { ...payload, ...deudor.cartera }, 
        deudor
      );

      const response = await templateService.enviarMensajePlantilla(
        deudor.telefono,
        template.template_name,
        template.language_code || languageCode,
        components,
        numero.id_kapso || template.provider_phone_id
      );

      // 7. Registrar Auditoría
      await templateService.registrarEnvio({
        empresa_id: empresaId,
        numero_id: numeroId,
        template_id: template.id,
        contacto_id: deudor.contacto_id,
        mensaje_body: renderedBody,
        estado: 'sent',
        metadata: {
          kapso_response: response,
          cartera: deudor.cartera
        }
      });

      exitosos++;
      resultados.push({ contacto_id: deudor.contacto_id, estado: 'sent' });
    } catch (error: any) {
      console.error(`[Cartera Workflow] Error con contacto ${deudor.contacto_id}:`, error.message);
      fallidos++;
      resultados.push({ contacto_id: deudor.contacto_id, estado: 'failed', error: error.message });
    }
  }

  return {
    exitosos,
    fallidos,
    omitidos,
    total: exitosos + fallidos + omitidos,
    resultados
  };
}
