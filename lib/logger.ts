/**
 * Logger condicional para desarrollo vs producción
 * 
 * En producción, solo se muestran errores y warnings críticos.
 * En desarrollo, se muestran todos los logs para debugging.
 * 
 * Uso:
 *   import { logger } from '@/lib/logger';
 *   logger.debug('[Module]', 'mensaje de debug'); // Solo en dev
 *   logger.info('[Module]', 'información');        // Solo en dev
 *   logger.warn('[Module]', 'advertencia');        // Siempre
 *   logger.error('[Module]', 'error');             // Siempre
 */

const isDev = process.env.NODE_ENV !== 'production';

// Categorías que siempre se muestran (incluso en producción)
const ALWAYS_SHOW_PREFIXES = ['[Auth]', '[Security]', '[RLS]', '[Critical]'];

// Categorías que se silencian completamente en producción
const SILENT_IN_PROD_PREFIXES = ['[Sync]', '[Realtime]', '[Request]', '[Recovery]', '[Polling]', '[Heartbeat]'];

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerOptions {
  forceShow?: boolean; // Forzar mostrar incluso en producción
}

const shouldLog = (level: LogLevel, args: unknown[]): boolean => {
  // Errores y warnings siempre se muestran
  if (level === 'error' || level === 'warn') return true;
  
  // En desarrollo, mostrar todo
  if (isDev) return true;
  
  // En producción, verificar prefijos
  const firstArg = String(args[0] || '');
  
  // Siempre mostrar categorías críticas
  if (ALWAYS_SHOW_PREFIXES.some(p => firstArg.includes(p))) return true;
  
  // Silenciar categorías verbose en producción
  if (SILENT_IN_PROD_PREFIXES.some(p => firstArg.includes(p))) return false;
  
  // Por defecto, no mostrar en producción
  return false;
};

export const logger = {
  /**
   * Debug: Solo en desarrollo, para información detallada de debugging
   */
  debug: (...args: unknown[]) => {
    if (shouldLog('debug', args)) {
      console.log(...args);
    }
  },

  /**
   * Info: Solo en desarrollo, para información general
   */
  info: (...args: unknown[]) => {
    if (shouldLog('info', args)) {
      console.log(...args);
    }
  },

  /**
   * Warn: Siempre se muestra, para advertencias importantes
   */
  warn: (...args: unknown[]) => {
    if (shouldLog('warn', args)) {
      console.warn(...args);
    }
  },

  /**
   * Error: Siempre se muestra, para errores críticos
   */
  error: (...args: unknown[]) => {
    if (shouldLog('error', args)) {
      console.error(...args);
    }
  },

  /**
   * Force: Forzar log incluso en producción (usar con moderación)
   */
  force: (...args: unknown[]) => {
    console.log(...args);
  },

  /**
   * Group: Agrupa logs relacionados (solo en desarrollo)
   */
  group: (label: string, fn: () => void) => {
    if (isDev) {
      console.group(label);
      fn();
      console.groupEnd();
    }
  },

  /**
   * Time: Medir tiempo de ejecución (solo en desarrollo)
   */
  time: (label: string) => {
    if (isDev) {
      console.time(label);
    }
  },

  timeEnd: (label: string) => {
    if (isDev) {
      console.timeEnd(label);
    }
  },

  /**
   * Table: Mostrar datos en tabla (solo en desarrollo)
   */
  table: (data: unknown) => {
    if (isDev) {
      console.table(data);
    }
  }
};

export default logger;
