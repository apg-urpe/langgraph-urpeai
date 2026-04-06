/**
 * ContentParser.ts - Parser de Contenido Resiliente v4
 * 
 * Parsea contenido de mensajes separando texto de bloques UI.
 * Maneja JSON malformado con múltiples estrategias de recuperación.
 */

import { blockValidator, type ValidatedBlock } from './BlockValidator';

// ============================================
// TIPOS
// ============================================

export interface TextPart {
  type: 'text';
  content: string;
}

export interface BlockPart {
  type: 'block';
  block: ValidatedBlock;
}

export interface PendingPart {
  type: 'pending';
  partialContent?: string;
}

export interface ErrorPart {
  type: 'error';
  message: string;
  rawContent: string;
}

export type ContentPart = TextPart | BlockPart | PendingPart | ErrorPart;

export interface ParsedContent {
  parts: ContentPart[];
  hasErrors: boolean;
  hasPending: boolean;
  blockCount: number;
  textLength: number;
}

// ============================================
// REGEX PATTERNS
// ============================================

// Patrón para bloques UI completos (múltiples formatos soportados)
const BLOCK_PATTERNS = [
  // Formato estándar: ```json:ui ... ```
  /```(?:json:)?(?:ui|visual|block)\s*([\s\S]*?)\s*```/gi,
  // Formato alternativo: [UI_BLOCK] ... [/UI_BLOCK]
  /\[UI_BLOCK\]([\s\S]*?)\[\/UI_BLOCK\]/gi,
  // Formato JSON directo con marcador: <!--ui--> ... <!--/ui-->
  /<!--\s*ui\s*-->([\s\S]*?)<!--\s*\/ui\s*-->/gi
];

// Detectar inicio de bloque incompleto (para streaming)
// Captura TODO el contenido desde el inicio del bloque hasta el final
const INCOMPLETE_START_PATTERNS = [
  /```(?:json:)?(?:ui|visual|block)[\s\S]*$/i,  // Captura desde ```json:ui hasta el final
  /\[UI_BLOCK\][\s\S]*$/i                        // Captura desde [UI_BLOCK] hasta el final
];

// ============================================
// CLASE PRINCIPAL: ContentParser
// ============================================

export class ContentParser {
  private static instance: ContentParser;
  private debug: boolean;

  private constructor(debug = false) {
    this.debug = debug;
  }

  static getInstance(debug = false): ContentParser {
    if (!ContentParser.instance) {
      ContentParser.instance = new ContentParser(debug);
    }
    return ContentParser.instance;
  }

