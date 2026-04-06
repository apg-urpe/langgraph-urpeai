import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Accept Team Invitation (Public Endpoint)
 * 
 * Uses service_role_key to call the RPC accept_team_invitation_v2
 * which is SECURITY DEFINER but needs proper authentication context.
 * 
 * By calling from server-side with service_role, we bypass RLS issues
 * that occur when the invitee has no session or unlinked auth_uid.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, nombre, apellido, telefono, auth_uid } = body;

    // Validate required fields
    if (!token || !nombre || !apellido) {
      return NextResponse.json(
        { error: 'Token, nombre, and apellido are required' },
        { status: 400 }
      );
    }

    // Validate token format
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(token)) {
      return NextResponse.json(
        { error: 'Invalid token format' },
        { status: 400 }
      );
    }

    // Validate auth_uid format if provided
    if (auth_uid && !UUID_REGEX.test(auth_uid)) {
      return NextResponse.json(
        { error: 'Invalid auth_uid format' },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[Invite Accept] Missing Supabase credentials');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    console.log('[Invite Accept] Accepting invitation:', {
      token: token.substring(0, 8) + '...',
      nombre: nombre.trim(),
      hasAuthUid: !!auth_uid
    });

    // Call the RPC with service_role (bypasses all RLS)
    const { data, error } = await supabase.rpc('accept_team_invitation_v2', {
      p_token: token,
      p_nombre: nombre.trim(),
      p_apellido: apellido.trim(),
      p_telefono: telefono?.trim() || null,
      p_auth_uid: auth_uid || null
    });

    if (error) {
      console.error('[Invite Accept] RPC error:', {
        code: error.code,
        message: error.message,
        details: error.details
      });

      // Map specific errors
      if (error.code === 'PGRST202' || error.message?.includes('not found')) {
        return NextResponse.json(
          { 
            success: false, 
            message: 'La función de invitaciones no está configurada. Contacta al administrador.' 
          },
          { status: 500 }
        );
      }

      return NextResponse.json(
        { success: false, message: error.message || 'Error processing invitation' },
        { status: 500 }
      );
    }

    // RPC returns array, get first row
    const result = Array.isArray(data) ? data[0] : data;

    if (!result) {
      return NextResponse.json(
        { success: false, message: 'No response from invitation processor' },
        { status: 500 }
      );
    }

    console.log('[Invite Accept] Result:', {
      success: result.success,
      member_id: result.member_id,
      empresa_id: result.empresa_id,
      message: result.message
    });

    const statusCode = result.success ? 200 : 400;
    return NextResponse.json(result, { status: statusCode });

  } catch (error: any) {
    console.error('[Invite Accept] Unexpected error:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}
