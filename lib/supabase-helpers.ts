/**
 * Supabase Helpers - Utilidades para operaciones resilientes
 * 
 * Propósito:
 * - Manejo de errores de red (Failed to fetch)
 * - Retry automático con refresh de sesión
 * - Mensajes de error amigables al usuario
 */

import { supabase } from './supabase-client';
import { logger } from './logger';

/**
 * Detecta si un error es de tipo red/conexión
 */
export function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError && err.message === 'Failed to fetch') return true;
  if (err instanceof Error && (
    err.message.includes('NetworkError') ||
    err.message.includes('network') ||
    err.message.includes('Failed to fetch') ||
    err.message.includes('fetch failed') ||
    err.message.includes('ECONNREFUSED') ||
    err.message.includes('ETIMEDOUT')
  )) return true;
  return false;
}

/**
 * Convierte un error a mensaje amigable para el usuario
 */
export function getNetworkErrorMessage(err: unknown): string {
  if (err instanceof TypeError && err.message === 'Failed to fetch') {
    return 'Error de conexión. Verifica tu internet e intenta de nuevo.';
  }
  if (err instanceof Error) {
    if (err.message.includes('ECONNREFUSED') || err.message.includes('ETIMEDOUT')) {
      return 'No se pudo conectar al servidor. Intenta de nuevo en unos segundos.';
    }
    return err.message;
  }
  return 'Error de conexión desconocido';
}

/**
 * Intenta refrescar la sesión de Supabase
 */
export async function tryRefreshSession(): Promise<boolean> {
  try {
    const { error } = await supabase.auth.refreshSession();
    if (error) {
      logger.warn('[SupabaseHelpers] Session refresh failed:', error.message);
      return false;
    }
    logger.debug('[SupabaseHelpers] Session refreshed successfully');
    return true;
  } catch (err) {
    logger.warn('[SupabaseHelpers] Could not refresh session:', err);
    return false;
  }
}

/**
 * Ejecuta una operación de Supabase con retry automático en errores de red
 * 
 * @param operation - Función async que realiza la operación de Supabase
 * @param options - Opciones de configuración
 * @returns El resultado de la operación
 * 
 * @example
 * const result = await withNetworkRetry(
 *   async () => {
 *     const { data, error } = await supabase.from('contacts').insert(payload);
 *     if (error) throw error;
 *     return data;
 *   },
 *   { context: 'createContact' }
 * );
 */
export async function withNetworkRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries?: number;
    context?: string;
    onRetry?: (attempt: number) => void;
  } = {}
): Promise<T> {
  const { maxRetries = 2, context = 'operation', onRetry } = options;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // On retry, try to refresh the session first
      if (attempt > 0) {
        logger.debug(`[SupabaseHelpers] ${context}: Retry ${attempt}/${maxRetries}`);
        onRetry?.(attempt);
        
        await tryRefreshSession();
        
        // Small delay before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 300 * Math.pow(2, attempt - 1)));
      }

      return await operation();

    } catch (err) {
      lastError = err;

      // Check if it's a network error and we should retry
      if (isNetworkError(err) && attempt < maxRetries) {
        logger.warn(`[SupabaseHelpers] ${context}: Network error on attempt ${attempt + 1}, will retry...`);
        continue;
      }

      // Not a network error or exhausted retries
      throw err;
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError;
}

/**
 * Wrapper para operaciones de Supabase que retorna un resultado estructurado
 * en lugar de lanzar excepciones
 * 
 * @example
 * const result = await safeSupabaseOperation(
 *   async () => {
 *     const { data, error } = await supabase.from('contacts').insert(payload);
 *     if (error) throw error;
 *     return data;
 *   },
 *   { context: 'createContact' }
 * );
 * 
 * if (result.success) {
 *   console.log('Created:', result.data);
 * } else {
 *   console.error('Error:', result.error);
 * }
 */
export async function safeSupabaseOperation<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries?: number;
    context?: string;
  } = {}
): Promise<{ success: true; data: T } | { success: false; error: string; isNetworkError: boolean }> {
  try {
    const data = await withNetworkRetry(operation, options);
    return { success: true, data };
  } catch (err) {
    const isNetwork = isNetworkError(err);
    const errorMessage = isNetwork 
      ? getNetworkErrorMessage(err)
      : (err instanceof Error ? err.message : 'Error desconocido');
    
    logger.error(`[SupabaseHelpers] ${options.context || 'operation'} failed:`, err);
    
    return { 
      success: false, 
      error: errorMessage,
      isNetworkError: isNetwork
    };
  }
}
