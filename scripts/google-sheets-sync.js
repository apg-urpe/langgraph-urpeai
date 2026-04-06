// ============================================================
// Apps Script - Sync Google Sheet → n8n → Supabase (empresa_id=4)
// Pegar en: Extensiones → Apps Script → Nuevo proyecto
// ============================================================

const WEBHOOK_URL = "https://n8n.urpeailab.com/webhook/3b7416fe-5c8f-4231-ac03-1456ee40f6d0";
const SHEET_NAME = "EB-2 NIW"; // Cambia si tu hoja tiene otro nombre
const BATCH_SIZE = 20; // Registros por envío (evita timeout)

// Mapeo de columnas (índice 0 = columna A)
const COLUMNS = {
  nombre: 0,
  estado: 1,
  ciudad: 2,
  nacionalidad: 3,
  complementos: 4,
  asesor_venta: 5,
  email: 6,
  telefono: 7,
  proceso: 8,
  fecha_contrato: 9,
  asesor: 10,
  estado_pago: 11,
  cliente_preferencial: 12,
  observacion: 13,
  estado_supabase: 14,
  correo_bienvenida: 15,
  carpeta_reunion_consentimiento: 16,
  formulario_i140: 17,
  revision_expediente: 18,
  formularios: 19,
  patente: 20,
  libro_tecnico: 21,
  proyecto_business_plan: 22,
  piloto: 23,
  proyecto_finalizado: 24,
  casos_estudios: 25,
  whitepaper_tecnico: 26,
  estudio_econometrico: 27,
  website_tecnico: 28,
  creativos_logos: 29,
  acreditaciones: 30,
  cartas_recomendacion: 31,
  carta_innovacion: 32,
  carta_intencion: 33,
  carta_autopeticion: 34,
  policy_paper: 35,
  paquete_final: 36,
  id_supabase: 37,
  paquete_enviado: 38,
  fecha_radicado: 39,
  ioe: 40,
  monitoreo_ioe: 41,
  fecha_ultima_gestion: 42,
  sync_status: 43, // Columna extra para marcar sincronización
};

function formatDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().split("T")[0];
  return String(value).trim() || null;
}

function formatRow(row) {
  const get = (key) => {
    const val = row[COLUMNS[key]];
    if (val === undefined || val === null || val === "") return null;
    return String(val).trim();
  };

  return {
    nombre: get("nombre"),
    estado: get("estado"),
    ciudad: get("ciudad"),
    nacionalidad: get("nacionalidad"),
    complementos: get("complementos"),
    asesor_venta: get("asesor_venta"),
    email: get("email"),
    telefono: get("telefono"),
    proceso: get("proceso"),
    fecha_contrato: formatDate(row[COLUMNS["fecha_contrato"]]),
    asesor: get("asesor"),
    estado_pago: get("estado_pago"),
    cliente_preferencial: get("cliente_preferencial"),
    observacion: get("observacion"),
    estado_supabase: get("estado_supabase"),
    correo_bienvenida: get("correo_bienvenida"),
    carpeta_reunion_consentimiento: get("carpeta_reunion_consentimiento"),
    formulario_i140: get("formulario_i140"),
    revision_expediente: get("revision_expediente"),
    formularios: get("formularios"),
    patente: get("patente"),
    libro_tecnico: get("libro_tecnico"),
    proyecto_business_plan: get("proyecto_business_plan"),
    piloto: get("piloto"),
    proyecto_finalizado: get("proyecto_finalizado"),
    casos_estudios: get("casos_estudios"),
    whitepaper_tecnico: get("whitepaper_tecnico"),
    estudio_econometrico: get("estudio_econometrico"),
    website_tecnico: get("website_tecnico"),
    creativos_logos: get("creativos_logos"),
    acreditaciones: get("acreditaciones"),
    cartas_recomendacion: get("cartas_recomendacion"),
    carta_innovacion: get("carta_innovacion"),
    carta_intencion: get("carta_intencion"),
    carta_autopeticion: get("carta_autopeticion"),
    policy_paper: get("policy_paper"),
    paquete_final: get("paquete_final"),
    id_supabase: get("id_supabase"),
    paquete_enviado: get("paquete_enviado"),
    fecha_radicado: formatDate(row[COLUMNS["fecha_radicado"]]),
    ioe: get("ioe"),
    monitoreo_ioe: get("monitoreo_ioe"),
    fecha_ultima_gestion: formatDate(row[COLUMNS["fecha_ultima_gestion"]]),
  };
}

function sendBatch(records) {
  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ records }),
    muteHttpExceptions: true,
  };

  const response = UrlFetchApp.fetch(WEBHOOK_URL, options);
  const code = response.getResponseCode();
  const body = response.getContentText();

  Logger.log(`Batch enviado: ${records.length} registros → HTTP ${code}`);
  if (code !== 200) {
    Logger.log(`Error: ${body}`);
  }

  return { code, body };
}

// Función principal — ejecutar manualmente o con trigger
function syncToSupabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME) || ss.getActiveSheet();
  const data = sheet.getDataRange().getValues();

  // Fila 1 = headers, empezamos desde fila 2 (índice 1)
  const rows = data.slice(1).filter((row, i) => {
    const nombre = String(row[COLUMNS.nombre] || "").trim();
    const syncStatus = String(row[COLUMNS.sync_status] || "").trim();
    return nombre.length > 0 && syncStatus !== "✅"; // Ignorar filas ya sincronizadas
  });

  Logger.log(`Total registros a procesar: ${rows.length}`);

  const records = rows.map((row, i) => ({
    row_index: i + 2, // Número de fila real en el sheet (para debug)
    ...formatRow(row),
  }));

  // Enviar en batches
  let sent = 0;
  let errors = 0;

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const result = sendBatch(batch);
    if (result.code === 200) {
      sent += batch.length;
    } else {
      errors += batch.length;
    }
    Utilities.sleep(500); // Pausa entre batches
  }

  const msg = `✅ Sync completado: ${sent} enviados, ${errors} errores`;
  Logger.log(msg);
  SpreadsheetApp.getUi().alert(msg);
}

// Agrega un menú personalizado al abrir el sheet
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("🔄 Sync Supabase")
    .addItem("Enviar todos los registros", "syncToSupabase")
    .addToUi();
}
