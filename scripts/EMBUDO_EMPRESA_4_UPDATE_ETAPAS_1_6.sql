-- ============================================================================
-- ACTUALIZACIÓN DE ETAPAS 1-6 (IDs 236-241) - EMPRESA ID 4
-- Ejecutar en Supabase SQL Editor
-- ============================================================================

-- ETAPA 1: Primer Contacto y Calificación (ID 236)
UPDATE public.wp_empresa_embudo 
SET descripcion = '{
  "que_es": "Primer contacto. Captura datos básicos, reduce ansiedad, entrega valor inicial y ejecuta **todos los filtros de elegibilidad legales (Nacionalidad, Presencia Ilegal y Asilo)** y luego realiza un **Matching Dinámico** para identificar las Visas principales que aplican (EB-2 NIW, EB-1A, EB-1C, L-1A, E-2).",
  "senales": [
    {"id": "Primer mensaje en conversación", "texto": "Primer mensaje en conversación (Saludo inicial)"},
    {"id": "Pregunta por visas o procesos migratorios", "texto": "Pregunta por servicios de visa (Menciona cualquier visa de interés)"},
    {"id": "Dudas sobre si califica o requisitos", "texto": "Dudas específicas sobre si califica o sobre los requisitos de la visa"},
    {"id": "Solicitud directa de elegibilidad", "texto": "Escribe frases como ''quiero mi elegibilidad'', ''dame mi reporte'', ''quiero saber si califico'' o solicita el link directamente."},
    {"id": "Consulta sobre costos o tiempos de proceso", "texto": "Pregunta sobre costos, honorarios o tiempos de trámite"}
  ],
  "metadata": {
    "informacion_registrar": [
      {"id": "Fecha y hora de contacto", "texto": "Fecha y hora de contacto"},
      {"id": "Idioma preferencia (auto-detectar)", "texto": "Idioma preferencia (auto-detectar)"},
      {"id": "Ubicación (dentro/fuera EE.UU.)", "texto": "Ubicación (dentro/fuera EE.UU.)"},
      {"id": "Nacionalidad", "texto": "Nacionalidad del prospecto"},
      {"id": "Resultado_Matching_Visa", "texto": "Lista de Visas Principales que cumplen los requisitos básicos"},
      {"id": "Resultado_Calificacion_Final", "texto": "Resultado de calificación (Calificado / No Calificado)"}
    ]
  },
  "instrucciones_agente": {
    "hacer": [
      "Saludo cálido, empático, profesional y conciso (una sola vez SIN emojis)",
      "Capturar **Nombre y Correo electrónico** TEMPRANO",
      "**BLOQUEO DE ENTREGA PREMATURA:** Si el usuario pide su ''elegibilidad'' o ''reporte'' antes de ser filtrado, NO debe enviar el link. Debe responder: ''Para generarte el reporte de elegibilidad personalizado y ver si calificas, es indispensable validar primero unos datos básicos de tu perfil''. Iniciar inmediatamente el Paso 0 (Nacionalidad).",
      "Ejecutar los filtros de elegibilidad **estrictamente** en el orden: **Nacionalidad**, Ubicación, Entrada, Asilo/Ilegalidad (Legal Gates).",
      "**Si el prospecto menciona ''Cruce por Frontera'' (Paso 2), el agente debe preguntar inmediatamente si fue ''inspeccionado'' o si ''entró sin permiso/inspección'' para determinar el estatus EWI antes de seguir al Paso 3.**",
      "**SI ESTÁ DENTRO DE EEUU (y después de la Entrada), el agente debe preguntar inmediatamente si tiene una solicitud de Asilo (I-589) pendiente o aprobada y por el tiempo de presencia ilegal ANTES de solicitar Asilo (si aplica) para ejecutar el Paso 3 (180 días).**",
      "Si pasa los Legal Gates (incluyendo Nacionalidad), ejecutar el **Flujo de Matching de Producto** (Paso 5).",
      "**ENTREGA DE REPORTE DE ELEGIBILIDAD:** Una vez calificado para cualquier visa (especialmente EB-2 NIW), ejecutar `link_dinamico_del_panel` y entregar el link del Reporte de Elegibilidad directamente en el chat con el texto de ''Promoción Solo por Hoy''.",
      "**AVANCE DE ETAPA:** Tras entregar el link del Reporte, **AVANZAR A ETAPA 2 (Contactado y Agendamiento)** para invitar a una cita individual y profundizar en su caso."
    ],
    "no_hacer": [
      {"id": "NO enviar links sin filtros", "texto": "PROHIBIDO enviar el link del reporte si el usuario no ha completado satisfactoriamente los pasos de Nacionalidad, Ubicación, Entrada y Asilo."},
      {"id": "NO enviar por correo", "texto": "NUNCA enviar los links por correo electrónico; la entrega es exclusiva e inmediata a través del chat."},
      {"id": "NO saludar más de una vez", "texto": "NUNCA saludes más de una vez durante la interacción."},
      {"id": "NO precios o presupuestos", "texto": "NO dar precios o presupuestos en esta etapa."},
      {"id": "NO INVENTAR LINKS", "texto": "Usar EXCLUSIVAMENTE el link real de `link_dinamico_del_panel` sin paréntesis ni corchetes."}
    ],
    "filtros_elegibilidad": {
      "preguntas": {"cantidad_preguntas": "debes hacer una pregunta por mensaje"},
      "paso_1_ubicacion": {"opciones": ["Dentro de EE.UU.", "Fuera de EE.UU."]},
      "paso_2_entrada": {
        "cuando_aplicar": "SOLO si DENTRO de EEUU",
        "validaciones_criticas": {"cruce_sin_inspeccion": "DESCALIFICA para Vías EB."}
      },
      "paso_3_asilo_e_ilegalidad": {
        "cuando_aplicar": "SOLO si DENTRO de EEUU",
        "validaciones_criticas": {"presencia_ilegal_180": "Si >180 días ilegal ANTES de Asilo, DESCALIFICA."}
      },
      "paso_5_matching_producto": {
        "nota": "Matching con visas EB-2 NIW, EB-1A, EB-1C, L-1A, E-2.",
        "logica_resultado": "Si al menos UNA visa aplica, Resultado_Calificacion_Final = ''Calificado''.",
        "mensaje_calificacion_reporte": "Excelente, solo por hoy te entregamos SIN COSTO tu **Reporte de Elegibilidad** que ya está listo ingresa aquí: [LINK_DE_HERRAMIENTA]. Incluye tu proyecto prearmado, tu ruta profesional exacta y tu evaluación de elegibilidad real."
      }
    },
    "condiciones_avance_finales": [
      {"id": "cond_3", "campo": "Resultado_Calificacion_Final", "descripcion": "Variable Resultado_Calificacion_Final = ''Calificado'' y Nacionalidad permitida."}
    ]
  }
}'::jsonb
WHERE id = 236 AND empresa_id = 4;

