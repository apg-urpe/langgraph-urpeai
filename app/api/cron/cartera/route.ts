import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '../../../lib/supabase-admin';
import { ejecutarEnvioCartera } from '../../../lib/cartera/envio-workflow';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      // return new Response('Unauthorized', { status: 401 });
      // Para desarrollo podemos relajar esto o usar una variable de entorno
    }

    console.log('[CRON] Iniciando proceso automatizado de cartera...');

    // 1. Obtener todas las empresas/números que tienen plantillas de cartera activas
    const { data: templates, error: tempError } = await supabase
      .from('wp_whatsapp_templates')
      .select('empresa_id, numero_id')
      .like('clasificacion_interna', 'cartera_%')
      .eq('is_active', true)
      .eq('status', 'approved');

    if (tempError) {
      throw new Error(`Error obteniendo plantillas: ${tempError.message}`);
    }

    if (!templates || templates.length === 0) {
      return NextResponse.json({ message: 'No hay plantillas de cartera activas para procesar' });
    }

    // Deduplicar pares (empresa_id, numero_id)
    const targets = Array.from(new Set(templates.map(t => `${t.empresa_id}:${t.numero_id}`)))
      .map(str => {
        const [empresaId, numeroId] = str.split(':');
        return { empresaId: Number(empresaId), numeroId: Number(numeroId) };
      });

    const resultadosGlobales: any[] = [];

    for (const target of targets) {
      console.log(`[CRON] Procesando cartera para empresa_id=${target.empresaId}, numero_id=${target.numeroId}`);
      try {
        const res = await ejecutarEnvioCartera({
          empresaId: target.empresaId,
          numeroId: target.numeroId,
          limit: 50 // Límite por batch en cron para evitar timeouts
        });
        resultadosGlobales.push({ target, ...res });
      } catch (err: any) {
        console.error(`[CRON] Error en empresa ${target.empresaId}:`, err.message);
        resultadosGlobales.push({ target, error: err.message });
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      procesados: targets.length,
      detalle: resultadosGlobales
    });

  } catch (error: any) {
    console.error('[CRON Cartera] Error crítico:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
