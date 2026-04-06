/**
 * Security Helpers for API Authentication
 * 
 * This module provides functions to verify that authenticated users
 * are active and not archived in wp_team_humano.
 * 
 * IMPORTANT: All protected APIs should use these helpers to prevent
 * archived/inactive users from accessing data.
 * 
 * @module lib/auth-security
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// TYPES
// ============================================================================

export interface TeamMemberSecurityInfo {
  id: number;
  auth_uid: string;
  empresa_id: number;
  enterprise_id: number | null;
  role_id: number;
  email: string;
  nombre: string | null;
  apellido: string | null;
  is_active: boolean;
  deleted: string | null;
}

export interface SecurityCheckResult {
  success: boolean;
  teamMember: TeamMemberSecurityInfo | null;
  error: {
    code: 'USER_NOT_FOUND' | 'USER_ARCHIVED' | 'USER_INACTIVE' | 'NO_ENTERPRISE' | 'DB_ERROR';
    message: string;
    httpStatus: number;
  } | null;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Verifies that a user exists, is active, and not archived.
 * 
 * This should be called in ALL protected API routes after authenticating
 * the user via Supabase Auth.
 * 
 * @param supabaseAdmin - Supabase client with service role key
 * @param authUid - The auth_uid from Supabase Auth (user.id)
 * @param userEmail - Optional email for auto-linking fallback
 * @returns SecurityCheckResult with team member info or error details
 */
export async function verifyActiveTeamMember(
  supabaseAdmin: SupabaseClient,
  authUid: string,
  userEmail?: string | null
): Promise<SecurityCheckResult> {
  try {
    // 1. Try to find by auth_uid first
    const { data: teamMembers, error: queryError } = await supabaseAdmin
      .from('wp_team_humano')
      .select(`
        id,
        auth_uid,
        empresa_id,
        enterprise_id,
        role_id,
        email,
        nombre,
        apellido,
        is_active,
        deleted
      `)
      .eq('auth_uid', authUid);

    if (queryError) {
      console.error('[Security] Error querying wp_team_humano:', queryError);
      return {
        success: false,
        teamMember: null,
        error: {
          code: 'DB_ERROR',
          message: 'Error al verificar usuario en el sistema',
          httpStatus: 500
        }
      };
    }

    let teamMember = teamMembers && teamMembers.length > 0 ? teamMembers[0] : null;

    // 2. If not found by auth_uid, try by email (auto-linking support)
    if (!teamMember && userEmail) {
      const { data: membersByEmail, error: emailError } = await supabaseAdmin
        .from('wp_team_humano')
        .select(`
          id,
          auth_uid,
          empresa_id,
          enterprise_id,
          role_id,
          email,
          nombre,
          apellido,
          is_active,
          deleted
        `)
        .eq('email', userEmail);

      if (!emailError && membersByEmail && membersByEmail.length > 0) {
        teamMember = membersByEmail[0];
        
        // Auto-link if no auth_uid set
        if (!teamMember.auth_uid) {
          console.log('[Security] 🔗 Auto-linking auth_uid to existing record:', userEmail);
          await supabaseAdmin
            .from('wp_team_humano')
            .update({ auth_uid: authUid })
            .eq('id', teamMember.id);
          teamMember.auth_uid = authUid;
        }
      }
    }

    // 3. Check if user exists
    if (!teamMember) {
      console.warn('[Security] ⛔ User not found in wp_team_humano:', { authUid, userEmail });
      return {
        success: false,
        teamMember: null,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'Usuario no registrado en el sistema',
          httpStatus: 403
        }
      };
    }

    // 4. SECURITY CHECK: Verify user is not archived (deleted)
    if (teamMember.deleted) {
      console.warn('[Security] ⛔ ARCHIVED USER attempted access:', {
        id: teamMember.id,
        email: teamMember.email,
        deleted: teamMember.deleted
      });
      return {
        success: false,
        teamMember: null,
        error: {
          code: 'USER_ARCHIVED',
          message: 'Tu cuenta ha sido archivada. Contacta al administrador.',
          httpStatus: 403
        }
      };
    }

    // 5. SECURITY CHECK: Verify user is active
    if (teamMember.is_active === false) {
      console.warn('[Security] ⛔ INACTIVE USER attempted access:', {
        id: teamMember.id,
        email: teamMember.email,
        is_active: teamMember.is_active
      });
      return {
        success: false,
        teamMember: null,
        error: {
          code: 'USER_INACTIVE',
          message: 'Tu cuenta está desactivada. Contacta al administrador.',
          httpStatus: 403
        }
      };
    }

    // 6. Check if user has an enterprise assigned
    const effectiveEnterpriseId = teamMember.enterprise_id || teamMember.empresa_id;
    if (!effectiveEnterpriseId) {
      console.warn('[Security] ⚠️ User without enterprise:', teamMember.email);
      return {
        success: false,
        teamMember: null,
        error: {
          code: 'NO_ENTERPRISE',
          message: 'Tu cuenta no tiene una empresa asignada. Contacta al administrador.',
          httpStatus: 403
        }
      };
    }

    // All checks passed
    return {
      success: true,
      teamMember: teamMember as TeamMemberSecurityInfo,
      error: null
    };

  } catch (error: any) {
    console.error('[Security] Exception in verifyActiveTeamMember:', error);
    return {
      success: false,
      teamMember: null,
      error: {
        code: 'DB_ERROR',
        message: 'Error interno al verificar usuario',
        httpStatus: 500
      }
    };
  }
}

/**
 * Creates a Supabase Admin client using service role key.
 * Use this when you need to bypass RLS for security checks.
 */
export function createSupabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!url || !key) {
    throw new Error('Missing Supabase environment variables for admin client');
  }
  
  return createClient(url, key);
}

/**
 * Utility to get effective enterprise ID from team member
 */
export function getEffectiveEnterpriseId(teamMember: TeamMemberSecurityInfo): number {
  return teamMember.enterprise_id || teamMember.empresa_id;
}

/**
 * Check if user has dev team role (can access all enterprises)
 */
export function isDevTeamRole(roleId: number): boolean {
  return roleId === 1;
}
