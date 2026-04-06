/**
 * Team Toolset
 * 
 * Toolset para gestión de equipo y configuración.
 * 
 * @module lib/ai/toolsets/team/toolset
 */

import type { BaseToolset, BaseTool, ReadonlyContext, ToolCategory } from '../types';
import { getTeamConfigTool } from './tools';

export class TeamToolset implements BaseToolset {
  name = 'team';
  description = 'Tools para gestión de equipo, roles y configuración del sistema';
  category: ToolCategory = 'team';
  
  private tools: BaseTool<unknown, unknown>[] = [
    getTeamConfigTool as BaseTool<unknown, unknown>,
  ];
  
  async getTools(_context?: ReadonlyContext): Promise<BaseTool<unknown, unknown>[]> {
    return this.tools;
  }
  
  async close(): Promise<void> {}
}

export function createTeamToolset(): TeamToolset {
  return new TeamToolset();
}
