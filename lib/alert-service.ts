/**
 * Alert Service - Sistema de Alertas en Tiempo Real
 * 
 * Envía notificaciones automáticas cuando ocurren eventos críticos:
 * - Errores críticos → Slack + Email
 * - Múltiples errores en corto tiempo → Slack
 * - Queries lentas → Dashboard
 * - Web Vitals pobres → Dashboard
 * - Intentos de login fallidos → Email admin
 */

import { supabase } from './supabase-client';
import { logError, logWarning } from './error-logger';

// ============================================
// TYPES
// ============================================

export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';
export type AlertChannel = 'slack' | 'email' | 'webhook' | 'inApp' | 'console';

export interface AlertConfig {
  slack?: {
    webhookUrl: string;
    channel?: string;
    username?: string;
    iconEmoji?: string;
  };
  email?: {
    recipients: string[];
    fromAddress?: string;
  };
  webhook?: {
    url: string;
    headers?: Record<string, string>;
  };
  inApp?: {
    enabled: boolean;
  };
}

export interface Alert {
  id?: string;
  type: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  context?: Record<string, unknown>;
  timestamp?: Date;
  channels?: AlertChannel[];
  empresaId?: number;
  userId?: string;
}

export interface AlertRule {
  name: string;
  condition: (alert: Alert) => boolean;
  channels: AlertChannel[];
  cooldownMs?: number; // Tiempo mínimo entre alertas del mismo tipo
}

// ============================================
// CONFIGURATION
// ============================================

// Configuración por defecto (puede sobrescribirse con env vars)
const DEFAULT_CONFIG: AlertConfig = {
  slack: {
    webhookUrl: process.env.SLACK_WEBHOOK_URL || '',
    channel: '#alerts',
    username: 'Urpe AI Monitor',
    iconEmoji: ':warning:'
  },
  inApp: {
    enabled: true
  }
};

// Reglas de enrutamiento de alertas
const ALERT_RULES: AlertRule[] = [
  {
    name: 'critical-errors',
    condition: (alert) => alert.severity === 'critical',
    channels: ['slack', 'email', 'inApp', 'console'],
    cooldownMs: 60000 // 1 minuto
  },
  {
    name: 'high-severity',
    condition: (alert) => alert.severity === 'high',
    channels: ['slack', 'inApp', 'console'],
    cooldownMs: 300000 // 5 minutos
  },
  {
    name: 'medium-severity',
    condition: (alert) => alert.severity === 'medium',
    channels: ['inApp', 'console'],
    cooldownMs: 600000 // 10 minutos
  },
  {
    name: 'low-severity',
    condition: (alert) => alert.severity === 'low',
    channels: ['console'],
    cooldownMs: 0
  }
];

// Cache para cooldowns
const alertCooldowns: Map<string, number> = new Map();

// ============================================
// CORE FUNCTIONS
// ============================================

/**
 * Envía una alerta a los canales apropiados según su severidad
 */
export async function sendAlert(alert: Alert, config: AlertConfig = DEFAULT_CONFIG): Promise<void> {
  // SECURITY: Ensure alerts are partitioned by enterprise
  if (!alert.empresaId && alert.severity !== 'critical') {
    console.warn(`[AlertService] Alert created without empresaId: ${alert.title}`);
  }

  const enrichedAlert: Alert = {
    ...alert,
    id: alert.id || crypto.randomUUID(),
    timestamp: alert.timestamp || new Date()
  };

  // Determinar canales según reglas
  const channels = determineChannels(enrichedAlert);
  
  // Verificar cooldown
  const cooldownKey = `${alert.type}:${alert.severity}`;
  const lastSent = alertCooldowns.get(cooldownKey) || 0;
  const rule = ALERT_RULES.find(r => r.condition(enrichedAlert));
  
  if (rule?.cooldownMs && Date.now() - lastSent < rule.cooldownMs) {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Alert] Skipped (cooldown): ${alert.title}`);
    }
    return;
  }

  // Actualizar cooldown
  alertCooldowns.set(cooldownKey, Date.now());

  // Enviar a cada canal
  const sendPromises = channels.map(channel => {
    switch (channel) {
      case 'slack':
        return sendSlackAlert(enrichedAlert, config.slack);
      case 'email':
        return sendEmailAlert(enrichedAlert, config.email);
      case 'webhook':
        return sendWebhookAlert(enrichedAlert, config.webhook);
      case 'inApp':
        return sendInAppAlert(enrichedAlert);
      case 'console':
        return sendConsoleAlert(enrichedAlert);
      default:
        return Promise.resolve();
    }
  });

  await Promise.allSettled(sendPromises);
}

/**
 * Determina los canales según las reglas configuradas
 */
function determineChannels(alert: Alert): AlertChannel[] {
  if (alert.channels) return alert.channels;
  
  for (const rule of ALERT_RULES) {
    if (rule.condition(alert)) {
      return rule.channels;
    }
  }
  
  return ['console'];
}

// ============================================
// CHANNEL HANDLERS
// ============================================

/**
 * Envía alerta a Slack via webhook
 */
async function sendSlackAlert(
  alert: Alert,
  config?: AlertConfig['slack']
): Promise<void> {
  if (!config?.webhookUrl) {
    if (process.env.NODE_ENV === 'development') {
      console.log('[Alert] Slack webhook not configured');
    }
    return;
  }

  const severityEmojis: Record<AlertSeverity, string> = {
    critical: ':rotating_light:',
    high: ':warning:',
    medium: ':large_yellow_circle:',
    low: ':information_source:'
  };

  const severityColors: Record<AlertSeverity, string> = {
    critical: '#dc2626',
    high: '#f59e0b',
    medium: '#3b82f6',
    low: '#6b7280'
  };

  const payload = {
    channel: config.channel,
    username: config.username,
    icon_emoji: config.iconEmoji,
    attachments: [
      {
        color: severityColors[alert.severity],
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: `${severityEmojis[alert.severity]} ${alert.title}`,
              emoji: true
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: alert.message
            }
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `*Tipo:* ${alert.type} | *Severidad:* ${alert.severity.toUpperCase()} | *Hora:* ${alert.timestamp?.toISOString()}`
              }
            ]
          }
        ]
      }
    ]
  };

  try {
    const response = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Slack webhook failed: ${response.status}`);
    }
  } catch (error) {
    logWarning('alert-service', `Failed to send Slack alert: ${error}`, {
      additionalData: { alert }
    });
  }
}

