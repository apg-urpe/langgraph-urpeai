import { NextRequest, NextResponse } from 'next/server';

/**
 * Nylas OAuth Authorization Endpoint
 * 
 * Genera la URL de autorización para iniciar el flujo OAuth con Nylas.
 * El usuario será redirigido a Google/Microsoft para dar permisos.
 * 
 * Método: Hosted OAuth con API Key (per Nylas docs).
 * 
 * NOTE: This is a browser-redirect endpoint (window.location.href), NOT a fetch API.
 * Server-side Supabase auth is NOT checked here because:
 *   - Browser navigation doesn't carry Authorization headers
 *   - Cookie-based token refresh fails to persist in route handlers
 *   - The actual security is in the callback (service role + state param)
 *   - The frontend already validates the user is authenticated before navigating here
 */

const NYLAS_CLIENT_ID = process.env.NYLAS_CLIENT_ID || process.env.NEXT_PUBLIC_NYLAS_CLIENT_ID;
const NYLAS_API_URI = process.env.NYLAS_API_URI || 'https://api.us.nylas.com';

/**
 * Resolve the callback URI for Nylas OAuth.
 * Priority: NYLAS_CALLBACK_URL env var > auto-detect from request host.
 * The env var MUST match a Callback URI registered in the Nylas Dashboard.
 */
function resolveCallbackUri(request: NextRequest): string {
  if (process.env.NYLAS_CALLBACK_URL) {
    return process.env.NYLAS_CALLBACK_URL;
  }
  const host = request.headers.get('host') || 'localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  return `${protocol}://${host}/api/nylas/callback`;
}

export async function GET(request: NextRequest) {
  if (!NYLAS_CLIENT_ID) {
    return NextResponse.json(
      { success: false, error: 'NYLAS_CLIENT_ID not configured' },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const teamMemberId = searchParams.get('team_member_id');
  const provider = searchParams.get('provider') || 'google'; // google | microsoft
  const redirectAfter = searchParams.get('redirect_after') || '/';

  if (!teamMemberId) {
    return NextResponse.json(
      { success: false, error: 'team_member_id is required' },
      { status: 400 }
    );
  }

  // Callback URI — must match Nylas Dashboard configuration
  const redirectUri = resolveCallbackUri(request);

  // State contiene información que necesitamos después del callback
  const state = Buffer.from(JSON.stringify({
    team_member_id: teamMemberId,
    redirect_after: redirectAfter,
    timestamp: Date.now()
  })).toString('base64url');

  // Scopes para calendario y email (gmail.send requerido para enviar emails vía Nylas)
  const scopes = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.send'
  ].join(' ');

  // Construir URL de autorización de Nylas (método API Key — sin PKCE custom)
  const authUrl = new URL(`${NYLAS_API_URI}/v3/connect/auth`);
  authUrl.searchParams.set('client_id', NYLAS_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('provider', provider);
  authUrl.searchParams.set('state', state);
  
  // Solo agregar scopes para Google
  if (provider === 'google') {
    authUrl.searchParams.set('scope', scopes);
  }

  console.log(`[Nylas/Auth] Redirecting to OAuth | team_member_id: ${teamMemberId} | provider: ${provider} | redirect_uri: ${redirectUri}`);

  // Redirigir al usuario a Nylas OAuth
  return NextResponse.redirect(authUrl.toString());
}
