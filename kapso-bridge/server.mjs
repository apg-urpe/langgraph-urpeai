import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import 'dotenv/config';

import cors from 'cors';

import express from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import { WhatsAppClient } from '@kapso/whatsapp-cloud-api';



const requiredEnvs = ['KAPSO_API_KEY'];

for (const name of requiredEnvs) {

  if (!process.env[name]) {

    throw new Error(`Falta variable de entorno requerida: ${name}`);

  }

}



const PORT = Number(process.env.PORT || process.env.KAPSO_BRIDGE_PORT || 3001);

const KAPSO_API_KEY = process.env.KAPSO_API_KEY;

const KAPSO_BASE_URL = process.env.KAPSO_BASE_URL || 'https://api.kapso.ai/meta/whatsapp';

const KAPSO_WEBHOOK_SECRET = process.env.KAPSO_WEBHOOK_SECRET || '';

const INTERNAL_AGENT_API_URL = process.env.INTERNAL_AGENT_API_URL || 'http://127.0.0.1:8000/api/v1/kapso/inbound';

const KAPSO_INTERNAL_TOKEN = process.env.KAPSO_INTERNAL_TOKEN || '';

const DEFAULT_EMPRESA_ID = process.env.DEFAULT_EMPRESA_ID || '1';

const DEBUG_FLAG = /^(1|true|yes|on)$/i;

const KAPSO_PUBLIC_DEBUG = DEBUG_FLAG.test(String(process.env.KAPSO_PUBLIC_DEBUG || ''));

const KAPSO_DEBUG_TOKEN = process.env.KAPSO_DEBUG_TOKEN || '';



const client = new WhatsAppClient({

  baseUrl: KAPSO_BASE_URL,

  kapsoApiKey: KAPSO_API_KEY,

});



const app = express();

const threadQueues = new Map();

const processedMessageIds = new Map();

const bridgeDebugEvents = [];

const MAX_BRIDGE_DEBUG_EVENTS = 200;

const PROCESSED_MESSAGE_TTL_MS = 10 * 60 * 1000;

const PROCESS_TIMEOUT_MS = 180 * 1000;

const PROCESSING_MESSAGE_TTL_MS = PROCESS_TIMEOUT_MS + 30 * 1000;

const MAX_SEND_RETRIES = 3;

const RATE_LIMIT_BASE_DELAY_MS = 2000;

const IN_FLIGHT_DELAY_MS = 1500;

const DEFAULT_EMPTY_REPLY_TEXT = 'Hola, te leo. ¿En qué puedo ayudarte?';

const MEDIA_TYPES = ['image', 'audio', 'video', 'document', 'sticker'];



app.use(cors());

app.use(express.json({

  limit: '5mb',

  verify: (req, _res, buf) => {

    req.rawBody = buf;

  },

}));



function sleep(ms) {

  return new Promise(resolve => setTimeout(resolve, ms));

}



function addBridgeDebugEvent(stage, payload = {}) {

  bridgeDebugEvents.unshift({

    timestamp: new Date().toISOString(),

    source: 'bridge',

    stage,

    payload,

  });

  if (bridgeDebugEvents.length > MAX_BRIDGE_DEBUG_EVENTS) {

    bridgeDebugEvents.length = MAX_BRIDGE_DEBUG_EVENTS;

  }

}



function maskSecret(value) {

  if (!value) return null;

  if (String(value).length <= 8) return '***';

  return `${String(value).slice(0, 4)}...${String(value).slice(-4)}`;

}



function appendDebugToken(pathname, token) {

  if (!token) return pathname;

  const url = new URL(pathname, 'http://localhost');

  url.searchParams.set('token', token);

  return `${url.pathname}${url.search}`;

}



function extractAccessToken(req) {

  const headerToken = req.headers['x-kapso-debug-token'] ?? req.headers['x-kapso-internal-token'];

  if (typeof headerToken === 'string' && headerToken.trim()) return headerToken.trim();

  if (Array.isArray(headerToken) && headerToken[0]) return String(headerToken[0]).trim();

  const authHeader = req.headers.authorization;

  if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {

    return authHeader.slice(7).trim();

  }

  const queryToken = req.query?.token;

  if (typeof queryToken === 'string' && queryToken.trim()) return queryToken.trim();

  if (Array.isArray(queryToken) && queryToken[0]) return String(queryToken[0]).trim();

  return '';

}



function isLoopbackRequest(req) {

  const candidates = [req.ip, req.socket?.remoteAddress];

  return candidates.some(value => value === '127.0.0.1' || value === '::1' || value === '::ffff:127.0.0.1');

}



function requireSendAccess(req, res) {
  const required = process.env.SEND_API_KEY;
  if (!required) return true; // Sin env configurada, acceso libre
  const key = req.headers['x-send-key'];
  if (!key || key !== required) {
    res.status(401).json({ error: 'unauthorized', detail: 'X-Send-Key inválida o ausente' });
    return false;
  }
  return true;
}

function requireDebugAccess(req, res) {

  if (KAPSO_PUBLIC_DEBUG || DEBUG_FLAG.test(String(process.env.DEBUG || '')) || isLoopbackRequest(req)) {

    return true;

  }

  const allowedTokens = new Set([KAPSO_DEBUG_TOKEN, KAPSO_INTERNAL_TOKEN].filter(Boolean));

  if (!allowedTokens.size) {

    res.status(503).json({ error: 'debug_disabled' });

    return false;

  }

  if (!allowedTokens.has(extractAccessToken(req))) {

    res.status(401).json({ error: 'unauthorized' });

    return false;

  }

  return true;

}



function getBridgeDebugConfig() {

  return {

    port: PORT,

    kapso_base_url: KAPSO_BASE_URL,

    internal_agent_api_url: INTERNAL_AGENT_API_URL,

    kapso_api_key: maskSecret(KAPSO_API_KEY),

    kapso_webhook_secret: maskSecret(KAPSO_WEBHOOK_SECRET),

    kapso_internal_token: maskSecret(KAPSO_INTERNAL_TOKEN),

  };

}



function getFastApiBaseUrl() {

  return INTERNAL_AGENT_API_URL.replace(/\/api\/v1\/kapso\/inbound$/, '');

}



async function proxyFastApiRequest(req, res, pathname) {

  const headers = {};

  if (KAPSO_INTERNAL_TOKEN) {

    headers['x-kapso-internal-token'] = KAPSO_INTERNAL_TOKEN;

  }

  if (req.headers['content-type']) {

    headers['content-type'] = req.headers['content-type'];

  }



  const targetUrl = new URL(pathname, `${getFastApiBaseUrl()}/`).toString();

  const requestInit = {

    method: req.method,

    headers,

  };



  if (req.method !== 'GET' && req.method !== 'HEAD') {

    requestInit.body = JSON.stringify(req.body ?? {});

  }



  try {

    const response = await fetch(targetUrl, requestInit);

    const contentType = response.headers.get('content-type') || 'application/json; charset=utf-8';

    const bodyText = await response.text();

    res.status(response.status);

    res.set('Content-Type', contentType);

    res.send(bodyText);

  } catch (error) {

    res.status(502).json({

      error: 'fastapi_proxy_error',

      detail: String(error?.message || error),

      target: pathname,

    });

  }

}

function buildKapsoInteractions(bridgeEvents = [], fastapiEvents = []) {

  const allEvents = [...bridgeEvents, ...fastapiEvents]

    .filter(event => event && event.timestamp && event.stage)

    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));



  const interactionMap = new Map();



  for (const event of allEvents) {

    const payload = event.payload || {};

    const messageId = payload.message_id || payload.wa_id || payload.id;

    if (!messageId) continue;



    if (!interactionMap.has(messageId)) {

      interactionMap.set(messageId, {

        id: messageId,

        message_id: messageId,

        started_at: event.timestamp,

        status: 'processing',

        tools_used: [],

        agent_runs: [],

      });

    }



    const interaction = interactionMap.get(messageId);



    if (event.source === 'fastapi') {

      if (event.stage === 'inbound_received') {

        if (payload.from) interaction.from_phone = payload.from;

        if (payload.contact_name) interaction.contact_name = payload.contact_name;

        if (payload.message_type) interaction.message_type = payload.message_type;

        if (payload.text) interaction.message_text = payload.text;

        if (payload.phone_number_id) interaction.phone_number_id = payload.phone_number_id;
        if (payload.empresa_id != null) interaction.empresa_id = payload.empresa_id;

      }



      if (event.stage === 'inbound_entities_resolved') {
        if (payload.empresa_id != null) interaction.empresa_id = payload.empresa_id;
        if (payload.contacto_id != null) interaction.contacto_id = payload.contacto_id;
      }

      if (event.stage === 'run_agent_start') {

        interaction.agent_id = payload.agent_id;

        interaction.memory_session_id = payload.memory_session_id;

        if (payload.conversation_id) interaction.conversation_id = payload.conversation_id;

        if (payload.model) interaction.model_used = payload.model;


      }



      if (event.stage === 'run_agent_done') {

        interaction.agent_id = payload.agent_id;
        if (payload.empresa_id != null) interaction.empresa_id = payload.empresa_id;

        if (payload.conversation_id) interaction.conversation_id = payload.conversation_id;

        if (payload.agent_name) interaction.agent_name = payload.agent_name;

        if (payload.model_used) interaction.model_used = payload.model_used;

        if (payload.response_chars !== undefined) interaction.response_chars = payload.response_chars;

        if (payload.response_preview) interaction.response_preview = payload.response_preview;

        if (payload.reaction_emoji) interaction.reaction_emoji = payload.reaction_emoji;

        if (Array.isArray(payload.tools_used)) interaction.tools_used = payload.tools_used;

        if (Array.isArray(payload.agent_runs)) interaction.agent_runs = payload.agent_runs;

        if (payload.timing) interaction.timing = Object.assign(interaction.timing || {}, payload.timing);

      }



      if (event.stage === 'run_funnel_done') {

        if (payload.timing) interaction.funnel_timing = Object.assign(interaction.funnel_timing || {}, payload.timing);

        if (payload.etapa_nueva !== undefined) interaction.funnel_etapa_nueva = payload.etapa_nueva;

        if (payload.metadata_actualizada) interaction.funnel_metadata_actualizada = payload.metadata_actualizada;

        if (payload.error) interaction.funnel_error = payload.error;

      }



      if (event.stage === 'run_contact_update_done') {

        if (payload.timing) interaction.contact_timing = Object.assign(interaction.contact_timing || {}, payload.timing);

        if (payload.updated_fields) interaction.contact_updated_fields = payload.updated_fields;

        if (payload.error) interaction.contact_error = payload.error;

      }



      if (event.stage === 'numero_no_encontrado') {
        if (payload.from_phone) interaction.from_phone = payload.from_phone;
        if (payload.phone_number_id) interaction.phone_number_id = payload.phone_number_id;
        interaction.status = 'error';
        interaction.error = payload.error || `Número no configurado: phone_number_id=${payload.phone_number_id}`;
        interaction.finished_at = event.timestamp;
        interaction.dropped = true;
      }

      if (event.stage === 'http_error' || event.stage === 'exception') {

        interaction.status = 'error';

        interaction.error = payload.error || payload.detail || 'Error en FastAPI';

        interaction.finished_at = event.timestamp;

      }



      if (event.stage === 'slash_command_done') {

        interaction.status = 'ok';

        interaction.finished_at = event.timestamp;

        if (payload.reply_text) interaction.response_preview = payload.reply_text;

        if (payload.command) interaction.message_text = payload.command;

      }

    }



    if (event.source === 'bridge') {

      if (event.stage === 'message_processing_start') {

        if (payload.from) interaction.from_phone = payload.from;

        if (payload.contact_name) interaction.contact_name = payload.contact_name;

        if (payload.message_type) interaction.message_type = payload.message_type;

        if (payload.text) interaction.message_text = payload.text;

        if (payload.phone_number_id) interaction.phone_number_id = payload.phone_number_id;

      }



      if (event.stage === 'call_fastapi_done') {

        if (payload.reply_type) interaction.reply_type = payload.reply_type;

        if (payload.agent_id) interaction.agent_id = payload.agent_id;

        if (payload.conversation_id) interaction.conversation_id = payload.conversation_id;

        if (payload.agent_name) interaction.agent_name = payload.agent_name;

        if (payload.model_used) interaction.model_used = payload.model_used;

        if (payload.response_chars !== undefined) interaction.response_chars = payload.response_chars;

        if (payload.response_preview) interaction.response_preview = payload.response_preview;

        if (payload.reaction_emoji) interaction.reaction_emoji = payload.reaction_emoji;

        if (Array.isArray(payload.tools_used)) interaction.tools_used = payload.tools_used;

        if (Array.isArray(payload.agent_runs)) interaction.agent_runs = payload.agent_runs;

        if (payload.timing) interaction.timing = Object.assign(interaction.timing || {}, payload.timing);

      }



      if (event.stage === 'kapso_send_start') {

        if (payload.to) interaction.from_phone = payload.to;

        if (payload.reply_type) interaction.reply_type = payload.reply_type;

        if (payload.has_reaction && !interaction.reaction_emoji) interaction.reaction_emoji = 'sent';

      }



      if (event.stage === 'kapso_send_reaction_with_text') {

        if (payload.emoji) interaction.reaction_emoji = payload.emoji;

      }



      if (event.stage === 'kapso_send_done') {

        interaction.send_result = payload.result ?? null;

        if (payload.result?.error) {
          interaction.status = 'error';
          interaction.error = String(payload.result.error);
        }

      }



      if (event.stage === 'message_processing_done') {

        interaction.finished_at = event.timestamp;

        if (payload.error || payload.send_result?.error) {
          interaction.status = 'error';
        } else if (payload.send_result?.suppressed) {
          interaction.status = 'suprimido';
        } else {
          interaction.status = 'ok';
        }

        if (payload.send_result) interaction.send_result = payload.send_result;

      }



      if (event.stage === 'message_processing_error' || event.stage === 'kapso_presence_error') {

        interaction.status = 'error';

        interaction.error = payload.error || payload.detail || 'Error en bridge';

        interaction.finished_at = event.timestamp;

      }

    }



    if (interaction.started_at && interaction.finished_at) {

      interaction.duration_ms = new Date(interaction.finished_at) - new Date(interaction.started_at);

    }

  }



  // Second pass: infer status & timing from FastAPI events when bridge events are missing

  for (const interaction of interactionMap.values()) {

    // If we never got a bridge "message_processing_done", derive from FastAPI data

    if (interaction.status === 'processing') {

      // If run_agent_done fired, the request completed successfully

      if (interaction.response_preview || interaction.agent_name) {

        interaction.status = 'ok';

      }

    }

    // If no duration_ms yet, use timing.total_ms from run_agent_done payload

    if (interaction.duration_ms == null && interaction.timing?.total_ms != null) {

      interaction.duration_ms = Math.round(interaction.timing.total_ms);

    }

  }



  return Array.from(interactionMap.values()).sort((a, b) => new Date(b.started_at) - new Date(a.started_at));

}



async function fetchFastApiDebugJson(pathname) {

  const targetUrl = new URL(pathname, INTERNAL_AGENT_API_URL).toString();

  const response = await fetch(targetUrl, {

    headers: KAPSO_INTERNAL_TOKEN ? { 'x-kapso-internal-token': KAPSO_INTERNAL_TOKEN } : {},

  });

  if (!response.ok) {

    const body = await response.text();

    throw new Error(`FastAPI debug respondió ${response.status}: ${body}`);

  }

  return response.json();

}



function escapeHtml(value) {

  return String(value ?? '')

    .replace(/&/g, '&amp;')

    .replace(/</g, '&lt;')

    .replace(/>/g, '&gt;')

    .replace(/"/g, '&quot;')

    .replace(/'/g, '&#39;');

}



async function collectKapsoDebugPayload() {

  const [fastapiEventsResult, fastapiConfigResult] = await Promise.allSettled([

    fetchFastApiDebugJson('/api/v1/kapso/debug/events?limit=100'),

    fetchFastApiDebugJson('/api/v1/kapso/debug/config'),

  ]);



  const fastapiEvents = fastapiEventsResult.status === 'fulfilled' ? fastapiEventsResult.value.events : [{

    timestamp: new Date().toISOString(),

    source: 'bridge',

    stage: 'fastapi_debug_error',

    payload: { error: String(fastapiEventsResult.reason) },

  }];



  return {

    bridge_config: getBridgeDebugConfig(),

    bridge_events: bridgeDebugEvents,

    fastapi_config: fastapiConfigResult.status === 'fulfilled' ? fastapiConfigResult.value : { error: String(fastapiConfigResult.reason) },

    fastapi_events: fastapiEvents,

    interactions: buildKapsoInteractions(bridgeDebugEvents, fastapiEvents),

  };

}



const PUBLIC_VISUAL_NODE_IDS = {

  whatsapp: 'n1',

  orch: 'n2',

  conv: 'n3',

  funnel: 'n4',

  contact: 'n5',

  supabase: 'n6',

  openrouter: 'n7',

  storage: 'n8',

  edge_fn: 'n9',

  vision: 'n10',

  t_reaction: 'n13',

  t_nota: 'n14',

  t_calificado: 'n15',

  t_comandos: 'n16',

  t_metadata: 'n17',

  t_update: 'n18',

  t_spam: 'n19',

  instagram: 'n20',

  t_disponibilidad: 'n21',

  t_agendar: 'n22',

  t_reagendar: 'n23',

  t_cancelar: 'n24',

  facebook: 'n30',

};



const PUBLIC_VISUAL_ALLOWED_STAGES = new Set([

  'inbound_received',

  'fallback_numero',

  'fallback_agent',

  'inbound_entities_resolved',

  'inbound_messages_persisted',

  'memory_session_resolved',

  'prompt_context_built',

  'run_agent_start',

  'run_agent_done',

  'run_funnel_done',

  'run_contact_update_done',

  'audio_processing',

  'image_processing',

  'document_processing',

  'slash_command_done',

  'call_fastapi_done',

  'kapso_send_done',

  'kapso_send_reaction_with_text',

  'http_error',

  'exception',

  // ManyChat / Instagram
  'message_received',

  'message_sent',

  // ManyChat / Facebook
  'fb_message_received',

  'fb_message_sent',

]);



const PUBLIC_VISUAL_NODE_META = {

  whatsapp: { label: 'WhatsApp', desc: 'Canal de mensajería', detail: 'Canal de entrada y salida de la conversación.', kind: 'external' },

  orch: { label: 'Orquestador', desc: 'Coordinación central', detail: 'Coordina el flujo entre agentes, memoria, herramientas y canal.', kind: 'orchestrator' },

  conv: { label: 'Conversacional', desc: 'Agente conversacional', detail: 'Gestiona razonamiento y respuesta general del sistema.', kind: 'agent' },

  funnel: { label: 'Embudo', desc: 'Agente de clasificación', detail: 'Evalúa etapa y señales del flujo comercial sin exponer reglas internas.', kind: 'agent' },

  contact: { label: 'Contacto', desc: 'Agente de actualización', detail: 'Actualiza y normaliza información del contacto de forma abstracta.', kind: 'agent' },

  supabase: { label: 'Base de datos', desc: 'Persistencia', detail: 'Guarda estado conversacional y contexto operativo.', kind: 'database' },

  openrouter: { label: 'Motor LLM', desc: 'Proveedor de modelo', detail: 'Procesa inferencia de lenguaje mediante un servicio externo.', kind: 'external' },

  storage: { label: 'Storage', desc: 'Archivos y media', detail: 'Almacena adjuntos y recursos del flujo.', kind: 'database' },

  edge_fn: { label: 'Edge Functions', desc: 'Procesamiento auxiliar', detail: 'Ejecuta lógica desacoplada del flujo principal.', kind: 'external' },

  vision: { label: 'Visión', desc: 'Análisis multimodal', detail: 'Procesa imágenes y contenido visual.', kind: 'external' },

  t_reaction: { label: 'Reacciones', desc: 'Acción de canal', detail: 'Envía señales rápidas de interacción al canal.', kind: 'tool' },

  t_nota: { label: 'Notas', desc: 'Registro interno', detail: 'Genera registro operativo sin exponer estructura interna.', kind: 'tool' },

  t_calificado: { label: 'Calificación', desc: 'Actualización de estado', detail: 'Marca el estado comercial del contacto de forma abstracta.', kind: 'tool' },

  t_comandos: { label: 'Comandos', desc: 'Acciones operativas', detail: 'Ejecuta acciones operativas controladas del sistema.', kind: 'tool' },

  t_metadata: { label: 'Metadata', desc: 'Actualización contextual', detail: 'Ajusta datos contextuales sin revelar estructuras sensibles.', kind: 'tool' },

  t_update: { label: 'Actualización', desc: 'Datos de contacto', detail: 'Refresca información del contacto sin exponer campos internos.', kind: 'tool' },

  t_spam: { label: 'Control spam', desc: 'Protección de canal', detail: 'Aplica controles de seguridad y supresión del canal.', kind: 'tool' },

  t_disponibilidad: { label: 'Disponibilidad', desc: 'Consulta agenda', detail: 'Consulta horarios disponibles vía Nylas Calendar API.', kind: 'tool' },

  t_agendar: { label: 'Agendar', desc: 'Crear cita', detail: 'Crea cita con asesor disponible y genera Google Meet.', kind: 'tool' },

  t_reagendar: { label: 'Reagendar', desc: 'Mover cita', detail: 'Reagenda cita existente, cambia asesor si es necesario.', kind: 'tool' },

  t_cancelar: { label: 'Cancelar', desc: 'Cancelar cita', detail: 'Cancela cita del calendario y marca como cancelada.', kind: 'tool' },

  instagram: { label: 'Instagram', desc: 'Canal de mensajería', detail: 'Canal de entrada y salida de la conversación.', kind: 'external' },

  facebook: { label: 'Facebook', desc: 'Canal de mensajería', detail: 'Canal de entrada y salida de la conversación.', kind: 'external' },

};



function sanitizePublicConstellationGraph(graphData) {

  if (!graphData || !Array.isArray(graphData.nodes)) return null;



  const idMap = new Map();

  const nodes = graphData.nodes.map((node, index) => {

    const publicId = PUBLIC_VISUAL_NODE_IDS[node.id] || `x${index + 1}`;

    const meta = PUBLIC_VISUAL_NODE_META[node.id] || {};

    const kind = String(meta.kind || node.kind || 'external');

    idMap.set(node.id, publicId);

    return {

      id: publicId,

      kind,

      x: typeof node.x === 'number' ? node.x : Math.random(),

      y: typeof node.y === 'number' ? node.y : Math.random(),

      hx: typeof node.x === 'number' ? node.x : Math.random(),

      hy: typeof node.y === 'number' ? node.y : Math.random(),

      r: typeof node.r === 'number' ? node.r : 12,

      color: typeof node.color === 'string' ? node.color : '#818cf8',

      glow: typeof node.glow === 'string' ? node.glow : 'rgba(129,140,248,.25)',

      label: meta.label || (kind === 'tool' ? 'Herramienta' : kind === 'database' ? 'Datos' : kind === 'agent' ? 'Agente' : kind === 'orchestrator' ? 'Orquestador' : 'Servicio'),

      desc: meta.desc || 'Componente del sistema',

      detail: meta.detail || 'Componente abstracto del flujo multiagente.',

    };

  });



  const edges = Array.isArray(graphData.edges)

    ? graphData.edges.map(edge => ({

        from: idMap.get(edge.from),

        to: idMap.get(edge.to),

        dash: Boolean(edge.dash),

      })).filter(edge => edge.from && edge.to)

    : [];



  // Alinear los 3 canales en la parte superior, horizontalmente
  const igId   = PUBLIC_VISUAL_NODE_IDS.instagram;
  const fbId   = PUBLIC_VISUAL_NODE_IDS.facebook;
  const waId   = PUBLIC_VISUAL_NODE_IDS.whatsapp;
  const orchId = PUBLIC_VISUAL_NODE_IDS.orch;

  const _waR = 20;
  const _topY = 0.11;

  // WhatsApp — reposicionar arriba-centro con color de marca
  const waNode = nodes.find(n => n.id === waId);
  if (waNode) {
    waNode.x = 0.50; waNode.hx = 0.50;
    waNode.y = _topY; waNode.hy = _topY;
    waNode.r = _waR;
    waNode.color = '#25d366';
    waNode.glow  = 'rgba(37,211,102,.3)';
  }

  // Instagram — arriba-izquierda con gradiente de marca
  if (!nodes.some(n => n.id === igId)) {
    nodes.push({
      id: igId, kind: 'external',
      x: 0.22, y: _topY, hx: 0.22, hy: _topY,
      r: _waR,
      color: '#e1306c',
      glow: 'rgba(225,48,108,.3)',
      gradient: [[0,'#fcb045'],[0.35,'#fd1d1d'],[0.7,'#c13584'],[1,'#833ab4']],
      label: PUBLIC_VISUAL_NODE_META.instagram.label,
      desc:  PUBLIC_VISUAL_NODE_META.instagram.desc,
      detail: PUBLIC_VISUAL_NODE_META.instagram.detail,
    });
    if (orchId) edges.push({ from: igId, to: orchId, dash: false });
  }

  // Facebook — arriba-derecha con color de marca
  if (!nodes.some(n => n.id === fbId)) {
    nodes.push({
      id: fbId, kind: 'external',
      x: 0.78, y: _topY, hx: 0.78, hy: _topY,
      r: _waR,
      color: '#1877f2',
      glow: 'rgba(24,119,242,.3)',
      label: PUBLIC_VISUAL_NODE_META.facebook.label,
      desc:  PUBLIC_VISUAL_NODE_META.facebook.desc,
      detail: PUBLIC_VISUAL_NODE_META.facebook.detail,
    });
    if (orchId) edges.push({ from: fbId, to: orchId, dash: false });
  }



  return { nodes, edges };

}



function matchesPublicVisualEmpresa(event, empresaId = '') {

  if (!empresaId) return true;

  const payload = event?.payload || {};

  if (payload.empresa_id != null) return String(payload.empresa_id) === String(empresaId);

  return true;

}



function sanitizePublicVisualEvent(event) {

  if (!event || !event.timestamp || !PUBLIC_VISUAL_ALLOWED_STAGES.has(event.stage)) return null;

  const channel = event.channel || (event.payload && event.payload.canal) || 'whatsapp';

  return {

    timestamp: event.timestamp,

    source: event.source === 'bridge' ? 'bridge' : 'fastapi',

    stage: event.stage,

    channel,

  };

}



async function collectKapsoPublicVisualPayload(empresaId = '') {

  const fastapiEventsResult = await Promise.allSettled([

    fetchFastApiDebugJson('/api/v1/kapso/debug/events?limit=100'),

  ]);



  const fastapiEvents = fastapiEventsResult[0].status === 'fulfilled' ? fastapiEventsResult[0].value.events : [];



  const events = [...bridgeDebugEvents, ...fastapiEvents]

    .filter(event => matchesPublicVisualEmpresa(event, empresaId))

    .map(sanitizePublicVisualEvent)

    .filter(Boolean)

    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))

    .slice(-100);



  return { events };

}



async function collectUnifiedPublicVisualPayload(empresaId = '') {

  const [kapsoResult, manychatResult] = await Promise.allSettled([
    fetchFastApiDebugJson('/api/v1/kapso/debug/events?limit=100'),
    fetchFastApiDebugJson('/api/v1/manychat/debug/events?limit=100'),
  ]);

  const kapsoEvents    = kapsoResult.status    === 'fulfilled' ? (kapsoResult.value.events    || []) : [];
  const manychatEvents = manychatResult.status === 'fulfilled' ? (manychatResult.value.events || []) : [];

  // Etiquetar eventos de ManyChat con su canal real (instagram o facebook)
  const taggedManychat = manychatEvents.map(e => {
    const canal = (e.payload && e.payload.canal) || 'instagram';
    return { ...e, channel: canal };
  });

  const events = [...bridgeDebugEvents, ...kapsoEvents, ...taggedManychat]
    .filter(event => matchesPublicVisualEmpresa(event, empresaId))
    .map(sanitizePublicVisualEvent)
    .filter(Boolean)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .slice(-150);

  return { events };

}



function fmtMs(v) { return v != null ? (v / 1000).toFixed(1) + ' s' : '—'; }



function computeInfraMs(item) {

  const t = item.timing;

  if (!t || t.total_ms == null) return null;

  const infra = t.total_ms - (t.llm_ms || 0) - (t.tool_execution_ms || 0) - (t.mcp_discovery_ms || 0) - (t.graph_build_ms || 0);

  return Math.max(0, Math.round(infra));

}



function timingColorClass(ms) {

  if (ms == null) return '';

  if (ms < 20000) return 'color:#34d399';

  if (ms < 30000) return 'color:#f97316';

  return 'color:#f87171';

}



function renderTimingCells(item) {

  const t = item.timing || {};

  const totalMs = item.duration_ms != null ? item.duration_ms : (t.total_ms != null ? Math.round(t.total_ms) : null);

  const infraMs = computeInfraMs(item);

  const llmMs = t.llm_ms != null ? Math.round(t.llm_ms) : null;

  const toolMs = t.tool_execution_ms != null ? Math.round(t.tool_execution_ms) : null;



  // Per-agent breakdown

  const runs = Array.isArray(item.agent_runs) ? item.agent_runs : [];

  const agentParts = runs.map(r => {

    const name = escapeHtml(r.agent_name || r.agent_key || '?');

    const ms = r.timing?.total_ms != null ? Math.round(r.timing.total_ms) : null;

    return `<span style="white-space:nowrap">${name}: <b>${fmtMs(ms)}</b></span>`;

  });

  // Also show funnel + contact if separate

  if (item.funnel_timing?.total_ms != null && !runs.some(r => (r.agent_key || '').includes('funnel'))) {

    agentParts.push(`<span style="white-space:nowrap">Funnel: <b>${fmtMs(item.funnel_timing.total_ms)}</b></span>`);

  }

  if (item.contact_timing?.total_ms != null && !runs.some(r => (r.agent_key || '').includes('contact'))) {

    agentParts.push(`<span style="white-space:nowrap">Contact: <b>${fmtMs(item.contact_timing.total_ms)}</b></span>`);

  }



  return `<td style="${timingColorClass(totalMs)}"><b>${fmtMs(totalMs)}</b></td>`

    + `<td>${fmtMs(infraMs)}</td>`

    + `<td>${fmtMs(llmMs)}</td>`

    + `<td>${fmtMs(toolMs)}</td>`

    + `<td style="font-size:11px">${agentParts.length ? agentParts.join('<br>') : '—'}</td>`;

}



