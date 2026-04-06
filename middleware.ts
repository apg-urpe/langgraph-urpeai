import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Middleware de Next.js para autenticación con Supabase
 * 
 * Protege rutas automáticamente y maneja la sesión del usuario.
 * Se ejecuta en el Edge antes de que llegue la request al servidor.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  // Use fallback values matching lib/supabase.ts
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing Supabase environment variables in middleware');
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        // Update request cookies so downstream route handlers see fresh values
        request.cookies.set({ name, value, ...options });
        // Set on existing response — do NOT recreate response here,
        // otherwise previous Set-Cookie headers are lost when Supabase
        // refreshes multiple chunked session cookies.
        response.cookies.set({ name, value, ...options });
      },
      remove(name: string, options: CookieOptions) {
        request.cookies.set({ name, value: '', ...options });
        response.cookies.set({ name, value: '', ...options });
      },
    },
  });

  const pathname = request.nextUrl.pathname;

  // ============================================
  // PROTECTED ROUTES - Require authentication
  // ============================================
  
  // Page routes that require auth
  const protectedPagePaths = ['/admin', '/chat', '/dashboard', '/settings'];
  
  // API routes that require auth via middleware
  // NOTE: /api/chat, /api/monica, /api/deep-research have their own robust auth, so they're excluded
  const protectedApiPaths = [
    '/api/improve-message',
    '/api/training'
  ];
  
  // Public/Self-authenticated API routes (webhooks, callbacks, health checks, self-auth)
  const publicApiPaths = [
    '/api/alerts/webhook',
    '/api/chat',              // Has its own auth (cookies + Bearer token)
    '/api/emails',            // Has its own auth (verifyActiveTeamMember + service role key)
    '/api/deep-research',     // Has its own auth (cookies + Bearer token + wp_team_humano)
    '/api/health',
    '/api/monica',            // Has its own auth (userId in body + wp_team_humano verification)
    '/api/nylas'              // All Nylas routes have their own robust auth (getAuthUser pattern)
  ];

  // Check if current path is protected
  const isProtectedPage = protectedPagePaths.some(path => pathname.startsWith(path));
  const isProtectedApi = protectedApiPaths.some(path => pathname.startsWith(path));
  const isPublicApi = publicApiPaths.some(path => pathname.startsWith(path));
  
  // API routes: protected unless explicitly public
  const requiresAuth = isProtectedPage || (isProtectedApi && !isPublicApi);

  // PERFORMANCE: Only verify user with server on protected routes
  // This avoids auth round-trips on public pages/assets/APIs.
  let user = null;
  if (requiresAuth) {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  }

  if (requiresAuth && !user) {
    // For API routes, return 401 JSON response
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'No autorizado', message: 'Sesión inválida o expirada' },
        { status: 401 }
      );
    }
    
    // For page routes, redirect to login
    const redirectUrl = new URL('/', request.url);
    redirectUrl.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

/**
 * Configuración del matcher para excluir archivos estáticos
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
