/**
 * BlockValidator.ts - Sistema de Validación Multi-Capa v4
 * 
 * Proporciona validación robusta de UIBlocks con:
 * - Validación Zod por tipo específico
 * - Fallback a schema genérico
 * - Recuperación de datos parciales
 * - Logging para debugging
 */

import { z } from 'zod';

// ============================================
// TIPOS BASE
// ============================================

export type BlockType = 
  | 'kpi_card' | 'chart' | 'table' | 'form' | 'image' | 'video' 
  | 'calendar' | 'html' | 'text_block' | 'actions' | 'card' | 'cards' | 'grid'
  | 'task_board'
  | 'error' | 'warning' | 'info' | 'alert'
  | 'unknown';

export interface ValidationResult<T = unknown> {
  success: boolean;
  data: T | null;
  error: string | null;
  warnings: string[];
  originalInput: unknown;
  recoveredFields: string[];
}

export interface ValidatedBlock {
  type: BlockType;
  title?: string;
  id?: string;
  theme?: string;
  data: Record<string, unknown>;
  _meta: {
    validated: boolean;
    validationType: 'strict' | 'loose' | 'fallback' | 'error';
    warnings: string[];
    originalType?: string;
  };
}

// ============================================
// SCHEMAS ZOD - Más permisivos para resiliencia
// ============================================

// Theme schema for visual styling
const BlockThemeSchema = z.enum([
  'default', 'success', 'warning', 'error', 'info', 
  'special', 'neutral', 'primary', 'secondary'
]).optional();

// Schema base que todos los bloques deben cumplir
const BaseBlockSchema = z.object({
  type: z.string(),
  title: z.string().optional(),
  id: z.string().optional(),
  theme: BlockThemeSchema,
  data: z.record(z.unknown()).optional().default({})
});

// Actions schema (reutilizable)
const BlockActionSchema = z.object({
  id: z.string(),
  label: z.string(),
  icon: z.string().optional(),
  payload: z.unknown().optional(),
  variant: z.enum(['primary', 'secondary', 'ghost', 'danger']).optional()
}).passthrough();

// KPI Card - Permisivo
const KpiCardDataSchema = z.object({
  value: z.union([z.string(), z.number()]),
  unit: z.string().optional(),
  change: z.number().optional(),
  trend: z.enum(['up', 'down', 'neutral']).optional(),
  trendDirection: z.enum(['up', 'down', 'neutral']).optional(),
  icon: z.string().optional(),
  description: z.string().optional(),
  actions: z.array(BlockActionSchema).optional()
}).passthrough();

const KpiCardSchema = z.object({
  type: z.literal('kpi_card'),
  title: z.string().optional(),
  id: z.string().optional(),
  theme: BlockThemeSchema,
  data: KpiCardDataSchema
});

// Chart Block - Permisivo
const ChartDataPointSchema = z.object({
  name: z.string(),
  value: z.number().optional()
}).passthrough();

const ChartDataSchema = z.object({
  chartType: z.enum(['line', 'bar', 'area', 'pie', 'donut']).optional().default('bar'),
  data: z.array(ChartDataPointSchema).optional().default([]),
  xKey: z.string().optional().default('name'),
  yKey: z.string().optional().default('value'),
  colors: z.array(z.string()).optional(),
  actions: z.array(BlockActionSchema).optional()
}).passthrough();

const ChartBlockSchema = z.object({
  type: z.literal('chart'),
  title: z.string().optional(),
  id: z.string().optional(),
  theme: BlockThemeSchema,
  data: ChartDataSchema
});

// Table Block - Permisivo
const TableDataSchema = z.object({
  headers: z.array(z.string()).optional(),
  columns: z.array(z.object({
    key: z.string(),
    label: z.string(),
    align: z.enum(['left', 'center', 'right']).optional()
  })).optional(),
  rows: z.array(z.union([
    z.array(z.union([z.string(), z.number(), z.boolean()])),
    z.record(z.union([z.string(), z.number(), z.boolean()]))
  ])).optional().default([]),
  actions: z.array(BlockActionSchema).optional()
}).passthrough();

const TableBlockSchema = z.object({
  type: z.literal('table'),
  title: z.string().optional(),
  id: z.string().optional(),
  theme: BlockThemeSchema,
  data: TableDataSchema
});

// Option item can be string or {label, value} object
const OptionItemSchema = z.union([
  z.string(),
  z.object({
    label: z.string(),
    value: z.union([z.string(), z.number()])
  }).passthrough()
]);

