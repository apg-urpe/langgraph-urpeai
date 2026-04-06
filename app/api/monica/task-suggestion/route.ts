import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GEMINI_API_KEY, GEMINI_MODEL } from '@/lib/ai/config';
import { verifyActiveTeamMember, createSupabaseAdmin } from '@/lib/auth-security';

// Supabase client with service role for server-side operations
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(req: NextRequest) {
  // 1. Parse request body first to get userId
  const body = await req.json();
  const { context, userId } = body;

  // 2. Validate userId is provided
  if (!userId) {
    console.error('[TaskSuggestion] No userId provided');
    return new Response(JSON.stringify({ error: 'No autorizado' }), { 
      status: 401, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }

  // 3. SECURITY: Verify user is active and not archived
  const securityCheck = await verifyActiveTeamMember(
    createSupabaseAdmin(),
    userId
  );

  if (!securityCheck.success || !securityCheck.teamMember) {
    console.error('[TaskSuggestion] Security check failed:', securityCheck.error);
    return new Response(JSON.stringify({ 
      error: securityCheck.error?.message || 'No autorizado',
      code: securityCheck.error?.code
    }), { 
      status: securityCheck.error?.httpStatus || 401, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }

  const teamMember = securityCheck.teamMember;

  if (!GEMINI_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'GEMINI_API_KEY not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    // context already extracted from body above
    if (!context) {
      return new Response(
        JSON.stringify({ error: 'Context is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const systemPrompt = `Eres un asistente inteligente CRM. Tu tarea es analizar el contexto de un contacto y sugerir UNA tarea concreta con una lista de verificación (checklist).

CONTEXTO DEL CONTACTO:
${JSON.stringify(context, null, 2)}

INSTRUCCIONES:
1. Analiza la última interacción, el estado del embudo y las notas.
2. Identifica el siguiente paso lógico más importante (Next Best Action).
3. Genera un objeto JSON con:
   - "titulo": Título corto y de acción (ej: "Enviar propuesta", "Llamar para seguimiento").
   - "descripcion": Breve explicación del por qué o detalles clave.
   - "prioridad": Número 1 (Baja), 2 (Media), 3 (Alta), 4 (Urgente). Basado en la "temperatura" del lead.
   - "items": Array de strings con 3-5 pasos concretos para completar la tarea.

FORMATO DE RESPUESTA (JSON PURO):
{
  "titulo": "...",
  "descripcion": "...",
  "prioridad": 2,
  "items": ["...", "..."]
}`;

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
          temperature: 0.3, // Lower temperature for more deterministic/structured output
          responseMimeType: "application/json"
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!generatedText) {
      throw new Error('No content generated');
    }

    // Parse JSON (Gemini usually returns clean JSON with responseMimeType, but good to be safe)
    let taskSuggestion;
    try {
      taskSuggestion = JSON.parse(generatedText);
    } catch (e) {
      // Fallback cleanup if markdown blocks exist
      const cleanJson = generatedText.replace(/```json\n|\n```/g, '');
      taskSuggestion = JSON.parse(cleanJson);
    }

    return new Response(JSON.stringify(taskSuggestion), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('[Task Suggestion API] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
