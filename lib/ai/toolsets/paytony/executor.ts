import { ExecutePythonInput, ExecutePythonOutput } from './types';

/**
 * Interfaz para el ejecutor de código
 */
export interface CodeExecutor {
  executePython(input: ExecutePythonInput): Promise<ExecutePythonOutput>;
}

/**
 * Implementación de ejecutor usando E2B
 * Nota: Requiere la librería @e2b/code-interpreter
 */
export class E2BExecutor implements CodeExecutor {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async executePython(input: ExecutePythonInput, context?: any): Promise<ExecutePythonOutput> {
    console.log('[Paytony] Initializing E2B sandbox...');
    
    try {
      // Usar require dinámico con try/catch para evitar errores de resolución en el build
      let Sandbox;
      try {
        const e2b = require('@e2b/code-interpreter');
        Sandbox = e2b.Sandbox;
      } catch (e) {
        throw { code: 'MODULE_NOT_FOUND', message: 'Cannot find module @e2b/code-interpreter' };
      }
      
      const sbx = await Sandbox.create({ 
        apiKey: this.apiKey, 
        timeoutMs: input.timeout,
      });

      // Inyectar el proxy de seguridad de Nylas si el código parece usarlo
      if (input.code.includes('nylas')) {
        console.log('[Paytony] Nylas SDK detected in code. Preparing secure environment...');
        
        // 1. Instalar nylas en el sandbox si no está presente
        await sbx.commands.run('pip install nylas');

        const fs = require('fs');
        const path = require('path');
        const proxyPath = path.join(process.cwd(), 'lib/ai/toolsets/paytony/secure/nylas-proxy.py');
        if (fs.existsSync(proxyPath)) {
          const proxyCode = fs.readFileSync(proxyPath, 'utf8');
          await sbx.runCode(proxyCode);
          
          // Inyectar credenciales de Nylas de forma segura
          const nylasApiKey = process.env.NYLAS_API_KEY;
          
          // Obtener grant_id del contexto si está disponible
          let grantId = null;
          if (context?.services?.supabase && context?.userId) {
            const { data } = await context.services.supabase
              .from('wp_team_humano')
              .select('grant_id')
              .eq('id', context.userId)
              .single();
            grantId = data?.grant_id;
          }
          
          await sbx.runCode(`setup_readonly_nylas(api_key="${nylasApiKey}", grant_id="${grantId || ''}")`);
        }
      }
      
      try {
        console.log('[Paytony] Executing code...');
        const execution = await sbx.runCode(input.code);
        
        return {
          stdout: execution.logs.stdout,
          stderr: execution.logs.stderr,
          results: execution.results.map((r: any) => ({
            type: r.type,
            text: r.text,
            html: r.html,
            markdown: r.markdown,
            svg: r.svg,
            png: r.png,
            jpeg: r.jpeg,
            latex: r.latex,
            json: r.json,
            javascript: r.javascript,
          })),
          error: execution.error ? `${execution.error.name}: ${execution.error.value}\n${execution.error.traceback}` : undefined,
          execution_id: sbx.sandboxId,
        };
      } finally {
        await sbx.kill();
      }
    } catch (error: any) {
      if (error.code === 'MODULE_NOT_FOUND' || error.message?.includes('Cannot find module')) {
        throw new Error('E2B SDK (@e2b/code-interpreter) no está instalado. Ejecute "npm install @e2b/code-interpreter" para habilitar Paytony.');
      }
      throw error;
    }
  }
}