// Form Block - Permisivo
const FormFieldSchema = z.object({
  name: z.string(),
  label: z.string().optional(),
  type: z.enum(['text', 'number', 'select', 'email', 'textarea', 'date', 'checkbox']).optional().default('text'),
  placeholder: z.string().optional(),
  required: z.boolean().optional(),
  options: z.array(OptionItemSchema).optional(),
  defaultValue: z.union([z.string(), z.number()]).optional()
}).passthrough();

const FormDataSchema = z.object({
  fields: z.array(FormFieldSchema).optional().default([]),
  submitLabel: z.string().optional().default('Submit'),
  actions: z.array(BlockActionSchema).optional()
}).passthrough();

const FormBlockSchema = z.object({
  type: z.literal('form'),
  title: z.string().optional(),
  id: z.string().optional(),
  theme: BlockThemeSchema,
  data: FormDataSchema
});

// Image Block
const ImageDataSchema = z.object({
  url: z.string(),
  alt: z.string().optional(),
  caption: z.string().optional(),
  description: z.string().optional(),
  actions: z.array(BlockActionSchema).optional()
}).passthrough();

const ImageBlockSchema = z.object({
  type: z.literal('image'),
  title: z.string().optional(),
  id: z.string().optional(),
  theme: BlockThemeSchema,
  data: ImageDataSchema
});

// Video Block
const VideoDataSchema = z.object({
  url: z.string(),
  poster: z.string().optional(),
  autoPlay: z.boolean().optional(),
  description: z.string().optional(),
  actions: z.array(BlockActionSchema).optional()
}).passthrough();

const VideoBlockSchema = z.object({
  type: z.literal('video'),
  title: z.string().optional(),
  id: z.string().optional(),
  theme: BlockThemeSchema,
  data: VideoDataSchema
});

// Calendar Block
const CalendarEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  start: z.string(),
  end: z.string().optional(),
  description: z.string().optional(),
  category: z.enum(['meeting', 'deadline', 'reminder', 'holiday']).optional(),
  color: z.string().optional()
}).passthrough();

const CalendarDataSchema = z.object({
  view: z.enum(['month', 'week', 'day']).optional().default('month'),
  currentDate: z.string().optional(),
  events: z.array(CalendarEventSchema).optional().default([]),
  actions: z.array(BlockActionSchema).optional()
}).passthrough();

const CalendarBlockSchema = z.object({
  type: z.literal('calendar'),
  title: z.string().optional(),
  id: z.string().optional(),
  theme: BlockThemeSchema,
  data: CalendarDataSchema
});

// Text Block
const TextDataSchema = z.object({
  content: z.string().optional().default(''),
  markdown: z.boolean().optional().default(true),
  actions: z.array(BlockActionSchema).optional()
}).passthrough();

const TextBlockSchema = z.object({
  type: z.literal('text_block'),
  title: z.string().optional(),
  id: z.string().optional(),
  theme: BlockThemeSchema,
  data: TextDataSchema
});

// Actions Block
const ActionsDataSchema = z.object({
  actions: z.array(BlockActionSchema).optional().default([])
}).passthrough();

const ActionsBlockSchema = z.object({
  type: z.literal('actions'),
  title: z.string().optional(),
  id: z.string().optional(),
  theme: BlockThemeSchema,
  data: ActionsDataSchema
});

// Card Block
const CardFieldSchema = z.object({
  label: z.string(),
  value: z.union([z.string(), z.array(z.string())])
}).passthrough();

const CardSectionSchema = z.object({
  type: z.string().optional(),
  title: z.string(),
  body: z.union([z.string(), z.array(z.string())]).optional(),
  content: z.union([z.string(), z.array(z.string())]).optional(),
  fields: z.array(CardFieldSchema).optional()
}).passthrough();

const CardDataSchema = z.object({
  // New simple format (from AI)
  title: z.string().optional(),
  subtitle: z.string().optional(),
  image: z.string().optional(),
  footer: z.string().optional(),
  // Content can be string (simple) OR array of sections (structured)
  content: z.union([z.string(), z.array(CardSectionSchema)]).optional(),
  // Legacy header format
  header: z.object({
    subtitle: z.string().optional(),
    image: z.string().optional()
  }).optional(),
  // Legacy sections format
  sections: z.array(CardSectionSchema).optional(),
  // Legacy individual fields
  overview: z.string().optional(),
  productos: z.string().optional(),
  contacto: z.string().optional(),
  testimonios: z.string().optional(),
  actions: z.array(BlockActionSchema).optional()
}).passthrough();

const CardBlockSchema = z.object({
  type: z.literal('card'),
  title: z.string().optional(),
  id: z.string().optional(),
  theme: BlockThemeSchema,
  data: CardDataSchema
});

