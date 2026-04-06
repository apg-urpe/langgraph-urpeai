/**
 * Email Intelligence API - Smart Search with AI
 * 
 * POST /api/emails/smart-search
 * 
 * Flujo:
 * 1. Usuario hace pregunta en lenguaje natural
 * 2. Gemini interpreta y genera parámetros de búsqueda Nylas
 * 3. Nylas busca en el servidor de correo
 * 4. Gemini analiza resultados y responde
 * 
 * Parámetros Nylas soportados:
 * - subject: búsqueda parcial en asunto
 * - search_query_native: búsqueda nativa Gmail/Outlook
 * - received_after: timestamp Unix (segundos)
 * - received_before: timestamp Unix (segundos)
 * - from: remitente
 * - has_attachment: boolean
 * - limit: máximo resultados (default 50)
 */

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GEMINI_API_KEY, GEMINI_MODEL } from '@/lib/ai/config';

const NYLAS_API_KEY = process.env.NYLAS_API_KEY;
const NYLAS_API_URI = process.env.NYLAS_API_URI || 'https://api.us.nylas.com';

// ============================================
// PROMPT PARA GENERAR QUERY NYLAS
// ============================================

const QUERY_BUILDER_PROMPT = `Eres un experto en búsqueda de correos electrónicos. Tu trabajo es interpretar la pregunta del usuario y generar parámetros de búsqueda para la API de Nylas.

IMPORTANTE: La fecha actual es ${new Date().toISOString().split('T')[0]}.

Debes responder SOLO con un JSON válido con esta estructura:

{
  "search_query_native": "consulta en sintaxis Gmail/Outlook (opcional)",
  "subject": "búsqueda en asunto (opcional, case-insensitive, parcial)",
  "from": "email del remitente (opcional)",
  "received_after": timestamp_unix_en_segundos (opcional),
  "received_before": timestamp_unix_en_segundos (opcional),
  "has_attachment": true/false (opcional),
  "limit": número_de_resultados (default 50, max 100),
  "interpretation": "Descripción breve de lo que buscarás"
}

REGLAS:
1. Para búsquedas de facturas usa: subject que contenga "factura", "invoice", "recibo", "pago"
2. Para meses específicos, calcula los timestamps Unix correctos (en segundos, no milisegundos)
3. search_query_native es poderoso para Gmail: "subject:(factura OR invoice) after:2024/10/01 before:2024/10/31"
4. Si el usuario menciona "octubre 2025", usa received_after=1727740800 (1 oct 2025) y received_before=1730419199 (31 oct 2025)
5. Siempre incluye interpretation para explicar la búsqueda
6. NO pongas comillas en los valores de timestamp, deben ser números

EJEMPLOS de timestamps:
- Enero 2025: after=1735689600, before=1738367999
- Febrero 2025: after=1738368000, before=1740787199
- Marzo 2025: after=1740787200, before=1743465599
- Abril 2025: after=1743465600, before=1746057599
- Mayo 2025: after=1746057600, before=1748735999
- Junio 2025: after=1748736000, before=1751327999
- Julio 2025: after=1751328000, before=1754006399
- Agosto 2025: after=1754006400, before=1756684799
- Septiembre 2025: after=1756684800, before=1759276799
- Octubre 2025: after=1759276800, before=1761955199
- Noviembre 2025: after=1761955200, before=1764547199
- Diciembre 2025: after=1764547200, before=1767225599
- Enero 2026: after=1767225600, before=1769903999

Responde SOLO con el JSON, sin explicaciones.`;

// ============================================
// PROMPT PARA RESPUESTA FINAL
// ============================================

const RESPONSE_PROMPT = `Eres un asistente de correo inteligente. Analiza los correos encontrados y responde la pregunta del usuario.

INSTRUCCIONES:
1. Resume la información encontrada de forma clara
2. Si hay facturas, lista: remitente, asunto, fecha, y montos si se mencionan
3. Usa formato Markdown para mejor legibilidad
4. Si no hay resultados relevantes, sugiere ajustar la búsqueda
5. Agrupa por categorías si hay varios tipos de correos
6. Destaca información importante en **negrita**

Responde en español de forma profesional y concisa.`;

// ============================================
// POST - Smart Search
// ============================================

