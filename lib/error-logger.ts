/**
 * Error Logger - Sistema Centralizado de Logging de Errores
 * 
 * Propósito:
 * - Logging estructurado de errores en wp_error_logs
 * - Soporte para client-side y server-side errors
 * - Integración con Supabase para persistencia
 * - Niveles de severidad configurables
 * 
 * Uso:
 * ```typescript
 * import { logError, logWarning, logCritical } from '@/lib/error-logger';
 * 
 * try {
 *   // código
 * } catch (error) {
 *   await logError('fetchContacts', error, { userId: '123' });
 * }
 * ```
 */

import { supabase } from './supabase-client';
import { alertCriticalError, trackErrorForSpike } from './alert-service';

// Flag to only show table warning once per session
let _loggedTableWarning = false;

export type ErrorSeverity = 'debug' | 'info' | 'warning' | 'error' | 'critical';

export interface ErrorLogContext {
  userId?: string;
  empresaId?: number;
  userAgent?: string;
  ipAddress?: string;
  url?: string;
  componentName?: string;
  additionalData?: Record<string, unknown>;
}

export interface ErrorLogEntry {
  function_name: string;
  error_message: string;
  error_stack?: string;
  request_body?: string;
  user_id?: string;
  empresa_id?: number;
  severity: ErrorSeverity;
  context?: Record<string, unknown>;
}

/**
 * Log genérico de errores con nivel de severidad
 */
export async function logError(
  functionName: string,
  error: Error | unknown,
  context?: ErrorLogContext,
  severity: ErrorSeverity = 'error'
): Promise<void> {
  try {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    
    const logEntry: ErrorLogEntry = {
      function_name: functionName,
      error_message: errorObj.message || 'Unknown error',
      error_stack: errorObj.stack,
      severity,
      user_id: context?.userId,
      empresa_id: context?.empresaId,
      context: {
        userAgent: context?.userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : undefined),
        url: context?.url || (typeof window !== 'undefined' ? window.location.href : undefined),
        componentName: context?.componentName,
        timestamp: new Date().toISOString(),
        ...context?.additionalData
      }
    };

    // Insertar en Supabase (silently fail if table doesn't exist)
    const { error: insertError } = await supabase
      .from('wp_error_logs')
      .insert(logEntry);

    if (insertError) {
      // Only log insertion failures in development and only once per session
      if (process.env.NODE_ENV === 'development' && !_loggedTableWarning) {
        _loggedTableWarning = true;
        console.warn('[ErrorLogger] wp_error_logs table may not exist. Run OBSERVABILITY_CLEANUP.sql to create it.');
      }
    }

    // Track error spikes para severidades error y critical
    if (severity === 'error' || severity === 'critical') {
      trackErrorForSpike(`${functionName}: ${errorObj.message}`).catch(() => {});
    }

    // También loguear en consola para desarrollo
    if (process.env.NODE_ENV === 'development') {
      console.error(`[${severity.toUpperCase()}] ${functionName}:`, errorObj.message);
    }
  } catch (loggingError) {
    // Último recurso: console.error
    console.error('[ErrorLogger] Critical failure in error logging:', loggingError);
    console.error('[ErrorLogger] Original error:', error);
  }
}

/**
 * Log de errores críticos (requieren atención inmediata)
 * También dispara una alerta automática
 */
export async function logCritical(
  functionName: string,
  error: Error | unknown,
  context?: ErrorLogContext
): Promise<void> {
  // Log the error first
  await logError(functionName, error, context, 'critical');
  
  // Trigger alert for critical errors
  const errorObj = error instanceof Error ? error : new Error(String(error));
  await alertCriticalError(
    `Critical Error: ${functionName}`,
    errorObj,
    {
      functionName,
      userId: context?.userId,
      empresaId: context?.empresaId,
      url: context?.url,
      ...context?.additionalData
    }
  ).catch(() => {
    // Don't let alert failures block the main flow
  });
}

/**
 * Log de warnings (errores no críticos)
 */
export async function logWarning(
  functionName: string,
  message: string,
  context?: ErrorLogContext
): Promise<void> {
  return logError(functionName, new Error(message), context, 'warning');
}

/**
 * Log de información (para debugging)
 */
export async function logInfo(
  functionName: string,
  message: string,
  context?: ErrorLogContext
): Promise<void> {
  return logError(functionName, new Error(message), context, 'info');
}

/**
 * Log de debug (solo en desarrollo)
 */
export async function logDebug(
  functionName: string,
  message: string,
  context?: ErrorLogContext
): Promise<void> {
  if (process.env.NODE_ENV === 'development') {
    return logError(functionName, new Error(message), context, 'debug');
  }
}

/**
 * Helper para capturar errores de API requests
 */
export async function logApiError(
  endpoint: string,
  error: Error | unknown,
  requestBody?: unknown,
  context?: ErrorLogContext
): Promise<void> {
  return logError(
    `API: ${endpoint}`,
    error,
    {
      ...context,
      additionalData: {
        endpoint,
        method: 'POST',
        requestBody: requestBody ? JSON.stringify(requestBody) : undefined,
        ...context?.additionalData
      }
    },
    'error'
  );
}

/**
 * Helper para capturar errores de componentes React
 */
export async function logComponentError(
  componentName: string,
  error: Error,
  errorInfo?: { componentStack?: string },
  context?: ErrorLogContext
): Promise<void> {
  return logError(
    `Component: ${componentName}`,
    error,
    {
      ...context,
      componentName,
      additionalData: {
        componentStack: errorInfo?.componentStack,
        ...context?.additionalData
      }
    },
    'error'
  );
}

/**
 * Wrapper para funciones async con auto-logging de errores
 */
export function withErrorLogging<T extends (...args: any[]) => Promise<any>>(
  functionName: string,
  fn: T,
  context?: ErrorLogContext
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      await logError(functionName, error, context);
      throw error; // Re-throw para que el caller pueda manejarlo
    }
  }) as T;
}

/**
 * Batch logging para múltiples errores
 */
export async function logErrorBatch(
  errors: Array<{
    functionName: string;
    error: Error | unknown;
    context?: ErrorLogContext;
    severity?: ErrorSeverity;
  }>
): Promise<void> {
  if (errors.length === 0) return;

  const logEntries: ErrorLogEntry[] = errors.map(({ functionName, error, context, severity = 'error' }) => {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    return {
      function_name: functionName,
      error_message: errorObj.message || 'Unknown error',
      error_stack: errorObj.stack,
      severity,
      user_id: context?.userId,
      empresa_id: context?.empresaId,
      context: context?.additionalData
    };
  });

  try {
    const { error: insertError } = await supabase
      .from('wp_error_logs')
      .insert(logEntries);

    if (insertError) {
      console.error('[ErrorLogger] Failed to batch insert errors:', insertError);
    }
  } catch (loggingError) {
    console.error('[ErrorLogger] Critical failure in batch logging:', loggingError);
  }
}

/**
 * Query helper para obtener logs recientes
 */
export async function getRecentErrors(
  limit: number = 50,
  severity?: ErrorSeverity,
  empresaId?: number
): Promise<ErrorLogEntry[]> {
  try {
    let query = supabase
      .from('wp_error_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (severity) {
      query = query.eq('severity', severity);
    }

    if (empresaId) {
      query = query.eq('empresa_id', empresaId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[ErrorLogger] Failed to fetch recent errors:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('[ErrorLogger] Error fetching recent errors:', error);
    return [];
  }
}
