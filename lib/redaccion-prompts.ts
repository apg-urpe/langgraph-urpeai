/**
 * Prompts centralizados para el generador de redacción con IA
 * 
 * Dos prompts principales:
 * 1. PLANNING — Estructura del documento (generateObject)
 * 2. WRITING  — Redacción de cada sección (generateText)
 * 
 * @module lib/redaccion-prompts
 */

import type { RedaccionTipo } from '@/types/redaccion';

// ============================================================================
// PLANNING PROMPT — Genera la estructura del documento
// ============================================================================

export const PLANNING_SYSTEM_PROMPT = `Eres un planificador experto de documentos profesionales y empresariales.

Tu tarea es crear la ESTRUCTURA de un documento, NO su contenido.

REGLAS:
1. Genera exactamente el número de secciones indicado en "partes"
2. Cada sección debe tener un título claro y un plan_seccion que describa qué debe contener
3. El plan_seccion debe ser específico y accionable (2-3 oraciones)
4. Los títulos deben seguir una progresión lógica
5. El nombre del documento debe ser profesional y descriptivo
6. La descripción debe resumir el propósito del documento en 1-2 oraciones
7. Respeta las instrucciones, objetivo y requerimientos del tipo de documento`;

export function buildPlanningPrompt(
  tipo: RedaccionTipo,
  contexto: string
): string {
  const parts = [
    `## Tipo de documento: ${tipo.nombre}`,
    `## Número de secciones requeridas: ${tipo.partes}`,
  ];

  if (tipo.objetivo) {
    parts.push(`## Objetivo del documento:\n${tipo.objetivo}`);
  }
  if (tipo.instrucciones) {
    parts.push(`## Instrucciones específicas:\n${tipo.instrucciones}`);
  }
  if (tipo.requerimientos) {
    parts.push(`## Requerimientos:\n${tipo.requerimientos}`);
  }
  if (tipo.longitud) {
    parts.push(`## Longitud aproximada por sección: ${tipo.longitud} palabras`);
  }

  parts.push(`## Contexto proporcionado por el usuario:\n${contexto}`);
  parts.push(`\nGenera la estructura completa del documento con exactamente ${tipo.partes} secciones.`);

  return parts.join('\n\n');
}

// ============================================================================
// WRITING PROMPT — Redacta el contenido de cada sección
// ============================================================================

export const WRITING_SYSTEM_PROMPT = `Eres un redactor profesional experto en documentos empresariales y legales.

Tu tarea es redactar el CONTENIDO COMPLETO de una sección específica de un documento.

REGLAS:
1. Escribe contenido profesional, claro y bien estructurado
2. Usa formato Markdown cuando sea apropiado (listas, negritas, subtítulos)
3. Mantén coherencia con las secciones previamente redactadas
4. Sigue estrictamente el plan de la sección
5. El contenido debe ser completo y listo para revisión
6. No incluyas el título de la sección en el contenido (ya está definido por separado)
7. Respeta las instrucciones y requerimientos del tipo de documento`;

export function buildSectionPrompt(
  tipo: RedaccionTipo,
  documentoNombre: string,
  documentoDescripcion: string,
  seccionTitulo: string,
  seccionPlan: string,
  contexto: string,
  seccionesPrevias: Array<{ titulo: string; contenido: string }>
): string {
  const parts = [
    `## Documento: ${documentoNombre}`,
    `## Descripción: ${documentoDescripcion}`,
    `## Tipo: ${tipo.nombre}`,
  ];

  if (tipo.instrucciones) {
    parts.push(`## Instrucciones del tipo:\n${tipo.instrucciones}`);
  }
  if (tipo.longitud) {
    parts.push(`## Longitud objetivo: ~${tipo.longitud} palabras`);
  }

  parts.push(`## Sección a redactar: "${seccionTitulo}"`);
  parts.push(`## Plan de esta sección:\n${seccionPlan}`);

  if (seccionesPrevias.length > 0) {
    const resumen = seccionesPrevias
      .map(s => `### ${s.titulo}\n${s.contenido.substring(0, 500)}${s.contenido.length > 500 ? '...' : ''}`)
      .join('\n\n');
    parts.push(`## Secciones ya redactadas (para mantener coherencia):\n${resumen}`);
  }

  parts.push(`## Contexto original del usuario:\n${contexto}`);
  parts.push(`\nRedacta el contenido completo de la sección "${seccionTitulo}".`);

  return parts.join('\n\n');
}
