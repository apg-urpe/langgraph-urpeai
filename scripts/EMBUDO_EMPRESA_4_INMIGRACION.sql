-- ============================================================================
-- EMBUDO EMPRESA ID 4 - URPE INTEGRAL SERVICES (INMIGRACIÓN)
-- Etapas del proceso de servicios migratorios EB-2 NIW
-- ============================================================================
-- IMPORTANTE: Ejecutar en Supabase SQL Editor
-- Nota: Las etapas 1-6 ya existen en la DB según la imagen proporcionada
-- Este script añade las etapas de servicio (7-17) + NO GESTIONABLE (0) + SEGUIMIENTO
-- ============================================================================

-- PRIMERO: Verificar etapas existentes
-- SELECT * FROM wp_empresa_embudo WHERE empresa_id = 4 ORDER BY orden_etapa;

-- ============================================================================
-- ETAPA 0: NO GESTIONABLE
-- ============================================================================
INSERT INTO public.wp_empresa_embudo (
  nombre_etapa,
  orden_etapa,
  empresa_id,
  descripcion,
  configuracion_seguimiento
) VALUES (
  'NO GESTIONABLE',
  0,
  4,
  '{
    "titulo": "No Gestionable",
    "icono": "🚫",
    "color": "#6b7280",
    "instrucciones_agente": "Este lead NO es apto para nuestros servicios de inmigración. Razones comunes: entrada sin inspección (EWI), más de 180 días fuera de estatus, expectativas irreales, o no cumple requisitos mínimos para EB-2 NIW/EB-1A.",
    "acciones_permitidas": [
      "Agradecer su interés cordialmente",
      "Explicar brevemente por qué no podemos ayudarle en este momento",
      "NO enviar enlaces de pago ni agendar consultas",
      "Si hay potencial futuro (ej: salir del país), mencionarlo como opción"
    ],
    "criterios_descalificacion": [
      "Entrada sin inspección (EWI)",
      "180+ días de presencia ilegal sin asilo pendiente válido",
      "Sin título universitario ni experiencia equivalente",
      "Expectativas de garantías de aprobación",
      "No tiene fondos para el proceso"
    ],
    "mensaje_cierre": "Agradecemos su interés en URPE. En este momento no podemos asistirle con su caso, pero le deseamos éxito en su camino migratorio."
  }',
  '{"activo": false, "horario": {"fin": "18:00", "inicio": "08:00", "dias_permitidos": [1, 2, 3, 4, 5]}, "seguimientos": []}'
);

-- ============================================================================
-- ETAPA 7: INICIAL ($140) - Formulario I-140
-- ============================================================================
INSERT INTO public.wp_empresa_embudo (
  nombre_etapa,
  orden_etapa,
  empresa_id,
  descripcion,
  configuracion_seguimiento
) VALUES (
  'ETAPA 1: Inicial',
  7,
  4,
  '{
    "titulo": "Etapa Inicial",
    "icono": "📋",
    "color": "#3b82f6",
    "precio": "$140",
    "instrucciones_agente": "El cliente ha iniciado su proceso de inmigración. En esta etapa se prepara la base del caso EB-2 NIW con el formulario I-140 y la evaluación inicial.",
    "entregables": [
      "Formulario I-140 completado",
      "Porcentaje de aceptación estimado",
      "Manual DIY con instrucciones paso a paso",
      "Ruta de trabajo personalizada"
    ],
    "criterios_avance": [
      "I-140 revisado y aprobado internamente",
      "Cliente entiende su porcentaje de elegibilidad",
      "Ruta de trabajo definida y aceptada"
    ],
    "acciones_agente": [
      "Confirmar recepción de documentos iniciales",
      "Programar llamada de orientación si es necesario",
      "Resolver dudas sobre el proceso general"
    ]
  }',
  '{"activo": true, "horario": {"fin": "18:00", "inicio": "08:00", "dias_permitidos": [1, 2, 3, 4, 5]}, "seguimientos": [{"numero": 1, "horas_espera": 24, "mensaje_template": "seguimiento_etapa1"}, {"numero": 2, "horas_espera": 72, "mensaje_template": "seguimiento_etapa1"}]}'
);

