import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Link Auth UID to Team Member
 * 
 * Este endpoint vincula el auth_uid de un usuario autenticado a su registro
 * en wp_team_humano. Se usa cuando:
 * 1. El usuario aceptó una invitación sin estar autenticado
 * 2. El auto-linking por email falló por alguna razón
 * 3. El usuario fue creado manualmente sin auth_uid
 * 
 * Flow:
 * 1. Usuario hace login via Magic Link
 * 2. fetchUserContext intenta encontrar por auth_uid
 * 3. Si no encuentra, intenta auto-linking por email
 * 4. Si falla, el frontend puede llamar este endpoint para forzar el link
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, auth_uid } = body;

    if (!email || !auth_uid) {
      return NextResponse.json(
        { error: 'Email and auth_uid are required' },
        { status: 400 }
      );
    }

    if (!supabaseServiceKey) {
      console.error('[Link Auth] Missing SUPABASE_SERVICE_ROLE_KEY');
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

    const normalizedEmail = email.toLowerCase().trim();

    console.log('[Link Auth] Attempting to link auth_uid:', {
      email: normalizedEmail,
      auth_uid: auth_uid.substring(0, 8) + '...'
    });

    // Buscar miembro por email que NO tenga auth_uid
    const { data: member, error: findError } = await supabase
      .from('wp_team_humano')
      .select('id, email, auth_uid, is_active, nombre, apellido, empresa_id')
      .eq('email', normalizedEmail)
      .is('deleted', null)
      .maybeSingle();

    if (findError) {
      console.error('[Link Auth] Error finding member:', findError);
      return NextResponse.json(
        { error: 'Error buscando miembro' },
        { status: 500 }
      );
    }

    if (!member) {
      console.warn('[Link Auth] No member found for email:', normalizedEmail);
      return NextResponse.json(
        { 
          error: 'No se encontró un miembro con este email',
          code: 'MEMBER_NOT_FOUND'
        },
        { status: 404 }
      );
    }

    // Verificar si ya tiene auth_uid vinculado
    if (member.auth_uid) {
      if (member.auth_uid === auth_uid) {
        console.log('[Link Auth] Auth UID already linked correctly');
        return NextResponse.json({
          success: true,
          message: 'Auth UID ya está vinculado correctamente',
          member_id: member.id,
          already_linked: true
        });
      } else {
        console.warn('[Link Auth] Member already has different auth_uid:', {
          existing: member.auth_uid.substring(0, 8) + '...',
          attempted: auth_uid.substring(0, 8) + '...'
        });
        return NextResponse.json(
          { 
            error: 'Este miembro ya tiene una cuenta vinculada diferente',
            code: 'ALREADY_LINKED_DIFFERENT'
          },
          { status: 409 }
        );
      }
    }

    // Verificar que el miembro esté activo
    if (!member.is_active) {
      console.warn('[Link Auth] Member is not active:', member.id);
      return NextResponse.json(
        { 
          error: 'La cuenta no está activa. Completa primero tu invitación.',
          code: 'MEMBER_INACTIVE'
        },
        { status: 403 }
      );
    }

    // Vincular auth_uid
    const { error: updateError } = await supabase
      .from('wp_team_humano')
      .update({ 
        auth_uid: auth_uid,
        updated_at: new Date().toISOString()
      })
      .eq('id', member.id);

    if (updateError) {
      console.error('[Link Auth] Error updating auth_uid:', updateError);
      return NextResponse.json(
        { error: 'Error vinculando cuenta' },
        { status: 500 }
      );
    }

    console.log('[Link Auth] ✅ Successfully linked auth_uid:', {
      member_id: member.id,
      email: normalizedEmail,
      nombre: member.nombre,
      empresa_id: member.empresa_id
    });

    return NextResponse.json({
      success: true,
      message: 'Cuenta vinculada exitosamente',
      member_id: member.id,
      empresa_id: member.empresa_id,
      nombre: `${member.nombre} ${member.apellido}`.trim()
    });

  } catch (error: any) {
    console.error('[Link Auth] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
