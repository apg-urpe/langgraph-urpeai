// ============================================================
// IMPORTAR SHEET A SUPABASE - Monica CRM
// Empresa ID: 4
// Fecha: 2026-02-26
// ============================================================
// SEGUNDA CORRIDA (PAGINADA):
//   - Procesa en lotes de 200 filas para evitar timeout de 6 min
//   - Salta filas que ya tienen "Sincronizado" en columna H
//   - Marca columna H con resultado: ✅, ⚠️ o ❌
//   - Encuentra contactos existentes por teléfono + empresa_id
//   - Actualiza: es_calificado='si', estado='cliente', etapa_embudo=301
//   - Crea/actualiza wp_contacto_estado_embudo con etapa_actual=301
//   - NO duplica servicios, pagos ni notas (ya existen)
// ============================================================
// COLUMNAS: A=NOMBRE, B=CORREO, C=TELEFONO, D=TIPO TRAMITE,
//           E=VALOR CONTRATO, F=TOTAL ABONADO, G=SALDO PENDIENTE,
//           H=Sincronizado (se escribe automáticamente)
// ============================================================
// INSTRUCCIONES:
// 1. En tu Google Sheet: Extensiones → Apps Script
// 2. Borra todo y pega este código
// 3. Reemplaza SUPABASE_URL y SUPABASE_SERVICE_KEY con tus valores
// 4. Guarda (Ctrl+S), recarga el sheet
// 5. Clic en menú "📦 Monica Import" → "Actualizar contactos (paginado)"
// 6. Si no termina todos, vuelve a hacer clic — salta los ya sincronizados
// ============================================================

// CONFIGURACIÓN
const SUPABASE_URL = 'https://XXXXXXXX.supabase.co';      // ← tu Project URL
const SUPABASE_SERVICE_KEY = 'eyJhbGc...';                 // ← tu service_role key
const EMPRESA_ID = 4;
const ETAPA_EMBUDO_ID = 301;
const BATCH_SIZE = 200;          // Filas por ejecución (evita timeout 6 min)
const SYNC_COL = 8;              // Columna H = 8 (1-indexed)
const PAUSE_MS = 800;            // Pausa entre cada fila (ms)
const BATCH_PAUSE_MS = 2000;     // Pausa cada 50 filas (ms)