-- ============================================================================
-- ETAPA 8: ESTRATEGIA CENTRAL ($1,440)
-- ============================================================================
INSERT INTO public.wp_empresa_embudo (
  nombre_etapa,
  orden_etapa,
  empresa_id,
  descripcion,
  configuracion_seguimiento
) VALUES (
  'ETAPA 2: Estrategia Central',
  8,
  4,
  '{
    "titulo": "Estrategia Central",
    "icono": "🎯",
    "color": "#8b5cf6",
    "precio": "$1,440",
    "instrucciones_agente": "Construcción del núcleo estratégico del caso NIW. Se desarrolla el business plan de interés nacional y se establece la estructura empresarial en EE.UU.",
    "entregables": [
      "Business Plan de Interés Nacional completo",
      "Creación de empresa LLC o Corp en EE.UU.",
      "Documentación corporativa básica"
    ],
    "criterios_avance": [
      "Business plan aprobado por control de calidad",
      "Empresa registrada con EIN",
      "Documentos corporativos listos"
    ],
    "acciones_agente": [
      "Coordinar información para el business plan",
      "Solicitar preferencias de estado para la LLC",
      "Confirmar datos para registro empresarial"
    ],
    "pilar_relacionado": "Proyecto de Interés Nacional"
  }',
  '{"activo": true, "horario": {"fin": "18:00", "inicio": "08:00", "dias_permitidos": [1, 2, 3, 4, 5]}, "seguimientos": [{"numero": 1, "horas_espera": 48, "mensaje_template": "seguimiento_etapa2"}, {"numero": 2, "horas_espera": 96, "mensaje_template": "seguimiento_etapa2"}]}'
);

-- ============================================================================
-- ETAPA 9: VALIDACIÓN ACADÉMICA Y PROPIEDAD INTELECTUAL ($1,440)
-- ============================================================================
INSERT INTO public.wp_empresa_embudo (
  nombre_etapa,
  orden_etapa,
  empresa_id,
  descripcion,
  configuracion_seguimiento
) VALUES (
  'ETAPA 3: Validación Académica y PI',
  9,
  4,
  '{
    "titulo": "Validación Académica y Propiedad Intelectual",
    "icono": "🎓",
    "color": "#06b6d4",
    "precio": "$1,440",
    "instrucciones_agente": "Fortalecimiento del perfil académico y creación de propiedad intelectual. Se acreditan títulos y se inicia el proceso de patente provisional.",
    "entregables": [
      "Acreditación de 2 títulos universitarios",
      "Traducción certificada de títulos",
      "Redacción de patente provisional",
      "Documentación de PI"
    ],
    "criterios_avance": [
      "Títulos evaluados y acreditados",
      "Traducciones certificadas completadas",
      "Borrador de patente aprobado"
    ],
    "acciones_agente": [
      "Solicitar copias de títulos originales",
      "Coordinar evaluación de credenciales",
      "Recopilar información técnica para patente"
    ],
    "pilar_relacionado": "Propiedad Intelectual"
  }',
  '{"activo": true, "horario": {"fin": "18:00", "inicio": "08:00", "dias_permitidos": [1, 2, 3, 4, 5]}, "seguimientos": [{"numero": 1, "horas_espera": 48, "mensaje_template": "seguimiento_etapa3"}, {"numero": 2, "horas_espera": 96, "mensaje_template": "seguimiento_etapa3"}]}'
);

-- ============================================================================
-- ETAPA 10: VALIDACIÓN ECONÓMICA ($1,440)
-- ============================================================================
INSERT INTO public.wp_empresa_embudo (
  nombre_etapa,
  orden_etapa,
  empresa_id,
  descripcion,
  configuracion_seguimiento
) VALUES (
  'ETAPA 4: Validación Económica',
  10,
  4,
  '{
    "titulo": "Validación Económica",
    "icono": "📊",
    "color": "#10b981",
    "precio": "$1,440",
    "instrucciones_agente": "Demostración del impacto económico del proyecto en Estados Unidos. Se desarrolla el estudio econométrico que sustenta el beneficio nacional.",
    "entregables": [
      "Estudio Econométrico completo",
      "Proyecciones de impacto económico",
      "Análisis de creación de empleos",
      "Documentación de beneficio nacional"
    ],
    "criterios_avance": [
      "Estudio econométrico aprobado",
      "Métricas de impacto documentadas",
      "Análisis revisado por control de calidad"
    ],
    "acciones_agente": [
      "Recopilar datos financieros del proyecto",
      "Solicitar proyecciones de crecimiento",
      "Coordinar entrevista con economista"
    ],
    "pilar_relacionado": "Modelo de Impacto Económico"
  }',
  '{"activo": true, "horario": {"fin": "18:00", "inicio": "08:00", "dias_permitidos": [1, 2, 3, 4, 5]}, "seguimientos": [{"numero": 1, "horas_espera": 48, "mensaje_template": "seguimiento_etapa4"}, {"numero": 2, "horas_espera": 96, "mensaje_template": "seguimiento_etapa4"}]}'
);

