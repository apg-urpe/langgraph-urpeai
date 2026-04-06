/**
 * API Route: /api/redaccion/assist
 * 
 * Asistente IA para edición de secciones de redacción.
 * Recibe contenido actual + instrucción, devuelve texto mejorado via streaming.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { streamText } from 'ai';
import { google, GEMINI_MODEL } from '@/lib/ai/config';
import { verifyActiveTeamMember, isDevTeamRole } from '@/lib/auth-security';

export const maxDuration = 120;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// ============================================================================
// AUTH
// ============================================================================

async function getSupabaseUser(request: NextRequest) {
  const response = NextResponse.next();
  const cookieSupabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) { return request.cookies.get(name)?.value; },
      set(name: string, value: string, options: CookieOptions) { response.cookies.set({ name, value, ...options }); },
      remove(name: string, options: CookieOptions) { response.cookies.set({ name, value: '', ...options }); },
    },
  });

  const { data: { user: cookieUser }, error: cookieError } = await cookieSupabase.auth.getUser();
  if (cookieUser && !cookieError) return { user: cookieUser, error: null };

  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const tokenSupabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user: tokenUser }, error: tokenError } = await tokenSupabase.auth.getUser(authHeader.substring(7));
    if (tokenUser && !tokenError) return { user: tokenUser, error: null };
  }

  return { user: null, error: cookieError || new Error('No valid authentication found') };
}

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

const ASSIST_SYSTEM_PROMPT = `Eres un asistente experto en redacción profesional y edición de documentos.
Tu tarea es mejorar el contenido de una sección de un documento según la instrucción del usuario.

Reglas:
- Devuelve SOLO el contenido mejorado en formato Markdown válido.
- NO incluyas explicaciones, comentarios ni meta-texto como "Aquí está la versión mejorada".
- Mantén la estructura, formato y estilo del documento original a menos que se pida cambiarlos.
- Si la instrucción es "mejorar redacción", mejora claridad, fluidez y precisión sin cambiar el significado.
- Si la instrucción es "expandir", amplía el contenido manteniendo el tono y añadiendo detalles relevantes.
- Si la instrucción es "resumir", condensa el contenido preservando los puntos clave.
- Si la instrucción es "corregir gramática", corrige errores ortográficos y gramaticales solamente.
- Si la instrucción es "tono formal", reformula en tono profesional y formal.
- Si la instrucción es "tono informal", reformula en tono conversacional y accesible.
- Preserva tablas, listas, código y otros elementos de formato Markdown.
- Responde en el mismo idioma que el contenido original.`;

// ============================================================================
// POST HANDLER
// ============================================================================

export async function POST(req: NextRequest) {
  try {
    // Auth
    const { user, error: authError } = await getSupabaseUser(req);
    if (!user || authError) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await req.json();
    const { contenido, titulo, instruccion, empresaId } = body;

    if (!contenido && !titulo) {
      return NextResponse.json({ error: 'Contenido o título requerido' }, { status: 400 });
    }
    if (!instruccion) {
      return NextResponse.json({ error: 'Instrucción requerida' }, { status: 400 });
    }

    // Verify team membership
    if (empresaId) {
      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
      const securityCheck = await verifyActiveTeamMember(supabaseAdmin, user.id, user.email);
      if (!securityCheck.success || !securityCheck.teamMember) {
        return NextResponse.json({ error: securityCheck.error?.message || 'Sin acceso a esta empresa' }, { status: securityCheck.error?.httpStatus || 403 });
      }
      
      const userData = securityCheck.teamMember;
      if (!isDevTeamRole(userData.role_id) && userData.empresa_id !== Number(empresaId)) {
        return NextResponse.json({ error: 'Acceso denegado a esta empresa' }, { status: 403 });
      }
    }

    const userPrompt = `## Sección: ${titulo || 'Sin título'}

## Contenido actual:
${contenido || '(vacío)'}

## Instrucción:
${instruccion}`;

    const result = streamText({
      model: google(GEMINI_MODEL),
      system: ASSIST_SYSTEM_PROMPT,
      prompt: userPrompt,
      temperature: 0.4,
    });

    return result.toTextStreamResponse();
  } catch (err: any) {
    console.error('[RedaccionAssist] Error:', err);
    return NextResponse.json(
      { error: err.message || 'Error interno' },
      { status: 500 }
    );
  }
}