function renderToolList(items = []) {

  if (!Array.isArray(items) || !items.length) {

    return '<div style="color:#94a3b8">Sin herramientas.</div>';

  }



  return `

    <table style="margin-top:8px">

      <thead>

        <tr>

          <th>Tool</th>

          <th>Source</th>

          <th>Estado</th>

          <th>Tiempo</th>

          <th>Descripción</th>

        </tr>

      </thead>

      <tbody>

        ${items.map(item => `

          <tr>

            <td>${escapeHtml(item.tool_name || '—')}</td>

            <td>${escapeHtml(item.source || '—')}</td>

            <td>${escapeHtml(item.status || 'ok')}</td>

            <td>${escapeHtml(item.duration_ms != null ? `${(item.duration_ms / 1000).toFixed(1)} s` : '—')}</td>

            <td>${escapeHtml(item.description || '—')}</td>

          </tr>

          <tr>

            <td colspan="5">

              <div style="margin-bottom:8px"><strong>Input</strong></div>

              <pre>${escapeHtml(JSON.stringify(item.tool_input || {}, null, 2))}</pre>

              <div style="margin:8px 0 8px"><strong>Output</strong></div>

              <pre>${escapeHtml(item.tool_output || '—')}</pre>

              ${item.error ? `<div style="margin-top:8px;color:#fca5a5"><strong>Error:</strong> ${escapeHtml(item.error)}</div>` : ''}

            </td>

          </tr>`).join('')}

      </tbody>

    </table>`;

}



function renderAvailableToolList(items = []) {

  if (!Array.isArray(items) || !items.length) {

    return '<div style="color:#94a3b8">Sin herramientas disponibles.</div>';

  }



  return `

    <table style="margin-top:8px">

      <thead>

        <tr>

          <th>Tool</th>

          <th>Source</th>

          <th>Descripción</th>

        </tr>

      </thead>

      <tbody>

        ${items.map(item => `

          <tr>

            <td>${escapeHtml(item.tool_name || '—')}</td>

            <td>${escapeHtml(item.source || '—')}</td>

            <td>${escapeHtml(item.description || '—')}</td>

          </tr>`).join('')}

      </tbody>

    </table>`;

}



function renderTimingTable(timing = {}) {

  const infraMs = timing.total_ms != null

    ? Math.max(0, Math.round(timing.total_ms - (timing.llm_ms || 0) - (timing.tool_execution_ms || 0) - (timing.mcp_discovery_ms || 0) - (timing.graph_build_ms || 0)))

    : null;

  return `

    <table style="margin-top:8px">

      <thead>

        <tr>

          <th>Total</th>

          <th>Infra</th>

          <th>LLM</th>

          <th>MCP</th>

          <th>Graph</th>

          <th>Tools</th>

        </tr>

      </thead>

      <tbody>

        <tr>

          <td style="${timing.total_ms != null ? (timing.total_ms < 20000 ? 'color:#34d399' : timing.total_ms < 30000 ? 'color:#f97316' : 'color:#f87171') : ''}"><b>${fmtMs(timing.total_ms)}</b></td>

          <td>${fmtMs(infraMs)}</td>

          <td>${fmtMs(timing.llm_ms)}</td>

          <td>${fmtMs(timing.mcp_discovery_ms)}</td>

          <td>${fmtMs(timing.graph_build_ms)}</td>

          <td>${fmtMs(timing.tool_execution_ms)}</td>

        </tr>

      </tbody>

    </table>`;

}



function renderOverviewGrid(items = []) {

  const validItems = items.filter(item => item && (item.label || item.value));

  if (!validItems.length) {

    return '';

  }



  return `

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:12px 0">

      ${validItems.map(item => `

        <div class="card" style="padding:10px 12px">

          <div class="label">${escapeHtml(item.label || 'Dato')}</div>

          <div style="font-size:14px;font-weight:700;margin-top:6px;word-break:break-word">${escapeHtml(item.value || '—')}</div>

        </div>`).join('')}

    </div>`;

}



function buildExecutionRows(item = {}) {

  const rows = [];

  const toolsCount = Array.isArray(item.tools_used) ? item.tools_used.length : 0;



  if (item.agent_name || item.agent_id) {

    rows.push({

      stage: 'Kapso',

      name: item.agent_name || `Agente ${item.agent_id}`,

      type: 'Agente resuelto',

      model: item.model_used || '—',

      iterations: '—',

      tools: toolsCount,

      conversation: item.conversation_id || '—',

    });

  }



  const agentRuns = Array.isArray(item.agent_runs) ? item.agent_runs : [];

  for (const [index, run] of agentRuns.entries()) {

    rows.push({

      stage: 'LangGraph',

      name: run.agent_name || run.agent_key || `Agente ${index + 1}`,

      type: run.agent_kind || 'agent',

      model: run.model_used || item.model_used || '—',

      iterations: run.llm_iterations != null ? String(run.llm_iterations) : '—',

      tools: Array.isArray(run.tools_used) ? run.tools_used.length : 0,

      conversation: run.conversation_id || item.conversation_id || '—',

    });

  }



  return rows;

}



function renderExecutionSummary(item = {}) {

  const agentRuns = Array.isArray(item.agent_runs) ? item.agent_runs : [];

  const toolsUsed = Array.isArray(item.tools_used) ? item.tools_used : [];

  const summaryCards = [

    { label: 'Agente Kapso', value: item.agent_name || (item.agent_id ? `ID ${item.agent_id}` : '—') },

    { label: 'Conversación', value: item.conversation_id || '—' },

    { label: 'Memoria', value: item.memory_session_id || '—' },

    { label: 'Reply', value: item.reply_type || 'text' },

    { label: 'Trazas LangGraph', value: String(agentRuns.length) },

    { label: 'Herramientas', value: String(toolsUsed.length) },

  ];

  const executionRows = buildExecutionRows(item);



  return `

    ${renderOverviewGrid(summaryCards)}

    <table style="margin-top:8px">

      <thead>

        <tr>

          <th>Etapa</th>

          <th>Nombre</th>

          <th>Tipo</th>

          <th>Modelo</th>

          <th>Iteraciones</th>

          <th>Tools</th>

          <th>Conversation</th>

        </tr>

      </thead>

      <tbody>

        ${executionRows.length ? executionRows.map(row => `

          <tr>

            <td>${escapeHtml(row.stage)}</td>

            <td>${escapeHtml(row.name)}</td>

            <td>${escapeHtml(row.type)}</td>

            <td>${escapeHtml(row.model)}</td>

            <td>${escapeHtml(row.iterations)}</td>

            <td>${escapeHtml(String(row.tools))}</td>

            <td>${escapeHtml(row.conversation)}</td>

          </tr>`).join('') : `

          <tr>

            <td colspan="7" style="padding:16px;color:#94a3b8">Sin datos de ejecución todavía.</td>

          </tr>`}

      </tbody>

    </table>`;

}



function renderAgentRuns(agentRuns = []) {

  if (!Array.isArray(agentRuns) || !agentRuns.length) {

    return '<div style="color:#94a3b8">Esta interacción no tiene trazas detalladas de agentes todavía.</div>';

  }



  return agentRuns.map((run, index) => `

    <details style="margin-top:12px">

      <summary>${escapeHtml(run.agent_name || run.agent_key || `Agente ${index + 1}`)} · ${escapeHtml(run.agent_kind || 'agent')} · ${escapeHtml(run.model_used || '—')}</summary>

      <div style="margin-top:12px">

        <div style="margin-bottom:10px"><strong>Agent key:</strong> ${escapeHtml(run.agent_key || '—')}</div>

        <div style="margin-bottom:10px"><strong>Conversation:</strong> ${escapeHtml(run.conversation_id || '—')}</div>

        <div style="margin-bottom:10px"><strong>Memory session:</strong> ${escapeHtml(run.memory_session_id || '—')}</div>

        <div style="margin-bottom:10px"><strong>LLM iterations:</strong> ${escapeHtml(run.llm_iterations ?? 0)}</div>

        <div style="margin:12px 0 6px"><strong>Timing</strong></div>

        ${renderTimingTable(run.timing || {})}

        <div style="margin:12px 0 6px"><strong>Herramientas disponibles</strong></div>

        ${renderAvailableToolList(run.available_tools || [])}

        <div style="margin:12px 0 6px"><strong>Herramientas ejecutadas</strong></div>

        ${renderToolList(run.tools_used || [])}

        <details style="margin-top:12px">

          <summary>Prompts</summary>

          <div style="margin-top:12px">

            <div style="margin:0 0 6px"><strong>System prompt</strong></div>

            <pre>${escapeHtml(run.system_prompt || '')}</pre>

            <div style="margin:12px 0 6px"><strong>User prompt</strong></div>

            <pre>${escapeHtml(run.user_prompt || '')}</pre>

          </div>

        </details>

      </div>

    </details>`).join('');

}



function renderKapsoBasicHtml(debugData, debugToken = '') {

  const interactions = Array.isArray(debugData?.interactions) ? debugData.interactions : [];

  const okCount = interactions.filter(item => item.status === 'ok').length;

  const errorCount = interactions.filter(item => item.status === 'error').length;

  const withTiming = interactions.filter(item => item.duration_ms != null || item.timing?.total_ms != null);

  const avgDuration = withTiming.length

    ? Math.round(withTiming.reduce((acc, item) => acc + (item.duration_ms || item.timing?.total_ms || 0), 0) / withTiming.length)

    : null;

  const avgLlm = withTiming.length

    ? Math.round(withTiming.reduce((acc, item) => acc + (item.timing?.llm_ms || 0), 0) / withTiming.length)

    : null;

  const avgInfra = withTiming.length

    ? Math.round(withTiming.reduce((acc, item) => {

        const t = item.timing;

        if (!t || t.total_ms == null) return acc;

        return acc + Math.max(0, t.total_ms - (t.llm_ms || 0) - (t.tool_execution_ms || 0) - (t.mcp_discovery_ms || 0) - (t.graph_build_ms || 0));

      }, 0) / withTiming.length)

    : null;



  const interactionRows = interactions.length
    ? interactions.map((item, index) => `
        <tr>
          <td>${escapeHtml(item.started_at ? new Date(item.started_at).toLocaleString() : '—')}</td>
          <td>${escapeHtml(item.contact_name || item.from_phone || '—')}</td>
          <td>${item.contacto_id != null ? String(item.contacto_id) : escapeHtml(item.from_phone || '—')}</td>
          <td>${escapeHtml(item.message_type || 'text')}</td>
          <td style="max-width:280px;word-break:break-word">${(function(){ const txt = item.message_text || '—'; if (txt.length <= 200) return escapeHtml(txt); return `${escapeHtml(txt.slice(0, 200))}<span class="msg-more" style="display:none">${escapeHtml(txt.slice(200))}</span> <a href="#" onclick="var s=this.previousElementSibling;s.style.display=s.style.display==='none'?'':'none';this.textContent=s.style.display===''?'ver menos':'ver más...';return false;" style="color:#93c5fd;font-size:11px;white-space:nowrap">ver más...</a>`; })()}</td>
          <td>${escapeHtml(item.agent_name || '—')}</td>
          <td>${escapeHtml(item.model_used || '—')}</td>
          <td>${escapeHtml(item.reaction_emoji || '—')}</td>
          <td>${item.duration_ms != null ? `${(item.duration_ms / 1000).toFixed(1)} s` : '—'}</td>
          <td>${item.dropped ? '<span style="color:#f87171">⛔ rechazado</span>' : escapeHtml(item.status || 'processing')}</td>
          <td><a href="#interaction-${index}" style="color:#93c5fd">Ver</a></td>
        </tr>`).join('')
    : '<tr><td colspan="11" style="padding:20px;color:#94a3b8">Sin interacciones todavía.</td></tr>';



  const interactionDetails = interactions.length

    ? interactions.map((item, index) => `

      <details class="section" id="interaction-${index}">

        <summary>${escapeHtml(item.contact_name || item.from_phone || item.message_id || `Interacción ${index + 1}`)} · ${escapeHtml(item.status || 'processing')} · ${escapeHtml(item.duration_ms != null ? `${(item.duration_ms / 1000).toFixed(1)} s` : '—')}</summary>

        <div style="margin-top:12px">

          ${item.dropped ? `<div style="background:#7f1d1d;border:1px solid #ef4444;border-radius:6px;padding:10px 14px;margin-bottom:12px;font-size:13px">⛔ <strong>Rechazado antes de procesar</strong> — No se guardó en Supabase ni se envió al agente. El número <code>${escapeHtml(item.phone_number_id || '—')}</code> no existe en <code>wp_numeros</code>.</div>` : ''}

          <div style="margin-bottom:8px"><strong>Message ID:</strong> ${escapeHtml(item.message_id || '—')}</div>

          <div style="margin:12px 0 6px"><strong>Error</strong></div>

          <pre>${escapeHtml(item.error || '—')}</pre>

          <div style="margin-bottom:8px"><strong>Mensaje:</strong></div>

          <pre>${escapeHtml(item.message_text || '—')}</pre>

          <div style="margin:12px 0 6px"><strong>Respuesta preview</strong></div>

          <pre>${escapeHtml(item.response_preview || '—')}</pre>

          <div style="margin:12px 0 6px"><strong>Resultado envío Kapso</strong></div>

          <pre>${escapeHtml(JSON.stringify(item.send_result ?? null, null, 2))}</pre>

          <div style="margin:12px 0 6px"><strong>Embudo en metadata</strong></div>

          <pre>${escapeHtml(JSON.stringify({

            etapa_nueva: item.funnel_etapa_nueva ?? null,

            metadata_actualizada: item.funnel_metadata_actualizada ?? null,

            error: item.funnel_error ?? null,

          }, null, 2))}</pre>

          <div style="margin:12px 0 6px"><strong>Timing global</strong></div>

          ${renderTimingTable(item.timing || {})}

          <div style="margin:12px 0 6px"><strong>Resumen de ejecución</strong></div>

          ${renderExecutionSummary(item)}

          <div style="margin:12px 0 6px"><strong>Tools globales</strong></div>

          ${renderToolList(item.tools_used || [])}

          <div style="margin:12px 0 6px"><strong>Trazas detalladas del agente</strong></div>

          ${renderAgentRuns(item.agent_runs || [])}

        </div>

      </details>`).join('')

    : '';



  return `<!doctype html>

<html lang="es">

<head>

  <meta charset="utf-8">

  <meta name="viewport" content="width=device-width, initial-scale=1">

  <title>Kapso Debug Básico</title>

  <style>

    body{font-family:Arial,sans-serif;background:#0f172a;color:#e2e8f0;margin:0;padding:16px}
    .top{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap}
    .title{font-size:20px;font-weight:700}
    .actions a,.actions button{color:#93c5fd;text-decoration:none;margin-left:12px;background:none;border:none;cursor:pointer;font-size:14px}
    .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin-bottom:16px}
    .card{background:#1e293b;border:1px solid #334155;border-radius:10px;padding:12px}
    .label{font-size:11px;color:#94a3b8;text-transform:uppercase}
    .value{font-size:22px;font-weight:700;margin-top:6px}
    table{width:100%;border-collapse:collapse;background:#111827;border:1px solid #334155}
    th,td{padding:10px;border-bottom:1px solid #334155;text-align:left;vertical-align:top;font-size:12px}
    th{background:#1e293b;color:#93c5fd}
    .section{margin-top:18px}
    details{margin-top:12px;background:#111827;border:1px solid #334155;border-radius:8px;padding:12px}
    summary{cursor:pointer;font-weight:700}
    pre{white-space:pre-wrap;word-break:break-word;color:#cbd5e1;font-size:12px}
  </style>

</head>

<body>

  <div class="top">

    <div class="title">Kapso Debug Básico</div>

    <div class="actions">
      <span id="last-update" style="color:#94a3b8;font-size:11px"></span>
      <button id="toggle-auto" style="background:#16a34a;color:#fff;border:none;padding:4px 12px;border-radius:6px;cursor:pointer;font-size:12px">⏸ Pausar</button>
      <a href="${appendDebugToken('/debug/canales', debugToken)}">Todos los canales</a>
      <a href="${appendDebugToken('/debug/manychat', debugToken)}">ManyChat</a>
      <a href="${appendDebugToken('/debug/ghl', debugToken)}">GHL</a>
      <a href="${appendDebugToken('/debug/kapso/visual', debugToken)}">Ver visual</a>
    </div>

  </div>



  <div class="stats">

    <div class="card"><div class="label">Total</div><div class="value" id="statTotal">${interactions.length}</div></div>
    <div class="card"><div class="label">OK</div><div class="value" id="statOk" style="color:#4ade80">${okCount}</div></div>
    <div class="card"><div class="label">Errores</div><div class="value" id="statErrors" style="color:#f87171">${errorCount}</div></div>
    <div class="card"><div class="label">Tiempo AVG</div><div class="value" id="statAvg">${avgDuration != null ? `${(avgDuration / 1000).toFixed(1)} s` : '—'}</div></div>
    <div class="card"><div class="label">LLM AVG</div><div class="value" id="statLlm">${avgLlm != null ? `${(avgLlm / 1000).toFixed(1)} s` : '—'}</div></div>
    <div class="card"><div class="label">Infra AVG</div><div class="value" id="statInfra">${avgInfra != null ? `${(avgInfra / 1000).toFixed(1)} s` : '—'}</div></div>

  </div>



  <div class="section">

    <table>

      <thead>
        <tr>
          <th>Hora</th><th>Contacto</th><th>ID</th><th>Tipo</th><th>Mensaje</th>
          <th>Agente</th><th>Modelo</th><th>Rx</th><th style="min-width:60px">Total</th><th>Status</th><th>Detalle</th>
        </tr>
      </thead>

      <tbody>${interactionRows}</tbody>

    </table>

  </div>



  <div id="interaction-details">${interactionDetails}</div>



  <details class="section">

    <summary>Bridge Config</summary>

    <pre id="bridge-config">${escapeHtml(JSON.stringify(debugData.bridge_config, null, 2))}</pre>

  </details>



  <details class="section">

    <summary>FastAPI Config</summary>

    <pre id="fastapi-config">${escapeHtml(JSON.stringify(debugData.fastapi_config, null, 2))}</pre>

  </details>



  <details class="section">

    <summary>JSON completo</summary>

    <pre id="json-completo">${escapeHtml(JSON.stringify(debugData, null, 2))}</pre>

  </details>

<script>

(function(){

  const DEBUG_TOKEN = new URLSearchParams(window.location.search).get('token') || ${JSON.stringify(debugToken || '')};
  function debugPath(path){
    if(!DEBUG_TOKEN)return path;
    var u=new URL(path,window.location.origin);
    u.searchParams.set('token',DEBUG_TOKEN);
    return u.pathname+u.search;
  }
  function fetchDebug(path,init){
    return fetch(debugPath(path),init);
  }

  const POLL_INTERVAL = 30000; // fallback polling — SSE is primary

  let autoRefresh = true;

  let timer = null;

  let sseSource = null;

  let sseConnected = false;

  let empresasMap = {};

  function loadEmpresasMap(){
    fetch(debugPath('/debug/kapso/empresas'))
      .then(function(r){ return r.json(); })
      .then(function(data){ (data.empresas||[]).forEach(function(e){ empresasMap[e.id]=e.nombre; }); })
      .catch(function(){});
  }

  function startFallbackPolling(){
    if(!autoRefresh) return;
    clearInterval(timer);
    timer = setInterval(poll, POLL_INTERVAL);
  }

  function stopFallbackPolling(){
    clearInterval(timer);
    timer = null;
  }

  function connectSSE(){
    if(sseSource){ sseSource.close(); sseSource=null; }
    const es = new EventSource(debugPath('/debug/kapso/stream'));
    sseSource = es;
    es.onopen = function(){
      sseConnected = true;
      stopFallbackPolling(); // SSE is live — no need for interval polling
    };
    es.onmessage = function(msg){
      try{
        const ev = JSON.parse(msg.data);
        if(ev.error){ console.warn('[Debug] SSE error:', ev.error); return; }
      }catch(e){}
      poll(); // refresh table data on every real event
    };
    es.onerror = function(){
      sseConnected = false;
      es.close();
      sseSource = null;
      startFallbackPolling(); // SSE dropped — fall back to interval
      setTimeout(connectSSE, 5000); // try to reconnect
    };
  }

  connectSSE();



  function esc(v){ return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  function fms(v){ return v!=null?(v/1000).toFixed(1)+' s':'—'; }

  function tcls(ms){ if(ms==null)return ''; if(ms<20000)return 'color:#34d399'; if(ms<30000)return 'color:#f97316'; return 'color:#f87171'; }

  function infraMs(item){

    var t=item.timing; if(!t||t.total_ms==null)return null;

    return Math.max(0,Math.round(t.total_ms-(t.llm_ms||0)-(t.tool_execution_ms||0)-(t.mcp_discovery_ms||0)-(t.graph_build_ms||0)));

  }

  function agentBreakdown(item){

    var runs=Array.isArray(item.agent_runs)?item.agent_runs:[];

    var parts=runs.map(function(r){

      var name=esc(r.agent_name||r.agent_key||'?');

      var ms=r.timing&&r.timing.total_ms!=null?Math.round(r.timing.total_ms):null;

      return '<span style="white-space:nowrap">'+name+': <b>'+fms(ms)+'</b></span>';

    });

    if(item.funnel_timing&&item.funnel_timing.total_ms!=null&&!runs.some(function(r){return (r.agent_key||'').indexOf('funnel')>=0})){

      parts.push('<span style="white-space:nowrap">Funnel: <b>'+fms(item.funnel_timing.total_ms)+'</b></span>');

    }

    if(item.contact_timing&&item.contact_timing.total_ms!=null&&!runs.some(function(r){return (r.agent_key||'').indexOf('contact')>=0})){

      parts.push('<span style="white-space:nowrap">Contact: <b>'+fms(item.contact_timing.total_ms)+'</b></span>');

    }

    return parts.length?parts.join('<br>'):'—';

  }



  function renderRow(item, idx){

    var t=item.timing||{};

    var totalMs=item.duration_ms!=null?item.duration_ms:(t.total_ms!=null?Math.round(t.total_ms):null);

    var inf=infraMs(item);

    var llm=t.llm_ms!=null?Math.round(t.llm_ms):null;

    var tools=t.tool_execution_ms!=null?Math.round(t.tool_execution_ms):null;

    return '<tr>'
      +'<td>'+esc(item.started_at?new Date(item.started_at).toLocaleString():'—')+'</td>'
      +'<td>'+esc(item.contact_name||item.from_phone||'—')+'</td>'
      +'<td>'+(item.contacto_id!=null?String(item.contacto_id):esc(item.from_phone||'—'))+'</td>'
      +'<td>'+esc(item.message_type||'text')+'</td>'
      +(function(){ var txt=item.message_text||'—'; if(txt.length<=200) return '<td style="max-width:280px;word-break:break-word">'+esc(txt)+'</td>'; return '<td style="max-width:280px;word-break:break-word">'+esc(txt.slice(0,200))+'<span class="msg-more" style="display:none">'+esc(txt.slice(200))+'</span> <a href="#" onclick="var s=this.previousElementSibling;s.style.display=s.style.display===\'none\'?\'\':\'none\';this.textContent=s.style.display===\'\'?\'ver menos\':\'ver más...\';return false;" style="color:#93c5fd;font-size:11px;white-space:nowrap">ver más...</a></td>'; })()
      +'<td>'+(item.agent_name?esc(item.agent_name)+(item.empresa_id&&empresasMap[item.empresa_id]?'<div style="font-size:10px;color:#94a3b8;margin-top:2px">'+esc(empresasMap[item.empresa_id])+'</div>':''):'—')+'</td>'
      +'<td>'+esc(item.model_used||'—')+'</td>'
      +'<td>'+esc(item.reaction_emoji||'—')+'</td>'
      +'<td style="'+tcls(totalMs)+'"><b>'+fms(totalMs)+'</b></td>'
      +'<td>'+esc(item.status||'processing')+'</td>'
      +'<td><a href="#interaction-'+idx+'" style="color:#93c5fd" onclick="var d=document.getElementById(\'interaction-\'+'+idx+');if(d)d.setAttribute(\'open\',\'\');return true;">Ver</a></td>'
      +'</tr>';

  }



  function renderTimingTbl(t){

    if(!t)return '<div style="color:#94a3b8">—</div>';

    var inf=t.total_ms!=null?Math.max(0,Math.round(t.total_ms-(t.llm_ms||0)-(t.tool_execution_ms||0)-(t.mcp_discovery_ms||0)-(t.graph_build_ms||0))):null;

    return '<table style="margin-top:8px"><thead><tr><th>Total</th><th>Infra</th><th>LLM</th><th>MCP</th><th>Graph</th><th>Tools</th></tr></thead><tbody><tr>'

      +'<td style="'+tcls(t.total_ms)+'"><b>'+fms(t.total_ms)+'</b></td>'

      +'<td>'+fms(inf)+'</td>'

      +'<td>'+fms(t.llm_ms)+'</td>'

      +'<td>'+fms(t.mcp_discovery_ms)+'</td>'

      +'<td>'+fms(t.graph_build_ms)+'</td>'

      +'<td>'+fms(t.tool_execution_ms)+'</td>'

      +'</tr></tbody></table>';

  }



  function renderTools(items){

    if(!Array.isArray(items)||!items.length) return '<div style="color:#94a3b8">Sin herramientas.</div>';

    return '<table style="margin-top:8px"><thead><tr><th>Tool</th><th>Source</th><th>Estado</th><th>Tiempo</th><th>Descripción</th></tr></thead><tbody>'

      +items.map(function(it){

        return '<tr><td>'+esc(it.tool_name||'—')+'</td><td>'+esc(it.source||'—')+'</td><td>'+esc(it.status||'ok')+'</td><td>'+esc(it.duration_ms!=null?(it.duration_ms/1000).toFixed(1)+' s':'—')+'</td><td>'+esc(it.description||'—')+'</td></tr>'

          +'<tr><td colspan="5"><div style="margin-bottom:8px"><strong>Input</strong></div><pre>'+esc(JSON.stringify(it.tool_input||{},null,2))+'</pre>'

          +'<div style="margin:8px 0"><strong>Output</strong></div><pre>'+esc(it.tool_output||'—')+'</pre>'

          +(it.error?'<div style="margin-top:8px;color:#fca5a5"><strong>Error:</strong> '+esc(it.error)+'</div>':'')

          +'</td></tr>';

      }).join('')+'</tbody></table>';

  }



  function renderAvailableTools(items){

    if(!Array.isArray(items)||!items.length) return '<div style="color:#94a3b8">Sin herramientas disponibles.</div>';

    return '<table style="margin-top:8px"><thead><tr><th>Tool</th><th>Source</th><th>Descripción</th></tr></thead><tbody>'

      +items.map(function(it){

        return '<tr><td>'+esc(it.tool_name||'—')+'</td><td>'+esc(it.source||'—')+'</td><td>'+esc(it.description||'—')+'</td></tr>';

      }).join('')+'</tbody></table>';

  }



  function renderAgentRuns(agentRuns, interactionIdx){

    if(!Array.isArray(agentRuns)||!agentRuns.length)

      return '<div style="color:#94a3b8">Sin trazas detalladas.</div>';

    return agentRuns.map(function(r,i){

      var runId='run-'+interactionIdx+'-'+i;

      return '<details id="'+runId+'" style="margin-top:12px">'

        +'<summary>'+esc(r.agent_name||r.agent_key||'Agente '+(i+1))+' · '+esc(r.agent_kind||'agent')+' · '+esc(r.model_used||'—')+'</summary>'

        +'<div style="margin-top:12px">'

        +'<div style="margin-bottom:10px"><strong>Agent key:</strong> '+esc(r.agent_key||'—')+'</div>'

        +'<div style="margin-bottom:10px"><strong>Conversation:</strong> '+esc(r.conversation_id||'—')+'</div>'

        +'<div style="margin-bottom:10px"><strong>Memory session:</strong> '+esc(r.memory_session_id||'—')+'</div>'

        +'<div style="margin-bottom:10px"><strong>LLM iterations:</strong> '+esc(r.llm_iterations??0)+'</div>'

        +'<div style="margin:12px 0 6px"><strong>Timing</strong></div>'+renderTimingTbl(r.timing||{})

        +'<div style="margin:12px 0 6px"><strong>Herramientas disponibles</strong></div>'+renderAvailableTools(r.available_tools||[])

        +'<div style="margin:12px 0 6px"><strong>Herramientas ejecutadas</strong></div>'+renderTools(r.tools_used||[])

        +'<details id="'+runId+'-prompts" style="margin-top:12px"><summary>Prompts</summary>'

        +'<div style="margin-top:12px">'

        +'<div style="margin:0 0 6px"><strong>System prompt</strong></div>'

        +'<pre>'+esc(r.system_prompt||'')+'</pre>'

        +'<div style="margin:12px 0 6px"><strong>User prompt</strong></div>'

        +'<pre>'+esc(r.user_prompt||'')+'</pre>'

        +'</div></details>'

        +'</div></details>';

    }).join('');

  }



  function renderDetail(item, idx){

    var funnel=JSON.stringify({etapa_nueva:item.funnel_etapa_nueva??null,metadata_actualizada:item.funnel_metadata_actualizada??null,error:item.funnel_error??null},null,2);

    var agentRuns=Array.isArray(item.agent_runs)?item.agent_runs:[];



    return '<details class="section" id="interaction-'+idx+'">'

      +'<summary>'+esc(item.contact_name||item.from_phone||item.message_id||'Interacción '+(idx+1))+' · '+esc(item.status||'processing')+' · '+esc(item.duration_ms!=null?(item.duration_ms/1000).toFixed(1)+' s':'—')+'</summary>'

      +'<div style="margin-top:12px">'

      +'<div style="margin-bottom:8px"><strong>Message ID:</strong> '+esc(item.message_id||'—')+'</div>'

      +'<div style="margin:12px 0 6px"><strong>Error</strong></div><pre>'+esc(item.error||'—')+'</pre>'

      +'<div style="margin-bottom:8px"><strong>Mensaje:</strong></div><pre>'+esc(item.message_text||'—')+'</pre>'

      +'<div style="margin:12px 0 6px"><strong>Respuesta preview</strong></div><pre>'+esc(item.response_preview||'—')+'</pre>'

      +'<div style="margin:12px 0 6px"><strong>Embudo en metadata</strong></div><pre>'+esc(funnel)+'</pre>'

      +'<div style="margin:12px 0 6px"><strong>Timing global</strong></div>'+renderTimingTbl(item.timing||{})

      +'<div style="margin:12px 0 6px"><strong>Tools globales</strong></div>'+renderTools(item.tools_used||[])

      +'<div style="margin:12px 0 6px"><strong>Trazas detalladas del agente</strong></div>'+renderAgentRuns(agentRuns, idx)

      +'</div></details>';

  }



  function update(data){

    var items=Array.isArray(data.interactions)?data.interactions:[];

    var ok=items.filter(function(i){return i.status==='ok'}).length;

    var err=items.filter(function(i){return i.status==='error'}).length;

    var wt=items.filter(function(i){return i.duration_ms!=null||(i.timing&&i.timing.total_ms!=null)});

    var avg=wt.length?Math.round(wt.reduce(function(a,i){return a+(i.duration_ms||i.timing&&i.timing.total_ms||0)},0)/wt.length):null;

    var avgLlm=wt.length?Math.round(wt.reduce(function(a,i){return a+(i.timing&&i.timing.llm_ms||0)},0)/wt.length):null;

    var avgInf=wt.length?Math.round(wt.reduce(function(a,i){

      var t=i.timing; if(!t||t.total_ms==null)return a;

      return a+Math.max(0,t.total_ms-(t.llm_ms||0)-(t.tool_execution_ms||0)-(t.mcp_discovery_ms||0)-(t.graph_build_ms||0));

    },0)/wt.length):null;



    var eTotal=document.getElementById('statTotal'); if(eTotal) eTotal.textContent=items.length;
    var eOk=document.getElementById('statOk'); if(eOk) eOk.textContent=ok;
    var eErr=document.getElementById('statErrors'); if(eErr) eErr.textContent=err;
    var eAvg=document.getElementById('statAvg'); if(eAvg) eAvg.textContent=avg!=null?(avg/1000).toFixed(1)+' s':'—';
    var eLlm=document.getElementById('statLlm'); if(eLlm) eLlm.textContent=avgLlm!=null?(avgLlm/1000).toFixed(1)+' s':'—';
    var eInf=document.getElementById('statInfra'); if(eInf) eInf.textContent=avgInf!=null?(avgInf/1000).toFixed(1)+' s':'—';

    var tbody=document.querySelector('table tbody');

    if(tbody){

      tbody.innerHTML=items.length

        ?items.map(renderRow).join('')

        :'<tr><td colspan="11" style="padding:20px;color:#94a3b8">Sin interacciones todavía.</td></tr>';

    }



    // Preserve open state of ALL details with IDs (interaction + run + prompts)

    var detailsContainer=document.getElementById('interaction-details');

    if(detailsContainer){

      var openSet=new Set();

      detailsContainer.querySelectorAll('details[open][id]').forEach(function(d){

        openSet.add(d.id);

      });

      detailsContainer.innerHTML=items.map(renderDetail).join('');

      openSet.forEach(function(id){

        var el=document.getElementById(id);

        if(el)el.setAttribute('open','');

      });

    }



    var bridgePre=document.getElementById('bridge-config');

    if(bridgePre)bridgePre.textContent=JSON.stringify(data.bridge_config||{},null,2);

    var fastapiPre=document.getElementById('fastapi-config');

    if(fastapiPre)fastapiPre.textContent=JSON.stringify(data.fastapi_config||{},null,2);

    var jsonPre=document.getElementById('json-completo');

    if(jsonPre)jsonPre.textContent=JSON.stringify(data,null,2);



    var ts=document.getElementById('last-update');

    if(ts)ts.textContent='Última actualización: '+new Date().toLocaleTimeString();

  }



  function poll(){

    var scrollY=window.scrollY;

    fetchDebug('/debug/kapso/data').then(function(r){return r.json()}).then(function(data){

      update(data);

      requestAnimationFrame(function(){ window.scrollTo(0,scrollY); });

    }).catch(function(e){console.warn('poll error',e)});

  }



  function toggleAuto(){

    autoRefresh=!autoRefresh;

    var btn=document.getElementById('toggle-auto');

    if(autoRefresh){

      btn.textContent='⏸ Pausar';

      btn.style.background='#16a34a';

      if(!sseConnected) startFallbackPolling(); // only poll if SSE is not active

    }else{

      btn.textContent='▶ Reanudar';

      btn.style.background='#dc2626';

      stopFallbackPolling();

    }

  }



  document.getElementById('toggle-auto').addEventListener('click',toggleAuto);

  loadEmpresasMap();
  // Initial poll to populate the table immediately on load
  poll();

})();

</script>

</body>

</html>`;

}



