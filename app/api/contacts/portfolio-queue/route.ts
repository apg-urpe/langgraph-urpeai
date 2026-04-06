import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseAdmin, getEffectiveEnterpriseId, isDevTeamRole, verifyActiveTeamMember } from '@/lib/auth-security';
import { buildOverdueInvoicesByService, buildPortfolioQueueItems, getPortfolioReferenceDate, type PortfolioQueueContactItem, type PortfolioQueueSort, type PortfolioQueueStatus } from '@/lib/portfolio-queue';
import type { Payment, Service } from '@/types/finance';

interface PortfolioQueueRequestBody {
  enterpriseId?: number | null;
  contactId?: number | null;
  search?: string;
  asesorIds?: number[];
  estado?: string | null;
  origen?: string | null;
  estadoCobranza?: string | null;
  page?: number;
  pageSize?: number;
  sortBy?: PortfolioQueueSort | string | null;
}

interface ContactRow {
  id: number;
  nombre?: string | null;
  apellido?: string | null;
  telefono?: string | null;
  email?: string | null;
  created_at?: string | null;
  estado?: string | null;
  es_calificado?: string | null;
  team_humano_id?: number | null;
  origen?: string | null;
  ultima_interaccion?: string | null;
  is_active?: boolean | null;
  paused_until?: string | null;
  etapa_embudo?: number | null;
}

interface ServiceRow extends Service {}

interface InvoiceRow {
  servicio_id?: number | null;
  saldo_pendiente?: number | null;
  estado?: string | null;
  fecha_vencimiento?: string | null;
}

interface TeamMemberRow {
  id: number;
  nombre?: string | null;
  apellido?: string | null;
}

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;

const getAuthUser = async (req: NextRequest) => {
  let response = NextResponse.next();
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
  if (cookieUser && !cookieError) {
    return { user: cookieUser, error: null };
  }

  const authHeader = req.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const tokenSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const token = authHeader.substring(7);
    const { data: { user: tokenUser }, error: tokenError } = await tokenSupabase.auth.getUser(token);

    if (tokenUser && !tokenError) {
      return { user: tokenUser, error: null };
    }
  }

  return { user: null, error: cookieError };
};

const buildFullName = (nombre?: string | null, apellido?: string | null, fallback?: string) => {
  return [nombre, apellido].filter(Boolean).join(' ').trim() || fallback || 'Sin nombre';
};

const normalizeSearchTerm = (value?: string | null) => {
  return (value || '').trim().replace(/[,()]/g, ' ').replace(/\s+/g, ' ').toLowerCase();
};

const matchesSearch = (contact: ContactRow | null, serviceNames: string[], assignedAgent: string | null, search: string) => {
  if (!search) return true;
  const haystack = [
    contact?.nombre,
    contact?.apellido,
    contact?.telefono,
    contact?.email,
    contact?.origen,
    assignedAgent,
    ...serviceNames,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return haystack.includes(search);
};

const matchesCobranzaFilter = (status: PortfolioQueueStatus, value?: string | null) => {
  if (!value) return true;
  if (value === 'en_mora') return status === 'mora_critica' || status === 'en_mora' || status === 'factura_vencida';
  if (value === 'vence_hoy') return status === 'vence_hoy';
  if (value === 'sin_configurar') return status === 'sin_configurar';
  if (value === 'al_dia') return status === 'al_dia';
  if (value === 'pagado') return false;
  return true;
};

const getPortfolioComparator = (sortBy: PortfolioQueueSort) => {
  if (sortBy === 'createdNewest') {
    return (a: PortfolioQueueContactItem, b: PortfolioQueueContactItem) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeB - timeA;
    };
  }

  if (sortBy === 'createdOldest') {
    return (a: PortfolioQueueContactItem, b: PortfolioQueueContactItem) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeA - timeB;
    };
  }

  return (a: PortfolioQueueContactItem, b: PortfolioQueueContactItem) => {
    if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
    if (b.overdueInvoices !== a.overdueInvoices) return b.overdueInvoices - a.overdueInvoices;
    if (b.daysOverdue !== a.daysOverdue) return b.daysOverdue - a.daysOverdue;
    if (b.dueNowAmount !== a.dueNowAmount) return b.dueNowAmount - a.dueNowAmount;
    if (b.pendingBalance !== a.pendingBalance) return b.pendingBalance - a.pendingBalance;
    if (b.servicesWithDebt !== a.servicesWithDebt) return b.servicesWithDebt - a.servicesWithDebt;
    const lastPaymentA = a.lastPaymentDate ? new Date(a.lastPaymentDate).getTime() : 0;
    const lastPaymentB = b.lastPaymentDate ? new Date(b.lastPaymentDate).getTime() : 0;
    if (lastPaymentA !== lastPaymentB) return lastPaymentA - lastPaymentB;
    return a.displayName.localeCompare(b.displayName, 'es');
  };
};