  /**
   * Parsea contenido de mensaje separando texto y bloques
   */
  parse(content: string, isStreaming = false): ParsedContent {
    const parts: ContentPart[] = [];
    let hasErrors = false;
    let hasPending = false;
    let blockCount = 0;
    let textLength = 0;

    if (!content || typeof content !== 'string') {
      return { parts: [], hasErrors: false, hasPending: false, blockCount: 0, textLength: 0 };
    }

    // Usar el primer patrón que coincida
    let workingPattern: RegExp | null = null;
    let hasMatches = false;

    for (const pattern of BLOCK_PATTERNS) {
      pattern.lastIndex = 0; // Reset regex
      if (pattern.test(content)) {
        hasMatches = true;
        workingPattern = new RegExp(pattern.source, pattern.flags);
        break;
      }
    }

    if (!hasMatches) {
      // No hay bloques UI explícitos
      const textContent = content.trim();
      
      // 🆕 INTENTO DE PARSEO IMPLÍCITO
      // Si el contenido parece ser un objeto JSON puro, intentar validarlo como bloque
      if (textContent.startsWith('{') && textContent.endsWith('}')) {
        try {
          const potentialJson = JSON.parse(textContent);
          // Validar con el validator (que ahora soporta inferencia de 'card' desde 'fields')
          const validated = blockValidator.validate(potentialJson);
          
          // Si es un bloque válido (no error y no unknown/fallback puro sin datos)
          if (validated.type !== 'error' && validated.type !== 'unknown') {
             // Es un bloque implícito válido!
             this.log('✨ Implicit JSON block detected and validated');
             parts.push({ type: 'block', block: validated });
             blockCount++;
             return { parts, hasErrors, hasPending, blockCount, textLength: 0 };
          }
        } catch (e) {
          // No era JSON válido o no era un bloque, continuar como texto
          this.log(`Implicit parse failed: ${(e as Error).message}`);
        }
      }

      if (textContent) {
        // Verificar si hay un bloque incompleto al final (streaming)
        if (isStreaming) {
          const pendingCheck = this.checkPendingBlock(content);
          if (pendingCheck.hasPending) {
            if (pendingCheck.textBefore) {
              parts.push({ type: 'text', content: pendingCheck.textBefore });
              textLength += pendingCheck.textBefore.length;
            }
            parts.push({ type: 'pending', partialContent: pendingCheck.partial });
            hasPending = true;
            return { parts, hasErrors, hasPending, blockCount, textLength };
          }
        }
        
        parts.push({ type: 'text', content: textContent });
        textLength += textContent.length;
      }
      return { parts, hasErrors, hasPending, blockCount, textLength };
    }

    // Dividir contenido usando el patrón
    workingPattern!.lastIndex = 0;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = workingPattern!.exec(content)) !== null) {
      // Texto antes del bloque
      const textBefore = content.substring(lastIndex, match.index).trim();
      if (textBefore) {
        parts.push({ type: 'text', content: textBefore });
        textLength += textBefore.length;
      }

      // Procesar el JSON del bloque (puede ser objeto o array)
      const jsonContent = match[1].trim();
      const blockResult = this.parseBlockJSON(jsonContent);

      if (blockResult.success) {
        // Handle both single block and array of blocks
        if (blockResult.blocks && blockResult.blocks.length > 0) {
          for (const block of blockResult.blocks) {
            parts.push({ type: 'block', block });
            blockCount++;
          }
        } else if (blockResult.block) {
          parts.push({ type: 'block', block: blockResult.block });
          blockCount++;
        }
      } else {
        parts.push({
          type: 'error',
          message: blockResult.error || 'Unknown parsing error',
          rawContent: jsonContent.substring(0, 200)
        });
        hasErrors = true;
      }

      lastIndex = match.index + match[0].length;
    }

    // Texto después del último bloque
    const textAfter = content.substring(lastIndex).trim();
    if (textAfter) {
      // Verificar si es un bloque incompleto (streaming)
      if (isStreaming) {
        const pendingCheck = this.checkPendingBlock(textAfter);
        if (pendingCheck.hasPending) {
          if (pendingCheck.textBefore) {
            parts.push({ type: 'text', content: pendingCheck.textBefore });
            textLength += pendingCheck.textBefore.length;
          }
          parts.push({ type: 'pending', partialContent: pendingCheck.partial });
          hasPending = true;
        } else {
          parts.push({ type: 'text', content: textAfter });
          textLength += textAfter.length;
        }
      } else {
        parts.push({ type: 'text', content: textAfter });
        textLength += textAfter.length;
      }
    }

    this.log(`Parsed content: ${parts.length} parts, ${blockCount} blocks, ${hasErrors ? 'with errors' : 'no errors'}`);
    
    return { parts, hasErrors, hasPending, blockCount, textLength };
  }

  /**
   * Parsea JSON de bloque con múltiples estrategias de recuperación
   * Soporta tanto objetos individuales como arrays de bloques
   */
  private parseBlockJSON(jsonContent: string): { success: boolean; block?: ValidatedBlock; blocks?: ValidatedBlock[]; error?: string } {
    // Helper para procesar JSON parseado (objeto o array)
    const processJSON = (parsed: unknown, warning?: string): { success: boolean; block?: ValidatedBlock; blocks?: ValidatedBlock[] } => {
      // Si es un array, validar cada elemento
      if (Array.isArray(parsed)) {
        const validatedBlocks = blockValidator.validateMany(parsed);
        if (validatedBlocks.length > 0) {
          if (warning) {
            validatedBlocks.forEach(b => b._meta.warnings.push(warning));
          }
          this.log(`✅ Parsed array of ${validatedBlocks.length} blocks`);
          return { success: true, blocks: validatedBlocks };
        }
        return { success: false };
      }
      
      // Si es un objeto, validar como bloque individual
      const validated = blockValidator.validate(parsed);
      if (warning) {
        validated._meta.warnings.push(warning);
      }
      return { success: true, block: validated };
    };

    // Estrategia 1: Parse directo
    try {
      const parsed = JSON.parse(jsonContent);
      const result = processJSON(parsed);
      if (result.success) return result;
    } catch (e1) {
      this.log(`Direct parse failed: ${(e1 as Error).message}`);
    }

    // Estrategia 2: Limpiar caracteres problemáticos
    try {
      const cleaned = this.cleanJSON(jsonContent);
      const parsed = JSON.parse(cleaned);
      const result = processJSON(parsed, 'JSON was cleaned before parsing');
      if (result.success) return result;
    } catch (e2) {
      this.log(`Cleaned parse failed: ${(e2 as Error).message}`);
    }

    // Estrategia 3: Reparar JSON común
    try {
      const repaired = this.repairJSON(jsonContent);
      const parsed = JSON.parse(repaired);
      const result = processJSON(parsed, 'JSON was repaired before parsing');
      if (result.success) return result;
    } catch (e3) {
      this.log(`Repaired parse failed: ${(e3 as Error).message}`);
    }

    // Estrategia 4: Extraer objeto JSON parcial (solo para objetos, no arrays)
    try {
      const extracted = this.extractJSON(jsonContent);
      if (extracted) {
        const parsed = JSON.parse(extracted);
        const result = processJSON(parsed, 'JSON was extracted from mixed content');
        if (result.success) return result;
      }
    } catch (e4) {
      this.log(`Extracted parse failed: ${(e4 as Error).message}`);
    }

    return { success: false, error: 'Failed to parse JSON after all recovery attempts' };
  }

  /**
   * Limpia caracteres problemáticos del JSON
   */
  private cleanJSON(json: string): string {
    return json
      // Remover caracteres de control
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
      // Remover BOM
      .replace(/^\uFEFF/, '')
      // Normalizar saltos de línea
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      // Remover espacios al inicio/final
      .trim();
  }

  /**
   * Intenta reparar JSON malformado común
   */
  private repairJSON(json: string): string {
    let repaired = this.cleanJSON(json);

    // 🆕 Remover comentarios JSON (/* ... */ y // ...)
    repaired = repaired.replace(/\/\*[\s\S]*?\*\//g, '');
    repaired = repaired.replace(/\/\/.*$/gm, '');

    // Reparar trailing commas
    repaired = repaired.replace(/,\s*([}\]])/g, '$1');

    // Reparar comillas simples -> dobles
    repaired = repaired.replace(/'/g, '"');

    // Reparar keys sin comillas
    repaired = repaired.replace(/(\{|,)\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');

    // Reparar undefined -> null
    repaired = repaired.replace(/:\s*undefined/g, ': null');

    // Reparar NaN -> null
    repaired = repaired.replace(/:\s*NaN/g, ': null');

    // 🆕 Limpiar espacios múltiples después de remover comentarios
    repaired = repaired.replace(/\s+/g, ' ').trim();

    return repaired;
  }

  /**
   * Extrae el primer objeto JSON válido del contenido
   */
  private extractJSON(content: string): string | null {
    // Buscar inicio de objeto
    const startIndex = content.indexOf('{');
    if (startIndex === -1) return null;

    // Encontrar el cierre balanceado
    let depth = 0;
    let inString = false;
    let escape = false;

    for (let i = startIndex; i < content.length; i++) {
      const char = content[i];

      if (escape) {
        escape = false;
        continue;
      }

      if (char === '\\') {
        escape = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === '{') depth++;
        if (char === '}') {
          depth--;
          if (depth === 0) {
            return content.substring(startIndex, i + 1);
          }
        }
      }
    }

    return null;
  }

  /**
   * Verifica si hay un bloque incompleto al final (para streaming)
   * Oculta TODO el JSON parcial para evitar que el usuario vea el código
   */
  private checkPendingBlock(content: string): { hasPending: boolean; textBefore?: string; partial?: string } {
    // Buscar inicio de bloque UI que NO tenga cierre
    const blockStartPatterns = [
      { start: /```(?:json:)?(?:ui|visual|block)/i, end: /```\s*$/m },
      { start: /\[UI_BLOCK\]/i, end: /\[\/UI_BLOCK\]/i }
    ];

    for (const { start, end } of blockStartPatterns) {
      const startMatch = content.match(start);
      if (startMatch) {
        const startIndex = content.search(start);
        const afterStart = content.substring(startIndex);
        
        // Verificar si tiene cierre válido DESPUÉS del inicio
        if (!end.test(afterStart)) {
          // Es un bloque incompleto - ocultar todo desde el inicio
          return {
            hasPending: true,
            textBefore: content.substring(0, startIndex).trim() || undefined,
            partial: afterStart
          };
        }
      }
    }

    // También verificar JSON suelto con "type" que parece UI block
    const lastBrace = content.lastIndexOf('{');
    if (lastBrace !== -1) {
      const afterBrace = content.substring(lastBrace);
      const openBraces = (afterBrace.match(/\{/g) || []).length;
      const closeBraces = (afterBrace.match(/\}/g) || []).length;
      
      if (openBraces > closeBraces && afterBrace.includes('"type"')) {
        return {
          hasPending: true,
          textBefore: content.substring(0, lastBrace).trim() || undefined,
          partial: afterBrace
        };
      }
    }

    return { hasPending: false };
  }

  /**
   * Parsea contenido de metadata de mensaje (ui_blocks field)
   */
  parseMetadataBlocks(metadata: unknown): ValidatedBlock[] {
    if (!metadata || typeof metadata !== 'object') return [];

    const obj = metadata as Record<string, unknown>;
    let blocks: unknown[] = [];

    // Intentar obtener bloques de diferentes campos
    if (Array.isArray(obj.ui_blocks)) {
      blocks = obj.ui_blocks;
    } else if (typeof obj.ui_blocks === 'string') {
      try {
        blocks = JSON.parse(obj.ui_blocks);
      } catch {
        // Ignorar
      }
    } else if (Array.isArray(obj.blocks)) {
      blocks = obj.blocks;
    }

    return blockValidator.validateMany(blocks);
  }

  private log(message: string): void {
    if (this.debug) {
      console.log(`[ContentParser] ${message}`);
    }
  }
}

// ============================================
// SINGLETON & EXPORTS
// ============================================

export const contentParser = ContentParser.getInstance(
  typeof window !== 'undefined' && (window as any).__DEV__
);

export function parseMessageContent(content: string, isStreaming = false): ParsedContent {
  return contentParser.parse(content, isStreaming);
}
