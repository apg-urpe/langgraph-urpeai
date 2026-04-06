import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { verifyActiveTeamMember, createSupabaseAdmin } from '@/lib/auth-security';

export const dynamic = 'force-dynamic';

const NYLAS_API_KEY = process.env.NYLAS_API_KEY;
const NYLAS_API_URI = process.env.NYLAS_API_URI || 'https://api.us.nylas.com';
const STORAGE_BUCKET = 'notetaker-recordings';

/**
 * Hybrid auth: cookies first, then Bearer token fallback.
 */
async function getAuthUser(request: NextRequest) {
  let response = NextResponse.next();
  const cookieSupabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return request.cookies.get(name)?.value; },
        set(name: string, value: string, options: CookieOptions) { response.cookies.set({ name, value, ...options }); },
        remove(name: string, options: CookieOptions) { response.cookies.set({ name, value: '', ...options }); },
      },
    }
  );

  const { data: { user: cookieUser }, error: cookieError } = await cookieSupabase.auth.getUser();
  if (cookieUser && !cookieError) return { user: cookieUser, error: null };

  const { data: { session }, error: sessionError } = await cookieSupabase.auth.getSession();
  if (session?.user && !sessionError) {
    console.log('[API/Nylas/NotetakerMedia] Auth recovered via getSession refresh');
    return { user: session.user, error: null };
  }

  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const tokenSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data: { user: tokenUser }, error: tokenError } = await tokenSupabase.auth.getUser(token);
    if (tokenUser && !tokenError) return { user: tokenUser, error: null };
    console.warn('[API/Nylas/NotetakerMedia] Bearer token invalid:', tokenError?.message);
  }

  console.warn('[API/Nylas/NotetakerMedia] All auth methods failed.');
  return { user: null, error: cookieError || sessionError || new Error('No valid authentication found') };
}

type ResolutionContext = {
  transcripcion: {
    id: number;
    notetaker_id: string | null;
    grant_id: string | null;
    cita_id: number | null;
    video_url?: string | null;
    video_cached_at?: string | null;
  } | null;
  cita: {
    id: number;
    empresa_id: number | null;
    team_humano_id: number | null;
    ubicacion: string | null;
    metadata: Record<string, unknown> | null;
  } | null;
  teamGrantId: string | null;
  candidateNotetakerIds: string[];
  candidateGrantIds: string[];
  meetingLink: string | null;
};

function uniqueValues(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter(Boolean)
    )
  );
}

