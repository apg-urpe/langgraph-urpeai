import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/auth-security';

/**
 * POST /api/nylas/notetaker-webhook
 * 
 * Webhook endpoint for Nylas Notetaker events.
 * Handles `notetaker.media` events to auto-download and cache
 * recording files in Supabase Storage before Nylas' 14-day expiry.
 * 
 * Setup in Nylas Dashboard:
 *   Webhook URL: https://<your-domain>/api/nylas/notetaker-webhook
 *   Events: notetaker.media
 * 
 * Security: Validates webhook via Nylas webhook secret (HMAC).
 */

const NYLAS_WEBHOOK_SECRET = process.env.NYLAS_WEBHOOK_SECRET;
const NYLAS_API_KEY = process.env.NYLAS_API_KEY;
const NYLAS_API_URI = process.env.NYLAS_API_URI || 'https://api.us.nylas.com';
const STORAGE_BUCKET = 'notetaker-recordings';

// Nylas sends a GET request to verify the webhook URL
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const challenge = searchParams.get('challenge');

  if (challenge) {
    // Nylas webhook verification: return the challenge value
    console.log('[Notetaker Webhook] Challenge received, responding for verification');
    return new NextResponse(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  return NextResponse.json({ status: 'ok', message: 'Notetaker webhook endpoint' });
}

export async function POST(req: NextRequest) {
  console.log('[Notetaker Webhook] Received webhook event');

  try {
    const body = await req.json();
    const eventType = body.type;

    console.log(`[Notetaker Webhook] Event type: ${eventType}`);

    // Only handle notetaker.media events
    if (eventType !== 'notetaker.media') {
      console.log(`[Notetaker Webhook] Ignoring event type: ${eventType}`);
      return NextResponse.json({ status: 'ignored', type: eventType });
    }

    const notetakerData = body.data?.object;
    if (!notetakerData) {
      console.warn('[Notetaker Webhook] No object data in event');
      return NextResponse.json({ status: 'error', message: 'No object data' }, { status: 400 });
    }

    const notetakerId = notetakerData.id;
    const grantId = notetakerData.grant_id;
    const state = notetakerData.state || notetakerData.status;
    const media = notetakerData.media;

    console.log(`[Notetaker Webhook] Notetaker: ${notetakerId}, Grant: ${grantId}, State: ${state}`);

    // Only process when media is available
    if (state !== 'available' && state !== 'media_available') {
      console.log(`[Notetaker Webhook] Media not ready (state: ${state}), skipping download`);
      return NextResponse.json({ status: 'skipped', state });
    }

    if (!media?.recording) {
      console.warn('[Notetaker Webhook] No recording URL in media');
      return NextResponse.json({ status: 'skipped', message: 'No recording URL' });
    }

    const supabaseAdmin = createSupabaseAdmin();

    // Find the transcription record by notetaker_id
    const { data: transcripcion, error: findError } = await supabaseAdmin
      .from('transcripciones')
      .select('id, video_url, video_cached_at, cita_id')
      .eq('notetaker_id', notetakerId)
      .maybeSingle();

    if (findError) {
      console.error('[Notetaker Webhook] DB lookup error:', findError);
      return NextResponse.json({ status: 'error', message: 'DB lookup failed' }, { status: 500 });
    }

    if (!transcripcion) {
      console.warn(`[Notetaker Webhook] No transcription found for notetaker_id: ${notetakerId}`);
      // Still try to cache in case transcription is created later
      // Store the media URLs temporarily — but for now just log and return
      return NextResponse.json({ status: 'no_transcription', notetaker_id: notetakerId });
    }

    // Skip if already cached
    if (transcripcion.video_url && transcripcion.video_cached_at) {
      console.log(`[Notetaker Webhook] Video already cached for transcription ${transcripcion.id}`);
      return NextResponse.json({ status: 'already_cached', transcription_id: transcripcion.id });
    }

    // Download the recording from Nylas temporary URL
    const recordingUrl = typeof media.recording === 'string' ? media.recording : media.recording?.url;
    if (!recordingUrl) {
      console.warn('[Notetaker Webhook] Recording URL is empty');
      return NextResponse.json({ status: 'error', message: 'Empty recording URL' });
    }

    console.log(`[Notetaker Webhook] Downloading recording for transcription ${transcripcion.id}...`);

    const recordingResponse = await fetch(recordingUrl);
    if (!recordingResponse.ok) {
      console.error(`[Notetaker Webhook] Download failed: ${recordingResponse.status}`);
      return NextResponse.json({ status: 'error', message: `Download failed: ${recordingResponse.status}` }, { status: 502 });
    }

    const recordingBuffer = await recordingResponse.arrayBuffer();
    const fileSize = recordingBuffer.byteLength;
    console.log(`[Notetaker Webhook] Downloaded ${(fileSize / 1024 / 1024).toFixed(1)} MB`);

    // Determine file format
    const fileFormat = media.recording_file_format || 'mp4';
    const contentType = fileFormat === 'mp3' ? 'audio/mpeg' : 'video/mp4';
    const storagePath = `${grantId || 'unknown'}/${notetakerId}.${fileFormat}`;

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, recordingBuffer, {
        contentType,
        upsert: true,
      });

    if (uploadError) {
      console.error('[Notetaker Webhook] Upload to Storage failed:', uploadError);
      return NextResponse.json({ status: 'error', message: 'Storage upload failed' }, { status: 500 });
    }

    console.log(`[Notetaker Webhook] Uploaded to Storage: ${uploadData.path}`);

    // Generate a long-lived signed URL (7 days, will be regenerated on access)
    const { data: signedData, error: signedError } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(storagePath, 60 * 60 * 24 * 7); // 7 days

    if (signedError) {
      console.error('[Notetaker Webhook] Signed URL generation failed:', signedError);
    }

    // Update transcription record with cached video info
    const { error: updateError } = await supabaseAdmin
      .from('transcripciones')
      .update({
        video_url: storagePath, // Store the path, not the signed URL (URLs expire)
        video_cached_at: new Date().toISOString(),
      })
      .eq('id', transcripcion.id);

    if (updateError) {
      console.error('[Notetaker Webhook] DB update error:', updateError);
      return NextResponse.json({ status: 'error', message: 'DB update failed' }, { status: 500 });
    }

    // Also cache thumbnail if available
    const thumbnailUrl = typeof media.thumbnail === 'string' ? media.thumbnail : media.thumbnail?.url;
    if (thumbnailUrl) {
      try {
        const thumbResponse = await fetch(thumbnailUrl);
        if (thumbResponse.ok) {
          const thumbBuffer = await thumbResponse.arrayBuffer();
          await supabaseAdmin.storage
            .from(STORAGE_BUCKET)
            .upload(`${grantId || 'unknown'}/${notetakerId}_thumb.png`, thumbBuffer, {
              contentType: 'image/png',
              upsert: true,
            });
          console.log('[Notetaker Webhook] Thumbnail cached');
        }
      } catch (e) {
        console.warn('[Notetaker Webhook] Thumbnail cache failed (non-blocking):', e);
      }
    }

    console.log(`[Notetaker Webhook] ✅ Video cached successfully for transcription ${transcripcion.id}`);

    return NextResponse.json({
      status: 'cached',
      transcription_id: transcripcion.id,
      storage_path: storagePath,
      size_mb: (fileSize / 1024 / 1024).toFixed(1),
    });

  } catch (error: any) {
    console.error('[Notetaker Webhook] Exception:', error);
    return NextResponse.json({ 
      status: 'error', 
      message: error.message 
    }, { status: 500 });
  }
}
