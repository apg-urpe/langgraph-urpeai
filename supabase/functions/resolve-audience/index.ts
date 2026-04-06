import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================================
// Edge Function: resolve-audience
// Resuelve los contactos de una audiencia dinámica aplicando filtros complejos
// y llama al RPC enroll_contacts_in_campaign para inscribirlos
// ============================================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface FilterCondition {
  id: string;
  field: string;
  operator: string;
  value: string | number | boolean | null;
}

interface AudienceFilters {
  logic: "AND" | "OR";
  conditions: FilterCondition[];
}

interface ResolveRequest {
  campana_id?: number;
  audiencia_id: number;
  empresa_id: number;
  first_send_delay_minutes?: number;
  enroll?: boolean; // true = inscribir en campaña, false = solo resolver IDs
}

// ============================================================================
// HELPER: Fetch contact IDs from cross-table filters
// ============================================================================

async function fetchContactIdsByAppointmentStatus(
  supabase: ReturnType<typeof createClient>,
  empresaId: number,
  status: string
): Promise<number[] | null> {
  try {
    if (status === "sin_cita") {
      const { data, error } = await supabase
        .from("wp_citas")
        .select("contacto_id")
        .eq("empresa_id", empresaId)
        .not("contacto_id", "is", null);

      if (error) {
        console.error("[resolve-audience] Error fetching sin_cita:", error);
        return null;
      }
      // Return IDs of contacts WITH appointments — caller will exclude them
      return [...new Set((data || []).map((c: any) => c.contacto_id).filter(Boolean))];
    }

    const estadoMap: Record<string, string[]> = {
      realizadas: ["completada"],
      canceladas: ["cancelada"],
      programadas: ["programada"],
      confirmadas: ["confirmada"],
    };

    const estados = estadoMap[status] || [];
    if (estados.length === 0) return [];

    const { data, error } = await supabase
      .from("wp_citas")
      .select("contacto_id")
      .eq("empresa_id", empresaId)
      .in("estado", estados)
      .not("contacto_id", "is", null);

    if (error) {
      console.error("[resolve-audience] Error fetching appointment status:", error);
      return null;
    }

    return [...new Set((data || []).map((c: any) => c.contacto_id).filter(Boolean))];
  } catch (err) {
    console.error("[resolve-audience] Exception in appointment status:", err);
    return null;
  }
}

async function fetchContactIdsByPortfolioStatus(
  supabase: ReturnType<typeof createClient>,
  empresaId: number,
  status: string
): Promise<{ ids: number[]; isExclusion: boolean } | null> {
  try {
    if (status === "sin_servicios") {
      const { data, error } = await supabase
        .from("wp_crm_servicios")
        .select("contacto_id")
        .eq("empresa_id", empresaId);
      if (error) return null;
      return {
        ids: [...new Set((data || []).map((c: any) => c.contacto_id).filter(Boolean))],
        isExclusion: true,
      };
    }

    if (status === "con_deuda") {
      const { data, error } = await supabase
        .from("wp_crm_servicios")
        .select("contacto_id")
        .eq("empresa_id", empresaId)
        .gt("saldo_pendiente", 0);
      if (error) return null;
      return {
        ids: [...new Set((data || []).map((c: any) => c.contacto_id).filter(Boolean))],
        isExclusion: false,
      };
    }

    if (status === "al_dia") {
      const [allServices, withDebt] = await Promise.all([
        supabase.from("wp_crm_servicios").select("contacto_id").eq("empresa_id", empresaId),
        supabase.from("wp_crm_servicios").select("contacto_id").eq("empresa_id", empresaId).gt("saldo_pendiente", 0),
      ]);
      const allIds = new Set((allServices.data || []).map((c: any) => c.contacto_id));
      const debtIds = new Set((withDebt.data || []).map((c: any) => c.contacto_id));
      return {
        ids: [...allIds].filter((id) => !debtIds.has(id)),
        isExclusion: false,
      };
    }

    return { ids: [], isExclusion: false };
  } catch (err) {
    console.error("[resolve-audience] Exception in portfolio status:", err);
    return null;
  }
}

async function fetchContactIdsByLastPaymentDate(
  supabase: ReturnType<typeof createClient>,
  empresaId: number,
  operator: string,
  value: any
): Promise<number[]> {
  try {
    let query = supabase
      .from("wp_crm_pagos")
      .select("contacto_id")
      .eq("empresa_id", empresaId)
      .eq("estado", "confirmado");

    switch (operator) {
      case "eq": query = query.eq("fecha_pago", value); break;
      case "gt": query = query.gt("fecha_pago", value); break;
      case "lt": query = query.lt("fecha_pago", value); break;
      case "gte": query = query.gte("fecha_pago", value); break;
      case "lte": query = query.lte("fecha_pago", value); break;
    }

    const { data, error } = await query;
    if (error) throw error;
    return [...new Set((data || []).map((p: any) => p.contacto_id))];
  } catch {
    return [];
  }
}

