import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ─────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────
const EMPRESA_ID = 4;
const ESTADO_FIJO = "cliente"; // Todos los registros del sheet son clientes

// ─────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────
interface SheetRecord {
  row_index?: number;
  nombre?: string | null;
  estado?: string | null;           // Se guarda en metadata, NO define el estado de Supabase
  ciudad?: string | null;
  nacionalidad?: string | null;
  complementos?: string | null;
  asesor_venta?: string | null;
  email?: string | null;
  telefono?: string | null;
  proceso?: string | null;
  fecha_contrato?: string | null;
  asesor?: string | null;
  estado_pago?: string | null;
  cliente_preferencial?: string | null;
  observacion?: string | null;
  estado_supabase?: string | null;
  correo_bienvenida?: string | null;
  carpeta_reunion_consentimiento?: string | null;
  formulario_i140?: string | null;
  revision_expediente?: string | null;
  formularios?: string | null;
  patente?: string | null;
  libro_tecnico?: string | null;
  proyecto_business_plan?: string | null;
  piloto?: string | null;
  proyecto_finalizado?: string | null;
  casos_estudios?: string | null;
  whitepaper_tecnico?: string | null;
  estudio_econometrico?: string | null;
  website_tecnico?: string | null;
  creativos_logos?: string | null;
  acreditaciones?: string | null;
  cartas_recomendacion?: string | null;
  carta_innovacion?: string | null;
  carta_intencion?: string | null;
  carta_autopeticion?: string | null;
  policy_paper?: string | null;
  paquete_final?: string | null;
  id_supabase?: string | null;
  paquete_enviado?: string | null;
  fecha_radicado?: string | null;
  ioe?: string | null;
  monitoreo_ioe?: string | null;
  fecha_ultima_gestion?: string | null;
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

/** Deja solo dígitos numéricos. Retorna null si queda vacío o < 7 dígitos */
function cleanPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, "");
  return digits.length >= 7 ? digits : null;
}

/** Separa nombre completo: primera palabra = nombre, resto = apellido */
function parseNombre(nombre: string | null | undefined): { nombre: string; apellido: string } {
  if (!nombre) return { nombre: "", apellido: "" };
  const parts = nombre.trim().split(/\s+/);
  if (parts.length === 1) return { nombre: parts[0], apellido: "" };
  const [first, ...rest] = parts;
  return { nombre: first, apellido: rest.join(" ") };
}

/** Construye el bloque de metadata del sheet (se hará merge con la existente) */
function buildSheetMetadata(record: SheetRecord): Record<string, unknown> {
  return {
    // Identificación del origen
    sheet_sync: true,
    sheet_sync_at: new Date().toISOString(),
    visa_type: "EB-2 NIW",

    // Estado del sheet (guardado como dato, no define estado en Supabase)
    estado_sheet: record.estado,
    estado_supabase_sheet: record.estado_supabase,
    estado_pago: record.estado_pago,
    cliente_preferencial: record.cliente_preferencial,

    // Datos del proceso
    proceso: record.proceso,
    asesor_venta: record.asesor_venta,
    asesor: record.asesor,
    complementos: record.complementos,
    observacion: record.observacion,
    ciudad: record.ciudad,
    nacionalidad: record.nacionalidad,
    fecha_contrato: record.fecha_contrato,

    // Etapas del proceso EB-2 NIW
    correo_bienvenida: record.correo_bienvenida,
    carpeta_reunion_consentimiento: record.carpeta_reunion_consentimiento,
    formulario_i140: record.formulario_i140,
    revision_expediente: record.revision_expediente,
    formularios: record.formularios,
    patente: record.patente,
    libro_tecnico: record.libro_tecnico,
    proyecto_business_plan: record.proyecto_business_plan,
    piloto: record.piloto,
    proyecto_finalizado: record.proyecto_finalizado,
    casos_estudios: record.casos_estudios,
    whitepaper_tecnico: record.whitepaper_tecnico,
    estudio_econometrico: record.estudio_econometrico,
    website_tecnico: record.website_tecnico,
    creativos_logos: record.creativos_logos,
    acreditaciones: record.acreditaciones,
    cartas_recomendacion: record.cartas_recomendacion,
    carta_innovacion: record.carta_innovacion,
    carta_intencion: record.carta_intencion,
    carta_autopeticion: record.carta_autopeticion,
    policy_paper: record.policy_paper,
    paquete_final: record.paquete_final,
    paquete_enviado: record.paquete_enviado,
    fecha_radicado: record.fecha_radicado,
    ioe: record.ioe,
    monitoreo_ioe: record.monitoreo_ioe,
    fecha_ultima_gestion: record.fecha_ultima_gestion,
  };
}

