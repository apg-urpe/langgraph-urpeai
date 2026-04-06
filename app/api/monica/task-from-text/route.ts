import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GEMINI_API_KEY, GEMINI_MODEL } from '@/lib/ai/config';
import { verifyActiveTeamMember, createSupabaseAdmin } from '@/lib/auth-security';

// Supabase client with service role for server-side operations
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface GeneratedTask {
  titulo: string;
  descripcion: string;
  prioridad: 1 | 2 | 3 | 4;
  items: string[];
  fecha_sugerida?: string;
}

export async function POST(req: NextRequest) {
  // 1. Parse request body first to get userId
  const body = await req.json();
  const { text, userId } = body;

  // 2. Validate userId is provided
  if (!userId) {
    console.error('[TaskFromText] No userId provided');
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
    console.error('[TaskFromText] Security check failed:', securityCheck.error);
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
    // text already extracted from body above

    if (!text || typeof text !== 'string' || text.trim().length < 3) {
      return new Response(
        JSON.stringify({ error: 'Text description is required (min 3 characters)' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const today = new Date().toISOString().split('T')[0];

    const systemPrompt = `Eres un asistente de productividad. Convierte descripciones de texto libre en tareas estructuradas.

ENTRADA DEL USUARIO:
"${text.trim()}"

FECHA DE HOY: ${today}

INSTRUCCIONES:
1. Extrae el objetivo principal → título claro y de acción (máx 60 caracteres)
2. Resume el contexto → descripción breve (1-2 líneas máximo)
3. Infiera la urgencia:
   - 1 = Baja (sin fecha, "cuando puedas")
   - 2 = Media (esta semana, normal)
   - 3 = Alta (urgente, pronto, mañana)
   - 4 = Urgente (hoy, ahora, crítico)
4. Desglosa en pasos concretos → 2-5 items de checklist accionables
5. Si menciona fecha/plazo, sugiere fecha_sugerida en formato YYYY-MM-DD

RESPONDE SOLO CON JSON VÁLIDO:
{
  "titulo": "...",
  "descripcion": "...",
  "prioridad": 2,
  "items": ["Paso 1", "Paso 2", "..."],
  "fecha_sugerida": "YYYY-MM-DD" // opcional, solo si hay fecha implícita
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
          temperature: 0.2,
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

    let taskData: GeneratedTask;
    try {
      taskData = JSON.parse(generatedText);
    } catch {
      const cleanJson = generatedText.replace(/```json\n?|\n?```/g, '').trim();
      taskData = JSON.parse(cleanJson);
    }

    // Validate structure
    if (!taskData.titulo || !Array.isArray(taskData.items)) {
      throw new Error('Invalid task structure');
    }

    // Ensure prioridad is valid
    if (![1, 2, 3, 4].includes(taskData.prioridad)) {
      taskData.prioridad = 2;
    }

    return new Response(JSON.stringify(taskData), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    console.error('[Task From Text API] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