async function fetchContactIdsByFinanceMetric(
  supabase: ReturnType<typeof createClient>,
  empresaId: number,
  metric: string,
  operator: string,
  value: any
): Promise<number[]> {
  try {
    const field = metric === "total_paid" ? "saldo_pagado" : "saldo_pendiente";
    let query = supabase
      .from("wp_crm_servicios")
      .select("contacto_id")
      .eq("empresa_id", empresaId);

    const numValue = parseFloat(value);
    switch (operator) {
      case "eq": query = query.eq(field, numValue); break;
      case "gt": query = query.gt(field, numValue); break;
      case "lt": query = query.lt(field, numValue); break;
      case "gte": query = query.gte(field, numValue); break;
      case "lte": query = query.lte(field, numValue); break;
    }

    const { data, error } = await query;
    if (error) throw error;
    return [...new Set((data || []).map((s: any) => s.contacto_id))];
  } catch {
    return [];
  }
}

async function fetchContactIdsByServiceType(
  supabase: ReturnType<typeof createClient>,
  empresaId: number,
  type: string
): Promise<number[]> {
  try {
    const { data, error } = await supabase
      .from("wp_crm_servicios")
      .select("contacto_id")
      .eq("empresa_id", empresaId)
      .eq("tipo_servicio", type);
    if (error) throw error;
    return [...new Set((data || []).map((s: any) => s.contacto_id))];
  } catch {
    return [];
  }
}

// ============================================================================
// CORE: buildFilterQuery — Server-side version
// Construye la query de Supabase aplicando filtros de audiencia
// ============================================================================

