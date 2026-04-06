import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { verifyActiveTeamMember, createSupabaseAdmin } from '@/lib/auth-security';

export const dynamic = 'force-dynamic';

const NYLAS_API_KEY = process.env.NYLAS_API_KEY;
const NYLAS_API_URI = process.env.NYLAS_API_URI || 'https://api.us.nylas.com';
// All active team members can toggle Calendar Sync for their enterprise

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
    console.log('[API/Nylas/CalendarSync] Auth recovered via getSession refresh');
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
    console.warn('[API/Nylas/CalendarSync] Bearer token invalid:', tokenError?.message);
  }

  console.warn('[API/Nylas/CalendarSync] All auth methods failed. Cookie error:', cookieError?.message, '| Session error:', sessionError?.message);
  return { user: null, error: cookieError || sessionError || new Error('No valid authentication found') };
}

/**
 * PUT /api/nylas/calendar-sync
 * Activa o desactiva Nylas Notetaker Calendar Sync para un miembro del equipo.
 * 
 * Cuando se activa, configura reglas en Nylas para que el Notetaker se una
 * automáticamente a TODAS las videollamadas del calendario del usuario.
 * 
 * Cuando se desactiva, elimina las reglas de Calendar Sync en Nylas.
 * 
 * Body:
 * - team_humano_id: ID del miembro del equipo
 * - enabled: boolean (true = activar, false = desactivar)
 * - calendar_id?: string (default: "primary")
 */
export async function PUT(req: NextRequest) {
  if (!NYLAS_API_KEY) {
    return NextResponse.json({ error: 'Nylas API Key not configured' }, { status: 500 });
  }

  // --- Autenticación ---
  const { user, error: authError } = await getAuthUser(req);
  if (!user || authError) {
    return NextResponse.json({ error: 'No autorizado. Inicia sesión.' }, { status: 401 });
  }

  // --- Verificar usuario activo + permisos ---
  const supabaseAdmin = createSupabaseAdmin();
  const securityCheck = await verifyActiveTeamMember(supabaseAdmin, user.id, user.email);

  if (!securityCheck.success || !securityCheck.teamMember) {
    return NextResponse.json(
      { error: securityCheck.error?.message || 'Acceso denegado' },
      { status: securityCheck.error?.httpStatus || 403 }
    );
  }

  const currentUser = securityCheck.teamMember;

  try {
    const body = await req.json();
    const { team_humano_id, enabled, calendar_id = 'primary' } = body;

    if (!team_humano_id || typeof enabled !== 'boolean') {
      return NextResponse.json({ 
        error: 'Se requiere team_humano_id (number) y enabled (boolean)',
        code: 'INVALID_PARAMS'
      }, { status: 400 });
    }

    // --- Obtener grant_id del miembro objetivo ---
    const { data: targetMember, error: memberError } = await supabaseAdmin
      .from('wp_team_humano')
      .select('id, grant_id, nombre, apellido, empresa_id')
      .eq('id', team_humano_id)
      .single();

    if (memberError || !targetMember) {
      return NextResponse.json({ error: 'Miembro del equipo no encontrado' }, { status: 404 });
    }

    // --- Verificar misma empresa (role 1 puede cross-enterprise) ---
    if (currentUser.role_id !== 1 && currentUser.empresa_id !== targetMember.empresa_id) {
      return NextResponse.json({ 
        error: 'No puedes modificar miembros de otra empresa',
        code: 'CROSS_ENTERPRISE'
      }, { status: 403 });
    }

    if (!targetMember.grant_id) {
      return NextResponse.json({ 
        error: 'El miembro no tiene calendario conectado. Debe conectar su cuenta primero.',
        code: 'NO_CALENDAR_CONNECTED'
      }, { status: 400 });
    }

    // --- Llamar a Nylas Calendar API para configurar/eliminar Calendar Sync ---
    const nylasUrl = `${NYLAS_API_URI}/v3/grants/${targetMember.grant_id}/calendars/${calendar_id}`;

    let notetakerConfig: Record<string, any>;

    if (enabled) {
      // ACTIVAR: Configurar reglas para unirse a todas las reuniones con video
      notetakerConfig = {
        notetaker: {
          name: 'Monica AI',
          rules: {
            event_selection: ['all']
          },
          meeting_settings: {
            transcription: true,
            summary: true,
            summary_settings: {
              custom_instructions: 'Genera un resumen ejecutivo en español con: puntos clave discutidos, decisiones tomadas y próximos pasos.'
            },
            action_items: true,
            action_items_settings: {
              custom_instructions: 'Lista las 5 tareas más importantes acordadas en la reunión, en español, con responsable si se menciona.'
            },
            audio_recording: true,
            video_recording: true,
            leave_after_silence_seconds: 1800
          }
        }
      };
    } else {
      // DESACTIVAR: Enviar objeto notetaker vacío para eliminar reglas
      notetakerConfig = {
        notetaker: {}
      };
    }

    console.log(`[API/Nylas/CalendarSync] ${enabled ? 'Enabling' : 'Disabling'} for member ${team_humano_id} (grant: ${targetMember.grant_id})`);

    const nylasResponse = await fetch(nylasUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${NYLAS_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(notetakerConfig),
    });

    if (!nylasResponse.ok) {
      const errorText = await nylasResponse.text();
      console.error(`[API/Nylas/CalendarSync] ❌ Nylas error: ${nylasResponse.status} ${errorText}`);

      let userMessage = 'Error al configurar Calendar Sync en Nylas';
      let code = 'NYLAS_ERROR';

      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error?.message) {
          userMessage = errorJson.error.message;
        }
        if (nylasResponse.status === 404) {
          userMessage = 'Calendario no encontrado. Verifica que el grant esté activo.';
          code = 'CALENDAR_NOT_FOUND';
        }
        if (nylasResponse.status === 402) {
          userMessage = 'Créditos de Notetaker agotados en Nylas.';
          code = 'CREDITS_EXHAUSTED';
        }
      } catch {}

      return NextResponse.json({ error: userMessage, code, details: errorText }, { status: nylasResponse.status });
    }

    const nylasData = await nylasResponse.json();

    // --- Actualizar flag local en wp_team_humano ---
    const { error: updateError } = await supabaseAdmin
      .from('wp_team_humano')
      .update({ notetaker: enabled })
      .eq('id', team_humano_id);

    if (updateError) {
      console.error(`[API/Nylas/CalendarSync] ⚠️ Nylas OK pero error al actualizar BD:`, updateError);
    }

    console.log(`[API/Nylas/CalendarSync] ✅ Calendar Sync ${enabled ? 'enabled' : 'disabled'} for member ${team_humano_id}`);

    return NextResponse.json({
      success: true,
      enabled,
      message: enabled 
        ? 'Monica se unirá automáticamente a todas las videollamadas del calendario.'
        : 'Monica ya no se unirá automáticamente a las videollamadas.',
      calendar: nylasData.data
    });

  } catch (error: any) {
    console.error('[API/Nylas/CalendarSync] Exception:', error);
    return NextResponse.json({ 
      error: 'Error interno del servidor', 
      details: error.message 
    }, { status: 500 });
  }
}

