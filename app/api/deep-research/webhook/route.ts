import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ============================================================================
// DEEP RESEARCH WEBHOOK - Receives Firecrawl completion callbacks
// ============================================================================
// This endpoint is called by Firecrawl when a research job completes.
// It handles:
// 1. Updating the job status in the database
// 2. Creating the artifact server-side
// 3. Creating an in-app notification for the user
// This allows the system to work even if the user closed the browser tab.
// ============================================================================

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

interface FirecrawlWebhookPayload {
  success: boolean;
  status: 'completed' | 'failed';
  id: string; // Firecrawl job ID
  data?: unknown;
  expiresAt?: string;
  creditsUsed?: number;
  error?: string;
}

// Import Gemini-powered research formatter
import { formatResearchWithGemini } from '@/lib/research-formatter.server';

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  console.log(`[Webhook:${requestId}] Received Firecrawl callback`);

  try {
    const body = await request.json() as FirecrawlWebhookPayload;
    const { success, status, id: firecrawlJobId, data, expiresAt, creditsUsed, error } = body;

    console.log(`[Webhook:${requestId}] Firecrawl job ${firecrawlJobId}: ${status}`);

    // 1. Find the job in our database by firecrawl_job_id
    const { data: dbJob, error: dbError } = await supabaseAdmin
      .from('wp_deep_research')
      .select('*')
      .eq('firecrawl_job_id', firecrawlJobId)
      .single();

    if (dbError || !dbJob) {
      console.error(`[Webhook:${requestId}] Job not found for firecrawl_job_id: ${firecrawlJobId}`);
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const localJobId = dbJob.local_job_id;
    const userId = dbJob.user_id;
    const empresaId = dbJob.empresa_id;
    const prompt = dbJob.prompt;

    // 2. Update job status in database
    const updatePayload: Record<string, unknown> = {
      status: status,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (status === 'completed' && data) {
      updatePayload.data = data;
      updatePayload.credits_used = creditsUsed;
      updatePayload.expires_at = expiresAt;
    } else if (status === 'failed') {
      updatePayload.error = error || 'La investigación falló';
    }

    await supabaseAdmin
      .from('wp_deep_research')
      .update(updatePayload)
      .eq('local_job_id', localJobId);

    console.log(`[Webhook:${requestId}] Updated job ${localJobId} to ${status}`);

    // 3. If completed, create artifact
    let artifactId: string | null = null;
    
    if (status === 'completed' && data) {
      // Format research data with Gemini 3 Flash for better readability
      console.log(`[Webhook:${requestId}] Formatting research data with Gemini...`);
      const markdownContent = await formatResearchWithGemini(data, prompt);
      const title = `🔍 ${prompt.substring(0, 40)}${prompt.length > 40 ? '...' : ''}`;

      const { data: artifact, error: artifactError } = await supabaseAdmin
        .from('artifacts')
        .insert({
          user_id: userId,
          title,
          content: markdownContent,
          type: 'markdown',
          description: `Investigación completada: ${prompt}`,
          tags: ['research', 'deep-research', 'firecrawl']
        })
        .select()
        .single();

      if (artifactError) {
        console.error(`[Webhook:${requestId}] Error creating artifact:`, artifactError);
      } else {
        artifactId = artifact.id;
        
        // Update job with artifact ID
        await supabaseAdmin
          .from('wp_deep_research')
          .update({ artifact_id: artifactId })
          .eq('local_job_id', localJobId);

        console.log(`[Webhook:${requestId}] Created artifact ${artifactId}`);
      }
    }

    // 4. Create in-app notification
    if (empresaId) {
      // Get user's team_humano_id from user_id (auth_uid)
      const { data: teamData } = await supabaseAdmin
        .from('wp_team_humano')
        .select('id')
        .eq('auth_uid', userId)
        .single();

      if (teamData) {
        const notificationPayload = {
          asesor_id: teamData.id,
          empresa_id: empresaId,
          contacto_id: null, // System notification
          tipo: 'deep_research',
          mensaje: status === 'completed'
            ? `✅ Investigación completada: "${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}" - Haz clic para ver el resultado.`
            : `❌ Investigación fallida: "${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}"`,
          requiere_respuesta: false,
          visto: false,
          estado: 'pendiente',
          metadata: { 
            jobId: localJobId, 
            artifactId, 
            type: status === 'completed' ? 'deep_research_completed' : 'deep_research_failed'
          },
          fecha_envio: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        const { error: notifError } = await supabaseAdmin
          .from('wp_notificaciones_team')
          .insert(notificationPayload);

        if (notifError) {
          console.error(`[Webhook:${requestId}] Error creating notification:`, notifError);
        } else {
          console.log(`[Webhook:${requestId}] Created notification for user`);
        }
      }
    }

    console.log(`[Webhook:${requestId}] Webhook processing complete`);

    return NextResponse.json({ 
      success: true, 
      processed: true,
      jobId: localJobId,
      artifactId 
    });

  } catch (err) {
    console.error(`[Webhook:${requestId}] Error processing webhook:`, err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Also support GET for health check
export async function GET() {
  return NextResponse.json({ 
    status: 'ok', 
    service: 'deep-research-webhook',
    timestamp: new Date().toISOString()
  });
}
