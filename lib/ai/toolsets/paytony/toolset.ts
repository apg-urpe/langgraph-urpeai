import { BaseToolset, BaseTool, ReadonlyContext, ToolCategory } from '../types';
import { executePythonTool } from './tools';

export class PaytonyToolset implements BaseToolset {
  name = 'paytony';
  description = 'Capacidades de ejecución de código y análisis de datos avanzado';
  category: ToolCategory = 'analytics';

  private tools: BaseTool<unknown, unknown>[] = [
    executePythonTool as BaseTool<unknown, unknown>,
  ];

  async getTools(_context?: ReadonlyContext): Promise<BaseTool<unknown, unknown>[]> {
    return this.tools;
  }

  async close(): Promise<void> {
    // Aquí se podrían cerrar sandboxes activos si se implementa persistencia de sesión
  }
}

export function createPaytonyToolset(): PaytonyToolset {
  return new PaytonyToolset();
}