function renderConstellationHtml(graphData, empresasList = [], debugToken = '') {

  const injectedData = graphData ? JSON.stringify(graphData) : 'null';
  const injectedEmpresas = JSON.stringify(empresasList);

  return `<!doctype html>

<html lang="es">

<head>

<meta charset="utf-8">

<meta name="viewport" content="width=device-width,initial-scale=1">

<title>Monica Brain — Neural Map</title>

<style>

@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap');

*{margin:0;padding:0;box-sizing:border-box}

html,body{width:100%;height:100%;overflow:hidden;background:#020010;font-family:'Outfit',system-ui,sans-serif;color:#e2e8f0}

canvas{display:block;position:absolute;top:0;left:0}

#back{position:fixed;top:20px;left:20px;z-index:20;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:rgba(167,139,250,.8);padding:8px 18px;border-radius:10px;font-size:13px;cursor:pointer;text-decoration:none;backdrop-filter:blur(12px);transition:all .2s}

#back:hover{background:rgba(167,139,250,.12);border-color:rgba(167,139,250,.3);color:#c4b5fd}

#header{position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:20;text-align:center;pointer-events:none}

#header h1{font-size:20px;font-weight:600;letter-spacing:6px;text-transform:uppercase;background:linear-gradient(135deg,#a78bfa 0%,#6366f1 40%,#818cf8 70%,#c4b5fd 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}

#header p{font-size:11px;letter-spacing:3px;color:rgba(255,255,255,.18);margin-top:2px;text-transform:uppercase}

#tooltip{position:fixed;display:none;z-index:30;background:rgba(8,4,28,.94);border:1px solid rgba(139,92,246,.3);border-radius:14px;padding:16px 20px;max-width:360px;font-size:13px;line-height:1.7;backdrop-filter:blur(16px);box-shadow:0 0 40px rgba(99,102,241,.15),0 12px 40px rgba(0,0,0,.6);pointer-events:none}

#tooltip h3{font-size:15px;margin-bottom:6px;font-weight:600;color:#fff}

#tooltip .tag{display:inline-block;padding:3px 10px;border-radius:6px;font-size:10px;font-weight:600;letter-spacing:.8px;margin-bottom:10px;text-transform:uppercase}

#tooltip .detail{color:rgba(203,213,225,.75);font-size:12px}

#tooltip .detail b{color:#e2e8f0}

#legend{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:20;display:flex;gap:20px;font-size:12px;color:rgba(255,255,255,.35);background:rgba(8,4,28,.6);border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:10px 24px;backdrop-filter:blur(12px)}

#legend span{display:flex;align-items:center;gap:6px}

#legend i{display:inline-block;width:10px;height:10px;border-radius:50%;box-shadow:0 0 6px currentColor}

#loader{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:25;color:rgba(167,139,250,.6);font-size:14px;letter-spacing:2px;text-transform:uppercase;pointer-events:none}

#speed-ctrl{position:fixed;top:20px;right:20px;z-index:20;display:none;align-items:center;gap:6px;background:rgba(8,4,28,.7);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:6px 10px;backdrop-filter:blur(12px)}

#speed-ctrl span{font-size:11px;color:rgba(255,255,255,.35);letter-spacing:1px;text-transform:uppercase;margin-right:4px}

#speed-ctrl button{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:rgba(203,213,225,.7);font-size:11px;font-weight:600;padding:3px 10px;border-radius:6px;cursor:pointer;transition:all .15s;font-family:inherit}

#speed-ctrl button.active{background:rgba(167,139,250,.25);border-color:rgba(167,139,250,.5);color:#c4b5fd}

#realtime-badge{position:fixed;top:56px;right:20px;z-index:20;font-size:10px;color:rgba(52,211,153,.7);letter-spacing:1px;text-transform:uppercase;display:flex;align-items:center;gap:5px}
#empresa-filter{position:fixed;top:20px;left:120px;z-index:20;display:flex;align-items:center;gap:8px;background:rgba(8,4,28,.7);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:6px 12px;backdrop-filter:blur(12px)}
#empresa-filter label{font-size:11px;color:rgba(255,255,255,.35);letter-spacing:1px;text-transform:uppercase}
#empresa-filter select{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:#c4b5fd;font-size:12px;padding:4px 8px;border-radius:6px;cursor:pointer;font-family:inherit;outline:none}
#empresa-filter select:focus{border-color:rgba(167,139,250,.5)}
#empresa-filter select option{background:#1e1b3a;color:#e2e8f0}

#realtime-badge i{width:6px;height:6px;border-radius:50%;background:#34d399;box-shadow:0 0 8px #34d399;animation:pulse-rt 1.5s infinite}

@keyframes pulse-rt{0%,100%{opacity:1}50%{opacity:.3}}

</style>

</head>

<body>

<a href="/debug/kapso" id="back">Panel</a>

<div id="empresa-filter">
  <label>Empresa</label>
  <select id="empresa-sel">
    <option value="">Todas</option>
  </select>
</div>

<div id="header">

  <h1>Monica Brain</h1>

  <p>Neural Architecture Map</p>

</div>

<canvas id="c"></canvas>

<div id="loader">Cargando grafo…</div>

<div id="tooltip"></div>

<div id="legend">

  <span><i style="background:#a78bfa;color:#a78bfa"></i> Orquestador</span>

  <span><i style="background:#fb923c;color:#fb923c"></i> Agente</span>

  <span><i style="background:#34d399;color:#34d399"></i> Herramienta</span>

  <span><i style="background:#60a5fa;color:#60a5fa"></i> Externo</span>

  <span><i style="background:#f472b6;color:#f472b6"></i> Base de datos</span>

</div>

<div id="speed-ctrl">

  <span>Velocidad</span>

  <button data-speed="1">x1</button>

  <button class="active" data-speed="2">x2</button>

  <button data-speed="4">x4</button>

  <button data-speed="8">x8</button>

</div>

<div id="realtime-badge"><i></i>Live</div>

<script>

const DEBUG_TOKEN=new URLSearchParams(window.location.search).get('token')||${JSON.stringify(debugToken || '')};
function debugPath(path){
  if(!DEBUG_TOKEN)return path;
  const u=new URL(path,window.location.origin);
  u.searchParams.set('token',DEBUG_TOKEN);
  return u.pathname+u.search;
}
const C=document.getElementById('c'),X=C.getContext('2d'),TT=document.getElementById('tooltip');

const LOADER=document.getElementById('loader');

let W,H,mx=-1,my=-1,hovered=null,dragging=null,dragOff={x:0,y:0},t=0,dpr=1;

/* ── Empresa filter ── */
const _empresas = ${injectedEmpresas};
let selectedEmpresaId = '';
(function initEmpresaFilter(){
  const sel=document.getElementById('empresa-sel');
  if(!sel)return;
  _empresas.forEach(function(e){
    const opt=document.createElement('option');
    opt.value=String(e.id);
    opt.textContent=e.nombre;
    sel.appendChild(opt);
  });
  sel.addEventListener('change',function(){
    selectedEmpresaId=sel.value;
  });
})();
function _matchesEmpresaFilter(e){
  if(!selectedEmpresaId)return true;
  var p=e&&e.payload;
  if(!p)return true; // no payload = allow (bridge events etc.)
  if(p.empresa_id!=null) return String(p.empresa_id)===selectedEmpresaId;
  return true; // events without empresa_id pass through
}

let prevMx=0,prevMy=0,dragVx=0,dragVy=0;

const DAMPING=0.97,BOUNCE_MARGIN=0.05;



let NODES=[], EDGES=[];



/* ── Speed control ── */

const SPEED_MULT=2;



/* ── Flow particles ── */

// Each particle: { edgeFrom, edgeTo, progress (0→1), speed, color, r, label, trail[] }

const flowParticles=[];

const PARTICLE_BASE_DURATION=2200; // ms at x1 to travel full edge



/* Map of stage name → list of edges to animate (each edge: [fromId, toId, color]) */

/* Static stages — always animate the same edges */

const STAGE_FLOWS={

  'inbound_received':      [['whatsapp','orch','#60a5fa']],

  'fallback_numero':       [['orch','orch','#f59e0b']],

  'fallback_agent':        [['orch','orch','#f59e0b']],

  'inbound_entities_resolved': [['orch','supabase','#f472b6'],['supabase','orch','#f472b6']],

  'inbound_messages_persisted':[['orch','supabase','#f472b6']],

  'memory_session_resolved':   [['orch','supabase','#f472b6'],['supabase','orch','#f472b6']],

  'prompt_context_built':  [['orch','conv','#a78bfa']],

  'run_agent_start':       [['orch','conv','#a78bfa'],['orch','funnel','#fb923c'],['orch','contact','#fb923c']],

  'slash_command_done':    [['orch','whatsapp','#34d399']],

  'audio_processing':      [['orch','storage','#f472b6'],['orch','edge_fn','#60a5fa']],

  'image_processing':      [['orch','storage','#f472b6'],['orch','vision','#60a5fa'],['vision','openrouter','#60a5fa']],

  'document_processing':   [['orch','storage','#f472b6'],['orch','edge_fn','#60a5fa']],

  'http_error':            [['orch','whatsapp','#ef4444']],

  'exception':             [['orch','whatsapp','#ef4444']],

};



/* Map tool_name → graph node id for dynamic flow building */

const TOOL_NODE_MAP={

  'send_reaction':              't_reaction',

  'guardar_nota':               't_nota',

  'marcar_prospecto_calificado':'t_calificado',

  'ejecutar_comando':           't_comandos',

  'update_metadata':            't_metadata',

  'update_contact_info':        't_update',

  'desactivar_contacto_spam':   't_spam',

  'consultar_disponibilidad':   't_disponibilidad',

  'agendar_cita':               't_agendar',

  'reagendar_cita':             't_reagendar',

  'cancelar_cita':              't_cancelar',

};

function toolToNodeId(toolName){ return TOOL_NODE_MAP[toolName] || null; }



/* Build dynamic flows for stages that depend on tools_used */

function buildDynamicFlows(stage, payload){

  const tools = (payload && Array.isArray(payload.tools_used)) ? payload.tools_used : [];

  const toolNames = tools.map(function(t){ return t.tool_name || t.name || ''; });



  if(stage === 'run_agent_done'){

    const flows = [['conv','openrouter','#60a5fa']]; // LLM always runs

    const seen = new Set();

    toolNames.forEach(function(name){

      if(!name) return;

      const nodeId = toolToNodeId(name);

      if(!nodeId || seen.has(nodeId)) return;

      seen.add(nodeId);

      flows.push(['conv', nodeId, '#34d399']);

      // If ejecutar_comando, also animate to whatsapp

      if(nodeId === 't_comandos') flows.push(['t_comandos','whatsapp','#fb923c']);

      // If guardar_nota or marcar_calificado, animate to supabase

      if(nodeId === 't_nota' || nodeId === 't_calificado') flows.push([nodeId,'supabase','#f472b6']);

      // If desactivar_spam, animate to supabase

      if(nodeId === 't_spam') flows.push(['t_spam','supabase','#f472b6']);

    });

    // Always end with response to whatsapp

    flows.push(['conv','whatsapp','#a78bfa']);

    return flows;

  }



  if(stage === 'run_funnel_done'){

    const flows = [['funnel','openrouter','#60a5fa']];

    if(toolNames.includes('update_metadata')){

      flows.push(['funnel','t_metadata','#34d399']);

      flows.push(['t_metadata','supabase','#f472b6']);

    }

    flows.push(['funnel','orch','#fb923c']);

    return flows;

  }



  if(stage === 'run_contact_update_done'){

    const flows = [['contact','openrouter','#60a5fa']];

    if(toolNames.includes('update_contact_info') || toolNames.length > 0){

      flows.push(['contact','t_update','#34d399']);

      flows.push(['t_update','supabase','#f472b6']);

    }

    return flows;

  }



  return null; // not a dynamic stage, use STAGE_FLOWS

}




/* Node pulse: when a stage hits, briefly light up nodes */

const nodePulse={}; // nodeId -> { until: timestamp, color }



function triggerFlows(stage, payload){

  const flows = buildDynamicFlows(stage, payload) || STAGE_FLOWS[stage];

  if(!flows)return;

  const duration=PARTICLE_BASE_DURATION/SPEED_MULT;

  flows.forEach(function(f,i){

    const fromId=f[0],toId=f[1],color=f[2];

    // Stagger multiple particles slightly

    setTimeout(function(){

      flowParticles.push({

        fromId:fromId,toId:toId,

        progress:0,

        speed:1/duration,

        color:color,

        r:5,

        trail:[],

        label:stage.replace(/_/g,' '),

      });

      // Pulse both endpoints

      nodePulse[fromId]={until:Date.now()+800,color:color};

      nodePulse[toId]={until:Date.now()+800+duration,color:color};

    },i*180/SPEED_MULT);

  });

}



/* ── Real-time event tracking via SSE + polling fallback ── */

const seenEventKeys=new Set();

let lastPollAt=0;

const POLL_INTERVAL=10000; // Fallback polling (longer since SSE is primary)

let sseConnected=false;



function processSingleEvent(e){

  if(!e||!e.stage)return;
  if(!_matchesEmpresaFilter(e))return;

  const DYNAMIC_STAGES=['run_agent_done','run_funnel_done','run_contact_update_done'];

  const key=(e.timestamp||'')+'|'+(e.stage||'')+'|'+(e.source||'');

  if(seenEventKeys.has(key))return;

  seenEventKeys.add(key);

  // Tab is in background: mark as seen but skip animation to avoid burst on return
  if(document.hidden)return;

  if(STAGE_FLOWS[e.stage] || DYNAMIC_STAGES.includes(e.stage)){

    triggerFlows(e.stage, e.payload);

  }

}



function processNewEvents(events){

  if(!Array.isArray(events))return;

  const DYNAMIC_STAGES=['run_agent_done','run_funnel_done','run_contact_update_done'];

  const fresh=[];

  for(let i=0;i<events.length;i++){

    const e=events[i];

    if(!e||!e.stage)continue;
    if(!_matchesEmpresaFilter(e))continue;

    const key=(e.timestamp||'')+'|'+(e.stage||'')+'|'+(e.source||'');

    if(seenEventKeys.has(key))continue;

    seenEventKeys.add(key);

    if(STAGE_FLOWS[e.stage] || DYNAMIC_STAGES.includes(e.stage))fresh.push(e);

  }

  if(!fresh.length)return;

  fresh.sort(function(a,b){return new Date(a.timestamp)-new Date(b.timestamp);});

  let acc=0;

  fresh.forEach(function(ev){

    setTimeout(function(){triggerFlows(ev.stage, ev.payload);},acc);

    acc+=Math.max(180,450/SPEED_MULT);

  });

}



function pollDebugData(){

  if(sseConnected)return; // SSE is handling real-time, skip polling

  const now=Date.now();

  if(now-lastPollAt<POLL_INTERVAL)return;

  lastPollAt=now;

  fetch(debugPath('/debug/kapso/data')).then(function(r){return r.json();}).then(function(data){

    processNewEvents(data.fastapi_events);

  }).catch(function(){});

}



/* ── SSE connection ── */

function connectSSE(){

  const badge=document.getElementById('realtime-badge');

  const badgeIcon=badge?badge.querySelector('i'):null;

  const badgeText=badge;

  

  function setBadge(text,color,glowColor){

    if(badgeIcon){badgeIcon.style.background=color;badgeIcon.style.boxShadow='0 0 8px '+glowColor;}

    if(badgeText)badgeText.lastChild.textContent=text;

  }

  

  const es=new EventSource(debugPath('/debug/kapso/stream'));

  

  es.onopen=function(){

    sseConnected=true;

    setBadge(' Real-time','#34d399','#34d399');

    console.log('[Visual] SSE connected — real-time mode');

  };

  

  es.onmessage=function(msg){

    try{

      const ev=JSON.parse(msg.data);

      if(ev.error){console.warn('[Visual] SSE error:',ev.error);return;}

      processSingleEvent(ev);

    }catch(e){console.warn('[Visual] SSE parse error:',e);}

  };

  

  es.onerror=function(){

    sseConnected=false;

    setBadge(' Polling','#f59e0b','#f59e0b');

    console.warn('[Visual] SSE disconnected — falling back to polling');

    es.close();

    // Reconnect after 5s

    setTimeout(connectSSE,5000);

  };

}



// Start SSE + initial seed of seen events (no animation replay on page load)

connectSSE();

// When user returns to this tab, drop any particles that built up while hidden
document.addEventListener('visibilitychange',function(){
  if(!document.hidden){
    flowParticles.length=0;
  }
});

fetch(debugPath('/debug/kapso/data')).then(function(r){return r.json();}).then(function(data){

  // Only seed seenEventKeys — the demo burst below provides the visual intro
  const evts=data.fastapi_events;
  if(Array.isArray(evts)){
    evts.forEach(function(e){
      if(!e||!e.stage)return;
      seenEventKeys.add((e.timestamp||'')+'|'+(e.stage||'')+'|'+(e.source||''));
    });
  }

}).catch(function(){});



/* ── Load graph schema (injected server-side) ── */

const _injected = ${injectedData};

if(_injected && _injected.nodes){

  NODES=_injected.nodes;

  EDGES=_injected.edges||[];

  NODES.forEach(n=>{n.vx=0;n.vy=0;});

  if(LOADER)LOADER.style.display='none';



  // Seed seen events so existing data doesn't replay as particles

  fetch(debugPath('/debug/kapso/data')).then(function(r){return r.json();}).then(function(data){

    const evts=data.fastapi_events;

    if(Array.isArray(evts)){

      evts.forEach(function(e){

        if(!e||!e.stage)return;

        seenEventKeys.add((e.timestamp||'')+'|'+(e.stage||'')+'|'+(e.source||''));

      });

    }

  }).catch(function(){});



  // Initial demo burst after 800ms (shows MCP + nota flow)

  setTimeout(function(){triggerFlows('inbound_received');},800);

  setTimeout(function(){triggerFlows('run_agent_start');},1600);

  setTimeout(function(){triggerFlows('run_agent_done',_demoPayload);},2600);

}else{

  if(LOADER)LOADER.textContent='Grafo no disponible — reinicia el servidor Python';

}



/* ── Nebula & stars ── */

const stars=Array.from({length:400},()=>({x:Math.random(),y:Math.random(),s:Math.random()*1.2+.3,b:Math.random(),sp:Math.random()*.5+.5}));

const nebulae=[

  {x:.3,y:.35,rx:220,ry:140,color:'rgba(99,102,241,.04)'},

  {x:.7,y:.45,rx:180,ry:120,color:'rgba(244,114,182,.03)'},

  {x:.5,y:.2,rx:250,ry:100,color:'rgba(96,165,250,.03)'},

  {x:.5,y:.7,rx:200,ry:130,color:'rgba(52,211,153,.025)'},

];



function resize(){

  dpr=window.devicePixelRatio||1;

  W=window.innerWidth;H=window.innerHeight;

  C.width=W*dpr;C.height=H*dpr;

  C.style.width=W+'px';C.style.height=H+'px';

  X.setTransform(dpr,0,0,dpr,0,0);

}

window.addEventListener('resize',resize);resize();



function nodePos(n){return{x:n.x*W,y:n.y*H}}



function physics(){

  // Node-to-node collision: repel overlapping nodes
  for(let i=0;i<NODES.length;i++){
    for(let j=i+1;j<NODES.length;j++){
      const a=NODES[i],b=NODES[j];
      const ax=a.x*W,ay=a.y*H,bx=b.x*W,by=b.y*H;
      const dx=bx-ax,dy=by-ay;
      const dist=Math.sqrt(dx*dx+dy*dy)||1;
      const minDist=(a.r+b.r)*1.6;
      if(dist<minDist){
        const overlap=(minDist-dist)/dist*0.02;
        const ox=dx*overlap/W,oy=dy*overlap/H;
        if(a!==dragging){a.x-=ox;a.y-=oy;a.vx-=ox*.3;a.vy-=oy*.3;}
        if(b!==dragging){b.x+=ox;b.y+=oy;b.vx+=ox*.3;b.vy+=oy*.3;}
      }
    }
  }

  for(const n of NODES){

    if(n===dragging)continue;

    if(Math.abs(n.vx)<0.00001&&Math.abs(n.vy)<0.00001)continue;

    n.vx*=DAMPING; n.vy*=DAMPING;

    n.x+=n.vx; n.y+=n.vy;

    if(n.x<BOUNCE_MARGIN){n.x=BOUNCE_MARGIN;n.vx=Math.abs(n.vx)*.4;}

    if(n.x>1-BOUNCE_MARGIN){n.x=1-BOUNCE_MARGIN;n.vx=-Math.abs(n.vx)*.4;}

    if(n.y<BOUNCE_MARGIN){n.y=BOUNCE_MARGIN;n.vy=Math.abs(n.vy)*.4;}

    if(n.y>1-BOUNCE_MARGIN){n.y=1-BOUNCE_MARGIN;n.vy=-Math.abs(n.vy)*.4;}

    if(Math.abs(n.vx)<0.00001)n.vx=0;

    if(Math.abs(n.vy)<0.00001)n.vy=0;

  }

}



let lastFrameTime=performance.now();

function draw(){

  const now=performance.now();

  const dt=(now-lastFrameTime)/1000; // seconds

  lastFrameTime=now;



  t+=.002;

  physics();

  pollDebugData();



  X.clearRect(0,0,W,H);



  // Deep space gradient

  const bg=X.createRadialGradient(W/2,H/2,0,W/2,H/2,Math.max(W,H)*.7);

  bg.addColorStop(0,'#0a0520');bg.addColorStop(.5,'#050214');bg.addColorStop(1,'#020010');

  X.fillStyle=bg;X.fillRect(0,0,W,H);



  // Nebulae

  for(const nb of nebulae){

    const g=X.createRadialGradient(nb.x*W,nb.y*H,0,nb.x*W,nb.y*H,nb.rx);

    const pulse=1+.15*Math.sin(t*1.5+nb.x*4);

    g.addColorStop(0,nb.color.replace(/[\\d.]+\\)$/,(parseFloat(nb.color.match(/[\\d.]+\\)$/)[0])*pulse)+')'));

    g.addColorStop(1,'transparent');

    X.fillStyle=g;

    X.beginPath();X.ellipse(nb.x*W,nb.y*H,nb.rx*pulse,nb.ry*pulse,0,0,6.28);X.fill();

  }



  // Stars

  for(const s of stars){

    const bri=.12+.18*Math.sin(t*s.sp*2+s.b*6.28);

    X.fillStyle='rgba(200,210,255,'+bri+')';

    X.beginPath();X.arc(s.x*W,s.y*H,s.s,0,6.28);X.fill();

  }



  // Update + draw flow particles

  for(let i=flowParticles.length-1;i>=0;i--){

    const p=flowParticles[i];

    const fromNode=NODES.find(n=>n.id===p.fromId);

    const toNode=NODES.find(n=>n.id===p.toId);

    if(!fromNode||!toNode){flowParticles.splice(i,1);continue;}

    p.progress+=p.speed*dt*1000*SPEED_MULT;

    if(p.progress>=1){flowParticles.splice(i,1);continue;}



    const fp=nodePos(fromNode);

    const tp=nodePos(toNode);

    const px=fp.x+(tp.x-fp.x)*p.progress;

    const py=fp.y+(tp.y-fp.y)*p.progress;



    // Trail

    p.trail.push({x:px,y:py});

    if(p.trail.length>18)p.trail.shift();



    // Draw trail

    for(let j=1;j<p.trail.length;j++){

      const alpha=(j/p.trail.length)*0.45;

      const tr=p.trail[j-1],tr2=p.trail[j];

      X.strokeStyle=p.color.replace(')',','+alpha+')').replace('rgb','rgba').replace('rgba','rgba');

      // Use a simpler approach: set globalAlpha

      X.save();

      X.globalAlpha=alpha;

      X.strokeStyle=p.color;

      X.lineWidth=2*(j/p.trail.length);

      X.beginPath();X.moveTo(tr.x,tr.y);X.lineTo(tr2.x,tr2.y);X.stroke();

      X.restore();

    }



    // Draw particle head

    X.save();

    X.shadowColor=p.color;X.shadowBlur=16;

    X.fillStyle=p.color;

    X.beginPath();X.arc(px,py,p.r,0,6.28);X.fill();

    X.shadowBlur=0;X.restore();

  }



  // Edges

  for(const e of EDGES){

    const a=NODES.find(n=>n.id===e.from),b=NODES.find(n=>n.id===e.to);

    if(!a||!b)continue;

    const p1=nodePos(a),p2=nodePos(b);

    const isHov=hovered&&(hovered.id===a.id||hovered.id===b.id);

    const isConnected=hovered&&EDGES.some(ed=>(ed.from===hovered.id||ed.to===hovered.id)&&(ed.from===a.id||ed.to===a.id||ed.from===b.id||ed.to===b.id));



    // Check if any active flow particle is on this edge

    const hasFlow=flowParticles.some(fp=>fp.fromId===e.from&&fp.toId===e.to);



    X.save();

    if(isHov){

      X.shadowColor=a.color;X.shadowBlur=8;

      X.strokeStyle='rgba(255,255,255,.5)';

      X.lineWidth=2;

    }else if(hasFlow){

      X.strokeStyle='rgba(255,255,255,.25)';

      X.lineWidth=1.5;

    }else if(hovered&&!isConnected){

      X.strokeStyle='rgba(255,255,255,.03)';

      X.lineWidth=.5;

    }else{

      X.strokeStyle='rgba(255,255,255,.1)';

      X.lineWidth=.8;

    }

    if(e.dash){X.setLineDash([5,8]);}else{X.setLineDash([]);}

    X.beginPath();X.moveTo(p1.x,p1.y);X.lineTo(p2.x,p2.y);X.stroke();

    X.shadowBlur=0;

    X.restore();



    // Ambient edge particle

    if(!hovered||isHov){

      const speed=(t*(.3+a.x*.2))%1;

      const epx=p1.x+(p2.x-p1.x)*speed;

      const epy=p1.y+(p2.y-p1.y)*speed;

      X.fillStyle=isHov?'rgba(255,255,255,.6)':'rgba(255,255,255,.12)';

      X.beginPath();X.arc(epx,epy,isHov?2.5:1.5,0,6.28);X.fill();

    }



    if(e.label&&isHov){

      const mx2=(p1.x+p2.x)/2,my2=(p1.y+p2.y)/2;

      X.font='500 11px Outfit,system-ui,sans-serif';

      X.fillStyle='rgba(255,255,255,.55)';

      X.textAlign='center';X.textBaseline='middle';

      X.fillText(e.label,mx2,my2-10);

    }

  }



  // Nodes

  const nowTs=Date.now();

  for(const n of NODES){

    const p=nodePos(n);

    const isHov=hovered&&hovered.id===n.id;

    const isConn=hovered&&EDGES.some(e=>(e.from===hovered.id&&e.to===n.id)||(e.to===hovered.id&&e.from===n.id));

    const dimmed=hovered&&!isHov&&!isConn;

    const pulse=1+.06*Math.sin(t*2.5+n.x*8+n.y*5);



    // Check pulse from flow

    const np=nodePulse[n.id];

    const isPulsing=np&&nowTs<np.until;

    const pulseExtra=isPulsing?1+.25*Math.sin((nowTs-np.until+800)/800*Math.PI):0;

    const R=n.r*pulse*(isHov?1.2:1)*(isPulsing?1+pulseExtra*.15:1);



    // Outer glow

    const glowColor=isPulsing?np.color:n.glow;

    const g=X.createRadialGradient(p.x,p.y,R*.2,p.x,p.y,R*(isHov?3:2.5));

    g.addColorStop(0,isPulsing?(np.color+'88'):n.glow);g.addColorStop(1,'transparent');

    X.globalAlpha=dimmed?.2:1;

    X.fillStyle=g;X.beginPath();X.arc(p.x,p.y,R*(isHov?3:2.5),0,6.28);X.fill();



    if(isHov||isPulsing){

      X.strokeStyle=isPulsing?np.color:n.color;

      X.lineWidth=isPulsing?2:1.5;

      X.globalAlpha=isPulsing?.5:.3;

      X.beginPath();X.arc(p.x,p.y,R*1.6,0,6.28);X.stroke();

      X.globalAlpha=1;

    }



    const cg=X.createRadialGradient(p.x-R*.2,p.y-R*.25,R*.1,p.x,p.y,R);

    cg.addColorStop(0,'rgba(255,255,255,.25)');cg.addColorStop(.4,n.color);cg.addColorStop(1,n.color+'99');

    X.fillStyle=cg;

    X.globalAlpha=dimmed?.25:(isHov?1:.8);

    X.beginPath();X.arc(p.x,p.y,R,0,6.28);X.fill();

    X.globalAlpha=1;



    X.strokeStyle=dimmed?'rgba(255,255,255,.04)':(isHov?'rgba(255,255,255,.6)':isPulsing?'rgba(255,255,255,.35)':'rgba(255,255,255,.1)');

    X.lineWidth=isHov?2:isPulsing?1.5:1;

    X.beginPath();X.arc(p.x,p.y,R+1,0,6.28);X.stroke();



    const fontSize=n.kind==='orchestrator'?15:n.kind==='agent'?14:12;

    X.font=(n.kind==='orchestrator'||n.kind==='agent'?'600 ':'400 ')+fontSize+'px Outfit,system-ui,sans-serif';

    X.fillStyle=dimmed?'rgba(255,255,255,.15)':'rgba(255,255,255,.85)';

    X.textAlign='center';X.textBaseline='middle';

    X.fillText(n.label,p.x,p.y+R+18);

  }



  requestAnimationFrame(draw);

}

requestAnimationFrame(draw);



/* ── Interaction: drag & hover ── */

function hitTest(ex,ey){

  for(const n of NODES){

    const p=nodePos(n);

    const dx=ex-p.x,dy=ey-p.y;

    if(dx*dx+dy*dy<(n.r+14)*(n.r+14))return n;

  }

  return null;

}



C.addEventListener('mousedown',e=>{

  const hit=hitTest(e.clientX,e.clientY);

  if(hit){

    dragging=hit;

    hit.vx=0;hit.vy=0;

    const p=nodePos(hit);

    dragOff.x=e.clientX-p.x;

    dragOff.y=e.clientY-p.y;

    prevMx=e.clientX;prevMy=e.clientY;

    dragVx=0;dragVy=0;

    TT.style.display='none';

  }

});



C.addEventListener('mousemove',e=>{

  mx=e.clientX;my=e.clientY;

  if(dragging){

    dragging.x=(mx-dragOff.x)/W;

    dragging.y=(my-dragOff.y)/H;

    dragVx=0.7*dragVx+0.3*(mx-prevMx)/W;

    dragVy=0.7*dragVy+0.3*(my-prevMy)/H;

    prevMx=mx;prevMy=my;

    C.style.cursor='grabbing';

    TT.style.display='none';

    return;

  }

  hovered=hitTest(mx,my);

  if(hovered){

    C.style.cursor='grab';

    const n=hovered;

    const colors={orchestrator:'#a78bfa',agent:'#fb923c',tool:'#34d399',external:'#60a5fa',database:'#f472b6'};

    const labels={orchestrator:'ORQUESTADOR',agent:'AGENTE',tool:'HERRAMIENTA',external:'SERVICIO EXTERNO',database:'BASE DE DATOS'};

    TT.innerHTML='<h3>'+n.desc+'</h3>'

      +'<span class="tag" style="background:'+colors[n.kind]+'18;color:'+colors[n.kind]+';border:1px solid '+colors[n.kind]+'44">'+labels[n.kind]+'</span>'

      +'<div class="detail">'+n.detail.replace(/\\n/g,'<br>')+'</div>';

    TT.style.display='block';

    let tx=mx+18,ty=my+18;

    if(tx+370>W)tx=mx-380;

    if(ty+220>H)ty=my-230;

    TT.style.left=tx+'px';TT.style.top=ty+'px';

  }else{

    C.style.cursor='default';

    TT.style.display='none';

  }

});

window.addEventListener('mouseup',()=>{

  if(dragging){

    dragging.vx=dragVx*.35;

    dragging.vy=dragVy*.35;

  }

  dragging=null;

});

C.addEventListener('mouseleave',()=>{

  hovered=null;

  if(dragging){dragging.vx=dragVx*.25;dragging.vy=dragVy*.25;}

  dragging=null;

  TT.style.display='none';

});

</script>

</body>

</html>`;

}



