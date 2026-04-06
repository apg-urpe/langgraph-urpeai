/**
 * API Route: /api/redaccion/process-context
 * 
 * Recibe múltiples fuentes de datos (archivos, URLs, texto) y usa IA
 * para organizarlos en un JSON estructurado y limpio.
 * 
 * Soporta: .txt, .md, .json, .csv, .xlsx, .xls, URLs
 * 
 * @module app/api/redaccion/process-context
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { generateObject } from 'ai';
import { z } from 'zod';
import { google, GEMINI_MODEL } from '@/lib/ai/config';
import { verifyActiveTeamMember, isDevTeamRole } from '@/lib/auth-security';
import * as XLSX from 'xlsx';

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

  return { user: null, error: cookieError || new Error('No auth') };
}

// ============================================================================
// FILE PARSERS
// ============================================================================

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [{ contenido: text }];

  // Detect separator
  const firstLine = lines[0];
  const sep = firstLine.includes('\t') ? '\t' : firstLine.includes(';') ? ';' : ',';

  const headers = firstLine.split(sep).map(h => h.trim().replace(/^["']|["']$/g, ''));
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(sep).map(v => v.trim().replace(/^["']|["']$/g, ''));
    if (vals.length === 0 || (vals.length === 1 && !vals[0])) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h || `col_${idx}`] = vals[idx] || '';
    });
    rows.push(row);
  }

  return rows;
}

function parseExcel(buffer: ArrayBuffer): Record<string, unknown>[] {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const allData: Record<string, unknown>[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    if (jsonData.length > 0) {
      allData.push({
        _hoja: sheetName,
        _filas: jsonData.length,
        datos: jsonData.slice(0, 500), // Limit rows
      });
    }
  }

  return allData;
}

async function fetchURLContent(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RedaccionBot/1.0)' },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) return `[Error fetching URL: HTTP ${response.status}]`;

    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const json = await response.json();
      return JSON.stringify(json, null, 2).substring(0, 50000);
    }

    const text = await response.text();
    // Strip HTML tags for basic readability
    const cleaned = text
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return cleaned.substring(0, 50000);
  } catch (err: unknown) {
    return `[Error fetching URL: ${err instanceof Error ? err.message : 'Unknown error'}]`;
  }
}

// ============================================================================
// ORGANIZED JSON SCHEMA
// ============================================================================

const organizedSchema = z.object({
  resumen: z.string().describe('Resumen ejecutivo de toda la información recopilada (2-3 oraciones)'),
  categorias: z.array(z.object({
    nombre: z.string().describe('Nombre descriptivo de la categoría'),
    datos: z.array(z.record(z.unknown())).describe('Array de objetos con los datos de esta categoría'),
  })).describe('Datos organizados por categorías temáticas'),
  puntos_clave: z.array(z.string()).describe('Lista de puntos clave extraídos de toda la información'),
  metadata: z.object({
    totalSources: z.number(),
    processedAt: z.string(),
  }),
});

const ORGANIZE_SYSTEM_PROMPT = `Eres un agente experto en organización de datos. Tu tarea es tomar información de múltiples fuentes (archivos, URLs, texto) y organizarla en un JSON limpio y estructurado.

REGLAS:
1. Analiza TODA la información proporcionada de todas las fuentes
2. Identifica categorías temáticas naturales en los datos
3. Agrupa los datos relevantes bajo cada categoría
4. Extrae los puntos clave más importantes
5. El resumen debe capturar la esencia de toda la información
6. Si hay datos tabulares (de CSV/Excel), mantén la estructura de filas
7. Elimina duplicados y datos irrelevantes
8. Los nombres de categoría deben ser descriptivos y en español
9. Preserva nombres propios, fechas, cifras y datos específicos`;

// ============================================================================
// POST — Process context sources and organize with AI
// ============================================================================

export async function POST(request: NextRequest) {
  const reqId = Math.random().toString(36).substring(7);
  console.log(`[ProcessContext:${reqId}] Starting`);

  // --- Auth ---
  const { user, error: authError } = await getSupabaseUser(request);
  if (authError || !user) {
    return NextResponse.json({ error: 'Sesión inválida' }, { status: 401 });
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
  const securityCheck = await verifyActiveTeamMember(supabaseAdmin, user.id, user.email);
  if (!securityCheck.success || !securityCheck.teamMember) {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
  }

  // --- Parse FormData ---
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'FormData inválido' }, { status: 400 });
  }

  const empresaId = formData.get('empresa_id') as string;
  if (!empresaId) {
    return NextResponse.json({ error: 'empresa_id requerido' }, { status: 400 });
  }

  // Verify empresa access
  const userData = securityCheck.teamMember;
  if (!isDevTeamRole(userData.role_id) && userData.empresa_id !== Number(empresaId)) {
    return NextResponse.json({ error: 'Acceso denegado a esta empresa' }, { status: 403 });
  }

  // --- Collect all sources ---
  const sourcesRaw: Array<{ name: string; type: string; content: string }> = [];

  // Text sources (sent as JSON string)
  const textSourcesJson = formData.get('text_sources') as string | null;
  if (textSourcesJson) {
    try {
      const textSources: Array<{ name: string; type: string; content: string }> = JSON.parse(textSourcesJson);
      sourcesRaw.push(...textSources);
    } catch {
      console.warn(`[ProcessContext:${reqId}] Failed to parse text_sources`);
    }
  }

  // URL sources
  const urlsJson = formData.get('urls') as string | null;
  if (urlsJson) {
    try {
      const urls: string[] = JSON.parse(urlsJson);
      for (const url of urls) {
        console.log(`[ProcessContext:${reqId}] Fetching URL: ${url}`);
        const content = await fetchURLContent(url);
        sourcesRaw.push({ name: url, type: 'url', content });
      }
    } catch {
      console.warn(`[ProcessContext:${reqId}] Failed to parse urls`);
    }
  }

  // File sources
  const files = formData.getAll('files') as File[];
  for (const file of files) {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    console.log(`[ProcessContext:${reqId}] Processing file: ${file.name} (${ext})`);

    try {
      if (ext === 'xlsx' || ext === 'xls') {
        const buffer = await file.arrayBuffer();
        const excelData = parseExcel(buffer);
        sourcesRaw.push({
          name: file.name,
          type: 'excel',
          content: JSON.stringify(excelData, null, 2),
        });
      } else if (ext === 'csv') {
        const text = await file.text();
        const csvData = parseCSV(text);
        sourcesRaw.push({
          name: file.name,
          type: 'csv',
          content: JSON.stringify(csvData, null, 2),
        });
      } else if (ext === 'json') {
        const text = await file.text();
        // Validate it's valid JSON
        try {
          const parsed = JSON.parse(text);
          sourcesRaw.push({
            name: file.name,
            type: 'json',
            content: JSON.stringify(parsed, null, 2),
          });
        } catch {
          sourcesRaw.push({ name: file.name, type: 'json', content: text });
        }
      } else {
        // txt, md, or any other text file
        const text = await file.text();
        sourcesRaw.push({
          name: file.name,
          type: ext === 'md' ? 'markdown' : 'text',
          content: text.substring(0, 100000),
        });
      }
    } catch (err) {
      console.error(`[ProcessContext:${reqId}] Error processing file ${file.name}:`, err);
      sourcesRaw.push({
        name: file.name,
        type: 'error',
        content: `[Error procesando archivo: ${err instanceof Error ? err.message : 'Unknown'}]`,
      });
    }
  }

  if (sourcesRaw.length === 0) {
    return NextResponse.json({ error: 'No se proporcionaron fuentes de datos' }, { status: 400 });
  }

  console.log(`[ProcessContext:${reqId}] ${sourcesRaw.length} sources collected, organizing with AI...`);

  // --- Check Gemini ---
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: 'GEMINI_API_KEY no configurada' }, { status: 500 });
  }

  // --- Build prompt with all sources ---
  const sourcesPrompt = sourcesRaw
    .map((s, i) => `### Fuente ${i + 1}: ${s.name} (${s.type})\n\`\`\`\n${s.content.substring(0, 30000)}\n\`\`\``)
    .join('\n\n');

  try {
    const { object: organized } = await generateObject({
      model: google(GEMINI_MODEL),
      schema: organizedSchema,
      system: ORGANIZE_SYSTEM_PROMPT,
      prompt: `Organiza la siguiente información de ${sourcesRaw.length} fuentes en un JSON estructurado:\n\n${sourcesPrompt}`,
      temperature: 0.3,
    });

    // Ensure metadata
    organized.metadata = {
      totalSources: sourcesRaw.length,
      processedAt: new Date().toISOString(),
    };

    console.log(`[ProcessContext:${reqId}] AI organized: ${organized.categorias.length} categories, ${organized.puntos_clave.length} key points`);

    return NextResponse.json({ success: true, organized });

  } catch (error: unknown) {
    console.error(`[ProcessContext:${reqId}] AI organization error:`, error);
    return NextResponse.json({
      error: 'Error al organizar la información con IA',
      details: error instanceof Error ? error.message : 'Unknown',
    }, { status: 500 });
  }
}
