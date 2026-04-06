import { NextRequest } from 'next/server';
import { GEMINI_API_KEY, GEMINI_MODEL } from '@/lib/ai/config';

/**
 * API para parsear texto libre (JSON, Markdown, texto plano) 
 * y convertirlo al formato estructurado de configuración de etapa del embudo.
 * 
 * POST /api/funnel/parse-config
 * Body: { rawText: string }
 * Response: { descripcion: FunnelStageDescripcion, configuracion_seguimiento?: FunnelSeguimientoConfig }
 */
export async function POST(req: NextRequest) {
  if (!GEMINI_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'GEMINI_API_KEY not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body = await req.json();
    const { rawText } = body;

    if (!rawText || typeof rawText !== 'string') {
      return new Response(
        JSON.stringify({ error: 'rawText es requerido' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const systemPrompt = `Eres un asistente experto en configuración de CRM y embudos de ventas.
Tu tarea es analizar el texto proporcionado (puede ser JSON, Markdown, texto plano, HTML, o cualquier formato) y extraer/organizar la información en el formato estructurado de configuración de etapa del embudo.

TEXTO A ANALIZAR:
---
${rawText}
---

INSTRUCCIONES:
1. Analiza el contenido sin importar el formato de entrada.
2. Extrae y organiza la información en las siguientes categorías:
   - **que_es**: Descripción breve de qué significa esta etapa (1-2 oraciones).
   - **nota_importante**: Advertencias o notas clave para el equipo (opcional).
   - **instrucciones_agente**: Instrucciones detalladas de cómo debe comportarse el agente IA en esta etapa.
   - **acciones_agente**: Lista de acciones concretas que el agente debe realizar.
   - **criterios_avance**: Señales o criterios que indican que el contacto debe avanzar a la siguiente etapa.

3. Si el texto menciona configuración de seguimiento automático (horarios, intentos, frecuencia), inclúyelo en configuracion_seguimiento.

4. Mantén el color e icono si están presentes, o usa valores por defecto.

FORMATO DE RESPUESTA (JSON PURO):
{
  "descripcion": {
    "color": "#6366f1",
    "icono": "📌",
    "que_es": "Descripción de la etapa...",
    "nota_importante": "Nota importante si aplica...",
    "instrucciones_agente": "Instrucciones detalladas para el agente...",
    "acciones_agente": ["Acción 1", "Acción 2", "Acción 3"],
    "criterios_avance": ["Señal 1 para avanzar", "Señal 2 para avanzar"]
  },
  "configuracion_seguimiento": {
    "activo": false,
    "horario": { "inicio": "08:00", "fin": "20:00", "dias_permitidos": [1,2,3,4,5] },
    "seguimientos": [],
    "frecuencia_horas": 24,
    "max_intentos": 3
  }
}

REGLAS:
- Si no hay información clara para un campo, déjalo vacío o con valor por defecto.
- Las acciones_agente y criterios_avance deben ser arrays de strings claros y accionables.
- instrucciones_agente debe ser un texto descriptivo, no un array.
- Responde SOLO con el JSON, sin explicaciones adicionales.`;

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{ text: systemPrompt }]
        }],
        generationConfig: {
          temperature: 0.2, // Baja temperatura para output estructurado
          responseMimeType: "application/json"
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Funnel Parse] Gemini API error:', errorText);
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!generatedText) {
      throw new Error('No content generated');
    }

    // Parse JSON response
    let parsedConfig;
    try {
      parsedConfig = JSON.parse(generatedText);
    } catch (e) {
      // Fallback: limpiar bloques de markdown si existen
      const cleanJson = generatedText.replace(/```json\n|\n```|```/g, '').trim();
      parsedConfig = JSON.parse(cleanJson);
    }

    // Validar estructura básica
    if (!parsedConfig.descripcion) {
      throw new Error('Respuesta inválida: falta descripcion');
    }

    return new Response(JSON.stringify(parsedConfig), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('[Funnel Parse API] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Error procesando el texto' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