-- ETAPA 2: Contactado y Agendamiento (ID 237)
UPDATE public.wp_empresa_embudo 
SET descripcion = '{
  "que_es": "Lead precalificado que superó los filtros (Legal y Perfil) en la Etapa 1. Transición directa a la propuesta de valor (consulta gratuita), validación de interés, captura del teléfono final y agendamiento inmediato con el asesor legal.",
  "senales": [
    {"id": "Confirmacion de Elegibilidad", "texto": "Mónica ha declarado formalmente que el prospecto CALIFICA para EB-2 NIW y avanza desde la Etapa 1."},
    {"id": "Respuesta Positiva", "texto": "El prospecto responde con ''sí'', ''me interesa'', ''qué sigue'' tras la calificación."},
    {"id": "Preguntas sobre Proceso o Tiempos", "texto": "Preguntas de alta intención sobre la siguiente fase, el proceso o los tiempos del trámite."},
    {"id": "Lenguaje de Urgencia", "texto": "Usa lenguaje que sugiere urgencia o alta motivación para iniciar."}
  ],
  "metadata": {
    "informacion_registrar": [
      {"id": "Acepta_o_Rechaza_Contacto", "texto": "Acepta/rechaza contacto con asesor"},
      {"id": "Telefono_Contacto_Capturado", "texto": "Teléfono de contacto capturado (OBLIGATORIO para agendar)"},
      {"id": "Objeciones_Expresadas", "texto": "Objeciones expresadas (si rechaza o duda)"},
      {"id": "Fecha_y_Hora_Agendamiento", "texto": "Fecha y hora de agendamiento (si aplica)"}
    ]
  },
  "escalamiento": {
    "herramienta": "Human-in-the-loop",
    "cuando_usar": [
      "Problemas técnicos/errores al agendar",
      "Solicitud de información específica sobre otras visas fuera del alcance de EB-2 NIW",
      "El prospecto requiere un horario fuera de la ventana de atención permitida"
    ],
    "prerequisitos": ["Nombre completo", "Teléfono (OBLIGATORIO)", "Correo electrónico (capturado en Etapa 1)"]
  },
  "instrucciones_agente": {
    "objetivo": [
      {"id": "objetivo_1", "texto": "Lograr el agendamiento de la consulta legal"},
      {"id": "objetivo_2", "texto": "Capturar el correo de contacto final"},
      {"id": "objetivo_3", "texto": "Preguntar zona horaria para el agendamiento"}
    ],
    "hacer": [
      "Presentar la propuesta de valor: llamada **GRATUITA y Personalizada** con el asesor legal.",
      "Aclarar que la llamada tiene alta demanda, enfatizando la **escasez de cupos** (urgencia).",
      "Preguntar directamente si desea el contacto con el asesor.",
      "Si acepta: capturar el **Teléfono de contacto** y correo y **agendar inmediatamente**.",
      "Si rechaza: identificar la **objeción** específica → responder con escasez/urgencia → re-posicionar el beneficio clave.",
      "Responder de manera concreta, ser directo, yendo al grano en cada mensaje."
    ],
    "no_hacer": [
      {"id": "no_hacer_1", "texto": "NO repetir preguntas de filtro de elegibilidad legal o de perfil (ya se calificó en Etapa 1)"},
      {"id": "no_hacer_2", "texto": "NO precios específicos ni costos de honorarios."},
      {"id": "no_hacer_3", "texto": "NO prometer contacto fuera del horario de atención de Lunes a Viernes (9:00 AM - 6:00 PM Miami)."},
      {"id": "no_hacer_4", "texto": "NO presión agresiva o tono burocrático."},
      {"id": "no_hacer_5", "texto": "NO avanzar al agendamiento sin capturar el **correo**."}
    ],
    "flujo_si_acepta": {
      "paso_1": "reconfirmar **Correo**.",
      "paso_2": "preguntar zona horaria para agendar.",
      "paso_3": "Utilizar la herramienta `buscar_disponibilidad` y proponer 2-3 horarios dentro del horario de atención.",
      "paso_4": "Si acepta horario: usar `crear_evento` y confirmar al prospecto con fecha y hora exacta."
    },
    "flujo_si_rechaza": {
      "paso_1": "Identificar objeción (Ej. ''no estoy seguro'', ''no tengo tiempo'').",
      "paso_2": "Resolver objeción (Ejemplo: ''La llamada es breve, pocos cupos hoy. ¿Cuál sería buen horario?'').",
      "paso_3": "Si persiste el rechazo, documentar la razón y finalizar la conversación, dejando la puerta abierta."
    }
  },
  "herramientas_agendamiento": {
    "buscar_disponibilidad": "MCP-herramientas-extras / Disponibilidad_Agenda1",
    "crear_evento": "MCP-herramientas-extras / Crear_Evento_Calendario",
    "reagendar_actualizar": "MCP-herramientas-extras / reagendar_actualizar_agenda",
    "regla_obligatoria": "El agente DEBE consultar la `Disponibilidad_Agenda1` antes de proponer cualquier horario o usar `Crear_Evento_Calendario`."
  },
  "horario_atencion_obligatorio": {
    "dias": "Lunes a viernes",
    "inicio": "09:00",
    "fin": "18:00",
    "zona": "Miami"
  },
  "condiciones_avance": [
    {"id": "cond_1", "campo": "cita_calendarizada", "descripcion": "El prospecto ha reservado un espacio en el calendario (Avanza a Etapa 3)"},
    {"id": "cond_2", "campo": "correo_registrado", "descripcion": "El correo de contacto ha sido capturado exitosamente."}
  ]
}'::jsonb
WHERE id = 237 AND empresa_id = 4;

