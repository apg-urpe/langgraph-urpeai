/**
 * Portfolio Summary API
 * 
 * POST: Returns a lightweight portfolio summary for a batch of contact IDs.
 * Used by the Cartera list view to show collection signals per row.
 * 
 * Body: { contactIds: number[], empresaId: number }
 * Response: { summaries: Record<number, PortfolioContactSummary> }
 * 
 * @module app/api/contacts/portfolio-summary/route
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { verifyActiveTeamMember, createSupabaseAdmin } from '@/lib/auth-security';
import { getServiceCommitmentInfo, type Payment, type PaymentBehavior } from '@/types/finance';

const BEHAVIOR_SEVERITY: Record<PaymentBehavior, number> = {
  'activo': 0,
  'irregular': 1,
  'inactivo': 2,
  'sin_pagos': 3,
};

export interface PortfolioContactSummary {
  contactoId: number;
  /** Total pending balance across all active services */
  saldoPendiente: number;
  /** Primary currency */
  moneda: string;
  /** Max days overdue across services (negative = days until due) */
  maxDiasMora: number;
  /** Commitment day of the most urgent service */
  diaCompromiso: number | null;
  /** Number of active services with pending balance */
  serviciosActivos: number;
  /** Worst status across services */
  peorEstado: 'pagado' | 'al_dia' | 'sin_configurar' | 'vence_hoy' | 'en_mora';
  /** Max unpaid cycles across services */
  maxCiclosImpagos: number;
  /** Worst payment behavior across services */
  peorComportamiento: PaymentBehavior;
}

const MAX_BATCH = 200;

async function getAuthUser(req: NextRequest) {
  const response = NextResponse.next();
  const cookieSupabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return req.cookies.get(name)?.value; },
        set(name: string, value: string, options: CookieOptions) { response.cookies.set({ name, value, ...options }); },
        remove(name: string, options: CookieOptions) { response.cookies.set({ name, value: '', ...options }); },
      },
    }
  );

  const { data: { user: cookieUser }, error: cookieError } = await cookieSupabase.auth.getUser();
  if (cookieUser && !cookieError) return { user: cookieUser, error: null };

  const authHeader = req.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const tokenSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data: { user: tokenUser }, error: tokenError } = await tokenSupabase.auth.getUser(authHeader.substring(7));
    if (tokenUser && !tokenError) return { user: tokenUser, error: null };
  }

  return { user: null, error: cookieError };
}

export async function POST(req: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser(req);
    if (authError || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const supabaseAdmin = createSupabaseAdmin();
    const securityCheck = await verifyActiveTeamMember(supabaseAdmin, user.id, user.email);
    if (!securityCheck.success || !securityCheck.teamMember) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
    }

    // Parse body
    const body = await req.json();
    const contactIds: number[] = body.contactIds;
    if (!Array.isArray(contactIds) || contactIds.length === 0) {
      return NextResponse.json({ summaries: {} });
    }

    const ids = contactIds.slice(0, MAX_BATCH);

    // Fetch all active/pending services for the batch in one query
    const { data: services, error: svcError } = await supabaseAdmin
      .from('wp_crm_servicios')
      .select('id, contacto_id, saldo_pendiente, saldo_pagado, valor_total, moneda, dia_compromiso_pago, estado, cuota_mensual, fecha_inicio')
      .in('contacto_id', ids)
      .in('estado', ['activo', 'pendiente_pago']);

    if (svcError) {
      console.error('[PortfolioSummary] Error fetching services:', svcError);
      return NextResponse.json({ error: 'Error al consultar servicios' }, { status: 500 });
    }

    const serviceIds = (services || []).map((svc) => svc.id).filter(Boolean);
    const paymentsByService = new Map<number, Pick<Payment, 'estado' | 'fecha_pago'>[]>();

    if (serviceIds.length > 0) {
      const { data: payments, error: paymentsError } = await supabaseAdmin
        .from('wp_crm_pagos')
        .select('servicio_id, estado, fecha_pago')
        .in('servicio_id', serviceIds);

      if (paymentsError) {
        console.error('[PortfolioSummary] Error fetching payments:', paymentsError);
        return NextResponse.json({ error: 'Error al consultar pagos' }, { status: 500 });
      }

      for (const payment of (payments || []) as (Pick<Payment, 'estado' | 'fecha_pago'> & { servicio_id: number })[]) {
        const current = paymentsByService.get(payment.servicio_id) || [];
        current.push({ estado: payment.estado, fecha_pago: payment.fecha_pago });
        paymentsByService.set(payment.servicio_id, current);
      }
    }

    const summariesMap: Record<number, PortfolioContactSummary> = {};

    const STATUS_SEVERITY: Record<string, number> = {
      'pagado': 0,
      'al_dia': 1,
      'sin_configurar': 2,
      'vence_hoy': 3,
      'en_mora': 4,
    };

    for (const svc of (services || [])) {
      const cid = svc.contacto_id;
      const pending = Math.max(0, Number(svc.saldo_pendiente || 0));
      const commitDay = svc.dia_compromiso_pago ?? null;
      const commitmentInfo = getServiceCommitmentInfo({
        dia_compromiso_pago: commitDay,
        cuota_mensual: svc.cuota_mensual ?? null,
        saldo_pendiente: svc.saldo_pendiente ?? 0,
        saldo_pagado: svc.saldo_pagado ?? 0,
        fecha_inicio: svc.fecha_inicio,
        pagos: paymentsByService.get(svc.id) || [],
      });
      const status = commitmentInfo.status;
      const daysOverdue = commitmentInfo.daysOverdue;

      if (!summariesMap[cid]) {
        summariesMap[cid] = {
          contactoId: cid,
          saldoPendiente: 0,
          moneda: svc.moneda || 'USD',
          maxDiasMora: 0,
          diaCompromiso: null,
          serviciosActivos: 0,
          peorEstado: 'pagado',
          maxCiclosImpagos: 0,
          peorComportamiento: 'activo',
        };
      }

      const s = summariesMap[cid];
      s.saldoPendiente += pending;
      s.serviciosActivos += 1;

      if (daysOverdue > s.maxDiasMora) {
        s.maxDiasMora = daysOverdue;
        s.diaCompromiso = commitDay;
      } else if (s.diaCompromiso === null && commitDay) {
        s.diaCompromiso = commitDay;
      }

      if ((STATUS_SEVERITY[status] || 0) > (STATUS_SEVERITY[s.peorEstado] || 0)) {
        s.peorEstado = status;
      }

      if (commitmentInfo.ciclosImpagos > s.maxCiclosImpagos) {
        s.maxCiclosImpagos = commitmentInfo.ciclosImpagos;
      }

      if ((BEHAVIOR_SEVERITY[commitmentInfo.paymentBehavior] || 0) > (BEHAVIOR_SEVERITY[s.peorComportamiento] || 0)) {
        s.peorComportamiento = commitmentInfo.paymentBehavior;
      }
    }

    return NextResponse.json({ summaries: summariesMap });

  } catch (err: any) {
    console.error('[PortfolioSummary] Unexpected error:', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
