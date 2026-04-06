/**
 * Calendar Toolset
 * 
 * Toolset para gestión de citas y agenda.
 * 
 * @module lib/ai/toolsets/calendar/toolset
 */

import type { BaseToolset, BaseTool, ReadonlyContext, ToolCategory } from '../types';
import { getAgendaTool } from './tools';

export class CalendarToolset implements BaseToolset {
  name = 'calendar';
  description = 'Tools para gestión de citas, agenda y disponibilidad';
  category: ToolCategory = 'calendar';
  
  private tools: BaseTool<unknown, unknown>[] = [
    getAgendaTool as BaseTool<unknown, unknown>,
  ];
  
  async getTools(_context?: ReadonlyContext): Promise<BaseTool<unknown, unknown>[]> {
    return this.tools;
  }
  
  async close(): Promise<void> {}
}

export function createCalendarToolset(): CalendarToolset {
  return new CalendarToolset();
}