// Cards Block (multiple cards) - Formato rico con imagen, acciones, etc.
const CardItemSchema = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  description: z.string().optional(),
  content: z.string().optional(),
  image: z.string().optional(),
  theme: BlockThemeSchema,
  actions: z.array(BlockActionSchema).optional()
}).passthrough();

const CardsDataSchema = z.object({
  cards: z.array(CardItemSchema).optional()
}).passthrough();

const CardsBlockSchema = z.object({
  type: z.literal('cards'),
  title: z.string().optional(),
  id: z.string().optional(),
  theme: BlockThemeSchema,
  data: CardsDataSchema
});

// Grid Block (cards grid)
const GridItemSchema = z.object({
  type: z.string().optional(),
  image: z.string().optional(),
  title: z.string().optional(),
  content: z.string().optional(),
  badge: z.string().optional(),
  footer: z.string().optional(),
  actions: z.array(BlockActionSchema).optional()
}).passthrough();

const GridDataSchema = z.object({
  columns: z.string().optional().default('repeat(auto-fit,minmax(240px,1fr))'),
  items: z.array(GridItemSchema).optional().default([]),
  actions: z.array(BlockActionSchema).optional()
}).passthrough();

const GridBlockSchema = z.object({
  type: z.literal('grid'),
  title: z.string().optional(),
  id: z.string().optional(),
  theme: BlockThemeSchema,
  data: GridDataSchema
});

// Alert/Info/Warning/Error Blocks
const AlertDataSchema = z.object({
  message: z.string().optional(),
  content: z.string().optional(),
  details: z.union([z.string(), z.record(z.unknown())]).optional(),
  code: z.string().optional(),
  error: z.string().optional(),
  actions: z.array(BlockActionSchema).optional()
}).passthrough();

const AlertBlockSchema = z.object({
  type: z.enum(['error', 'warning', 'info', 'alert']),
  title: z.string().optional(),
  id: z.string().optional(),
  theme: BlockThemeSchema,
  data: AlertDataSchema
});

// HTML Block
const HtmlDataSchema = z.object({
  content: z.string().optional().default(''),
  actions: z.array(BlockActionSchema).optional()
}).passthrough();

const HtmlBlockSchema = z.object({
  type: z.literal('html'),
  title: z.string().optional(),
  id: z.string().optional(),
  theme: BlockThemeSchema,
  data: HtmlDataSchema
});

// Task Board Block
const TaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional().default('pending'),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional().default('medium'),
  assignee: z.string().optional(),
  dueDate: z.string().optional(),
  tags: z.array(z.string()).optional(),
  createdAt: z.string().optional()
}).passthrough();

const TaskBoardDataSchema = z.object({
  tasks: z.array(TaskSchema).optional().default([]),
  assignees: z.array(z.string()).optional().default([]),
  view: z.enum(['list', 'board']).optional().default('list'),
  actions: z.array(BlockActionSchema).optional()
}).passthrough();

const TaskBoardBlockSchema = z.object({
  type: z.literal('task_board'),
  title: z.string().optional(),
  id: z.string().optional(),
  data: TaskBoardDataSchema
});

// ============================================
// REGISTRO DE SCHEMAS
// ============================================

const SCHEMA_REGISTRY: Record<string, z.ZodType> = {
  kpi_card: KpiCardSchema,
  chart: ChartBlockSchema,
  table: TableBlockSchema,
  form: FormBlockSchema,
  image: ImageBlockSchema,
  video: VideoBlockSchema,
  calendar: CalendarBlockSchema,
  text_block: TextBlockSchema,
  actions: ActionsBlockSchema,
  card: CardBlockSchema,
  cards: CardsBlockSchema,
  grid: GridBlockSchema,
  error: AlertBlockSchema,
  warning: AlertBlockSchema,
  info: AlertBlockSchema,
  alert: AlertBlockSchema,
  html: HtmlBlockSchema,
  task_board: TaskBoardBlockSchema
};

// ============================================
// CLASE PRINCIPAL: BlockValidator
// ============================================

export class BlockValidator {
  private static instance: BlockValidator;
  private debug: boolean;

  private constructor(debug = false) {
    this.debug = debug;
  }

  static getInstance(debug = false): BlockValidator {
    if (!BlockValidator.instance) {
      BlockValidator.instance = new BlockValidator(debug);
    }
    return BlockValidator.instance;
  }