-- ============================================================================
-- ETAPA 11: IDENTIDAD Y PROFUNDIDAD TÉCNICA ($1,440)
-- ============================================================================
INSERT INTO public.wp_empresa_embudo (
  nombre_etapa,
  orden_etapa,
  empresa_id,
  descripcion,
  configuracion_seguimiento
) VALUES (
  'ETAPA 5: Identidad y Profundidad Técnica',
  11,
  4,
  '{
    "titulo": "Identidad y Profundidad Técnica",
    "icono": "📚",
    "color": "#f59e0b",
    "precio": "$1,440",
    "instrucciones_agente": "Construcción de la identidad profesional y profundidad técnica del solicitante. Se crean materiales que demuestran expertise en el campo.",
    "entregables": [
      "White Paper técnico",
      "Diseño de logos profesionales",
      "Coordinación y redacción de libro técnico",
      "Gestión de publicación en revistas indexadas Q3 y Q4"
    ],
    "criterios_avance": [
      "White paper aprobado",
      "Logos finalizados",
      "Libro técnico en proceso de publicación",
      "Al menos 1 artículo en revista indexada"
    ],
    "acciones_agente": [
      "Coordinar entrevista técnica para white paper",
      "Solicitar preferencias de diseño",
      "Confirmar disponibilidad para revisiones"
    ],
    "pilar_relacionado": "Presencia Profesional"
  }',
  '{"activo": true, "horario": {"fin": "18:00", "inicio": "08:00", "dias_permitidos": [1, 2, 3, 4, 5]}, "seguimientos": [{"numero": 1, "horas_espera": 72, "mensaje_template": "seguimiento_etapa5"}, {"numero": 2, "horas_espera": 120, "mensaje_template": "seguimiento_etapa5"}]}'
);

-- ============================================================================
-- ETAPA 12: AUTORIDAD ACADÉMICA ($1,440)
-- ============================================================================
INSERT INTO public.wp_empresa_embudo (
  nombre_etapa,
  orden_etapa,
  empresa_id,
  descripcion,
  configuracion_seguimiento
) VALUES (
  'ETAPA 6: Autoridad Académica',
  12,
  4,
  '{
    "titulo": "Autoridad Académica",
    "icono": "🏛️",
    "color": "#ec4899",
    "precio": "$1,440",
    "instrucciones_agente": "Establecimiento de autoridad académica y liderazgo de pensamiento. Se crean documentos que posicionan al solicitante como experto en su campo.",
    "entregables": [
      "Policy Paper completo",
      "Caso de Estudio estilo Harvard",
      "Documentación de contribuciones académicas"
    ],
    "criterios_avance": [
      "Policy paper revisado y aprobado",
      "Caso de estudio estructurado",
      "Materiales listos para presentación"
    ],
    "acciones_agente": [
      "Coordinar investigación para policy paper",
      "Recopilar datos para caso de estudio",
      "Programar revisiones con el cliente"
    ],
    "pilar_relacionado": "Repositorio Documental"
  }',
  '{"activo": true, "horario": {"fin": "18:00", "inicio": "08:00", "dias_permitidos": [1, 2, 3, 4, 5]}, "seguimientos": [{"numero": 1, "horas_espera": 72, "mensaje_template": "seguimiento_etapa6"}, {"numero": 2, "horas_espera": 120, "mensaje_template": "seguimiento_etapa6"}]}'
);

