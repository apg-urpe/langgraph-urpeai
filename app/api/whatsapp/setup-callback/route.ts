import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { empresa_id, phone_number_id, business_account_id, display_phone_number } =
      await req.json();

    if (!empresa_id || !phone_number_id || !display_phone_number) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos (empresa_id, phone_number_id, display_phone_number)' },
        { status: 400 }
      );
    }

    // Check for duplicate
    const { data: existing } = await supabase
      .from('wp_numeros')
      .select('id')
      .eq('id_kapso', phone_number_id)
      .eq('empresa_id', empresa_id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({
        success: true,
        duplicate: true,
        phone_number: existing,
        message: 'Este número ya está registrado',
      });
    }

    // Insert new phone number
    const { data: inserted, error: insertError } = await supabase
      .from('wp_numeros')
      .insert({
        telefono: decodeURIComponent(display_phone_number),
        nombre: `WhatsApp ${decodeURIComponent(display_phone_number)}`,
        activo: true,
        empresa_id,
        canal: 'whatsapp',
        id_kapso: phone_number_id,
      })
      .select('id, telefono, nombre, activo, empresa_id, canal, id_kapso, created_at, updated_at')
      .single();

    if (insertError) {
      console.error('[Kapso Callback] Error insertando número:', insertError);
      return NextResponse.json(
        { error: 'Error guardando número', details: insertError.message },
        { status: 500 }
      );
    }

    console.log('[Kapso Callback] Número guardado:', inserted?.id, display_phone_number);

    return NextResponse.json({ success: true, phone_number: inserted });
  } catch (err: any) {
    console.error('[Kapso Callback] Error general:', err);
    return NextResponse.json({ error: 'Error procesando solicitud' }, { status: 500 });
  }
}
