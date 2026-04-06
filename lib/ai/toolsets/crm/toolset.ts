/**
 * CRM Toolset
 * 
 * Toolset para gestión de contactos, notas y embudo de ventas.
 * 
 * @module lib/ai/toolsets/crm/toolset
 */

import type { BaseToolset, BaseTool, ReadonlyContext, ToolCategory } from '../types';
import { getContactsTool, searchCrmTool, getContact360Tool, createNoteTool } from './tools';

// ============================================================================
// CRM TOOLSET
// ============================================================================

export class CrmToolset implements BaseToolset {
  name = 'crm';
  description = 'Tools para gestión de contactos, notas y embudo de ventas';
  category: ToolCategory = 'crm';
  
  private tools: BaseTool<unknown, unknown>[] = [
    searchCrmTool as BaseTool<unknown, unknown>,      // 🔍 Búsqueda universal
    getContact360Tool as BaseTool<unknown, unknown>,  // 👤 Contexto completo
    createNoteTool as BaseTool<unknown, unknown>,     // 📝 Crear notas
    getContactsTool as BaseTool<unknown, unknown>,    // Legacy: filtros específicos
  ];
  
  /**
   * Obtiene las tools disponibles según el contexto.
   * Puede filtrar por permisos de rol si es necesario.
   */
  async getTools(context?: ReadonlyContext): Promise<BaseTool<unknown, unknown>[]> {
    // En el futuro, filtrar tools según permisos del rol
    if (context?.roleId) {
      return this.filterByRole(context.roleId);
    }
    return this.tools;
  }
  
  /**
   * Filtra tools según el rol del usuario
   */
  private filterByRole(roleId: string): BaseTool<unknown, unknown>[] {
    // Por ahora, retornar todas las tools
    // En el futuro, implementar lógica de permisos
    const writeOnlyTools = ['create_note'];
    
    // Ejemplo: roles de solo lectura no pueden usar tools de escritura
    // if (roleId === 'viewer') {
    //   return this.tools.filter(tool => !writeOnlyTools.includes(tool.name));
    // }
    
    return this.tools;
  }
  
  /**
   * Limpieza de recursos
   */
  async close(): Promise<void> {
    // No hay recursos que limpiar en este toolset
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createCrmToolset(): CrmToolset {
  return new CrmToolset();
}
