import { NextRequest, NextResponse } from 'next/server';
import { WhatsAppClient } from '@kapso/whatsapp-cloud-api';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const KAPSO_API_KEY = process.env.KAPSO_API_KEY || '';

const getKapsoClient = () =>
  new WhatsAppClient({
    baseUrl: process.env.KAPSO_API_BASE_URL || 'https://api.kapso.ai/meta/whatsapp',
    kapsoApiKey: KAPSO_API_KEY
  });

// ── POST: Create a new WhatsApp template ──
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      numero_id,
      empresa_id,
      template_name,
      language_code,
      meta_category,
      clasificacion_interna,
      components,
      submit_to_meta
    } = body;

    if (!numero_id || !empresa_id || !template_name || !language_code || !meta_category || !components) {
      return NextResponse.json(
        { error: 'Campos requeridos: numero_id, empresa_id, template_name, language_code, meta_category, components' },
        { status: 400 }
      );
    }

    // Validate template_name format (Meta requires lowercase, underscores, no spaces)
    if (!/^[a-z][a-z0-9_]*$/.test(template_name)) {
      return NextResponse.json(
        { error: 'El nombre debe ser minúsculas, sin espacios (usar guiones bajos). Ej: mi_plantilla_1' },
        { status: 400 }
      );
    }

    // Get phone number's Kapso ID and business_account_id
    const { data: numero, error: numError } = await supabase
      .from('wp_numeros')
      .select('id_kapso')
      .eq('id', numero_id)
      .single();

    if (numError || !numero?.id_kapso) {
      return NextResponse.json(
        { error: 'Número no encontrado o no vinculado a Kapso' },
        { status: 404 }
      );
    }

    // Determine initial status
    const status = submit_to_meta ? 'pending' : 'draft';
    const resolvedCategory = meta_category || 'utility';

    // Extract header type from components
    const headerComponent = components.find((c: any) => c.type === 'HEADER');
    const headerType = headerComponent?.format || null;

    // If submitting to Meta via Kapso, use the SDK
    let providerTemplateId: string | null = null;
    let businessAccountId: string | null = null;

    if (submit_to_meta && KAPSO_API_KEY) {
      try {
        const client = getKapsoClient();
        // Kapso proxy resolves id_kapso (phone number ID) to the correct WABA internally
        const kapsoResult = await client.templates.create({
          businessAccountId: numero.id_kapso,
          name: template_name,
          category: resolvedCategory.toUpperCase(),
          language: language_code,
          components
        });

        providerTemplateId = (kapsoResult as any).id || null;
        businessAccountId = (kapsoResult as any).business_account_id || null;
      } catch (kapsoErr: any) {
        console.error('[WhatsApp Templates API] Kapso SDK error:', kapsoErr);
        const errorMessage = kapsoErr?.message || 'Error de conexión con Kapso';
        const statusCode = kapsoErr?.statusCode || 502;
        return NextResponse.json(
          { error: 'Error al crear plantilla en Meta/Kapso', details: errorMessage },
          { status: statusCode }
        );
      }
    }

    // Insert into Supabase
    const categoryPayloadVariants: Array<Record<string, string>> = [
      { meta_category: resolvedCategory },
      { category: resolvedCategory },
      { meta_category: resolvedCategory, category: resolvedCategory }
    ];

    let template: any = null;
    let insertError: any = null;

    for (const categoryPayload of categoryPayloadVariants) {
      const result = await supabase
        .from('wp_whatsapp_templates')
        .insert({
          empresa_id,
          numero_id,
          provider: 'kapso',
          provider_phone_id: numero.id_kapso,
          provider_template_id: providerTemplateId,
          business_account_id: businessAccountId,
          template_name,
          language_code,
          ...categoryPayload,
          clasificacion_interna: clasificacion_interna || null,
          status,
          is_active: true,
          header_type: headerType,
          components,
          variables_schema: [],
          example_payload: {},
          metadata: {}
        })
        .select('id, template_name, status')
        .single();

      template = result.data;
      insertError = result.error;

      if (!insertError) {
        break;
      }

      const insertMessage = typeof insertError?.message === 'string'
        ? insertError.message.toLowerCase()
        : '';

      const shouldRetryWithAnotherCategoryShape =
        insertMessage.includes('meta_category') ||
        insertMessage.includes('column "category" of relation "wp_whatsapp_templates" violates not-null constraint') ||
        insertMessage.includes('column "meta_category" of relation "wp_whatsapp_templates" violates not-null constraint') ||
        insertMessage.includes("could not find the 'category' column") ||
        insertMessage.includes("could not find the 'meta_category' column");

      if (!shouldRetryWithAnotherCategoryShape) {
        break;
      }

      console.warn('[WhatsApp Templates API] Retrying insert with alternate category field', {
        categoryPayloadKeys: Object.keys(categoryPayload),
        error: insertError.message
      });
    }

    if (insertError) {
      console.error('[WhatsApp Templates API] Insert error:', insertError);

      if (insertError.code === '23505') {
        return NextResponse.json(
          { error: 'Ya existe una plantilla con ese nombre e idioma para este número' },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: 'Error al guardar plantilla', details: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, template }, { status: 201 });
  } catch (err: any) {
    console.error('[WhatsApp Templates API] Error general:', err);
    return NextResponse.json({ error: 'Error procesando solicitud' }, { status: 500 });
  }
}

