import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const EMPRESA_ID = 4;
const API_KEY = Deno.env.get("WEBHOOK_API_KEY") || "urpe-webhook-2024-secret";

interface WebhookPayload {
  action: string;
  timestamp: string;
  titulo: string;
  descripcion: string;
  etiquetas: string[];
  client: {
    id: string;
    name: string;
    email: string;
    phone: string;
  };
  case: {
    caseId: string;
    visaType: string;
    status: string;
    currentStage?: number;
  };
  extra: Record<string, unknown>;
  isTestEnvironment: boolean;
}

function buildNotaDescripcion(payload: WebhookPayload): string {
  const lines: string[] = [];

  lines.push(`**${payload.titulo}**`);
  lines.push("");
  lines.push(payload.descripcion);
  lines.push("");
  lines.push("---");
  lines.push(`**Caso:** ${payload.case.caseId}`);
  lines.push(`**Tipo de Visa:** ${payload.case.visaType}`);
  lines.push(`**Estado:** ${payload.case.status}`);

  if (payload.case.currentStage !== undefined) {
    lines.push(`**Etapa Actual:** ${payload.case.currentStage}`);
  }

  if (payload.extra) {
    const extraLines: string[] = [];

    if (payload.extra.stagesCount !== undefined)
      extraLines.push(`• Etapas totales: ${payload.extra.stagesCount}`);
    if (payload.extra.deliverablesCount !== undefined)
      extraLines.push(`• Entregables: ${payload.extra.deliverablesCount}`);
    if (payload.extra.documentsCount !== undefined)
      extraLines.push(`• Documentos: ${payload.extra.documentsCount}`);
    if (payload.extra.createdBy !== undefined)
      extraLines.push(`• Creado por: ${payload.extra.createdBy}`);
    if (payload.extra.amount !== undefined)
      extraLines.push(`• Monto: $${payload.extra.amount}`);
    if (payload.extra.paymentMethod !== undefined)
      extraLines.push(`• Método de pago: ${payload.extra.paymentMethod}`);
    if (payload.extra.paymentDate !== undefined)
      extraLines.push(`• Fecha de pago: ${payload.extra.paymentDate}`);
    if (payload.extra.reference !== undefined)
      extraLines.push(`• Referencia: ${payload.extra.reference}`);
    if (payload.extra.overallProgress !== undefined)
      extraLines.push(`• Progreso general: ${payload.extra.overallProgress}%`);
    if (payload.extra.registeredBy !== undefined)
      extraLines.push(`• Registrado por: ${payload.extra.registeredBy}`);
    if (payload.extra.stageNumbers !== undefined)
      extraLines.push(
        `• Etapa(s) pagada(s): ${(payload.extra.stageNumbers as number[]).join(", ")}`
      );
    if (payload.extra.paidStages !== undefined && payload.extra.totalStages !== undefined)
      extraLines.push(`• Etapas pagadas: ${payload.extra.paidStages}/${payload.extra.totalStages}`);

    if (extraLines.length > 0) {
      lines.push("");
      lines.push("**Detalles:**");
      lines.push(...extraLines);
    }
  }

  lines.push("");
  lines.push(`*Acción: \`${payload.action}\` | ${new Date(payload.timestamp).toLocaleString("es-CO", { timeZone: "America/Bogota" })}*`);

  return lines.join("\n");
}

Deno.serve(async (req: Request) => {
  // Validar método
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Validar API key
  const authHeader = req.headers.get("Authorization");
  const apiKeyHeader = req.headers.get("X-API-Key");
  
  const providedKey = authHeader?.startsWith("Bearer ") 
    ? authHeader.substring(7) 
    : apiKeyHeader;

  if (!providedKey || providedKey !== API_KEY) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Acepta tanto array como objeto directo
  const payloads: WebhookPayload[] = Array.isArray(body) ? body : [body];

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const results: { success: boolean; contacto_id?: number; nota_id?: number; error?: string; client?: string }[] = [];

  for (const payload of payloads) {
    const { client, etiquetas, titulo } = payload;

    if (!client?.phone && !client?.email) {
      results.push({ success: false, error: "Sin teléfono ni email para buscar contacto", client: client?.name });
      continue;
    }

    // Buscar contacto por teléfono o email dentro de empresa_id = 4
    let contacto: { id: number } | null = null;

    if (client.phone) {
      const phone = client.phone.replace(/\D/g, "");
      const { data } = await supabase
        .from("wp_contactos")
        .select("id")
        .eq("empresa_id", EMPRESA_ID)
        .or(`telefono.ilike.%${phone}`)
        .limit(1)
        .maybeSingle();
      contacto = data;
    }

    if (!contacto && client.email) {
      const { data } = await supabase
        .from("wp_contactos")
        .select("id")
        .eq("empresa_id", EMPRESA_ID)
        .ilike("email", client.email.trim())
        .limit(1)
        .maybeSingle();
      contacto = data;
    }

    if (!contacto) {
      results.push({
        success: false,
        error: `Contacto no encontrado en empresa ${EMPRESA_ID}`,
        client: client.name,
      });
      continue;
    }

    const descripcion = buildNotaDescripcion(payload);

    const { data: nota, error: notaError } = await supabase
      .from("wp_contactos_nota")
      .insert({
        contacto_id: contacto.id,
        titulo: titulo ?? `Evento: ${payload.action}`,
        descripcion,
        etiquetas: etiquetas ?? [],
        es_fijado: false,
        visible_ia: true,
        team_humano_id: null,
      })
      .select("id")
      .single();

    if (notaError) {
      results.push({
        success: false,
        error: notaError.message,
        client: client.name,
        contacto_id: contacto.id,
      });
      continue;
    }

    results.push({
      success: true,
      contacto_id: contacto.id,
      nota_id: nota.id,
      client: client.name,
    });
  }

  const allOk = results.every((r) => r.success);

  return new Response(JSON.stringify({ ok: allOk, results }), {
    status: allOk ? 200 : 207,
    headers: { "Content-Type": "application/json" },
  });
});
