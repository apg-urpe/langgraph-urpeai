import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { verifyActiveTeamMember, createSupabaseAdmin, getEffectiveEnterpriseId, isDevTeamRole } from '@/lib/auth-security';

/**
 * Get user from Supabase - Hybrid authentication (cookies + header)
 * 1. First tries cookies (SSR standard)
 * 2. Falls back to Authorization header Bearer token
 */
async function getSupabaseUser(request: NextRequest) {
  // Method 1: Try cookies first (standard SSR approach)
  let response = NextResponse.next();
  const cookieSupabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  const { data: { user: cookieUser }, error: cookieError } = await cookieSupabase.auth.getUser();
  
  if (cookieUser && !cookieError) {
    console.log('[DeepResearch:Auth] Authenticated via cookies');
    return { user: cookieUser, error: null };
  }

  // Method 2: Try Authorization header (Bearer token)
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    
    const tokenSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data: { user: tokenUser }, error: tokenError } = await tokenSupabase.auth.getUser(token);
    
    if (tokenUser && !tokenError) {
      console.log('[DeepResearch:Auth] Authenticated via Bearer token');
      return { user: tokenUser, error: null };
    }
    
    console.warn('[DeepResearch:Auth] Bearer token invalid:', tokenError?.message);
  }

  // Both methods failed
  console.warn('[DeepResearch:Auth] Both cookie and header auth failed. Cookie error:', cookieError?.message);
  return { user: null, error: cookieError || new Error('No valid authentication found') };
}

/**
 * Helper to get Supabase client in Route Handler
 */
function getSupabase(request: NextRequest) {
  let response = NextResponse.next();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );
  return { supabase, response };
}

// ============================================================================
// DEEP RESEARCH API - Firecrawl Agent Integration
// ============================================================================
// Architecture:
// - POST: Starts a research job, persists to DB, calls Firecrawl v2 Agent API
// - GET: Checks job status from DB and/or Firecrawl (polling-based)
//        When completed, creates artifact and notification (since v2 has no webhooks)
// Note: Firecrawl v2 Agent API does not support webhooks, uses polling only
// ============================================================================

const FIRECRAWL_API_URL = 'https://api.firecrawl.dev';

// Import Gemini-powered research formatter
import { formatResearchWithGemini } from '@/lib/research-formatter.server';

// Helper to get Supabase Admin client safely
function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!url || !key) {
    throw new Error('Missing Supabase environment variables');
  }
  
  return createClient(url, key);
}

interface StartResearchRequest {
  prompt: string;
  urls?: string[];
  schema?: Record<string, unknown>;
  jobId: string;
  userId: string;
  empresaId?: number;
}

// ============================================================================
// POST - Start a new research job
// ============================================================================