function renderPublicConstellationHtml(graphData, publicDataPath) {

  const injectedData = graphData ? JSON.stringify(graphData) : 'null';

  return `<!doctype html>

<html lang="es">

<head>

<meta charset="utf-8">

<meta name="viewport" content="width=device-width,initial-scale=1">

<title>Kapso Visual</title>

<style>

@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap');

*{margin:0;padding:0;box-sizing:border-box}

html,body{width:100%;height:100%;overflow:hidden;background:#020010;font-family:'Outfit',system-ui,sans-serif}

canvas{display:block;position:absolute;top:0;left:0}

#loader{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:10;color:rgba(167,139,250,.55);font-size:14px;letter-spacing:2px;text-transform:uppercase;pointer-events:none}

#header{position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:20;text-align:center;pointer-events:none}

#header h1{font-size:22px;letter-spacing:8px;font-weight:600;background:linear-gradient(90deg,#a78bfa,#60a5fa,#f472b6);-webkit-background-clip:text;background-clip:text;color:transparent;text-transform:uppercase}

#header p{font-size:11px;letter-spacing:3px;color:rgba(255,255,255,.18);margin-top:2px;text-transform:uppercase}

#tooltip{position:fixed;display:none;z-index:30;background:rgba(8,4,28,.94);border:1px solid rgba(139,92,246,.3);border-radius:14px;padding:16px 20px;max-width:360px;font-size:13px;line-height:1.7;backdrop-filter:blur(16px);box-shadow:0 0 40px rgba(99,102,241,.15),0 12px 40px rgba(0,0,0,.6);pointer-events:none}

#tooltip h3{font-size:15px;margin-bottom:6px;font-weight:600;color:#fff}

#tooltip .tag{display:inline-block;padding:3px 10px;border-radius:6px;font-size:10px;font-weight:600;letter-spacing:.8px;margin-bottom:10px;text-transform:uppercase}

#tooltip .detail{color:rgba(203,213,225,.75);font-size:12px}

#tooltip .detail b{color:#e2e8f0}

#legend{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:20;display:flex;gap:20px;font-size:12px;color:rgba(255,255,255,.35);background:rgba(8,4,28,.6);border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:10px 24px;backdrop-filter:blur(12px)}

#legend span{display:flex;align-items:center;gap:8px}

#legend i{width:8px;height:8px;border-radius:999px;display:inline-block}

</style>

</head>

<body>

<canvas id="c"></canvas>

<div id="loader">Cargando animación…</div>

<div id="header"><h1>Monica Brain</h1><p>Neural Architecture Map</p></div>

<div id="tooltip"></div>

<div id="legend">

  <span><i style="background:#a78bfa"></i>Orquestador</span>

  <span><i style="background:#fb923c"></i>Agente</span>

  <span><i style="background:#34d399"></i>Herramienta</span>

  <span><i style="background:#60a5fa"></i>Externo</span>

  <span><i style="background:#f472b6"></i>Base de datos</span>

</div>

<script>

const DATA_PATH=${JSON.stringify(publicDataPath)};

const C=document.getElementById('c'),X=C.getContext('2d'),TT=document.getElementById('tooltip');

const LOADER=document.getElementById('loader');

let W,H,mx=-1,my=-1,hovered=null,dragging=null,dragOff={x:0,y:0},prevMx=0,prevMy=0,dragVx=0,dragVy=0,t=0,dpr=1;

let NODES=[],EDGES=[];

const flowParticles=[];

const seenEventKeys=new Set();

const SPEED_MULT=2;

const PARTICLE_BASE_DURATION=2200;

// Colores de canal — usados en flujos de entrada/salida y respuestas
const _WA_C='#25d366';   // WhatsApp green
const _IG_C='#c13584';   // Instagram purple-pink
const _FB_C='#1877f2';   // Facebook blue

const STAGE_FLOWS={

  inbound_received:[['n1','n2',_WA_C]],

  fallback_numero:[['n2','n2','#f59e0b']],

  fallback_agent:[['n2','n2','#f59e0b']],

  inbound_entities_resolved:[['n2','n6','#f472b6'],['n6','n2','#f472b6']],

  inbound_messages_persisted:[['n2','n6','#f472b6']],

  memory_session_resolved:[['n2','n6','#f472b6'],['n6','n2','#f472b6']],

  prompt_context_built:[['n2','n3','#a78bfa']],

  run_agent_start:[['n2','n3','#a78bfa'],['n2','n4','#fb923c'],['n2','n5','#fb923c']],

  run_agent_done:[['n3','n7','#60a5fa'],['n3','n2','#a78bfa'],['n2','n1',_WA_C]],

  run_funnel_done:[['n4','n7','#60a5fa'],['n4','n2','#fb923c']],

  run_contact_update_done:[['n5','n7','#60a5fa'],['n5','n6','#f472b6']],

  slash_command_done:[['n2','n1',_WA_C]],

  audio_processing:[['n2','n8','#f472b6'],['n2','n9','#60a5fa']],

  image_processing:[['n2','n8','#f472b6'],['n2','n10','#60a5fa'],['n10','n7','#60a5fa']],

  document_processing:[['n2','n8','#f472b6'],['n2','n9','#60a5fa']],

  call_fastapi_done:[['n2','n1',_WA_C]],

  kapso_send_done:[['n2','n1',_WA_C]],

  kapso_send_reaction_with_text:[['n2','n1',_WA_C]],

  http_error:[['n2','n1','#ef4444']],

  exception:[['n2','n1','#ef4444']],

  message_received:[['n20','n2',_IG_C]],

  message_sent:[['n2','n20',_IG_C]],

  fb_message_received:[['n30','n2',_FB_C]],

  fb_message_sent:[['n2','n30',_FB_C]],

};

const nodePulse={};

const stars=Array.from({length:400},()=>({x:Math.random(),y:Math.random(),s:Math.random()*1.2+.3,b:Math.random(),sp:Math.random()*.5+.5}));

const nebulae=[

  {x:.3,y:.35,rx:220,ry:140,color:'rgba(99,102,241,.04)'},

  {x:.7,y:.6,rx:260,ry:170,color:'rgba(139,92,246,.05)'},

  {x:.55,y:.2,rx:180,ry:110,color:'rgba(236,72,153,.035)'}

];

function resize(){

  dpr=Math.min(window.devicePixelRatio||1,2);

  W=window.innerWidth;H=window.innerHeight;

  C.width=W*dpr;C.height=H*dpr;C.style.width=W+'px';C.style.height=H+'px';

  X.setTransform(dpr,0,0,dpr,0,0);

}

window.addEventListener('resize',resize);resize();

function nodePos(n){return{x:n.x*W,y:n.y*H};}

function physics(){

  for(let i=0;i<NODES.length;i++){

    for(let j=i+1;j<NODES.length;j++){

      const a=NODES[i],b=NODES[j];

      const ax=a.x*W,ay=a.y*H,bx=b.x*W,by=b.y*H;

      const dx=bx-ax,dy=by-ay;

      const dist=Math.sqrt(dx*dx+dy*dy)||1;

      const min=((a.r||12)+(b.r||12))*2.3;

      if(dist<min){

        const f=(min-dist)/min*0.00012;

        const nx=dx/dist,ny=dy/dist;

        a.vx=(a.vx||0)-nx*f;b.vx=(b.vx||0)+nx*f;

        a.vy=(a.vy||0)-ny*f;b.vy=(b.vy||0)+ny*f;

      }

    }

  }

  for(const n of NODES){

    if(n===dragging)continue;

    n.vx=(n.vx||0)*0.9;

    n.vy=(n.vy||0)*0.9;

    n.vx+=((n.hx??n.x)-n.x)*0.0035;

    n.vy+=((n.hy??n.y)-n.y)*0.0035;

    n.x+=n.vx;

    n.y+=n.vy;

    n.x=Math.max(0.08,Math.min(0.92,n.x));

    n.y=Math.max(0.1,Math.min(0.9,n.y));

  }

}

function hitTest(ex,ey){

  for(const n of NODES){

    const p=nodePos(n);

    const dx=ex-p.x,dy=ey-p.y;

    if(dx*dx+dy*dy<(n.r+14)*(n.r+14))return n;

  }

  return null;

}

function triggerFlows(stage){

  const flows=STAGE_FLOWS[stage];

  if(!flows)return;

  const duration=PARTICLE_BASE_DURATION/SPEED_MULT;

  flows.forEach(function(f,i){

    setTimeout(function(){

      flowParticles.push({fromId:f[0],toId:f[1],progress:0,speed:1/duration,color:f[2],r:5,trail:[]});

      nodePulse[f[0]]={until:Date.now()+800,color:f[2]};

      nodePulse[f[1]]={until:Date.now()+800+duration,color:f[2]};

    },i*180/SPEED_MULT);

  });

}

// Persistir eventos ya vistos para no re-ejecutar al recargar la página
const _SEEN_KEY='monbrain_seen_v2';
(function(){try{const r=localStorage.getItem(_SEEN_KEY);if(r)JSON.parse(r).forEach(function(k){seenEventKeys.add(k);});}catch(e){}})();

function _persistSeen(){
  try{localStorage.setItem(_SEEN_KEY,JSON.stringify(Array.from(seenEventKeys).slice(-400)));}catch(e){}
}

function processEvents(events){

  if(!Array.isArray(events)||!events.length)return;

  const fresh=[];

  let anyNew=false;

  for(const e of events){

    if(!e||!e.stage||!e.timestamp)continue;

    const key=(e.timestamp||'')+'|'+(e.stage||'')+'|'+(e.source||'');

    if(seenEventKeys.has(key))continue;

    seenEventKeys.add(key);

    anyNew=true;

    if(STAGE_FLOWS[e.stage])fresh.push(e);

  }

  if(anyNew)_persistSeen();

  fresh.sort(function(a,b){return new Date(a.timestamp)-new Date(b.timestamp);});

  let acc=0;

  fresh.forEach(function(ev){setTimeout(function(){triggerFlows(ev.stage);},acc);acc+=Math.max(180,450/SPEED_MULT);});

}

function poll(){

  fetch(DATA_PATH).then(function(r){return r.json();}).then(function(data){processEvents(data.events||[]);}).catch(function(){});

}

function drawBg(){

  const bg=X.createLinearGradient(0,0,W,H);

  bg.addColorStop(0,'#020010');bg.addColorStop(.5,'#05031c');bg.addColorStop(1,'#020010');

  X.fillStyle=bg;X.fillRect(0,0,W,H);

  nebulae.forEach(function(n){

    const g=X.createRadialGradient(n.x*W,n.y*H,0,n.x*W,n.y*H,n.rx);

    g.addColorStop(0,n.color);g.addColorStop(1,'transparent');

    X.fillStyle=g;

    X.beginPath();X.ellipse(n.x*W,n.y*H,n.rx,n.ry,0,0,Math.PI*2);X.fill();

  });

  stars.forEach(function(s){

    const a=.15+.55*((Math.sin(t*s.sp+s.b*6)+1)/2);

    X.fillStyle='rgba(255,255,255,'+a+')';

    X.beginPath();X.arc(s.x*W,s.y*H,s.s,0,Math.PI*2);X.fill();

  });

}

function drawParticles(){

  for(let i=flowParticles.length-1;i>=0;i--){

    const p=flowParticles[i];

    const fromNode=NODES.find(n=>n.id===p.fromId),toNode=NODES.find(n=>n.id===p.toId);

    if(!fromNode||!toNode){flowParticles.splice(i,1);continue;}

    p.progress+=p.speed*16.666*SPEED_MULT;

    if(p.progress>=1){flowParticles.splice(i,1);continue;}

    const a=nodePos(fromNode),b=nodePos(toNode);

    const x=a.x+(b.x-a.x)*p.progress;

    const y=a.y+(b.y-a.y)*p.progress;

    p.trail.push({x,y});

    if(p.trail.length>18)p.trail.shift();

    for(let j=0;j<p.trail.length;j++){

      const tp=p.trail[j];

      X.globalAlpha=(j+1)/p.trail.length*.25;

      X.fillStyle=p.color;

      X.beginPath();X.arc(tp.x,tp.y,p.r*(j+1)/p.trail.length*.9,0,Math.PI*2);X.fill();

    }

    X.globalAlpha=1;

    X.shadowColor=p.color;X.shadowBlur=18;

    X.fillStyle=p.color;

    X.beginPath();X.arc(x,y,p.r,0,Math.PI*2);X.fill();

    X.shadowBlur=0;

  }

}

function draw(){

  t+=0.016*SPEED_MULT;

  physics();

  drawBg();

  for(const e of EDGES){

    const a=NODES.find(n=>n.id===e.from),b=NODES.find(n=>n.id===e.to);

    if(!a||!b)continue;

    const p1=nodePos(a),p2=nodePos(b);

    const isHov=hovered&&(hovered.id===a.id||hovered.id===b.id);

    const isConnected=hovered&&EDGES.some(ed=>(ed.from===hovered.id||ed.to===hovered.id)&&(ed.from===a.id||ed.to===a.id||ed.from===b.id||ed.to===b.id));

    const hasFlow=flowParticles.some(fp=>fp.fromId===e.from&&fp.toId===e.to);

    X.save();


    if(isHov){

      X.shadowColor=a.color;X.shadowBlur=8;

      X.strokeStyle='rgba(255,255,255,.5)';

      X.lineWidth=2;

    }else if(hasFlow){

      X.strokeStyle='rgba(255,255,255,.25)';

      X.lineWidth=1.5;

    }else if(hovered&&!isConnected){

      X.strokeStyle='rgba(255,255,255,.03)';

      X.lineWidth=.5;

    }else{

      X.strokeStyle='rgba(255,255,255,.1)';

      X.lineWidth=.8;

    }

    if(e.dash){X.setLineDash([5,8]);}else{X.setLineDash([]);}

    X.beginPath();X.moveTo(p1.x,p1.y);X.lineTo(p2.x,p2.y);X.stroke();

    X.restore();

    const speed=(t*(.3+a.x*.2))%1;

    const epx=p1.x+(p2.x-p1.x)*speed;

    const epy=p1.y+(p2.y-p1.y)*speed;


    X.fillStyle=isHov?'rgba(255,255,255,.6)':'rgba(255,255,255,.12)';


    X.beginPath();X.arc(epx,epy,isHov?2.5:1.5,0,6.28);X.fill();

  }

  drawParticles();

  const nowTs=Date.now();

  for(const n of NODES){

    const p=nodePos(n);

    const isHov=hovered&&hovered.id===n.id;

    const isConn=hovered&&EDGES.some(e=>(e.from===hovered.id&&e.to===n.id)||(e.to===hovered.id&&e.from===n.id));

    const dimmed=hovered&&!isHov&&!isConn;

    const pulse=1+.06*Math.sin(t*2.5+n.x*8+n.y*5);

    const np=nodePulse[n.id];

    const isPulsing=np&&nowTs<np.until;

    const pulseExtra=isPulsing?1+.25*Math.sin((nowTs-np.until+800)/800*Math.PI):0;

    const R=n.r*pulse*(isPulsing?1+pulseExtra*.15:1);

    const glowColor=isPulsing?np.color:n.glow;

    const g=X.createRadialGradient(p.x,p.y,R*.2,p.x,p.y,R*2.5);

    g.addColorStop(0,isPulsing?(np.color+'88'):glowColor);g.addColorStop(1,'transparent');


    X.globalAlpha=dimmed?.2:1;

    X.fillStyle=g;X.beginPath();X.arc(p.x,p.y,R*(isHov?3:2.5),0,6.28);X.fill();


    if(isHov||isPulsing){


      X.strokeStyle=isPulsing?np.color:n.color;


      X.lineWidth=isPulsing?2:1.5;


      X.globalAlpha=isPulsing?.5:.3;


      X.beginPath();X.arc(p.x,p.y,R*1.6,0,6.28);X.stroke();

      X.globalAlpha=1;

    }

    let cg;
    if(n.gradient&&Array.isArray(n.gradient)){
      cg=X.createLinearGradient(p.x-R,p.y+R,p.x+R,p.y-R);
      n.gradient.forEach(function(s){cg.addColorStop(s[0],s[1]);});
    }else{
      cg=X.createRadialGradient(p.x-R*.2,p.y-R*.25,R*.1,p.x,p.y,R);
      cg.addColorStop(0,'rgba(255,255,255,.25)');cg.addColorStop(.4,n.color);cg.addColorStop(1,n.color+'99');
    }

    X.fillStyle=cg;


    X.globalAlpha=dimmed?.25:(isHov?1:.8);

    X.beginPath();X.arc(p.x,p.y,R,0,6.28);X.fill();

    X.globalAlpha=1;


    X.strokeStyle=dimmed?'rgba(255,255,255,.04)':(isHov?'rgba(255,255,255,.6)':isPulsing?'rgba(255,255,255,.35)':'rgba(255,255,255,.1)');


    X.lineWidth=isHov?2:isPulsing?1.5:1;

    X.beginPath();X.arc(p.x,p.y,R+1,0,6.28);X.stroke();

    const fontSize=n.kind==='orchestrator'?15:n.kind==='agent'?14:12;

    X.font=(n.kind==='orchestrator'||n.kind==='agent'?'600 ':'400 ')+fontSize+'px Outfit,system-ui,sans-serif';

    X.fillStyle=dimmed?'rgba(255,255,255,.15)':'rgba(255,255,255,.85)';

    X.textAlign='center';X.textBaseline='middle';

    X.fillText(n.label,p.x,p.y+R+18);

  }

  requestAnimationFrame(draw);

}

C.addEventListener('mousedown',e=>{

  const hit=hitTest(e.clientX,e.clientY);

  if(hit){

    dragging=hit;

    hit.vx=0;hit.vy=0;

    const p=nodePos(hit);

    dragOff.x=e.clientX-p.x;

    dragOff.y=e.clientY-p.y;

    prevMx=e.clientX;prevMy=e.clientY;

    dragVx=0;dragVy=0;

    TT.style.display='none';

  }

});

C.addEventListener('mousemove',e=>{

  mx=e.clientX;my=e.clientY;

  if(dragging){

    dragging.x=(mx-dragOff.x)/W;

    dragging.y=(my-dragOff.y)/H;

    dragging.vx=0.7*dragVx+0.3*(mx-prevMx)/W;

    dragging.vy=0.7*dragVy+0.3*(my-prevMy)/H;

    prevMx=mx;prevMy=my;

    C.style.cursor='grabbing';

    TT.style.display='none';

    return;

  }

  hovered=hitTest(mx,my);

  if(hovered){

    C.style.cursor='grab';

    const n=hovered;

    const colors={orchestrator:'#a78bfa',agent:'#fb923c',tool:'#34d399',external:'#60a5fa',database:'#f472b6'};

    const labels={orchestrator:'ORQUESTADOR',agent:'AGENTE',tool:'HERRAMIENTA',external:'SERVICIO EXTERNO',database:'BASE DE DATOS'};

    TT.innerHTML='<h3>'+n.desc+'</h3>'

      +'<span class="tag" style="background:'+colors[n.kind]+'18;color:'+colors[n.kind]+';border:1px solid '+colors[n.kind]+'44">'+labels[n.kind]+'</span>'

      +'<div class="detail">'+n.detail.replace(/\\n/g,'<br>')+'</div>';

    TT.style.display='block';

    let tx=mx+18,ty=my+18;

    if(tx+370>W)tx=mx-380;

    if(ty+220>H)ty=my-230;

    TT.style.left=tx+'px';TT.style.top=ty+'px';

  }else{

    C.style.cursor='default';

    TT.style.display='none';

  }

});

window.addEventListener('mouseup',()=>{

  if(dragging){

    dragging.vx=dragVx*.35;

    dragging.vy=dragVy*.35;

  }

  dragging=null;

});

C.addEventListener('mouseleave',()=>{

  hovered=null;

  if(dragging){dragging.vx=dragVx*.25;dragging.vy=dragVy*.25;}

  dragging=null;

  TT.style.display='none';

});

const _injected=${injectedData};

if(_injected&&_injected.nodes){

  NODES=_injected.nodes;

  EDGES=_injected.edges||[];


  NODES.forEach(function(n){n.vx=0;n.vy=0;n.hx=n.hx??n.x;n.hy=n.hy??n.y;});

  if(LOADER)LOADER.style.display='none';

}else if(LOADER){

  LOADER.textContent='Animación no disponible';

}

poll();

setInterval(poll,10000);

requestAnimationFrame(draw);

</script>

</body>

</html>`;

}



function renderKapsoDebugHtml() {

  return `<!doctype html>

<html lang="es">

<head>

  <meta charset="utf-8">

  <meta name="viewport" content="width=device-width, initial-scale=1">

  <title>Kapso Debug</title>

  <style>

    *{box-sizing:border-box;margin:0;padding:0}

    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f172a;color:#e2e8f0;font-size:13px;height:100vh;display:flex;flex-direction:column;overflow:hidden}

    /* Header */

    .hdr{background:#1e293b;border-bottom:1px solid #334155;padding:10px 18px;display:flex;align-items:center;gap:12px;flex-shrink:0;z-index:10}

    .hdr h1{font-size:15px;font-weight:700;color:#f1f5f9;letter-spacing:-0.3px}

    .hdr .pill{background:#1d4ed8;color:#bfdbfe;padding:2px 7px;border-radius:20px;font-size:10px;font-weight:600}

    .hdr-r{margin-left:auto;display:flex;align-items:center;gap:8px}

    .btn{background:#2563eb;color:#fff;border:none;padding:5px 13px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:500;transition:background .15s}

    .btn:hover{background:#1d4ed8}

    .btn-g{background:transparent;border:1px solid #475569;color:#94a3b8}

    .btn-g:hover{background:#1e293b;color:#e2e8f0}

    .muted{color:#64748b;font-size:11px}

    /* Layout */

    .layout{display:flex;flex:1;overflow:hidden}

    .sidebar{width:260px;min-width:260px;background:#1e293b;border-right:1px solid #334155;overflow-y:auto;padding:14px;flex-shrink:0}

    .main{flex:1;overflow-y:auto;padding:16px}

    /* Sidebar */

    .sb-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#64748b;margin-bottom:8px;margin-top:16px}

    .sb-title:first-child{margin-top:0}

    .cfg-row{margin-bottom:5px}

    .cfg-k{color:#64748b;font-size:10px}

    .cfg-v{color:#e2e8f0;font-size:11px;word-break:break-all}

    /* Stats */

    .stats{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:14px}

    .stat{background:#0f172a;border-radius:8px;padding:10px 12px}

    .stat-n{font-size:18px;font-weight:700;color:#f1f5f9}

    .stat-l{font-size:10px;color:#64748b;margin-top:2px}

    .s-ok .stat-n{color:#34d399}.s-err .stat-n{color:#f87171}.s-avg .stat-n{color:#60a5fa}

    /* Table area */

    .tbar{display:flex;align-items:center;gap:10px;margin-bottom:12px}

    .tbar h2{font-size:14px;font-weight:600;color:#f1f5f9}

    .fi{margin-left:auto;background:#1e293b;border:1px solid #334155;color:#e2e8f0;padding:5px 10px;border-radius:6px;font-size:12px;width:170px}

    .fi:focus{outline:none;border-color:#3b82f6}

    .fi::placeholder{color:#475569}

    table{width:100%;border-collapse:collapse}

    thead th{text-align:left;padding:7px 10px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#64748b;background:#1e293b;border-bottom:1px solid #334155;white-space:nowrap}

    tbody tr{border-bottom:1px solid #172033;cursor:pointer;transition:background .1s}

    tbody tr:hover{background:#1a2540}

    tbody tr.sel{background:#1e3a5f}

    td{padding:8px 10px;vertical-align:middle}

    .nd{text-align:center;padding:52px;color:#475569;font-size:13px}

    /* Badges */

    .bok{color:#34d399;display:inline-flex;align-items:center;gap:4px;font-size:11px}

    .berr{color:#f87171;display:inline-flex;align-items:center;gap:4px;font-size:11px}

    .bprc{color:#fbbf24;display:inline-flex;align-items:center;gap:4px;font-size:11px}

    .dot{width:6px;height:6px;border-radius:50%;background:currentColor;display:inline-block}

    .bm{background:#1e3a5f;color:#60a5fa;padding:2px 5px;border-radius:4px;font-size:10px;white-space:nowrap;max-width:90px;overflow:hidden;text-overflow:ellipsis;display:inline-block;vertical-align:middle}

    .bt{background:#2d1b69;color:#a78bfa;padding:2px 6px;border-radius:4px;font-size:10px}

    .tp{font-family:monospace;font-size:11px;font-weight:700}

    .tf{color:#34d399}.tm{color:#fbbf24}.ts{color:#f87171}

    @keyframes sp{to{transform:rotate(360deg)}}

    .sp{width:12px;height:12px;border:2px solid #334155;border-top-color:#fbbf24;border-radius:50%;animation:sp .7s linear infinite;display:inline-block}

    /* Modal */

    .ov{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:200;display:none;align-items:flex-start;justify-content:center;padding:20px;overflow-y:auto}

    .ov.open{display:flex}

    .modal{background:#1e293b;border-radius:12px;border:1px solid #334155;width:100%;max-width:840px;margin:auto;max-height:90vh;display:flex;flex-direction:column}

    .mhdr{padding:14px 18px;border-bottom:1px solid #334155;display:flex;align-items:center;gap:10px;flex-shrink:0}

    .mttl{font-size:14px;font-weight:700;color:#f1f5f9}

    .mttl span{color:#64748b;font-size:12px;font-weight:400;margin-left:6px}

    .mcls{margin-left:auto;background:none;border:none;color:#64748b;cursor:pointer;font-size:20px;line-height:1;padding:2px 6px}

    .mcls:hover{color:#e2e8f0}

    /* Tabs */

    .tabs{display:flex;border-bottom:1px solid #334155;padding:0 18px;flex-shrink:0}

    .tab{padding:9px 14px;font-size:12px;font-weight:500;color:#64748b;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;transition:color .1s}

    .tab:hover{color:#e2e8f0}

    .tab.a{color:#60a5fa;border-bottom-color:#3b82f6}

    .tc{display:none;padding:18px;overflow-y:auto;flex:1}

    .tc.a{display:block}

    /* Detail cards */

    .dg{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}

    .dc{background:#0f172a;border-radius:8px;padding:13px}

    .dct{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#64748b;margin-bottom:8px}

    .dr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:5px;gap:8px}

    .dk{color:#64748b;font-size:11px;white-space:nowrap;flex-shrink:0}

    .dv{color:#e2e8f0;font-size:11px;text-align:right;word-break:break-all}

    .msgbox{background:#0f172a;border-radius:8px;padding:13px;margin-bottom:12px}

    .msgl{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.1em;font-weight:700;margin-bottom:7px}

    .msgt{color:#f1f5f9;font-size:13px;line-height:1.6;white-space:pre-wrap;word-break:break-word}

    .resp{background:#0a1628;border-radius:8px;padding:13px;margin-top:12px;border-left:3px solid #3b82f6}

    /* Timing */

    .tbr{margin-bottom:10px}

    .tbh{display:flex;justify-content:space-between;margin-bottom:4px}

    .tbl{font-size:11px;color:#94a3b8}

    .tbv{font-family:monospace;font-size:11px;color:#f1f5f9;font-weight:600}

    .tbt{height:7px;background:#1e293b;border-radius:100px;overflow:hidden}

    .tbf{height:100%;border-radius:100px;transition:width .4s}

    .c1{background:#3b82f6}.c2{background:#8b5cf6}.c3{background:#06b6d4}.c4{background:#f59e0b}

    /* Tools */

    .tl{background:#0f172a;border-radius:8px;padding:13px;margin-bottom:10px;border-left:3px solid #7c3aed}

    .tln{font-size:12px;font-weight:700;color:#a78bfa;margin-bottom:10px}

    .tllbl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#64748b;margin-bottom:4px}

    pre.cd{background:#0a1628;border-radius:6px;padding:10px;font-size:11px;color:#94a3b8;overflow-x:auto;white-space:pre-wrap;word-break:break-word;margin-bottom:8px;max-height:180px;overflow-y:auto}

    ::-webkit-scrollbar{width:5px;height:5px}

    ::-webkit-scrollbar-thumb{background:#334155;border-radius:5px}

  </style>

</head>

<body>

  <div class="hdr">

    <h1>Kapso Debug</h1>

    <span class="pill">LIVE</span>

    <div class="hdr-r">

      <span class="muted" id="upd">cargando...</span>

      <button class="btn btn-g" id="ar-btn">⏸ Pausar</button>

      <button class="btn" id="refresh-btn">↻ Refrescar</button>

      <button class="btn" id="visual-btn" style="background:#6366f1;color:#fff;">Ver visual</button>

    </div>

  </div>

  <div class="layout">

    <div class="sidebar">

      <div class="stats" id="stats">

        <div class="stat"><div class="stat-n" id="st">0</div><div class="stat-l">Total</div></div>

        <div class="stat s-ok"><div class="stat-n" id="sk">0</div><div class="stat-l">OK</div></div>

        <div class="stat s-err"><div class="stat-n" id="se">0</div><div class="stat-l">Errores</div></div>

        <div class="stat s-avg"><div class="stat-n" id="sa">—</div><div class="stat-l">Tiempo avg</div></div>

      </div>

      <div class="sb-title">Bridge Config</div>

      <div id="bcfg"></div>

      <div class="sb-title">FastAPI Config</div>

      <div id="fcfg"></div>

    </div>

    <div class="main">

      <div class="tbar">

        <h2>Interacciones</h2>
        <select class="fi" id="empresa-fi" style="width:auto;min-width:140px;margin-left:8px">
          <option value="">Todas las empresas</option>
        </select>

        <input class="fi" id="fi" placeholder="Filtrar por teléfono o nombre...">

      </div>

      <table>

        <thead><tr>

          <th>Hora</th><th>Contacto</th><th>Tipo</th><th>Mensaje</th>

          <th>Agente</th><th>Modelo</th><th>Tiempo</th><th>Tools</th><th>Rx</th><th>Status</th>

        </tr></thead>

        <tbody id="tbody"></tbody>

      </table>

    </div>

  </div>

  <!-- Detail modal -->

  <div class="ov" id="ov">

    <div class="modal">

      <div class="mhdr">

        <div>

          <div class="mttl" id="mttl">Interacción <span id="msub"></span></div>

        </div>

        <button class="mcls" id="close-btn">&#x2715;</button>

      </div>

      <div class="tabs">

        <div class="tab a" data-t="ov">Overview</div>

        <div class="tab" data-t="tm">Timing</div>

        <div class="tab" data-t="tl">Herramientas</div>

        <div class="tab" data-t="rp">Respuesta</div>

      </div>

      <div class="tc a" id="tc-ov"></div>

      <div class="tc" id="tc-tm"></div>

      <div class="tc" id="tc-tl"></div>

      <div class="tc" id="tc-rp"></div>

    </div>

  </div>

  <script src="${appendDebugToken('/debug/kapso/app.js', debugToken)}"></script>

</body>

</html>`;

}



