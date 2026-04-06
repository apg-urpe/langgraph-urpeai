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
    console.log('[API/Nylas/Events] Auth recovered via getSession refresh');
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
    console.warn('[API/Nylas/Events] Bearer token invalid:', tokenError?.message);
  }

  console.warn('[API/Nylas/Events] All auth methods failed. Cookie error:', cookieError?.message, '| Session error:', sessionError?.message);
  return { user: null, error: cookieError || sessionError || new Error('No valid authentication found') };
}

export async function GET(req: NextRequest) {
  if (!NYLAS_API_KEY) {
    return NextResponse.json({ error: 'Nylas API Key not configured' }, { status: 500 });
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

  const { searchParams } = new URL(req.url);
  const start = searchParams.get('start');
  const end = searchParams.get('end');
  const calendarId = searchParams.get('calendar_id') || 'primary';

  const currentUser = securityCheck.teamMember;

  const { data: dbMember, error: memberError } = await supabaseAdmin
    .from('wp_team_humano')
    .select('grant_id')
    .eq('id', currentUser.id)
    .single();

  if (memberError || !dbMember?.grant_id) {
    return NextResponse.json({
      error: 'No tienes un calendario conectado. Ve a Configuración > Integraciones.',
      code: 'NO_CALENDAR_CONNECTED'
    }, { status: 400 });
  }

  const grantId = dbMember.grant_id;

  const apiKey = process.env.NYLAS_API_KEY;
  const apiUri = process.env.NYLAS_API_URI || 'https://api.us.nylas.com';

  if (!apiKey) {
    return NextResponse.json({ error: 'Server configuration error: Missing NYLAS_API_KEY' }, { status: 500 });
  }

  try {
    // Construct Nylas API URL for V3
    // https://developer.nylas.com/docs/v3/calendar/events/list-events/
    const url = new URL(`${apiUri}/v3/grants/${grantId}/events`);
    url.searchParams.set('calendar_id', calendarId);
    if (start) url.searchParams.set('start', Math.floor(new Date(start).getTime() / 1000).toString());
    if (end) url.searchParams.set('end', Math.floor(new Date(end).getTime() / 1000).toString());
    url.searchParams.set('limit', '100'); // Reasonable limit for a view

    console.log(`[API/Nylas] Fetching events from: ${url.toString()}`);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[API/Nylas] Error response:', response.status, errorText);
      
      // Handle specific error codes with user-friendly messages
      if (response.status === 404) {
        return NextResponse.json({ 
          error: 'Grant inválido o expirado', 
          details: 'El grant_id no existe en Nylas. El usuario debe reconectar su cuenta.',
          code: 'INVALID_GRANT'
        }, { status: 404 });
      }
      
      if (response.status === 401) {
        return NextResponse.json({ 
          error: 'API Key inválida', 
          details: 'Verificar NYLAS_API_KEY en variables de entorno.',
          code: 'INVALID_API_KEY'
        }, { status: 401 });
      }
      
      return NextResponse.json({ error: `Nylas API Error: ${response.status}`, details: errorText }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[API/Nylas] Exception:', error);
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}

/**
 * POST /api/nylas/events
 * Crea un evento en Nylas y sincroniza con wp_citas
 */
export async function POST(req: NextRequest) {
  if (!NYLAS_API_KEY) {
    return NextResponse.json({ error: 'Nylas API Key not configured' }, { status: 500 });
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

  try {
    const body = await req.json();
    const { 
      titulo, 
      descripcion, 
      fecha_inicio, 
      fecha_fin, 
      contacto_id, 
      team_humano_id, 
      empresa_id,
      metadata = {},
      tipo = 'videollamada',
      location = '',
      invitados_ids = []
    } = body;

    if (!titulo || !fecha_inicio || !fecha_fin || !team_humano_id || !empresa_id) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 1. Obtener grant_id del Team Member
    const { data: teamMember, error: memberError } = await supabaseAdmin
      .from('wp_team_humano')
      .select('grant_id, email, nombre, apellido, empresa_id')
      .eq('id', team_humano_id)
      .single();

    if (memberError || !teamMember) {
      return NextResponse.json({ error: 'Team member not found or error fetching' }, { status: 404 });
    }

    // 1.1 Obtener email del contacto si existe
    let contactoEmail = null;
    let contactoNombre = null;
    if (contacto_id) {
      const { data: contact, error: contactError } = await supabaseAdmin
        .from('wp_contactos')
        .select('email, nombre, apellido')
        .eq('id', contacto_id)
        .single();
      
      if (!contactError && contact) {
        contactoEmail = contact.email;
        contactoNombre = `${contact.nombre || ''} ${contact.apellido || ''}`.trim();
      }
    }

    const currentUser = securityCheck.teamMember;
    if (currentUser.role_id !== 1 && currentUser.empresa_id !== teamMember.empresa_id) {
      return NextResponse.json({
        error: 'No puedes crear citas para miembros de otra empresa',
        code: 'CROSS_ENTERPRISE'
      }, { status: 403 });
    }

    // 2. Verificar que el team member tiene grant_id (conexión con calendario)
    if (!teamMember.grant_id) {
      return NextResponse.json({ 
        error: 'El miembro del equipo no tiene calendario conectado',
        details: 'Por favor conecta tu calendario en Configuración > Integraciones antes de agendar citas.',
        code: 'NO_CALENDAR_CONNECTED'
      }, { status: 400 });
    }

    // 3. PRIMERO: Crear evento en Nylas (calendario)
    // Si falla, NO guardamos en la base de datos
    const startTime = Math.floor(new Date(fecha_inicio).getTime() / 1000);
    const endTime = Math.floor(new Date(fecha_fin).getTime() / 1000);

    const nylasUrl = `${NYLAS_API_URI}/v3/grants/${teamMember.grant_id}/events?calendar_id=primary`;
    
    const nylasBody: any = {
      title: titulo,
      description: descripcion || '',
      when: {
        start_time: startTime,
        end_time: endTime,
      },
      location: location,
      busy: true,
      participants: []
    };

    // Agregar al anfitrión (team member) como participante
    if (teamMember.email) {
      nylasBody.participants.push({
        name: `${teamMember.nombre || ''} ${teamMember.apellido || ''}`.trim(),
        email: teamMember.email,
        status: 'yes' // El anfitrión siempre está confirmado
      });
    }

    // Agregar al contacto como participante si tiene email
    if (contactoEmail) {
      nylasBody.participants.push({
        name: contactoNombre || 'Invitado',
        email: contactoEmail
      });
    }

    // Agregar invitados del equipo como participantes de Nylas
    let invitedMembers: { id: number; email: string; nombre: string; apellido: string }[] = [];
    if (Array.isArray(invitados_ids) && invitados_ids.length > 0) {
      const validIds = invitados_ids.filter((id: number) => id !== team_humano_id);
      if (validIds.length > 0) {
        const { data: members } = await supabaseAdmin
          .from('wp_team_humano')
          .select('id, email, nombre, apellido')
          .in('id', validIds)
          .eq('empresa_id', empresa_id)
          .eq('is_active', true);

        if (members && members.length > 0) {
          invitedMembers = members;
          for (const m of members) {
            if (m.email) {
              nylasBody.participants.push({
                name: `${m.nombre || ''} ${m.apellido || ''}`.trim() || 'Invitado',
                email: m.email
              });
            }
          }
        }
      }
    }

    // Añadir conferencia si es videollamada
    // Nylas V3 structure for Google Meet
    if (tipo === 'videollamada') {
      nylasBody.conferencing = {
        provider: 'Google Meet',
        autocreate: {}
      };
    }

    console.log(`[API/Nylas/Events] Creating event in Nylas for grant: ${teamMember.grant_id}`);

    const nylasResponse = await fetch(nylasUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NYLAS_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(nylasBody),
    });

    // Si Nylas falla, retornar error - NO guardar en DB
    if (!nylasResponse.ok) {
      const errorText = await nylasResponse.text();
      console.error(`[API/Nylas/Events] ❌ Failed to create in Nylas: ${nylasResponse.status} ${errorText}`);
      
      // Parse error for user-friendly message
      let userMessage = 'Error al crear evento en el calendario';
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error?.message) {
          userMessage = errorJson.error.message;
        }
      } catch {}
      
      return NextResponse.json({ 
        error: userMessage,
        details: `Nylas API Error: ${nylasResponse.status}`,
        code: 'NYLAS_CREATE_FAILED'
      }, { status: nylasResponse.status });
    }

    const nylasData = await nylasResponse.json();
    const nylasEvent = nylasData.data;
    const nylasEventId = nylasEvent.id;
    const nylasIcalUid = nylasEvent.ical_uid || null;
    const conferencing = nylasEvent.conferencing;
    const nylasParticipants = Array.isArray(nylasEvent.participants) ? nylasEvent.participants : nylasBody.participants;

    console.log(`[API/Nylas/Events] ✅ Event created in Nylas: ${nylasEventId}`);

    const startDate = new Date(fecha_inicio);
    const endDate = new Date(fecha_fin);
    const durationMinutes = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60));

    const appointmentData = {
      empresa_id,
      contacto_id: contacto_id || null,
      team_humano_id,
      event_id: nylasEventId,
      titulo,
      descripcion: descripcion || null,
      fecha_hora: fecha_inicio,
      duracion: durationMinutes || 30,
      estado: 'pendiente',
      ubicacion: location || null,
      metadata: {
        ...metadata,
        nylas_event_id: nylasEventId,
        nylas_ical_uid: nylasIcalUid,
        nylas_grant_id: teamMember.grant_id,
        nylas_event_ids: {
          [String(team_humano_id)]: nylasEventId
        },
        participants: Array.isArray(nylasParticipants)
          ? nylasParticipants.map((participant: any) => ({
              email: participant.email || null,
              name: participant.name || null,
              status: participant.status || null
            }))
          : [],
        organizer: nylasEvent.organizer || (teamMember.email ? {
          email: teamMember.email,
          name: `${teamMember.nombre || ''} ${teamMember.apellido || ''}`.trim() || null
        } : null),
        creator: nylasEvent.creator || null,
        conferencing: conferencing,
        created_via: 'dashboard_quick_schedule',
        tipo: tipo,
        fecha_fin: fecha_fin
      }
    };

    const { data: appointment, error: dbError } = await supabaseAdmin
      .from('wp_citas')
      .insert(appointmentData)
      .select()
      .single();

    if (dbError) {
      console.error('[API/Nylas/Events] DB Error:', dbError);
      return NextResponse.json({ error: 'Error saving to database', details: dbError.message }, { status: 500 });
    }

    if (invitedMembers.length > 0 && appointment) {
      const participantRows = invitedMembers.map(m => ({
        cita_id: appointment.id,
        team_humano_id: m.id,
        rol: 'equipo',
        estado_rsvp: 'pendiente',
        email: m.email || null,
        added_by: 'manual'
      }));

      const { error: partError } = await supabaseAdmin
        .from('wp_citas_participantes')
        .insert(participantRows);

      if (partError) {
        console.error('[API/Nylas/Events] ⚠️ Error inserting participants (non-blocking):', partError.message);
      } else {
        console.log(`[API/Nylas/Events] ✅ ${participantRows.length} participant(s) added to appointment ${appointment.id}`);
      }
    }

    return NextResponse.json({
      success: true,
      appointment,
      nylas_sync: !!nylasEventId
    });
  
  } catch (error: any) {
    console.error('[API/Nylas/Events] Exception:', error);
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}