/**
 * Envía alerta por email (usando Supabase Edge Function o servicio externo)
 */
async function sendEmailAlert(
  alert: Alert,
  config?: AlertConfig['email']
): Promise<void> {
  if (!config?.recipients?.length) {
    return;
  }

  try {
    // Llamar a Edge Function de Supabase para enviar email
    const { error } = await supabase.functions.invoke('send-alert-email', {
      body: {
        to: config.recipients,
        subject: `[${alert.severity.toUpperCase()}] ${alert.title}`,
        alert: {
          ...alert,
          timestamp: alert.timestamp?.toISOString()
        }
      }
    });

    if (error) {
      throw error;
    }
  } catch (error) {
    logWarning('alert-service', `Failed to send email alert: ${error}`, {
      additionalData: { alert }
    });
  }
}

/**
 * Envía alerta a un webhook externo (n8n, Zapier, etc.)
 */
async function sendWebhookAlert(
  alert: Alert,
  config?: AlertConfig['webhook']
): Promise<void> {
  if (!config?.url) {
    return;
  }

  try {
    const response = await fetch(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Urpe-Auth': process.env.WEBHOOK_AUTH_TOKEN || '',
        ...config.headers
      },
      body: JSON.stringify({
        ...alert,
        timestamp: alert.timestamp?.toISOString()
      })
    });

    if (!response.ok) {
      throw new Error(`Webhook failed: ${response.status}`);
    }
  } catch (error) {
    logWarning('alert-service', `Failed to send webhook alert: ${error}`, {
      additionalData: { alert }
    });
  }
}

/**
 * Guarda alerta en la base de datos para mostrar en el admin panel
 */
async function sendInAppAlert(alert: Alert): Promise<void> {
  try {
    const { error } = await supabase
      .from('wp_system_alerts')
      .insert({
        type: alert.type,
        severity: alert.severity,
        title: alert.title,
        message: alert.message,
        context: alert.context,
        empresa_id: alert.empresaId,
        user_id: alert.userId,
        created_at: alert.timestamp?.toISOString()
      });

    if (error) {
      // Si la tabla no existe, solo loguear en consola
      if (error.code === '42P01') {
        console.log('[Alert] InApp table not found, skipping DB storage');
        return;
      }
      throw error;
    }
  } catch (error) {
    // No fallar silenciosamente, pero no bloquear
    console.warn('[Alert] Failed to save inApp alert:', error);
  }
}

/**
 * Muestra alerta en consola (desarrollo/producción)
 */
async function sendConsoleAlert(alert: Alert): Promise<void> {
  const severityStyles: Record<AlertSeverity, string> = {
    critical: 'background: #dc2626; color: white; padding: 2px 6px; border-radius: 2px;',
    high: 'background: #f59e0b; color: black; padding: 2px 6px; border-radius: 2px;',
    medium: 'background: #3b82f6; color: white; padding: 2px 6px; border-radius: 2px;',
    low: 'background: #6b7280; color: white; padding: 2px 6px; border-radius: 2px;'
  };

  console.log(
    `%c[ALERT] ${alert.severity.toUpperCase()}`,
    severityStyles[alert.severity],
    `\n${alert.title}\n${alert.message}`,
    alert.context ? `\nContext: ${JSON.stringify(alert.context)}` : ''
  );
}

// ============================================
// CONVENIENCE FUNCTIONS
// ============================================

