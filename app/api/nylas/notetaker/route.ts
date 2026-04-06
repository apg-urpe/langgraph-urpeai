import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { verifyActiveTeamMember, createSupabaseAdmin } from '@/lib/auth-security';

export const dynamic = 'force-dynamic';

const NYLAS_API_KEY = process.env.NYLAS_API_KEY;
const NYLAS_API_URI = process.env.NYLAS_API_URI || 'https://api.us.nylas.com';

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

  // Method 1: getUser() validates token with Supabase server
  const { data: { user: cookieUser }, error: cookieError } = await cookieSupabase.auth.getUser();
  if (cookieUser && !cookieError) return { user: cookieUser, error: null };

  // Method 2: getSession() can auto-refresh expired tokens via refresh_token cookie
  const { data: { session }, error: sessionError } = await cookieSupabase.auth.getSession();
  if (session?.user && !sessionError) {
    console.log('[API/Nylas/Notetaker] Auth recovered via getSession refresh');
    return { user: session.user, error: null };
  }

  // Method 3: Bearer token from Authorization header
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const tokenSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data: { user: tokenUser }, error: tokenError } = await tokenSupabase.auth.getUser(token);
    if (tokenUser && !tokenError) return { user: tokenUser, error: null };
    console.warn('[API/Nylas/Notetaker] Bearer token invalid:', tokenError?.message);
  }

  console.warn('[API/Nylas/Notetaker] All auth methods failed. Cookie error:', cookieError?.message, '| Session error:', sessionError?.message);
  return { user: null, error: cookieError || sessionError || new Error('No valid authentication found') };
}

/**
 * POST /api/nylas/notetaker
 * Invita a Monica (Nylas Notetaker) a una reunión
 * 
 * Body:
 * - meeting_link: URL de la reunión (Google Meet, Teams, Zoom)
 * - team_humano_id: ID del miembro del equipo (para obtener grant_id)
 * - appointment_id: ID de la cita (opcional, para guardar referencia)
 * - join_time?: Unix timestamp (opcional, si no se envía se une inmediatamente)
 * - name?: Nombre del notetaker (default: "Monica AI")
 */
