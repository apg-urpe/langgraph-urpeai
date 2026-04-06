import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Verify Team Invitation by Token (Public Endpoint)
 * 
 * Uses service_role_key to bypass RLS since the invited user
 * may not have an authenticated session yet.
 * 
 * This solves the core issue: RLS on wp_team_invitations requires
 * auth_uid linked to wp_team_humano, but the invitee doesn't have
 * that linkage yet when they first open the invite link.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token');

    if (!token) {
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      );
    }

    // Validate UUID format
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(token)) {
      return NextResponse.json(
        { error: 'Invalid token format' },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[Invite Verify] Missing Supabase credentials');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data, error } = await supabase
      .from('wp_team_invitations')
      .select(`
        *,
        inviter:invited_by(nombre, apellido),
        empresa:empresa_id(nombre)
      `)
      .eq('token', token)
      .maybeSingle();

    if (error) {
      console.error('[Invite Verify] DB error:', error.code, error.message);
      return NextResponse.json(
        { error: 'Error verifying invitation' },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Invitation not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    // Return invitation data (strip sensitive fields)
    return NextResponse.json({
      success: true,
      invitation: {
        id: data.id,
        token: data.token,
        email: data.email,
        rol: data.rol,
        role_id: data.role_id,
        empresa_id: data.empresa_id,
        invited_by: data.invited_by,
        status: data.status,
        created_at: data.created_at,
        expires_at: data.expires_at,
        accepted_at: data.accepted_at,
        team_member_id: data.team_member_id,
        inviter: data.inviter,
        empresa: data.empresa,
      }
    });

  } catch (error: any) {
    console.error('[Invite Verify] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
