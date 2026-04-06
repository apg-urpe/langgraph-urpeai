import { NextRequest, NextResponse } from 'next/server';
import { WhatsAppClient } from '@kapso/whatsapp-cloud-api';
import { createClient } from '@supabase/supabase-js';

// Setup Supabase admin client to bypass RLS for backend tasks
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message_id, content, metadata } = body;

    if (!message_id || !content) {
      return NextResponse.json({ error: 'Faltan campos requeridos (message_id, content)' }, { status: 400 });
    }

    const conversacion_id = metadata?.conversacion_id;
    const contacto_id = metadata?.contacto_id;

    if (!conversacion_id || !contacto_id) {
      return NextResponse.json({ error: 'No se encontró conversacion_id o contacto_id en metadata' }, { status: 400 });
    }

    // 1. Obtener la conversación para sacar el numero_id
    const { data: conversacion, error: convError } = await supabase
      .from('wp_conversaciones')
      .select('metadata')
      .eq('id', conversacion_id)
      .single();

    if (convError || !conversacion) {
      console.error('[WhatsApp API] Error al buscar conversación:', convError);
      return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 });
    }

    // El ID del número de la empresa está en la metadata de la conversación
    const numero_id = conversacion.metadata?.numero_id;
    if (!numero_id) {
      console.error('[WhatsApp API] La conversación no tiene un numero_id asociado en metadata');
      return NextResponse.json({ error: 'No hay un número asociado a la conversación' }, { status: 400 });
    }

    // 2. Obtener el número de Kapso (id_kapso) de wp_numeros
    const { data: numero, error: numError } = await supabase
      .from('wp_numeros')
      .select('id_kapso')
      .eq('id', numero_id)
      .single();

    if (numError || !numero?.id_kapso) {
      console.error('[WhatsApp API] Número no encontrado o sin id_kapso:', numError);
      return NextResponse.json({ error: 'Número no encontrado o no está vinculado a Kapso' }, { status: 404 });
    }

    const kapsoPhoneNumberId = numero.id_kapso;

    // 3. Obtener el teléfono del contacto
    const { data: contactoDestino, error: contactError } = await supabase
      .from('wp_contactos')
      .select('telefono')
      .eq('id', contacto_id)
      .single();

    if (contactError || !contactoDestino?.telefono) {
      console.error('[WhatsApp API] Contacto sin teléfono:', contactError);
      return NextResponse.json({ error: 'Contacto no encontrado o sin teléfono' }, { status: 404 });
    }

    // Asegurarse de que el formato sea válido para WhatsApp (+ prefix is handled by Kapso SDK usually, but let's assume valid clean string)
    const toPhone = contactoDestino.telefono.replace(/[^0-9]/g, '');

    // 4. Instanciar cliente de Kapso y enviar mensaje
    const apiKey = process.env.KAPSO_API_KEY;
    if (!apiKey) {
      console.error('[WhatsApp API] Falta configuración KAPSO_API_KEY en las variables de entorno');
      return NextResponse.json({ error: 'Falta configuración KAPSO_API_KEY' }, { status: 500 });
    }

    const client = new WhatsAppClient({
      baseUrl: process.env.KAPSO_API_BASE_URL || 'https://api.kapso.ai/meta/whatsapp',
      kapsoApiKey: apiKey
    });

    try {
      const response = await client.messages.sendText({
        phoneNumberId: kapsoPhoneNumberId,
        to: toPhone,
        body: content
      });

      // 5. Actualizar estado del mensaje en wp_mensajes
      await supabase
        .from('wp_mensajes')
        .update({ 
          status: 'enviado',
          metadata: {
            ...metadata,
            kapso_message_id: (response as any).messages?.[0]?.id || null, // Guardar ID de Meta si existe
            via_kapso: true
          }
        })
        .eq('id', message_id);

      return NextResponse.json({ success: true, messageId: message_id, kapsoResponse: response });

    } catch (sendError: any) {
      console.error('[WhatsApp API] Error al enviar a Kapso:', sendError);
      
      // Actualizar a estado error
      await supabase
        .from('wp_mensajes')
        .update({ status: 'error' })
        .eq('id', message_id);

      return NextResponse.json({ 
        error: 'Error enviando mensaje con Kapso', 
        details: sendError?.response?.data || sendError.message 
      }, { status: 500 });
    }

  } catch (err: any) {
    console.error('[WhatsApp API] Error general:', err);
    return NextResponse.json({ error: 'Error procesando solicitud' }, { status: 500 });
  }
}