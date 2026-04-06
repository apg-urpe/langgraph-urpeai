import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Nylas Grants Status Endpoint
 * 
 * Verifica el estado real de los grants de Nylas para los miembros del equipo.
 * Retorna el estado de cada grant (valid/invalid/expired/not_connected).
 */

const NYLAS_API_KEY = process.env.NYLAS_API_KEY;
const NYLAS_API_URI = process.env.NYLAS_API_URI || 'https://api.us.nylas.com';

// Crear cliente de Supabase con service role
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface NylasGrantStatus {
  memberId: number;
  grantId: string | null;
  status: 'valid' | 'invalid' | 'expired' | 'not_connected' | 'error';
  email?: string;
  provider?: string;
  scopes?: string[];
  lastChecked: string;
  errorMessage?: string;
}

export interface GrantsStatusResponse {
  success: boolean;
  grants: NylasGrantStatus[];
  summary: {
    total: number;
    valid: number;
    invalid: number;
    notConnected: number;
    errors: number;
  };
}

async function checkGrantStatus(grantId: string): Promise<{
  status: 'valid' | 'invalid' | 'expired' | 'error';
  email?: string;
  provider?: string;
  scopes?: string[];
  errorMessage?: string;
}> {
  try {
    const response = await fetch(`${NYLAS_API_URI}/v3/grants/${grantId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${NYLAS_API_KEY}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Nylas/GrantsStatus] Error checking grant ${grantId}:`, response.status, errorText);
      
      // 404 = Grant no existe o fue eliminado
      if (response.status === 404) {
        return { status: 'expired', errorMessage: 'Grant no encontrado en Nylas' };
      }
      // 401/403 = Problema de autenticación
      if (response.status === 401 || response.status === 403) {
        return { status: 'invalid', errorMessage: 'Grant sin autorización válida' };
      }
      
      return { status: 'error', errorMessage: `HTTP ${response.status}` };
    }

    const data = await response.json();
    const grant = data.data || data;

    // Verificar el estado del grant
    // Nylas v3 usa grant_status: 'valid' | 'invalid'
    const grantStatus = grant.grant_status || grant.status;
    
    if (grantStatus === 'invalid' || grantStatus === 'expired') {
      return {
        status: 'invalid',
        email: grant.email,
        provider: grant.provider,
        scopes: grant.scope || [],
        errorMessage: 'El usuario necesita re-autenticarse'
      };
    }

    return {
      status: 'valid',
      email: grant.email,
      provider: grant.provider,
      scopes: grant.scope || [],
    };

  } catch (error: any) {
    console.error(`[Nylas/GrantsStatus] Exception checking grant ${grantId}:`, error);
    return { status: 'error', errorMessage: error.message };
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const empresaId = searchParams.get('empresa_id');

  if (!empresaId) {
    return NextResponse.json({ success: false, error: 'empresa_id is required' }, { status: 400 });
  }

  if (!NYLAS_API_KEY) {
    return NextResponse.json({ success: false, error: 'NYLAS_API_KEY not configured' }, { status: 500 });
  }

  try {
    // Obtener todos los miembros del equipo con sus grant_ids
    const { data: members, error: membersError } = await supabaseAdmin
      .from('wp_team_humano')
      .select('id, nombre, apellido, email, grant_id')
      .eq('empresa_id', parseInt(empresaId))
      .eq('is_active', true)
      .is('deleted', null);

    if (membersError) {
      console.error('[Nylas/GrantsStatus] Error fetching team members:', membersError);
      return NextResponse.json({ success: false, error: membersError.message }, { status: 500 });
    }

    const grants: NylasGrantStatus[] = [];
    const summary = { total: 0, valid: 0, invalid: 0, notConnected: 0, errors: 0 };

    // Verificar cada miembro
    for (const member of members || []) {
      summary.total++;

      if (!member.grant_id) {
        grants.push({
          memberId: member.id,
          grantId: null,
          status: 'not_connected',
          lastChecked: new Date().toISOString(),
        });
        summary.notConnected++;
        continue;
      }

      // Verificar el estado del grant en Nylas
      const grantCheck = await checkGrantStatus(member.grant_id);

      grants.push({
        memberId: member.id,
        grantId: member.grant_id,
        status: grantCheck.status,
        email: grantCheck.email,
        provider: grantCheck.provider,
        scopes: grantCheck.scopes,
        lastChecked: new Date().toISOString(),
        errorMessage: grantCheck.errorMessage,
      });

      // Actualizar contadores
      switch (grantCheck.status) {
        case 'valid':
          summary.valid++;
          break;
        case 'invalid':
        case 'expired':
          summary.invalid++;
          break;
        case 'error':
          summary.errors++;
          break;
      }
    }

    const response: GrantsStatusResponse = {
      success: true,
      grants,
      summary,
    };

    return NextResponse.json(response);

  } catch (error: any) {
    console.error('[Nylas/GrantsStatus] Exception:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
