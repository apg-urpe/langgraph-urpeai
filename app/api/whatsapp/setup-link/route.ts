import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createCustomer, createSetupLink, findCustomerByExternalId } from '../../../../lib/kapso-platform';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { empresa_id } = await req.json();

    if (!empresa_id) {
      return NextResponse.json({ error: 'empresa_id es requerido' }, { status: 400 });
    }

    // 1. Get enterprise profile
    const { data: profile, error: profileError } = await supabase
      .from('wp_empresa_perfil')
      .select('id, nombre, metadata')
      .eq('id', empresa_id)
      .single();

    if (profileError || !profile) {
      console.error('[Kapso Setup] Empresa no encontrada:', profileError);
      return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 });
    }

    const metadata = (profile.metadata as Record<string, unknown>) || {};
    let kapsoCustomerId = metadata.kapso_customer_id as string | undefined;

    // 2. Get or create Kapso customer
    if (!kapsoCustomerId) {
      try {
        // First try to find existing customer (may have been created before but ID not saved)
        let customer = await findCustomerByExternalId(String(empresa_id));

        if (!customer) {
          customer = await createCustomer(
            profile.nombre || `Empresa ${empresa_id}`,
            String(empresa_id)
          );
        }

        kapsoCustomerId = customer.id;

        // Save customer ID in enterprise metadata
        const updatedMetadata = { ...metadata, kapso_customer_id: kapsoCustomerId };
        const { error: updateError } = await supabase
          .from('wp_empresa_perfil')
          .update({ metadata: updatedMetadata })
          .eq('id', empresa_id);

        if (updateError) {
          console.error('[Kapso Setup] Error guardando kapso_customer_id:', updateError);
        }
      } catch (err: any) {
        console.error('[Kapso Setup] Error creando customer en Kapso:', err);
        return NextResponse.json(
          { error: 'Error creando customer en Kapso', details: err.message },
          { status: 502 }
        );
      }
    }

    // 3. Build callback URLs
    const host = req.headers.get('host') || 'localhost:3000';
    const protocol = host.startsWith('localhost') ? 'http' : 'https';
    const baseUrl = `${protocol}://${host}`;

    const successUrl = `${baseUrl}/kapso/setup-callback?empresa_id=${empresa_id}`;
    const failureUrl = `${baseUrl}/kapso/setup-callback?empresa_id=${empresa_id}&failed=1`;

    // 4. Generate setup link
    try {
      const setupLink = await createSetupLink(kapsoCustomerId, successUrl, failureUrl);
      return NextResponse.json({ url: setupLink.url });
    } catch (err: any) {
      console.error('[Kapso Setup] Error generando setup link:', err);
      return NextResponse.json(
        { error: 'Error generando setup link', details: err.message },
        { status: 502 }
      );
    }
  } catch (err: any) {
    console.error('[Kapso Setup] Error general:', err);
    return NextResponse.json({ error: 'Error procesando solicitud' }, { status: 500 });
  }
}