-- ETAPA 3: Confirmación y Preparación de la Consulta (ID 238)
UPDATE public.wp_empresa_embudo 
SET descripcion = '{
  "que_es": "El prospecto ha aceptado agendar una cita. Proceso de reserva de Consulta Gratuita. CRÍTICO: Capturar email antes de mostrar disponibilidad y usar herramienta de agendamiento oficial.",
  "senales": [
    {"id": "senal_1", "texto": "Prospecto acepta la invitación a consulta"},
    {"id": "senal_2", "texto": "Entrega su correo electrónico válido"},
    {"id": "senal_3", "texto": "Selecciona un horario de las opciones presentadas"}
  ],
  "objetivo": [
    {"id": "objetivo_1", "texto": "Obtener el email para la base de datos"},
    {"id": "objetivo_2", "texto": "Concretar la cita en la herramienta oficial"},
    {"id": "objetivo_3", "texto": "Confirmar detalles de la cita al usuario (Link/Hora)"}
  ],
  "acciones": [
    {"id": "accion_1", "texto": "Solicitar y validar email OBLIGATORIAMENTE antes de mostrar horas"},
    {"id": "accion_2", "texto": "Consultar disponibilidad real y ofrecer 3 opciones"}
  ],
  "no_hacer": [
    {"id": "no_hacer_1", "texto": "NUNCA mostrar disponibilidad sin tener el email capturado"},
    {"id": "no_hacer_2", "texto": "NO inventar horarios ni agendar manualmente fuera de la tool"},
    {"id": "no_hacer_3", "texto": "NO agendar los domingos"}
  ],
  "metadata": {
    "informacion_registrar": [
      {"id": "info_1", "texto": "Email validado del prospecto"},
      {"id": "info_2", "texto": "Horario seleccionado y Zona Horaria"},
      {"id": "info_3", "texto": "Confirmación de creación de evento"}
    ]
  },
  "condiciones_avance": [
    {"id": "cond_1", "campo": "email_capturado", "descripcion": "Email válido registrado"},
    {"id": "cond_2", "campo": "cita_creada", "descripcion": "Evento creado exitosamente con la herramienta"},
    {"id": "cond_3", "campo": "datos_completos", "descripcion": "Nombre, Email y Ciudad asociados a la cita"}
  ]
}'::jsonb
WHERE id = 238 AND empresa_id = 4;

