import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { verifyActiveTeamMember, createSupabaseAdmin } from '@/lib/auth-security';

export const dynamic = 'force-dynamic';

/**
 * Nylas Disconnect Endpoint
 * 
 * Desconecta el grant de Nylas de un miembro del equipo.
 * Elimina el grant en Nylas y limpia los campos en la base de datos.
 */

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

  const { data: { user: cookieUser }, error: cookieError } = await cookieSupabase.auth.getUser();
  if (cookieUser && !cookieError) return { user: cookieUser, error: null };

  const { data: { session }, error: sessionError } = await cookieSupabase.auth.getSession();
  if (session?.user && !sessionError) {
    console.log('[API/Nylas/Disconnect] Auth recovered via getSession refresh');
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
    console.warn('[API/Nylas/Disconnect] Bearer token invalid:', tokenError?.message);
  }

  console.warn('[API/Nylas/Disconnect] All auth methods failed.');
  return { user: null, error: cookieError || sessionError || new Error('No valid authentication found') };
}

/**
 * POST /api/nylas/disconnect
 * 
 * Body: { team_member_id: number }
 * 
 * 1. Verifica autenticación y permisos
 * 2. Llama DELETE /v3/grants/{grant_id} en Nylas
 * 3. Limpia grant_id, notetaker, temporal_nylas en wp_team_humano
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
    const { team_member_id } = body;

    if (!team_member_id) {
      return NextResponse.json({ 
        error: 'Se requiere team_member_id',
        code: 'INVALID_PARAMS'
      }, { status: 400 });
    }

    // --- Obtener datos del miembro objetivo ---
    const { data: targetMember, error: memberError } = await supabaseAdmin
      .from('wp_team_humano')
      .select('id, grant_id, nombre, apellido, empresa_id, notetaker')
      .eq('id', team_member_id)
      .single();

    if (memberError || !targetMember) {
      return NextResponse.json({ error: 'Miembro del equipo no encontrado' }, { status: 404 });
    }

    // --- Verificar permisos ---
    // Role 1 puede cross-enterprise; roles 2-3 solo su empresa; role >= 4 solo a sí mismo
    const isSelf = currentUser.id === targetMember.id;
    const isSameEnterprise = currentUser.empresa_id === targetMember.empresa_id;
    const isHighRole = currentUser.role_id && currentUser.role_id <= 3;

    if (currentUser.role_id !== 1) {
      if (!isSameEnterprise) {
        return NextResponse.json({ 
          error: 'No puedes desconectar miembros de otra empresa',
          code: 'CROSS_ENTERPRISE'
        }, { status: 403 });
      }
      if (!isHighRole && !isSelf) {
        return NextResponse.json({ 
          error: 'No tienes permisos para desconectar a otro miembro',
          code: 'INSUFFICIENT_PERMISSIONS'
        }, { status: 403 });
      }
    }

    // --- Eliminar grant en Nylas (si existe un grant_id válido) ---
    let nylasDeleted = false;
    if (targetMember.grant_id && targetMember.grant_id !== 'Solicitud enviada') {
      try {
        const nylasUrl = `${NYLAS_API_URI}/v3/grants/${targetMember.grant_id}`;
        console.log(`[API/Nylas/Disconnect] Deleting grant ${targetMember.grant_id} for member ${team_member_id}`);

        const nylasResponse = await fetch(nylasUrl, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${NYLAS_API_KEY}`,
            'Accept': 'application/json',
          },
        });

        if (nylasResponse.ok || nylasResponse.status === 404) {
          // 200 = deleted, 404 = already gone — both are fine
          nylasDeleted = true;
          console.log(`[API/Nylas/Disconnect] ✅ Grant deleted in Nylas (status: ${nylasResponse.status})`);
        } else {
          const errorText = await nylasResponse.text();
          console.error(`[API/Nylas/Disconnect] ⚠️ Nylas DELETE failed: ${nylasResponse.status} ${errorText}`);
          // Continue anyway — we still want to clean up the DB
        }
      } catch (nylasError: any) {
        console.error(`[API/Nylas/Disconnect] ⚠️ Nylas DELETE exception:`, nylasError.message);
        // Continue — clean up DB regardless
      }
    } else {
      // No valid grant_id or legacy value — just clean DB
      nylasDeleted = true;
    }

    // --- Limpiar campos en BD ---
    const { error: updateError } = await supabaseAdmin
      .from('wp_team_humano')
      .update({ 
        grant_id: null,
        notetaker: false,
        temporal_nylas: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', team_member_id);

    if (updateError) {
      console.error(`[API/Nylas/Disconnect] ❌ DB update failed:`, updateError);
      return NextResponse.json({ 
        error: 'Error al actualizar la base de datos',
        details: updateError.message
      }, { status: 500 });
    }

    console.log(`[API/Nylas/Disconnect] ✅ Member ${team_member_id} disconnected. Nylas deleted: ${nylasDeleted}`);

    return NextResponse.json({
      success: true,
      nylasDeleted,
      message: 'Cuenta desconectada exitosamente. El miembro deberá reconectar para usar calendario y email.'
    });

  } catch (error: any) {
    console.error('[API/Nylas/Disconnect] Exception:', error);
    return NextResponse.json({ 
      error: 'Error interno del servidor', 
      details: error.message 
    }, { status: 500 });
  }
}
