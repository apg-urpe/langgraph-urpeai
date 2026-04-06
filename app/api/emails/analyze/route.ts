/**
 * Email Intelligence API - Analyze Email with Gemini
 * 
 * POST /api/emails/analyze - Analyze email content with AI
 * Body: { email_id, subject, body, from }
 */

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { EmailAnalysis, EmailCategory, EmailPriority, EmailSentiment } from '@/types/email';
import { GEMINI_API_KEY, GEMINI_MODEL } from '@/lib/ai/config';

// ============================================
// ANALYSIS PROMPT
// ============================================

const ANALYSIS_PROMPT = `Eres un asistente de análisis de correos electrónicos para un equipo de ventas y soporte.

Analiza el siguiente correo electrónico y devuelve SOLO un JSON válido con esta estructura exacta:

{
  "categoria": "ventas|soporte|interno|personal|marketing|facturacion|legal|spam|otro",
  "prioridad": "alta|media|baja",
  "resumen": "Resumen conciso en 2-3 oraciones del contenido principal",
  "tareas": ["Lista de acciones o tareas identificadas en el correo"],
  "sentimiento": "positivo|neutral|negativo",
  "entidades": {
    "fechas": ["fechas mencionadas"],
    "montos": ["cantidades o precios mencionados"],
    "contactos": ["nombres de personas"],
    "empresas": ["nombres de empresas"],
    "telefonos": ["números de teléfono"],
    "enlaces": ["URLs importantes"]
  },
  "palabrasClave": ["5-7 keywords principales"],
  "requiereRespuesta": true/false
}

Criterios de prioridad:
- ALTA: Urgente, deadline cercano, problema crítico, cliente importante
- MEDIA: Requiere acción pero no urgente
- BAJA: Informativo, no requiere acción inmediata

IMPORTANTE: Responde ÚNICAMENTE con el JSON, sin explicaciones adicionales.`;

// ============================================
// POST - Analyze Email
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
    const { email_id, subject, body: emailBody, from } = body;

    if (!email_id || !subject) {
      return NextResponse.json(
        { success: false, error: 'email_id and subject are required' },
        { status: 400 }
      );
    }

    // Preparar contenido para análisis
    const contentToAnalyze = `
De: ${from || 'Unknown'}
Asunto: ${subject}

Contenido:
${emailBody || '(Sin contenido)'}
`.trim();

    // Limitar longitud para evitar tokens excesivos
    const truncatedContent = contentToAnalyze.slice(0, 8000);

    console.log(`[API/Emails/Analyze] Analyzing email: ${email_id}`);

    // Llamar a Gemini
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const result = await model.generateContent([
      ANALYSIS_PROMPT,
      truncatedContent
    ]);

    const responseText = result.response.text();
    
    // Limpiar respuesta de markdown si es necesario
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
    const analysisData = JSON.parse(jsonText);

    // Validar y normalizar
    const analysis: Omit<EmailAnalysis, 'emailId' | 'analyzedAt'> = {
      categoria: validateCategory(analysisData.categoria),
      prioridad: validatePriority(analysisData.prioridad),
      resumen: analysisData.resumen || 'No se pudo generar resumen',
      tareas: Array.isArray(analysisData.tareas) ? analysisData.tareas : [],
      sentimiento: validateSentiment(analysisData.sentimiento),
      entidades: {
        fechas: analysisData.entidades?.fechas || [],
        montos: analysisData.entidades?.montos || [],
        contactos: analysisData.entidades?.contactos || [],
        empresas: analysisData.entidades?.empresas || [],
        telefonos: analysisData.entidades?.telefonos || [],
        enlaces: analysisData.entidades?.enlaces || []
      },
      palabrasClave: Array.isArray(analysisData.palabrasClave) ? analysisData.palabrasClave : [],
      requiereRespuesta: Boolean(analysisData.requiereRespuesta)
    };

    return NextResponse.json({
      success: true,
      analysis
    });

  } catch (error) {
    console.error('[API/Emails/Analyze] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Analysis failed' },
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

function validatePriority(pri: string): EmailPriority {
  const valid: EmailPriority[] = ['alta', 'media', 'baja'];
  return valid.includes(pri as EmailPriority) ? (pri as EmailPriority) : 'media';
}

function validateSentiment(sent: string): EmailSentiment {
  const valid: EmailSentiment[] = ['positivo', 'neutral', 'negativo'];
  return valid.includes(sent as EmailSentiment) ? (sent as EmailSentiment) : 'neutral';
}
