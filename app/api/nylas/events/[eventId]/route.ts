import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { verifyActiveTeamMember, createSupabaseAdmin } from '@/lib/auth-security';

export const dynamic = 'force-dynamic';

const NYLAS_API_KEY = process.env.NYLAS_API_KEY;
const NYLAS_API_URI = process.env.NYLAS_API_URI || 'https://api.us.nylas.com';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

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
  }

  return { user: null, error: cookieError || sessionError || new Error('No valid authentication found') };
}

async function resolveSecureGrantId(req: NextRequest) {
  const { user, error: authError } = await getAuthUser(req);
  if (!user || authError) {
    return { errorResponse: NextResponse.json({ error: 'No autorizado. Inicia sesión.' }, { status: 401 }) };
  }

  const securityCheck = await verifyActiveTeamMember(createSupabaseAdmin(), user.id, user.email);
  if (!securityCheck.success || !securityCheck.teamMember) {
    return {
      errorResponse: NextResponse.json(
        { error: securityCheck.error?.message || 'Acceso denegado' },
        { status: securityCheck.error?.httpStatus || 403 }
      )
    };
  }

  const currentUser = securityCheck.teamMember;
  const { data: dbMember, error: memberError } = await supabaseAdmin
    .from('wp_team_humano')
    .select('grant_id')
    .eq('id', currentUser.id)
    .single();

  if (memberError || !dbMember?.grant_id) {
    return {
      errorResponse: NextResponse.json({
        error: 'No tienes un calendario conectado. Ve a Configuración > Integraciones.',
        code: 'NO_CALENDAR_CONNECTED'
      }, { status: 400 })
    };
  }

  return { grantId: dbMember.grant_id };
}