/**
 * GET /api/nylas/calendar-sync?team_humano_id=<id>
 * Obtiene el estado actual de Calendar Sync para un miembro.
 * Consulta directamente a Nylas para verificar si hay reglas de notetaker configuradas.
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

  const supabaseAdmin = createSupabaseAdmin();

  const { searchParams } = new URL(req.url);
  const teamHumanoId = searchParams.get('team_humano_id');
  const calendarId = searchParams.get('calendar_id') || 'primary';

  if (!teamHumanoId) {
    return NextResponse.json({ error: 'Missing team_humano_id' }, { status: 400 });
  }

  try {
    const { data: member, error: memberError } = await supabaseAdmin
      .from('wp_team_humano')
      .select('grant_id, notetaker')
      .eq('id', parseInt(teamHumanoId))
      .single();

    if (memberError || !member?.grant_id) {
      return NextResponse.json({ 
        enabled: false, 
        synced: false,
        reason: 'No calendar connected' 
      });
    }

    // Consultar calendario en Nylas para ver si tiene notetaker configurado
    const nylasUrl = `${NYLAS_API_URI}/v3/grants/${member.grant_id}/calendars/${calendarId}`;
    
    const nylasResponse = await fetch(nylasUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${NYLAS_API_KEY}`,
        'Accept': 'application/json',
      },
    });

    if (!nylasResponse.ok) {
      return NextResponse.json({ 
        enabled: member.notetaker || false,
        synced: false,
        reason: `Nylas error: ${nylasResponse.status}`
      });
    }

    const calendarData = await nylasResponse.json();
    const hasNotetakerRules = !!(calendarData.data?.notetaker?.rules);

    return NextResponse.json({
      enabled: hasNotetakerRules,
      synced: hasNotetakerRules === (member.notetaker || false),
      localFlag: member.notetaker || false,
      nylasConfig: calendarData.data?.notetaker || null
    });

  } catch (error: any) {
    console.error('[API/Nylas/CalendarSync] GET Exception:', error);
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}