function normalizeMeetingLink(value?: string | null) {
  if (!value) return null;

  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`.replace(/\/+$/, '').toLowerCase();
  } catch {
    return value.trim().replace(/\/+$/, '').toLowerCase();
  }
}

async function loadResolutionContext(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  requestedNotetakerId: string | null,
  requestedGrantId: string | null,
  transcripcionId: number | null,
  citaId: number | null
): Promise<ResolutionContext> {
  let transcripcion: ResolutionContext['transcripcion'] = null;
  let cita: ResolutionContext['cita'] = null;
  let teamGrantId: string | null = null;

  if (transcripcionId) {
    const { data } = await supabaseAdmin
      .from('transcripciones')
      .select('id, notetaker_id, grant_id, cita_id, video_url, video_cached_at')
      .eq('id', transcripcionId)
      .maybeSingle();

    if (data) {
      transcripcion = data as ResolutionContext['transcripcion'];
    }
  }

  const effectiveCitaId = citaId ?? transcripcion?.cita_id ?? null;

  if (effectiveCitaId) {
    const { data } = await supabaseAdmin
      .from('wp_citas')
      .select('id, empresa_id, team_humano_id, ubicacion, metadata')
      .eq('id', effectiveCitaId)
      .maybeSingle();

    if (data) {
      cita = data as ResolutionContext['cita'];

      if (data.team_humano_id) {
        const { data: teamMember } = await supabaseAdmin
          .from('wp_team_humano')
          .select('grant_id')
          .eq('id', data.team_humano_id)
          .maybeSingle();

        teamGrantId = teamMember?.grant_id || null;
      }
    }
  }

  const citaMetadata = cita?.metadata as Record<string, unknown> | null;
  const citaNotetakerId = typeof citaMetadata?.notetaker_id === 'string' ? citaMetadata.notetaker_id : null;

  return {
    transcripcion,
    cita,
    teamGrantId,
    candidateNotetakerIds: uniqueValues([
      requestedNotetakerId,
      transcripcion?.notetaker_id,
      citaNotetakerId,
    ]),
    candidateGrantIds: uniqueValues([
      requestedGrantId,
      transcripcion?.grant_id,
      teamGrantId,
    ]),
    meetingLink: cita?.ubicacion || null,
  };
}

async function createCachedVideoResponse(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  videoPath: string,
  notetakerId: string
) {
  const { data: signedData, error: signedError } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(videoPath, 60 * 60);

  if (!signedData?.signedUrl || signedError) {
    console.warn(`[API/Nylas/NotetakerMedia] Cached video_url exists but signed URL failed:`, signedError?.message);
    return null;
  }

  const thumbPath = videoPath.replace(/\.[^.]+$/, '_thumb.png');
  const { data: thumbSigned } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(thumbPath, 60 * 60);

  console.log(`[API/Nylas/NotetakerMedia] ✅ Serving cached video for notetaker ${notetakerId}`);

  return NextResponse.json({
    state: 'available',
    source: 'cache',
    media: {
      recording: { url: signedData.signedUrl, type: 'video/mp4' },
      thumbnail: thumbSigned?.signedUrl ? { url: thumbSigned.signedUrl } : null,
    },
  });
}

async function tryResolveNotetaker(
  candidateNotetakerIds: string[],
  candidateGrantIds: string[]
) {
  for (const candidateNotetakerId of candidateNotetakerIds) {
    for (const candidateGrantId of candidateGrantIds) {
      const grantUrl = `${NYLAS_API_URI}/v3/grants/${candidateGrantId}/notetakers/${candidateNotetakerId}`;
      console.log(`[API/Nylas/NotetakerMedia] Attempt A (grant-scoped): ${grantUrl}`);

      const grantRes = await fetch(grantUrl, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${NYLAS_API_KEY}`, 'Accept': 'application/json' },
      });

      if (grantRes.ok) {
        const statusData = await grantRes.json();
        console.log(`[API/Nylas/NotetakerMedia] ✅ Attempt A succeeded for ${candidateNotetakerId}. State: ${statusData.data?.state}`);
        return {
          notetakerId: candidateNotetakerId,
          statusData,
          resolvedEndpointType: 'grant-scoped' as const,
          resolvedGrantId: candidateGrantId,
        };
      }

      const errText = await grantRes.text();
      console.warn(`[API/Nylas/NotetakerMedia] ⚠️ Attempt A failed for ${candidateNotetakerId}: ${grantRes.status} ${errText.slice(0, 200)}`);
    }

    const standaloneUrl = `${NYLAS_API_URI}/v3/notetakers/${candidateNotetakerId}`;
    console.log(`[API/Nylas/NotetakerMedia] Attempt B (standalone): ${standaloneUrl}`);

    const standaloneRes = await fetch(standaloneUrl, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${NYLAS_API_KEY}`, 'Accept': 'application/json' },
    });

    if (standaloneRes.ok) {
      const statusData = await standaloneRes.json();
      console.log(`[API/Nylas/NotetakerMedia] ✅ Attempt B succeeded for ${candidateNotetakerId}. State: ${statusData.data?.state}`);
      return {
        notetakerId: candidateNotetakerId,
        statusData,
        resolvedEndpointType: 'standalone' as const,
        resolvedGrantId: candidateGrantIds[0] || null,
      };
    }

    const errText = await standaloneRes.text();
    console.warn(`[API/Nylas/NotetakerMedia] ⚠️ Attempt B failed for ${candidateNotetakerId}: ${standaloneRes.status} ${errText.slice(0, 200)}`);
  }

  return null;
}

async function listRecentGrantNotetakers(grantIds: string[]) {
  const recentNotetakers: Array<{
    id: string;
    name: string;
    state: string;
    created_at?: string;
    meeting_link?: string;
    grant_id: string;
  }> = [];
  const errors: Array<{ grant_id: string; status?: number; message: string }> = [];

  for (const candidateGrantId of grantIds) {
    try {
      const listUrl = `${NYLAS_API_URI}/v3/grants/${candidateGrantId}/notetakers?limit=10`;
      const listRes = await fetch(listUrl, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${NYLAS_API_KEY}`, 'Accept': 'application/json' },
      });

      if (!listRes.ok) {
        console.warn(`[API/Nylas/NotetakerMedia] Could not list grant notetakers for ${candidateGrantId}: ${listRes.status}`);
        errors.push({
          grant_id: candidateGrantId,
          status: listRes.status,
          message: `HTTP ${listRes.status}`,
        });
        continue;
      }

      const listData = await listRes.json();
      for (const item of listData.data || []) {
        recentNotetakers.push({
          id: item.id,
          name: item.name,
          state: item.state,
          created_at: item.created_at,
          meeting_link: item.meeting_link,
          grant_id: candidateGrantId,
        });
      }
    } catch (error: any) {
      console.warn(`[API/Nylas/NotetakerMedia] Could not list grant notetakers for ${candidateGrantId}: ${error.message}`);
      errors.push({
        grant_id: candidateGrantId,
        message: error.message,
      });
    }
  }

  const uniqueNotetakers = new Map<string, (typeof recentNotetakers)[number]>();
  for (const item of recentNotetakers) {
    if (!uniqueNotetakers.has(item.id)) {
      uniqueNotetakers.set(item.id, item);
    }
  }

  return {
    notetakers: Array.from(uniqueNotetakers.values()).sort((a, b) => {
      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return timeB - timeA;
    }),
    errors,
  };
}

