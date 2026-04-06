/**
 * UI Library v4 - Sistema de UI Dinámica Robusto
 * 
 * Exporta todos los componentes y utilidades del sistema de UI blocks.
 * 
 * Características:
 * - Validación Zod con fallbacks automáticos
 * - Parsing resiliente de JSON malformado
 * - Error boundaries por componente
 * - Registry extensible para nuevos tipos
 */

// Validator
export {
  BlockValidator,
  blockValidator,
  validateBlock,
  validateBlocks,
  SCHEMA_REGISTRY,
  type BlockType,
  type ValidationResult,
  type ValidatedBlock
} from './BlockValidator';

// Registry
export {
  blockRegistry,
  BlockRegistry,
  GRID_PRESETS,
  getBlockGridClass,
  isBlockInteractive,
  type BlockComponent,
  type BlockConfig,
  type BlockComponentProps
} from './BlockRegistry';

// Parser
export {
  ContentParser,
  contentParser,
  parseMessageContent,
  type ParsedContent,
  type ContentPart,
  type TextPart,
  type BlockPart,
  type PendingPart,
  type ErrorPart
} from './ContentParser';

// Block Registration (auto-initializes on import)
export {
  initializeBlockRegistry,
  getGridClassForType,
  isSupportedBlockType,
  getSupportedBlockTypes,
  getBlockDisplayName,
  BLOCK_CONFIGS
} from './registerBlocks';
