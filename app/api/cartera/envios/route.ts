import { NextRequest, NextResponse } from 'next/server';
import { ejecutarEnvioCartera } from '../../../lib/cartera/envio-workflow';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { 
      empresa_id, 
      numero_id, 
      template_id, 
      template_name, 
      contacto_ids, 
      payload, 
      limit,
      ignorar_regla_20_dias 
    } = body;

    if (!empresa_id || !numero_id) {
      return NextResponse.json({ error: 'empresa_id y numero_id son requeridos' }, { status: 400 });
    }

    const resultado = await ejecutarEnvioCartera({
      empresaId: Number(empresa_id),
      numeroId: Number(numero_id),
      templateId: template_id ? Number(template_id) : undefined,
      templateName: template_name,
      contactoIds: contacto_ids,
      payload,
      limit: limit ? Number(limit) : 100,
      ignorarRegla20Dias: !!ignorar_regla_20_dias
    });

    return NextResponse.json(resultado);

  } catch (error: any) {
    console.error('[Cartera API] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