async function repairResolvedNotetaker(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  transcripcionId: number | null,
  citaId: number | null,
  resolvedNotetakerId: string,
  resolvedGrantId: string | null
) {
  const payload: Record<string, string> = { notetaker_id: resolvedNotetakerId };

  if (resolvedGrantId) {
    payload.grant_id = resolvedGrantId;
  }

  if (transcripcionId) {
    await supabaseAdmin
      .from('transcripciones')
      .update(payload)
      .eq('id', transcripcionId);
    return;
  }

  if (citaId) {
    await supabaseAdmin
      .from('transcripciones')
      .update(payload)
      .eq('cita_id', citaId);
  }
}

/**
 * GET /api/nylas/notetaker-media?notetaker_id=<id>&grant_id=<grant_id>
 * 
 * Proxy que obtiene las URLs temporales (60 min) de los media files
 * de un Nylas Notetaker (recording MP4, thumbnail, transcript, summary, action_items).
 * 
 * Usa endpoints STANDALONE de Nylas (/v3/notetakers/{id}) que no dependen
 * del grant_id — esto resuelve 404s cuando el usuario reconecta su cuenta
 * (nuevo grant_id) o cuando el notetaker se creó via calendar-sync.
 * 
 * Respuestas:
 * - 200: { state: 'available', media: { recording, thumbnail, ... } }
 * - 200: { state: 'processing' | 'not_ready' | 'failed' | 'expired' | ... }
 * - 4xx/5xx: errores de auth/validación
 */