export async function POST(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);
  console.log(`[DeepResearch:${requestId}] Starting POST request`);

  // SECURITY: Get secure Supabase client from cookies
  const { user, error: authError } = await getSupabaseUser(request);
  
  if (authError || !user) {
    console.error(`[DeepResearch:${requestId}] Authentication failed:`, authError?.message);
    return NextResponse.json({ error: 'Sesión inválida o expirada' }, { status: 401 });
  }

  const sessionUserId = user.id;
  const supabaseAdmin = getSupabaseAdmin();

  try {
    let body: StartResearchRequest;
    try {
      const text = await request.text();
      if (!text) {
        return NextResponse.json({ error: 'Cuerpo de solicitud vacío' }, { status: 400 });
      }
      body = JSON.parse(text);
    } catch (e) {
      console.error(`[DeepResearch:${requestId}] Failed to parse JSON body`, e);
      return NextResponse.json({ error: 'Payload JSON inválido' }, { status: 400 });
    }

    const { prompt, urls, schema, jobId, empresaId } = body;

    // ============================================
    // SECURITY: Verify user is active and not archived
    // ============================================
    const securityCheck = await verifyActiveTeamMember(
      supabaseAdmin,
      sessionUserId,
      user.email
    );

    if (!securityCheck.success || !securityCheck.teamMember) {
      console.error(`[DeepResearch:${requestId}] Security check failed:`, securityCheck.error);
      return NextResponse.json({ 
        error: securityCheck.error?.message || 'Acceso denegado',
        code: securityCheck.error?.code
      }, { status: securityCheck.error?.httpStatus || 403 });
    }

    const userData = securityCheck.teamMember;

    if (!isDevTeamRole(userData.role_id) && userData.empresa_id !== Number(empresaId)) {
      return NextResponse.json({ error: 'Acceso denegado a esta empresa' }, { status: 403 });
    }
    
    console.log(`[DeepResearch:${requestId}] Payload verified for user:`, { jobId, sessionUserId, empresaId, promptLength: prompt?.length });

    // Check environment variables early
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const firecrawlApiKey = process.env.FIRECRAWL_API_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error(`[DeepResearch:${requestId}] Supabase configuration missing`);
      return NextResponse.json({ error: 'Configuración de base de datos incompleta' }, { status: 500 });
    }

    if (!firecrawlApiKey) {
      console.error(`[DeepResearch:${requestId}] FIRECRAWL_API_KEY missing`);
      return NextResponse.json({ error: 'Configuración de Firecrawl incompleta' }, { status: 500 });
    }

    // Validate required fields
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return NextResponse.json(
        { error: 'Se requiere una consulta de investigación' },
        { status: 400 }
      );
    }

    if (!jobId) {
      return NextResponse.json(
        { error: 'Se requiere jobId' },
        { status: 400 }
      );
    }

    // 1. Persist initial job state in DB
    console.log(`[DeepResearch:${requestId}] Persisting job to DB...`);
    try {
      const { error: dbError } = await supabaseAdmin
        .from('wp_deep_research')
        .upsert({
          local_job_id: jobId,
          user_id: sessionUserId,
          empresa_id: empresaId,
          prompt: prompt.trim(),
          urls,
          schema,
          status: 'queued',
          created_at: new Date().toISOString()
        });

      if (dbError) {
        console.error(`[DeepResearch:${requestId}] DB Error:`, dbError);
        return NextResponse.json({ 
          error: 'Error de base de datos al guardar la investigación',
          details: `${dbError.message} (Código: ${dbError.code})`,
          hint: '¿Has ejecutado el script SQL DEEP_RESEARCH_SCHEMA.sql en Supabase?'
        }, { status: 500 });
      }
    } catch (dbEx: any) {
      console.error(`[DeepResearch:${requestId}] DB Exception:`, dbEx);
      return NextResponse.json({ 
        error: 'Excepción al acceder a la base de datos',
        details: dbEx.message 
      }, { status: 500 });
    }

    // Build payload for Firecrawl Agent API v2
    // Note: v2 API does not support webhook parameter - uses polling instead
    const firecrawlPayload: Record<string, unknown> = {
      prompt: prompt.trim()
    };

    if (urls && urls.length > 0) firecrawlPayload.urls = urls;
    if (schema) firecrawlPayload.schema = schema;

    console.log(`[DeepResearch:${requestId}] Calling Firecrawl API...`);
    
    const firecrawlResponse = await fetch(`${FIRECRAWL_API_URL}/v2/agent`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(firecrawlPayload)
    });

    if (!firecrawlResponse.ok) {
      const errorText = await firecrawlResponse.text();
      console.error(`[DeepResearch:${requestId}] Firecrawl API error:`, { 
        status: firecrawlResponse.status, 
        error: errorText 
      });
      
      let userMessage = `Error del servicio de investigación (${firecrawlResponse.status})`;
      if (firecrawlResponse.status === 401) userMessage = 'API Key de Firecrawl inválida';
      if (firecrawlResponse.status === 402) userMessage = 'Créditos agotados en Firecrawl';
      
      await supabaseAdmin
        .from('wp_deep_research')
        .update({ status: 'failed', error: userMessage })
        .eq('local_job_id', jobId);
      
      return NextResponse.json({ error: userMessage, details: errorText }, { status: 502 });
    }

    const firecrawlData = await firecrawlResponse.json();
    console.log(`[DeepResearch:${requestId}] Firecrawl response:`, firecrawlData);

    // Update job with Firecrawl ID
    if (firecrawlData.id) {
      await supabaseAdmin
        .from('wp_deep_research')
        .update({
          firecrawl_job_id: firecrawlData.id,
          status: firecrawlData.status === 'completed' ? 'completed' : 'processing',
          data: firecrawlData.data || null,
          started_at: new Date().toISOString()
        })
        .eq('local_job_id', jobId);
    }

    return NextResponse.json({
      success: true,
      firecrawlJobId: firecrawlData.id || jobId,
      status: firecrawlData.status || 'processing',
      data: firecrawlData.data
    });

  } catch (error: any) {
    console.error(`[DeepResearch:${requestId}] Fatal error:`, error);
    return NextResponse.json(
      { error: 'Error interno al iniciar la investigación', details: error.message },
      { status: 500 }
    );
  }
}

// ============================================================================
// GET - Check status of a research job
// ============================================================================

