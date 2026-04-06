/**
 * Webhook endpoint para recibir alertas externas
 * 
 * Recibe alertas de:
 * - n8n workflows
 * - Servicios externos de monitoreo
 * - Edge Functions de Supabase
 * 
 * Requiere header de autenticación: X-Urpe-Auth
 */

import { NextRequest, NextResponse } from 'next/server';
import { sendAlert, type Alert, type AlertSeverity } from '@/lib/alert-service';
import { logError, logInfo } from '@/lib/error-logger';

const AUTH_HEADER = 'X-Urpe-Auth';
const AUTH_VALUE = 'urpe-secure-chat-2024';

interface WebhookPayload {
  type: string;
  severity?: AlertSeverity;
  title: string;
  message: string;
  context?: Record<string, unknown>;
  empresaId?: number;
  userId?: string;
  channels?: ('slack' | 'email' | 'webhook' | 'inApp' | 'console')[];
}

export async function POST(request: NextRequest) {
  try {
    // Verificar autenticación
    const authHeader = request.headers.get(AUTH_HEADER);
    if (authHeader !== AUTH_VALUE) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Invalid or missing authentication header' },
        { status: 401 }
      );
    }

    // Parsear body
    const body: WebhookPayload = await request.json();

    // Validar campos requeridos
    if (!body.type || !body.title || !body.message) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Missing required fields: type, title, message' },
        { status: 400 }
      );
    }

    // Validar severidad
    const validSeverities: AlertSeverity[] = ['low', 'medium', 'high', 'critical'];
    const severity = body.severity && validSeverities.includes(body.severity) 
      ? body.severity 
      : 'medium';

    // Construir alerta
    const alert: Alert = {
      type: body.type,
      severity,
      title: body.title,
      message: body.message,
      context: {
        ...body.context,
        source: 'webhook',
        ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
      },
      empresaId: body.empresaId,
      userId: body.userId,
      channels: body.channels,
      timestamp: new Date()
    };

    // Enviar alerta
    await sendAlert(alert);

    // Log de info
    await logInfo('alerts-webhook', `Alert received: ${body.title}`, {
      additionalData: { type: body.type, severity }
    });

    return NextResponse.json({
      success: true,
      alertId: alert.id,
      timestamp: alert.timestamp?.toISOString()
    });
  } catch (error) {
    await logError('alerts-webhook', error);
    
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to process alert' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    service: 'Urpe AI Alerts Webhook',
    status: 'online',
    version: '1.0.0',
    usage: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [AUTH_HEADER]: '<auth-token>'
      },
      body: {
        type: 'string (required)',
        severity: 'low | medium | high | critical (optional, default: medium)',
        title: 'string (required)',
        message: 'string (required)',
        context: 'object (optional)',
        empresaId: 'number (optional)',
        userId: 'string (optional)',
        channels: 'array of: slack, email, webhook, inApp, console (optional)'
      }
    }
  });
}
