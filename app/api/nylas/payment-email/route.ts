import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { verifyActiveTeamMember, createSupabaseAdmin } from '@/lib/auth-security';
import {
  PAYMENT_RECEIPT_ID_FIELD,
  PAYMENT_RECEIPT_TYPE_FIELD,
  TRANSACTIONAL_EMAIL_KIND_FIELD,
  type PaymentReceiptEmailMetadata
} from '@/lib/email-metadata';
import { buildEmailHtml, extractPlainText, type EmailSection } from '@/lib/email-template';
import { formatCurrency } from '@/types/finance';

export const dynamic = 'force-dynamic';

async function getAuthUser(request: NextRequest) {
  let response = NextResponse.next();
  const cookieSupabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return request.cookies.get(name)?.value; },
        set(name: string, value: string, options: CookieOptions) { response.cookies.set({ name, value, ...options }); },
        remove(name: string, options: CookieOptions) { response.cookies.set({ name, value: '', ...options }); },
      },
    }
  );

  const { data: { user: cookieUser }, error: cookieError } = await cookieSupabase.auth.getUser();
  if (cookieUser && !cookieError) return { user: cookieUser, error: null };

  const { data: { session }, error: sessionError } = await cookieSupabase.auth.getSession();
  if (session?.user && !sessionError) {
    return { user: session.user, error: null };
  }

  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const tokenSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data: { user: tokenUser }, error: tokenError } = await tokenSupabase.auth.getUser(token);
    if (tokenUser && !tokenError) return { user: tokenUser, error: null };
  }

  return { user: null, error: cookieError || sessionError || new Error('No valid authentication found') };
}

const supabaseAdmin = createSupabaseAdmin();