async function handleNylasError(response: Response, fallbackMessage: string) {
  const errorText = await response.text();

  if (response.status === 404) {
    return NextResponse.json({
      error: 'Evento no encontrado o conexión expirada',
      code: 'NOT_FOUND_OR_EXPIRED',
      details: errorText
    }, { status: 404 });
  }

  if (response.status === 401) {
    return NextResponse.json({
      error: 'API Key inválida',
      code: 'INVALID_API_KEY',
      details: errorText
    }, { status: 401 });
  }

  return NextResponse.json({
    error: fallbackMessage,
    code: 'NYLAS_EVENT_ERROR',
    details: errorText
  }, { status: response.status });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  if (!NYLAS_API_KEY) {
    return NextResponse.json({ error: 'Nylas API Key not configured' }, { status: 500 });
  }

  const secure = await resolveSecureGrantId(req);
  if ('errorResponse' in secure) return secure.errorResponse;

  const { eventId } = await params;
  const { searchParams } = new URL(req.url);
  const calendarId = searchParams.get('calendar_id') || 'primary';

  const nylasUrl = `${NYLAS_API_URI}/v3/grants/${secure.grantId}/events/${encodeURIComponent(eventId)}?calendar_id=${encodeURIComponent(calendarId)}`;
  const response = await fetch(nylasUrl, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${NYLAS_API_KEY}`,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    return handleNylasError(response, 'Error al obtener evento del calendario');
  }

  const data = await response.json();
  return NextResponse.json(data);
}

 async function resolveGrantIdForAppointment(
   currentUser: { role_id: number; empresa_id: number },
   appointmentId: number
 ) {
   const { data: appointment, error: appointmentError } = await supabaseAdmin
     .from('wp_citas')
     .select('id, team_humano_id')
     .eq('id', appointmentId)
     .single();

   if (appointmentError || !appointment) {
     return { errorResponse: NextResponse.json({ error: 'Cita no encontrada' }, { status: 404 }) };
   }

   if (!appointment.team_humano_id) {
     return { errorResponse: NextResponse.json({ error: 'La cita no tiene un asesor asignado' }, { status: 400 }) };
   }

   const { data: targetMember, error: targetMemberError } = await supabaseAdmin
     .from('wp_team_humano')
     .select('grant_id, empresa_id')
     .eq('id', appointment.team_humano_id)
     .single();

   if (targetMemberError || !targetMember) {
     return { errorResponse: NextResponse.json({ error: 'No se encontró el dueño de la cita' }, { status: 404 }) };
   }

   if (currentUser.role_id !== 1 && currentUser.empresa_id !== targetMember.empresa_id) {
     return {
       errorResponse: NextResponse.json({
         error: 'No puedes modificar citas de otra empresa',
         code: 'CROSS_ENTERPRISE'
       }, { status: 403 })
     };
   }

   if (!targetMember.grant_id) {
     return {
       errorResponse: NextResponse.json({
         error: 'El asesor dueño de la cita no tiene calendario conectado',
         code: 'NO_CALENDAR_CONNECTED'
       }, { status: 400 })
     };
   }

   return { grantId: targetMember.grant_id };
 }

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  if (!NYLAS_API_KEY) {
    return NextResponse.json({ error: 'Nylas API Key not configured' }, { status: 500 });
  }

  const { eventId } = await params;
  const body = await req.json();
  const calendarId = body?.calendar_id || 'primary';
  const { user, error: authError } = await getAuthUser(req);

  if (!user || authError) {
    return NextResponse.json({ error: 'No autorizado. Inicia sesión.' }, { status: 401 });
  }

  const securityCheck = await verifyActiveTeamMember(createSupabaseAdmin(), user.id, user.email);
  if (!securityCheck.success || !securityCheck.teamMember) {
    return NextResponse.json(
      { error: securityCheck.error?.message || 'Acceso denegado' },
      { status: securityCheck.error?.httpStatus || 403 }
    );
  }

  const currentUser = securityCheck.teamMember;
  let grantId: string | null = null;

  if (body?.appointment_id) {
    const normalizedAppointmentId = typeof body.appointment_id === 'string'
      ? parseInt(body.appointment_id, 10)
      : body.appointment_id;

    if (!Number.isFinite(normalizedAppointmentId)) {
      return NextResponse.json({ error: 'appointment_id inválido' }, { status: 400 });
    }

    const resolvedGrant = await resolveGrantIdForAppointment(currentUser, normalizedAppointmentId);
    if ('errorResponse' in resolvedGrant) {
      return resolvedGrant.errorResponse;
    }

    grantId = resolvedGrant.grantId;
  }

  if (!grantId) {
    const secure = await resolveSecureGrantId(req);
    if ('errorResponse' in secure) return secure.errorResponse;
    grantId = secure.grantId;
  }

  const { appointment_id, calendar_id: _calendarId, event, ...payload } = body || {};
  const eventPayload = event || payload || {};

  const nylasUrl = `${NYLAS_API_URI}/v3/grants/${grantId}/events/${encodeURIComponent(eventId)}?calendar_id=${encodeURIComponent(calendarId)}`;
  const response = await fetch(nylasUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${NYLAS_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(eventPayload),
  });

  if (!response.ok) {
    return handleNylasError(response, 'Error al actualizar evento del calendario');
  }

  const data = await response.json();
  return NextResponse.json(data);
}

/**
 * DELETE /api/nylas/events/[eventId]
 * Elimina un evento del calendario de Nylas
 * 
 * Query params:
 * - calendar_id: ID del calendario (default: 'primary')
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  if (!NYLAS_API_KEY) {
    return NextResponse.json({ error: 'Nylas API Key not configured' }, { status: 500 });
  }

  try {
    const { eventId } = await params;
    const { searchParams } = new URL(req.url);
    const calendarId = searchParams.get('calendar_id') || 'primary';
    const appointmentIdParam = searchParams.get('appointment_id');
    let grantId: string;

    if (!eventId) {
      return NextResponse.json({ error: 'Missing eventId parameter' }, { status: 400 });
    }

    if (appointmentIdParam) {
      const normalizedAppointmentId = parseInt(appointmentIdParam, 10);
      if (!Number.isFinite(normalizedAppointmentId)) {
        return NextResponse.json({ error: 'appointment_id inválido' }, { status: 400 });
      }

      const { user, error: authError } = await getAuthUser(req);
      if (!user || authError) {
        return NextResponse.json({ error: 'No autorizado. Inicia sesión.' }, { status: 401 });
      }

      const securityCheck = await verifyActiveTeamMember(createSupabaseAdmin(), user.id, user.email);
      if (!securityCheck.success || !securityCheck.teamMember) {
        return NextResponse.json(
          { error: securityCheck.error?.message || 'Acceso denegado' },
          { status: securityCheck.error?.httpStatus || 403 }
        );
      }

      const resolvedGrant = await resolveGrantIdForAppointment(securityCheck.teamMember, normalizedAppointmentId);
      if ('errorResponse' in resolvedGrant) {
        return resolvedGrant.errorResponse;
      }

      grantId = resolvedGrant.grantId;
    } else {
      const secure = await resolveSecureGrantId(req);
      if ('errorResponse' in secure) return secure.errorResponse;
      grantId = secure.grantId;
    }

    const nylasUrl = `${NYLAS_API_URI}/v3/grants/${grantId}/events/${eventId}?calendar_id=${calendarId}`;

    console.log(`[API/Nylas/Events] Deleting event: ${eventId} from secure grant`);

    const response = await fetch(nylasUrl, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${NYLAS_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[API/Nylas/Events] ❌ Failed to delete event: ${response.status} ${errorText}`);

      // Handle specific error codes
      if (response.status === 404) {
        // Event already deleted or doesn't exist - treat as success
        console.log(`[API/Nylas/Events] Event ${eventId} not found in Nylas (possibly already deleted)`);
        return NextResponse.json({ 
          success: true, 
          message: 'Event not found in calendar (already deleted or never synced)',
          already_deleted: true 
        });
      }

      if (response.status === 401) {
        return NextResponse.json({ 
          error: 'API Key inválida', 
          code: 'INVALID_API_KEY'
        }, { status: 401 });
      }

      return NextResponse.json({ 
        error: `Error al eliminar evento del calendario: ${response.status}`,
        details: errorText,
        code: 'NYLAS_DELETE_FAILED'
      }, { status: response.status });
    }

    console.log(`[API/Nylas/Events] ✅ Event deleted from Nylas: ${eventId}`);

    return NextResponse.json({
      success: true,
      message: 'Event deleted from calendar',
      eventId
    });

  } catch (error: any) {
    console.error('[API/Nylas/Events] Exception in DELETE:', error);
    return NextResponse.json({ 
      error: 'Internal server error', 
      details: error.message 
    }, { status: 500 });
  }
}