function renderKapsoDebugScript(debugToken = '') {

  return `let D={},sel=null,ar=true,arT=null,fq='',empresaFq='';

const DEBUG_TOKEN=new URLSearchParams(window.location.search).get('token')||${JSON.stringify(debugToken || '')};

function debugPath(path){
  if(!DEBUG_TOKEN)return path;
  const u=new URL(path,window.location.origin);
  u.searchParams.set('token',DEBUG_TOKEN);
  return u.pathname+u.search;
}

function fetchDebug(path,init){
  return fetch(debugPath(path),init);
}

// Load empresas list for filter
(function loadEmpresas(){
  fetchDebug('/debug/kapso/empresas').then(r=>r.json()).then(data=>{
    const s=document.getElementById('empresa-fi');
    if(!s||!data.empresas)return;
    data.empresas.forEach(e=>{
      const o=document.createElement('option');
      o.value=String(e.id);
      o.textContent=e.nombre;
      s.appendChild(o);
    });
  }).catch(()=>{});
})();



const esc=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

const trunc=(s,n=45)=>!s?'<span class="muted">—</span>':s.length>n?esc(s.slice(0,n))+'&hellip;':esc(s);

function rel(t){if(!t)return'—';const d=Date.now()-new Date(t);if(d<60e3)return Math.round(d/1e3)+'s';if(d<3600e3)return Math.round(d/60e3)+'m ago';return new Date(t).toLocaleTimeString();}

function fms(ms){if(!ms&&ms!==0)return'—';if(ms<1e3)return Math.round(ms)+'ms';return(ms/1e3).toFixed(1)+'s';}

function tcls(ms){if(!ms)return'';if(ms<1500)return'tf';if(ms<4e3)return'tm';return'ts';}

function sBadge(s){if(s==='ok')return'<span class="bok"><span class="dot"></span>OK</span>';if(s==='error')return'<span class="berr"><span class="dot"></span>Error</span>';return'<span class="bprc"><span class="sp"></span></span>';}

function mshort(m){if(!m)return'—';const p=m.split('/');return p[p.length-1];}



function filt(items){
  let r=items;
  if(empresaFq) r=r.filter(i=>i.empresa_id!=null&&String(i.empresa_id)===empresaFq);
  if(fq) r=r.filter(i=>(i.from_phone||'').includes(fq)||(i.contact_name||'').toLowerCase().includes(fq.toLowerCase()));
  return r;
}



function renderCfg(id,obj){document.getElementById(id).innerHTML=Object.entries(obj||{}).map(([k,v])=>'<div class="cfg-row"><div class="cfg-k">'+esc(k)+'</div><div class="cfg-v">'+esc(v??'—')+'</div></div>').join('');}



function renderStats(items){

  const ok=items.filter(i=>i.status==='ok').length;

  const err=items.filter(i=>i.status==='error').length;

  const dms=items.filter(i=>i.duration_ms).map(i=>i.duration_ms);

  const avg=dms.length?dms.reduce((a,b)=>a+b,0)/dms.length:null;

  document.getElementById('st').textContent=items.length;

  document.getElementById('sk').textContent=ok;

  document.getElementById('se').textContent=err;

  document.getElementById('sa').textContent=fms(avg);

}



function renderTable(items){

  const rows=filt(items);

  const tbody=document.getElementById('tbody');

  if(!rows.length){tbody.innerHTML='<tr><td colspan="10" class="nd">'+(items.length?'Sin resultados para ese filtro.':'Sin interacciones aún. Envía un mensaje WhatsApp para ver actividad.')+'</td></tr>';return;}

  tbody.innerHTML=rows.map((it,i)=>

    '<tr class="'+(sel&&sel.id===it.id?'sel':'')+'" data-row-idx="'+i+'">'+

      '<td class="muted">'+rel(it.started_at)+'</td>'+

      '<td><div style="font-weight:600;color:#f1f5f9">'+esc(it.contact_name||'—')+'</div><div class="muted">'+(it.contacto_id!=null?'ID '+it.contacto_id+' · ':'')+esc(it.from_phone||'')+'</div></td>'+

      '<td class="muted">'+esc(it.message_type||'text')+'</td>'+

      '<td style="max-width:180px">'+trunc(it.message_text)+'</td>'+

      '<td><div style="color:#e2e8f0">'+esc(it.agent_name||'—')+'</div><div class="muted">#'+(it.agent_id||'?')+'</div></td>'+

      '<td><span class="bm" title="'+esc(it.model_used||'')+'">'+esc(mshort(it.model_used))+'</span></td>'+

      '<td><span class="tp '+tcls(it.duration_ms)+'">'+fms(it.duration_ms)+'</span></td>'+

      '<td>'+((it.tools_used||[]).length?'<span class="bt">'+((it.tools_used||[]).length)+' tool'+((it.tools_used||[]).length>1?'s':'')+'</span>':'<span class="muted">—</span>')+'</td>'+

      '<td style="font-size:14px">'+(it.reaction_emoji||'<span class="muted">—</span>')+'</td>'+

      '<td>'+sBadge(it.status)+'</td>'+

    '</tr>'

  ).join('');

  document.querySelectorAll('#tbody tr[data-row-idx]').forEach(row=>{

    row.addEventListener('click',()=>openM(Number(row.dataset.rowIdx)));

  });

}



function openM(idx){

  const rows=filt(D.interactions||[]);

  const it=rows[idx];if(!it)return;

  sel=it;

  const tm=it.timing||{};

  const tools=it.tools_used||[];

  const maxMs=tm.total_ms||1;

  document.getElementById('mttl').innerHTML='Interacción <span id="msub">'+esc(it.contact_name||it.from_phone||'')+'</span>';

  document.getElementById('tc-ov').innerHTML=

    '<div class="msgbox"><div class="msgl">Mensaje recibido</div><div class="msgt">'+(esc(it.message_text)||'<em style="color:#64748b">Sin texto</em>')+'</div></div>'+

    '<div class="dg">'+

      '<div class="dc"><div class="dct">Contacto</div>'+

        '<div class="dr"><span class="dk">Nombre</span><span class="dv">'+esc(it.contact_name||'—')+'</span></div>'+

        '<div class="dr"><span class="dk">Contacto ID</span><span class="dv">'+(it.contacto_id!=null?String(it.contacto_id):'—')+'</span></div>'+

        '<div class="dr"><span class="dk">Teléfono</span><span class="dv">'+esc(it.from_phone||'—')+'</span></div>'+

        '<div class="dr"><span class="dk">Tipo msg</span><span class="dv">'+esc(it.message_type||'—')+'</span></div>'+

        '<div class="dr"><span class="dk">Message ID</span><span class="dv" style="font-size:9px;font-family:monospace">'+esc(it.message_id||'—')+'</span></div>'+

      '</div>'+

      '<div class="dc"><div class="dct">Agente</div>'+

        '<div class="dr"><span class="dk">Nombre</span><span class="dv">'+esc(it.agent_name||'—')+'</span></div>'+

        '<div class="dr"><span class="dk">ID</span><span class="dv">#'+(it.agent_id||'—')+'</span></div>'+

        '<div class="dr"><span class="dk">Modelo</span><span class="dv">'+esc(it.model_used||'—')+'</span></div>'+


        '<div class="dr"><span class="dk">Memory session</span><span class="dv" style="font-size:9px">'+esc(it.memory_session_id||'—')+'</span></div>'+

      '</div>'+

    '</div>'+

    '<div class="dg">'+

      '<div class="dc"><div class="dct">Resultado</div>'+

        '<div class="dr"><span class="dk">Status</span><span class="dv">'+sBadge(it.status)+'</span></div>'+

        '<div class="dr"><span class="dk">Duración</span><span class="dv tp '+tcls(it.duration_ms)+'">'+fms(it.duration_ms)+'</span></div>'+

        '<div class="dr"><span class="dk">Tipo respuesta</span><span class="dv">'+esc(it.reply_type||'text')+'</span></div>'+

        '<div class="dr"><span class="dk">Chars respuesta</span><span class="dv">'+(it.response_chars??'—')+'</span></div>'+

        '<div class="dr"><span class="dk">Reacción emoji</span><span class="dv" style="font-size:16px">'+(it.reaction_emoji||'—')+'</span></div>'+

        (it.error?'<div class="dr"><span class="dk">Error</span><span class="dv" style="color:#f87171">'+esc(it.error)+'</span></div>':'')+

      '</div>'+

      '<div class="dc"><div class="dct">Timestamps</div>'+

        '<div class="dr"><span class="dk">Inicio</span><span class="dv">'+(it.started_at?new Date(it.started_at).toLocaleTimeString():'—')+'</span></div>'+

        '<div class="dr"><span class="dk">Fin</span><span class="dv">'+(it.finished_at?new Date(it.finished_at).toLocaleTimeString():'—')+'</span></div>'+

        '<div class="dr"><span class="dk">Fecha</span><span class="dv">'+(it.started_at?new Date(it.started_at).toLocaleDateString():'—')+'</span></div>'+

        '<div class="dr"><span class="dk">Tools usadas</span><span class="dv">'+tools.length+'</span></div>'+

      '</div>'+

    '</div>';

  const bars=[

    {l:'Total',k:'total_ms',c:'c1'},{l:'LLM',k:'llm_ms',c:'c2'},

    {l:'MCP Discovery',k:'mcp_discovery_ms',c:'c3'},{l:'Graph Build',k:'graph_build_ms',c:'c4'},

  ];

  document.getElementById('tc-tm').innerHTML=

    '<div style="background:#0f172a;border-radius:8px;padding:16px">'+

    bars.map(b=>{const v=tm[b.k]||0;const p=maxMs>0?Math.min(100,(v/maxMs)*100):0;return(

      '<div class="tbr"><div class="tbh"><span class="tbl">'+b.l+'</span><span class="tbv">'+fms(v)+'</span></div>'+

      '<div class="tbt"><div class="tbf '+b.c+'" style="width:'+p.toFixed(1)+'%"></div></div></div>'

    );}).join('')+

    '</div>';

  document.getElementById('tc-tl').innerHTML=tools.length

    ?tools.map(t=>(

      '<div class="tl"><div class="tln">'+esc(t.tool_name)+'</div>'+

      '<div class="tllbl">Input</div><pre class="cd">'+esc(JSON.stringify(t.tool_input,null,2))+'</pre>'+

      '<div class="tllbl">Output</div><pre class="cd">'+esc(t.tool_output||'—')+'</pre></div>'

    )).join('')

    :'<div class="nd">No se usaron herramientas externas en esta interacción.</div>';

  document.getElementById('tc-rp').innerHTML=it.response_preview

    ?('<div class="resp"><div class="msgl">Respuesta enviada <span class="muted">('+

      (it.response_chars||0)+' chars)</span></div><div class="msgt">'+esc(it.response_preview)+

      ((it.response_chars||0)>600?'\n\n<em style="color:#64748b">[...respuesta truncada a 600 chars]</em>':'')+

      '</div></div>')

    :'<div class="nd">Sin preview de respuesta disponible.</div>';

  document.getElementById('ov').classList.add('open');

  swTab('ov');

}



function closeM(){document.getElementById('ov').classList.remove('open');sel=null;}

function swTab(n){document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('a',t.dataset.t===n));document.querySelectorAll('.tc').forEach(t=>t.classList.toggle('a',t.id==='tc-'+n));}

function onFilter(){fq=document.getElementById('fi').value.trim();renderTable(D.interactions||[]);}



async function loadAll(){

  try{

    const r=await fetch('/debug/kapso/data',{cache:'no-store'});

    D=await r.json();

    D.interactions = Array.isArray(D.interactions) ? D.interactions : [];



    renderCfg('bcfg',D.bridge_config);

    renderCfg('fcfg',D.fastapi_config);

    renderStats(D.interactions);

    renderTable(D.interactions);

    document.getElementById('upd').textContent='actualizado '+new Date().toLocaleTimeString();

  }catch(e){document.getElementById('upd').textContent='error al cargar';}

}



function toggleAR(){

  ar=!ar;

  document.getElementById('ar-btn').textContent=ar?'⏸ Pausar':'▶ Reanudar';

  if(ar){arT=setInterval(loadAll,4000);}else{clearInterval(arT);}

}



function bindEvents(){

  const refreshBtn=document.getElementById('refresh-btn');

  const arBtn=document.getElementById('ar-btn');

  const fi=document.getElementById('fi');

  const ov=document.getElementById('ov');

  const closeBtn=document.getElementById('close-btn');

  if(refreshBtn) refreshBtn.addEventListener('click',loadAll);

  if(arBtn) arBtn.addEventListener('click',toggleAR);

  if(fi) fi.addEventListener('input',onFilter);
  var empresaFi=document.getElementById('empresa-fi');
  if(empresaFi) empresaFi.addEventListener('change',function(){empresaFq=this.value;renderTable(D.interactions||[]);renderStats(filt(D.interactions||[]));});

  if(closeBtn) closeBtn.addEventListener('click',closeM);

  if(ov) ov.addEventListener('click',event=>{if(event.target===ov) closeM();});

  const visualBtn=document.getElementById('visual-btn');

  if(visualBtn) visualBtn.addEventListener('click',()=>{ window.location.href=debugPath('/debug/kapso/visual'); });

  document.querySelectorAll('.tab').forEach(tab=>{

    tab.addEventListener('click',()=>swTab(tab.dataset.t));

  });

}



bindEvents();

loadAll();

arT=setInterval(loadAll,4000);`;

}



function normalizeTimestamp(raw) {

  if (typeof raw === 'number') return String(raw);

  if (typeof raw === 'string' && /^\d+$/.test(raw)) return raw;

  const parsed = raw ? new Date(raw).getTime() : Date.now();

  return String(Math.floor(parsed / 1000));

}



function extractDataArray(body) {

  if (Array.isArray(body)) {

    if (body.length === 0) return [];

    const first = body[0];

    if (first?.body && typeof first.body === 'object' && 'data' in first.body) {

      return body.flatMap(item => Array.isArray(item?.body?.data) ? item.body.data : []);

    }

    if ('message' in first && 'conversation' in first) {

      return body;

    }

    if ('data' in first && Array.isArray(first.data)) {

      return body.flatMap(item => Array.isArray(item?.data) ? item.data : []);

    }

    return [];

  }



  if (body && typeof body === 'object') {

    if ('data' in body && Array.isArray(body.data)) {

      return body.data;

    }

    if (body.body && typeof body.body === 'object' && Array.isArray(body.body?.data)) {

      return body.body.data;

    }

    if ('message' in body && 'conversation' in body) {

      return [body];

    }

  }



  return [];

}



function accumulateMessage(record, groupedPayloads) {

  const message = record?.message;

  const conversation = record?.conversation;

  if (!message || !conversation) return;



  const msgType = message.type || 'text';

  const hasMediaByKapso = message.kapso?.has_media === true;

  const hasMediaByType = MEDIA_TYPES.includes(msgType) && !!message[msgType];

  const hasMedia = hasMediaByKapso || hasMediaByType;

  const mediaCaption = MEDIA_TYPES.includes(msgType) ? message[msgType]?.caption : undefined;

  const textPart = message.text?.body ?? mediaCaption ?? message.kapso?.content ?? '';

  const from = String(message.from);

  const timestamp = normalizeTimestamp(message.timestamp);



  if (!groupedPayloads.has(from)) {

    groupedPayloads.set(from, {

      from,

      contact_name: conversation.contact_name ?? null,

      phone_number_id: record.phone_number_id ?? conversation.phone_number_id,

      kapso_conversation_id: conversation.id,

      message_id: message.id,

      message_type: msgType,

      text: textPart || null,

      timestamp,

      has_media: hasMedia,

      media_raw: hasMedia ? message : null,

    });

    return;

  }



  const existing = groupedPayloads.get(from);

  if (textPart) {

    existing.text = existing.text ? `${existing.text}\n${textPart}` : textPart;

  }

  existing.timestamp = String(Math.max(Number(existing.timestamp), Number(timestamp)));

  if (hasMedia) {

    existing.has_media = true;

    existing.media_raw = message;

    if (msgType && msgType !== 'text') {

      existing.message_type = msgType;

    }

  }

}



function cleanupProcessedMessages(now) {

  for (const [messageId, state] of processedMessageIds.entries()) {

    const ttlMs = state.status === 'processing' ? PROCESSING_MESSAGE_TTL_MS : PROCESSED_MESSAGE_TTL_MS;

    if (now - state.updatedAt > ttlMs) {

      processedMessageIds.delete(messageId);

    }

  }

}



async function withTimeout(promise, timeoutMs) {

  let timeoutHandle;

  const timeoutPromise = new Promise((_, reject) => {

    timeoutHandle = setTimeout(() => reject(new Error(`Timeout tras ${timeoutMs}ms`)), timeoutMs);

  });

  try {

    return await Promise.race([promise, timeoutPromise]);

  } finally {

    clearTimeout(timeoutHandle);

  }

}



function isRateLimitError(err) {

  return err?.code === 131056 || err?.category === 'throttling';

}



function isInFlightError(err) {

  return err?.httpStatus === 409 || (typeof err?.raw?.error === 'string' && err.raw.error.includes('in-flight'));

}



function isServerError(err) {

  return err?.httpStatus >= 500 || err?.code === 500 || err?.category === 'server';

}



async function withKapsoRetry(fn, label) {

  for (let attempt = 1; attempt <= MAX_SEND_RETRIES; attempt += 1) {

    try {

      return await fn();

    } catch (error) {

      const isLast = attempt === MAX_SEND_RETRIES;

      if (isRateLimitError(error)) {

        if (isLast) throw error;

        await sleep(RATE_LIMIT_BASE_DELAY_MS * attempt);

        continue;

      }

      if (isInFlightError(error)) {

        if (isLast) throw error;

        await sleep(IN_FLIGHT_DELAY_MS);

        continue;

      }

      if (isServerError(error)) {

        if (isLast) throw error;

        await sleep(RATE_LIMIT_BASE_DELAY_MS * attempt);

        continue;

      }

      throw error;

    }

  }

  throw new Error(`No se pudo completar ${label}`);

}



function normalizeWhatsAppText(input) {

  if (!input) return '';

  return String(input)

    .replace(/\r\n/g, '\n')

    .replace(/\u00A0/g, ' ')

    .replace(/^\s*[•*]\s+/gm, '- ')

    .replace(/\n{3,}/g, '\n\n')

    .replace(/[ \t]{2,}/g, ' ')

    .trim();

}



function ensureReplyText(input) {

  const normalized = normalizeWhatsAppText(input);

  return normalized || DEFAULT_EMPTY_REPLY_TEXT;

}



async function markKapsoAsRead(phoneNumberId, messageId) {

  if (!phoneNumberId || !messageId) return null;



  addBridgeDebugEvent('kapso_presence_start', {

    phone_number_id: phoneNumberId,

    message_id: messageId,

    seen: true,

    typing: true,

  });

  console.log(

    `[KapsoBridge] -> KapsoPresence phone_number_id=${phoneNumberId} message_id=${messageId} seen=true typing=true`,

  );



  try {

    const result = await withKapsoRetry(

      () => client.messages.markRead({

        phoneNumberId,

        messageId,

        typingIndicator: { type: 'text' },

      }),

      `markRead(${messageId})`,

    );

    addBridgeDebugEvent('kapso_presence_done', {

      phone_number_id: phoneNumberId,

      message_id: messageId,

      result: result ?? null,

    });

    return result;

  } catch (error) {

    addBridgeDebugEvent('kapso_presence_error', {

      phone_number_id: phoneNumberId,

      message_id: messageId,

      error: String(error?.message || error),

    });

    console.error('[KapsoBridge] Error enviando seen/typing:', error?.stack || error);

    return null;

  }

}



const TYPING_KEEPALIVE_INTERVAL_MS = 20_000;



/**

 * Start a periodic typing indicator that re-fires every 20s.

 * Returns an abort controller — call .abort() to stop the loop.

 */

function startTypingKeepalive(phoneNumberId, messageId) {

  const ac = new AbortController();

  (async () => {

    while (!ac.signal.aborted) {

      await sleep(TYPING_KEEPALIVE_INTERVAL_MS);

      if (ac.signal.aborted) break;

      try {

        await client.messages.markRead({

          phoneNumberId,

          messageId,

          typingIndicator: { type: 'text' },

        });

      } catch (err) {

        console.warn('[KapsoBridge] typing keepalive error (non-fatal):', err?.message || err);

      }

    }

  })();

  return ac;

}



async function callInternalAgent(sqlPayload) {

  const headers = {

    'Content-Type': 'application/json',

  };

  if (KAPSO_INTERNAL_TOKEN) {

    headers['x-kapso-internal-token'] = KAPSO_INTERNAL_TOKEN;

  }



  addBridgeDebugEvent('call_fastapi_start', {

    phone_number_id: sqlPayload.phone_number_id,

    from: sqlPayload.from,

    message_id: sqlPayload.message_id,

    message_type: sqlPayload.message_type,

  });

  console.log(

    `[KapsoBridge] -> FastAPI phone_number_id=${sqlPayload.phone_number_id} from=${sqlPayload.from} message_id=${sqlPayload.message_id} type=${sqlPayload.message_type}`,

  );



  const response = await fetch(INTERNAL_AGENT_API_URL, {

    method: 'POST',

    headers,

    body: JSON.stringify(sqlPayload),

  });



  if (!response.ok) {

    const body = await response.text();

    throw new Error(`Backend FastAPI respondió ${response.status}: ${body}`);

  }



  const reply = await response.json();

  addBridgeDebugEvent('call_fastapi_done', {

    agent_id: reply.agent_id,

    agent_name: reply.agent_name,

    conversation_id: reply.conversation_id,

    reply_type: reply.reply_type,

    message_id: sqlPayload.message_id,

    model_used: reply.model_used,

    response_chars: String(reply.reply_text || '').length,

    response_preview: String(reply.reply_text || '').slice(0, 600),

    timing: reply.timing || null,

    tools_used: reply.tools_used || [],

    agent_runs: reply.agent_runs || [],

    reaction_emoji: reply.reaction?.emoji || null,

  });

  console.log(

    `[KapsoBridge] <- FastAPI agent_id=${reply.agent_id} conversation_id=${reply.conversation_id} reply_type=${reply.reply_type} chars=${String(reply.reply_text || '').length}`,

  );

  return reply;

}



async function sendKapsoText(recipientPhone, phoneNumberId, text) {

  const body = ensureReplyText(text);



  // Bubble splitting: "---" separates text into multiple WhatsApp messages

  const bubbles = body.split(/\n*---\n*/).map(b => b.trim()).filter(Boolean);

  if (bubbles.length <= 1) {

    return withKapsoRetry(

      () => client.messages.textSender.send({ phoneNumberId, to: recipientPhone, body }),

      `sendText(${recipientPhone})`,

    );

  }



  let lastResult = null;

  for (const bubble of bubbles) {

    const normalizedBubble = ensureReplyText(bubble);

    lastResult = await withKapsoRetry(

      () => client.messages.textSender.send({ phoneNumberId, to: recipientPhone, body: normalizedBubble }),

      `sendText(${recipientPhone})`,

    );

  }

  return lastResult;

}



function shouldSuppressKapsoSend(reply) {

  if (reply?.suppress_send === true) return true;

  return String(reply?.reply_text || '').trimStart().startsWith('❌');

}



