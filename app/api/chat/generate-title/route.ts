/**
 * POST /api/chat/generate-title
 * 
 * Genera un título corto y concreto para una sesión de chat
 * basándose en los últimos mensajes de la conversación.
 * 
 * Usa Gemini LITE (gemini-2.0-flash-001) para bajo costo y alta velocidad.
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';
import { google, GEMINI_MODEL_LITE } from '@/lib/ai/config';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const maxDuration = 15;

interface GenerateTitleRequest {
  messages: { role: 'user' | 'assistant'; content: string }[];
  currentTitle?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body: GenerateTitleRequest = await req.json();
    const { messages, currentTitle } = body;

    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: 'No messages provided' }, { status: 400 });
    }

    // Tomar solo los últimos 6 mensajes para contexto
    const recentMessages = messages.slice(-6);
    const conversationSummary = recentMessages
      .map(m => `${m.role === 'user' ? 'Usuario' : 'Monica'}: ${m.content.slice(0, 200)}`)
      .join('\n');

    const { text } = await generateText({
      model: google(GEMINI_MODEL_LITE),
      prompt: `Genera un título CORTO (máximo 5 palabras) para esta conversación de chat. 
El título debe ser concreto, descriptivo y en español.
NO uses comillas, puntos ni emojis.
Solo responde con el título, nada más.

${currentTitle && currentTitle !== 'New Analysis' ? `Título actual: ${currentTitle}\n` : ''}
Conversación:
${conversationSummary}

Título:`,
    });

    const title = text.trim().replace(/^["']|["']$/g, '').slice(0, 60);

    logger.debug('[GenerateTitle] Generated:', title);

    return NextResponse.json({ title });
  } catch (error: any) {
    logger.error('[GenerateTitle] Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate title', details: error.message },
      { status: 500 }
    );
  }
}