export async function POST(req: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser(req);
    if (authError || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const supabaseAdmin = createSupabaseAdmin();
    const securityCheck = await verifyActiveTeamMember(supabaseAdmin, user.id, user.email);
    if (!securityCheck.success || !securityCheck.teamMember) {
      return NextResponse.json({ error: securityCheck.error?.message || 'Acceso denegado' }, { status: securityCheck.error?.httpStatus || 403 });
    }

    const body = await req.json() as PortfolioQueueRequestBody;
    const requestedEnterpriseId = Number(body.enterpriseId || 0) || null;
    const currentUser = securityCheck.teamMember;
    const currentEnterpriseId = getEffectiveEnterpriseId(currentUser);
    const targetEnterpriseId = requestedEnterpriseId || currentEnterpriseId;

    if (!isDevTeamRole(currentUser.role_id) && targetEnterpriseId !== currentEnterpriseId) {
      return NextResponse.json({ error: 'Acceso denegado a esta empresa' }, { status: 403 });
    }

    const page = Math.max(1, Number(body.page || 1));
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(body.pageSize || DEFAULT_PAGE_SIZE)));
    const sortBy: PortfolioQueueSort = body.sortBy === 'createdNewest' || body.sortBy === 'createdOldest'
      ? body.sortBy
      : 'portfolioPriority';
    const focusedContactId = Number(body.contactId || 0) || null;
    const search = normalizeSearchTerm(body.search);
    const asesorIds = Array.isArray(body.asesorIds) ? body.asesorIds.filter((id): id is number => Number.isInteger(id) && id > 0) : [];

    let visibleContactIds: number[] | null = null;
    const effectiveAsesorIds = currentUser.role_id === 3 && currentUser.id
      ? (asesorIds.length > 0 ? asesorIds : [currentUser.id])
      : asesorIds;

    if (effectiveAsesorIds.length > 0) {
      const [assignmentsRes, legacyRes] = await Promise.all([
        supabaseAdmin
          .from('wp_contacto_team_asignaciones')
          .select('contacto_id')
          .eq('empresa_id', targetEnterpriseId)
          .in('team_humano_id', effectiveAsesorIds),
        supabaseAdmin
          .from('wp_contactos')
          .select('id')
          .eq('empresa_id', targetEnterpriseId)
          .in('team_humano_id', effectiveAsesorIds)
      ]);

      if (assignmentsRes.error || legacyRes.error) {
        return NextResponse.json({ error: 'No se pudo resolver el filtro de equipo' }, { status: 500 });
      }

      visibleContactIds = Array.from(new Set<number>([
        ...((assignmentsRes.data || []).map((row: any) => row.contacto_id).filter(Boolean)),
        ...((legacyRes.data || []).map((row: any) => row.id).filter(Boolean)),
      ]));

      if (visibleContactIds.length === 0) {
        return NextResponse.json({
          items: [],
          pagination: { page, pageSize, totalCount: 0, totalPages: 0 },
          summary: { totalPendingBalance: 0, dueNowAmount: 0, criticalCount: 0 }
        });
      }
    }

    let servicesQuery = supabaseAdmin
      .from('wp_crm_servicios')
      .select(`
        id,
        empresa_id,
        contacto_id,
        nombre_servicio,
        tipo_servicio,
        descripcion,
        moneda,
        valor_total,
        saldo_pagado,
        saldo_pendiente,
        cuota_mensual,
        dia_compromiso_pago,
        estado,
        fecha_inicio,
        fecha_fin,
        contrato_url,
        metadata,
        created_at,
        updated_at,
        created_by
      `)
      .eq('empresa_id', targetEnterpriseId)
      .in('estado', ['activo', 'pendiente_pago']);

    if (visibleContactIds) {
      servicesQuery = servicesQuery.in('contacto_id', visibleContactIds);
    }

    if (focusedContactId) {
      servicesQuery = servicesQuery.eq('contacto_id', focusedContactId);
    }

    const { data: servicesData, error: servicesError } = await servicesQuery;
    if (servicesError) {
      return NextResponse.json({ error: 'No se pudo cargar la cartera' }, { status: 500 });
    }

    const services = (servicesData || []) as ServiceRow[];
    console.log(`[PortfolioQueue] empresa=${targetEnterpriseId} services=${services.length} focusedContact=${focusedContactId} visibleContacts=${visibleContactIds?.length ?? 'all'}`);
    if (services.length === 0) {
      return NextResponse.json({
        items: [],
        pagination: { page, pageSize, totalCount: 0, totalPages: 0 },
        summary: { totalPendingBalance: 0, dueNowAmount: 0, criticalCount: 0 }
      });
    }

    const serviceIds = services.map(service => service.id);
    const contactIds = Array.from(new Set(services.map(service => service.contacto_id).filter(Boolean)));

    const [contactsRes, paymentsRes, invoicesRes, assignmentsRes] = await Promise.all([
      supabaseAdmin
        .from('wp_contactos')
        .select('id, nombre, apellido, telefono, email, created_at, estado, es_calificado, team_humano_id, origen, ultima_interaccion, is_active, paused_until, etapa_embudo')
        .eq('empresa_id', targetEnterpriseId)
        .in('id', contactIds),
      supabaseAdmin
        .from('wp_crm_pagos')
        .select('id, empresa_id, servicio_id, contacto_id, monto, moneda, fecha_pago, metodo_pago, referencia, estado, nota, comprobante_url, metadata, created_at, updated_at, registrado_por')
        .in('servicio_id', serviceIds),
      supabaseAdmin
        .from('wp_facturas')
        .select('servicio_id, saldo_pendiente, estado, fecha_vencimiento')
        .eq('empresa_id', targetEnterpriseId)
        .in('servicio_id', serviceIds)
        .gt('saldo_pendiente', 0),
      supabaseAdmin
        .from('wp_contacto_team_asignaciones')
        .select('contacto_id, team_humano_id, es_principal, rol_asignacion')
        .eq('empresa_id', targetEnterpriseId)
        .in('contacto_id', contactIds)
    ]);

    if (contactsRes.error || paymentsRes.error || invoicesRes.error || assignmentsRes.error) {
      return NextResponse.json({ error: 'No se pudo consolidar la cartera' }, { status: 500 });
    }

    const assignmentRows = assignmentsRes.data || [];
    const contactsRows = (contactsRes.data || []) as ContactRow[];
    const contactById = new Map<number, ContactRow>(contactsRows.map((contact) => [contact.id, contact]));
    const teamIds = Array.from(new Set<number>([
      ...assignmentRows.map((row: any) => row.team_humano_id).filter(Boolean),
      ...contactsRows.map((contact) => contact.team_humano_id).filter(Boolean) as number[]
    ]));

    let teamById = new Map<number, TeamMemberRow>();
    if (teamIds.length > 0) {
      const { data: teamRows, error: teamError } = await supabaseAdmin
        .from('wp_team_humano')
        .select('id, nombre, apellido')
        .in('id', teamIds);

      if (teamError) {
        return NextResponse.json({ error: 'No se pudo resolver el responsable de la cartera' }, { status: 500 });
      }

      teamById = new Map((teamRows || []).map((team) => [team.id, team as TeamMemberRow]));
    }

    const paymentsByService = new Map<number, Payment[]>();
    for (const payment of (paymentsRes.data || []) as Payment[]) {
      const current = paymentsByService.get(payment.servicio_id) || [];
      current.push(payment);
      paymentsByService.set(payment.servicio_id, current);
    }

    const overdueInvoicesByService = buildOverdueInvoicesByService((invoicesRes.data || []) as InvoiceRow[], getPortfolioReferenceDate());

    const assignmentsByContact = new Map<number, { contacto_id: number; team_humano_id: number; es_principal: boolean; rol_asignacion?: string | null }[]>();
    for (const row of assignmentRows as any[]) {
      const current = assignmentsByContact.get(row.contacto_id) || [];
      current.push(row);
      assignmentsByContact.set(row.contacto_id, current);
    }

    const servicesByContact = new Map<number, (Service & { pagos?: Payment[] })[]>();
    for (const rawService of services) {
      const service = {
        ...rawService,
        pagos: paymentsByService.get(rawService.id) || [],
      };
      const current = servicesByContact.get(rawService.contacto_id) || [];
      current.push(service);
      servicesByContact.set(rawService.contacto_id, current);
    }

    const items: PortfolioQueueContactItem[] = [];

    for (const [contactId, contactServices] of servicesByContact.entries()) {
      const queueItems = buildPortfolioQueueItems(contactServices, overdueInvoicesByService);
      if (queueItems.length === 0) {
        continue;
      }

      const contact = contactById.get(contactId) || null;
      const serviceNames = contactServices.map(service => service.nombre_servicio).filter(Boolean);
      const assignments = assignmentsByContact.get(contactId) || [];
      const primaryAssignment = assignments.find((assignment) => assignment.es_principal) || assignments[0] || null;
      const legacyAdvisor = contact?.team_humano_id ? teamById.get(contact.team_humano_id) : null;
      const primaryAdvisor = primaryAssignment ? teamById.get(primaryAssignment.team_humano_id) : null;
      const assignedAdvisor = primaryAssignment
        ? [primaryAdvisor?.nombre, primaryAdvisor?.apellido].filter(Boolean).join(' ').trim() || null
        : legacyAdvisor
          ? [legacyAdvisor.nombre, legacyAdvisor.apellido].filter(Boolean).join(' ').trim() || null
          : null;

      if (body.estado && contact?.estado !== body.estado) {
        continue;
      }

      if (body.origen && contact?.origen !== body.origen) {
        continue;
      }

      if (!matchesSearch(contact, serviceNames, assignedAdvisor, search)) {
        continue;
      }

      // topItem: servicio más crítico → usado solo para priorityScore (orden de lista)
      const topItem = queueItems[0];

      // displayItem: servicio con menor mora operativa positiva (actividad de pago más reciente)
      // Este determina TODO lo visible: badge, label, servicio, compromiso
      const displayItem = queueItems
        .filter(item => item.commitmentInfo.daysOverdue > 0)
        .reduce<typeof topItem | null>((min, item) =>
          !min || item.commitmentInfo.daysOverdue < min.commitmentInfo.daysOverdue ? item : min
        , null) || topItem;

      if (!matchesCobranzaFilter(displayItem.status, body.estadoCobranza)) {
        continue;
      }

      const pendingBalance = queueItems.reduce((sum, item) => sum + Math.max(0, item.service.saldo_pendiente || 0), 0);
      const dueNowAmount = queueItems.reduce((sum, item) => {
        if (item.commitmentInfo.daysOverdue > 0 || item.commitmentInfo.status === 'vence_hoy' || item.overdueInvoices > 0) {
          return sum + item.amount;
        }
        return sum;
      }, 0);
      const overdueInvoices = queueItems.reduce((sum, item) => sum + item.overdueInvoices, 0);
      const lastPaymentDate = queueItems.reduce<Date | null>((latest, item) => {
        if (!item.lastPaymentDate) return latest;
        if (!latest || item.lastPaymentDate.getTime() > latest.getTime()) {
          return item.lastPaymentDate;
        }
        return latest;
      }, null);
      const servicesCount = contactServices.filter(service => service.estado !== 'cancelado').length;
      const priorityScore = (topItem.priority * 100000)
        + (overdueInvoices * 1000)
        + (topItem.commitmentInfo.daysOverdue * 10)
        + Math.min(999, Math.round(dueNowAmount > 0 ? dueNowAmount : pendingBalance));
      const recommendedAction = displayItem.status === 'sin_configurar' || displayItem.status === 'factura_vencida'
        ? 'crear_seguimiento'
        : displayItem.status === 'pendiente_confirmacion'
          ? 'abrir_cartera'
          : 'registrar_pago';

      items.push({
        contactId,
        displayName: buildFullName(contact?.nombre, contact?.apellido, `Contacto #${contactId}`),
        estado: contact?.estado || null,
        calificacion: contact?.es_calificado || null,
        origen: contact?.origen || null,
        etapaEmbudoId: contact?.etapa_embudo || null,
        createdAt: contact?.created_at || null,
        lastInteraction: contact?.ultima_interaccion || null,
        isActive: contact?.is_active ?? null,
        pausedUntil: contact?.paused_until || null,
        assignedAgent: assignedAdvisor,
        topServiceId: displayItem.service.id,
        topServiceName: displayItem.service.nombre_servicio,
        topSeverity: displayItem.severity,
        topStatus: displayItem.status,
        topTitle: displayItem.title,
        agingLabel: displayItem.agingLabel,
        priorityScore,
        pendingBalance,
        dueNowAmount,
        overdueInvoices,
        servicesWithDebt: queueItems.length,
        servicesCount,
        daysOverdue: displayItem.commitmentInfo.daysOverdue,
        nextCommitmentDay: displayItem.commitmentInfo.configuredDay,
        nextDueDate: displayItem.commitmentInfo.dueDate ? displayItem.commitmentInfo.dueDate.toISOString() : null,
        lastPaymentDate: lastPaymentDate ? lastPaymentDate.toISOString() : null,
        recommendedAction,
        primaryCurrency: displayItem.service.moneda || 'USD',
        hasPendingConfirmation: contactServices.some(service => service.estado === 'pendiente_pago'),
        ciclosImpagos: Math.max(...queueItems.map(item => item.ciclosImpagos), 0),
        deudaAcumulada: queueItems.reduce((sum, item) => sum + item.deudaAcumulada, 0),
        paymentBehavior: queueItems.reduce<import('@/lib/portfolio-queue').PortfolioQueueServiceItem['paymentBehavior']>((worst, item) => {
          const order = { activo: 0, irregular: 1, inactivo: 2, sin_pagos: 3 } as const;
          return (order[item.paymentBehavior] || 0) > (order[worst] || 0) ? item.paymentBehavior : worst;
        }, 'activo'),
      });
    }

    items.sort(getPortfolioComparator(sortBy));
    console.log(`[PortfolioQueue] items after filters=${items.length} sort=${sortBy} page=${page}/${Math.ceil(items.length / pageSize) || 0}`);

    const totalCount = items.length;
    const totalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / pageSize);
    const start = (page - 1) * pageSize;
    const pagedItems = items.slice(start, start + pageSize);
    const summary = items.reduce((acc, item) => {
      acc.totalPendingBalance += item.pendingBalance;
      acc.dueNowAmount += item.dueNowAmount;
      if (item.topSeverity === 'critical') acc.criticalCount += 1;
      return acc;
    }, { totalPendingBalance: 0, dueNowAmount: 0, criticalCount: 0 });

    return NextResponse.json({
      items: pagedItems,
      pagination: { page, pageSize, totalCount, totalPages },
      summary,
    });
  } catch (error) {
    console.error('[PortfolioQueue] Unexpected error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