-- ============================================================================
-- ETAPA 13: DESARROLLO TECNOLÓGICO - MVP ($1,440)
-- ============================================================================
INSERT INTO public.wp_empresa_embudo (
  nombre_etapa,
  orden_etapa,
  empresa_id,
  descripcion,
  configuracion_seguimiento
) VALUES (
  'ETAPA 7: Desarrollo Tecnológico (MVP)',
  13,
  4,
  '{
    "titulo": "Desarrollo Tecnológico - MVP",
    "icono": "💻",
    "color": "#6366f1",
    "precio": "$1,440",
    "instrucciones_agente": "Creación del Producto Mínimo Viable (MVP) que demuestra la funcionalidad del proyecto tecnológico del solicitante.",
    "entregables": [
      "MVP de aplicación funcional",
      "Documentación técnica del MVP",
      "Demo o video explicativo",
      "Código fuente o prototipo"
    ],
    "criterios_avance": [
      "MVP funcional y demostrable",
      "Documentación técnica completa",
      "Cliente aprueba funcionalidad"
    ],
    "acciones_agente": [
      "Definir alcance del MVP con el cliente",
      "Coordinar requisitos técnicos",
      "Programar demos de avance"
    ],
    "pilar_relacionado": "Pilotajes y Funcionalidad Demostrable"
  }',
  '{"activo": true, "horario": {"fin": "18:00", "inicio": "08:00", "dias_permitidos": [1, 2, 3, 4, 5]}, "seguimientos": [{"numero": 1, "horas_espera": 96, "mensaje_template": "seguimiento_etapa7"}, {"numero": 2, "horas_espera": 168, "mensaje_template": "seguimiento_etapa7"}]}'
);

-- ============================================================================
-- ETAPA 14: PRUEBA SOCIAL ($1,440)
-- ============================================================================
INSERT INTO public.wp_empresa_embudo (
  nombre_etapa,
  orden_etapa,
  empresa_id,
  descripcion,
  configuracion_seguimiento
) VALUES (
  'ETAPA 8: Prueba Social',
  14,
  4,
  '{
    "titulo": "Prueba Social",
    "icono": "🌐",
    "color": "#14b8a6",
    "precio": "$1,440",
    "instrucciones_agente": "Construcción de presencia en redes sociales y recopilación de testimonios que validan la trayectoria del solicitante.",
    "entregables": [
      "Redes sociales configuradas (prekits)",
      "4 creativos para redes sociales",
      "Redacción de hasta 10 cartas de recomendación",
      "Perfiles profesionales optimizados"
    ],
    "criterios_avance": [
      "RRSS configuradas y activas",
      "Creativos aprobados",
      "Al menos 5 cartas de recomendación firmadas"
    ],
    "acciones_agente": [
      "Solicitar accesos a redes sociales",
      "Recopilar contactos para cartas de recomendación",
      "Coordinar aprobación de creativos"
    ],
    "pilar_relacionado": "Presencia Profesional en Línea"
  }',
  '{"activo": true, "horario": {"fin": "18:00", "inicio": "08:00", "dias_permitidos": [1, 2, 3, 4, 5]}, "seguimientos": [{"numero": 1, "horas_espera": 72, "mensaje_template": "seguimiento_etapa8"}, {"numero": 2, "horas_espera": 120, "mensaje_template": "seguimiento_etapa8"}]}'
);

-- ============================================================================
-- ETAPA 15: AVAL DE EXPERTOS ($1,440)
-- ============================================================================
INSERT INTO public.wp_empresa_embudo (
  nombre_etapa,
  orden_etapa,
  empresa_id,
  descripcion,
  configuracion_seguimiento
) VALUES (
  'ETAPA 9: Aval de Expertos',
  15,
  4,
  '{
    "titulo": "Aval de Expertos",
    "icono": "✅",
    "color": "#22c55e",
    "precio": "$1,440",
    "instrucciones_agente": "Obtención de avales y cartas de expertos que validan la importancia nacional del proyecto y las credenciales del solicitante.",
    "entregables": [
      "Carta de Innovación del laboratorio de tecnología URPE (1)",
      "Redacción de hasta 10 cartas de experto",
      "Redacción de carta de intención (1)",
      "Documentación de avales"
    ],
    "criterios_avance": [
      "Carta de innovación emitida",
      "Al menos 5 cartas de experto firmadas",
      "Carta de intención completada"
    ],
    "acciones_agente": [
      "Identificar expertos en el campo del cliente",
      "Coordinar firmas de cartas",
      "Dar seguimiento a expertos pendientes"
    ],
    "pilar_relacionado": "Informe de Viabilidad Técnica"
  }',
  '{"activo": true, "horario": {"fin": "18:00", "inicio": "08:00", "dias_permitidos": [1, 2, 3, 4, 5]}, "seguimientos": [{"numero": 1, "horas_espera": 72, "mensaje_template": "seguimiento_etapa9"}, {"numero": 2, "horas_espera": 120, "mensaje_template": "seguimiento_etapa9"}]}'
);

