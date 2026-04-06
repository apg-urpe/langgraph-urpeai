/**
 * Improve Message API
 * Mejora la redacción de un mensaje usando Gemini + contexto 360 del contacto
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GEMINI_API_KEY, GEMINI_MODEL, buildGeminiUrl } from '@/lib/ai/config';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Build context string from contact data
function buildContactContext(contact: any, conversations: any[], notes: any[]): string {
  const parts: string[] = [];
  
  if (contact) {
    parts.push(`## CONTACTO`);
    parts.push(`- Nombre: ${contact.nombre || ''} ${contact.apellido || ''}`);
    if (contact.telefono) parts.push(`- Teléfono: ${contact.telefono}`);
    if (contact.email) parts.push(`- Email: ${contact.email}`);
    if (contact.estado) parts.push(`- Estado: ${contact.estado}`);
    if (contact.es_calificado) parts.push(`- Calificación: ${contact.es_calificado}`);
    if (contact.origen) parts.push(`- Origen: ${contact.origen}`);
    if (contact.etapa_emocional) parts.push(`- Estado emocional: ${contact.etapa_emocional}`);
    if (contact.metadata) {
      parts.push(`- Metadata: ${JSON.stringify(contact.metadata)}`);
    }
  }
  
  if (conversations?.length > 0) {
    parts.push(`\n## CONVERSACIONES RECIENTES (${conversations.length})`);
    conversations.slice(0, 3).forEach((conv: any) => {
      if (conv.resumen) parts.push(`- ${conv.resumen}`);
    });
  }
  
  if (notes?.length > 0) {
    parts.push(`\n## NOTAS (${notes.length})`);
    notes.slice(0, 5).forEach((note: any) => {
      parts.push(`- ${note.titulo || 'Nota'}: ${note.descripcion || ''}`);
    });
  }
  
  return parts.join('\n');
}

export async function POST(request: NextRequest) {
  try {
    const { message, contactId, enterpriseId } = await request.json();

    if (!message || !contactId) {
      return NextResponse.json(
        { error: 'Message y contactId son requeridos' },
        { status: 400 }
      );
    }

    // Get contact data
    const { data: contact, error: contactError } = await supabase
      .from('wp_contactos')
      .select('*')
      .eq('id', contactId)
      .single();

    if (contactError) {
      console.error('[ImproveMessage] Contact error:', contactError);
    }

    // Get recent conversations
    const { data: conversations } = await supabase
      .from('wp_conversaciones')
      .select('id, resumen, status, fecha_inicio')
      .eq('contacto_id', contactId)
      .order('fecha_inicio', { ascending: false })
      .limit(5);

    // Get notes
    const { data: notes } = await supabase
      .from('wp_contactos_nota')
      .select('titulo, descripcion, created_at')
      .eq('contacto_id', contactId)
      .order('created_at', { ascending: false })
      .limit(5);

    const context = buildContactContext(contact, conversations || [], notes || []);

    // Build prompt for Gemini
    const systemPrompt = `Eres un asistente experto en comunicación comercial. Tu tarea es mejorar la redacción de mensajes de WhatsApp para asesores de ventas.

REGLAS:
1. Mantén el mensaje CONCISO (máximo 2-3 oraciones)
2. Usa un tono profesional pero cercano
3. Preserva la intención original del mensaje
4. Personaliza usando el contexto del contacto cuando sea relevante
5. NO uses emojis excesivos (máximo 1-2 si es apropiado)
6. Evita ser demasiado formal o robótico
7. El mensaje debe sonar natural y humano

CONTEXTO DEL CONTACTO:
${context}

Responde SOLO con el mensaje mejorado, sin explicaciones adicionales.`;

    const userMessage = `Mejora este mensaje de WhatsApp:\n\n"${message}"`;

    // Call Gemini API
    const geminiUrl = buildGeminiUrl(GEMINI_MODEL);
    
    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: systemPrompt }] },
          { role: 'model', parts: [{ text: 'Entendido. Envíame el mensaje a mejorar.' }] },
          { role: 'user', parts: [{ text: userMessage }] }
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 256,
          topP: 0.9
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[ImproveMessage] Gemini error:', errorText);
      return NextResponse.json(
        { error: 'Error al procesar con IA' },
        { status: 500 }
      );
    }

    const data = await response.json();
    const improvedMessage = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || message;

    return NextResponse.json({
      success: true,
      original: message,
      improved: improvedMessage
    });

  } catch (error: any) {
    console.error('[ImproveMessage] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno' },
      { status: 500 }
    );
  }
}
