import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================================
// Edge Function: sync-dynamic-audiences
// Cron job que re-evalúa audiencias dinámicas de campañas activas
// 
// Llamar via pg_cron o n8n cada 6 horas:
// POST /functions/v1/sync-dynamic-audiences
// Header: Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
// ============================================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface SyncResult {
  campana_id: number;
  campana_nombre: string;
  audiencia_id: number;
  empresa_id: number;
  nuevos_inscritos: number;
  cancelados: number;
  error?: string;
}

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

  const startTime = Date.now();
  const results: SyncResult[] = [];

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Parsear body opcional (puede filtrar por empresa o campaña)
    let filterEmpresaId: number | null = null;
    let filterCampanaId: number | null = null;
    try {
      const body = await req.json();
      filterEmpresaId = body?.empresa_id || null;
      filterCampanaId = body?.campana_id || null;
    } catch {
      // No body = procesar todo
    }

    // 1. Obtener campañas activas con audiencias dinámicas
    let query = supabase
      .from("wp_email_campanas")
      .select(`
        id,
        nombre,
        empresa_id,
        audiencia_id,
        wp_marketing_audiencias!inner (
          id,
          tipo,
          filtros_json
        )
      `)
      .eq("estado", "activa")
      .not("audiencia_id", "is", null);

    if (filterEmpresaId) {
      query = query.eq("empresa_id", filterEmpresaId);
    }
    if (filterCampanaId) {
      query = query.eq("id", filterCampanaId);
    }

    const { data: campaigns, error: campaignsError } = await query;

    if (campaignsError) {
      console.error("[sync-dynamic-audiences] Error fetching campaigns:", campaignsError);
      return new Response(
        JSON.stringify({ error: "Error fetching campaigns", detail: campaignsError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Filtrar solo dinámicas (el join trae todas, filtramos aquí)
    const dynamicCampaigns = (campaigns || []).filter((c: any) => {
      const audience = Array.isArray(c.wp_marketing_audiencias)
        ? c.wp_marketing_audiencias[0]
        : c.wp_marketing_audiencias;
      return audience?.tipo === "dinamica";
    });

    console.log(`[sync-dynamic-audiences] Found ${dynamicCampaigns.length} active campaigns with dynamic audiences`);

    // 2. Para cada campaña, llamar resolve-audience para obtener IDs actuales
    for (const campaign of dynamicCampaigns) {
      const audience = Array.isArray(campaign.wp_marketing_audiencias)
        ? campaign.wp_marketing_audiencias[0]
        : campaign.wp_marketing_audiencias;

      if (!audience?.filtros_json?.conditions?.length) {
        console.log(`[sync-dynamic-audiences] Skipping campaign ${campaign.id} - no filter conditions`);
        continue;
      }

      try {
        // Llamar resolve-audience internamente (misma instancia Supabase)
        const resolveUrl = `${SUPABASE_URL}/functions/v1/resolve-audience`;
        const resolveResponse = await fetch(resolveUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            audiencia_id: audience.id,
            empresa_id: campaign.empresa_id,
            campana_id: campaign.id,
            enroll: true, // Inscribir nuevos contactos
            first_send_delay_minutes: 0,
          }),
        });

        const resolveData = await resolveResponse.json();

        if (!resolveResponse.ok) {
          results.push({
            campana_id: campaign.id,
            campana_nombre: campaign.nombre,
            audiencia_id: audience.id,
            empresa_id: campaign.empresa_id,
            nuevos_inscritos: 0,
            cancelados: 0,
            error: resolveData.error || "Error en resolve-audience",
          });
          continue;
        }

        const enrolled = resolveData.enrollment?.[0]?.enrolled_count || 0;
        const currentContactIds: number[] = resolveData.contact_ids || [];

        // 3. Cancelar enrollments de contactos que YA NO califican
        // Obtener contactos actualmente inscritos y activos
        const { data: activeEnrollments, error: enrollError } = await supabase
          .from("wp_email_contacto_campana")
          .select("id, contacto_id")
          .eq("campana_id", campaign.id)
          .eq("estado", "activo");

        let cancelados = 0;

        if (!enrollError && activeEnrollments) {
          const currentIdSet = new Set(currentContactIds);
          const toCancel = activeEnrollments.filter(
            (e: any) => !currentIdSet.has(e.contacto_id)
          );

          if (toCancel.length > 0) {
            const cancelIds = toCancel.map((e: any) => e.id);
            
            const { error: cancelError } = await supabase
              .from("wp_email_contacto_campana")
              .update({
                estado: "cancelado",
                fecha_salida: new Date().toISOString(),
                motivo_salida: "Contacto ya no cumple filtros de audiencia dinámica (sync automática)",
                updated_at: new Date().toISOString(),
              })
              .in("id", cancelIds);

            if (cancelError) {
              console.error(`[sync-dynamic-audiences] Error cancelling enrollments for campaign ${campaign.id}:`, cancelError);
            } else {
              cancelados = toCancel.length;
              console.log(`[sync-dynamic-audiences] Cancelled ${cancelados} enrollments for campaign ${campaign.id}`);
            }
          }
        }

        results.push({
          campana_id: campaign.id,
          campana_nombre: campaign.nombre,
          audiencia_id: audience.id,
          empresa_id: campaign.empresa_id,
          nuevos_inscritos: enrolled,
          cancelados,
        });

        console.log(
          `[sync-dynamic-audiences] Campaign ${campaign.id} "${campaign.nombre}": +${enrolled} inscritos, -${cancelados} cancelados`
        );
      } catch (err: any) {
        console.error(`[sync-dynamic-audiences] Error processing campaign ${campaign.id}:`, err);
        results.push({
          campana_id: campaign.id,
          campana_nombre: campaign.nombre,
          audiencia_id: audience.id,
          empresa_id: campaign.empresa_id,
          nuevos_inscritos: 0,
          cancelados: 0,
          error: err.message,
        });
      }
    }

    // 4. También ejecutar cleanup de stuck enrollments
    const { data: cleanupResult } = await supabase.rpc("cleanup_stuck_enrollments");
    const cleanedCount = cleanupResult?.[0]?.cleaned_count || 0;

    // 5. También ejecutar sync de audiencias estáticas
    const { data: staticSyncResult } = await supabase.rpc("sync_campaign_enrollments", {
      p_empresa_id: filterEmpresaId,
      p_campana_id: filterCampanaId,
    });

    const elapsed = Date.now() - startTime;

    return new Response(
      JSON.stringify({
        success: true,
        dynamic_campaigns_processed: dynamicCampaigns.length,
        results,
        stuck_enrollments_cleaned: cleanedCount,
        static_sync: staticSyncResult || [],
        elapsed_ms: elapsed,
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
    console.error("[sync-dynamic-audiences] Unhandled error:", err);
    return new Response(
      JSON.stringify({ error: "Error interno", detail: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
