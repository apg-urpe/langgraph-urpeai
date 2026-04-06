/**
 * Email Intelligence API - Generate Summary
 * 
 * POST /api/emails/summary - Generate AI summary of multiple emails
 * Body: { emails: [{ id, subject, snippet, from, date }] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { EmailSummary, EmailCategory } from '@/types/email';
import { GEMINI_API_KEY, GEMINI_MODEL } from '@/lib/ai/config';

// ============================================
// SUMMARY PROMPT
// ============================================

const SUMMARY_PROMPT = `Eres un asistente ejecutivo que resume correos electrónicos para un profesional ocupado.

Analiza los siguientes correos y genera un resumen ejecutivo. Devuelve SOLO un JSON válido:

{
  "summary": "Resumen narrativo de 3-4 oraciones describiendo el panorama general de los correos",
  "highlights": [
    { "emailId": "id_del_correo", "subject": "asunto", "razon": "Por qué es importante" }
  ],
  "urgentCount": numero_de_correos_urgentes,
  "pendingActions": ["Lista de acciones pendientes consolidadas de todos los correos"],
  "topCategories": [
    { "categoria": "ventas|soporte|interno|etc", "count": numero }
  ]
}

Criterios:
- Destacar máximo 3 correos más importantes
- Identificar urgencias reales
- Consolidar acciones similares
- Ser conciso pero informativo

IMPORTANTE: Responde ÚNICAMENTE con el JSON, sin explicaciones adicionales.`;

// ============================================
// POST - Generate Summary
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
    const { emails } = body;

    if (!Array.isArray(emails) || emails.length === 0) {
      return NextResponse.json(
        { success: false, error: 'emails array is required' },
        { status: 400 }
      );
    }

    // Formatear correos para el prompt
    const emailsText = emails.map((e, i) => `
[Correo ${i + 1}]
ID: ${e.id}
De: ${e.from}
Fecha: ${new Date(e.date * 1000).toLocaleString('es-ES')}
Asunto: ${e.subject}
Preview: ${e.snippet}
`).join('\n---\n');

    console.log(`[API/Emails/Summary] Summarizing ${emails.length} emails`);

    // Llamar a Gemini
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const result = await model.generateContent([
      SUMMARY_PROMPT,
      emailsText
    ]);

    const responseText = result.response.text();
    
    // Limpiar respuesta de markdown
    let jsonText = responseText.trim();
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.slice(7);
    }
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.slice(3);
    }
    if (jsonText.endsWith('```')) {
      jsonText = jsonText.slice(0, -3);
    }
    jsonText = jsonText.trim();

    // Parsear JSON
    const summaryData = JSON.parse(jsonText);

    // Validar y normalizar
    const summary: Omit<EmailSummary, 'generatedAt' | 'emailIds'> = {
      summary: summaryData.summary || 'No se pudo generar resumen',
      highlights: Array.isArray(summaryData.highlights) 
        ? summaryData.highlights.map((h: any) => ({
            emailId: h.emailId || '',
            subject: h.subject || '',
            razon: h.razon || ''
          }))
        : [],
      urgentCount: typeof summaryData.urgentCount === 'number' ? summaryData.urgentCount : 0,
      pendingActions: Array.isArray(summaryData.pendingActions) ? summaryData.pendingActions : [],
      topCategories: Array.isArray(summaryData.topCategories)
        ? summaryData.topCategories.map((c: any) => ({
            categoria: validateCategory(c.categoria),
            count: typeof c.count === 'number' ? c.count : 0
          }))
        : []
    };

    return NextResponse.json({
      success: true,
      summary
    });

  } catch (error) {
    console.error('[API/Emails/Summary] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Summary generation failed' },
      { status: 500 }
    );
  }
}

// ============================================
// VALIDATORS
// ============================================

function validateCategory(cat: string): EmailCategory {
  const valid: EmailCategory[] = ['ventas', 'soporte', 'interno', 'personal', 'marketing', 'facturacion', 'legal', 'spam', 'otro'];
  return valid.includes(cat as EmailCategory) ? (cat as EmailCategory) : 'otro';
}
