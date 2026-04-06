import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Nylas OAuth Callback Endpoint
 * 
 * Maneja el callback de Nylas después de la autorización OAuth.
 * Intercambia el código por tokens y guarda el grant_id en la base de datos.
 */

const NYLAS_CLIENT_ID = process.env.NYLAS_CLIENT_ID || process.env.NEXT_PUBLIC_NYLAS_CLIENT_ID;
const NYLAS_API_KEY = process.env.NYLAS_API_KEY;
const NYLAS_API_URI = process.env.NYLAS_API_URI || 'https://api.us.nylas.com';

// Crear cliente de Supabase con service role para actualizar wp_team_humano
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  
  // Parámetros del callback
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  // Construir redirect_uri (debe coincidir con el usado en /auth)
  const host = request.headers.get('host') || 'localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const baseUrl = `${protocol}://${host}`;

  // Manejar errores de OAuth
  if (error) {
    console.error('[Nylas/Callback] OAuth error:', error, errorDescription);
    const errorUrl = new URL('/admin', baseUrl);
    errorUrl.searchParams.set('nylas_error', errorDescription || error);
    return NextResponse.redirect(errorUrl.toString());
  }

  if (!code || !state) {
    console.error('[Nylas/Callback] Missing code or state');
    const errorUrl = new URL('/admin', baseUrl);
    errorUrl.searchParams.set('nylas_error', 'Missing authorization code');
    return NextResponse.redirect(errorUrl.toString());
  }

  // Decodificar state para obtener team_member_id y redirect_after
  let stateData: { team_member_id: string; redirect_after: string };
  try {
    stateData = JSON.parse(Buffer.from(state, 'base64url').toString());
  } catch (e) {
    console.error('[Nylas/Callback] Invalid state:', e);
    const errorUrl = new URL('/admin', baseUrl);
    errorUrl.searchParams.set('nylas_error', 'Invalid state parameter');
    return NextResponse.redirect(errorUrl.toString());
  }

  const { team_member_id, redirect_after } = stateData;

  if (!NYLAS_CLIENT_ID || !NYLAS_API_KEY) {
    console.error('[Nylas/Callback] Missing Nylas credentials');
    const errorUrl = new URL(redirect_after || '/admin', baseUrl);
    errorUrl.searchParams.set('nylas_error', 'Server configuration error');
    return NextResponse.redirect(errorUrl.toString());
  }

  try {
    // Intercambiar código por tokens
    const tokenUrl = `${NYLAS_API_URI}/v3/connect/token`;
    // Must match the redirect_uri used in /api/nylas/auth AND the Nylas Dashboard
    const redirectUri = process.env.NYLAS_CALLBACK_URL || `${baseUrl}/api/nylas/callback`;

    console.log(`[Nylas/Callback] Exchanging code for tokens...`);

    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: NYLAS_CLIENT_ID,
        client_secret: NYLAS_API_KEY,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri,
        code_verifier: 'nylas' // Nylas API Key method: fixed verifier per docs
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('[Nylas/Callback] Token exchange failed:', tokenResponse.status, errorText);
      const errorUrl = new URL(redirect_after || '/admin', baseUrl);
      errorUrl.searchParams.set('nylas_error', 'Failed to exchange authorization code');
      return NextResponse.redirect(errorUrl.toString());
    }

    const tokenData = await tokenResponse.json();
    const { grant_id, email } = tokenData;

    if (!grant_id) {
      console.error('[Nylas/Callback] No grant_id in response:', tokenData);
      const errorUrl = new URL(redirect_after || '/admin', baseUrl);
      errorUrl.searchParams.set('nylas_error', 'No grant ID received');
      return NextResponse.redirect(errorUrl.toString());
    }

    console.log(`[Nylas/Callback] Got grant_id: ${grant_id} for email: ${email}`);

    // Actualizar wp_team_humano con el nuevo grant_id
    const { error: updateError } = await supabaseAdmin
      .from('wp_team_humano')
      .update({ 
        grant_id: grant_id,
        updated_at: new Date().toISOString()
      })
      .eq('id', team_member_id);

    if (updateError) {
      console.error('[Nylas/Callback] Failed to update team member:', updateError);
      const errorUrl = new URL(redirect_after || '/admin', baseUrl);
      errorUrl.searchParams.set('nylas_error', 'Failed to save grant ID');
      return NextResponse.redirect(errorUrl.toString());
    }

    console.log(`[Nylas/Callback] Successfully updated team_member ${team_member_id} with grant_id`);

    // Redirigir al usuario con éxito
    const successUrl = new URL(redirect_after || '/admin', baseUrl);
    successUrl.searchParams.set('nylas_success', 'true');
    successUrl.searchParams.set('nylas_email', email || '');
    return NextResponse.redirect(successUrl.toString());

  } catch (error: any) {
    console.error('[Nylas/Callback] Exception:', error);
    const errorUrl = new URL(redirect_after || '/admin', baseUrl);
    errorUrl.searchParams.set('nylas_error', error.message || 'Unknown error');
    return NextResponse.redirect(errorUrl.toString());
  }
}