// ============================================================
// FUNCIÓN PRINCIPAL — PAGINADA CON COLUMNA SINCRONIZADO
// ============================================================
function actualizarContactos() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const lastRow = sheet.getLastRow();
  const totalFilas = lastRow - 1; // menos header
  
  if (totalFilas <= 0) {
    SpreadsheetApp.getUi().alert('No hay datos para procesar.');
    return;
  }

  // Asegurar que columna H tenga header
  if (sheet.getRange(1, SYNC_COL).getValue() !== 'Sincronizado') {
    sheet.getRange(1, SYNC_COL).setValue('Sincronizado');
  }

  let procesados = 0;
  let actualizados = 0;
  let noEncontrados = 0;
  let saltados = 0;
  let fallidos = 0;

  Logger.log('🚀 Iniciando actualización paginada. Total filas: ' + totalFilas + ', Lote: ' + BATCH_SIZE);

  for (let rowIdx = 2; rowIdx <= lastRow; rowIdx++) {
    // Leer columna H — si ya tiene marca, saltar
    const syncStatus = String(sheet.getRange(rowIdx, SYNC_COL).getValue()).trim();
    if (syncStatus.startsWith('✅') || syncStatus.startsWith('⚠️')) {
      saltados++;
      continue;
    }

    // Leer la fila completa
    const fila = sheet.getRange(rowIdx, 1, 1, 7).getValues()[0];
    const nombreCompleto = String(fila[0] || '').trim();
    if (!nombreCompleto) {
      sheet.getRange(rowIdx, SYNC_COL).setValue('⚠️ Fila vacía');
      continue;
    }

    const telefono = String(fila[2] || '').trim() || null;

    try {
      // =================================================================
      // 1. ENCONTRAR CONTACTO EXISTENTE
      // =================================================================
      let contactoId = null;

      if (telefono) {
        const existing = supabaseSelect('wp_contactos', 'empresa_id=eq.' + EMPRESA_ID + '&telefono=eq.' + telefono + '&select=id&limit=1');
        if (existing && existing.length > 0) {
          contactoId = existing[0].id;
        }
      }

      if (!contactoId) {
        noEncontrados++;
        sheet.getRange(rowIdx, SYNC_COL).setValue('⚠️ No encontrado');
        Logger.log('⚠️ Fila ' + rowIdx + ': No encontrado — ' + nombreCompleto);
        procesados++;
        if (procesados >= BATCH_SIZE) break;
        Utilities.sleep(PAUSE_MS);
        continue;
      }

      // =================================================================
      // 2. ACTUALIZAR CONTACTO: es_calificado, estado, etapa_embudo
      // =================================================================
      const updateRes = supabasePatch('wp_contactos', contactoId, {
        es_calificado: 'si',
        estado: 'cliente',
        etapa_embudo: ETAPA_EMBUDO_ID,
      });

      if (updateRes && updateRes.error) {
        throw new Error('Update: ' + JSON.stringify(updateRes));
      }

      // =================================================================
      // 3. UPSERT wp_contacto_estado_embudo (unique en contacto_id)
      // =================================================================
      const embudoRes = supabaseUpsert('wp_contacto_estado_embudo', {
        contacto_id: contactoId,
        empresa_id: EMPRESA_ID,
        etapa_actual: ETAPA_EMBUDO_ID,
        origen_cambio: 'sistema',
        notas: 'Importación sheet - Cliente con trámite activo',
        fecha_ingreso_embudo: new Date().toISOString(),
        fecha_ultimo_cambio: new Date().toISOString(),
      }, 'contacto_id');

      if (embudoRes && embudoRes.error) {
        throw new Error('Embudo: ' + JSON.stringify(embudoRes));
      }

      // Marcar como sincronizado con timestamp
      const ahora = Utilities.formatDate(new Date(), 'America/Bogota', 'dd/MM HH:mm');
      sheet.getRange(rowIdx, SYNC_COL).setValue('✅ ' + ahora + ' (id:' + contactoId + ')');
      actualizados++;

    } catch (e) {
      fallidos++;
      sheet.getRange(rowIdx, SYNC_COL).setValue('❌ ' + e.message.substring(0, 80));
      Logger.log('❌ Fila ' + rowIdx + ': ' + e.message);
    }

    procesados++;

    // Pausa extra cada 50 filas
    if (procesados % 50 === 0) {
      Logger.log('⏳ Progreso: ' + procesados + '/' + BATCH_SIZE + ' (actualizados: ' + actualizados + ')');
      Utilities.sleep(BATCH_PAUSE_MS);
    } else {
      Utilities.sleep(PAUSE_MS);
    }

    // Cortar si llegamos al límite del lote
    if (procesados >= BATCH_SIZE) break;
  }

  const pendientes = totalFilas - saltados - procesados;
  const resumen = 
    '✅ Actualizados: ' + actualizados +
    '\n⚠️ No encontrados: ' + noEncontrados +
    '\n❌ Fallidos: ' + fallidos +
    '\n⏭️ Saltados (ya sync): ' + saltados +
    '\n📊 Procesados este lote: ' + procesados + '/' + BATCH_SIZE +
    '\n📋 Pendientes: ' + Math.max(0, pendientes) +
    (pendientes > 0 ? '\n\n▶️ Ejecuta de nuevo para procesar el siguiente lote.' : '\n\n🎉 ¡Todos procesados!');

  Logger.log(resumen);
  SpreadsheetApp.getUi().alert('Lote completado', resumen, SpreadsheetApp.getUi().ButtonSet.OK);
}

// ============================================================
// HELPERS: Supabase REST API
// ============================================================

function supabaseInsert(tabla, datos) {
  const url = SUPABASE_URL + '/rest/v1/' + tabla;
  const options = {
    method: 'post',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
      'Prefer': 'return=representation',
    },
    payload: JSON.stringify(datos),
    muteHttpExceptions: true,
  };
  return JSON.parse(UrlFetchApp.fetch(url, options).getContentText());
}

function supabaseUpsert(tabla, datos, onConflict) {
  const url = SUPABASE_URL + '/rest/v1/' + tabla + '?on_conflict=' + onConflict;
  const options = {
    method: 'post',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
      'Prefer': 'return=representation,resolution=merge-duplicates',
    },
    payload: JSON.stringify(datos),
    muteHttpExceptions: true,
  };
  return JSON.parse(UrlFetchApp.fetch(url, options).getContentText());
}

function supabasePatch(tabla, id, datos) {
  const url = SUPABASE_URL + '/rest/v1/' + tabla + '?id=eq.' + id;
  const options = {
    method: 'patch',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
      'Prefer': 'return=representation',
    },
    payload: JSON.stringify(datos),
    muteHttpExceptions: true,
  };
  return JSON.parse(UrlFetchApp.fetch(url, options).getContentText());
}

function supabaseSelect(tabla, filtros) {
  const url = SUPABASE_URL + '/rest/v1/' + tabla + '?' + filtros;
  const options = {
    method: 'get',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
    },
    muteHttpExceptions: true,
  };
  return JSON.parse(UrlFetchApp.fetch(url, options).getContentText());
}

// ============================================================
// MENÚ EN EL SHEET
// ============================================================
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📦 Monica Import')
    .addItem('Actualizar contactos (paginado)', 'actualizarContactos')
    .addToUi();
}
