import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseAdmin, getEffectiveEnterpriseId, isDevTeamRole, verifyActiveTeamMember } from '@/lib/auth-security';
import { reconcileEnterpriseCalendar } from '@/lib/nylas-calendar-reconcile';

export const dynamic = 'force-dynamic';

const NYLAS_API_KEY = process.env.NYLAS_API_KEY;
const NYLAS_API_URI = process.env.NYLAS_API_URI || 'https://api.us.nylas.com';

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

export async function POST(req: NextRequest) {
  if (!NYLAS_API_KEY) {
    return NextResponse.json({ error: 'Nylas API Key not configured' }, { status: 500 });
  }

  const { user, error: authError } = await getAuthUser(req);
  if (!user || authError) {
    return NextResponse.json({ error: 'No autorizado. Inicia sesión.' }, { status: 401 });
  }

  const supabaseAdmin = createSupabaseAdmin();
  const securityCheck = await verifyActiveTeamMember(supabaseAdmin, user.id, user.email);
  if (!securityCheck.success || !securityCheck.teamMember) {
    return NextResponse.json(
      { error: securityCheck.error?.message || 'Acceso denegado' },
      { status: securityCheck.error?.httpStatus || 403 }
    );
  }

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  const enterpriseId = Number(body.enterprise_id);
  const start = typeof body.start === 'string' ? body.start : '';
  const end = typeof body.end === 'string' ? body.end : '';
  const teamMemberIds = Array.isArray(body.team_member_ids)
    ? body.team_member_ids.map((value: unknown) => Number(value)).filter((value: number) => Number.isFinite(value))
    : null;

  if (!Number.isFinite(enterpriseId) || !start || !end) {
    return NextResponse.json({ error: 'enterprise_id, start y end son obligatorios' }, { status: 400 });
  }

  if (Number.isNaN(new Date(start).getTime()) || Number.isNaN(new Date(end).getTime())) {
    return NextResponse.json({ error: 'Rango de fechas inválido' }, { status: 400 });
  }

  const currentUser = securityCheck.teamMember;
  const effectiveEnterpriseId = getEffectiveEnterpriseId(currentUser);
  if (!isDevTeamRole(currentUser.role_id) && effectiveEnterpriseId !== enterpriseId) {
    return NextResponse.json({ error: 'No puedes sincronizar citas de otra empresa' }, { status: 403 });
  }

  try {
    const summary = await reconcileEnterpriseCalendar({
      supabaseAdmin,
      enterpriseId,
      teamMemberIds,
      start,
      end,
      nylasApiKey: NYLAS_API_KEY,
      nylasApiUri: NYLAS_API_URI
    });

    const changed = summary.appointmentsCreated + summary.appointmentsUpdated + summary.participantsUpserted + summary.participantsDeleted;

    return NextResponse.json({
      success: true,
      changed,
      summary
    });
  } catch (error: any) {
    console.error('[API/Nylas/Events/Reconcile] Error:', error);
    return NextResponse.json({
      error: error?.message || 'Error conciliando calendario'
    }, { status: 500 });
  }
}
