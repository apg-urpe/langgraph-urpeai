/**
 * AI Configuration - Configuración centralizada para Gemini
 * 
 * Este archivo centraliza toda la configuración de modelos AI del proyecto.
 * Usar este archivo para mantener consistencia en todos los flujos.
 * 
 * ## Modelos Disponibles
 * 
 * | Modelo | Constante | Uso Recomendado |
 * |--------|-----------|-----------------|
 * | gemini-3-flash-preview | GEMINI_MODEL | Chat, análisis, tools |
 * | gemini-2.0-flash-001 | GEMINI_MODEL_LITE | Tareas simples, bajo costo |
 * | gemini-3-flash-preview | GEMINI_MODEL_PRO | Máxima calidad (igual al principal) |
 * 
 * ## Configuración de Generación
 * 
 * - maxTokens: 500,000 tokens máximos de salida
 * - thinking.budget: 1024 tokens para razonamiento (Gemini 3)
 * 
 * @module lib/ai/config
 */

import { createGoogleGenerativeAI } from '@ai-sdk/google';

// ============================================================================
// API KEY
// ============================================================================

export const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// ============================================================================
// OPENROUTER FALLBACK
// ============================================================================

/**
 * OpenRouter API Key para fallback cuando Gemini falla
 */
export const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

/**
 * Modelo de OpenRouter para usar como fallback
 * google/gemini-2.0-flash-001 es el modelo estable
 */
export const OPENROUTER_MODEL = 'google/gemini-2.0-flash-001';

/**
 * URL base de OpenRouter
 */
export const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1';

// ============================================================================
// MODELO UNIFICADO
// ============================================================================

/**
 * Modelo principal para todos los flujos de IA
 * 
 * gemini-3-flash-preview:
 * - Modelo más reciente de Google (2026)
 * - Thinking budget integrado
 * - 1M tokens de contexto
 * - Mayor calidad de razonamiento
 * - Compatible con tools y streaming
 */
export const GEMINI_MODEL = 'gemini-3-flash-preview';

/**
 * Modelo para tareas que requieren máxima velocidad (bajo costo)
 */
export const GEMINI_MODEL_LITE = 'gemini-2.0-flash-001';

/**
 * Modelo para tareas que requieren máxima calidad
 */
export const GEMINI_MODEL_PRO = 'gemini-3-flash-preview';

/**
 * Modelo legacy Gemini 2.0 (respaldo)
 * Usar solo si hay problemas con Gemini 3
 */
export const GEMINI_3_MODEL = 'gemini-2.0-flash-001';

// ============================================================================
// CLIENTE VERCEL AI SDK (Recomendado)
// ============================================================================

/**
 * Cliente Google AI para usar con Vercel AI SDK
 * Uso: google(GEMINI_MODEL) en streamText, generateText, etc.
 */
export const google = createGoogleGenerativeAI({
  apiKey: GEMINI_API_KEY,
});

// ============================================================================
// CONFIGURACIÓN DE GENERACIÓN
// ============================================================================

/**
 * Configuración por defecto para generación de texto
 */
export const DEFAULT_GENERATION_CONFIG = {
  maxTokens: 500000,
  // Gemini 3 Flash soporta thinking
  thinking: {
    budget: 1024 // Activa razonamiento interno
  }
};

/**
 * Configuración para streaming en chat
 */
export const CHAT_GENERATION_CONFIG = {
  maxTokens: 500000,
};

/**
 * Configuración para análisis (más tokens de salida)
 */
export const ANALYSIS_GENERATION_CONFIG = {
  maxTokens: 500000,
};

// ============================================================================
// SAFETY SETTINGS
// ============================================================================

/**
 * Safety settings permisivos para uso empresarial
 * (Desactiva filtros que pueden bloquear contenido legítimo de negocios)
 */
export const PERMISSIVE_SAFETY_SETTINGS = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
] as const;

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Verifica si la API key está configurada
 */
export function isGeminiConfigured(): boolean {
  return Boolean(GEMINI_API_KEY);
}

/**
 * Obtiene el modelo basado en el caso de uso
 */
export function getModelForUseCase(
  useCase: 'chat' | 'analysis' | 'simple' | 'premium'
): string {
  switch (useCase) {
    case 'chat':
      return GEMINI_MODEL;
    case 'analysis':
      return GEMINI_MODEL;
    case 'simple':
      return GEMINI_MODEL_LITE;
    case 'premium':
      return GEMINI_MODEL_PRO;
    default:
      return GEMINI_MODEL;
  }
}

// ============================================================================
// EXPORTS PARA COMPATIBILIDAD
// ============================================================================

/**
 * @deprecated Usar GEMINI_MODEL en su lugar
 */
export const MODEL = GEMINI_MODEL;

/**
 * URL base para llamadas directas a la API (legacy)
 * Preferir usar el SDK de Vercel AI en su lugar
 */
export const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Construye URL para llamadas directas (legacy)
 * @deprecated Usar google(GEMINI_MODEL) con streamText en su lugar
 */
export function buildGeminiUrl(
  model: string = GEMINI_MODEL,
  streaming: boolean = false
): string {
  const endpoint = streaming ? 'streamGenerateContent' : 'generateContent';
  const suffix = streaming ? '&alt=sse' : '';
  return `${GEMINI_API_BASE}/models/${model}:${endpoint}?key=${GEMINI_API_KEY}${suffix}`;
}