export async function POST(req: NextRequest) {
  if (!NYLAS_API_KEY) {
    return NextResponse.json({ error: 'Nylas API Key not configured' }, { status: 500 });
  }

  // --- Autenticación ---
  const { user, error: authError } = await getAuthUser(req);
  if (!user || authError) {
    return NextResponse.json({ error: 'No autorizado. Inicia sesión.' }, { status: 401 });
  }

  // --- Verificar usuario activo ---
  const supabaseAdmin = createSupabaseAdmin();
  const securityCheck = await verifyActiveTeamMember(supabaseAdmin, user.id, user.email);

  if (!securityCheck.success || !securityCheck.teamMember) {
    return NextResponse.json(
      { error: securityCheck.error?.message || 'Acceso denegado' },
      { status: securityCheck.error?.httpStatus || 403 }
    );
  }

  try {
    const body = await req.json();
    const { 
      meeting_link, 
      team_humano_id, 
      appointment_id,
      join_time,
      name = 'Monica AI'
    } = body;

    // Validación
    if (!meeting_link) {
      return NextResponse.json({ 
        error: 'Se requiere el link de la reunión',
        code: 'MISSING_MEETING_LINK'
      }, { status: 400 });
    }

    if (!team_humano_id) {
      return NextResponse.json({ 
        error: 'Se requiere el ID del miembro del equipo',
        code: 'MISSING_TEAM_MEMBER'
      }, { status: 400 });
    }

    // Validar que el link sea de una plataforma soportada
    const supportedPlatforms = ['meet.google.com', 'teams.microsoft.com', 'zoom.us', 'zoom.com'];
    const isValidLink = supportedPlatforms.some(platform => meeting_link.includes(platform));
    
    if (!isValidLink) {
      return NextResponse.json({ 
        error: 'Plataforma no soportada. Monica solo puede unirse a Google Meet, Microsoft Teams o Zoom.',
        code: 'UNSUPPORTED_PLATFORM'
      }, { status: 400 });
    }

    // --- Verificar que el miembro pertenece a la misma empresa (o es role 1) ---
    const { data: teamMember, error: memberError } = await supabaseAdmin
      .from('wp_team_humano')
      .select('grant_id, nombre, apellido, empresa_id, notetaker')
      .eq('id', team_humano_id)
      .single();

    if (memberError || !teamMember) {
      return NextResponse.json({ 
        error: 'Miembro del equipo no encontrado',
        code: 'TEAM_MEMBER_NOT_FOUND'
      }, { status: 404 });
    }

    // Verificar que el usuario pertenece a la misma empresa (o es role 1)
    const currentUser = securityCheck.teamMember;
    if (currentUser.role_id !== 1 && currentUser.empresa_id !== teamMember.empresa_id) {
      return NextResponse.json({ 
        error: 'No puedes invitar a Monica en reuniones de otra empresa',
        code: 'CROSS_ENTERPRISE'
      }, { status: 403 });
    }

    if (!teamMember.grant_id) {
      return NextResponse.json({ 
        error: 'El miembro del equipo no tiene calendario conectado',
        details: 'Por favor conecta tu calendario en Configuración > Integraciones.',
        code: 'NO_CALENDAR_CONNECTED'
      }, { status: 400 });
    }

    // Construir request a Nylas Notetaker API
    const nylasUrl = `${NYLAS_API_URI}/v3/grants/${teamMember.grant_id}/notetakers`;
    
    const notetakerPayload: any = {
      meeting_link,
      name,
      meeting_settings: {
        // Habilitar todas las funciones de Monica
        transcription: true,
        summary: true,
        summary_settings: {
          custom_instructions: 'Genera un resumen en español con los puntos clave, decisiones tomadas y próximos pasos.'
        },
        action_items: true,
        action_items_settings: {
          custom_instructions: 'Lista las 5 tareas más importantes acordadas en la reunión, en español.'
        },
        audio_recording: true,
        video_recording: true,
        leave_after_silence_seconds: 1800
      }
    };

    // Solo agregar join_time si se proporciona (si no, se une inmediatamente)
    if (join_time) {
      notetakerPayload.join_time = join_time;
    }

    console.log(`[API/Nylas/Notetaker] Inviting Monica to meeting: ${meeting_link}`);

    const nylasResponse = await fetch(nylasUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NYLAS_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(notetakerPayload),
    });

    if (!nylasResponse.ok) {
      const errorText = await nylasResponse.text();
      console.error(`[API/Nylas/Notetaker] ❌ Failed: ${nylasResponse.status} ${errorText}`);
      
      let userMessage = 'Error al invitar a Monica a la reunión';
      let code = 'NYLAS_ERROR';
      
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error?.message) {
          userMessage = errorJson.error.message;
        }
        // Errores específicos de Nylas Notetaker
        if (nylasResponse.status === 402) {
          userMessage = 'Créditos de Notetaker agotados';
          code = 'CREDITS_EXHAUSTED';
        }
      } catch {}
      
      return NextResponse.json({ 
        error: userMessage,
        details: `Nylas API Error: ${nylasResponse.status}`,
        code
      }, { status: nylasResponse.status });
    }

    const nylasData = await nylasResponse.json();
    const notetakerId = nylasData.data?.id;
    
    console.log(`[API/Nylas/Notetaker] ✅ Monica invited successfully: ${notetakerId}`);

    // Si hay appointment_id, guardar referencia del notetaker
    if (appointment_id && notetakerId) {
      await supabaseAdmin
        .from('wp_citas')
        .update({ 
          metadata: supabaseAdmin.rpc('jsonb_set_nested', {
            target: 'metadata',
            path: '{notetaker_id}',
            value: JSON.stringify(notetakerId)
          })
        })
        .eq('id', appointment_id);
      
      // Alternativa más simple si la RPC no existe:
      const { data: currentAppointment } = await supabaseAdmin
        .from('wp_citas')
        .select('metadata')
        .eq('id', appointment_id)
        .single();
      
      if (currentAppointment) {
        const updatedMetadata = {
          ...(currentAppointment.metadata || {}),
          notetaker_id: notetakerId,
          notetaker_invited_at: new Date().toISOString()
        };
        
        await supabaseAdmin
          .from('wp_citas')
          .update({ metadata: updatedMetadata })
          .eq('id', appointment_id);
      }
    }

    return NextResponse.json({
      success: true,
      notetaker_id: notetakerId,
      message: 'Monica ha sido invitada a la reunión. Se unirá automáticamente.',
      data: nylasData.data
    });

  } catch (error: any) {
    console.error('[API/Nylas/Notetaker] Exception:', error);
    return NextResponse.json({ 
      error: 'Error interno del servidor', 
      details: error.message 
    }, { status: 500 });
  }
}

/**
 * GET /api/nylas/notetaker?id=<notetaker_id>&grant_id=<grant_id>
 * Obtiene el estado de un notetaker
 */
export async function GET(req: NextRequest) {
  if (!NYLAS_API_KEY) {
    return NextResponse.json({ error: 'Nylas API Key not configured' }, { status: 500 });
  }

  // --- Autenticación ---
  const { user, error: authError } = await getAuthUser(req);
  if (!user || authError) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const notetakerId = searchParams.get('id');
  const grantId = searchParams.get('grant_id');

  if (!notetakerId || !grantId) {
    return NextResponse.json({ error: 'Missing id or grant_id' }, { status: 400 });
  }

  try {
    const nylasUrl = `${NYLAS_API_URI}/v3/grants/${grantId}/notetakers/${notetakerId}`;
    
    const response = await fetch(nylasUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${NYLAS_API_KEY}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ 
        error: 'Error fetching notetaker status',
        details: errorText
      }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error: any) {
    console.error('[API/Nylas/Notetaker] GET Exception:', error);
    return NextResponse.json({ 
      error: 'Internal server error', 
      details: error.message 
    }, { status: 500 });
  }
}