-- ============================================================================
-- ETAPA 16: ARGUMENTACIÓN TÉCNICA ($1,440)
-- ============================================================================
INSERT INTO public.wp_empresa_embudo (
  nombre_etapa,
  orden_etapa,
  empresa_id,
  descripcion,
  configuracion_seguimiento
) VALUES (
  'ETAPA 10: Argumentación Técnica',
  16,
  4,
  '{
    "titulo": "Argumentación Técnica",
    "icono": "📝",
    "color": "#a855f7",
    "precio": "$1,440",
    "instrucciones_agente": "Redacción del documento central del caso NIW: la carta de autopetición que argumenta por qué el solicitante merece la exención por interés nacional.",
    "entregables": [
      "Carta de autopetición completa",
      "Argumentación legal estructurada",
      "Referencias a evidencias compiladas"
    ],
    "criterios_avance": [
      "Carta de autopetición aprobada por QC",
      "Cliente revisa y aprueba contenido",
      "Documento listo para traducción"
    ],
    "acciones_agente": [
      "Coordinar revisión de la carta con el cliente",
      "Resolver dudas sobre argumentación",
      "Confirmar que todos los pilares están reflejados"
    ],
    "pilar_relacionado": "Memo de Innovación y Aporte al Interés Nacional"
  }',
  '{"activo": true, "horario": {"fin": "18:00", "inicio": "08:00", "dias_permitidos": [1, 2, 3, 4, 5]}, "seguimientos": [{"numero": 1, "horas_espera": 48, "mensaje_template": "seguimiento_etapa10"}, {"numero": 2, "horas_espera": 96, "mensaje_template": "seguimiento_etapa10"}]}'
);

-- ============================================================================
-- ETAPA 17: TRADUCCIONES Y LOGÍSTICA FINAL ($1,440)
-- ============================================================================
INSERT INTO public.wp_empresa_embudo (
  nombre_etapa,
  orden_etapa,
  empresa_id,
  descripcion,
  configuracion_seguimiento
) VALUES (
  'ETAPA 11: Traducciones y Logística Final',
  17,
  4,
  '{
    "titulo": "Traducciones y Logística Final",
    "icono": "📦",
    "color": "#f97316",
    "precio": "$1,440",
    "instrucciones_agente": "Fase final de preparación: traducción de todos los documentos, compilación del expediente y envío a USCIS.",
    "entregables": [
      "Traducción certificada de todos los documentos",
      "Compilación de documentos en PDF organizado",
      "Impresión física del expediente",
      "Envío del expediente a USCIS",
      "Subida del expediente a la plataforma"
    ],
    "criterios_avance": [
      "Todas las traducciones certificadas",
      "PDF compilado y aprobado",
      "Expediente enviado con número de tracking",
      "Copia digital subida a plataforma"
    ],
    "acciones_agente": [
      "Confirmar lista final de documentos",
      "Coordinar dirección de envío",
      "Proporcionar número de tracking",
      "Confirmar recepción por USCIS"
    ],
    "nota_importante": "Una vez enviado, el tiempo de procesamiento depende de USCIS. URPE no garantiza tiempos ni resultados."
  }',
  '{"activo": true, "horario": {"fin": "18:00", "inicio": "08:00", "dias_permitidos": [1, 2, 3, 4, 5]}, "seguimientos": [{"numero": 1, "horas_espera": 24, "mensaje_template": "seguimiento_etapa11"}, {"numero": 2, "horas_espera": 48, "mensaje_template": "seguimiento_etapa11"}]}'
);

