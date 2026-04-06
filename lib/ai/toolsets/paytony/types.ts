import { z } from 'zod';

/**
 * Esquema de entrada para la ejecución de Python
 */
export const ExecutePythonInputSchema = z.object({
  code: z.string().describe('Código Python a ejecutar'),
  timeout: z.number().describe('Tiempo máximo de ejecución en ms').default(30000),
});

export type ExecutePythonInput = z.infer<typeof ExecutePythonInputSchema>;

/**
 * Esquema de resultado de ejecución
 */
export const ExecutePythonOutputSchema = z.object({
  stdout: z.array(z.string()).describe('Salida estándar'),
  stderr: z.array(z.string()).describe('Salida de error'),
  results: z.array(z.any()).describe('Resultados de la última expresión (objetos, figuras, etc)'),
  error: z.string().optional().describe('Error de ejecución si hubo alguno'),
  execution_id: z.string().describe('ID de la ejecución en el sandbox'),
});

export type ExecutePythonOutput = z.infer<typeof ExecutePythonOutputSchema>;