/**
 * Alerta de error crítico
 */
export async function alertCriticalError(
  title: string,
  error: Error | string,
  context?: Record<string, unknown>
): Promise<void> {
  await sendAlert({
    type: 'error',
    severity: 'critical',
    title,
    message: error instanceof Error ? error.message : error,
    context: {
      stack: error instanceof Error ? error.stack : undefined,
      ...context
    }
  });
}

/**
 * Alerta de múltiples errores en poco tiempo
 */
export async function alertErrorSpike(
  errorCount: number,
  timeWindowMinutes: number,
  sampleErrors?: string[]
): Promise<void> {
  await sendAlert({
    type: 'error_spike',
    severity: 'high',
    title: `Error Spike Detected`,
    message: `${errorCount} errors in the last ${timeWindowMinutes} minutes`,
    context: { errorCount, timeWindowMinutes, sampleErrors }
  });
}

/**
 * Alerta de query lenta
 */
export async function alertSlowQuery(
  queryName: string,
  durationMs: number,
  threshold: number = 5000
): Promise<void> {
  await sendAlert({
    type: 'slow_query',
    severity: durationMs > threshold * 2 ? 'high' : 'medium',
    title: `Slow Query: ${queryName}`,
    message: `Query took ${durationMs.toFixed(0)}ms (threshold: ${threshold}ms)`,
    context: { queryName, durationMs, threshold }
  });
}

/**
 * Alerta de Web Vital pobre
 */
export async function alertPoorWebVital(
  metricName: string,
  value: number,
  threshold: number
): Promise<void> {
  await sendAlert({
    type: 'web_vital',
    severity: 'medium',
    title: `Poor Web Vital: ${metricName}`,
    message: `${metricName} = ${value.toFixed(2)} (threshold: ${threshold})`,
    context: { metricName, value, threshold }
  });
}

/**
 * Alerta de intentos de login fallidos
 */
export async function alertLoginFailures(
  email: string,
  attemptCount: number,
  ipAddress?: string
): Promise<void> {
  await sendAlert({
    type: 'security',
    severity: attemptCount >= 5 ? 'high' : 'medium',
    title: `Multiple Login Failures`,
    message: `${attemptCount} failed login attempts for ${email}`,
    context: { email, attemptCount, ipAddress }
  });
}

/**
 * Alerta de sistema - mensajes generales
 */
export async function alertSystem(
  title: string,
  message: string,
  severity: AlertSeverity = 'low',
  context?: Record<string, unknown>
): Promise<void> {
  await sendAlert({
    type: 'system',
    severity,
    title,
    message,
    context
  });
}

// ============================================
// ERROR SPIKE DETECTION
// ============================================

const errorTimestamps: number[] = [];
const ERROR_WINDOW_MS = 5 * 60 * 1000; // 5 minutos
const ERROR_THRESHOLD = 5;

/**
 * Registra un error y detecta spikes
 */
export async function trackErrorForSpike(errorMessage: string): Promise<void> {
  const now = Date.now();
  
  // Limpiar timestamps viejos
  while (errorTimestamps.length > 0 && errorTimestamps[0] < now - ERROR_WINDOW_MS) {
    errorTimestamps.shift();
  }
  
  // Agregar nuevo timestamp
  errorTimestamps.push(now);
  
  // Verificar si hay spike
  if (errorTimestamps.length >= ERROR_THRESHOLD) {
    await alertErrorSpike(
      errorTimestamps.length,
      ERROR_WINDOW_MS / 60000,
      [errorMessage]
    );
    // Reset para evitar alertas repetidas
    errorTimestamps.length = 0;
  }
}

// ============================================
// QUERY HELPERS
// ============================================

/**
 * Obtiene alertas recientes de la base de datos
 */
export async function getRecentAlerts(
  limit: number = 50,
  severity?: AlertSeverity,
  empresaId?: number
): Promise<Alert[]> {
  try {
    let query = supabase
      .from('wp_system_alerts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (severity) {
      query = query.eq('severity', severity);
    }

    if (empresaId) {
      query = query.eq('empresa_id', empresaId);
    }

    const { data, error } = await query;

    if (error) {
      if (error.code === '42P01') {
        return []; // Tabla no existe
      }
      throw error;
    }

    return (data || []).map(row => ({
      id: row.id,
      type: row.type,
      severity: row.severity,
      title: row.title,
      message: row.message,
      context: row.context,
      timestamp: new Date(row.created_at),
      empresaId: row.empresa_id,
      userId: row.user_id
    }));
  } catch (error) {
    logError('alert-service', error, { additionalData: { action: 'getRecentAlerts' } });
    return [];
  }
}

/**
 * Marca una alerta como leída/resuelta
 */
export async function dismissAlert(alertId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('wp_system_alerts')
      .update({ dismissed_at: new Date().toISOString() })
      .eq('id', alertId);

    return !error;
  } catch {
    return false;
  }
}
