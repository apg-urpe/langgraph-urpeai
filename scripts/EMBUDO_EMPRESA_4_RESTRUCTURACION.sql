-- ============================================================================
-- REESTRUCTURACIÓN COMPLETA DEL EMBUDO - EMPRESA 4
-- ============================================================================

-- ETAPA 1: CALIFICACIÓN INICIAL (ID 236)
-- Estilo visual unificado + Lógica de filtrado legal estricto.
UPDATE wp_empresa_embudo 
SET 
  nombre_etapa = 'ETAPA 1: Calificación Inicial',
  orden_etapa = 1,
  descripcion = '{
    "color": "#3b82f6",
    "icono": "📋",
    "titulo": "Calificación Inicial",
    "que_es": "Primer contacto. Captura datos básicos y ejecuta filtros de elegibilidad legales (Nacionalidad, Presencia Ilegal y Asilo) y Matching Dinámico de Visas.",
    "entregables": [
      "Reporte de Elegibilidad personalizado",
      "Validación de Legal Gates (Asilo/Ilegalidad)",
      "Matching de Visas (EB-2 NIW, EB-1A, etc.)"
    ],
    "acciones_agente": [
      "Capturar Nombre y Correo tempranamente",
      "Ejecutar filtros en orden: Nacionalidad -> Ubicación -> Entrada -> Asilo",
      "Entregar link de reporte solo tras calificar"
    ],
    "criterios_avance": [
      "Resultado_Calificacion_Final = ''Calificado''",
      "Correo electrónico capturado",
      "Nacionalidad permitida validada"
    ],
    "instrucciones_agente": "Eres un experto en inmigración. Tu prioridad es filtrar con precisión. NO envíes links prematuros. Si el usuario está en EE.UU., pregunta por estatus de Asilo e inspección de entrada (EWI) antes de avanzar."
  }'::jsonb,
  fecha_actualizacion = NOW()
WHERE id = 236 AND empresa_id = 4;

-- ETAPA 2: AGENDAMIENTO Y RECONEXIÓN (ID 237)
-- Fusión de Agendamiento con lógica de Reconexión para prospectos que dudan.
UPDATE wp_empresa_embudo 
SET 
  nombre_etapa = 'ETAPA 2: Agendamiento y Reconexión',
  orden_etapa = 2,
  descripcion = '{
    "color": "#8b5cf6",
    "icono": "🤝",
    "titulo": "Agendamiento y Reconexión",
    "que_es": "Lead calificado. Objetivo: Lograr la cita legal. Si el prospecto duda o deja de responder, aplicar tácticas de reconexión y confianza.",
    "entregables": [
      "Cita confirmada en calendario",
      "Teléfono de contacto validado",
      "Objeciones resueltas (Costo $0, Metodología)"
    ],
    "acciones_agente": [
      "Presentar llamada gratuita como oportunidad de alta demanda",
      "Capturar teléfono (OBLIGATORIO para agendar)",
      "Si hay silencio: Reafirmar gratuidad y acreditación BBB",
      "Proponer 2-3 horarios usando herramientas de disponibilidad"
    ],
    "criterios_avance": [
      "Evento creado exitosamente en calendario",
      "Teléfono registrado en perfil",
      "Confirmación de asistencia recibida"
    ],
    "instrucciones_agente": "Fase de alta conversión. Usa la escasez de cupos. Si el usuario pregunta por costos, recuerda que la consulta de elegibilidad es $0. No des precios de trámites."
  }'::jsonb,
  fecha_actualizacion = NOW()
WHERE id = 237 AND empresa_id = 4;

-- ETAPA 3: PREPARACIÓN ESTRATÉGICA (ID 238)
-- Mejora de título y enfoque en la preparación previa a la consulta.
UPDATE wp_empresa_embudo 
SET 
  nombre_etapa = 'ETAPA 3: Preparación Estratégica',
  orden_etapa = 3,
  descripcion = '{
    "color": "#06b6d4",
    "icono": "🎓",
    "titulo": "Preparación Estratégica",
    "que_es": "Prospecto con cita agendada. Se asegura que llegue a la consulta con el contexto correcto y expectativas alineadas.",
    "entregables": [
      "Recordatorio de cita enviado",
      "Instrucciones de conexión (Link Zoom/Meet)",
      "Contexto de la metodología 8 Pilares"
    ],
    "acciones_agente": [
      "Confirmar detalles de la cita (Hora/Link)",
      "Resolver dudas logísticas previas",
      "Usar reagendar_actualizar si el usuario lo solicita"
    ],
    "criterios_avance": [
      "Asistencia confirmada 24h antes",
      "Usuario tiene el link de acceso",
      "Dudas logísticas resueltas"
    ],
    "instrucciones_agente": "Actúa como soporte premium. Tu meta es que el prospecto NO falte a la cita. Si intenta cancelar, ofrece reagendar inmediatamente."
  }'::jsonb,
  fecha_actualizacion = NOW()
WHERE id = 238 AND empresa_id = 4;

-- ETAPA 4: CITA REALIZADA (ID 240)
-- Anteriormente 'Cita Agendada'. Ahora es la etapa post-reunión.
UPDATE wp_empresa_embudo 
SET 
  nombre_etapa = 'ETAPA 4: Cita Realizada',
  orden_etapa = 4,
  descripcion = '{
    "color": "#10b981",
    "icono": "✅",
    "titulo": "Cita Realizada",
    "que_es": "El prospecto ya asistió a la consulta legal con el asesor humano.",
    "entregables": [
      "Resumen de la consulta",
      "Validación de interés post-llamada",
      "Siguiente paso comercial definido"
    ],
    "acciones_agente": [
      "Preguntar cómo le fue en la llamada",
      "Validar si quedaron dudas pendientes",
      "Escalar a humano si el prospecto pide contrato"
    ],
    "criterios_avance": [
      "Decisión comercial tomada",
      "Contrato solicitado o dudas resueltas"
    ],
    "instrucciones_agente": "Post-venta inmediata. Escucha activamente. El usuario ya habló con un humano, mantén un tono de seguimiento profesional y cercano."
  }'::jsonb,
  fecha_actualizacion = NOW()
WHERE id = 240 AND empresa_id = 4;

-- ETAPA 5: SEGUIMIENTO (ID 239)
-- Anteriormente 'Reconexión'. Ahora es mantenimiento de base.
UPDATE wp_empresa_embudo 
SET 
  nombre_etapa = 'ETAPA 5: Seguimiento',
  orden_etapa = 5,
  descripcion = '{
    "color": "#f59e0b",
    "icono": "⏳",
    "titulo": "Seguimiento",
    "que_es": "Prospectos que no avanzaron de inmediato pero mantienen el perfil calificado.",
    "entregables": [
      "Contenido de valor periódico",
      "Noticias migratorias relevantes",
      "Recordatorios de beneficios"
    ],
    "acciones_agente": [
      "Mantener el interés con actualizaciones",
      "Preguntar por cambios en el perfil profesional",
      "Reiniciar flujo de agendamiento si hay re-interés"
    ],
    "criterios_avance": [
      "Re-agendamiento exitoso",
      "Interés reactivado para contrato"
    ],
    "instrucciones_agente": "Mantenimiento. No presiones, aporta valor. Si el usuario reacciona positivamente, guíalo de vuelta a agendar una nueva consulta de actualización."
  }'::jsonb,
  fecha_actualizacion = NOW()
WHERE id = 239 AND empresa_id = 4;