  /**
   * Valida un bloque con múltiples estrategias de fallback
   */
  validate(input: unknown): ValidatedBlock {
    const warnings: string[] = [];
    
    // Paso 0: Si es null/undefined, retornar error block
    if (input === null || input === undefined) {
      return this.createErrorBlock('Input is null or undefined', input, warnings);
    }

    // Paso 1: Intentar parsear si es string
    let data: unknown = input;
    if (typeof input === 'string') {
      try {
        data = JSON.parse(input);
        warnings.push('Input was string, parsed to JSON');
      } catch (e) {
        return this.createErrorBlock(`Invalid JSON string: ${(e as Error).message}`, input, warnings);
      }
    }

    // Paso 2: Verificar que es objeto
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      return this.createErrorBlock('Input must be an object', input, warnings);
    }

    const obj = data as Record<string, unknown>;

    // 🆕 Paso 2.5: Inferencia de tipo para formatos legacy/implícitos
    if (!obj.type && !obj.data) {
      // Caso: { fields: { "Label": "Value" } } (Simple Key-Value Object)
      if (obj.fields && typeof obj.fields === 'object' && !Array.isArray(obj.fields)) {
        this.log('⚠️ Inferring legacy fields object as Card Block');
        
        const fields = Object.entries(obj.fields as Record<string, unknown>).map(([key, val]) => ({
          label: key,
          value: String(val)
        }));

        obj.type = 'card';
        obj.data = {
          sections: [
            {
              title: 'Detalles',
              fields: fields
            }
          ]
        };
        warnings.push('Inferred type "card" from legacy fields object');
      }
    }

    // 🆕 Normalización específica para cards (formato simplificado: data como array directo)
    if (obj.type === 'cards' && Array.isArray(obj.data)) {
      this.log('⚠️ Normalizing simplified cards format (data[] -> data.cards[])');
      obj.data = {
        cards: obj.data
      };
      warnings.push('Normalized simplified cards format');
    }

    // 🆕 Normalización específica para Card con data key-value plano
    // Ejemplo: { type: 'card', title: 'X', data: { "Email": "a@b.com", "Teléfono": "123" } }
    if (obj.type === 'card' && obj.data && typeof obj.data === 'object' && !Array.isArray(obj.data)) {
      const data = obj.data as Record<string, unknown>;
      
      // Detectar si es key-value plano (sin sections, content, ni campos estructurados conocidos)
      const hasStructuredContent = data.sections || data.content || 
        data.overview || data.header || data.body || data.productos || data.contacto;
      
      if (!hasStructuredContent) {
        // Campos reservados que no son datos del usuario
        const reservedKeys = ['title', 'subtitle', 'image', 'footer', 'actions', 'theme'];
        
        // Extraer campos key-value que son datos del usuario
        const fields = Object.entries(data)
          .filter(([key]) => !reservedKeys.includes(key))
          .map(([label, value]) => ({
            label,
            value: typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')
          }));
        
        if (fields.length > 0) {
          this.log('⚠️ Normalizing flat key-value card data to sections format');
          obj.data = {
            title: data.title,
            subtitle: data.subtitle,
            image: data.image,
            footer: data.footer,
            actions: data.actions,
            sections: [{
              title: 'Información',
              fields
            }]
          };
          warnings.push('Normalized flat key-value card data to sections format');
        }
      }
    }

    // 🆕 Normalización específica para tablas (formato simplificado de IA)
    if (obj.type === 'table' && Array.isArray(obj.data)) {
      this.log('⚠️ Normalizing simplified table format');
      const rawRows = obj.data as Record<string, unknown>[];
      let headers: string[] = [];

      // Intentar obtener headers de 'columns' o keys del primer row
      if (Array.isArray(obj.columns)) {
        headers = obj.columns as string[];
      } else if (rawRows.length > 0) {
        headers = Object.keys(rawRows[0]);
      }

      // Convertir objetos a arrays ordenados por headers
      const rows = rawRows.map(row => {
        return headers.map(header => {
          const val = row[header];
          return val === undefined || val === null ? '' : String(val);
        });
      });

      obj.data = {
        headers,
        rows
      };
      
      warnings.push('Normalized simplified table format');
    }

    // Paso 3: Extraer tipo
    const blockType = obj.type as string;
    if (!blockType || typeof blockType !== 'string') {
      return this.createErrorBlock('Block must have a "type" field', input, warnings);
    }

