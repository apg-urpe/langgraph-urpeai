import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Auth Callback Handler
 * 
 * This route handles the Magic Link callback from Supabase.
 * When a user clicks the magic link in their email, they are redirected here.
 * 
 * Flow:
 * 1. User clicks magic link → arrives at /auth/callback?token_hash=xxx&type=email
 * 2. This handler exchanges the token for a session
 * 3. Redirects user to the main app (authenticated)
 * 
 * SECURITY:
 * - No hardcoded credentials - requires env vars
 * - Validates redirect target to prevent open redirect attacks
 */

/**
 * Validates that the redirect path is safe (relative path only)
 * Prevents open redirect attacks via protocol-relative URLs (//evil.com)
 */
function getSafeRedirectPath(next: string | null): string {
  if (!next) return '/';
  
  // Must start with / and not be protocol-relative (//)
  if (!next.startsWith('/') || next.startsWith('//')) {
    return '/';
  }
  
  // Additional check: no protocol in the path
  if (next.includes('://')) {
    return '/';
  }
  
  return next;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const token_hash = requestUrl.searchParams.get('token_hash');
  const type = requestUrl.searchParams.get('type') as 'email' | 'magiclink' | null;
  const next = getSafeRedirectPath(requestUrl.searchParams.get('next'));

  // If we have a token, verify it with Supabase
  if (token_hash && type) {
    // SECURITY: No hardcoded credentials - fail securely if missing
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('[Auth Callback] Missing Supabase credentials in environment');
      return new NextResponse('Server configuration error', { status: 500 });
    }
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        flowType: 'pkce',
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      }
    });

    const { data, error } = await supabase.auth.verifyOtp({
      token_hash,
      type: type === 'email' ? 'email' : 'magiclink',
    });

    if (!error && data.session) {
      // Successfully verified - redirect to app
      // The session will be picked up by the client-side auth
      const redirectUrl = new URL(next, requestUrl.origin);
      
      // Pass the session tokens to the client via URL fragment (secure)
      redirectUrl.hash = `access_token=${data.session.access_token}&refresh_token=${data.session.refresh_token}&type=bearer`;
      
      return NextResponse.redirect(redirectUrl);
    }

    // If verification failed, redirect to login with error
    console.error('[Auth Callback] Verification failed:', error?.message);
    const errorUrl = new URL('/', requestUrl.origin);
    errorUrl.searchParams.set('error', 'auth_failed');
    return NextResponse.redirect(errorUrl);
  }

  // No token provided, redirect to home
  return NextResponse.redirect(new URL('/', requestUrl.origin));
}
