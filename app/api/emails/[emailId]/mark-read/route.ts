/**
 * Email Intelligence API - Mark Email as Read
 * 
 * PUT /api/emails/[emailId]/mark-read - Mark email as read in Nylas
 * Params: grant_id
 */

import { NextRequest, NextResponse } from 'next/server';

const NYLAS_API_KEY = process.env.NYLAS_API_KEY;
const NYLAS_API_URI = process.env.NYLAS_API_URI || 'https://api.us.nylas.com';

export async function PUT(
  request: NextRequest,
  { params }: { params: { emailId: string } }
) {
  if (!NYLAS_API_KEY) {
    return NextResponse.json(
      { success: false, error: 'NYLAS_API_KEY not configured' },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const grantId = searchParams.get('grant_id');
  const emailId = params.emailId;

  if (!grantId) {
    return NextResponse.json(
      { success: false, error: 'grant_id is required' },
      { status: 400 }
    );
  }

  try {
    // Nylas v3: PUT /v3/grants/{grant_id}/messages/{message_id}
    // Body: { unread: false }
    const url = `${NYLAS_API_URI}/v3/grants/${grantId}/messages/${encodeURIComponent(emailId)}`;
    
    console.log(`[API/Emails] Marking as read: ${emailId}`);

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${NYLAS_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        unread: false
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[API/Emails] Nylas error:', response.status, errorText);
      
      if (response.status === 404) {
        return NextResponse.json(
          { success: false, error: 'Mensaje no encontrado', code: 'NOT_FOUND' },
          { status: 404 }
        );
      }
      
      return NextResponse.json(
        { success: false, error: `Nylas API error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    return NextResponse.json({
      success: true,
      message: 'Email marcado como leído',
      emailId,
      unread: data.data?.unread ?? false
    });

  } catch (error) {
    console.error('[API/Emails] Error marking as read:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