async function buildFilterQuery(
  supabase: ReturnType<typeof createClient>,
  baseQuery: any,
  filters: AudienceFilters,
  empresaId: number
): Promise<any> {
  let query = baseQuery;

  for (const condition of filters.conditions) {
    const { field, operator, value } = condition;

    // --- Cross-table: appointment_status ---
    if (field === "appointment_status") {
      if (!value || typeof value !== "string") continue;
      const contactIds = await fetchContactIdsByAppointmentStatus(supabase, empresaId, value);
      if (contactIds === null) continue; // query failed, skip

      if (value === "sin_cita") {
        if (contactIds.length > 0) {
          query = query.not("id", "in", `(${contactIds.join(",")})`);
        }
      } else {
        if (contactIds.length > 0) {
          query = query.in("id", contactIds);
        } else {
          query = query.eq("id", -1);
        }
      }
      continue;
    }

    // --- Cross-table: portfolio_status ---
    if (field === "portfolio_status") {
      if (!value || typeof value !== "string") continue;
      const result = await fetchContactIdsByPortfolioStatus(supabase, empresaId, value);
      if (!result) continue;

      if (result.isExclusion) {
        if (result.ids.length > 0) {
          query = query.not("id", "in", `(${result.ids.join(",")})`);
        }
      } else {
        if (result.ids.length > 0) {
          query = query.in("id", result.ids);
        } else {
          query = query.eq("id", -1);
        }
      }
      continue;
    }

    // --- Cross-table: last_payment_date ---
    if (field === "last_payment_date") {
      if (!value) continue;
      const contactIds = await fetchContactIdsByLastPaymentDate(supabase, empresaId, operator, value);
      if (contactIds.length > 0) {
        query = query.in("id", contactIds);
      } else {
        query = query.eq("id", -1);
      }
      continue;
    }

    // --- Cross-table: total_paid / total_pending ---
    if (field === "total_paid" || field === "total_pending") {
      if (value === null || value === undefined || value === "") continue;
      const contactIds = await fetchContactIdsByFinanceMetric(supabase, empresaId, field, operator, value);
      if (contactIds.length > 0) {
        query = query.in("id", contactIds);
      } else {
        query = query.eq("id", -1);
      }
      continue;
    }

    // --- Cross-table: service_type ---
    if (field === "service_type") {
      if (!value || typeof value !== "string") continue;
      const contactIds = await fetchContactIdsByServiceType(supabase, empresaId, value);
      if (contactIds.length > 0) {
        if (operator === "neq") {
          query = query.not("id", "in", `(${contactIds.join(",")})`);
        } else {
          query = query.in("id", contactIds);
        }
      } else {
        if (operator !== "neq") {
          query = query.eq("id", -1);
        }
      }
      continue;
    }

    // --- Standard field operators ---
    if (value === null || value === undefined || value === "") {
      if (operator !== "is_null" && operator !== "is_not_null") continue;
    }

    switch (operator) {
      case "eq":
        query = value === null ? query.is(field, null) : query.eq(field, value);
        break;
      case "neq":
        query = value === null ? query.not(field, "is", null) : query.neq(field, value);
        break;
      case "gt": query = query.gt(field, value); break;
      case "lt": query = query.lt(field, value); break;
      case "gte": query = query.gte(field, value); break;
      case "lte": query = query.lte(field, value); break;
      case "contains":
        if (field === "metadata") {
          query = query.ilike(`${field}::text`, `%${value}%`);
        } else {
          query = query.ilike(field, `%${value}%`);
        }
        break;
      case "is_null": query = query.is(field, null); break;
      case "is_not_null": query = query.not(field, "is", null); break;
    }
  }

  return query;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req: Request) => {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const body: ResolveRequest = await req.json();
    const { audiencia_id, empresa_id, campana_id, first_send_delay_minutes = 0, enroll = false } = body;

    if (!audiencia_id || !empresa_id) {
      return new Response(
        JSON.stringify({ error: "audiencia_id y empresa_id son requeridos" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Usar service role para bypass RLS (esta función se llama desde el frontend autenticado o desde sync-dynamic-audiences)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Obtener la audiencia y sus filtros
    const { data: audience, error: audienceError } = await supabase
      .from("wp_marketing_audiencias")
      .select("id, tipo, filtros_json, empresa_id")
      .eq("id", audiencia_id)
      .single();

    if (audienceError || !audience) {
      return new Response(
        JSON.stringify({ error: "Audiencia no encontrada", detail: audienceError?.message }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Verificar que la audiencia pertenece a la empresa
    if (audience.empresa_id !== empresa_id) {
      return new Response(
        JSON.stringify({ error: "Audiencia no pertenece a esta empresa" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    let contactIds: number[] = [];

    if (audience.tipo === "estatica") {
      // Para estáticas: leer directamente de wp_marketing_audiencia_contacto
      const { data: contacts, error: contactsError } = await supabase
        .from("wp_marketing_audiencia_contacto")
        .select("contacto_id")
        .eq("audiencia_id", audiencia_id);

      if (contactsError) {
        return new Response(
          JSON.stringify({ error: "Error leyendo contactos de audiencia estática", detail: contactsError.message }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }

      contactIds = (contacts || []).map((c: any) => c.contacto_id);
    } else {
      // Para dinámicas: resolver filtros con buildFilterQuery
      const filters = audience.filtros_json as AudienceFilters;

      if (!filters?.conditions?.length) {
        return new Response(
          JSON.stringify({
            contact_ids: [],
            count: 0,
            message: "Audiencia dinámica sin condiciones de filtro",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      // Construir query base: contactos de la empresa que son elegibles para email
      // is_email_eligible() se valida en el RPC, aquí aplicamos filtros equivalentes en JS
      let query = supabase
        .from("wp_contactos")
        .select("id")
        .eq("empresa_id", empresa_id)
        .not("email", "is", null)
        .neq("email", "")
        .eq("is_active", true)
        .neq("estado", "cliente")
        .or("suscripcion.is.null,suscripcion.eq.true");

      // Aplicar filtros de la audiencia
      query = await buildFilterQuery(supabase, query, filters, empresa_id);

      const { data: contactData, error: contactError } = await query;

      if (contactError) {
        console.error("[resolve-audience] Error resolving dynamic audience:", contactError);
        return new Response(
          JSON.stringify({ error: "Error resolviendo audiencia dinámica", detail: contactError.message }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }

      contactIds = (contactData || []).map((c: any) => c.id);
    }

    console.log(`[resolve-audience] Resolved ${contactIds.length} contacts for audience ${audiencia_id}`);

    // 2. Si enroll=true y hay campana_id, inscribir en la campaña
    let enrollmentResult = null;
    if (enroll && campana_id) {
      const { data: enrollData, error: enrollError } = await supabase.rpc(
        "enroll_contacts_in_campaign",
        {
          p_campana_id: campana_id,
          p_empresa_id: empresa_id,
          p_first_send_delay_minutes: first_send_delay_minutes,
          p_contacto_ids: contactIds,
        }
      );

      if (enrollError) {
        console.error("[resolve-audience] Enrollment error:", enrollError);
        return new Response(
          JSON.stringify({
            contact_ids: contactIds,
            count: contactIds.length,
            enrollment_error: enrollError.message,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      enrollmentResult = enrollData;
      console.log("[resolve-audience] Enrollment result:", enrollData);
    }

    return new Response(
      JSON.stringify({
        contact_ids: contactIds,
        count: contactIds.length,
        enrollment: enrollmentResult,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (err: any) {
    console.error("[resolve-audience] Unhandled error:", err);
    return new Response(
      JSON.stringify({ error: "Error interno", detail: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