const formatLongDate = (value?: string | null) => {
  if (!value) return 'Sin fecha';

  return new Date(value).toLocaleDateString('es-PE', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
};

const sanitizeInline = (value?: string | null) => {
  return (value || '').trim();
};

export async function POST(request: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser(request);

    if (!user) {
      return NextResponse.json({ error: 'No autorizado', details: authError?.message }, { status: 401 });
    }

    const securityCheck = await verifyActiveTeamMember(supabaseAdmin, user.id, user.email);
    if (!securityCheck.success || !securityCheck.teamMember) {
      return NextResponse.json({ error: securityCheck.error?.message || 'No autorizado' }, { status: securityCheck.error?.httpStatus || 403 });
    }

    const body = await request.json();
    const paymentId = Number(body?.paymentId);

    if (!Number.isFinite(paymentId) || paymentId <= 0) {
      return NextResponse.json({ error: 'paymentId es requerido' }, { status: 400 });
    }

    const { data: payment, error: paymentError } = await supabaseAdmin
      .from('wp_crm_pagos')
      .select('id, empresa_id, servicio_id, contacto_id, monto, moneda, fecha_pago, metodo_pago, referencia, estado, nota, comprobante_url, registrado_por')
      .eq('id', paymentId)
      .single();

    if (paymentError || !payment) {
      return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 });
    }

    if (securityCheck.teamMember.role_id !== 1 && securityCheck.teamMember.empresa_id !== payment.empresa_id) {
      return NextResponse.json({ error: 'No puedes operar pagos de otra empresa' }, { status: 403 });
    }

    if (payment.estado !== 'confirmado') {
      return NextResponse.json({ error: 'Solo se puede generar email para pagos confirmados' }, { status: 400 });
    }

    const [contactRes, serviceRes, advisorRes, enterpriseRes, existingEmailsRes] = await Promise.all([
      supabaseAdmin
        .from('wp_contactos')
        .select('id, nombre, apellido, email, empresa_id')
        .eq('id', payment.contacto_id)
        .single(),
      supabaseAdmin
        .from('wp_crm_servicios')
        .select('id, nombre_servicio, estado, valor_total, saldo_pagado, saldo_pendiente, moneda')
        .eq('id', payment.servicio_id)
        .single(),
      supabaseAdmin
        .from('wp_team_humano')
        .select('id, nombre, apellido, email, grant_id')
        .eq('id', securityCheck.teamMember.id)
        .single(),
      supabaseAdmin
        .from('wp_empresa_perfil')
        .select('id, nombre')
        .eq('id', payment.empresa_id)
        .maybeSingle(),
      supabaseAdmin
        .from('wp_email_envio')
        .select('id, estado, metadata, asunto, enviado_en')
        .eq('contacto_id', payment.contacto_id)
        .filter(TRANSACTIONAL_EMAIL_KIND_FIELD, 'eq', 'transactional')
        .filter(PAYMENT_RECEIPT_TYPE_FIELD, 'eq', 'payment_receipt')
        .filter(PAYMENT_RECEIPT_ID_FIELD, 'eq', String(paymentId))
        .order('created_at', { ascending: false })
    ]);

    const contact = contactRes.data;
    const service = serviceRes.data;
    const advisor = advisorRes.data;
    const enterprise = enterpriseRes.data;
    const existingEmails = existingEmailsRes.data || [];

    if (!contact) {
      return NextResponse.json({ error: 'Contacto no encontrado' }, { status: 404 });
    }

    if (!service) {
      return NextResponse.json({ error: 'Servicio no encontrado' }, { status: 404 });
    }

    if (!contact.email) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'missing_contact_email',
        message: 'El contacto no tiene email registrado.'
      });
    }

    const existingDraft = existingEmails.find((row: any) => row.estado === 'borrador') || null;
    const existingSent = existingEmails.find((row: any) => row.estado !== 'borrador') || null;

    if (!existingDraft && existingSent) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'already_sent',
        message: 'Este pago ya tiene un email enviado.',
        draftId: existingSent.id,
        status: existingSent.estado
      });
    }

    const contactName = `${contact.nombre || ''} ${contact.apellido || ''}`.trim() || 'Contacto';
    const advisorName = `${advisor?.nombre || ''} ${advisor?.apellido || ''}`.trim() || 'Equipo';
    const enterpriseName = sanitizeInline(enterprise?.nombre) || 'Empresa';
    const serviceName = sanitizeInline(service.nombre_servicio) || 'servicio contratado';
    const formattedAmount = formatCurrency(payment.monto || 0, payment.moneda || service.moneda || 'USD');
    const formattedDate = formatLongDate(payment.fecha_pago);
    const formattedPaidBalance = formatCurrency(service.saldo_pagado || 0, service.moneda || payment.moneda || 'USD');
    const formattedPendingBalance = formatCurrency(service.saldo_pendiente || 0, service.moneda || payment.moneda || 'USD');
    const hasPendingBalance = Number(service.saldo_pendiente || 0) > 0;

    const sections: EmailSection[] = [
      {
        type: 'header',
        title: 'Pago registrado correctamente',
        subtitle: enterpriseName
      },
      {
        type: 'greeting',
        text: `Hola **${contactName}**,`
      },
      {
        type: 'paragraph',
        text: `Te compartimos la constancia de tu pago asociado a **${serviceName}**.`
      },
      {
        type: 'status_box',
        status: 'Pago confirmado',
        message: `${formattedAmount} registrado el ${formattedDate}.`,
        variant: 'success'
      },
      {
        type: 'details_box',
        title: 'Resumen del pago',
        items: [
          { label: 'Servicio', value: serviceName },
          { label: 'Monto', value: formattedAmount },
          { label: 'Fecha de pago', value: formattedDate },
          { label: 'Método de pago', value: sanitizeInline(payment.metodo_pago) || 'No especificado' },
          { label: 'Referencia', value: sanitizeInline(payment.referencia) || 'No especificada' },
          { label: 'Saldo abonado', value: formattedPaidBalance },
          { label: 'Saldo pendiente', value: formattedPendingBalance }
        ]
      }
    ];

    sections.push(
      hasPendingBalance
        ? {
            type: 'info_box',
            title: 'Saldo pendiente actualizado',
            text: `Después de este abono, tu servicio registra un saldo pendiente de **${formattedPendingBalance}**. Si necesitas apoyo para coordinar el siguiente pago, responde a este correo.`,
            variant: 'warning'
          }
        : {
            type: 'info_box',
            title: 'Registro actualizado',
            text: 'Tu pago quedó aplicado correctamente. Puedes conservar este correo como constancia de pago.',
            variant: 'info'
          }
    );

    if (sanitizeInline(payment.comprobante_url)) {
      sections.push({
        type: 'button',
        text: 'Ver comprobante',
        url: payment.comprobante_url,
        variant: 'primary'
      });
    }

    sections.push({
      type: 'closing',
      text: 'Si necesitas validar este registro o resolver alguna duda sobre tu servicio, responde a este correo y con gusto te ayudamos.',
      author: advisorName
    });

    const subject = `Confirmación de pago ${formattedAmount} · ${serviceName}`;
    const bodyHtml = buildEmailHtml({ subject, sections }, {
      contactName,
      contactEmail: contact.email,
      enterpriseName,
      advisorName,
      advisorEmail: advisor?.email || '',
      unsubscribeUrl: undefined
    });
    const bodyText = extractPlainText(sections);

    const metadata: PaymentReceiptEmailMetadata = {
      email_kind: 'transactional',
      transaction_type: 'payment_receipt',
      source_module: 'cartera',
      payment_id: payment.id,
      service_id: payment.servicio_id,
      comprobante_url: payment.comprobante_url || null,
      template_version: 'payment_receipt_v2',
      payment: {
        monto: payment.monto,
        moneda: payment.moneda,
        fecha_pago: payment.fecha_pago,
        metodo_pago: payment.metodo_pago,
        referencia: payment.referencia,
        estado: payment.estado,
        nota: payment.nota
      },
      service: {
        nombre_servicio: service.nombre_servicio,
        estado: service.estado,
        valor_total: service.valor_total,
        saldo_pagado: service.saldo_pagado,
        saldo_pendiente: service.saldo_pendiente
      }
    };

    const draftPayload: Record<string, unknown> = {
      asunto: subject,
      cuerpo_html: bodyHtml,
      cuerpo_texto: bodyText,
      metadata,
      remitente_team_humano: securityCheck.teamMember.id
    };

    let draftId: number | null = null;
    let action: 'created' | 'updated' = 'created';

    if (existingDraft) {
      draftId = existingDraft.id;
      action = 'updated';

      const { error: updateError } = await supabaseAdmin
        .from('wp_email_envio')
        .update(draftPayload)
        .eq('id', existingDraft.id)
        .eq('estado', 'borrador');

      if (updateError) {
        return NextResponse.json({ error: 'No se pudo actualizar el borrador de email' }, { status: 500 });
      }
    } else {
      const { data: insertedDraft, error: insertError } = await supabaseAdmin
        .from('wp_email_envio')
        .insert({
          contacto_id: payment.contacto_id,
          secuencia: 1,
          estado: 'borrador',
          asunto: subject,
          cuerpo_html: bodyHtml,
          cuerpo_texto: bodyText,
          campana_id: null,
          remitente_team_humano: securityCheck.teamMember.id,
          metadata
        })
        .select('id')
        .single();

      if (insertError || !insertedDraft) {
        return NextResponse.json({ error: 'No se pudo crear el borrador de email' }, { status: 500 });
      }

      draftId = insertedDraft.id;
    }

    return NextResponse.json({
      success: true,
      skipped: false,
      action,
      draftId,
      payment: {
        id: payment.id,
        estado: payment.estado,
        monto: payment.monto,
        moneda: payment.moneda,
        fecha_pago: payment.fecha_pago,
        metodo_pago: payment.metodo_pago,
        referencia: payment.referencia,
        comprobante_url: payment.comprobante_url || null
      },
      contact: {
        id: contact.id,
        nombre: contact.nombre,
        apellido: contact.apellido,
        email: contact.email
      },
      advisor: {
        id: advisor?.id || securityCheck.teamMember.id,
        nombre: advisor?.nombre || securityCheck.teamMember.nombre,
        apellido: advisor?.apellido || securityCheck.teamMember.apellido,
        email: advisor?.email || securityCheck.teamMember.email,
        hasGrant: !!advisor?.grant_id
      },
      draft: {
        subject,
        bodyHtml,
        bodyText
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: 'Error interno del servidor', details: error.message }, { status: 500 });
  }
}