    // Paso 4: Intentar validación estricta con schema específico
    const schema = SCHEMA_REGISTRY[blockType];
    if (schema) {
      const strictResult = schema.safeParse(data);
      if (strictResult.success) {
        this.log(`✅ Strict validation passed for type: ${blockType}`);
        return {
          ...strictResult.data,
          _meta: {
            validated: true,
            validationType: 'strict',
            warnings
          }
        } as ValidatedBlock;
      }
      
      // Registrar errores pero continuar con fallback
      warnings.push(`Strict validation failed: ${strictResult.error.message}`);
      this.log(`⚠️ Strict validation failed for ${blockType}, trying loose...`);
    }

    // Paso 5: Validación loose con schema base
    const looseResult = BaseBlockSchema.safeParse(data);
    if (looseResult.success) {
      this.log(`✅ Loose validation passed for type: ${blockType}`);
      return {
        type: blockType as BlockType,
        title: obj.title as string | undefined,
        id: obj.id as string | undefined,
        theme: obj.theme as string | undefined,
        data: (obj.data as Record<string, unknown>) || {},
        _meta: {
          validated: true,
          validationType: 'loose',
          warnings,
          originalType: blockType
        }
      };
    }

    // Paso 6: Fallback - intentar recuperar lo que se pueda
    this.log(`⚠️ Loose validation failed, creating fallback block`);
    warnings.push('Created fallback block from partial data');
    
    return {
      type: this.isKnownType(blockType) ? (blockType as BlockType) : 'unknown',
      title: typeof obj.title === 'string' ? obj.title : undefined,
      id: typeof obj.id === 'string' ? obj.id : undefined,
      theme: typeof obj.theme === 'string' ? obj.theme : undefined,
      data: typeof obj.data === 'object' && obj.data !== null 
        ? (obj.data as Record<string, unknown>) 
        : { _raw: obj },
      _meta: {
        validated: true,
        validationType: 'fallback',
        warnings,
        originalType: blockType
      }
    };
  }

  /**
   * Valida un array de bloques, filtrando los inválidos
   */
  validateMany(inputs: unknown[]): ValidatedBlock[] {
    if (!Array.isArray(inputs)) {
      this.log('❌ validateMany received non-array input');
      return [];
    }

    return inputs
      .map((input, index) => {
        try {
          return this.validate(input);
        } catch (e) {
          this.log(`❌ Error validating block at index ${index}: ${(e as Error).message}`);
          return this.createErrorBlock(`Validation error at index ${index}`, input, []);
        }
      })
      .filter(block => block._meta.validationType !== 'error' || this.shouldShowErrorBlock(block));
  }

  /**
   * Parsea JSON de forma segura con múltiples intentos de reparación
   */
  safeParseJSON(input: string): { success: boolean; data: unknown; error?: string } {
    // Intento 1: Parse directo
    try {
      return { success: true, data: JSON.parse(input) };
    } catch (e1) {
      // Intento 2: Limpiar caracteres problemáticos
      try {
        const cleaned = input
          .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Control chars
          .replace(/,\s*([}\]])/g, '$1') // Trailing commas
          .trim();
        return { success: true, data: JSON.parse(cleaned) };
      } catch (e2) {
        // Intento 3: Extraer JSON de texto mixto
        const jsonMatch = input.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            return { success: true, data: JSON.parse(jsonMatch[0]) };
          } catch (e3) {
            // Fall through
          }
        }
        return { success: false, data: null, error: (e1 as Error).message };
      }
    }
  }

  private createErrorBlock(message: string, originalInput: unknown, warnings: string[]): ValidatedBlock {
    this.log(`❌ Creating error block: ${message}`);
    return {
      type: 'error',
      title: 'Validation Error',
      data: {
        message,
        details: typeof originalInput === 'string' 
          ? originalInput.substring(0, 500) 
          : JSON.stringify(originalInput).substring(0, 500),
        code: 'VALIDATION_ERROR'
      },
      _meta: {
        validated: false,
        validationType: 'error',
        warnings: [...warnings, message]
      }
    };
  }

  private isKnownType(type: string): boolean {
    return type in SCHEMA_REGISTRY;
  }

  private shouldShowErrorBlock(block: ValidatedBlock): boolean {
    // Solo mostrar error blocks si tienen información útil
    return block.data.message !== 'Input is null or undefined';
  }

  private log(message: string): void {
    if (this.debug) {
      console.log(`[BlockValidator] ${message}`);
    }
  }
}

// ============================================
// EXPORTS
// ============================================

export const blockValidator = BlockValidator.getInstance(
  typeof window !== 'undefined' && (window as any).__DEV__
);

export function validateBlock(input: unknown): ValidatedBlock {
  return blockValidator.validate(input);
}

export function validateBlocks(inputs: unknown[]): ValidatedBlock[] {
  return blockValidator.validateMany(inputs);
}

export { SCHEMA_REGISTRY };
