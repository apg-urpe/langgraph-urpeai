/**
 * Email Intelligence API - Fetch Emails from Nylas
 * 
 * GET /api/emails - Fetch emails list
 * Params: grant_id, enterprise_id, user_id, limit, query, unread, received_after, received_before, page_token
 * 
 * WORKAROUND: Uses Service Role Key instead of SSR cookies due to @supabase/ssr bug
 * with Next.js 14.2+ Route Handlers (see: https://github.com/supabase/ssr/issues/107)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { LocalEmail, EmailParticipant } from '@/types/email';
import { verifyActiveTeamMember, createSupabaseAdmin, isDevTeamRole } from '@/lib/auth-security';

const NYLAS_API_KEY = process.env.NYLAS_API_KEY;
const NYLAS_API_URI = process.env.NYLAS_API_URI || 'https://api.us.nylas.com';

// Use Service Role Key to bypass SSR cookie issues
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ============================================
// HELPERS
// ============================================

function parseParticipants(participants: any[]): EmailParticipant[] {
  if (!Array.isArray(participants)) return [];
  return participants.map(p => ({
    name: p.name || undefined,
    email: p.email || ''
  }));
}

function mapNylasMessage(msg: any, grantId: string): LocalEmail {
  return {
    id: msg.id,
    grantId,
    threadId: msg.thread_id,
    subject: msg.subject || '(Sin asunto)',
    snippet: msg.snippet || '',
    body: msg.body || undefined,
    from: parseParticipants(msg.from || []),
    to: parseParticipants(msg.to || []),
    cc: parseParticipants(msg.cc || []),
    bcc: parseParticipants(msg.bcc || []),
    replyTo: parseParticipants(msg.reply_to || []),
    date: msg.date || Math.floor(Date.now() / 1000),
    unread: msg.unread ?? true,
    starred: msg.starred ?? false,
    folders: msg.folders || [],
    hasAttachments: Array.isArray(msg.attachments) && msg.attachments.length > 0,
    attachments: msg.attachments?.map((a: any) => ({
      id: a.id,
      filename: a.filename || 'attachment',
      content_type: a.content_type || 'application/octet-stream',
      size: a.size || 0
    })),
    fetchedAt: Date.now()
  };
}

// ============================================
// GET - Fetch Emails List
// ============================================

export async function GET(request: NextRequest) {
  // Validate API key first
  if (!NYLAS_API_KEY) {
    return NextResponse.json(
      { success: false, error: 'NYLAS_API_KEY not configured' },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const grantId = searchParams.get('grant_id');
  const enterpriseId = searchParams.get('enterprise_id');
  const userId = searchParams.get('user_id'); // Auth UID from client
  const limit = searchParams.get('limit') || '20';
  const query = searchParams.get('query');
  const unread = searchParams.get('unread');
  const receivedAfter = searchParams.get('received_after');
  const receivedBefore = searchParams.get('received_before');
  const pageToken = searchParams.get('page_token');
  const inFolder = searchParams.get('in_folder');

  // Validate required params
  if (!grantId || !enterpriseId || !userId) {
    return NextResponse.json(
      { success: false, error: 'grant_id, enterprise_id and user_id are required' },
      { status: 400 }
    );
  }

  // SECURITY: Verify user is active and not archived
  const securityCheck = await verifyActiveTeamMember(
    createSupabaseAdmin(),
    userId
  );

  if (!securityCheck.success || !securityCheck.teamMember) {
    console.error('[API/Emails] Security check failed:', securityCheck.error);
    return NextResponse.json({ 
      error: securityCheck.error?.message || 'No autorizado',
      code: securityCheck.error?.code
    }, { status: securityCheck.error?.httpStatus || 401 });
  }

  const userData = securityCheck.teamMember;

  if (!isDevTeamRole(userData.role_id) && userData.empresa_id !== Number(enterpriseId)) {
    return NextResponse.json({ error: 'Acceso denegado a esta empresa' }, { status: 403 });
  }

  try {
    // Build Nylas API URL
    // https://developer.nylas.com/docs/api/v3/ecc/#get-/v3/grants/-grant_id-/messages
    const url = new URL(`${NYLAS_API_URI}/v3/grants/${grantId}/messages`);
    
    url.searchParams.set('limit', limit);
    
    if (query) {
      // Nylas v3 uses search_query_native for Gmail/Outlook search syntax
      url.searchParams.set('search_query_native', query);
    }
    
    if (unread === 'true') {
      url.searchParams.set('unread', 'true');
    }
    
    if (receivedAfter) {
      url.searchParams.set('received_after', receivedAfter);
    }
    
    if (receivedBefore) {
      url.searchParams.set('received_before', receivedBefore);
    }
    
    if (pageToken) {
      url.searchParams.set('page_token', pageToken);
    }
    
    if (inFolder) {
      url.searchParams.set('in', inFolder);
    }

    console.log(`[API/Emails] Fetching messages from: ${url.toString()}`);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${NYLAS_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[API/Emails] Nylas error:', response.status, errorText);
      
      // Handle specific error codes
      if (response.status === 404) {
        return NextResponse.json(
          { success: false, error: 'Grant inválido o expirado', code: 'INVALID_GRANT', details: 'El usuario debe reconectar su cuenta de email.' },
          { status: 404 }
        );
      }
      
      if (response.status === 401) {
        return NextResponse.json(
          { success: false, error: 'API Key inválida', code: 'INVALID_API_KEY' },
          { status: 401 }
        );
      }
      
      return NextResponse.json(
        { success: false, error: `Nylas API error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    // Map Nylas messages to our format
    const emails: LocalEmail[] = (data.data || []).map((msg: any) => 
      mapNylasMessage(msg, grantId)
    );

    return NextResponse.json({
      success: true,
      emails,
      next_page_token: data.next_cursor || undefined,
      request_id: data.request_id
    });

  } catch (error) {
    console.error('[API/Emails] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
