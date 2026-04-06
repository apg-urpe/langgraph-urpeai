import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import { logger } from '@/lib/logger';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const openaiApiKey = process.env.OPENAI_API_KEY || '';
const geminiApiKey = process.env.GEMINI_API_KEY || '';

const openai = openaiApiKey
  ? new OpenAI({
      apiKey: openaiApiKey,
    })
  : null;

const gemini = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;

async function getSupabaseUser(request: NextRequest) {
  const response = NextResponse.next();
  const cookieSupabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        response.cookies.set({ name, value, ...options });
      },
      remove(name: string, options: CookieOptions) {
        response.cookies.set({ name, value: '', ...options });
      },
    },
  });

  const {
    data: { user: cookieUser },
    error: cookieError,
  } = await cookieSupabase.auth.getUser();

  if (cookieUser && !cookieError) {
    return { user: cookieUser, error: null };
  }

  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const tokenSupabase = createClient(supabaseUrl, supabaseAnonKey);
    const {
      data: { user: tokenUser },
      error: tokenError,
    } = await tokenSupabase.auth.getUser(token);

    if (tokenUser && !tokenError) {
      return { user: tokenUser, error: null };
    }
  }

  return { user: null, error: cookieError || new Error('No valid authentication found') };
}

function shouldFallbackToGemini(err: unknown) {
  if (!(err instanceof OpenAI.APIError)) {
    return false;
  }

  return err.status === 429 || /quota|billing|rate limit/i.test(err.message);
}

async function transcribeWithOpenAI(audioFile: File, language?: string | null) {
  if (!openai) {
    throw new Error('OpenAI not configured');
  }

  const transcription = await openai.audio.transcriptions.create({
    file: audioFile,
    model: 'gpt-4o-mini-transcribe',
    language: language || undefined,
  });

  return transcription.text;
}

async function transcribeWithGemini(audioFile: File, language?: string | null) {
  if (!gemini) {
    throw new Error('Gemini not configured');
  }

  const audioBuffer = Buffer.from(await audioFile.arrayBuffer()).toString('base64');
  const model = gemini.getGenerativeModel({ model: 'gemini-2.0-flash-001' });
  const prompt = language
    ? `Transcribe exactamente este audio en ${language}. Devuelve solo el texto transcrito, sin resúmenes, sin etiquetas y sin explicaciones.`
    : 'Transcribe exactamente este audio. Devuelve solo el texto transcrito, sin resúmenes, sin etiquetas y sin explicaciones.';

  const result = await model.generateContent({
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: audioFile.type || 'audio/webm',
              data: audioBuffer,
            },
          },
        ],
      },
    ],
  });

  const text = result.response.text().trim();

  if (!text) {
    throw new Error('Empty transcription response');
  }

  return text;
}

const MAX_AUDIO_SIZE = 25 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const { user, error: authError } = await getSupabaseUser(request);
    if (!user || authError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const audioFile = formData.get('audio') as File | null;

    if (!audioFile) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
    }

    if (audioFile.size > MAX_AUDIO_SIZE) {
      return NextResponse.json({ error: 'Audio file too large. Maximum 25MB.' }, { status: 413 });
    }

    if (!openai && !gemini) {
      logger.error('[Transcribe] No transcription provider configured');
      return NextResponse.json({ error: 'Transcription service not configured' }, { status: 503 });
    }

    const language = formData.get('language') as string | null;

    logger.info(`[Transcribe] User ${user.id} transcribing ${audioFile.size} bytes (${audioFile.type})`);

    let text: string;

    if (openai) {
      try {
        text = await transcribeWithOpenAI(audioFile, language);
      } catch (err: unknown) {
        if (gemini && shouldFallbackToGemini(err)) {
          logger.warn('[Transcribe] OpenAI quota reached, using Gemini fallback');
          text = await transcribeWithGemini(audioFile, language);
        } else {
          throw err;
        }
      }
    } else {
      logger.warn('[Transcribe] OPENAI_API_KEY not configured, using Gemini fallback');
      text = await transcribeWithGemini(audioFile, language);
    }

    logger.info(`[Transcribe] Success: ${text.length} chars`);

    return NextResponse.json({ text });
  } catch (err: unknown) {
    logger.error('[Transcribe] Error:', err);

    if (err instanceof OpenAI.APIError) {
      if (shouldFallbackToGemini(err)) {
        return NextResponse.json(
          {
            error:
              'La cuota de transcripción de OpenAI está agotada. Configura billing en OpenAI o usa GEMINI_API_KEY como respaldo.',
          },
          { status: err.status || 429 }
        );
      }

      return NextResponse.json({ error: `Transcription failed: ${err.message}` }, { status: err.status || 500 });
    }

    if (err instanceof Error) {
      return NextResponse.json({ error: err.message || 'Transcription failed' }, { status: 500 });
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
