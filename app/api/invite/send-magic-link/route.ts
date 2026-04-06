import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Send Magic Link for Team Invitation
 * 
 * Este endpoint envía un Magic Link de Supabase al email del invitado.
 * Cuando el usuario hace clic, se autentica automáticamente y es redirigido
 * a la página de invitación para completar sus datos.
 * 
 * Flow:
 * 1. Admin crea invitación → Este endpoint envía Magic Link
 * 2. Usuario recibe email con Magic Link
 * 3. Click en Magic Link → /auth/callback?next=/invite/{token}
 * 4. Usuario autenticado → Completa datos en /invite/{token}
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, invitationToken, empresaNombre } = body;

    if (!email || !invitationToken) {
      return NextResponse.json(
        { error: 'Email and invitationToken are required' },
        { status: 400 }
      );
    }

    // Usar service role key para enviar el magic link
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    
    if (!supabaseServiceKey) {
      console.error('[Magic Link] Missing SUPABASE_SERVICE_ROLE_KEY');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Construir la URL de redirección después del Magic Link
    // Redirigir directamente a /invite/{token} — la página ya procesa tokens del hash fragment
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    const redirectTo = `${baseUrl}/invite/${invitationToken}`;

    console.log('[Magic Link] Sending to:', email, 'redirectTo:', redirectTo);

    // Enviar Magic Link usando signInWithOtp
    // shouldCreateUser: true permite crear el usuario si no existe
    const { data, error } = await supabase.auth.signInWithOtp({
      email: email.toLowerCase().trim(),
      options: {
        shouldCreateUser: true, // Crear usuario en auth.users si no existe
        emailRedirectTo: redirectTo,
        data: {
          invitation_token: invitationToken,
          empresa_nombre: empresaNombre || 'Urpe AI Lab'
        }
      }
    });

    if (error) {
      console.error('[Magic Link] Error sending:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    console.log('[Magic Link] Sent successfully to:', email);

    return NextResponse.json({
      success: true,
      message: 'Magic link enviado exitosamente',
      email: email
    });

  } catch (error: any) {
    console.error('[Magic Link] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
