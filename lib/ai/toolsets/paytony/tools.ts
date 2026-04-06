import { z } from 'zod';
import { BaseTool, ToolContext, ToolResult } from '../types';
import { ExecutePythonInputSchema, ExecutePythonOutputSchema, ExecutePythonOutput } from './types';
import { E2BExecutor } from './executor';
import { successResult, errorResult } from '../utils';

/**
 * Tool: execute_python
 * Ejecuta código Python en un sandbox seguro.
 */
export const executePythonTool: BaseTool<any, ExecutePythonOutput> = {
  name: 'execute_python',
  description: 'Ejecuta código Python en un entorno seguro y aislado (Sandbox). Úsalo para cálculos complejos, procesamiento de datos, análisis estadístico o generación de gráficos.',
  category: 'analytics',
  inputSchema: ExecutePythonInputSchema,
  outputSchema: ExecutePythonOutputSchema,
  requiresConfirmation: false,
  readOnly: false,

  async execute(input, context: ToolContext): Promise<ToolResult<ExecutePythonOutput>> {
    const apiKey = process.env.E2B_API_KEY;
    
    if (!apiKey) {
      return errorResult('E2B_API_KEY no configurada en las variables de entorno.');
    }

    try {
      const executor = new E2BExecutor(apiKey);
      const result = await executor.executePython(input);
      return successResult(result);
    } catch (error: any) {
      return errorResult(`Error en ejecución Python: ${error.message}`);
    }
  }
};