export async function GET(req: NextRequest) {
  if (!NYLAS_API_KEY) {
    return NextResponse.json({ error: 'Nylas API Key not configured' }, { status: 500 });
  }

  // --- Auth ---
  const { user, error: authError } = await getAuthUser(req);
  if (!user || authError) {
    return NextResponse.json({ error: 'No autorizado. Inicia sesión.' }, { status: 401 });
  }

  // --- Verify active team member ---
  const supabaseAdmin = createSupabaseAdmin();
  const securityCheck = await verifyActiveTeamMember(supabaseAdmin, user.id, user.email);

  if (!securityCheck.success || !securityCheck.teamMember) {
    return NextResponse.json(
      { error: securityCheck.error?.message || 'Acceso denegado' },
      { status: securityCheck.error?.httpStatus || 403 }
    );
  }

  // --- Parse params ---
  const { searchParams } = new URL(req.url);
  const notetakerId = searchParams.get('notetaker_id');
  const grantId = searchParams.get('grant_id');
  const transcripcionIdParam = searchParams.get('transcripcion_id');
  const citaIdParam = searchParams.get('cita_id');
  const transcripcionId = transcripcionIdParam && /^\d+$/.test(transcripcionIdParam) ? Number(transcripcionIdParam) : null;
  const citaId = citaIdParam && /^\d+$/.test(citaIdParam) ? Number(citaIdParam) : null;

  if (!notetakerId && !transcripcionId && !citaId) {
    return NextResponse.json({ 
      error: 'Se requiere notetaker_id, transcripcion_id o cita_id',
      code: 'MISSING_PARAMS'
    }, { status: 400 });
  }

  const resolutionContext = await loadResolutionContext(
    supabaseAdmin,
    notetakerId,
    grantId,
    transcripcionId,
    citaId
  );
  const effectiveTranscripcionId = resolutionContext.transcripcion?.id ?? transcripcionId;
  const effectiveCitaId = resolutionContext.cita?.id ?? resolutionContext.transcripcion?.cita_id ?? citaId;

  // --- Enterprise access check ---
  // Verify the notetaker belongs to a transcription in the user's enterprise.
  // This works even if grant_id changed due to reconnection.
  const currentUser = securityCheck.teamMember;

  if (currentUser.role_id !== 1) {
    // Strategy 1: Check if grant_id belongs to a team member in the same enterprise
    let hasAccess = false;

    if (resolutionContext.cita?.empresa_id === currentUser.empresa_id) {
      hasAccess = true;
    }

    if (!hasAccess) {
      for (const candidateGrantId of resolutionContext.candidateGrantIds) {
        const { data: grantOwner } = await supabaseAdmin
          .from('wp_team_humano')
          .select('empresa_id')
          .eq('grant_id', candidateGrantId)
          .maybeSingle();

        if (grantOwner && grantOwner.empresa_id === currentUser.empresa_id) {
          hasAccess = true;
          break;
        }
      }
    }

    if (!hasAccess) {
      for (const candidateNotetakerId of resolutionContext.candidateNotetakerIds) {
        const { data: transcripcion } = await supabaseAdmin
          .from('transcripciones')
          .select('id, grant_id, cita:wp_citas(empresa_id)')
          .eq('notetaker_id', candidateNotetakerId)
          .limit(1)
          .maybeSingle();

        if (!transcripcion) {
          continue;
        }

        const citaEmpresaId = (transcripcion.cita as any)?.empresa_id;
        if (citaEmpresaId === currentUser.empresa_id) {
          hasAccess = true;
          break;
        }

        if (transcripcion.grant_id) {
          const { data: grantMember } = await supabaseAdmin
            .from('wp_team_humano')
            .select('empresa_id')
            .eq('grant_id', transcripcion.grant_id)
            .maybeSingle();

          if (grantMember && grantMember.empresa_id === currentUser.empresa_id) {
            hasAccess = true;
            break;
          }
        }
      }
    }

    if (!hasAccess) {
      return NextResponse.json({ 
        error: 'No tienes acceso a este recurso',
        code: 'CROSS_ENTERPRISE'
      }, { status: 403 });
    }
  }

  // --- Step 0: Check for cached video in Supabase Storage ---
  try {
    if (resolutionContext.transcripcion?.video_url) {
      const cachedResponse = await createCachedVideoResponse(
        supabaseAdmin,
        resolutionContext.transcripcion.video_url,
        resolutionContext.transcripcion.notetaker_id || resolutionContext.candidateNotetakerIds[0] || 'unknown'
      );

      if (cachedResponse) {
        return cachedResponse;
      }
    }

    if (resolutionContext.candidateNotetakerIds.length > 0) {
      const { data: cachedTranscripcion } = await supabaseAdmin
        .from('transcripciones')
        .select('id, notetaker_id, video_url, video_cached_at')
        .in('notetaker_id', resolutionContext.candidateNotetakerIds)
        .not('video_url', 'is', null)
        .limit(1)
        .maybeSingle();

      if (cachedTranscripcion?.video_url) {
        const cachedResponse = await createCachedVideoResponse(
          supabaseAdmin,
          cachedTranscripcion.video_url,
          cachedTranscripcion.notetaker_id || resolutionContext.candidateNotetakerIds[0] || 'unknown'
        );

        if (cachedResponse) {
          return cachedResponse;
        }
      }
    }
  } catch (cacheErr: any) {
    console.warn('[API/Nylas/NotetakerMedia] Cache check error (non-blocking):', cacheErr.message);
  }

  // --- Step 1: Try to get notetaker status ---
  // Strategy: try grant-scoped first (original creation path), then standalone as fallback
  try {
    console.log(`[API/Nylas/NotetakerMedia] === Diagnostic: requested_notetaker_id="${notetakerId}", requested_grant_id="${grantId}", candidate_notetakers="${resolutionContext.candidateNotetakerIds.join(',')}", candidate_grants="${resolutionContext.candidateGrantIds.join(',')}" ===`);

    let resolution = await tryResolveNotetaker(
      resolutionContext.candidateNotetakerIds,
      resolutionContext.candidateGrantIds
    );

    const recentGrantListing = resolutionContext.candidateGrantIds.length > 0
      ? await listRecentGrantNotetakers(resolutionContext.candidateGrantIds)
      : { notetakers: [], errors: [] as Array<{ grant_id: string; status?: number; message: string }> };
    let recentGrantNotetakers = recentGrantListing.notetakers;

    if (!resolution && resolutionContext.meetingLink && recentGrantNotetakers.length > 0) {
      const normalizedMeetingLink = normalizeMeetingLink(resolutionContext.meetingLink);
      const matchedIds = recentGrantNotetakers
        .filter((item) => normalizeMeetingLink(item.meeting_link) === normalizedMeetingLink)
        .map((item) => item.id);

      if (matchedIds.length > 0) {
        resolution = await tryResolveNotetaker(
          uniqueValues([...matchedIds, ...resolutionContext.candidateNotetakerIds]),
          resolutionContext.candidateGrantIds
        );
      }
    }

    if (!resolution) {
      console.error(`[API/Nylas/NotetakerMedia] ❌ No valid notetaker could be resolved for request`);

      const diagnosticInfo: any = {
        requested_notetaker_id: notetakerId,
        requested_grant_id: grantId,
        transcripcion_id: effectiveTranscripcionId,
        cita_id: effectiveCitaId,
        candidate_notetaker_ids: resolutionContext.candidateNotetakerIds,
        candidate_grant_ids: resolutionContext.candidateGrantIds,
        meeting_link: resolutionContext.meetingLink,
        grant_list_errors: recentGrantListing.errors,
        recent_notetakers: recentGrantNotetakers.map((n) => ({
          id: n.id,
          name: n.name,
          state: n.state,
          created_at: n.created_at,
          meeting_link: n.meeting_link?.slice(0, 60),
        })),
      };

      try {
        const standaloneListUrl = `${NYLAS_API_URI}/v3/notetakers?limit=5`;
        const standaloneListRes = await fetch(standaloneListUrl, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${NYLAS_API_KEY}`, 'Accept': 'application/json' },
        });

        if (standaloneListRes.ok) {
          const standaloneListData = await standaloneListRes.json();
          diagnosticInfo.recent_standalone_notetakers = (standaloneListData.data || []).map((n: any) => ({
            id: n.id,
            name: n.name,
            state: n.state,
            created_at: n.created_at,
          }));
          console.log(`[API/Nylas/NotetakerMedia] 🔍 Found ${diagnosticInfo.recent_standalone_notetakers.length} standalone notetakers`);
        } else {
          diagnosticInfo.standalone_list_error = `HTTP ${standaloneListRes.status}`;
        }

      } catch (error: any) {
        diagnosticInfo.standalone_list_error = error.message;
      }

      const hasGrant404 = recentGrantListing.errors.some((entry) => entry.status === 404);
      const message = hasGrant404
        ? 'No se encontró la grabación y al menos uno de los grant_id probados ya no existe en Nylas. Esto sugiere un grant desfasado o una reconexión de cuenta pendiente de sincronizar.'
        : 'No se encontró la grabación con el identificador actual en Nylas. Puede deberse a un notetaker desfasado, a que el media aún no esté disponible o a que Nylas ya haya eliminado el archivo.';

      return NextResponse.json({
        state: 'not_found',
        message,
        diagnostic: diagnosticInfo,
      });
    }

    if (
      resolution.notetakerId !== resolutionContext.transcripcion?.notetaker_id ||
      (resolution.resolvedGrantId && resolution.resolvedGrantId !== resolutionContext.transcripcion?.grant_id)
    ) {
      await repairResolvedNotetaker(
        supabaseAdmin,
        effectiveTranscripcionId,
        effectiveCitaId,
        resolution.notetakerId,
        resolution.resolvedGrantId
      );
    }

    // --- Status resolved successfully ---
    const notetakerState = resolution.statusData.data?.state;
    console.log(`[API/Nylas/NotetakerMedia] Notetaker state: ${notetakerState} (via ${resolution.resolvedEndpointType})`);

    // Map Nylas notetaker states to user-friendly responses
    const STATE_MESSAGES: Record<string, { state: string; message: string }> = {
      'scheduled':       { state: 'not_ready', message: 'La reunión aún no ha comenzado. Monica está programada para unirse.' },
      'connecting':      { state: 'not_ready', message: 'Monica se está conectando a la reunión.' },
      'waiting_for_admission': { state: 'not_ready', message: 'Monica está esperando ser admitida a la reunión.' },
      'failed_entry':    { state: 'failed', message: 'Monica no pudo unirse a la reunión. Verifica que el enlace sea válido.' },
      'attending':       { state: 'not_ready', message: 'La reunión está en curso. El video estará disponible al terminar.' },
      'media_processing':{ state: 'processing', message: 'El video se está procesando. Esto puede tardar unos minutos.' },
      'media_available': { state: 'media_available', message: '' },
      'media_error':     { state: 'failed', message: 'Hubo un error al procesar el video de esta reunión.' },
      'media_deleted':   { state: 'expired', message: 'La grabación fue eliminada. Nylas solo almacena media por 14 días.' },
    };

    const mapped = STATE_MESSAGES[notetakerState];

    if (!mapped) {
      console.warn(`[API/Nylas/NotetakerMedia] Unknown notetaker state: ${notetakerState}`);
      return NextResponse.json({
        state: 'unknown',
        notetaker_state: notetakerState,
        message: `Estado del notetaker: ${notetakerState}`,
      });
    }

    if (mapped.state !== 'media_available') {
      return NextResponse.json({
        state: mapped.state,
        notetaker_state: notetakerState,
        message: mapped.message,
      });
    }

    // --- Step 2: Fetch media URLs (using same endpoint type that worked) ---
    const mediaUrl = resolution.resolvedEndpointType === 'grant-scoped' && resolution.resolvedGrantId
      ? `${NYLAS_API_URI}/v3/grants/${resolution.resolvedGrantId}/notetakers/${resolution.notetakerId}/media`
      : `${NYLAS_API_URI}/v3/notetakers/${resolution.notetakerId}/media`;
    console.log(`[API/Nylas/NotetakerMedia] Fetching media URLs (${resolution.resolvedEndpointType}) for notetaker ${resolution.notetakerId}`);

    const mediaResponse = await fetch(mediaUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${NYLAS_API_KEY}`,
        'Accept': 'application/json, application/gzip',
      },
    });

    if (mediaResponse.status === 410) {
      return NextResponse.json({
        state: 'expired',
        message: 'La grabación expiró. Nylas solo almacena media por 14 días.',
      });
    }

    if (!mediaResponse.ok) {
      const errorText = await mediaResponse.text();
      console.error(`[API/Nylas/NotetakerMedia] ❌ Media fetch error: ${mediaResponse.status} ${errorText}`);
      return NextResponse.json({
        state: 'error',
        message: `Error al obtener el video (${mediaResponse.status})`,
      });
    }

    const mediaData = await mediaResponse.json();
    console.log(`[API/Nylas/NotetakerMedia] ✅ Media retrieved for notetaker ${resolution.notetakerId}`);

    // --- Auto-cache: download video to Supabase Storage (fire-and-forget) ---
    const recordingInfo = mediaData.data?.recording;
    const recordingUrl = typeof recordingInfo === 'string' ? recordingInfo : recordingInfo?.url;
    if (recordingUrl) {
      // Don't await — cache in background. If it fails, the user still gets the temp URL.
      cacheVideoToStorage(
        supabaseAdmin,
        resolution.notetakerId,
        resolution.resolvedGrantId || resolutionContext.candidateGrantIds[0] || 'unknown',
        mediaData.data
      ).catch((err) => {
        console.warn(`[API/Nylas/NotetakerMedia] Background cache failed (non-blocking):`, err.message);
      });
    }

    return NextResponse.json({
      state: 'available',
      source: 'nylas',
      resolved_notetaker_id: resolution.notetakerId,
      media: mediaData.data,
    });

  } catch (error: any) {
    console.error('[API/Nylas/NotetakerMedia] Exception:', error);
    return NextResponse.json({ 
      error: 'Error interno del servidor', 
      details: error.message 
    }, { status: 500 });
  }
}

