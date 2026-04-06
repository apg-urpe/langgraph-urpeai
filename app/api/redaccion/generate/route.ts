/**
 * API Route: /api/redaccion/generate
 * 
 * Genera un documento completo con IA en 2 loops:
 * 1. Planificación — estructura del documento (generateObject)
 * 2. Redacción — contenido de cada sección (generateText)
 * 
 * Responde con SSE stream para feedback en tiempo real.
 * 
 * @module app/api/redaccion/generate
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { generateObject, generateText } from 'ai';
import { z } from 'zod';
import { google, GEMINI_MODEL } from '@/lib/ai/config';
import { verifyActiveTeamMember, isDevTeamRole } from '@/lib/auth-security';
import {
  PLANNING_SYSTEM_PROMPT,
  WRITING_SYSTEM_PROMPT,
  buildPlanningPrompt,
  buildSectionPrompt,
} from '@/lib/redaccion-prompts';
import type { GenerateRedaccionRequest } from '@/types/redaccion';

// Allow streaming responses up to 5 minutes
export const maxDuration = 300;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// ============================================================================
// AUTH — Hybrid cookies + Bearer
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

function getSupabaseAdmin() {
  if (!supabaseUrl || !supabaseServiceKey) throw new Error('Missing Supabase env vars');
  return createClient(supabaseUrl, supabaseServiceKey);
}

// ============================================================================
// Zod schema for the planning step
// ============================================================================

const planSectionSchema = z.object({
  titulo: z.string().describe('Título de la sección'),
  plan_seccion: z.string().describe('Descripción de qué debe contener esta sección (2-3 oraciones)'),
  orden: z.number().describe('Número de orden de la sección (empezando en 1)'),
});

const planSchema = z.object({
  nombre: z.string().describe('Nombre profesional del documento'),
  descripcion: z.string().describe('Descripción breve del propósito del documento (1-2 oraciones)'),
  secciones: z.array(planSectionSchema).describe('Lista de secciones del documento'),
});

// ============================================================================
// POST — Generate a document with AI
// ============================================================================

export async function POST(request: NextRequest) {
  const reqId = Math.random().toString(36).substring(7);
  console.log(`[RedaccionGen:${reqId}] Starting POST`);

  // --- Auth ---
  const { user, error: authError } = await getSupabaseUser(request);
  if (authError || !user) {
    return NextResponse.json({ error: 'Sesión inválida o expirada' }, { status: 401 });
  }

  const supabaseAdmin = getSupabaseAdmin();

  const securityCheck = await verifyActiveTeamMember(supabaseAdmin, user.id, user.email);
  if (!securityCheck.success || !securityCheck.teamMember) {
    return NextResponse.json({
      error: securityCheck.error?.message || 'Acceso denegado',
      code: securityCheck.error?.code,
    }, { status: securityCheck.error?.httpStatus || 403 });
  }

  // --- Parse body ---
  let body: GenerateRedaccionRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const { contexto, tipo_id, contacto_id, empresa_id, contexto_structured } = body;

  if (!contexto || typeof contexto !== 'string' || contexto.trim().length < 10) {
    return NextResponse.json({ error: 'El contexto debe tener al menos 10 caracteres' }, { status: 400 });
  }
  if (!tipo_id || !empresa_id) {
    return NextResponse.json({ error: 'tipo_id y empresa_id son requeridos' }, { status: 400 });
  }

  // --- Verify empresa access ---
  const userData = securityCheck.teamMember;
  if (!isDevTeamRole(userData.role_id) && userData.empresa_id !== Number(empresa_id)) {
    return NextResponse.json({ error: 'Acceso denegado a esta empresa' }, { status: 403 });
  }

  // --- Load tipo ---
  const { data: tipo, error: tipoError } = await supabaseAdmin
    .from('redaccion_tipos')
    .select('*')
    .eq('id', tipo_id)
    .eq('empresa_id', empresa_id)
    .single();

  if (tipoError || !tipo) {
    return NextResponse.json({ error: 'Tipo de documento no encontrado para esta empresa' }, { status: 404 });
  }

  console.log(`[RedaccionGen:${reqId}] Tipo loaded: ${tipo.nombre}, partes: ${tipo.partes}`);

  // --- Check Gemini key ---
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: 'GEMINI_API_KEY no configurada' }, { status: 500 });
  }

  // ============================================================================
  // SSE STREAM — Execute both loops and stream progress
  // ============================================================================

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // Stream may be closed
        }
      };

      try {
        // ==================================================================
        // LOOP 1 — PLANIFICACIÓN (generateObject)
        // ==================================================================
        console.log(`[RedaccionGen:${reqId}] Loop 1: Planning...`);
        send({ type: 'status', message: 'Planificando estructura del documento...' });

        const { object: plan } = await generateObject({
          model: google(GEMINI_MODEL),
          schema: planSchema,
          system: PLANNING_SYSTEM_PROMPT,
          prompt: buildPlanningPrompt(tipo, contexto),
          temperature: 0.7,
        });

        console.log(`[RedaccionGen:${reqId}] Plan generated: ${plan.nombre}, ${plan.secciones.length} secciones`);

        // Insert redaccion
        const { data: newRedaccion, error: insertRedError } = await supabaseAdmin
          .from('redaccion')
          .insert({
            nombre: plan.nombre,
            descripcion: plan.descripcion,
            tipo_id: tipo_id,
            contacto_id: contacto_id || null,
            estado: 'preparando',
            ...(contexto_structured ? { contexto_structured } : {}),
          })
          .select()
          .single();

        if (insertRedError || !newRedaccion) {
          console.error(`[RedaccionGen:${reqId}] Insert redaccion error:`, insertRedError);
          send({ type: 'error', message: 'Error al crear el documento en la base de datos' });
          controller.close();
          return;
        }

        const redaccionId = newRedaccion.id;
        console.log(`[RedaccionGen:${reqId}] Redaccion created: id=${redaccionId}`);

        // Insert detalles (sin contenido)
        const detallesToInsert = plan.secciones.map((sec, idx) => ({
          redaccion_id: redaccionId,
          titulo: sec.titulo,
          contenido: null,
          orden: sec.orden || idx + 1,
          plan_seccion: sec.plan_seccion,
          evaluacion: null,
        }));

        const { data: insertedDetalles, error: insertDetError } = await supabaseAdmin
          .from('redaccion_detalles')
          .insert(detallesToInsert)
          .select()
          .order('orden', { ascending: true });

        if (insertDetError || !insertedDetalles?.length) {
          console.error(`[RedaccionGen:${reqId}] Insert detalles error:`, insertDetError);
          send({ type: 'error', message: 'Error al crear las secciones del documento' });
          // Cleanup: delete redaccion
          await supabaseAdmin.from('redaccion').delete().eq('id', redaccionId);
          controller.close();
          return;
        }

        send({
          type: 'plan_created',
          redaccionId,
          totalSections: insertedDetalles.length,
          nombre: plan.nombre,
        });

        // ==================================================================
        // LOOP 2 — REDACCIÓN (generateText por sección)
        // ==================================================================
        console.log(`[RedaccionGen:${reqId}] Loop 2: Writing ${insertedDetalles.length} sections...`);

        const seccionesCompletadas: Array<{ titulo: string; contenido: string }> = [];

        for (const detalle of insertedDetalles) {
          send({ type: 'writing_section', orden: detalle.orden, titulo: detalle.titulo });

          console.log(`[RedaccionGen:${reqId}] Writing section ${detalle.orden}: ${detalle.titulo}`);

          const { text: contenido } = await generateText({
            model: google(GEMINI_MODEL),
            system: WRITING_SYSTEM_PROMPT,
            prompt: buildSectionPrompt(
              tipo,
              plan.nombre,
              plan.descripcion,
              detalle.titulo,
              detalle.plan_seccion || '',
              contexto,
              seccionesCompletadas
            ),
            temperature: 0.7,
          });

          // Update detalle with content
          const { error: updateError } = await supabaseAdmin
            .from('redaccion_detalles')
            .update({ contenido })
            .eq('id', detalle.id);

          if (updateError) {
            console.error(`[RedaccionGen:${reqId}] Update detalle ${detalle.id} error:`, updateError);
            // Continue anyway — partial content is better than none
          }

          seccionesCompletadas.push({ titulo: detalle.titulo, contenido });
          send({ type: 'section_complete', orden: detalle.orden, titulo: detalle.titulo });

          console.log(`[RedaccionGen:${reqId}] Section ${detalle.orden} complete (${contenido.length} chars)`);
        }

        // ==================================================================
        // FINALIZACIÓN — Cambiar estado a borrador
        // ==================================================================
        await supabaseAdmin
          .from('redaccion')
          .update({ estado: 'borrador' })
          .eq('id', redaccionId);

        send({ type: 'complete', redaccionId });
        console.log(`[RedaccionGen:${reqId}] Generation complete for redaccion ${redaccionId}`);

      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Error desconocido';
        console.error(`[RedaccionGen:${reqId}] Fatal error:`, error);
        send({ type: 'error', message: `Error en la generación: ${message}` });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
