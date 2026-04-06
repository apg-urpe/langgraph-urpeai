/**
 * Merge Contacts API
 * 
 * POST: Execute merge of two contacts (primary absorbs secondary)
 * GET:  Preview merge — counts entities that would be moved
 * 
 * Security: Only role_id 1 (dev team) and 2 (admin) can execute merges.
 * 
 * @module app/api/contacts/merge/route
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { verifyActiveTeamMember, createSupabaseAdmin, getEffectiveEnterpriseId, isDevTeamRole } from '@/lib/auth-security';

const ALLOWED_ROLE_IDS = [1, 2];

// ============================================================================
// Shared auth helper
// ============================================================================
async function authenticateAndAuthorize(req: NextRequest) {
  let response = NextResponse.next();
  const cookieSupabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return req.cookies.get(name)?.value; },
        set(name: string, value: string, options: CookieOptions) { response.cookies.set({ name, value, ...options }); },
        remove(name: string, options: CookieOptions) { response.cookies.set({ name, value: '', ...options }); },
      },
    }
  );

  const { data: { user }, error: authError } = await cookieSupabase.auth.getUser();

  if (authError || !user) {
    return { error: NextResponse.json({ success: false, error: 'Sesión inválida o expirada' }, { status: 401 }) };
  }

  const supabaseAdmin = createSupabaseAdmin();
  const securityCheck = await verifyActiveTeamMember(supabaseAdmin, user.id, user.email);

  if (!securityCheck.success || !securityCheck.teamMember) {
    console.error('[MergeContacts] Security check failed:', securityCheck.error);
    return {
      error: NextResponse.json(
        { success: false, error: securityCheck.error?.message || 'Acceso denegado' },
        { status: securityCheck.error?.httpStatus || 403 }
      )
    };
  }

  const teamMember = securityCheck.teamMember;

  // Role check: only roles 1-2
  if (!ALLOWED_ROLE_IDS.includes(teamMember.role_id)) {
    console.warn('[MergeContacts] Unauthorized role:', teamMember.role_id, teamMember.email);
    return {
      error: NextResponse.json(
        { success: false, error: 'Solo administradores pueden unificar contactos' },
        { status: 403 }
      )
    };
  }

  return { teamMember, supabaseAdmin };
}

// ============================================================================
// GET /api/contacts/merge?primaryId=X&secondaryId=Y — Preview
// ============================================================================
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateAndAuthorize(req);
    if ('error' in auth && auth.error) return auth.error;
    const { teamMember, supabaseAdmin } = auth as { teamMember: NonNullable<typeof auth.teamMember>; supabaseAdmin: ReturnType<typeof createSupabaseAdmin> };

    const { searchParams } = new URL(req.url);
    const primaryId = Number(searchParams.get('primaryId'));
    const secondaryId = Number(searchParams.get('secondaryId'));

    if (!primaryId || !secondaryId || isNaN(primaryId) || isNaN(secondaryId)) {
      return NextResponse.json({ success: false, error: 'primaryId y secondaryId son requeridos' }, { status: 400 });
    }

    if (primaryId === secondaryId) {
      return NextResponse.json({ success: false, error: 'No se puede unificar un contacto consigo mismo' }, { status: 400 });
    }

    // Verify both contacts belong to the user's enterprise
    const enterpriseId = getEffectiveEnterpriseId(teamMember);

    const [primaryRes, secondaryRes] = await Promise.all([
      supabaseAdmin.from('wp_contactos').select('id, empresa_id, nombre, apellido, telefono, email, origen, estado, es_calificado, etapa_embudo, team_humano_id, etapa_emocional, avatar_url, notas, metadata, timezone, created_at, ultima_interaccion').eq('id', primaryId).single(),
      supabaseAdmin.from('wp_contactos').select('id, empresa_id, nombre, apellido, telefono, email, origen, estado, es_calificado, etapa_embudo, team_humano_id, etapa_emocional, avatar_url, notas, metadata, timezone, created_at, ultima_interaccion').eq('id', secondaryId).single(),
    ]);

    if (primaryRes.error || !primaryRes.data) {
      return NextResponse.json({ success: false, error: 'Contacto primario no encontrado' }, { status: 404 });
    }
    if (secondaryRes.error || !secondaryRes.data) {
      return NextResponse.json({ success: false, error: 'Contacto secundario no encontrado' }, { status: 404 });
    }

    // Enterprise access check
    if (!isDevTeamRole(teamMember.role_id)) {
      if (primaryRes.data.empresa_id !== enterpriseId || secondaryRes.data.empresa_id !== enterpriseId) {
        return NextResponse.json({ success: false, error: 'Los contactos no pertenecen a tu empresa' }, { status: 403 });
      }
    }

    if (primaryRes.data.empresa_id !== secondaryRes.data.empresa_id) {
      return NextResponse.json({ success: false, error: 'Los contactos pertenecen a empresas diferentes' }, { status: 400 });
    }

    // Call preview function
    const { data: preview, error: previewError } = await supabaseAdmin.rpc('merge_contacts_preview', {
      p_primary_id: primaryId,
      p_secondary_id: secondaryId,
    });

    if (previewError) {
      console.error('[MergeContacts] Preview RPC error:', previewError);
      return NextResponse.json({ success: false, error: 'Error al generar preview' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      primary: primaryRes.data,
      secondary: secondaryRes.data,
      preview: preview?.counts || {},
    });

  } catch (err: any) {
    console.error('[MergeContacts] GET error:', err);
    return NextResponse.json({ success: false, error: err.message || 'Error interno' }, { status: 500 });
  }
}

// ============================================================================
// POST /api/contacts/merge — Execute merge
// ============================================================================
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateAndAuthorize(req);
    if ('error' in auth && auth.error) return auth.error;
    const { teamMember, supabaseAdmin } = auth as { teamMember: NonNullable<typeof auth.teamMember>; supabaseAdmin: ReturnType<typeof createSupabaseAdmin> };

    const body = await req.json();
    const { primaryId, secondaryId, fieldChoices, notesStrategy } = body;

    if (!primaryId || !secondaryId) {
      return NextResponse.json({ success: false, error: 'primaryId y secondaryId son requeridos' }, { status: 400 });
    }

    if (primaryId === secondaryId) {
      return NextResponse.json({ success: false, error: 'No se puede unificar un contacto consigo mismo' }, { status: 400 });
    }

    const enterpriseId = getEffectiveEnterpriseId(teamMember);

    // Enterprise access check for non-dev roles
    if (!isDevTeamRole(teamMember.role_id)) {
      const [p, s] = await Promise.all([
        supabaseAdmin.from('wp_contactos').select('empresa_id').eq('id', primaryId).single(),
        supabaseAdmin.from('wp_contactos').select('empresa_id').eq('id', secondaryId).single(),
      ]);
      if (p.data?.empresa_id !== enterpriseId || s.data?.empresa_id !== enterpriseId) {
        return NextResponse.json({ success: false, error: 'Los contactos no pertenecen a tu empresa' }, { status: 403 });
      }
    }

    console.log('[MergeContacts] Executing merge:', { primaryId, secondaryId, fieldChoices, mergedBy: teamMember.id });

    // Call the SQL function
    const { data: result, error: rpcError } = await supabaseAdmin.rpc('merge_contacts', {
      p_primary_id: primaryId,
      p_secondary_id: secondaryId,
      p_field_choices: fieldChoices || {},
      p_merged_by: teamMember.id,
      p_empresa_id: enterpriseId,
      p_notes_strategy: notesStrategy || 'both',
    });

    if (rpcError) {
      console.error('[MergeContacts] RPC error:', rpcError);
      return NextResponse.json({ success: false, error: 'Error al ejecutar merge: ' + rpcError.message }, { status: 500 });
    }

    if (!result?.success) {
      console.error('[MergeContacts] Merge failed:', result);
      return NextResponse.json({ success: false, error: result?.error || 'Error desconocido en merge' }, { status: 400 });
    }

    console.log('[MergeContacts] ✅ Merge completed:', result);

    return NextResponse.json({
      success: true,
      mergeLogId: result.merge_log_id,
      tablesUpdated: result.tables_updated,
      primaryId: result.primary_id,
      secondaryId: result.secondary_id,
    });

  } catch (err: any) {
    console.error('[MergeContacts] POST error:', err);
    return NextResponse.json({ success: false, error: err.message || 'Error interno' }, { status: 500 });
  }
}