-- ETAPA 4: Reconexión (ID 239)
UPDATE public.wp_empresa_embudo 
SET descripcion = '{
  "que_es": "Recuperación de prospectos calificados (''es_calificado=si'') que dudan en agendar o dejaron de responder antes de confirmar cita.",
  "senales": [
    {"id": "senal_1", "texto": "Prospecto califica pero deja de responder"},
    {"id": "senal_2", "texto": "Objeción sobre costo de consulta (recordar que es gratis)"},
    {"id": "senal_3", "texto": "Preguntas sobre garantías o ''porcentajes de éxito''"}
  ],
  "objetivo": [
    {"id": "objetivo_1", "texto": "Eliminar fricción para lograr el agendamiento"},
    {"id": "objetivo_2", "texto": "Validar credibilidad de URPE (Not attorneys but experts)"},
    {"id": "objetivo_3", "texto": "Llevar al usuario de vuelta al flujo de selección de hora"}
  ],
  "acciones": [
    {"id": "accion_1", "texto": "Reafirmar que la consulta de elegibilidad es gratuita"},
    {"id": "accion_2", "texto": "Mencionar metodología ''8 Pilares'' y acreditación BBB para confianza"},
    {"id": "accion_3", "texto": "Aclarar que la inversión se discute con el asesor humano"}
  ],
  "no_hacer": [
    {"id": "no_hacer_1", "texto": "NO dar precios de los trámites por chat"},
    {"id": "no_hacer_2", "texto": "NO prometer garantías ni porcentajes de éxito (Prohibido)"}
  ],
  "metadata": {
    "informacion_registrar": [
      {"id": "info_1", "texto": "Objeción principal identificada"},
      {"id": "info_2", "texto": "Intento de reactivación"},
      {"id": "info_3", "texto": "Aclaraciones brindadas (BBB, Gratuidad, No abogados)"}
    ]
  },
  "condiciones_avance": [
    {"id": "cond_1", "campo": "objecion_superada", "descripcion": "Prospecto vuelve a mostrar interés"},
    {"id": "cond_2", "campo": "retoma_agendamiento", "descripcion": "Solicita horarios nuevamente"},
    {"id": "cond_3", "campo": "confianza_restaurada", "descripcion": "Acepta avanzar a consulta"}
  ]
}'::jsonb
WHERE id = 239 AND empresa_id = 4;

