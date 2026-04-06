/**
 * Environment Variables Validator
 * 
 * Propósito:
 * - Validación temprana de variables de entorno requeridas
 * - Prevención de errores en runtime por configuración faltante
 * - Tipado seguro de variables de entorno
 * - Mensajes de error claros para debugging
 * 
 * Uso:
 * ```typescript
 * import { validateEnv } from '@/lib/env-validator';
 * 
 * // En app/layout.tsx o punto de entrada
 * validateEnv();
 * ```
 */

import { z } from 'zod';

const envSchema = z.object({
  // Supabase (requerido, público)
  NEXT_PUBLIC_SUPABASE_URL: z.string().url({
    message: 'NEXT_PUBLIC_SUPABASE_URL debe ser una URL válida'
  }),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, {
    message: 'NEXT_PUBLIC_SUPABASE_ANON_KEY es requerida'
  }),

  // Gemini API (requerido, privado)
  GEMINI_API_KEY: z.string().min(1, {
    message: 'GEMINI_API_KEY es requerida para Monica AI'
  }).optional(),

  // Nylas API (opcional)
  NYLAS_API_KEY: z.string().optional(),
  NYLAS_API_URI: z.string().url().optional(),
  NYLAS_CLIENT_ID: z.string().optional(),
  NEXT_PUBLIC_NYLAS_CLIENT_ID: z.string().optional(),

  // Node Environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development')
});

export type EnvConfig = z.infer<typeof envSchema>;

let cachedEnv: EnvConfig | null = null;

/**
 * Valida las variables de entorno requeridas
 * Lanza error si faltan variables críticas
 */
export function validateEnv(): EnvConfig {
  if (cachedEnv) {
    return cachedEnv;
  }

  try {
    const env = {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      NYLAS_API_KEY: process.env.NYLAS_API_KEY,
      NYLAS_API_URI: process.env.NYLAS_API_URI,
      NYLAS_CLIENT_ID: process.env.NYLAS_CLIENT_ID,
      NEXT_PUBLIC_NYLAS_CLIENT_ID: process.env.NEXT_PUBLIC_NYLAS_CLIENT_ID,
      NODE_ENV: process.env.NODE_ENV || 'development'
    };

    cachedEnv = envSchema.parse(env);
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[EnvValidator] ✅ Variables de entorno validadas correctamente');
    }

    return cachedEnv;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.errors.map(err => {
        const path = err.path.join('.');
        return `  - ${path}: ${err.message}`;
      }).join('\n');

      const errorMessage = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❌ ERROR: Variables de entorno faltantes o inválidas
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${missingVars}

Por favor, configura estas variables en tu archivo .env.local

Ejemplo de .env.local:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key_aqui
GEMINI_API_KEY=tu_gemini_api_key_aqui
NYLAS_API_KEY=tu_nylas_api_key_aqui (opcional)
NYLAS_API_URI=https://api.us.nylas.com (opcional)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

      console.error(errorMessage);
      throw new Error('Variables de entorno faltantes. Ver detalles arriba.');
    }

    throw error;
  }
}

/**
 * Obtiene una variable de entorno validada
 * Lanza error si la variable no existe o no está validada
 */
export function getEnv<K extends keyof EnvConfig>(key: K): EnvConfig[K] {
  if (!cachedEnv) {
    validateEnv();
  }

  return cachedEnv![key];
}

/**
 * Verifica si una variable de entorno opcional está configurada
 */
export function hasEnv(key: keyof EnvConfig): boolean {
  if (!cachedEnv) {
    validateEnv();
  }

  const value = cachedEnv![key];
  return value !== undefined && value !== null && value !== '';
}

/**
 * Obtiene todas las variables de entorno validadas
 */
export function getAllEnv(): EnvConfig {
  if (!cachedEnv) {
    validateEnv();
  }

  return cachedEnv!;
}

/**
 * Valida variables de entorno en el servidor (API routes, server components)
 * Incluye validaciones adicionales para server-only vars
 */
export function validateServerEnv(): EnvConfig & { SUPABASE_SERVICE_ROLE_KEY?: string } {
  const baseEnv = validateEnv();

  const serverEnv = {
    ...baseEnv,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
  };

  if (process.env.NODE_ENV === 'development') {
    console.log('[EnvValidator] ✅ Variables de servidor validadas');
  }

  return serverEnv;
}

/**
 * Helper para desarrollo: muestra las variables configuradas (sin valores sensibles)
 */
export function logEnvStatus(): void {
  if (process.env.NODE_ENV !== 'development') {
    return;
  }

  const env = getAllEnv();
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 Estado de Variables de Entorno');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  Object.entries(env).forEach(([key, value]) => {
    const status = value ? '✅' : '❌';
    const displayValue = value 
      ? (key.includes('KEY') || key.includes('SECRET') 
          ? '***' + String(value).slice(-4) 
          : String(value).slice(0, 50) + (String(value).length > 50 ? '...' : ''))
      : 'NO CONFIGURADA';
    
    console.log(`  ${status} ${key}: ${displayValue}`);
  });
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

/**
 * Validación en build time (para next.config.js)
 */
export function validateBuildEnv(): void {
  try {
    validateEnv();
    console.log('✅ Build: Variables de entorno validadas');
  } catch (error) {
    console.error('❌ Build: Error en validación de variables de entorno');
    throw error;
  }
}