async function dispatchKapsoResponse(reply) {

  const recipientPhone = reply.recipient_phone;

  const phoneNumberId = reply.phone_number_id;

  const replyType = reply.reply_type || 'text';



  addBridgeDebugEvent('kapso_send_start', {

    to: recipientPhone,

    phone_number_id: phoneNumberId,

    reply_type: replyType,

    message_id: reply.message_id,

    has_reaction: !!(reply.reaction?.emoji),

  });

  console.log(

    `[KapsoBridge] -> KapsoSend to=${recipientPhone} phone_number_id=${phoneNumberId} reply_type=${replyType} reaction=${reply.reaction?.emoji || 'none'}`,

  );



  if (shouldSuppressKapsoSend(reply)) {

    addBridgeDebugEvent('kapso_send_suppressed', {

      to: recipientPhone,

      phone_number_id: phoneNumberId,

      reply_type: replyType,

      message_id: reply.message_id,

      reply_preview: String(reply.reply_text || '').slice(0, 300),

    });

    console.log(

      `[KapsoBridge] envío suprimido message_id=${reply.message_id} reply_type=${replyType}`,

    );

    return { suppressed: true, reason: 'kapso_send_suppressed' };

  }



  if (replyType === 'buttons' && Array.isArray(reply.buttons) && reply.buttons.length > 0) {

    return withKapsoRetry(

      () => client.messages.interactiveSender.sendButtons({

        phoneNumberId,

        to: recipientPhone,

        bodyText: normalizeWhatsAppText(reply.reply_text || ''),

        buttons: reply.buttons.slice(0, 3).map(button => ({

          id: String(button.id),

          title: String(button.title).slice(0, 20),

        })),

      }),

      `sendButtons(${recipientPhone})`,

    );

  }



  if (replyType === 'list' && reply.list_payload?.sections?.length) {

    return withKapsoRetry(

      () => client.messages.interactiveSender.sendList({

        phoneNumberId,

        to: recipientPhone,

        bodyText: normalizeWhatsAppText(reply.reply_text || ''),

        buttonText: String(reply.list_payload.button_text || 'Ver opciones').slice(0, 20),

        sections: reply.list_payload.sections.map(section => ({

          title: String(section.title).slice(0, 24),

          rows: (section.rows || []).map(row => ({

            id: String(row.id),

            title: String(row.title).slice(0, 24),

            description: row.description ? String(row.description).slice(0, 72) : undefined,

          })),

        })),

      }),

      `sendList(${recipientPhone})`,

    );

  }



  if (replyType === 'reaction' && reply.reaction?.message_id && reply.reaction?.emoji) {

    return withKapsoRetry(

      () => client.messages.sendReaction({

        phoneNumberId,

        to: recipientPhone,

        reaction: {

          messageId: reply.reaction.message_id,

          emoji: reply.reaction.emoji,

        },

      }),

      `sendReaction(${recipientPhone})`,

    );

  }



  if (replyType === 'image' && reply.image_url) {

    return withKapsoRetry(

      () => client.messages.imageSender.send({

        phoneNumberId,

        to: recipientPhone,

        image: {

          link: reply.image_url,

          caption: reply.image_caption ? normalizeWhatsAppText(reply.image_caption) : undefined,

        },

      }),

      `sendImage(${recipientPhone})`,

    );

  }



  if (replyType === 'audio' && reply.audio_url) {

    return withKapsoRetry(

      () => client.messages.audioSender.send({

        phoneNumberId,

        to: recipientPhone,

        audio: {

          link: reply.audio_url,

          voice: true,

        },

      }),

      `sendAudio(${recipientPhone})`,

    );

  }



  if (replyType === 'video' && reply.video_url) {

    try {

      await withKapsoRetry(

        () => client.messages.videoSender.send({

          phoneNumberId,

          to: recipientPhone,

          video: {

            link: reply.video_url,

            caption: reply.video_caption ? normalizeWhatsAppText(reply.video_caption) : undefined,

          },

        }),

        `sendVideo(${recipientPhone})`,

      );

    } catch (videoError) {

      // El video falló, pero no bloqueamos el envío del texto de confirmación
      console.warn('[KapsoBridge] Video falló (no bloquea texto):', videoError?.message || videoError);

    }

    // Siempre enviar también el reply_text (confirmación de cita, etc.) como texto
    if (reply.reply_text) {
      return sendKapsoText(recipientPhone, phoneNumberId, reply.reply_text);
    }
    return null;

  }



  if (replyType === 'document' && reply.document?.url && reply.document?.filename) {

    return withKapsoRetry(

      () => client.messages.documentSender.send({

        phoneNumberId,

        to: recipientPhone,

        document: {

          link: reply.document.url,

          filename: reply.document.filename,

          caption: reply.document.caption ? normalizeWhatsAppText(reply.document.caption) : undefined,

        },

      }),

      `sendDocument(${recipientPhone})`,

    );

  }



  // Texto: si también hay reacción, enviarla primero y luego el texto (dual-dispatch)

  if (reply.reaction?.message_id && reply.reaction?.emoji) {

    addBridgeDebugEvent('kapso_send_reaction_with_text', {

      to: recipientPhone,

      emoji: reply.reaction.emoji,

      message_id: reply.reaction.message_id,

    });

    console.log(

      `[KapsoBridge] -> KapsoReaction (dual) to=${recipientPhone} emoji=${reply.reaction.emoji}`,

    );

    try {

      await withKapsoRetry(

        () => client.messages.sendReaction({

          phoneNumberId,

          to: recipientPhone,

          reaction: {

            messageId: reply.reaction.message_id,

            emoji: reply.reaction.emoji,

          },

        }),

        `sendReaction(${recipientPhone})`,

      );

    } catch (reactionError) {

      // No bloqueamos el envío del texto si la reacción falla

      console.warn('[KapsoBridge] Reacción falló (no bloquea texto):', reactionError?.message || reactionError);

    }

  }



  const textResult = await sendKapsoText(recipientPhone, phoneNumberId, reply.reply_text || '');

  addBridgeDebugEvent('kapso_send_done', {
    to: recipientPhone,
    phone_number_id: phoneNumberId,
    message_id: reply.message_id,
    reply_type: replyType,
    result: textResult ?? null,
  });

  console.log(
    `[KapsoBridge] kapso_send_done to=${recipientPhone} phone_number_id=${phoneNumberId} result=${JSON.stringify(textResult ?? null)}`,
  );

  return textResult;

}



function validateWebhook(req, res) {

  if (!KAPSO_WEBHOOK_SECRET) return true;



  const signature = req.headers['x-webhook-signature'];

  const signatureStr = Array.isArray(signature) ? signature[0] : signature;

  const rawBody = req.rawBody;



  if (signatureStr && rawBody) {

    const hmac = crypto.createHmac('sha256', KAPSO_WEBHOOK_SECRET);

    hmac.update(rawBody);

    const computedSignature = hmac.digest('hex');

    if (computedSignature !== signatureStr) {

      res.status(401).json({ error: 'unauthorized', message: 'invalid signature' });

      return false;

    }

    return true;

  }



  const incomingSecret = req.headers['x-webhook-secret'];

  const incomingSecretStr = Array.isArray(incomingSecret) ? incomingSecret[0] : incomingSecret;

  if (!incomingSecretStr || incomingSecretStr !== KAPSO_WEBHOOK_SECRET) {

    res.status(401).json({ error: 'unauthorized' });

    return false;

  }



  return true;

}



app.get('/health', (_req, res) => {

  res.status(200).json({ status: 'ok', bridge: 'kapso', timestamp: new Date().toISOString() });

});


// ════════════════════════════════════════════════════════════
// PWA Events — /events
// ════════════════════════════════════════════════════════════

app.get('/events/verify-token', (req, res) => {
  const token = req.query.token || '';
  const allowed = new Set([KAPSO_DEBUG_TOKEN, KAPSO_INTERNAL_TOKEN].filter(Boolean));
  if (!token || !allowed.has(token)) {
    return res.status(401).json({ ok: false, error: 'Token inválido' });
  }
  res.json({ ok: true });
});

app.get('/events/manifest.json', (_req, res) => {
  res.setHeader('Content-Type', 'application/manifest+json');
  res.json({
    name: 'URPE AI Events',
    short_name: 'URPE Events',
    description: 'Panel de eventos en tiempo real — URPE AI Lab',
    start_url: '/events',
    display: 'standalone',
    background_color: '#080c1e',
    theme_color: '#0d1b4b',
    orientation: 'portrait',
    icons: [{
      src: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 192 192'><rect width='192' height='192' rx='32' fill='%230d1b4b'/><text x='96' y='130' font-size='100' text-anchor='middle' fill='%2338bdf8'>⚡</text></svg>",
      sizes: '192x192',
      type: 'image/svg+xml',
    }],
  });
});

app.get('/events/sw.js', (_req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'no-cache');
  res.send(`
const CACHE='urpe-events-v1';
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['/events'])));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('fetch',e=>{if(e.request.mode==='navigate'){e.respondWith(fetch(e.request).catch(()=>caches.match('/events')));}});
`);
});

app.get('/events/app', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<meta name="theme-color" content="#080c1e">
<meta name="apple-mobile-web-app-capable" content="yes">
<link rel="manifest" href="/events/manifest.json">
<title>URPE AI — Events</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#080c1e;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e2e8f0}
.center{text-align:center;padding:40px 24px}
.icon{font-size:48px;margin-bottom:20px}
h1{font-size:22px;font-weight:700;color:#7dd3fc;margin-bottom:10px}
p{color:#64748b;font-size:14px;line-height:1.6}
.logout{margin-top:32px;display:inline-block;padding:10px 24px;border:1px solid rgba(56,189,248,0.3);border-radius:8px;color:#38bdf8;font-size:13px;cursor:pointer;background:none;letter-spacing:.05em}
</style>
</head>
<body>
<div class="center">
<div class="icon">⚡</div>
<h1>Conectado</h1>
<p>El panel de eventos está en construcción.<br>Próximamente aquí verás las notificaciones en tiempo real.</p>
<button class="logout" onclick="localStorage.removeItem('urpe_events_token');window.location.href='/events'">Cerrar sesión</button>
</div>
<script>
if('serviceWorker' in navigator)navigator.serviceWorker.register('/events/sw.js').catch(()=>{});
if(!localStorage.getItem('urpe_events_token'))window.location.href='/events';
</script>
</body>
</html>`);
});

app.get('/events', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<meta name="theme-color" content="#080c1e">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="URPE Events">
<link rel="manifest" href="/events/manifest.json">
<title>URPE AI — Events</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --navy-900:#080c1e;--navy-700:#0d1b4b;--navy-600:#0f2460;
  --blue-400:#38bdf8;--blue-300:#7dd3fc;--blue-200:#bae6fd;
  --cyan-400:#22d3ee;--text-primary:#e2e8f0;--text-muted:#64748b;--text-dim:#94a3b8;
  --border:rgba(56,189,248,0.18);--border-focus:rgba(56,189,248,0.7);
  --glass:rgba(13,27,75,0.55);--error:#f87171;
}
html,body{height:100%;width:100%;overflow:hidden}
body{background:var(--navy-900);display:flex;align-items:center;justify-content:center;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:var(--text-primary);position:relative}
.bg-grid{position:fixed;inset:0;background-image:linear-gradient(rgba(56,189,248,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(56,189,248,.06) 1px,transparent 1px);background-size:48px 48px;animation:grid-drift 20s linear infinite;z-index:0}
@keyframes grid-drift{0%{transform:translate(0,0)}100%{transform:translate(48px,48px)}}
.orb{position:fixed;border-radius:50%;filter:blur(80px);z-index:0;pointer-events:none;animation:orb-float 8s ease-in-out infinite alternate}
.orb-1{width:320px;height:320px;background:radial-gradient(circle,rgba(13,52,144,.6) 0%,transparent 70%);top:-80px;left:-80px}
.orb-2{width:260px;height:260px;background:radial-gradient(circle,rgba(6,128,193,.45) 0%,transparent 70%);bottom:-60px;right:-60px;animation-delay:-4s}
.orb-3{width:180px;height:180px;background:radial-gradient(circle,rgba(34,211,238,.25) 0%,transparent 70%);top:40%;left:60%;animation-delay:-2s}
@keyframes orb-float{0%{transform:translate(0,0) scale(1)}100%{transform:translate(20px,-30px) scale(1.08)}}
.scanline{position:fixed;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,var(--blue-400),transparent);animation:scan 5s linear infinite;opacity:.4;z-index:1}
@keyframes scan{0%{top:-2px}100%{top:100vh}}
.card{position:relative;z-index:10;width:100%;max-width:380px;margin:0 20px;background:var(--glass);border:1px solid var(--border);border-radius:20px;padding:44px 32px 40px;backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);box-shadow:0 0 0 1px rgba(56,189,248,.08),0 20px 60px rgba(5,9,25,.7),inset 0 1px 0 rgba(255,255,255,.06)}
.brand{text-align:center;margin-bottom:36px}
.brand-icon{display:inline-flex;align-items:center;justify-content:center;width:64px;height:64px;border-radius:18px;background:linear-gradient(135deg,var(--navy-700),var(--navy-600));border:1px solid var(--border);font-size:28px;margin-bottom:18px;box-shadow:0 0 24px rgba(56,189,248,.35),inset 0 1px 0 rgba(255,255,255,.07);animation:icon-pulse 3s ease-in-out infinite}
@keyframes icon-pulse{0%,100%{box-shadow:0 0 24px rgba(56,189,248,.35),inset 0 1px 0 rgba(255,255,255,.07)}50%{box-shadow:0 0 40px rgba(56,189,248,.55),inset 0 1px 0 rgba(255,255,255,.07)}}
.brand-title{font-size:22px;font-weight:700;letter-spacing:.04em;background:linear-gradient(90deg,var(--blue-300),var(--cyan-400),var(--blue-200));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;line-height:1.2}
.brand-sub{margin-top:6px;font-size:12px;font-weight:500;letter-spacing:.18em;text-transform:uppercase;color:var(--text-muted)}
.form-label{display:block;font-size:11px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--text-dim);margin-bottom:8px}
.input-wrap{position:relative;margin-bottom:24px}
.input-wrap::before{content:'';position:absolute;inset:-1px;border-radius:11px;background:linear-gradient(135deg,var(--blue-400),var(--cyan-400));opacity:0;transition:opacity .3s;z-index:0;pointer-events:none}
.input-wrap:focus-within::before{opacity:.6}
.token-input{position:relative;z-index:1;width:100%;padding:14px 46px 14px 16px;background:rgba(8,12,30,.8);border:1px solid var(--border);border-radius:10px;color:var(--text-primary);font-size:15px;font-family:'SF Mono','Fira Code','Consolas',monospace;letter-spacing:.06em;outline:none;transition:border-color .2s,background .2s;caret-color:var(--blue-400);-webkit-appearance:none}
.token-input::placeholder{color:var(--text-muted);letter-spacing:0;font-family:inherit}
.token-input:focus{border-color:var(--border-focus);background:rgba(13,21,53,.9)}
.input-eye{position:absolute;right:14px;top:50%;transform:translateY(-50%);z-index:2;background:none;border:none;color:var(--text-muted);cursor:pointer;padding:4px;display:flex;align-items:center;justify-content:center;transition:color .2s;-webkit-tap-highlight-color:transparent}
.input-eye:hover{color:var(--blue-400)}
.btn-login{width:100%;padding:15px;background:linear-gradient(135deg,#0d47a1,#0a2d7a,#0d1b4b);border:1px solid rgba(56,189,248,.35);border-radius:12px;color:var(--blue-200);font-size:15px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;cursor:pointer;position:relative;overflow:hidden;transition:border-color .2s,transform .1s;-webkit-tap-highlight-color:transparent;box-shadow:0 4px 20px rgba(13,27,75,.6),0 0 0 1px rgba(56,189,248,.08)}
.btn-login::before{content:'';position:absolute;inset:0;background:linear-gradient(135deg,rgba(56,189,248,.15),transparent 60%);opacity:0;transition:opacity .3s}
.btn-login:hover::before{opacity:1}
.btn-login:hover{border-color:rgba(56,189,248,.7)}
.btn-login:active{transform:scale(.98)}
.btn-login.loading{pointer-events:none;opacity:.7}
.error-msg{display:none;margin-top:16px;padding:12px 16px;border-radius:10px;background:rgba(248,113,113,.12);border:1px solid rgba(248,113,113,.25);color:var(--error);font-size:13px;font-weight:500;text-align:center;animation:shake .35s ease}
.error-msg.show{display:block}
@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
.spinner{display:inline-block;width:16px;height:16px;border:2px solid rgba(186,230,253,.3);border-top-color:var(--blue-200);border-radius:50%;animation:spin .7s linear infinite;vertical-align:middle;margin-right:8px}
@keyframes spin{to{transform:rotate(360deg)}}
.card-footer{margin-top:28px;text-align:center;font-size:11px;color:var(--text-muted);letter-spacing:.05em}
.dot-pulse{display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--cyan-400);margin-right:6px;vertical-align:middle;animation:dot-blink 2s ease-in-out infinite}
@keyframes dot-blink{0%,100%{opacity:1;box-shadow:0 0 6px var(--cyan-400)}50%{opacity:.3;box-shadow:none}}
.corner{position:absolute;width:20px;height:20px}
.corner-tl{top:14px;left:14px;border-top:2px solid var(--blue-400);border-left:2px solid var(--blue-400);border-radius:4px 0 0 0}
.corner-tr{top:14px;right:14px;border-top:2px solid var(--blue-400);border-right:2px solid var(--blue-400);border-radius:0 4px 0 0}
.corner-bl{bottom:14px;left:14px;border-bottom:2px solid var(--blue-400);border-left:2px solid var(--blue-400);border-radius:0 0 0 4px}
.corner-br{bottom:14px;right:14px;border-bottom:2px solid var(--blue-400);border-right:2px solid var(--blue-400);border-radius:0 0 4px 0}
@supports (padding-bottom:env(safe-area-inset-bottom)){body{padding-bottom:env(safe-area-inset-bottom)}}
</style>
</head>
<body>
<div class="bg-grid"></div>
<div class="orb orb-1"></div>
<div class="orb orb-2"></div>
<div class="orb orb-3"></div>
<div class="scanline"></div>
<div class="card" id="loginCard">
  <div class="corner corner-tl"></div>
  <div class="corner corner-tr"></div>
  <div class="corner corner-bl"></div>
  <div class="corner corner-br"></div>
  <div class="brand">
    <div class="brand-icon">⚡</div>
    <div class="brand-title">URPE AI</div>
    <div class="brand-sub">Events Portal</div>
  </div>
  <form id="loginForm" autocomplete="off" onsubmit="return false;">
    <label class="form-label" for="tokenInput">Token de acceso</label>
    <div class="input-wrap">
      <input class="token-input" id="tokenInput" type="password" inputmode="text" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="Ingresa tu token..." maxlength="200"/>
      <button class="input-eye" type="button" id="eyeBtn" aria-label="Mostrar / ocultar token">
        <svg id="eyeIcon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
        </svg>
      </button>
    </div>
    <button class="btn-login" type="submit" id="loginBtn">Acceder</button>
    <div class="error-msg" id="errorMsg">Token inválido — verificá que sea el correcto</div>
  </form>
  <div class="card-footer"><span class="dot-pulse"></span>Sistema activo</div>
</div>
<script>
if('serviceWorker' in navigator)navigator.serviceWorker.register('/events/sw.js').catch(()=>{});
const TOKEN_KEY='urpe_events_token';
const saved=localStorage.getItem(TOKEN_KEY);
if(saved)verifyAndRedirect(saved);
const eyeBtn=document.getElementById('eyeBtn');
const tokenInput=document.getElementById('tokenInput');
const eyeIcon=document.getElementById('eyeIcon');
let showToken=false;
eyeBtn.addEventListener('click',()=>{
  showToken=!showToken;
  tokenInput.type=showToken?'text':'password';
  eyeIcon.innerHTML=showToken
    ?'<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>'
    :'<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
});
document.getElementById('loginForm').addEventListener('submit',async(e)=>{
  e.preventDefault();
  const token=tokenInput.value.trim();
  if(!token)return;
  await doLogin(token);
});
tokenInput.addEventListener('keydown',(e)=>{
  if(e.key==='Enter'){e.preventDefault();document.getElementById('loginForm').dispatchEvent(new Event('submit'));}
});
async function doLogin(token){
  const btn=document.getElementById('loginBtn');
  const err=document.getElementById('errorMsg');
  err.classList.remove('show');
  btn.classList.add('loading');
  btn.innerHTML='<span class="spinner"></span>Verificando...';
  try{
    const res=await fetch('/events/verify-token?token='+encodeURIComponent(token));
    const data=await res.json();
    if(data.ok){
      localStorage.setItem(TOKEN_KEY,token);
      btn.innerHTML='✓ Acceso concedido';
      btn.style.background='linear-gradient(135deg,#064e3b,#065f46)';
      btn.style.borderColor='rgba(52,211,153,.5)';
      btn.style.color='#6ee7b7';
      setTimeout(()=>{window.location.href='/events/app';},600);
    }else{showError();}
  }catch{showError('Error de conexión — intentá de nuevo');}
  finally{if(btn.classList.contains('loading')){btn.classList.remove('loading');btn.innerHTML='Acceder';}}
}
async function verifyAndRedirect(token){
  try{
    const res=await fetch('/events/verify-token?token='+encodeURIComponent(token));
    const data=await res.json();
    if(data.ok){window.location.href='/events/app';}else{localStorage.removeItem(TOKEN_KEY);}
  }catch{}
}
function showError(msg){
  const err=document.getElementById('errorMsg');
  const btn=document.getElementById('loginBtn');
  if(msg)err.textContent=msg;
  err.classList.add('show');
  btn.classList.remove('loading');
  btn.innerHTML='Acceder';
  tokenInput.focus();
}
</script>
</body>
</html>`);
});

// Dispatch endpoint: Python retry task sends processed responses here for WhatsApp delivery
app.post('/api/v1/dispatch', async (req, res) => {
  try {
    const token = req.headers['x-kapso-internal-token'];
    if (KAPSO_INTERNAL_TOKEN && token !== KAPSO_INTERNAL_TOKEN) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    const reply = req.body;
    if (!reply || !reply.recipient_phone || !reply.phone_number_id) {
      return res.status(400).json({ error: 'missing recipient_phone or phone_number_id' });
    }
    addBridgeDebugEvent('dispatch_retry', {
      to: reply.recipient_phone,
      phone_number_id: reply.phone_number_id,
      reply_type: reply.reply_type || 'text',
      message_id: reply.message_id,
    });
    console.log(`[KapsoBridge] dispatch retry to=${reply.recipient_phone} type=${reply.reply_type || 'text'}`);
    const sendResult = await dispatchKapsoResponse(reply);
    res.json({ ok: true, result: sendResult ?? null });
  } catch (error) {
    console.error('[KapsoBridge] dispatch error:', error?.message || error);
    res.status(500).json({ error: String(error?.message || error) });
  }
});



app.post('/api/v1/scheduling/disponibilidad', async (req, res) => {

  await proxyFastApiRequest(req, res, '/api/v1/scheduling/disponibilidad');

});



app.post('/api/v1/scheduling/crear-evento', async (req, res) => {

  await proxyFastApiRequest(req, res, '/api/v1/scheduling/crear-evento');

});



app.post('/api/v1/scheduling/reagendar-evento', async (req, res) => {

  await proxyFastApiRequest(req, res, '/api/v1/scheduling/reagendar-evento');

});



app.post('/api/v1/scheduling/eliminar-evento', async (req, res) => {

  await proxyFastApiRequest(req, res, '/api/v1/scheduling/eliminar-evento');

});

/* ── ManyChat inbound ── */
// GHL inspect — captura el payload crudo para debuggear
app.post('/api/v1/ghl/inspect', async (req, res) => {
  const baseUrl = getFastApiBaseUrl();
  const targetUrl = new URL('/api/v1/ghl/inspect', `${baseUrl}/`).toString();
  try {
    const upstream = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req.body ?? {}),
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'ghl_inspect_proxy_error', message: err.message });
  }
});

app.get('/api/v1/ghl/inspect/last', async (req, res) => {
  const baseUrl = getFastApiBaseUrl();
  const targetUrl = new URL('/api/v1/ghl/inspect/last', `${baseUrl}/`).toString();
  try {
    const upstream = await fetch(targetUrl);
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'ghl_inspect_get_proxy_error', message: err.message });
  }
});

app.delete('/api/v1/ghl/inspect/clear', async (req, res) => {
  const baseUrl = getFastApiBaseUrl();
  const targetUrl = new URL('/api/v1/ghl/inspect/clear', `${baseUrl}/`).toString();
  try {
    const upstream = await fetch(targetUrl, { method: 'DELETE' });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'ghl_inspect_delete_proxy_error', message: err.message });
  }
});

app.get('/api/v1/ghl/debug/events', async (req, res) => {
  const baseUrl = getFastApiBaseUrl();
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const targetUrl = new URL(`/api/v1/ghl/debug/events${qs}`, `${baseUrl}/`).toString();
  try {
    const upstream = await fetch(targetUrl);
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'ghl_debug_events_proxy_error', message: err.message });
  }
});

app.get('/api/v1/ghl/debug/config', async (req, res) => {
  const baseUrl = getFastApiBaseUrl();
  const targetUrl = new URL('/api/v1/ghl/debug/config', `${baseUrl}/`).toString();
  try {
    const upstream = await fetch(targetUrl);
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'ghl_debug_config_proxy_error', message: err.message });
  }
});

app.get('/api/v1/kapso/debug/events', async (req, res) => {
  const baseUrl = getFastApiBaseUrl();
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const targetUrl = new URL(`/api/v1/kapso/debug/events${qs}`, `${baseUrl}/`).toString();
  try {
    const upstream = await fetch(targetUrl, {
      headers: KAPSO_INTERNAL_TOKEN ? { 'x-kapso-internal-token': KAPSO_INTERNAL_TOKEN } : {},
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'kapso_debug_events_proxy_error', message: err.message });
  }
});

app.get('/api/v1/kapso/debug/config', async (req, res) => {
  const baseUrl = getFastApiBaseUrl();
  const targetUrl = new URL('/api/v1/kapso/debug/config', `${baseUrl}/`).toString();
  try {
    const upstream = await fetch(targetUrl, {
      headers: KAPSO_INTERNAL_TOKEN ? { 'x-kapso-internal-token': KAPSO_INTERNAL_TOKEN } : {},
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'kapso_debug_config_proxy_error', message: err.message });
  }
});

app.get('/api/v1/manychat/debug/events', async (req, res) => {
  const baseUrl = getFastApiBaseUrl();
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const targetUrl = new URL(`/api/v1/manychat/debug/events${qs}`, `${baseUrl}/`).toString();
  try {
    const upstream = await fetch(targetUrl);
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'manychat_debug_events_proxy_error', message: err.message });
  }
});

app.get('/api/v1/manychat/debug/config', async (req, res) => {
  const baseUrl = getFastApiBaseUrl();
  const targetUrl = new URL('/api/v1/manychat/debug/config', `${baseUrl}/`).toString();
  try {
    const upstream = await fetch(targetUrl);
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'manychat_debug_config_proxy_error', message: err.message });
  }
});

app.post('/api/v1/ghl/send', async (req, res) => {
  if (!requireSendAccess(req, res)) return;
  const baseUrl = getFastApiBaseUrl();
  const targetUrl = new URL('/api/v1/ghl/send', `${baseUrl}/`).toString();
  try {
    const upstream = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-send-key': req.headers['x-send-key'] || '',
      },
      body: JSON.stringify(req.body ?? {}),
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'ghl_send_proxy_error', message: err.message });
  }
});

app.post('/api/v1/ghl/inbound', async (req, res) => {
  const baseUrl = getFastApiBaseUrl();
  const targetUrl = new URL('/api/v1/ghl/inbound', `${baseUrl}/`).toString();
  try {
    const upstream = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-ghl-key': req.headers['x-ghl-key'] || '',
      },
      body: JSON.stringify(req.body ?? {}),
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'ghl_proxy_error', message: err.message });
  }
});

app.post('/api/v1/manychat/inbound', async (req, res) => {

  const baseUrl = getFastApiBaseUrl();
  const targetUrl = new URL('/api/v1/manychat/inbound', `${baseUrl}/`).toString();

  try {
    const upstream = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // Reenviar el API key del canal — autenticado en FastAPI via Edge Function
        'x-api-key': req.headers['x-api-key'] || '',
      },
      body: JSON.stringify(req.body ?? {}),
    });

    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'manychat_proxy_error', message: err.message });
  }

});

app.post('/api/v1/kapso/send', async (req, res) => {
  if (!requireSendAccess(req, res)) return;
  const baseUrl = getFastApiBaseUrl();
  const targetUrl = new URL('/api/v1/kapso/send', `${baseUrl}/`).toString();
  try {
    const upstream = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-send-key': req.headers['x-send-key'] || '',
      },
      body: JSON.stringify(req.body ?? {}),
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'kapso_send_proxy_error', message: err.message });
  }
});

app.post('/api/v1/manychat/send', async (req, res) => {
  if (!requireSendAccess(req, res)) return;
  const baseUrl = getFastApiBaseUrl();
  const targetUrl = new URL('/api/v1/manychat/send', `${baseUrl}/`).toString();

  try {
    const upstream = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-send-key': req.headers['x-send-key'] || '',
      },
      body: JSON.stringify(req.body ?? {}),
    });

    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'manychat_send_proxy_error', message: err.message });
  }

});

app.get('/debug/kapso', async (_req, res) => {

  if (!requireDebugAccess(_req, res)) return;

  try {

    const debugData = await collectKapsoDebugPayload();

    res.set('Cache-Control', 'no-store, max-age=0');

    res.status(200).type('html').send(renderKapsoBasicHtml(debugData, extractAccessToken(_req)));

  } catch (error) {

    res.status(500).type('html').send(`<pre>${escapeHtml(String(error))}</pre>`);

  }

});


/* ── SSE proxy: streams FastAPI debug events in real time ── */
app.get('/debug/kapso/stream', async (req, res) => {
  if (!requireDebugAccess(req, res)) return;
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': '*',
  });
  res.flushHeaders();
  // Send an immediate comment to flush Railway's reverse-proxy buffer
  // Without this, the proxy holds the response until it sees the first data chunk
  res.write(': connected\n\n');

  const baseUrl = getFastApiBaseUrl();
  let aborted = false;
  req.on('close', () => { aborted = true; });

  try {
    const upstream = await fetch(`${baseUrl}/api/v1/kapso/debug/stream`, {
      signal: AbortSignal.timeout(3600_000), // 1h max
    });
    if (!upstream.ok || !upstream.body) {
      res.write(`data: {"error":"upstream ${upstream.status}"}\n\n`);
      res.end();
      return;
    }
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    while (!aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value, { stream: true }));
    }
    reader.cancel().catch(() => {});
  } catch (err) {
    if (!aborted) {
      res.write(`data: {"error":"${String(err.message).slice(0, 200)}"}\n\n`);
    }
  }
  res.end();
});


app.get('/debug/kapso/visual', async (req, res) => {

  if (!requireDebugAccess(req, res)) return;

  res.set('Cache-Control', 'no-store, max-age=0');

  // Fetch graph schema + empresas from Python backend
  let graphData = null;
  let empresasList = [];

  try {

    const baseUrl = INTERNAL_AGENT_API_URL.replace(/\/api\/v1\/kapso\/inbound$/, '');

    const eid = req.query.empresa_id || DEFAULT_EMPRESA_ID;

    const empresaParam = eid ? `?empresa_id=${encodeURIComponent(eid)}` : '';

    const [graphRes, empRes] = await Promise.allSettled([
      fetch(`${baseUrl}/api/v1/graph/schema${empresaParam}`),
      fetch(`${baseUrl}/api/v1/kapso/debug/empresas`),
    ]);

    if (graphRes.status === 'fulfilled' && graphRes.value.ok) graphData = await graphRes.value.json();
    if (empRes.status === 'fulfilled' && empRes.value.ok) {
      const empJson = await empRes.value.json();
      empresasList = empJson.empresas || [];
    }

  } catch (err) {

    console.warn('[visual] Could not fetch graph schema:', err.message);

  }

  res.status(200).type('html').send(renderConstellationHtml(graphData, empresasList, extractAccessToken(req)));

});



// ── Unified public visual (todos los canales) ─────────────────────────────────

app.get('/public/visual', async (req, res) => {

  res.set('Cache-Control', 'no-store, max-age=0');

  let graphData = null;

  try {

    const baseUrl = INTERNAL_AGENT_API_URL.replace(/\/api\/v1\/kapso\/inbound$/, '');

    const eid = req.query.empresa_id || DEFAULT_EMPRESA_ID;

    const empresaParam = eid ? `?empresa_id=${encodeURIComponent(eid)}` : '';

    const graphRes = await fetch(`${baseUrl}/api/v1/graph/schema${empresaParam}`);

    if (graphRes.ok) graphData = sanitizePublicConstellationGraph(await graphRes.json());

  } catch (err) {

    console.warn('[public/visual] Could not fetch graph schema:', err.message);

  }

  const dataPathUrl = new URL('/public/visual/data', 'http://localhost');

  if (req.query.empresa_id) dataPathUrl.searchParams.set('empresa_id', String(req.query.empresa_id));

  res.status(200).type('html').send(renderPublicConstellationHtml(graphData, `${dataPathUrl.pathname}${dataPathUrl.search}`));

});



