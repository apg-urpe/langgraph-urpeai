// ============================================================================
// RESEARCH FORMATTER (Server-Side) - Formateo con Gemini 3 Flash
// ============================================================================
// Convierte datos de investigación de Firecrawl a Markdown legible usando Gemini
// ============================================================================

import { GoogleGenerativeAI } from '@google/generative-ai';
import { GEMINI_API_KEY, GEMINI_MODEL } from '@/lib/ai/config';

// ============================================================================
// PROMPT PARA FORMATEO
// ============================================================================

const FORMATTING_PROMPT = `Eres un experto en formatear información de investigación en Markdown legible y bien estructurado.

Tu tarea es convertir los datos de investigación proporcionados en un documento Markdown profesional y fácil de leer.

**Reglas de Formateo:**

1. **Estructura Clara**:
   - Usa encabezados jerárquicos (# ## ###) para organizar secciones
   - Agrupa información relacionada en secciones lógicas
   - Incluye una introducción breve si es relevante

2. **Legibilidad**:
   - Usa listas con viñetas para enumerar elementos
   - Usa tablas cuando hay datos comparables
   - Usa **negritas** para términos importantes
   - Usa \`código\` para valores técnicos o URLs

3. **Información**:
   - Extrae y presenta los datos más relevantes primero
   - Elimina duplicados y ruido
   - Si hay URLs, preséntalas como enlaces: [texto](url)
   - Si hay fechas, formátealas de forma legible

4. **Formato de Salida**:
   - Responde SOLO con el Markdown formateado
   - No incluyas explicaciones ni comentarios fuera del documento
   - Comienza directamente con el contenido

**Consulta Original:** {PROMPT}

**Datos de Investigación:**
\`\`\`json
{DATA}
\`\`\`

Genera el documento Markdown:`;

// ============================================================================
// FUNCIÓN PRINCIPAL
// ============================================================================

/**
 * Formatea los datos de investigación usando Gemini 3 Flash
 * @param data - Datos crudos de Firecrawl
 * @param prompt - Consulta original del usuario
 * @returns Markdown formateado
 */
export async function formatResearchWithGemini(
  data: unknown,
  prompt: string
): Promise<string> {
  // Validar API key
  if (!GEMINI_API_KEY) {
    console.warn('[ResearchFormatter] GEMINI_API_KEY not configured, using fallback');
    return formatResearchFallback(data, prompt);
  }

  try {
    // Preparar datos para el prompt
    const dataString = JSON.stringify(data, null, 2);
    
    // Limitar tamaño para evitar tokens excesivos (máx ~50KB)
    const truncatedData = dataString.length > 50000 
      ? dataString.substring(0, 50000) + '\n... [datos truncados]'
      : dataString;
    
    // Construir prompt final
    const finalPrompt = FORMATTING_PROMPT
      .replace('{PROMPT}', prompt)
      .replace('{DATA}', truncatedData);

    console.log('[ResearchFormatter] Calling Gemini to format research data...');
    
    // Llamar a Gemini
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const result = await model.generateContent(finalPrompt);
    const responseText = result.response.text();
    
    // Limpiar posibles bloques de código markdown envolventes
    let markdown = responseText.trim();
    if (markdown.startsWith('```markdown')) {
      markdown = markdown.slice(11);
    }
    if (markdown.startsWith('```md')) {
      markdown = markdown.slice(5);
    }
    if (markdown.startsWith('```')) {
      markdown = markdown.slice(3);
    }
    if (markdown.endsWith('```')) {
      markdown = markdown.slice(0, -3);
    }
    markdown = markdown.trim();
    
    // Agregar header con metadata
    const formattedMarkdown = `# 🔍 ${prompt}

> *Investigación generada automáticamente*

---

${markdown}

---

*Formateado con AI para mejor legibilidad*
`;

    console.log('[ResearchFormatter] Successfully formatted research data');
    return formattedMarkdown;

  } catch (error) {
    console.error('[ResearchFormatter] Error formatting with Gemini:', error);
    // Fallback a formato básico si Gemini falla
    return formatResearchFallback(data, prompt);
  }
}

// ============================================================================
// FALLBACK (si Gemini no está disponible)
// ============================================================================

/**
 * Formato básico de fallback sin AI
 */
function formatResearchFallback(data: unknown, prompt: string): string {
  let content = '';
  
  try {
    if (typeof data === 'object' && data !== null) {
      content = formatObjectAsMarkdown(data, 0);
    } else {
      content = String(data);
    }
  } catch {
    content = JSON.stringify(data, null, 2);
  }
  
  return `# 🔍 ${prompt}

> *Datos de investigación*

---

${content}

---

*Datos en formato básico*
`;
}

/**
 * Convierte un objeto a Markdown básico (recursivo)
 */
function formatObjectAsMarkdown(obj: unknown, depth: number): string {
  if (obj === null || obj === undefined) return '*N/A*';
  if (typeof obj !== 'object') return String(obj);
  
  const indent = '  '.repeat(depth);
  let result = '';
  
  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (typeof item === 'object' && item !== null) {
        result += `${indent}- ${formatObjectAsMarkdown(item, depth + 1)}\n`;
      } else {
        result += `${indent}- ${item}\n`;
      }
    }
  } else {
    for (const [key, value] of Object.entries(obj)) {
      const formattedKey = formatKeyName(key);
      
      if (typeof value === 'object' && value !== null) {
        if (Array.isArray(value) && value.length > 0 && typeof value[0] !== 'object') {
          // Array de primitivos
          result += `${indent}**${formattedKey}:** ${value.join(', ')}\n`;
        } else if (Array.isArray(value)) {
          // Array de objetos
          result += `\n${indent}### ${formattedKey}\n`;
          result += formatObjectAsMarkdown(value, depth + 1);
        } else {
          // Objeto anidado
          result += `\n${indent}### ${formattedKey}\n`;
          result += formatObjectAsMarkdown(value, depth + 1);
        }
      } else {
        result += `${indent}**${formattedKey}:** ${value ?? '*N/A*'}\n`;
      }
    }
  }
  
  return result;
}

/**
 * Formatea nombres de keys (snake_case/camelCase a Title Case)
 */
function formatKeyName(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^\w/, c => c.toUpperCase())
    .trim();
}