export async function GET(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');
    const diagnostic = searchParams.get('diagnostic');

    // Diagnostic mode: Check database and environment
    if (diagnostic === 'true') {
      console.log(`[DeepResearch:${requestId}] Running diagnostics...`);
      const firecrawlApiKey = process.env.FIRECRAWL_API_KEY;
      const results: Record<string, any> = {
        env: {
          hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
          hasSupabaseKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
          hasFirecrawlKey: !!firecrawlApiKey,
          appUrl: process.env.NEXT_PUBLIC_APP_URL || 'not set'
        }
      };

      // 1. Check Database
      try {
        const supabaseAdmin = getSupabaseAdmin();
        const { data, error: dbError } = await supabaseAdmin.from('wp_deep_research').select('count').limit(1);
        
        if (dbError) {
          results.database = {
            status: 'error',
            message: dbError.message,
            code: dbError.code,
            hint: dbError.code === '42P01' ? 'La tabla wp_deep_research no existe. Ejecuta el SQL de DEEP_RESEARCH_SCHEMA.sql.' : undefined
          };
        } else {
          results.database = { status: 'ok', message: 'Conexión a DB y tabla OK' };
        }
      } catch (e: any) {
        results.database = { status: 'fatal', message: e.message };
      }

      // 2. Check Firecrawl Connectivity
      if (firecrawlApiKey) {
        try {
          const fcResp = await fetch(`${FIRECRAWL_API_URL}/v2/agent/ping`, {
            headers: { 'Authorization': `Bearer ${firecrawlApiKey}` }
          });
          results.firecrawl = {
            status: fcResp.ok ? 'ok' : 'error',
            statusCode: fcResp.status,
            message: fcResp.ok ? 'API accesible' : 'Error de autenticación o acceso'
          };
        } catch (e: any) {
          results.firecrawl = { status: 'fatal', message: `No se pudo conectar: ${e.message}` };
        }
      } else {
        results.firecrawl = { status: 'missing', message: 'API Key no configurada' };
      }

      return NextResponse.json(results);
    }

    if (!jobId) {
      return NextResponse.json(
        { error: 'Se requiere jobId' },
        { status: 400 }
      );
    }

    // Initialize Supabase
    let supabaseAdmin;
    try {
      supabaseAdmin = getSupabaseAdmin();
    } catch (e: any) {
      return NextResponse.json({ error: 'Error de configuración (DB)' }, { status: 500 });
    }

    // Check DB first
    const { data: dbJob, error: dbError } = await supabaseAdmin
      .from('wp_deep_research')
      .select('*')
      .eq('local_job_id', jobId)
      .single();
    
    if (dbError || !dbJob) {
      return NextResponse.json(
        { error: 'Job no encontrado en base de datos' },
        { status: 404 }
      );
    }

    // If already completed or failed, check if artifact exists
    if (dbJob.status === 'completed' || dbJob.status === 'failed') {
      // If completed but no artifact, create it now (handles v2 API migration)
      if (dbJob.status === 'completed' && !dbJob.artifact_id && dbJob.data) {
        console.log(`[DeepResearch:${requestId}] Job completed but no artifact - creating now`);
        try {
          // Format research data with Gemini 3 Flash for better readability
          const markdownContent = await formatResearchWithGemini(dbJob.data, dbJob.prompt);
          const title = `🔍 ${dbJob.prompt.substring(0, 40)}${dbJob.prompt.length > 40 ? '...' : ''}`;
          
          const { data: artifact, error: artifactError } = await supabaseAdmin
            .from('artifacts')
            .insert({
              user_id: dbJob.user_id,
              title,
              content: markdownContent,
              type: 'markdown',
              description: `Investigación completada: ${dbJob.prompt}`,
              tags: ['research', 'deep-research', 'firecrawl']
            })
            .select()
            .single();
          
          if (!artifactError && artifact) {
            await supabaseAdmin
              .from('wp_deep_research')
              .update({ artifact_id: artifact.id })
              .eq('local_job_id', jobId);
            
            console.log(`[DeepResearch:${requestId}] Created missing artifact ${artifact.id}`);
            
            return NextResponse.json({
              success: true,
              status: dbJob.status,
              data: dbJob.data,
              creditsUsed: dbJob.credits_used,
              expiresAt: dbJob.expires_at,
              artifactId: artifact.id
            });
          }
        } catch (err) {
          console.error(`[DeepResearch:${requestId}] Error creating missing artifact:`, err);
        }
      }
      
      return NextResponse.json({
        success: dbJob.status === 'completed',
        status: dbJob.status,
        data: dbJob.data,
        creditsUsed: dbJob.credits_used,
        expiresAt: dbJob.expires_at,
        error: dbJob.error,
        artifactId: dbJob.artifact_id
      });
    }

    // Poll Firecrawl for status
    const firecrawlApiKey = process.env.FIRECRAWL_API_KEY;
    if (!firecrawlApiKey) {
      return NextResponse.json(
        { error: 'Servicio de investigación no configurado' },
        { status: 500 }
      );
    }

    const firecrawlJobId = dbJob.firecrawl_job_id || jobId;

    const statusResponse = await fetch(
      `${FIRECRAWL_API_URL}/v2/agent/${firecrawlJobId}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${firecrawlApiKey}`
        }
      }
    );

    if (!statusResponse.ok) {
      console.error('[DeepResearch] Error polling Firecrawl status', { 
        status: statusResponse.status,
        firecrawlJobId
      });
      
      // If 404 from Firecrawl and we have a firecrawl_job_id, maybe it's too old or invalid
      if (statusResponse.status === 404 && dbJob.firecrawl_job_id) {
        // Don't fail immediately, might be temporary
      }

      return NextResponse.json({
        success: true,
        status: 'processing'
      });
    }

    const statusData = await statusResponse.json();

    // Update DB if status changed or has data
    let artifactId: string | null = null;
    
    if (statusData.status === 'completed') {
      // First update DB with completion data
      await supabaseAdmin
        .from('wp_deep_research')
        .update({
          status: 'completed',
          data: statusData.data,
          credits_used: statusData.creditsUsed,
          expires_at: statusData.expiresAt,
          completed_at: new Date().toISOString()
        })
        .eq('local_job_id', jobId);

      console.log(`[DeepResearch:${requestId}] Job completed`, { 
        jobId, 
        creditsUsed: statusData.creditsUsed 
      });
      
      // Create artifact since webhooks don't work in v2 API
      if (statusData.data) {
        try {
          // Format research data with Gemini 3 Flash for better readability
          console.log(`[DeepResearch:${requestId}] Formatting research data with Gemini...`);
          const markdownContent = await formatResearchWithGemini(statusData.data, dbJob.prompt);
          const title = `🔍 ${dbJob.prompt.substring(0, 40)}${dbJob.prompt.length > 40 ? '...' : ''}`;
          
          const { data: artifact, error: artifactError } = await supabaseAdmin
            .from('artifacts')
            .insert({
              user_id: dbJob.user_id,
              title,
              content: markdownContent,
              type: 'markdown',
              description: `Investigación completada: ${dbJob.prompt}`,
              tags: ['research', 'deep-research', 'firecrawl']
            })
            .select()
            .single();
          
          if (artifactError) {
            console.error(`[DeepResearch:${requestId}] Error creating artifact:`, artifactError);
          } else {
            artifactId = artifact.id;
            
            // Update job with artifact ID
            await supabaseAdmin
              .from('wp_deep_research')
              .update({ artifact_id: artifactId })
              .eq('local_job_id', jobId);
            
            console.log(`[DeepResearch:${requestId}] Created artifact ${artifactId}`);
          }
          
          // Create in-app notification
          if (dbJob.empresa_id) {
            const { data: teamData } = await supabaseAdmin
              .from('wp_team_humano')
              .select('id')
              .eq('auth_uid', dbJob.user_id)
              .single();
            
            if (teamData) {
              const notificationPayload = {
                asesor_id: teamData.id,
                empresa_id: dbJob.empresa_id,
                contacto_id: null,
                tipo: 'deep_research',
                mensaje: `✅ Investigación completada: "${dbJob.prompt.substring(0, 50)}${dbJob.prompt.length > 50 ? '...' : ''}" - Haz clic para ver el resultado.`,
                requiere_respuesta: false,
                visto: false,
                estado: 'pendiente',
                metadata: { jobId, artifactId, type: 'deep_research_completed' },
                fecha_envio: new Date().toISOString(),
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              };
              
              await supabaseAdmin
                .from('wp_notificaciones_team')
                .insert(notificationPayload);
              
              console.log(`[DeepResearch:${requestId}] Created notification`);
            }
          }
        } catch (artifactErr) {
          console.error(`[DeepResearch:${requestId}] Error in artifact creation:`, artifactErr);
        }
      }
    } else if (statusData.status === 'failed') {
      await supabaseAdmin
        .from('wp_deep_research')
        .update({
          status: 'failed',
          error: statusData.error || 'La investigación falló',
          completed_at: new Date().toISOString()
        })
        .eq('local_job_id', jobId);

      console.error(`[DeepResearch:${requestId}] Job failed`, { jobId, error: statusData.error });
    }

    return NextResponse.json({
      success: statusData.status !== 'failed',
      status: statusData.status,
      data: statusData.data,
      creditsUsed: statusData.creditsUsed,
      expiresAt: statusData.expiresAt,
      error: statusData.error,
      artifactId  // Return artifact ID to client
    });

  } catch (error) {
    console.error('[DeepResearch] Error checking status', error);
    return NextResponse.json(
      { error: 'Error al verificar el estado' },
      { status: 500 }
    );
  }
}