export async function POST(request: NextRequest) {
  if (!GEMINI_API_KEY) {
    return NextResponse.json(
      { success: false, error: 'GEMINI_API_KEY not configured' },
      { status: 500 }
    );
  }

  if (!NYLAS_API_KEY) {
    return NextResponse.json(
      { success: false, error: 'NYLAS_API_KEY not configured' },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const { question, grant_id } = body;

    if (!question || !grant_id) {
      return NextResponse.json(
        { success: false, error: 'question and grant_id are required' },
        { status: 400 }
      );
    }

    console.log(`[API/SmartSearch] Question: "${question}"`);

    // ========================================
    // PASO 1: Gemini genera parámetros de búsqueda
    // ========================================
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const queryBuilderResult = await model.generateContent([
      QUERY_BUILDER_PROMPT,
      `Pregunta del usuario: ${question}`
    ]);

    let queryParamsText = queryBuilderResult.response.text().trim();
    
    // Limpiar markdown si viene envuelto
    if (queryParamsText.startsWith('```json')) {
      queryParamsText = queryParamsText.slice(7);
    }
    if (queryParamsText.startsWith('```')) {
      queryParamsText = queryParamsText.slice(3);
    }
    if (queryParamsText.endsWith('```')) {
      queryParamsText = queryParamsText.slice(0, -3);
    }
    queryParamsText = queryParamsText.trim();

    let searchParams;
    try {
      searchParams = JSON.parse(queryParamsText);
    } catch (parseError) {
      console.error('[API/SmartSearch] Failed to parse query params:', queryParamsText);
      return NextResponse.json({
        success: false,
        error: 'No pude interpretar tu pregunta. Intenta ser más específico.'
      }, { status: 400 });
    }

    console.log('[API/SmartSearch] Generated params:', JSON.stringify(searchParams, null, 2));

    // ========================================
    // PASO 2: Validar y sanitizar parámetros
    // ========================================
    
    // Validar timestamps - deben ser números enteros positivos
    let receivedAfter = null;
    let receivedBefore = null;
    
    if (searchParams.received_after) {
      const parsed = parseInt(String(searchParams.received_after), 10);
      if (!isNaN(parsed) && parsed > 0 && parsed < 2000000000) {
        receivedAfter = parsed;
      }
    }
    
    if (searchParams.received_before) {
      const parsed = parseInt(String(searchParams.received_before), 10);
      if (!isNaN(parsed) && parsed > 0 && parsed < 2000000000) {
        receivedBefore = parsed;
      }
    }

    // ========================================
    // PASO 3: Ejecutar búsqueda en Nylas
    // ========================================
    const nylasUrl = new URL(`${NYLAS_API_URI}/v3/grants/${grant_id}/messages`);
    
    // Aplicar parámetros de búsqueda (solo los válidos)
    const limit = Math.min(Math.max(parseInt(String(searchParams.limit)) || 50, 1), 100);
    nylasUrl.searchParams.set('limit', String(limit));
    
    // Preferir search_query_native para búsquedas complejas (Gmail/Outlook nativo)
    if (searchParams.search_query_native && typeof searchParams.search_query_native === 'string') {
      nylasUrl.searchParams.set('search_query_native', searchParams.search_query_native);
    } else {
      // Si no hay query nativa, usar parámetros individuales
      if (searchParams.subject && typeof searchParams.subject === 'string') {
        nylasUrl.searchParams.set('subject', searchParams.subject);
      }
      
      if (searchParams.from && typeof searchParams.from === 'string') {
        nylasUrl.searchParams.set('from', searchParams.from);
      }
      
      if (receivedAfter) {
        nylasUrl.searchParams.set('received_after', String(receivedAfter));
      }
      
      if (receivedBefore) {
        nylasUrl.searchParams.set('received_before', String(receivedBefore));
      }
      
      if (searchParams.has_attachment === true) {
        nylasUrl.searchParams.set('has_attachment', 'true');
      }
    }

    // NO usar 'select' - no es válido para messages endpoint de Nylas v3
    // El endpoint messages devuelve todos los campos por defecto

    console.log('[API/SmartSearch] Nylas URL:', nylasUrl.toString());

    const nylasResponse = await fetch(nylasUrl.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${NYLAS_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!nylasResponse.ok) {
      const errorText = await nylasResponse.text();
      console.error('[API/SmartSearch] Nylas error:', nylasResponse.status, errorText);
      
      if (nylasResponse.status === 404) {
        return NextResponse.json({
          success: false,
          error: 'Grant inválido o expirado. Reconecta tu cuenta de correo.'
        }, { status: 404 });
      }
      
      return NextResponse.json({
        success: false,
        error: `Error al buscar en correos: ${nylasResponse.status}`
      }, { status: nylasResponse.status });
    }

    const nylasData = await nylasResponse.json();
    const emails = nylasData.data || [];

    console.log(`[API/SmartSearch] Found ${emails.length} emails`);

    // ========================================
    // PASO 4: Gemini analiza resultados y responde
    // ========================================
    
    if (emails.length === 0) {
      return NextResponse.json({
        success: true,
        answer: `No encontré correos que coincidan con tu búsqueda.\n\n**Búsqueda realizada:** ${searchParams.interpretation}\n\n**Sugerencias:**\n- Verifica el rango de fechas\n- Prueba con términos más generales\n- Revisa si el correo está en otra carpeta`,
        emailsFound: 0,
        searchParams
      });
    }

    // ========================================
    // PASO 4.1: Para correos de facturas, obtener body completo
    // ========================================
    const isInvoiceSearch = question.toLowerCase().includes('factura') || 
                            question.toLowerCase().includes('pago') ||
                            question.toLowerCase().includes('recibo') ||
                            question.toLowerCase().includes('invoice') ||
                            searchParams.interpretation?.toLowerCase().includes('factura');

    // Función para extraer texto plano de HTML y encontrar montos
    const extractTextAndAmounts = (html: string): { text: string; amounts: string[] } => {
      // Remover estilos y scripts
      let text = html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
      
      // Buscar montos en varios formatos
      const amountPatterns = [
        /(?:USD|US\$|\$)\s*[\d,]+\.?\d*/gi,
        /(?:EUR|€)\s*[\d,]+\.?\d*/gi,
        /[\d,]+\.?\d*\s*(?:USD|EUR|dollars?)/gi,
        /\$[\d,]+\.?\d*/g
      ];
      
      const amounts: string[] = [];
      for (const pattern of amountPatterns) {
        const matches = html.match(pattern) || [];
        amounts.push(...matches);
      }
      
      return { text: text.slice(0, 1500), amounts: [...new Set(amounts)] };
    };

    // Para búsquedas de facturas, obtener body de los primeros 10 correos
    let enrichedEmails = emails;
    if (isInvoiceSearch && emails.length <= 15) {
      console.log('[API/SmartSearch] Fetching bodies for invoice emails...');
      
      enrichedEmails = await Promise.all(
        emails.slice(0, 10).map(async (email: any) => {
          try {
            const bodyUrl = `${NYLAS_API_URI}/v3/grants/${grant_id}/messages/${email.id}`;
            const bodyResponse = await fetch(bodyUrl, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${NYLAS_API_KEY}`,
                'Content-Type': 'application/json',
              },
            });
            
            if (bodyResponse.ok) {
              const bodyData = await bodyResponse.json();
              const htmlBody = bodyData.data?.body || '';
              const { text, amounts } = extractTextAndAmounts(htmlBody);
              return {
                ...email,
                bodyText: text,
                extractedAmounts: amounts
              };
            }
          } catch (err) {
            console.error(`[API/SmartSearch] Error fetching body for ${email.id}:`, err);
          }
          return email;
        })
      );
      
      // Agregar los correos restantes sin enriquecer
      if (emails.length > 10) {
        enrichedEmails = [...enrichedEmails, ...emails.slice(10)];
      }
    }

    // Preparar contexto de correos para Gemini
    const emailContext = enrichedEmails.map((e: any, i: number) => {
      const date = new Date(e.date * 1000).toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
      const from = e.from?.[0]?.name || e.from?.[0]?.email || 'Desconocido';
      const hasAttachment = Array.isArray(e.attachments) && e.attachments.length > 0;
      
      // Incluir montos extraídos si existen
      const amountsInfo = e.extractedAmounts?.length > 0 
        ? `\n   💰 Montos encontrados: ${e.extractedAmounts.join(', ')}`
        : '';
      
      // Usar bodyText si existe, sino snippet
      const content = e.bodyText || e.snippet?.slice(0, 300) || '(sin preview)';
      
      return `[${i + 1}] De: ${from}
   Fecha: ${date}
   Asunto: ${e.subject}
   Contenido: ${content}${amountsInfo}${hasAttachment ? '\n   📎 Tiene adjuntos' : ''}`;
    }).join('\n\n');

    const responsePromptFull = `${RESPONSE_PROMPT}

## Pregunta del usuario:
${question}

## Búsqueda realizada:
${searchParams.interpretation}

## Correos encontrados (${emails.length}):
${emailContext}`;

    const finalResult = await model.generateContent(responsePromptFull);
    const answer = finalResult.response.text().trim();

    return NextResponse.json({
      success: true,
      answer,
      emailsFound: emails.length,
      searchParams: {
        interpretation: searchParams.interpretation,
        received_after: searchParams.received_after,
        received_before: searchParams.received_before
      }
    });

  } catch (error) {
    console.error('[API/SmartSearch] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Error en búsqueda inteligente'
    }, { status: 500 });
  }
}
