/**
 * Tool System Utilities
 * 
 * Funciones utilitarias para el sistema de tools.
 * 
 * @module lib/ai/toolsets/utils
 */

import { z } from 'zod';
import type { GeminiFunctionDeclaration, BaseTool, ToolResult } from './types';

// ============================================================================
// ZOD TO JSON SCHEMA
// ============================================================================

/**
 * Convierte un schema Zod a JSON Schema compatible con Gemini.
 * Versión simplificada que maneja los tipos más comunes.
 */
export function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  // Handle ZodObject
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      const zodValue = value as z.ZodType;
      const { schema: propSchema, isOptional } = unwrapOptional(zodValue);
      
      properties[key] = zodTypeToJsonSchema(propSchema);
      
      if (!isOptional) {
        required.push(key);
      }
    }

    return {
      type: 'object',
      properties,
      ...(required.length > 0 ? { required } : {})
    };
  }

  return zodTypeToJsonSchema(schema);
}

/**
 * Unwrap ZodOptional y ZodNullable
 */
function unwrapOptional(schema: z.ZodType): { schema: z.ZodType; isOptional: boolean } {
  if (schema instanceof z.ZodOptional) {
    return { schema: schema.unwrap(), isOptional: true };
  }
  if (schema instanceof z.ZodNullable) {
    return { schema: schema.unwrap(), isOptional: true };
  }
  if (schema instanceof z.ZodDefault) {
    return { schema: schema.removeDefault(), isOptional: true };
  }
  return { schema, isOptional: false };
}

/**
 * Convierte tipos Zod individuales a JSON Schema
 */
function zodTypeToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  // Get description if available
  const description = schema.description;
  const base: Record<string, unknown> = description ? { description } : {};

  // String
  if (schema instanceof z.ZodString) {
    return { ...base, type: 'string' };
  }

  // Number
  if (schema instanceof z.ZodNumber) {
    return { ...base, type: 'number' };
  }

  // Boolean
  if (schema instanceof z.ZodBoolean) {
    return { ...base, type: 'boolean' };
  }

  // Array
  if (schema instanceof z.ZodArray) {
    return {
      ...base,
      type: 'array',
      items: zodTypeToJsonSchema(schema.element)
    };
  }

  // Enum
  if (schema instanceof z.ZodEnum) {
    return {
      ...base,
      type: 'string',
      enum: schema.options
    };
  }

  // Literal
  if (schema instanceof z.ZodLiteral) {
    const value = schema.value;
    return {
      ...base,
      type: typeof value,
      enum: [value]
    };
  }

  // Union (simplified - takes first option's type)
  if (schema instanceof z.ZodUnion) {
    const options = schema.options as z.ZodType[];
    if (options.length > 0) {
      return zodTypeToJsonSchema(options[0]);
    }
  }

  // Object (recursive)
  if (schema instanceof z.ZodObject) {
    return { ...base, ...zodToJsonSchema(schema) };
  }

  // Record
  if (schema instanceof z.ZodRecord) {
    return {
      ...base,
      type: 'object',
      additionalProperties: true
    };
  }

  // Optional/Nullable (unwrap)
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    return zodTypeToJsonSchema(schema.unwrap());
  }

  // Default (unwrap)
  if (schema instanceof z.ZodDefault) {
    return zodTypeToJsonSchema(schema.removeDefault());
  }

  // Fallback
  return { ...base, type: 'string' };
}

// ============================================================================
// TOOL TO GEMINI FORMAT
// ============================================================================

/**
 * Convierte una BaseTool a formato de declaración de función de Gemini
 */
export function toolToGeminiDeclaration(tool: BaseTool<unknown, unknown>): GeminiFunctionDeclaration {
  const jsonSchema = zodToJsonSchema(tool.inputSchema);
  
  return {
    name: tool.name,
    description: tool.description,
    parameters: {
      type: 'object',
      properties: (jsonSchema.properties || {}) as Record<string, unknown>,
      required: jsonSchema.required as string[] | undefined
    }
  };
}

// ============================================================================
// RESULT HELPERS
// ============================================================================

/**
 * Crea un resultado exitoso
 */
export function successResult<T>(data: T, metadata?: ToolResult<T>['metadata']): ToolResult<T> {
  return {
    success: true,
    data,
    metadata
  };
}

/**
 * Crea un resultado de error
 */
export function errorResult(error: string): ToolResult<never> {
  return {
    success: false,
    error
  };
}

// ============================================================================
// DATA TRUNCATION
// ============================================================================

const MAX_TRACE_DATA_SIZE = 50 * 1024; // 50KB

/**
 * Trunca datos grandes para traces de observabilidad
 */
export function truncateDataForTrace(data: unknown, maxSize: number = MAX_TRACE_DATA_SIZE): unknown {
  if (!data) return data;
  
  const str = JSON.stringify(data);
  if (str.length <= maxSize) return data;
  
  // Para arrays, mantener primeros N items + resumen
  if (Array.isArray(data)) {
    const itemsToKeep = Math.min(10, data.length);
    return {
      _truncated: true,
      _originalCount: data.length,
      _displayedCount: itemsToKeep,
      _sizeBytes: str.length,
      items: data.slice(0, itemsToKeep)
    };
  }
  
  // Para objetos con array data (patrón común)
  if (typeof data === 'object' && data !== null && 'data' in data && Array.isArray((data as any).data)) {
    const itemsToKeep = Math.min(10, (data as any).data.length);
    return {
      ...(data as object),
      data: (data as any).data.slice(0, itemsToKeep),
      _truncated: true,
      _originalCount: (data as any).data.length,
      _displayedCount: itemsToKeep,
      _sizeBytes: str.length
    };
  }
  
  // Para otros objetos grandes, retornar resumen
  return {
    _truncated: true,
    _sizeBytes: str.length,
    _message: 'Data too large for trace preview',
    _keys: Object.keys(data as object).slice(0, 20)
  };
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

// Tipos para resultado de validación
export type ValidationSuccess<T> = { success: true; data: T; errors?: never };
export type ValidationFailure = { success: false; errors: string[]; data?: never };
export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

/**
 * Valida input con schema Zod y retorna resultado tipado
 */
export function validateInput<T>(
  schema: z.ZodType<T>,
  data: unknown
): ValidationResult<T> {
  const result = schema.safeParse(data);
  
  if (result.success) {
    return { success: true, data: result.data };
  }
  
  const errors = result.error.errors.map(e => 
    `${e.path.join('.')}: ${e.message}`
  );
  
  return { success: false, errors };
}

// ============================================================================
// TOOL NAME HELPERS
// ============================================================================

/**
 * Valida que el nombre de la tool sigue el formato verb_noun
 */
export function isValidToolName(name: string): boolean {
  // Debe ser snake_case con al menos un underscore
  return /^[a-z]+(_[a-z]+)+$/.test(name);
}

/**
 * Extrae el verbo del nombre de la tool
 */
export function getToolVerb(name: string): string {
  const parts = name.split('_');
  return parts[0] || name;
}

/**
 * Determina si la tool es de solo lectura basado en el verbo
 */
export function isReadOnlyTool(name: string): boolean {
  const verb = getToolVerb(name);
  const readOnlyVerbs = ['get', 'search', 'list', 'count', 'check'];
  return readOnlyVerbs.includes(verb);
}
