/**
 * Email Intelligence API - Get Single Email
 * 
 * GET /api/emails/[emailId] - Fetch full email body
 * Params: grant_id
 */

import { NextRequest, NextResponse } from 'next/server';

const NYLAS_API_KEY = process.env.NYLAS_API_KEY;
const NYLAS_API_URI = process.env.NYLAS_API_URI || 'https://api.us.nylas.com';

export async function GET(
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
    const url = `${NYLAS_API_URI}/v3/grants/${grantId}/messages/${emailId}`;
    
    console.log(`[API/Emails] Fetching message: ${emailId}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${NYLAS_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[API/Emails] Nylas error:', response.status, errorText);
      
      if (response.status === 404) {
        return NextResponse.json(
          { success: false, error: 'Grant o mensaje inválido', code: 'NOT_FOUND', details: 'El grant_id o mensaje no existe.' },
          { status: 404 }
        );
      }
      
      return NextResponse.json(
        { success: false, error: `Nylas API error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    const message = data.data;

    // Extract body - Nylas v3 returns body directly
    const body = message.body || '';
    
    // Create plain text version by stripping HTML
    const bodyText = body
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return NextResponse.json({
      success: true,
      body,
      bodyText,
      subject: message.subject,
      date: message.date
    });

  } catch (error) {
    console.error('[API/Emails] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