-- ============================================================================
-- ETAPA 18: SEGUIMIENTO POST-ENVÍO
-- ============================================================================
INSERT INTO public.wp_empresa_embudo (
  nombre_etapa,
  orden_etapa,
  empresa_id,
  descripcion,
  configuracion_seguimiento
) VALUES (
  'SEGUIMIENTO',
  18,
  4,
  '{
    "titulo": "Seguimiento Post-Envío",
    "icono": "🔄",
    "color": "#0ea5e9",
    "instrucciones_agente": "El expediente ha sido enviado a USCIS. Esta etapa es de seguimiento del caso mientras espera decisión.",
    "acciones_permitidas": [
      "Monitorear estatus del caso en USCIS",
      "Responder dudas del cliente sobre tiempos",
      "Preparar respuesta a RFE si es necesario",
      "Coordinar documentación adicional si USCIS la solicita"
    ],
    "notas": [
      "Los tiempos de USCIS varían según la carga de trabajo",
      "Premium Processing puede acelerar el proceso",
      "No se garantizan resultados ni tiempos específicos"
    ],
    "proximos_pasos": [
      "Si aprobado: Coordinar Ajuste de Estatus o Proceso Consular",
      "Si RFE: Preparar respuesta documental",
      "Si denegado: Evaluar opciones de apelación o reconsidering"
    ]
  }',
  '{"activo": true, "horario": {"fin": "18:00", "inicio": "08:00", "dias_permitidos": [1, 2, 3, 4, 5]}, "seguimientos": [{"numero": 1, "horas_espera": 168, "mensaje_template": "seguimiento_caso"}, {"numero": 2, "horas_espera": 336, "mensaje_template": "seguimiento_caso"}]}'
);

-- ============================================================================
-- ETAPA 19: CASO APROBADO
-- ============================================================================
INSERT INTO public.wp_empresa_embudo (
  nombre_etapa,
  orden_etapa,
  empresa_id,
  descripcion,
  configuracion_seguimiento
) VALUES (
  'CASO APROBADO',
  19,
  4,
  '{
    "titulo": "Caso Aprobado",
    "icono": "🎉",
    "color": "#22c55e",
    "instrucciones_agente": "¡Felicidades! El caso NIW ha sido aprobado por USCIS. Ahora se procede con los siguientes pasos según la situación del cliente.",
    "acciones_permitidas": [
      "Felicitar al cliente por la aprobación",
      "Explicar próximos pasos (I-485 o Proceso Consular)",
      "Coordinar documentación para Ajuste de Estatus",
      "Programar llamada de orientación post-aprobación"
    ],
    "proximos_pasos_dentro_usa": [
      "Ajuste de Estatus (I-485)",
      "Permiso de Trabajo (I-765)",
      "Permiso de Viaje (I-131)"
    ],
    "proximos_pasos_fuera_usa": [
      "Proceso Consular (NVC)",
      "DS-260",
      "Entrevista consular"
    ]
  }',
  '{"activo": false, "horario": {"fin": "18:00", "inicio": "08:00", "dias_permitidos": [1, 2, 3, 4, 5]}, "seguimientos": []}'
);

-- ============================================================================
-- VERIFICACIÓN FINAL
-- ============================================================================
-- Ejecutar después de los INSERTs para verificar:
-- SELECT id, nombre_etapa, orden_etapa, descripcion->>'precio' as precio, descripcion->>'icono' as icono
-- FROM wp_empresa_embudo 
-- WHERE empresa_id = 4 
-- ORDER BY orden_etapa;

-- ============================================================================
-- NOTA: Si necesitas ACTUALIZAR "Cierre perdido" a "CERRADO" o "AGENDADO"
-- ============================================================================
-- UPDATE wp_empresa_embudo 
-- SET nombre_etapa = 'CERRADO'
-- WHERE empresa_id = 4 AND nombre_etapa = 'Cierre perdido';

-- O si quieres renombrar "Cita Agendada":
-- UPDATE wp_empresa_embudo 
-- SET nombre_etapa = 'AGENDADO'
-- WHERE empresa_id = 4 AND nombre_etapa = 'Cita Agendada';