-- ETAPA 5: Cita Agendada (ID 240) - Control del Asesor
UPDATE public.wp_empresa_embudo 
SET descripcion = '{
  "que_es": "El asesor humano toma control de esta etapa. El prospecto tiene cita confirmada y espera la consulta.",
  "instrucciones_agente": {
    "hacer": [
      "El agente AI pasa a modo de soporte.",
      "Responder preguntas generales sobre la cita (hora, link).",
      "Si el prospecto quiere reagendar, usar la herramienta `reagendar_actualizar`.",
      "Recordar que el asesor humano tomará la llamada."
    ],
    "no_hacer": [
      {"id": "no_hacer_1", "texto": "NO dar información de precios o costos"},
      {"id": "no_hacer_2", "texto": "NO prometer resultados específicos"},
      {"id": "no_hacer_3", "texto": "NO cancelar citas sin intentar reagendar primero"}
    ]
  },
  "senales": [
    {"id": "senal_1", "texto": "Prospecto pregunta detalles de la cita"},
    {"id": "senal_2", "texto": "Solicita reagendamiento"},
    {"id": "senal_3", "texto": "Confirma asistencia"}
  ],
  "metadata": {
    "informacion_registrar": [
      {"id": "info_1", "texto": "Confirmación de asistencia"},
      {"id": "info_2", "texto": "Solicitudes de reagendamiento"},
      {"id": "info_3", "texto": "Preguntas previas a la cita"}
    ]
  },
  "condiciones_avance": [
    {"id": "cond_1", "campo": "cita_realizada", "descripcion": "El asesor marca la cita como completada"},
    {"id": "cond_2", "campo": "prospecto_interesado", "descripcion": "El prospecto muestra interés en continuar después de la cita"}
  ],
  "nota_importante": "Esta etapa es mayormente manejada por el equipo humano. El agente AI actúa como soporte."
}'::jsonb
WHERE id = 240 AND empresa_id = 4;

-- ETAPA 6: Cierre Perdido (ID 241)
UPDATE public.wp_empresa_embudo 
SET descripcion = '{
  "que_es": "Descalificación del prospecto por ''Hard Gates'' legales o falta de interés. Cierre respetuoso sin agendamiento.",
  "senales": [
    {"id": "senal_1", "texto": "Entrada Ilegal (EWI) estando dentro de USA"},
    {"id": "senal_2", "texto": "Más de 180 días fuera de estatus"},
    {"id": "senal_3", "texto": "Caso de Asilo con presencia ilegal previa"},
    {"id": "senal_4", "texto": "Prospecto declina explícitamente continuar"},
    {"id": "senal_5", "texto": "No responde después de múltiples intentos de seguimiento"}
  ],
  "objetivo": [
    {"id": "objetivo_1", "texto": "Evitar perder tiempo de asesores con casos inviables"},
    {"id": "objetivo_2", "texto": "Mantener honestidad y transparencia (Valores URPE)"},
    {"id": "objetivo_3", "texto": "Registrar motivo para análisis de calidad de leads"},
    {"id": "objetivo_4", "texto": "Dejar la puerta abierta para futuro contacto"}
  ],
  "acciones": [
    {"id": "accion_1", "texto": "Explicar respetuosamente que no se puede asistir en rutas laborales"},
    {"id": "accion_2", "texto": "Cerrar conversación sin ofrecer servicios alternativos"},
    {"id": "accion_3", "texto": "Marcar es_calificado = ''no''"},
    {"id": "accion_4", "texto": "Documentar motivo de pérdida obligatoriamente"}
  ],
  "no_hacer": [
    {"id": "no_hacer_1", "texto": "NO enviar enlaces de agenda a prospectos descalificados"},
    {"id": "no_hacer_2", "texto": "NO dar falsas esperanzas sobre perdones o excepciones"},
    {"id": "no_hacer_3", "texto": "NO ser rudo, mantener tono profesional"},
    {"id": "no_hacer_4", "texto": "NO eliminar de base de datos (pueden reactivarse)"}
  ],
  "metadata": {
    "informacion_registrar": [
      {"id": "info_1", "texto": "Motivo específico de descalificación (EWI, >180 días, etc.)"},
      {"id": "info_2", "texto": "Fecha del rechazo"},
      {"id": "info_3", "texto": "Si se intentó pivotar o fue cierre duro"}
    ]
  },
  "condiciones_avance": [
    {"id": "cond_1", "campo": "motivo_registrado", "descripcion": "Causa de rechazo clara en sistema"},
    {"id": "cond_2", "campo": "calificacion_negativa", "descripcion": "Estado actualizado a No Calificado"},
    {"id": "cond_3", "campo": "cierre_ejecutado", "descripcion": "Mensaje final enviado"}
  ],
  "mensaje_cierre": "Agradecemos su interés en URPE Integral Services. Lamentamos no poder asistirle en este momento con rutas basadas en empleo. Le deseamos éxito en su camino migratorio."
}'::jsonb
WHERE id = 241 AND empresa_id = 4;

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================
-- SELECT id, nombre_etapa, orden_etapa, descripcion->>'que_es' as que_es
-- FROM wp_empresa_embudo 
-- WHERE empresa_id = 4 AND id IN (236, 237, 238, 239, 240, 241)
-- ORDER BY orden_etapa;