app.get('/public/visual/data', async (req, res) => {

  try {

    const payload = await collectUnifiedPublicVisualPayload(req.query.empresa_id || '');

    res.set('Cache-Control', 'no-store, max-age=0');

    res.status(200).json(payload);

  } catch (error) {

    res.status(200).json({ events: [] });

  }

});



// ── Legacy redirect — mantener compatibilidad con URLs existentes ──────────────

app.get('/public/kapso/visual', (req, res) => {

  const qs = req.query.empresa_id ? `?empresa_id=${encodeURIComponent(req.query.empresa_id)}` : '';

  res.redirect(301, `/public/visual${qs}`);

});





app.get('/debug/kapso/app.js', (_req, res) => {

  if (!requireDebugAccess(_req, res)) return;

  res.set('Cache-Control', 'no-store, max-age=0');

  res.status(200).type('application/javascript').send(renderKapsoDebugScript(extractAccessToken(_req)));

});



app.get('/debug/kapso/empresas', async (_req, res) => {
  if (!requireDebugAccess(_req, res)) return;
  try {
    const data = await fetchFastApiDebugJson('/api/v1/kapso/debug/empresas');
    res.set('Cache-Control', 'no-store, max-age=0');
    res.status(200).json(data);
  } catch (error) {
    res.status(200).json({ empresas: [] });
  }
});



app.get('/debug/kapso/data', async (_req, res) => {

  if (!requireDebugAccess(_req, res)) return;

  try {

    const debugData = await collectKapsoDebugPayload();

    res.set('Cache-Control', 'no-store, max-age=0');

    res.status(200).json(debugData);

  } catch (error) {

    res.status(500).json({ error: String(error) });

  }

});



app.post('/webhook/kapso', async (req, res) => {

  try {

    if (!validateWebhook(req, res)) return;



    const dataArray = extractDataArray(req.body);

    addBridgeDebugEvent('webhook_received', { records: dataArray.length });

    console.log(`[KapsoBridge] webhook recibido records=${dataArray.length}`);

    if (!dataArray.length) {

      res.status(400).json({ error: 'empty_batch' });

      return;

    }



    const groupedPayloads = new Map();

    for (const item of dataArray) {

      accumulateMessage(item, groupedPayloads);

    }



    if (!groupedPayloads.size) {

      res.status(400).json({ error: 'no_valid_messages' });

      return;

    }



    addBridgeDebugEvent('webhook_grouped', { conversations: groupedPayloads.size });

    console.log(`[KapsoBridge] webhook agrupado conversations=${groupedPayloads.size}`);



    res.status(200).json({ status: 'received', groups: groupedPayloads.size });



    const now = Date.now();

    cleanupProcessedMessages(now);



    for (const [_from, sqlPayload] of groupedPayloads.entries()) {

      const messageId = sqlPayload.message_id;

      if (messageId) {

        const existing = processedMessageIds.get(messageId);

        if (existing) {

          if (existing.status === 'processing' && now - existing.updatedAt > PROCESSING_MESSAGE_TTL_MS) {

            processedMessageIds.delete(messageId);

          } else {

            continue;

          }

        }

        processedMessageIds.set(messageId, { status: 'processing', updatedAt: now });

      }



      const queueKey = `contact:${sqlPayload.from}`;

      const previous = threadQueues.get(queueKey) ?? Promise.resolve();

      let processedOk = false;



      const current = previous

        .catch(() => {})

        .then(async () => {

          addBridgeDebugEvent('message_processing_start', {

            from: sqlPayload.from,

            contact_name: sqlPayload.contact_name,

            phone_number_id: sqlPayload.phone_number_id,

            message_id: sqlPayload.message_id,

            message_type: sqlPayload.message_type,

            text: sqlPayload.text,

          });

          console.log(

            `[KapsoBridge] procesando from=${sqlPayload.from} phone_number_id=${sqlPayload.phone_number_id} message_id=${sqlPayload.message_id}`,

          );

          await markKapsoAsRead(sqlPayload.phone_number_id, sqlPayload.message_id);

          const typingKeepalive = startTypingKeepalive(sqlPayload.phone_number_id, sqlPayload.message_id);

          let reply;

          try {

            reply = await withTimeout(callInternalAgent(sqlPayload), PROCESS_TIMEOUT_MS);

          } finally {

            typingKeepalive.abort();

          }

          const sendResult = await dispatchKapsoResponse(reply);

          addBridgeDebugEvent('message_processing_done', {

            from: sqlPayload.from,

            phone_number_id: sqlPayload.phone_number_id,

            message_id: sqlPayload.message_id,

            send_result: sendResult ?? null,

          });

          console.log(

            `[KapsoBridge] mensaje procesado message_id=${sqlPayload.message_id} kapso_response=${JSON.stringify(sendResult ?? null)}`,

          );

          processedOk = true;

        })

        .catch(error => {

          addBridgeDebugEvent('message_processing_error', {

            from: sqlPayload.from,

            phone_number_id: sqlPayload.phone_number_id,

            message_id: sqlPayload.message_id,

            error: String(error?.message || error),

          });

          console.error('[KapsoBridge] Error procesando mensaje:', error?.stack || error);

        })

        .finally(() => {

          if (threadQueues.get(queueKey) === current) {

            threadQueues.delete(queueKey);

          }

          if (messageId) {

            if (processedOk) {

              processedMessageIds.set(messageId, { status: 'done', updatedAt: Date.now() });

            } else {

              processedMessageIds.delete(messageId);

            }

          }

        });



      threadQueues.set(queueKey, current);

      current.catch(error => {

        console.error('[KapsoBridge] Error inesperado en cola:', error);

      });

    }

  } catch (error) {

    console.error('[KapsoBridge] Error en webhook:', error);

    if (!res.headersSent) {

      res.status(500).json({ error: 'internal_server_error' });

    }

  }

});



// ── ManyChat debug panel ──────────────────────────────────────────────────────

function buildManyChatInteractions(events = []) {
  const sorted = [...events]
    .filter(e => e && e.timestamp && e.stage)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  const interactions = [];
  const pendingBySubscriber = new Map();

  for (const event of sorted) {
    const payload = event.payload || {};
    const subscriberId = payload.subscriber_id;
    if (!subscriberId) continue;

    if (event.stage === 'message_received' || event.stage === 'fb_message_received') {
      const interaction = {
        id: `${subscriberId}_${event.timestamp}`,
        message_id: `${subscriberId}_${event.timestamp}`,
        started_at: event.timestamp,
        from_phone: subscriberId,
        contacto_id: payload.contacto_id || null,
        contact_name: payload.contact_name || null,
        empresa_id: payload.empresa_id,
        message_text: payload.message || '',
        message_type: 'text',
        canal: payload.canal || (event.stage === 'fb_message_received' ? 'facebook' : 'instagram'),
        status: 'processing',
        agent_runs: [],
        tools_used: [],
      };
      pendingBySubscriber.set(subscriberId, interaction);
      interactions.push(interaction);

    } else if (event.stage === 'slash_command_detected') {
      const interaction = {
        id: `${subscriberId}_${event.timestamp}`,
        message_id: `${subscriberId}_${event.timestamp}`,
        started_at: event.timestamp,
        from_phone: subscriberId,
        message_text: payload.command || '',
        message_type: 'slash',
        canal: payload.canal || event.channel || 'instagram',
        status: 'processing',
        agent_runs: [],
        tools_used: [],
      };
      pendingBySubscriber.set(subscriberId, interaction);
      interactions.push(interaction);

    } else if (event.stage === 'message_sent' || event.stage === 'fb_message_sent') {
      const pending = pendingBySubscriber.get(subscriberId);
      if (pending) {
        pending.agent_name = payload.agent_name;
        pending.model_used = payload.model_used;
        pending.response_preview = payload.reply_preview;
        pending.finished_at = event.timestamp;
        pending.status = payload.manychat_send_ok === false ? 'send_error' : 'ok';
        pending.send_error = payload.manychat_send_error || null;
        if (payload.elapsed_s != null) {
          pending.duration_ms = Math.round(payload.elapsed_s * 1000);
          pending.timing = { total_ms: pending.duration_ms };
        }
        pendingBySubscriber.delete(subscriberId);
      }

    } else if (event.stage === 'slash_command_done') {
      const pending = pendingBySubscriber.get(subscriberId);
      if (pending) {
        pending.response_preview = payload.reply;
        pending.finished_at = event.timestamp;
        pending.status = 'ok';
        if (pending.started_at && pending.finished_at) {
          pending.duration_ms = new Date(pending.finished_at) - new Date(pending.started_at);
          pending.timing = { total_ms: pending.duration_ms };
        }
        pendingBySubscriber.delete(subscriberId);
      }

    } else if (event.stage === 'error') {
      const pending = pendingBySubscriber.get(subscriberId);
      if (pending) {
        pending.status = 'error';
        pending.error = payload.error;
        pending.finished_at = event.timestamp;
        pendingBySubscriber.delete(subscriberId);
      }
    }
  }

  return interactions.sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
}

// ── GHL interactions builder ──────────────────────────────────────────────────

function buildGHLInteractions(events = []) {
  const sorted = [...events]
    .filter(e => e && e.timestamp && e.stage)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  const interactions = [];
  const pendingByContact = new Map();

  for (const event of sorted) {
    const payload = event.payload || {};
    const contactId = payload.contact_id;
    if (!contactId) continue;

    if (event.stage === 'ghl_message_received') {
      const interaction = {
        id: `${contactId}_${event.timestamp}`,
        message_id: `${contactId}_${event.timestamp}`,
        started_at: event.timestamp,
        from_phone: contactId,
        contacto_id: payload.contacto_id || null,
        contact_name: payload.contact_name || null,
        empresa_id: payload.empresa_id,
        message_text: payload.message || '',
        message_type: 'text',
        canal: payload.canal || 'instagram',
        status: 'processing',
        agent_runs: [],
        tools_used: [],
      };
      pendingByContact.set(contactId, interaction);
      interactions.push(interaction);

    } else if (event.stage === 'ghl_message_sent') {
      const pending = pendingByContact.get(contactId);
      if (pending) {
        pending.agent_name = payload.agent_name;
        pending.model_used = payload.model_used;
        pending.response_preview = payload.reply_preview;
        pending.finished_at = event.timestamp;
        pending.status = payload.ghl_send_ok === false ? 'send_error' : 'ok';
        pending.send_error = payload.ghl_send_error || null;
        if (payload.contacto_id) pending.contacto_id = payload.contacto_id;
        if (payload.elapsed_s != null) {
          pending.duration_ms = Math.round(payload.elapsed_s * 1000);
          pending.timing = { total_ms: pending.duration_ms };
        }
        pendingByContact.delete(contactId);
      }

    } else if (event.stage === 'ghl_numero_no_encontrado' || event.stage === 'ghl_sin_contact_id') {
      const interaction = {
        id: `${contactId || 'unknown'}_${event.timestamp}`,
        message_id: `${contactId || 'unknown'}_${event.timestamp}`,
        started_at: event.timestamp,
        finished_at: event.timestamp,
        from_phone: contactId || payload.telefono_recept || '—',
        phone_number_id: payload.telefono_recept,
        canal: payload.canal || 'instagram',
        status: 'error',
        error: payload.error || event.stage,
        dropped: true,
        agent_runs: [],
        tools_used: [],
      };
      interactions.push(interaction);
    }
  }

  return interactions.sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
}

async function collectGHLDebugPayload() {
  const [eventsResult, configResult] = await Promise.allSettled([
    fetchFastApiDebugJson('/api/v1/ghl/debug/events?limit=100'),
    fetchFastApiDebugJson('/api/v1/ghl/debug/config'),
  ]);
  const events = eventsResult.status === 'fulfilled' ? (eventsResult.value.events || []) : [{
    timestamp: new Date().toISOString(),
    source: 'bridge',
    stage: 'fastapi_debug_error',
    payload: { error: String(eventsResult.reason) },
  }];
  return {
    fastapi_config: configResult.status === 'fulfilled' ? configResult.value : { error: String(configResult.reason) },
    events,
    interactions: buildGHLInteractions(events),
  };
}

async function collectManyChatDebugPayload() {
  const [eventsResult, configResult] = await Promise.allSettled([
    fetchFastApiDebugJson('/api/v1/manychat/debug/events?limit=100'),
    fetchFastApiDebugJson('/api/v1/manychat/debug/config'),
  ]);
  const events = eventsResult.status === 'fulfilled' ? (eventsResult.value.events || []) : [{
    timestamp: new Date().toISOString(),
    source: 'bridge',
    stage: 'fastapi_debug_error',
    payload: { error: String(eventsResult.reason) },
  }];
  return {
    fastapi_config: configResult.status === 'fulfilled' ? configResult.value : { error: String(configResult.reason) },
    events,
    interactions: buildManyChatInteractions(events),
  };
}

function renderManyChatHtml(data, debugToken = '') {
  const interactions = Array.isArray(data.interactions) ? data.interactions : [];
  const config = data.fastapi_config || {};

  const okCount = interactions.filter(i => i.status === 'ok').length;
  const errorCount = interactions.filter(i => i.status === 'error').length;
  const withTiming = interactions.filter(i => i.duration_ms != null || i.timing?.total_ms != null);
  const avgDuration = withTiming.length
    ? Math.round(withTiming.reduce((acc, i) => acc + (i.duration_ms || i.timing?.total_ms || 0), 0) / withTiming.length)
    : null;

  const interactionRows = interactions.length
    ? interactions.map((item, idx) => `
        <tr>
          <td>${escapeHtml(item.started_at ? new Date(item.started_at).toLocaleString() : '—')}</td>
          <td>${item.contacto_id != null ? String(item.contacto_id) : escapeHtml(item.from_phone || '—')}</td>
          <td>${escapeHtml(item.canal || 'instagram')}</td>
          <td>${escapeHtml(item.message_type || 'text')}</td>
          <td style="max-width:280px;word-break:break-word">${(function(){ const txt = item.message_text || '—'; if (txt.length <= 200) return escapeHtml(txt); return `${escapeHtml(txt.slice(0,200))}<span class="msg-more" style="display:none">${escapeHtml(txt.slice(200))}</span> <a href="#" onclick="var s=this.previousElementSibling;s.style.display=s.style.display==='none'?'':'none';this.textContent=s.style.display===''?'ver menos':'ver más...';return false;" style="color:#93c5fd;font-size:11px;white-space:nowrap">ver más...</a>`; })()}</td>
          <td>${escapeHtml(item.agent_name || '—')}</td>
          <td>${escapeHtml(item.model_used || '—')}</td>
          <td style="${item.duration_ms != null && item.duration_ms < 20000 ? 'color:#34d399' : item.duration_ms != null && item.duration_ms < 30000 ? 'color:#f97316' : item.duration_ms != null ? 'color:#f87171' : ''}"><b>${item.duration_ms != null ? (item.duration_ms/1000).toFixed(1)+' s' : '—'}</b></td>
          <td>${escapeHtml(item.status || 'processing')}</td>
          <td><a href="#mc-interaction-${idx}" style="color:#93c5fd">Ver detalle</a></td>
        </tr>`).join('')
    : '<tr><td colspan="10" style="padding:20px;color:#94a3b8">Sin interacciones todavía.</td></tr>';

  const interactionDetails = interactions.map((item, idx) => `
    <details class="section" id="mc-interaction-${idx}">
      <summary>${escapeHtml(item.from_phone || item.message_id || 'Interacción '+(idx+1))} · ${escapeHtml(item.status || 'processing')} · ${item.duration_ms != null ? (item.duration_ms/1000).toFixed(1)+' s' : '—'}</summary>
      <div style="margin-top:12px">
        <div style="margin-bottom:8px"><strong>Subscriber ID:</strong> ${escapeHtml(item.from_phone || '—')}</div>
        <div style="margin-bottom:8px"><strong>Canal:</strong> ${escapeHtml(item.canal || '—')}</div>
        <div style="margin-bottom:8px"><strong>Empresa ID:</strong> ${escapeHtml(String(item.empresa_id || '—'))}</div>
        <div style="margin:12px 0 6px"><strong>Error agente</strong></div>
        <pre>${escapeHtml(item.error || '—')}</pre>
        <div style="margin:12px 0 6px"><strong>Error envío ManyChat</strong></div>
        <pre style="${item.send_error ? 'color:#f87171' : ''}">${escapeHtml(item.send_error || '—')}</pre>
        <div style="margin-bottom:8px"><strong>Mensaje:</strong></div>
        <pre>${escapeHtml(item.message_text || '—')}</pre>
        <div style="margin:12px 0 6px"><strong>Respuesta</strong></div>
        <pre>${escapeHtml(item.response_preview || '—')}</pre>
      </div>
    </details>`).join('');

  return `<!doctype html><html lang="es"><head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>ManyChat / Instagram Debug</title>
  <style>
    body{font-family:Arial,sans-serif;background:#0f172a;color:#e2e8f0;margin:0;padding:16px}
    .top{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px}
    .title{font-size:20px;font-weight:700}
    .actions a,.actions button{color:#93c5fd;text-decoration:none;margin-left:12px;background:none;border:none;cursor:pointer;font-size:14px}
    .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin-bottom:16px}
    .card{background:#1e293b;border:1px solid #334155;border-radius:10px;padding:12px}
    .label{font-size:11px;color:#94a3b8;text-transform:uppercase}
    .value{font-size:22px;font-weight:700;margin-top:6px}
    table{width:100%;border-collapse:collapse;background:#111827;border:1px solid #334155}
    th,td{padding:10px;border-bottom:1px solid #334155;text-align:left;vertical-align:top;font-size:12px}
    th{background:#1e293b;color:#93c5fd}
    .section{margin-top:18px}
    details{margin-top:12px;background:#111827;border:1px solid #334155;border-radius:8px;padding:12px}
    summary{cursor:pointer;font-weight:700}
    pre{white-space:pre-wrap;word-break:break-word;color:#cbd5e1;font-size:12px}
  </style>
</head><body>
  <div class="top">
    <div class="title">ManyChat / Instagram Debug</div>
    <div class="actions">
      <span id="last-update" style="color:#94a3b8;font-size:11px"></span>
      <span id="sse-status" style="color:#fbbf24;font-size:11px;margin-left:8px">🟡 Conectando...</span>
      <button id="toggle-auto" style="background:#16a34a;color:#fff;border:none;padding:4px 12px;border-radius:6px;cursor:pointer;font-size:12px">⏸ Pausar</button>
      <a href="${appendDebugToken('/debug/kapso', debugToken)}">Kapso</a>
      <a href="${appendDebugToken('/debug/canales', debugToken)}">Todos los canales</a>
      <a href="${appendDebugToken('/debug/ghl', debugToken)}">GHL</a>
      <a href="${appendDebugToken('/debug/kapso/visual', debugToken)}">Ver visual</a>
    </div>
  </div>

  <div class="stats">
    <div class="card"><div class="label">Total</div><div class="value">${interactions.length}</div></div>
    <div class="card"><div class="label">OK</div><div class="value">${okCount}</div></div>
    <div class="card"><div class="label">Errores</div><div class="value">${errorCount}</div></div>
    <div class="card"><div class="label">Tiempo AVG</div><div class="value">${avgDuration != null ? (avgDuration/1000).toFixed(1)+' s' : '—'}</div></div>
  </div>

  <div class="section">
    <table>
      <thead><tr>
        <th>Hora</th><th>Subscriber ID</th><th>Canal</th><th>Tipo</th><th>Mensaje</th>
        <th>Agente</th><th>Modelo</th><th style="min-width:60px">Total</th><th>Status</th><th>Detalle</th>
      </tr></thead>
      <tbody id="mc-tbody">${interactionRows}</tbody>
    </table>
  </div>

  <div id="mc-interaction-details">${interactionDetails}</div>

  <details class="section">
    <summary>FastAPI Config</summary>
    <pre id="mc-fastapi-config">${escapeHtml(JSON.stringify(config, null, 2))}</pre>
  </details>

<script>
function canalToggleMore(a){
  var s=a.previousElementSibling;
  if(!s) return false;
  s.style.display=s.style.display?'':'inline';
  a.textContent=s.style.display?'ver menos':'ver más...';
  return false;
}
(function(){
  const DEBUG_TOKEN = new URLSearchParams(window.location.search).get('token') || ${JSON.stringify(debugToken || '')};
  function debugPath(path){
    if(!DEBUG_TOKEN)return path;
    var u=new URL(path,window.location.origin);
    u.searchParams.set('token',DEBUG_TOKEN);
    return u.pathname+u.search;
  }
  function fetchDebug(path){ return fetch(debugPath(path)); }

  const FALLBACK_POLL_MS = 30000;
  let autoRefresh = true;
  let timer = null;
  let sseSource = null;
  let debounceTimer = null;
  let empresasMap = {};

  function loadEmpresasMap(){
    fetch(debugPath('/debug/kapso/empresas'))
      .then(function(r){ return r.json(); })
      .then(function(data){ (data.empresas||[]).forEach(function(e){ empresasMap[e.id]=e.nombre; }); })
      .catch(function(){});
  }

  function esc(v){ return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function fms(v){ return v!=null?(v/1000).toFixed(1)+' s':'—'; }
  function tcls(ms){ if(ms==null)return ''; if(ms<20000)return 'color:#34d399'; if(ms<30000)return 'color:#f97316'; return 'color:#f87171'; }

  function renderRow(item, idx){
    var totalMs = item.duration_ms!=null ? item.duration_ms : (item.timing&&item.timing.total_ms!=null?Math.round(item.timing.total_ms):null);
    return '<tr>'
      +'<td>'+esc(item.started_at?new Date(item.started_at).toLocaleString():'—')+'</td>'
      +'<td>'+(item.contacto_id!=null?String(item.contacto_id):esc(item.from_phone||'—'))+'</td>'
      +'<td>'+esc(item.canal||'instagram')+'</td>'
      +'<td>'+esc(item.message_type||'text')+'</td>'
      +(function(){ var txt=item.message_text||'—'; if(txt.length<=200) return '<td style="max-width:280px;word-break:break-word">'+esc(txt)+'</td>'; return '<td style="max-width:280px;word-break:break-word">'+esc(txt.slice(0,200))+'<span class="msg-more" style="display:none">'+esc(txt.slice(200))+'</span> <a href="#" onclick="return canalToggleMore(this)" style="color:#93c5fd;font-size:11px">ver más...</a></td>'; })()
      +'<td>'+(item.agent_name?esc(item.agent_name)+(item.empresa_id&&empresasMap[item.empresa_id]?'<div style="font-size:10px;color:#94a3b8;margin-top:2px">'+esc(empresasMap[item.empresa_id])+'</div>':''):'—')+'</td>'
      +'<td>'+esc(item.model_used||'—')+'</td>'
      +'<td style="'+tcls(totalMs)+'"><b>'+fms(totalMs)+'</b></td>'
      +'<td>'+esc(item.status||'processing')+'</td>'
      +'<td><a href="#mc-interaction-'+idx+'" style="color:#93c5fd">Ver detalle</a></td>'
      +'</tr>';
  }

  function renderDetail(item, idx){
    return '<details class="section" id="mc-interaction-'+idx+'">'
      +'<summary>'+esc(item.from_phone||'Interacción '+(idx+1))+' · '+esc(item.status||'processing')+' · '+fms(item.duration_ms)+'</summary>'
      +'<div style="margin-top:12px">'
      +'<div style="margin-bottom:8px"><strong>Contacto ID:</strong> '+(item.contacto_id!=null?String(item.contacto_id):esc(item.from_phone||'—'))+'</div>'
      +'<div style="margin-bottom:8px"><strong>Subscriber ID:</strong> '+esc(item.from_phone||'—')+'</div>'
      +'<div style="margin-bottom:8px"><strong>Canal:</strong> '+esc(item.canal||'—')+'</div>'
      +'<div style="margin-bottom:8px"><strong>Empresa ID:</strong> '+esc(String(item.empresa_id||'—'))+'</div>'
      +'<div style="margin:12px 0 6px"><strong>Error agente</strong></div><pre>'+esc(item.error||'—')+'</pre>'
      +'<div style="margin:12px 0 6px"><strong>Error envío ManyChat</strong></div><pre style="'+(item.send_error?'color:#f87171':'')+'">'+esc(item.send_error||'—')+'</pre>'
      +'<div style="margin-bottom:8px"><strong>Mensaje:</strong></div><pre>'+esc(item.message_text||'—')+'</pre>'
      +'<div style="margin:12px 0 6px"><strong>Respuesta</strong></div><pre>'+esc(item.response_preview||'—')+'</pre>'
      +'</div></details>';
  }

  function update(data){
    var items = Array.isArray(data.interactions) ? data.interactions : [];
    var ok = items.filter(function(i){ return i.status==='ok'; }).length;
    var err = items.filter(function(i){ return i.status==='error'; }).length;
    var wt = items.filter(function(i){ return i.duration_ms!=null||(i.timing&&i.timing.total_ms!=null); });
    var avg = wt.length ? Math.round(wt.reduce(function(a,i){ return a+(i.duration_ms||i.timing&&i.timing.total_ms||0); },0)/wt.length) : null;

    var cards = document.querySelectorAll('.card .value');
    if(cards[0]) cards[0].textContent = items.length;
    if(cards[1]) cards[1].textContent = ok;
    if(cards[2]) cards[2].textContent = err;
    if(cards[3]) cards[3].textContent = avg!=null?(avg/1000).toFixed(1)+' s':'—';

    var tbody = document.getElementById('mc-tbody');
    if(tbody) tbody.innerHTML = items.length ? items.map(renderRow).join('') : '<tr><td colspan="10" style="padding:20px;color:#94a3b8">Sin interacciones todavía.</td></tr>';

    var detailsContainer = document.getElementById('mc-interaction-details');
    if(detailsContainer){
      var openSet = new Set();
      detailsContainer.querySelectorAll('details[open][id]').forEach(function(d){ openSet.add(d.id); });
      detailsContainer.innerHTML = items.map(renderDetail).join('');
      openSet.forEach(function(id){ var el=document.getElementById(id); if(el) el.setAttribute('open',''); });
    }

    var cfgPre = document.getElementById('mc-fastapi-config');
    if(cfgPre) cfgPre.textContent = JSON.stringify(data.fastapi_config||{},null,2);

    var ts = document.getElementById('last-update');
    if(ts) ts.textContent = 'Última actualización: '+new Date().toLocaleTimeString();
  }

  function poll(){
    var scrollY = window.scrollY;
    fetchDebug('/debug/manychat/data').then(function(r){ return r.json(); }).then(function(data){
      update(data);
      requestAnimationFrame(function(){ window.scrollTo(0,scrollY); });
    }).catch(function(e){ console.warn('mc poll error',e); });
  }

  function setLiveStatus(live){
    var el=document.getElementById('sse-status');
    if(!el) return;
    if(live){ el.textContent='🟢 En vivo'; el.style.color='#4ade80'; }
    else { el.textContent='🟡 Polling'; el.style.color='#fbbf24'; }
  }
  function startFallbackPolling(){
    if(!timer && autoRefresh) timer=setInterval(poll, FALLBACK_POLL_MS);
  }
  function stopFallbackPolling(){
    if(timer){ clearInterval(timer); timer=null; }
  }
  function connectSSE(){
    if(sseSource){ try{ sseSource.close(); }catch(e){} sseSource=null; }
    sseSource = new EventSource(debugPath('/debug/kapso/stream'));
    sseSource.onopen = function(){ setLiveStatus(true); stopFallbackPolling(); };
    sseSource.onmessage = function(){
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(poll, 300);
    };
    sseSource.onerror = function(){
      setLiveStatus(false);
      if(sseSource){ try{ sseSource.close(); }catch(e){} sseSource=null; }
      startFallbackPolling();
      if(autoRefresh) setTimeout(connectSSE, 5000);
    };
  }

  function toggleAuto(){
    autoRefresh = !autoRefresh;
    var btn = document.getElementById('toggle-auto');
    if(autoRefresh){
      btn.textContent='⏸ Pausar'; btn.style.background='#16a34a';
      connectSSE();
    } else {
      btn.textContent='▶ Reanudar'; btn.style.background='#dc2626';
      if(sseSource){ try{ sseSource.close(); }catch(e){} sseSource=null; }
      stopFallbackPolling();
      setLiveStatus(false);
    }
  }

  document.getElementById('toggle-auto').addEventListener('click', toggleAuto);
  loadEmpresasMap();
  poll();
  connectSSE();
  // Fallback: if onopen never fires (buffering proxy), check readyState after 3s
  setTimeout(function(){
    if(sseSource && sseSource.readyState === 1) setLiveStatus(true);
  }, 3000);
})();
</script>
</body></html>`;
}

app.get('/debug/manychat', async (req, res) => {
  if (!requireDebugAccess(req, res)) return;
  try {
    const data = await collectManyChatDebugPayload();
    res.set('Cache-Control', 'no-store, max-age=0');
    res.status(200).type('html').send(renderManyChatHtml(data, extractAccessToken(req)));
  } catch (err) {
    res.status(500).type('html').send(`<pre>${escapeHtml(String(err))}</pre>`);
  }
});