// ─────────────────────────────────────────────
// LÓGICA PRINCIPAL POR REGISTRO
// ─────────────────────────────────────────────
async function processRecord(
  supabase: ReturnType<typeof createClient>,
  record: SheetRecord
): Promise<{ action: string; contacto_id?: number; error?: string; nombre?: string }> {
  const nombre_completo = record.nombre;
  const email = record.email?.trim().toLowerCase() || null;
  const telefono = cleanPhone(record.telefono);

  if (!nombre_completo && !email && !telefono) {
    return { action: "skipped", error: "Sin nombre, email ni teléfono", nombre: nombre_completo ?? undefined };
  }

  const { nombre, apellido } = parseNombre(nombre_completo);
  const sheetMeta = buildSheetMetadata(record);

  // ── Buscar contacto existente ──────────────────────────────────────────

  let existingContact: { id: number; metadata: Record<string, unknown> | null } | null = null;

  // 1. Por id_supabase explícito
  if (record.id_supabase) {
    const id = parseInt(record.id_supabase, 10);
    if (!isNaN(id)) {
      const { data } = await supabase
        .from("wp_contactos")
        .select("id, metadata")
        .eq("id", id)
        .eq("empresa_id", EMPRESA_ID)
        .maybeSingle();
      if (data) existingContact = data;
    }
  }

  // 2. Por teléfono
  if (!existingContact && telefono) {
    const { data } = await supabase
      .from("wp_contactos")
      .select("id, metadata")
      .eq("empresa_id", EMPRESA_ID)
      .ilike("telefono", `%${telefono}`)
      .limit(1)
      .maybeSingle();
    if (data) existingContact = data;
  }

  // 3. Por email
  if (!existingContact && email) {
    const { data } = await supabase
      .from("wp_contactos")
      .select("id, metadata")
      .eq("empresa_id", EMPRESA_ID)
      .ilike("email", email)
      .limit(1)
      .maybeSingle();
    if (data) existingContact = data;
  }

  // ── Actualizar existente (merge de metadata) ───────────────────────────
  if (existingContact) {
    // Merge: metadata existente + datos del sheet (sheet sobreescribe claves propias)
    const mergedMetadata = {
      ...(existingContact.metadata ?? {}),
      ...sheetMeta,
    };

    const { error } = await supabase
      .from("wp_contactos")
      .update({
        estado: ESTADO_FIJO,
        es_calificado: "si",
        metadata: mergedMetadata,
        updated_at: new Date().toISOString(),
        ...(email ? { email } : {}),
        ...(telefono ? { telefono } : {}),
      })
      .eq("id", existingContact.id);

    if (error) return { action: "update_failed", error: error.message, nombre: nombre_completo ?? undefined };
    return { action: "updated", contacto_id: existingContact.id, nombre: nombre_completo ?? undefined };
  }

  // ── Crear nuevo contacto ───────────────────────────────────────────────
  const { data: nuevo, error: createError } = await supabase
    .from("wp_contactos")
    .insert({
      nombre,
      apellido,
      email,
      telefono,
      estado: ESTADO_FIJO,
      es_calificado: "si",
      empresa_id: EMPRESA_ID,
      metadata: sheetMeta,
      origen: "google_sheets_sync",
    })
    .select("id")
    .single();

  if (createError) return { action: "create_failed", error: createError.message, nombre: nombre_completo ?? undefined };
  return { action: "created", contacto_id: nuevo.id, nombre: nombre_completo ?? undefined };
}

// ─────────────────────────────────────────────
// HANDLER HTTP
// ─────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Acepta { records: [...] } o array directo
  const records: SheetRecord[] = Array.isArray(body)
    ? body
    : (body as { records?: SheetRecord[] }).records ?? [];

  if (records.length === 0) {
    return new Response(JSON.stringify({ error: "No records provided" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const results = await Promise.all(
    records.map((record) => processRecord(supabase, record))
  );

  const summary = {
    total: results.length,
    created: results.filter((r) => r.action === "created").length,
    updated: results.filter((r) => r.action === "updated").length,
    skipped: results.filter((r) => r.action === "skipped").length,
    failed: results.filter((r) => r.action.includes("failed")).length,
  };

  return new Response(JSON.stringify({ ok: true, summary, results }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