/**
 * Auto-cache: downloads recording from Nylas temp URL and stores in Supabase Storage.
 * Updates the transcription record with the permanent storage path.
 * This runs as fire-and-forget — failures are logged but don't affect the user response.
 */
async function cacheVideoToStorage(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  notetakerId: string,
  grantId: string,
  mediaData: any
) {
  try {
    // Check if already cached
    const { data: existing } = await supabaseAdmin
      .from('transcripciones')
      .select('id, video_url')
      .eq('notetaker_id', notetakerId)
      .maybeSingle();

    if (!existing) {
      console.log(`[CacheVideo] No transcription found for notetaker ${notetakerId}, skipping cache`);
      return;
    }

    if (existing.video_url) {
      console.log(`[CacheVideo] Already cached for transcription ${existing.id}, skipping`);
      return;
    }

    const recordingInfo = mediaData?.recording;
    const recordingUrl = typeof recordingInfo === 'string' ? recordingInfo : recordingInfo?.url;
    if (!recordingUrl) {
      console.warn('[CacheVideo] No recording URL to cache');
      return;
    }

    console.log(`[CacheVideo] Downloading recording for transcription ${existing.id}...`);
    const response = await fetch(recordingUrl);
    if (!response.ok) {
      console.error(`[CacheVideo] Download failed: ${response.status}`);
      return;
    }

    const buffer = await response.arrayBuffer();
    const sizeMB = (buffer.byteLength / 1024 / 1024).toFixed(1);
    console.log(`[CacheVideo] Downloaded ${sizeMB} MB`);

    const fileFormat = mediaData?.recording?.recording_file_format || 'mp4';
    const storagePath = `${grantId}/${notetakerId}.${fileFormat}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, buffer, {
        contentType: fileFormat === 'mp3' ? 'audio/mpeg' : 'video/mp4',
        upsert: true,
      });

    if (uploadError) {
      console.error('[CacheVideo] Storage upload failed:', uploadError);
      return;
    }

    // Update transcription with cached path
    await supabaseAdmin
      .from('transcripciones')
      .update({
        video_url: storagePath,
        video_cached_at: new Date().toISOString(),
      })
      .eq('id', existing.id);

    console.log(`[CacheVideo] ✅ Cached successfully: ${storagePath} (${sizeMB} MB)`);

    // Also cache thumbnail
    const thumbInfo = mediaData?.thumbnail;
    const thumbUrl = typeof thumbInfo === 'string' ? thumbInfo : thumbInfo?.url;
    if (thumbUrl) {
      try {
        const thumbRes = await fetch(thumbUrl);
        if (thumbRes.ok) {
          const thumbBuf = await thumbRes.arrayBuffer();
          await supabaseAdmin.storage
            .from(STORAGE_BUCKET)
            .upload(`${grantId}/${notetakerId}_thumb.png`, thumbBuf, {
              contentType: 'image/png',
              upsert: true,
            });
        }
      } catch {}
    }
  } catch (err: any) {
    console.error('[CacheVideo] Exception:', err.message);
  }
}
