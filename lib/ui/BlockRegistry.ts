/**
 * BlockRegistry.ts - Registro Extensible de Componentes v4
 * 
 * Permite agregar nuevos tipos de bloques sin modificar VisualRenderer.
 * Soporta:
 * - Registro dinámico de componentes
 * - Configuración por tipo (tamaño, comportamiento)
 * - Hot-reload friendly
 */

import { logger } from '../logger';

import * as React from 'react';
import { z } from 'zod';
import type { ValidatedBlock } from './BlockValidator';

// ============================================
// TIPOS
// ============================================

export interface BlockComponentProps {
  block: ValidatedBlock;
  onInteract?: (data: unknown) => void;
  className?: string;
}

export type BlockComponent = React.ComponentType<BlockComponentProps>;

export interface BlockConfig {
  /** Componente React para renderizar */
  component: BlockComponent;
  /** Schema Zod para validación (opcional, usa el default) */
  schema?: z.ZodType;
  /** Clases de grid por defecto */
  gridClass: string;
  /** Clases de grid en dashboard */
  dashboardGridClass?: string;
  /** Si el bloque puede ser interactivo */
  interactive?: boolean;
  /** Prioridad de renderizado (mayor = primero) */
  priority?: number;
  /** Nombre para mostrar en debug */
  displayName: string;
  /** Icono Lucide para el tipo */
  icon?: string;
}

export interface RegistryOptions {
  /** Si permitir override de tipos existentes */
  allowOverride?: boolean;
  /** Callback cuando se registra un nuevo tipo */
  onRegister?: (type: string, config: BlockConfig) => void;
}

// ============================================
// GRID PRESETS
// ============================================

export const GRID_PRESETS = {
  // Tarjetas pequeñas (KPIs)
  small: 'col-span-12 sm:col-span-6 md:col-span-4 lg:col-span-3',
  // Tarjetas medianas (charts, forms)
  medium: 'col-span-12 md:col-span-6',
  // Tarjetas grandes (tables, calendars)
  large: 'col-span-12',
  // Tarjetas de media (images, videos)
  media: 'col-span-12 md:col-span-6',
  // Gráficos tipo pie (más pequeños)
  pie: 'col-span-12 sm:col-span-6 md:col-span-4',
  // Formularios
  form: 'col-span-12 md:col-span-8 lg:col-span-6',
  // Acciones inline
  actions: 'col-span-12 sm:col-span-6',
} as const;

// ============================================
// CLASE PRINCIPAL: BlockRegistry
// ============================================

export class BlockRegistry {
  private static instance: BlockRegistry;
  private registry: Map<string, BlockConfig> = new Map();
  private options: RegistryOptions;
  private fallbackComponent: BlockComponent | null = null;

  private constructor(options: RegistryOptions = {}) {
    this.options = {
      allowOverride: false,
      ...options
    };
  }

  static getInstance(options?: RegistryOptions): BlockRegistry {
    if (!BlockRegistry.instance) {
      BlockRegistry.instance = new BlockRegistry(options);
    }
    return BlockRegistry.instance;
  }

  /**
   * Registra un nuevo tipo de bloque
   */
  register(type: string, config: BlockConfig): this {
    if (this.registry.has(type) && !this.options.allowOverride) {
      logger.warn(`[BlockRegistry] Type "${type}" already registered. Use allowOverride to replace.`);
      return this;
    }

    this.registry.set(type, {
      priority: 0,
      interactive: false,
      ...config
    });

    this.options.onRegister?.(type, config);
    return this;
  }

  /**
   * Registra múltiples tipos a la vez
   */
  registerMany(configs: Record<string, BlockConfig>): this {
    Object.entries(configs).forEach(([type, config]) => {
      this.register(type, config);
    });
    return this;
  }

  /**
   * Obtiene la configuración para un tipo
   */
  get(type: string): BlockConfig | undefined {
    return this.registry.get(type);
  }

  /**
   * Verifica si un tipo está registrado
   */
  has(type: string): boolean {
    return this.registry.has(type);
  }

  /**
   * Obtiene el componente para un tipo
   */
  getComponent(type: string): BlockComponent | null {
    const config = this.registry.get(type);
    return config?.component || this.fallbackComponent;
  }

  /**
   * Obtiene la clase de grid para un tipo
   */
  getGridClass(type: string, isDashboard = false): string {
    const config = this.registry.get(type);
    if (!config) return GRID_PRESETS.medium;
    
    if (isDashboard && config.dashboardGridClass) {
      return config.dashboardGridClass;
    }
    return config.gridClass;
  }

  /**
   * Define el componente fallback para tipos desconocidos
   */
  setFallback(component: BlockComponent): this {
    this.fallbackComponent = component;
    return this;
  }

  /**
   * Obtiene todos los tipos registrados
   */
  getTypes(): string[] {
    return Array.from(this.registry.keys());
  }

  /**
   * Obtiene todos los tipos ordenados por prioridad
   */
  getTypesByPriority(): string[] {
    return Array.from(this.registry.entries())
      .sort((a, b) => (b[1].priority || 0) - (a[1].priority || 0))
      .map(([type]) => type);
  }

  /**
   * Obtiene metadata para debug
   */
  getDebugInfo(): Record<string, { displayName: string; gridClass: string; interactive: boolean }> {
    const info: Record<string, { displayName: string; gridClass: string; interactive: boolean }> = {};
    this.registry.forEach((config, type) => {
      info[type] = {
        displayName: config.displayName,
        gridClass: config.gridClass,
        interactive: config.interactive || false
      };
    });
    return info;
  }

  /**
   * Limpia el registro (útil para testing)
   */
  clear(): this {
    this.registry.clear();
    return this;
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const blockRegistry = BlockRegistry.getInstance({
  allowOverride: process.env.NODE_ENV === 'development'
});

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Obtiene la clase de grid para un bloque validado
 */
export function getBlockGridClass(block: ValidatedBlock, isDashboard = false): string {
  const type = block.type;
  
  // Override basado en datos del bloque
  if (type === 'chart' && block.data?.chartType === 'pie') {
    return GRID_PRESETS.pie;
  }
  
  return blockRegistry.getGridClass(type, isDashboard);
}

/**
 * Verifica si un bloque debe ser interactivo
 */
export function isBlockInteractive(block: ValidatedBlock): boolean {
  const config = blockRegistry.get(block.type);
  if (!config) return false;
  
  // También verificar si tiene actions
  const hasActions = Array.isArray(block.data?.actions) && block.data.actions.length > 0;
  return config.interactive || hasActions;
}

export default blockRegistry;
