-- ============================================================================
-- REESTRUCTURACIÓN COMPLETA DEL EMBUDO - EMPRESA 4 (CORREGIDO)
-- ============================================================================

-- PASO 1: ASIGNAR ÓRDENES TEMPORALES PARA EVITAR CONFLICTOS DE RESTRICCIÓN ÚNICA
UPDATE wp_empresa_embudo SET orden_etapa = orden_etapa + 100 WHERE empresa_id = 4;

-- ETAPA 1: CALIFICACIÓN INICIAL (ID 236)
UPDATE wp_empresa_embudo 
SET 
  nombre_etapa = 'ETAPA 1: Calificación Inicial',
  orden_etapa = 1,
  descripcion = '{
    "color": "#3b82f6",
    "icono": "📋",
    "titulo": "Calificación Inicial",
    "que_es": "Primer contacto. Captura datos básicos y ejecuta filtros de elegibilidad legales (Nacionalidad, Presencia Ilegal y Asilo) y Matching Dinámico de Visas.",
    "entregables": ["Reporte de Elegibilidad personalizado", "Validación de Legal Gates", "Matching de Visas"],
    "acciones_agente": ["Capturar Nombre y Correo temprano", "Ejecutar filtros en orden estricto", "Entregar link solo tras calificar"],
    "criterios_avance": ["Resultado_Calificacion_Final = ''Calificado''", "Correo capturado", "Nacionalidad validada"],
    "instrucciones_agente": "Experto en inmigración. Filtra con precisión. NO envíes links prematuros. Valida estatus de Asilo e inspección de entrada si está en EE.UU."
  }'::jsonb,
  fecha_actualizacion = NOW()
WHERE id = 236 AND empresa_id = 4;

-- ETAPA 2: AGENDAMIENTO Y RECONEXIÓN (ID 237)
UPDATE wp_empresa_embudo 
SET 
  nombre_etapa = 'ETAPA 2: Agendamiento y Reconexión',
  orden_etapa = 2,
  descripcion = '{
    "color": "#8b5cf6",
    "icono": "🤝",
    "titulo": "Agendamiento y Reconexión",
    "que_es": "Lead calificado. Objetivo: Lograr la cita legal. Aplicar tácticas de reconexión y confianza si hay dudas.",
    "entregables": ["Cita confirmada", "Teléfono validado", "Objeciones resueltas"],
    "acciones_agente": ["Presentar llamada como oportunidad escasa", "Capturar teléfono (OBLIGATORIO)", "Reafirmar gratuidad y BBB si hay silencio", "Proponer horarios con tools"],
    "criterios_avance": ["Evento creado", "Teléfono registrado", "Asistencia confirmada"],
    "instrucciones_agente": "Alta conversión. Usa la escasez. Consulta de elegibilidad es $0. No des precios de trámites."
  }'::jsonb,
  fecha_actualizacion = NOW()
WHERE id = 237 AND empresa_id = 4;

-- ETAPA 3: PREPARACIÓN ESTRATÉGICA (ID 238)
UPDATE wp_empresa_embudo 
SET 
  nombre_etapa = 'ETAPA 3: Preparación Estratégica',
  orden_etapa = 3,
  descripcion = '{
    "color": "#06b6d4",
    "icono": "🎓",
    "titulo": "Preparación Estratégica",
    "que_es": "Prospecto con cita agendada. Asegura contexto correcto y expectativas alineadas para la consulta.",
    "entregables": ["Recordatorio enviado", "Instrucciones de conexión", "Contexto 8 Pilares"],
    "acciones_agente": ["Confirmar Hora/Link", "Resolver dudas logísticas", "Reagendar si se solicita"],
    "criterios_avance": ["Asistencia confirmada 24h antes", "Usuario tiene link de acceso"],
    "instrucciones_agente": "Soporte premium. Evita el No-Show. Si intenta cancelar, ofrece reagendar inmediatamente."
  }'::jsonb,
  fecha_actualizacion = NOW()
WHERE id = 238 AND empresa_id = 4;

-- ETAPA 4: CITA REALIZADA (ID 240)
UPDATE wp_empresa_embudo 
SET 
  nombre_etapa = 'ETAPA 4: Cita Realizada',
  orden_etapa = 4,
  descripcion = '{
    "color": "#10b981",
    "icono": "✅",
    "titulo": "Cita Realizada",
    "que_es": "El prospecto ya asistió a la consulta legal con el asesor humano.",
    "entregables": ["Resumen de consulta", "Validación de interés post-llamada", "Siguiente paso comercial"],
    "acciones_agente": ["Preguntar cómo le fue", "Validar dudas pendientes", "Escalar si pide contrato"],
    "criterios_avance": ["Decisión comercial tomada", "Contrato solicitado"],
    "instrucciones_agente": "Post-venta profesional. El usuario ya habló con un humano, mantén un tono de seguimiento cercano."
  }'::jsonb,
  fecha_actualizacion = NOW()
WHERE id = 240 AND empresa_id = 4;

-- ETAPA 5: SEGUIMIENTO (ID 239)
UPDATE wp_empresa_embudo 
SET 
  nombre_etapa = 'ETAPA 5: Seguimiento',
  orden_etapa = 5,
  descripcion = '{
    "color": "#f59e0b",
    "icono": "⏳",
    "titulo": "Seguimiento",
    "que_es": "Prospectos calificados que no avanzaron de inmediato.",
    "entregables": ["Contenido de valor", "Noticias migratorias", "Recordatorios"],
    "acciones_agente": ["Mantener interés", "Preguntar por cambios de perfil", "Reiniciar agendamiento si hay re-interés"],
    "criterios_avance": ["Re-agendamiento exitoso", "Interés reactivado"],
    "instrucciones_agente": "Mantenimiento. No presiones, aporta valor. Si reacciona bien, llévalo a una nueva consulta."
  }'::jsonb,
  fecha_actualizacion = NOW()
WHERE id = 239 AND empresa_id = 4;

-- PASO FINAL: RESTAURAR ÓRDENES DE ETAPAS POSTERIORES (SI EXISTIERAN)
UPDATE wp_empresa_embudo 
SET orden_etapa = orden_etapa - 100 
WHERE empresa_id = 4 AND orden_etapa > 100;
