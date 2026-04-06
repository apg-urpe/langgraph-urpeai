/**
 * Email Intelligence API - Query Emails with AI
 * 
 * POST /api/emails/query - Ask questions about emails using Gemini
 * Body: { question, grant_id, emails[] }
 * 
 * El sistema busca en los correos proporcionados y responde en markdown.
 */

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GEMINI_API_KEY, GEMINI_MODEL } from '@/lib/ai/config';

// ============================================
// QUERY PROMPT
// ============================================

const QUERY_PROMPT = `Eres un asistente de correo inteligente. El usuario te hace preguntas sobre sus correos.

Tu trabajo es:
1. Analizar los correos proporcionados
2. Responder la pregunta del usuario de forma clara y concisa
3. Citar correos específicos cuando sea relevante (mencionar remitente y asunto)
4. Si no encuentras información relevante, indicarlo amablemente

FORMATO DE RESPUESTA:
- Usa Markdown para formatear tu respuesta
- Usa listas cuando sea apropiado
- Destaca información importante en **negrita**
- Si hay fechas o montos importantes, resáltalos
- Sé conciso pero completo

IMPORTANTE: Responde SOLO en español y de forma profesional.`;

// ============================================
// POST - Query Emails
// ============================================

export async function POST(request: NextRequest) {
  if (!GEMINI_API_KEY) {
    return NextResponse.json(
      { success: false, error: 'GEMINI_API_KEY not configured' },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const { question, grant_id, emails } = body;

    if (!question || !grant_id) {
      return NextResponse.json(
        { success: false, error: 'question and grant_id are required' },
        { status: 400 }
      );
    }

    if (!Array.isArray(emails) || emails.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No hay correos para analizar' },
        { status: 400 }
      );
    }

    // Preparar contexto de correos
    const emailContext = emails.map((e: any, i: number) => {
      const date = new Date(e.date * 1000).toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
      return `[${i + 1}] De: ${e.from} | Fecha: ${date} | Asunto: ${e.subject}${e.hasAttachments ? ' (📎 adjuntos)' : ''}
   Preview: ${e.snippet?.slice(0, 200) || '(sin preview)'}`;
    }).join('\n\n');

    const userMessage = `
## Pregunta del Usuario:
${question}

## Correos Disponibles (${emails.length}):
${emailContext}
`.trim();

    console.log(`[API/Emails/Query] Processing question: "${question.slice(0, 50)}..."`);

    // Llamar a Gemini
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const result = await model.generateContent([
      QUERY_PROMPT,
      userMessage
    ]);

    const answer = result.response.text().trim();

    return NextResponse.json({
      success: true,
      answer,
      emailsAnalyzed: emails.length
    });

  } catch (error) {
    console.error('[API/Emails/Query] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Query failed' },
      { status: 500 }
    );
  }
}