// ── PUT: Update an existing template ──
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { template_id, ...updates } = body;

    if (!template_id) {
      return NextResponse.json({ error: 'template_id es requerido' }, { status: 400 });
    }

    // Verify template exists and is editable
    const { data: existing, error: fetchError } = await supabase
      .from('wp_whatsapp_templates')
      .select('id, status, provider_phone_id')
      .eq('id', template_id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Plantilla no encontrada' }, { status: 404 });
    }

    if (!['draft', 'rejected'].includes(existing.status)) {
      return NextResponse.json(
        { error: 'Solo se pueden editar plantillas en estado borrador o rechazadas' },
        { status: 400 }
      );
    }

    // Build update payload
    const baseUpdateData: Record<string, any> = { updated_at: new Date().toISOString() };
    const resolvedUpdateCategory = updates.meta_category || 'utility';

    if (updates.template_name) baseUpdateData.template_name = updates.template_name;
    if (updates.language_code) baseUpdateData.language_code = updates.language_code;
    if (updates.clasificacion_interna !== undefined) baseUpdateData.clasificacion_interna = updates.clasificacion_interna;
    if (updates.components) {
      baseUpdateData.components = updates.components;
      const headerComp = updates.components.find((c: any) => c.type === 'HEADER');
      baseUpdateData.header_type = headerComp?.format || null;
    }
    if (typeof updates.is_active === 'boolean') baseUpdateData.is_active = updates.is_active;

    // If re-submitting to Meta via Kapso SDK
    if (updates.submit_to_meta && KAPSO_API_KEY && existing.provider_phone_id) {
      baseUpdateData.status = 'pending';

      try {
        const client = getKapsoClient();
        await client.templates.create({
          businessAccountId: existing.provider_phone_id,
          name: updates.template_name || '',
          category: resolvedUpdateCategory.toUpperCase(),
          language: updates.language_code || '',
          components: updates.components || []
        });
      } catch (kapsoErr: any) {
        console.error('[WhatsApp Templates API] Kapso SDK error (PUT):', kapsoErr);
        return NextResponse.json(
          { error: 'Error al actualizar plantilla en Meta/Kapso', details: kapsoErr?.message },
          { status: kapsoErr?.statusCode || 502 }
        );
      }
    }

    let updated: any = null;
    let updateError: any = null;
    const categoryUpdateVariants: Array<Record<string, string>> = updates.meta_category
      ? [
          { meta_category: resolvedUpdateCategory },
          { category: resolvedUpdateCategory },
          { meta_category: resolvedUpdateCategory, category: resolvedUpdateCategory }
        ]
      : [{}];

    for (const categoryUpdate of categoryUpdateVariants) {
      const result = await supabase
        .from('wp_whatsapp_templates')
        .update({
          ...baseUpdateData,
          ...categoryUpdate
        })
        .eq('id', template_id)
        .select('id, template_name, status')
        .single();

      updated = result.data;
      updateError = result.error;

      if (!updateError) {
        break;
      }

      const updateMessage = typeof updateError?.message === 'string'
        ? updateError.message.toLowerCase()
        : '';

      const shouldRetryWithAnotherCategoryShape =
        updateMessage.includes('meta_category') ||
        updateMessage.includes('column "category" of relation "wp_whatsapp_templates" violates not-null constraint') ||
        updateMessage.includes('column "meta_category" of relation "wp_whatsapp_templates" violates not-null constraint') ||
        updateMessage.includes("could not find the 'category' column") ||
        updateMessage.includes("could not find the 'meta_category' column");

      if (!shouldRetryWithAnotherCategoryShape) {
        break;
      }

      console.warn('[WhatsApp Templates API] Retrying update with alternate category field', {
        categoryPayloadKeys: Object.keys(categoryUpdate),
        error: updateError.message
      });
    }

    if (updateError) {
      return NextResponse.json(
        { error: 'Error al actualizar plantilla', details: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, template: updated });
  } catch (err: any) {
    console.error('[WhatsApp Templates API] Error general PUT:', err);
    return NextResponse.json({ error: 'Error procesando solicitud' }, { status: 500 });
  }
}

// ── DELETE: Remove a template ──
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const templateId = searchParams.get('template_id');

    if (!templateId) {
      return NextResponse.json({ error: 'template_id es requerido' }, { status: 400 });
    }

    // Look up template to delete from Meta/Kapso if it was submitted
    const { data: existing } = await supabase
      .from('wp_whatsapp_templates')
      .select('template_name, provider_phone_id, provider_template_id')
      .eq('id', Number(templateId))
      .single();

    if (existing?.provider_template_id && existing.provider_phone_id && KAPSO_API_KEY) {
      try {
        const client = getKapsoClient();
        await client.templates.delete({
          businessAccountId: existing.provider_phone_id,
          name: existing.template_name
        });
      } catch (kapsoErr: any) {
        console.error('[WhatsApp Templates API] Kapso SDK delete error (non-blocking):', kapsoErr);
        // Non-blocking: still delete locally even if Meta delete fails
      }
    }

    const { error } = await supabase
      .from('wp_whatsapp_templates')
      .delete()
      .eq('id', Number(templateId));

    if (error) {
      return NextResponse.json(
        { error: 'Error al eliminar plantilla', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[WhatsApp Templates API] Error general DELETE:', err);
    return NextResponse.json({ error: 'Error procesando solicitud' }, { status: 500 });
  }
}