app.get('/debug/manychat/data', async (req, res) => {
  if (!requireDebugAccess(req, res)) return;
  try {
    const data = await collectManyChatDebugPayload();
    res.set('Cache-Control', 'no-store, max-age=0');
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});


// ── GHL debug panel ───────────────────────────────────────────────────────────

function renderGHLHtml(data, debugToken = '') {
  const interactions = Array.isArray(data.interactions) ? data.interactions : [];
  const config = data.fastapi_config || {};

  const okCount = interactions.filter(i => i.status === 'ok').length;
  const errorCount = interactions.filter(i => i.status === 'error' || i.dropped).length;
  const withTiming = interactions.filter(i => i.duration_ms != null);
  const avgDuration = withTiming.length
    ? Math.round(withTiming.reduce((acc, i) => acc + (i.duration_ms || 0), 0) / withTiming.length)
    : null;

  const interactionRows = interactions.length
    ? interactions.map((item, idx) => {
        const canalBadge = (item.canal || 'instagram').toLowerCase() === 'facebook'
          ? '<span style="background:#ea580c;color:#fff;border-radius:4px;padding:1px 6px;font-size:10px">GHL·FB</span>'
          : '<span style="background:#f97316;color:#fff;border-radius:4px;padding:1px 6px;font-size:10px">GHL·IG</span>';
        const tcls = item.duration_ms == null ? '' : item.duration_ms < 20000 ? 'color:#34d399' : item.duration_ms < 30000 ? 'color:#f97316' : 'color:#f87171';
        const txt = item.message_text || '—';
        const msgCell = txt.length <= 200 ? escapeHtml(txt)
          : `${escapeHtml(txt.slice(0,200))}<span class="msg-more" style="display:none">${escapeHtml(txt.slice(200))}</span> <a href="#" onclick="var s=this.previousElementSibling;s.style.display=s.style.display==='none'?'':'none';this.textContent=s.style.display===''?'ver menos':'ver más...';return false;" style="color:#93c5fd;font-size:11px">ver más...</a>`;
        const droppedBadge = item.dropped ? ' <span style="background:#dc2626;color:#fff;border-radius:4px;padding:1px 5px;font-size:10px">⛔ rechazado</span>' : '';
        return `<tr${item.dropped ? ' style="background:#1a0a0a"' : ''}>
          <td>${escapeHtml(item.started_at ? new Date(item.started_at).toLocaleString() : '—')}</td>
          <td>${canalBadge}</td>
          <td>${escapeHtml(item.contact_name || '—')}</td>
          <td>${item.contacto_id != null ? String(item.contacto_id) : escapeHtml(item.from_phone || '—')}</td>
          <td style="max-width:280px;word-break:break-word">${msgCell}</td>
          <td data-empresa-id="${item.empresa_id || ''}">${escapeHtml(item.agent_name || '—')}</td>
          <td>${escapeHtml(item.model_used || '—')}</td>
          <td style="${tcls}"><b>${item.duration_ms != null ? (item.duration_ms/1000).toFixed(1)+' s' : '—'}</b></td>
          <td>${escapeHtml(item.status || 'processing')}${droppedBadge}</td>
          <td><a href="#ghl-interaction-${idx}" style="color:#93c5fd">Ver detalle</a></td>
        </tr>`;
      }).join('')
    : '<tr><td colspan="10" style="padding:20px;color:#94a3b8">Sin interacciones todavía.</td></tr>';

  const interactionDetails = interactions.map((item, idx) => `
    <details class="section" id="ghl-interaction-${idx}">
      <summary>${escapeHtml(item.from_phone || item.contact_name || 'Interacción '+(idx+1))} · ${escapeHtml(item.status || 'processing')} · ${item.duration_ms != null ? (item.duration_ms/1000).toFixed(1)+' s' : '—'}</summary>
      <div style="margin-top:12px">
        <div style="margin-bottom:8px"><strong>Contact ID (GHL):</strong> ${escapeHtml(item.from_phone || '—')}</div>
        <div style="margin-bottom:8px"><strong>Nombre:</strong> ${escapeHtml(item.contact_name || '—')}</div>
        <div style="margin-bottom:8px"><strong>Canal:</strong> ${escapeHtml(item.canal || '—')}</div>
        <div style="margin-bottom:8px"><strong>Empresa ID:</strong> ${escapeHtml(String(item.empresa_id || '—'))}</div>
        <div style="margin:12px 0 6px"><strong>Error envío GHL</strong></div>
        <pre style="${item.send_error ? 'color:#f87171' : ''}">${escapeHtml(item.send_error || '—')}</pre>
        <div style="margin-bottom:8px"><strong>Mensaje:</strong></div>
        <pre>${escapeHtml(item.message_text || '—')}</pre>
        <div style="margin:12px 0 6px"><strong>Respuesta</strong></div>
        <pre>${escapeHtml(item.response_preview || '—')}</pre>
      </div>
    </details>`).join('');

  return `<!doctype html><html lang="es"><head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>GHL Debug</title>
  <style>
    body{font-family:Arial,sans-serif;background:#0f172a;color:#e2e8f0;margin:0;padding:16px}
    .top{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px}
    .title{font-size:20px;font-weight:700}
    .actions a,.actions button{color:#93c5fd;text-decoration:none;margin-left:12px;background:none;border:none;cursor:pointer;font-size:14px}
    .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin-bottom:16px}
    .card{background:#1e293b;border:1px solid #334155;border-radius:10px;padding:12px}
    .label{font-size:11px;color:#94a3b8;text-transform:uppercase}
    .value{font-size:22px;font-weight:700;margin-top:6px}
    table{width:100%;border-collapse:collapse;background:#111827;border:1px solid #334155}
    th,td{padding:10px;border-bottom:1px solid #334155;text-align:left;vertical-align:top;font-size:12px}
    th{background:#1e293b;color:#f97316}
    .section{margin-top:18px}
    details{margin-top:12px;background:#111827;border:1px solid #334155;border-radius:8px;padding:12px}
    summary{cursor:pointer;font-weight:700}
    pre{white-space:pre-wrap;word-break:break-word;color:#cbd5e1;font-size:12px}
  </style>
</head><body>
  <div class="top">
    <div class="title">GHL — Instagram / Facebook Debug</div>
    <div class="actions">
      <span id="last-update" style="color:#94a3b8;font-size:11px"></span>
      <span id="sse-status" style="color:#fbbf24;font-size:11px;margin-left:8px">🟡 Conectando...</span>
      <button id="toggle-auto" style="background:#16a34a;color:#fff;border:none;padding:4px 12px;border-radius:6px;cursor:pointer;font-size:12px">⏸ Pausar</button>
      <a href="${appendDebugToken('/debug/kapso', debugToken)}">Kapso</a>
      <a href="${appendDebugToken('/debug/manychat', debugToken)}">ManyChat</a>
      <a href="${appendDebugToken('/debug/canales', debugToken)}">Todos los canales</a>
      <a href="${appendDebugToken('/debug/kapso/visual', debugToken)}">Ver visual</a>
    </div>
  </div>

  <div class="stats">
    <div class="card"><div class="label">Total</div><div class="value">${interactions.length}</div></div>
    <div class="card"><div class="label">OK</div><div class="value">${okCount}</div></div>
    <div class="card"><div class="label">Errores/Rechazados</div><div class="value">${errorCount}</div></div>
    <div class="card"><div class="label">Tiempo AVG</div><div class="value">${avgDuration != null ? (avgDuration/1000).toFixed(1)+' s' : '—'}</div></div>
  </div>

  <div class="section">
    <table>
      <thead><tr>
        <th>Hora</th><th>Canal</th><th>Contacto</th><th>Contact ID</th><th>Mensaje</th>
        <th>Agente</th><th>Modelo</th><th style="min-width:60px">Total</th><th>Status</th><th>Detalle</th>
      </tr></thead>
      <tbody>${interactionRows}</tbody>
    </table>
  </div>

  <div id="ghl-interaction-details">${interactionDetails}</div>

  <details class="section">
    <summary>FastAPI Config</summary>
    <pre>${escapeHtml(JSON.stringify(config, null, 2))}</pre>
  </details>

<script>
(function(){
  const DEBUG_TOKEN = new URLSearchParams(window.location.search).get('token') || ${JSON.stringify(debugToken || '')};
  function debugPath(path){
    if(!DEBUG_TOKEN) return path;
    var u = new URL(path, window.location.origin);
    u.searchParams.set('token', DEBUG_TOKEN);
    return u.pathname + u.search;
  }

  let autoRefresh = true;
  let timer = null;
  let sseSource = null;
  let debounceTimer = null;

  function setLiveStatus(live){
    var el = document.getElementById('sse-status');
    if(!el) return;
    if(live){ el.textContent='🟢 En vivo'; el.style.color='#4ade80'; }
    else { el.textContent='🟡 Polling'; el.style.color='#fbbf24'; }
  }

  function updateLastTs(){
    var el = document.getElementById('last-update');
    if(el) el.textContent = 'Última actualización: ' + new Date().toLocaleTimeString();
  }

  function poll(){
    window.location.reload();
  }

  function startFallbackPolling(){
    if(!timer && autoRefresh) timer = setInterval(poll, 30000);
  }
  function stopFallbackPolling(){
    if(timer){ clearInterval(timer); timer = null; }
  }

  function connectSSE(){
    if(sseSource){ try{ sseSource.close(); }catch(e){} sseSource = null; }
    sseSource = new EventSource(debugPath('/debug/kapso/stream'));
    sseSource.onopen = function(){ setLiveStatus(true); stopFallbackPolling(); };
    sseSource.onmessage = function(){
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function(){ if(autoRefresh) window.location.reload(); }, 2000);
    };
    sseSource.onerror = function(){
      setLiveStatus(false);
      if(sseSource){ try{ sseSource.close(); }catch(e){} sseSource = null; }
      startFallbackPolling();
      if(autoRefresh) setTimeout(connectSSE, 5000);
    };
  }

  function toggleAuto(){
    autoRefresh = !autoRefresh;
    var btn = document.getElementById('toggle-auto');
    if(autoRefresh){
      btn.textContent = '⏸ Pausar'; btn.style.background = '#16a34a';
      connectSSE();
    } else {
      btn.textContent = '▶ Reanudar'; btn.style.background = '#dc2626';
      if(sseSource){ try{ sseSource.close(); }catch(e){} sseSource = null; }
      stopFallbackPolling();
      setLiveStatus(false);
    }
  }

  var toggleBtn = document.getElementById('toggle-auto');
  if(toggleBtn) toggleBtn.addEventListener('click', toggleAuto);

  // Load empresa names and apply sub-labels to agent cells
  fetch(debugPath('/debug/kapso/empresas'))
    .then(function(r){ return r.json(); })
    .then(function(data){
      var map = {};
      (data.empresas||[]).forEach(function(e){ map[e.id] = e.nombre; });
      document.querySelectorAll('[data-empresa-id]').forEach(function(td){
        var eid = td.getAttribute('data-empresa-id');
        if(eid && map[eid]){
          var div = document.createElement('div');
          div.style.cssText = 'font-size:10px;color:#94a3b8;margin-top:2px';
          div.textContent = map[eid];
          td.appendChild(div);
        }
      });
    })
    .catch(function(){});

  updateLastTs();
  connectSSE();
  setTimeout(function(){
    if(sseSource && sseSource.readyState === 1) setLiveStatus(true);
  }, 3000);
})();
</script>
</body></html>`;
}

app.get('/debug/ghl', async (req, res) => {
  if (!requireDebugAccess(req, res)) return;
  try {
    const data = await collectGHLDebugPayload();
    res.set('Cache-Control', 'no-store, max-age=0');
    res.status(200).type('html').send(renderGHLHtml(data, extractAccessToken(req)));
  } catch (err) {
    res.status(500).type('html').send(`<pre>${escapeHtml(String(err))}</pre>`);
  }
});

app.get('/debug/ghl/data', async (req, res) => {
  if (!requireDebugAccess(req, res)) return;
  try {
    const data = await collectGHLDebugPayload();
    res.set('Cache-Control', 'no-store, max-age=0');
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});


// ── Unified all-channels debug panel ─────────────────────────────────────────

async function collectCanalesDebugPayload(page = 1, limit = 20, channel = '', empresa_id = 0, days = 30) {
  const params = new URLSearchParams({ page, limit, days });
  if (channel) params.set('channel', channel);
  if (empresa_id) params.set('empresa_id', empresa_id);
  const data = await fetchFastApiDebugJson(`/api/v1/debug/interactions?${params.toString()}`);
  return data;
}

function renderCanalesHtml(debugToken = '') {
  return `<!doctype html><html lang="es"><head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Debug — Todos los canales</title>
  <style>
    body{font-family:Arial,sans-serif;background:#0f172a;color:#e2e8f0;margin:0;padding:16px}
    .top{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap}
    .title{font-size:20px;font-weight:700}
    .actions a,.actions button{color:#93c5fd;text-decoration:none;margin-left:12px;background:none;border:none;cursor:pointer;font-size:14px}
    .filters{display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;align-items:center}
    .filters select,.filters input{background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius:6px;padding:5px 10px;font-size:13px}
    .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin-bottom:16px}
    .card{background:#1e293b;border:1px solid #334155;border-radius:10px;padding:12px}
    .label{font-size:11px;color:#94a3b8;text-transform:uppercase}
    .value{font-size:22px;font-weight:700;margin-top:6px}
    table{width:100%;border-collapse:collapse;background:#111827;border:1px solid #334155}
    th,td{padding:10px;border-bottom:1px solid #334155;text-align:left;vertical-align:top;font-size:12px}
    th{background:#1e293b;color:#93c5fd}
    .section{margin-top:18px}
    details{margin-top:12px;background:#111827;border:1px solid #334155;border-radius:8px;padding:12px}
    summary{cursor:pointer;font-weight:700}
    pre{white-space:pre-wrap;word-break:break-word;color:#cbd5e1;font-size:12px}
    .pagination{display:flex;align-items:center;gap:10px;margin-top:14px;flex-wrap:wrap}
    .pagination button{background:#1e293b;color:#93c5fd;border:1px solid #334155;border-radius:6px;padding:5px 14px;cursor:pointer;font-size:13px}
    .pagination button:disabled{opacity:.4;cursor:not-allowed}
    .pagination .page-info{color:#94a3b8;font-size:12px}
    .by-channel{display:flex;gap:8px;flex-wrap:wrap;margin-top:4px}
    .ch-badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600}
    .ch-wa{background:#16a34a;color:#fff}
    .ch-ig{background:#7c3aed;color:#fff}
    .ch-fb{background:#1d4ed8;color:#fff}
    .ch-ghl_ig{background:#f97316;color:#fff}
    .ch-ghl_fb{background:#ea580c;color:#fff}
    .ch-other{background:#475569;color:#fff}
    .loading{text-align:center;padding:32px;color:#94a3b8}
    .pulse{animation:pulse 1.5s ease-in-out infinite}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
  </style>
</head><body>
  <div class="top">
    <div class="title">Todos los canales</div>
    <div class="actions">
      <span id="last-update" style="color:#94a3b8;font-size:11px"></span>
      <span id="sse-status" style="color:#fbbf24;font-size:11px;margin-left:8px">🟡 Conectando...</span>
      <button onclick="loadData(true)">⟳ Refrescar</button>
      <a href="${appendDebugToken('/debug/kapso', debugToken)}">Kapso</a>
      <a href="${appendDebugToken('/debug/manychat', debugToken)}">ManyChat</a>
      <a href="${appendDebugToken('/debug/ghl', debugToken)}">GHL</a>
      <a href="${appendDebugToken('/debug/kapso/visual', debugToken)}">Ver visual</a>
    </div>
  </div>

  <div class="filters">
    <label style="color:#94a3b8;font-size:12px">Canal:
      <select id="filterChannel" onchange="resetAndLoad()">
        <option value="">Todos</option>
        <option value="whatsapp">WhatsApp</option>
        <option value="ghl_instagram">Instagram</option>
        <option value="ghl_facebook">Facebook</option>
      </select>
    </label>
    <label style="color:#94a3b8;font-size:12px">Días:
      <select id="filterDays" onchange="resetAndLoad()">
        <option value="7">7 días</option>
        <option value="30" selected>30 días</option>
        <option value="90">90 días</option>
      </select>
    </label>
    <label style="color:#94a3b8;font-size:12px">Por página:
      <select id="filterLimit" onchange="resetAndLoad()">
        <option value="20" selected>20</option>
        <option value="50">50</option>
        <option value="100">100</option>
      </select>
    </label>
  </div>

  <div class="stats" id="statsGrid">
    <div class="card"><div class="label">Total</div><div class="value" id="statTotal">—</div></div>
    <div class="card"><div class="label">OK</div><div class="value" style="color:#4ade80" id="statOk">—</div></div>
    <div class="card"><div class="label">Errores</div><div class="value" style="color:#f87171" id="statErrors">—</div></div>
    <div class="card"><div class="label">Tiempo AVG</div><div class="value" id="statAvg">—</div></div>
    <div class="card"><div class="label">Por canal</div><div id="statByChannel" class="by-channel" style="margin-top:8px"></div></div>
  </div>

  <div class="section">
    <table>
      <thead><tr>
        <th>Hora</th><th>Canal</th><th>Contacto</th><th>ID</th><th>Tipo</th><th>Mensaje</th>
        <th>Agente</th><th>Modelo</th><th style="min-width:60px">Total</th><th>Status</th><th>Detalle</th>
      </tr></thead>
      <tbody id="canal-tbody"><tr><td colspan="11" class="loading pulse">Cargando desde Supabase...</td></tr></tbody>
    </table>
  </div>

  <div class="pagination">
    <button id="btnPrev" onclick="changePage(-1)" disabled>← Anterior</button>
    <span class="page-info" id="pageInfo">Página — / —</span>
    <button id="btnNext" onclick="changePage(1)" disabled>Siguiente →</button>
  </div>

  <div id="canal-interaction-details"></div>

<script>
(function(){
  const DEBUG_TOKEN = new URLSearchParams(window.location.search).get('token') || ${JSON.stringify(debugToken || '')};
  function debugPath(path){
    if(!DEBUG_TOKEN) return path;
    var u = new URL(path, window.location.origin);
    u.searchParams.set('token', DEBUG_TOKEN);
    return u.pathname + u.search;
  }

  let currentPage = 1;
  let totalPages = 1;
  let sseSource = null;
  let debounceTimer = null;
  let autoRefreshTimer = null;
  let allInteractionsMap = new Map(); // message_id → item (cache client-side)
  let lastIncrementalTs = null;       // timestamp del último incremental
  let empresasMap = {};               // id → nombre de empresa

  function loadEmpresasMap(){
    fetch(debugPath('/debug/kapso/empresas'))
      .then(function(r){ return r.json(); })
      .then(function(data){
        (data.empresas || []).forEach(function(e){ empresasMap[e.id] = e.nombre; });
      })
      .catch(function(){});
  }

  function esc(v){ return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function fms(v){ return v!=null?(v/1000).toFixed(1)+' s':'—'; }
  function tcls(ms){ if(ms==null)return ''; if(ms<20000)return 'color:#34d399'; if(ms<30000)return 'color:#f97316'; return 'color:#f87171'; }
  function _toggleMore(el){ var s=el.previousElementSibling; s.style.display=s.style.display?'':' inline'; el.textContent=s.style.display?'ver menos':'ver más...'; return false; }
  function _openDetail(el){ var id=el.getAttribute('href').slice(1); var d=document.getElementById(id); if(d) d.setAttribute('open',''); return false; }

  function canalBadge(canal){
    if(canal==='whatsapp') return '<span class="ch-badge ch-wa">WA</span>';
    if(canal==='ghl_instagram'||canal==='instagram') return '<span class="ch-badge ch-ghl_ig">IG</span>';
    if(canal==='ghl_facebook'||canal==='facebook') return '<span class="ch-badge ch-ghl_fb">FB</span>';
    return '<span class="ch-badge ch-other">'+esc(canal||'?')+'</span>';
  }

  function renderRow(item, idx){
    var canal = item.channel || '?';
    var totalMs = item.duration_ms != null ? item.duration_ms : null;
    var txt = item.message_text || '—';
    var msgCell = txt.length <= 200
      ? '<td style="max-width:280px;word-break:break-word">'+esc(txt)+'</td>'
      : '<td style="max-width:280px;word-break:break-word">'+esc(txt.slice(0,200))+'<span style="display:none">'+esc(txt.slice(200))+'</span> <a href="#" onclick="return _toggleMore(this)" style="color:#93c5fd;font-size:11px">ver más...</a></td>';
    return '<tr>'
      +'<td>'+esc(item.started_at ? new Date(item.started_at).toLocaleString() : '—')+'</td>'
      +'<td>'+canalBadge(canal)+'</td>'
      +'<td>'+esc(item.contact_name||item.from_phone||'—')+'</td>'
      +'<td>'+(item.contacto_id!=null?String(item.contacto_id):esc(item.from_phone||'—'))+'</td>'
      +'<td>'+esc(item.message_type||'text')+'</td>'
      +msgCell
      +'<td>'+(item.agent_name ? esc(item.agent_name)+(item.empresa_id && empresasMap[item.empresa_id] ? '<div style="font-size:10px;color:#94a3b8;margin-top:2px">'+esc(empresasMap[item.empresa_id])+'</div>' : '') : '—')+'</td>'
      +'<td>'+esc(item.model_used||'—')+'</td>'
      +'<td style="'+tcls(totalMs)+'"><b>'+fms(totalMs)+'</b></td>'
      +'<td>'+esc(item.status||'processing')+'</td>'
      +'<td><a href="#canal-interaction-'+idx+'" style="color:#93c5fd" onclick="return _openDetail(this)">Ver</a></td>'
      +'</tr>';
  }

  function renderDetail(item, idx){
    var canal = item.channel || '?';
    return '<details class="section" id="canal-interaction-'+idx+'">'
      +'<summary>'+esc(item.contact_name||item.from_phone||'Interacción '+(idx+1))+' · '+esc(canal)+' · '+esc(item.status||'processing')+' · '+fms(item.duration_ms)+'</summary>'
      +'<div style="margin-top:12px">'
      +'<div style="margin-bottom:8px"><strong>Message ID:</strong> '+esc(item.message_id||'—')+'</div>'
      +'<div style="margin-bottom:8px"><strong>Canal:</strong> '+esc(canal)+'</div>'
      +'<div style="margin-bottom:8px"><strong>Teléfono:</strong> '+esc(item.from_phone||'—')+'</div>'
      +'<div style="margin-bottom:8px"><strong>Empresa ID:</strong> '+esc(String(item.empresa_id||'—'))+'</div>'
      +'<div style="margin-bottom:8px"><strong>Contacto ID:</strong> '+esc(String(item.contacto_id||'—'))+'</div>'
      +'<div style="margin-bottom:8px"><strong>Agente:</strong> '+esc(item.agent_name||'—')+'</div>'
      +'<div style="margin-bottom:8px"><strong>Modelo:</strong> '+esc(item.model_used||'—')+'</div>'
      +'<div style="margin-bottom:8px"><strong>Stages:</strong> '+esc((item.stages||[]).join(' → '))+'</div>'
      +'<div style="margin:12px 0 6px"><strong>Error</strong></div><pre>'+esc(item.error||'—')+'</pre>'
      +'<div style="margin-bottom:8px"><strong>Mensaje:</strong></div><pre>'+esc(item.message_text||'—')+'</pre>'
      +'<div style="margin:12px 0 6px"><strong>Respuesta</strong></div><pre>'+esc(item.response_preview||'—')+'</pre>'
      +'</div></details>';
  }

  function buildDataUrl(page){
    var channel = document.getElementById('filterChannel').value;
    var days = document.getElementById('filterDays').value;
    var limit = document.getElementById('filterLimit').value;
    var params = new URLSearchParams({ page, limit, days });
    if(channel) params.set('channel', channel);
    var path = '/debug/canales/data?' + params.toString();
    return debugPath(path);
  }

  function renderStats(stats, totalOverride){
    var t = totalOverride != null ? totalOverride : (stats.total ?? 0);
    document.getElementById('statTotal').textContent = t;
    document.getElementById('statOk').textContent = stats.ok ?? '—';
    document.getElementById('statErrors').textContent = stats.errors ?? '—';
    document.getElementById('statAvg').textContent = stats.avg_ms != null ? fms(stats.avg_ms) : '—';
    var byChannel = stats.by_channel || {};
    var byCh = document.getElementById('statByChannel');
    byCh.innerHTML = Object.entries(byChannel).map(function(kv){
      return canalBadge(kv[0])+'<span style="margin-left:3px;font-size:12px">'+esc(kv[1])+'</span>';
    }).join(' ');
  }

  function renderTable(items){
    var tbody = document.getElementById('canal-tbody');
    tbody.innerHTML = items.length
      ? items.map(renderRow).join('')
      : '<tr><td colspan="11" style="padding:20px;color:#94a3b8">Sin interacciones para este filtro.</td></tr>';
    var detailsContainer = document.getElementById('canal-interaction-details');
    var openSet = new Set();
    detailsContainer.querySelectorAll('details[open][id]').forEach(function(d){ openSet.add(d.id); });
    detailsContainer.innerHTML = items.map(renderDetail).join('');
    openSet.forEach(function(id){ var el=document.getElementById(id); if(el) el.setAttribute('open',''); });
  }

  // ── Carga completa (manual refresh / cambio de filtros / paginación) ────────
  window.loadData = function(resetPage){
    if(resetPage){ currentPage = 1; allInteractionsMap.clear(); lastIncrementalTs = null; }
    var scrollY = window.scrollY;
    var tbody = document.getElementById('canal-tbody');
    tbody.innerHTML = '<tr><td colspan="11" class="loading pulse">Cargando...</td></tr>';

    fetch(buildDataUrl(currentPage))
      .then(function(r){ return r.json(); })
      .then(function(data){
        var items = Array.isArray(data.interactions) ? data.interactions : [];
        // Poblar cache con la página actual
        items.forEach(function(i){ if(i.message_id) allInteractionsMap.set(i.message_id, i); });
        // Guardar timestamp del más reciente para futuros incrementales
        if(items.length) lastIncrementalTs = items[0].started_at || null;

        var stats = data.stats || {};
        renderStats(stats);
        totalPages = data.pages || 1;
        currentPage = data.page || currentPage;
        document.getElementById('pageInfo').textContent = 'Página '+currentPage+' / '+totalPages+' ('+(stats.total||0)+' total)';
        document.getElementById('btnPrev').disabled = currentPage <= 1;
        document.getElementById('btnNext').disabled = currentPage >= totalPages;
        renderTable(items);
        document.getElementById('last-update').textContent = 'Actualizado: '+new Date().toLocaleTimeString();
        requestAnimationFrame(function(){ window.scrollTo(0, scrollY); });
      })
      .catch(function(e){
        console.warn('canales load error', e);
        document.getElementById('canal-tbody').innerHTML = '<tr><td colspan="11" style="padding:20px;color:#fca5a5">Error cargando datos: '+esc(e.message)+'</td></tr>';
      });
  };

  // ── Carga incremental — solo eventos desde lastIncrementalTs (SSE trigger) ──
  function loadIncremental(){
    // Usar ventana de 3 min atrás para capturar stages tardíos del mismo mensaje
    var since = new Date(Date.now() - 180000).toISOString();
    var params = new URLSearchParams({ since: since });
    var channel = document.getElementById('filterChannel').value;
    if(channel) params.set('channel', channel);
    fetch(debugPath('/debug/canales/data?' + params.toString()))
      .then(function(r){ return r.json(); })
      .then(function(data){
        var items = Array.isArray(data.interactions) ? data.interactions : [];
        if(!items.length) return;

        var changed = false;
        items.forEach(function(item){
          if(!item.message_id) return;
          var existing = allInteractionsMap.get(item.message_id);
          // Actualizar si es nuevo o si cambió el status
          if(!existing || existing.status !== item.status || existing.agent_name !== item.agent_name){
            allInteractionsMap.set(item.message_id, item);
            changed = true;
          }
        });

        if(!changed) return;

        // Re-renderizar solo si estamos en página 1
        if(currentPage !== 1) return;
        var sorted = Array.from(allInteractionsMap.values())
          .sort(function(a,b){ return (b.started_at||'').localeCompare(a.started_at||''); });

        // Recalcular stats desde el mapa completo
        var ok = 0, err = 0, durs = [];
        var byCh = {};
        sorted.forEach(function(i){
          if(i.status==='ok') ok++;
          else if(i.status==='error') err++;
          if(i.duration_ms!=null) durs.push(i.duration_ms);
          var ch = i.channel||'whatsapp';
          byCh[ch] = (byCh[ch]||0)+1;
        });
        var avg = durs.length ? Math.round(durs.reduce(function(a,b){return a+b;},0)/durs.length) : null;
        renderStats({ ok: ok, errors: err, avg_ms: avg, by_channel: byCh }, sorted.length);

        var pageItems = sorted.slice(0, +document.getElementById('filterLimit').value || 20);
        renderTable(pageItems);
        document.getElementById('last-update').textContent = 'Actualizado: '+new Date().toLocaleTimeString();
        lastIncrementalTs = items[0].started_at || lastIncrementalTs;
      })
      .catch(function(e){ console.warn('incremental load error', e); });
  }

  window.resetAndLoad = function(){ loadData(true); };

  window.changePage = function(delta){
    var next = currentPage + delta;
    if(next < 1 || next > totalPages) return;
    currentPage = next;
    loadData(false);
  };

  // Auto-refresh every 30s
  function startAutoRefresh(){
    if(autoRefreshTimer) clearInterval(autoRefreshTimer);
    autoRefreshTimer = setInterval(function(){ loadData(false); }, 30000);
  }

  // SSE live updates
  function setLiveStatus(live){
    var el = document.getElementById('sse-status');
    if(!el) return;
    if(live){ el.textContent='🟢 En vivo'; el.style.color='#4ade80'; }
    else { el.textContent='🟡 Auto (30s)'; el.style.color='#fbbf24'; }
  }

  function connectSSE(){
    if(sseSource){ try{ sseSource.close(); }catch(e){} sseSource=null; }
    sseSource = new EventSource(debugPath('/debug/kapso/stream'));
    sseSource.onopen = function(){ setLiveStatus(true); };
    sseSource.onmessage = function(){
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(loadIncremental, 2000); // debounce 2s, merge incremental
    };
    sseSource.onerror = function(){
      setLiveStatus(false);
      if(sseSource){ try{ sseSource.close(); }catch(e){} sseSource=null; }
      setTimeout(connectSSE, 8000);
    };
  }

  setInterval(function(){
    var rs = sseSource ? sseSource.readyState : -1;
    var el = document.getElementById('sse-status');
    if(!el) return;
    if(rs===1){ el.textContent='🟢 En vivo'; el.style.color='#4ade80'; }
    else if(rs===0){ el.textContent='🟡 Conectando...'; el.style.color='#fbbf24'; }
    else { el.textContent='🟡 Auto (30s)'; el.style.color='#fbbf24'; }
  }, 1000);

  loadEmpresasMap();
  loadData(true);
  connectSSE();
  startAutoRefresh();
})();
</script>
</body></html>`;
}

app.get('/debug/canales', async (req, res) => {
  if (!requireDebugAccess(req, res)) return;
  res.set('Cache-Control', 'no-store, max-age=0');
  res.status(200).type('html').send(renderCanalesHtml(extractAccessToken(req)));
});

app.get('/debug/canales/data', async (req, res) => {
  if (!requireDebugAccess(req, res)) return;
  try {
    const { page = 1, limit = 20, channel = '', empresa_id = 0, days = 30 } = req.query;
    const data = await collectCanalesDebugPayload(+page, +limit, channel, +empresa_id, +days);
    res.set('Cache-Control', 'no-store, max-age=0');
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/v1/debug/interactions', async (req, res) => {
  if (!requireDebugAccess(req, res)) return;
  try {
    const { page = 1, limit = 20, channel = '', empresa_id = 0, days = 30 } = req.query;
    const data = await collectCanalesDebugPayload(+page, +limit, channel, +empresa_id, +days);
    res.set('Cache-Control', 'no-store, max-age=0');
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});


// ── Archivos estáticos: /public → ../docs ────────────────────────────────────
app.use('/public', express.static(join(__dirname, '..', 'docs')));


app.listen(PORT, () => {

  console.log(`[KapsoBridge] escuchando en http://localhost:${PORT}`);

});

