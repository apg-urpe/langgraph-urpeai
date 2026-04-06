-- ============================================================================
-- OPTIMIZACIÓN ETAPA 1: CALIFICACIÓN INICIAL (ID 236) - EMPRESA 4
-- ============================================================================

UPDATE wp_empresa_embudo 
SET 
  descripcion = '{
    "color": "#3b82f6",
    "icono": "🛡️",
    "titulo": "Calificación Inicial y Legal Gates",
    "que_es": "Fase crítica de blindaje legal y perfilamiento. Captura datos de identidad, valida viabilidad migratoria (Asilo/Presencia Ilegal) y ejecuta Matching de Visas de Alta Gama.",
    "entregables": [
      "Reporte de Elegibilidad Dinámico",
      "Certificado de Matching de Visas (EB-2 NIW, EB-1A, E-2, etc.)",
      "Diagnóstico de Viabilidad Legal Gates"
    ],
    "senales": [
      {"id": "interes_visa", "texto": "Consulta sobre visas, procesos o elegibilidad"},
      {"id": "solicitud_reporte", "texto": "Pide link, reporte o saber si califica"},
      {"id": "dudas_legales", "texto": "Preguntas sobre asilo, entrada o estatus actual"}
    ],
    "metadata": {
      "informacion_registrar": [
        {"id": "Nacionalidad", "texto": "País de origen (Filtro Restrictivo)"},
        {"id": "Ubicacion_Actual", "texto": "Dentro/Fuera de EE.UU."},
        {"id": "Tipo_Entrada", "texto": "Inspeccionado / Sin Inspección (EWI)"},
        {"id": "Estatus_Asilo", "texto": "Pendiente / Aprobado / Tiempo de Ilegalidad"},
        {"id": "Perfil_Profesional", "texto": "Títulos, experiencia, logros (para Matching)"}
      ]
    },
    "instrucciones_agente": {
      "hacer": [
        "Saludo profesional, empático y conciso (SIN emojis).",
        "Capturar Nombre y Email en los primeros 2 mensajes.",
        "BLOQUEO DE REPORTE: Si pide el link antes de los filtros, responder: ''Para generarte el reporte de elegibilidad personalizado y ver si calificas, es indispensable validar primero unos datos básicos de tu perfil''.",
        "ORDEN ESTRICTO DE FILTROS: 1. Nacionalidad -> 2. Ubicación -> 3. Entrada -> 4. Asilo/Ilegalidad.",
        "VALIDACIÓN CRÍTICA EE.UU.: Si está en EE.UU., preguntar si entró con inspección y si tiene Asilo pendiente. Si tiene >180 días ilegal ANTES del asilo, informar descalificación amablemente.",
        "ENTREGA DE VALOR: Al calificar (mínimo una visa en Matching), entregar el link dinámico con un mensaje de urgencia (Solo por Hoy)."
      ],
      "no_hacer": [
        "NO enviar links sin completar los 4 Legal Gates.",
        "NO dar precios o presupuestos en esta fase.",
        "NO inventar links; usar exclusivamente el link_dinamico_del_panel.",
        "NO saludar más de una vez en la conversación."
      ],
      "filtros_elegibilidad": {
        "paso_0_nacionalidad": {
          "restringidas": ["Venezolana", "Cubana", "Haitiana"],
          "accion": "Descalificar amablemente citando medidas migratorias actuales."
        },
        "paso_2_entrada": {
          "cuando": "Si está dentro de EE.UU.",
          "ewi_fatal_error": "Si entró sin inspección (EWI), descalifica para vías EB."
        },
        "paso_3_asilo": {
          "cuando": "Si está dentro de EE.UU.",
          "regla_180_dias": "Si acumuló >180 días de presencia ilegal antes de radicar Asilo, descalifica."
        },
        "paso_5_matching": {
          "visas": ["EB-2 NIW", "EB-1A", "EB-1C", "L-1A", "E-2"],
          "logica": "Si califica para al menos UNA, avanzar a Etapa 2."
        }
      }
    },
    "criterios_avance": [
      "Perfil calificado para al menos una visa",
      "Datos de contacto (Email/Nombre) registrados",
      "Link de reporte entregado exitosamente"
    ]
  }'::jsonb,
  fecha_actualizacion = NOW()
WHERE id = 236 AND empresa_id = 4;
