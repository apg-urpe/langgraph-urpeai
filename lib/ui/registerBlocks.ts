/**
 * registerBlocks.ts - Registro de Bloques UI v4
 * 
 * Registra todos los tipos de bloques disponibles en el BlockRegistry.
 * Importar este archivo inicializa el registro con los componentes por defecto.
 */

import { blockRegistry, GRID_PRESETS, type BlockConfig } from './BlockRegistry';
import { logger } from '../logger';

// ============================================
// CONFIGURACIÓN DE BLOQUES
// ============================================

const BLOCK_CONFIGS: Record<string, Omit<BlockConfig, 'component'>> = {
  // === DATA VISUALIZATION ===
  kpi_card: {
    displayName: 'KPI Card',
    gridClass: GRID_PRESETS.small,
    dashboardGridClass: 'col-span-6 sm:col-span-4 md:col-span-3 lg:col-span-2',
    interactive: true,
    priority: 10,
    icon: 'TrendingUp'
  },
  chart: {
    displayName: 'Chart',
    gridClass: GRID_PRESETS.medium,
    dashboardGridClass: 'col-span-12 md:col-span-6',
    interactive: true,
    priority: 9,
    icon: 'BarChart3'
  },
  table: {
    displayName: 'Data Table',
    gridClass: GRID_PRESETS.large,
    dashboardGridClass: 'col-span-12',
    interactive: true,
    priority: 8,
    icon: 'Table'
  },

  // === FORMS & INPUT ===
  form: {
    displayName: 'Form',
    gridClass: GRID_PRESETS.form,
    interactive: true,
    priority: 7,
    icon: 'FileInput'
  },
  actions: {
    displayName: 'Action Buttons',
    gridClass: GRID_PRESETS.actions,
    interactive: true,
    priority: 6,
    icon: 'MousePointerClick'
  },

  // === MEDIA ===
  image: {
    displayName: 'Image',
    gridClass: GRID_PRESETS.media,
    interactive: true,
    priority: 5,
    icon: 'Image'
  },
  video: {
    displayName: 'Video',
    gridClass: GRID_PRESETS.media,
    interactive: true,
    priority: 5,
    icon: 'Video'
  },

  // === SCHEDULING ===
  calendar: {
    displayName: 'Calendar',
    gridClass: GRID_PRESETS.large,
    interactive: true,
    priority: 7,
    icon: 'Calendar'
  },

  // === CONTENT ===
  text_block: {
    displayName: 'Text Block',
    gridClass: GRID_PRESETS.medium,
    interactive: false,
    priority: 3,
    icon: 'Type'
  },
  card: {
    displayName: 'Card',
    gridClass: GRID_PRESETS.medium,
    interactive: true,
    priority: 4,
    icon: 'Card'
  },
  cards: {
    displayName: 'Cards',
    gridClass: GRID_PRESETS.large,
    interactive: true,
    priority: 4,
    icon: 'Cards'
  },
  grid: {
    displayName: 'Grid',
    gridClass: GRID_PRESETS.large,
    dashboardGridClass: GRID_PRESETS.large,
    interactive: true,
    priority: 4,
    icon: 'LayoutGrid'
  },
  html: {
    displayName: 'HTML Content',
    gridClass: GRID_PRESETS.large,
    interactive: false,
    priority: 2,
    icon: 'Code2'
  },

  // === TASK MANAGEMENT ===
  task_board: {
    displayName: 'Task Board',
    gridClass: GRID_PRESETS.large,
    dashboardGridClass: 'col-span-12',
    interactive: true,
    priority: 8,
    icon: 'CheckSquare'
  },

  // === ALERTS ===
  error: {
    displayName: 'Error Alert',
    gridClass: GRID_PRESETS.medium,
    interactive: true,
    priority: 10, // Errors get high priority
    icon: 'AlertOctagon'
  },
  warning: {
    displayName: 'Warning Alert',
    gridClass: GRID_PRESETS.medium,
    interactive: true,
    priority: 9,
    icon: 'AlertTriangle'
  },
  info: {
    displayName: 'Info Alert',
    gridClass: GRID_PRESETS.medium,
    interactive: true,
    priority: 8,
    icon: 'Info'
  },
  alert: {
    displayName: 'Alert',
    gridClass: GRID_PRESETS.medium,
    interactive: true,
    priority: 8,
    icon: 'Bell'
  }
};

// ============================================
// REGISTER BLOCKS WITHOUT COMPONENTS
// (Components are resolved at render time via VisualRenderer)
// ============================================

/**
 * Initializes the block registry with default configurations.
 * Call this once at app startup.
 */
export function initializeBlockRegistry(): void {
  // Create a placeholder component that will be handled by VisualRenderer
  const PlaceholderComponent = () => null;

  Object.entries(BLOCK_CONFIGS).forEach(([type, config]) => {
    blockRegistry.register(type, {
      ...config,
      component: PlaceholderComponent as any
    });
  });

  logger.debug('[BlockRegistry] Initialized with', Object.keys(BLOCK_CONFIGS).length, 'block types');
}

/**
 * Gets the grid class for a block type with optional overrides
 */
export function getGridClassForType(
  type: string, 
  options?: { 
    isDashboard?: boolean;
    chartType?: string;
  }
): string {
  // Special handling for chart subtypes
  if (type === 'chart' && options?.chartType === 'pie') {
    return GRID_PRESETS.pie;
  }

  const config = blockRegistry.get(type);
  if (!config) return GRID_PRESETS.medium;

  if (options?.isDashboard && config.dashboardGridClass) {
    return config.dashboardGridClass;
  }

  return config.gridClass;
}

/**
 * Check if a block type is supported
 */
export function isSupportedBlockType(type: string): boolean {
  return blockRegistry.has(type);
}

/**
 * Get all supported block types
 */
export function getSupportedBlockTypes(): string[] {
  return blockRegistry.getTypes();
}

/**
 * Get display name for a block type
 */
export function getBlockDisplayName(type: string): string {
  const config = blockRegistry.get(type);
  return config?.displayName || type;
}

// ============================================
// AUTO-INITIALIZE ON IMPORT
// ============================================

// Initialize registry when this module is imported
initializeBlockRegistry();

export { BLOCK_CONFIGS };
