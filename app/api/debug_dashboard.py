"""
Debug Dashboard — HTML visual para /debug/kapso/

Renderiza un dashboard completo con eventos, configuración y
trazas de agente directamente desde el backend FastAPI.

Fuente de datos: tabla ``debug_events`` en Supabase (persistente)
+ eventos en memoria del proceso actual (para los más recientes).

El dashboard usa SSE (/debug/kapso/stream) para actualizaciones
en tiempo real, con polling de 5s como fallback si SSE se desconecta.
"""

import asyncio
import json
import logging
import math
import os
from datetime import datetime, timedelta, timezone
from html import escape

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse

from app.core.config import get_settings
from app.core.kapso_debug import get_kapso_debug_events, mask_secret, subscribe_sse, unsubscribe_sse
from app.db.client import get_supabase

logger = logging.getLogger(__name__)

router = APIRouter(tags=["debug"])

def _get_debug_config() -> dict:
    settings = get_settings()

    return {
        "app_name": settings.APP_NAME,
        "default_model": settings.DEFAULT_MODEL,
        "python_service_port": os.getenv("PYTHON_SERVICE_PORT", "8000"),
        "internal_agent_api_url": os.getenv(
            "INTERNAL_AGENT_API_URL",
            "http://127.0.0.1:8000/api/v1/kapso/inbound",
        ),
        "kapso_internal_token": mask_secret(settings.KAPSO_INTERNAL_TOKEN),
        "supabase_url": mask_secret(settings.SUPABASE_URL),
        "fallback_phone": "(eliminado — error directo si no se resuelve)",
        "fallback_agent_id": "(eliminado — error directo si no se resuelve)",
    }


async def _load_events_from_supabase(limit: int = 200) -> list[dict]:
    """Load debug events from the persistent Supabase table."""
    try:
        db = await get_supabase()
        rows = await db.query(
            "debug_events",
            select="*",
            filters={"source": "kapso"},
            order="created_at",
            order_desc=True,
            limit=limit,
        )
        if not rows or not isinstance(rows, list):
            return []
        # Normalize to the same shape as in-memory events
        events = []
        for row in rows:
            events.append({
                "timestamp": row.get("created_at") or row.get("timestamp"),
                "source": row.get("source", "kapso"),
                "stage": row.get("stage", ""),
                "payload": row.get("payload") or {},
            })
        return events
    except Exception as exc:
        logger.warning("Failed to load debug_events from Supabase: %s", exc)
        return []


async def _get_merged_events(limit: int = 200) -> list[dict]:
    """Merge in-memory events with Supabase persisted events (dedup by timestamp+stage)."""
    memory_events = get_kapso_debug_events(limit)
    db_events = await _load_events_from_supabase(limit)

    # Build a dedup set from memory events
    seen = set()
    for ev in memory_events:
        key = (ev.get("timestamp", ""), ev.get("stage", ""))
        seen.add(key)

    # Merge: memory first (freshest), then DB events not already present
    merged = list(memory_events)
    for ev in db_events:
        key = (ev.get("timestamp", ""), ev.get("stage", ""))
        if key not in seen:
            merged.append(ev)
            seen.add(key)

    # Sort by timestamp descending
    merged.sort(key=lambda x: x.get("timestamp") or "", reverse=True)
    return merged[:limit]


def _esc(value) -> str:
    """HTML-escape any value."""
    return escape(str(value)) if value is not None else "—"


def _build_interactions(events: list[dict]) -> list[dict]:
    """Group raw kapso debug events into interaction objects (like the bridge does)."""
    interactions_map: dict[str, dict] = {}

    for ev in events:
        payload = ev.get("payload") or {}
        stage = ev.get("stage", "")
        msg_id = payload.get("message_id") or payload.get("interaction_id")
        if not msg_id:
            continue

        if msg_id not in interactions_map:
            interactions_map[msg_id] = {
                "message_id": msg_id,
                "started_at": ev.get("timestamp"),
                "status": "processing",
                "events": [],
            }
        interaction = interactions_map[msg_id]
        interaction["events"].append(ev)

        if stage == "inbound_received":
            interaction["from_phone"] = payload.get("from_phone") or payload.get("from")
            interaction["message_type"] = payload.get("message_type")
            interaction["message_text"] = payload.get("text", payload.get("message_text"))
            interaction["contact_name"] = payload.get("contact_name")

        if stage == "inbound_entities_resolved":
            interaction["contact_name"] = interaction.get("contact_name") or payload.get("contact_name")
            interaction["conversation_id"] = payload.get("conversacion_id") or payload.get("conversation_db_id")
            interaction["from_phone"] = interaction.get("from_phone") or payload.get("normalized_from_phone")

        if stage == "run_agent_start":
            interaction["agent_name"] = interaction.get("agent_name") or payload.get("agent_name")
            interaction["model_used"] = interaction.get("model_used") or payload.get("model")

        if stage == "run_agent_done":
            interaction["status"] = "ok"
            interaction["agent_name"] = payload.get("agent_name") or interaction.get("agent_name")
            interaction["model_used"] = payload.get("model_used") or interaction.get("model_used")
            timing = payload.get("timing") or {}
            interaction["duration_ms"] = payload.get("total_ms") or timing.get("total_ms")
            interaction["reaction_emoji"] = payload.get("reaction_emoji")
            interaction["response_preview"] = (payload.get("response_preview") or payload.get("reply_text") or "")[:200]
            interaction["reply_type"] = payload.get("reply_type", "text")
            interaction["timing"] = timing
            interaction["tools_used"] = payload.get("tools_used") or []
            interaction["agent_runs"] = payload.get("agent_runs") or []

        if stage == "run_funnel_done":
            interaction["funnel_etapa_nueva"] = payload.get("etapa_nueva")
            interaction["funnel_metadata_actualizada"] = payload.get("metadata_actualizada")
            interaction["funnel_error"] = payload.get("error")

        if stage == "run_contact_update_done":
            interaction["contact_update_fields"] = payload.get("updated_fields")

        if stage in ("inbound_error", "error", "exception", "http_error"):
            interaction["status"] = "error"
            interaction["error"] = payload.get("error") or payload.get("detail")

    return sorted(
        interactions_map.values(),
        key=lambda x: x.get("started_at") or "",
        reverse=True,
    )


def _render_dashboard_html(config: dict) -> str:
    """Render SPA shell — all data loaded via AJAX from /debug/kapso/data."""
    config_json = json.dumps(config, ensure_ascii=False, indent=2)

    return """<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Kapso Debug — FastAPI</title>
  <style>
    body{font-family:Arial,sans-serif;background:#0f172a;color:#e2e8f0;margin:0;padding:16px}
    .top{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap}
    .title{font-size:20px;font-weight:700}
    .actions a,.actions button{color:#93c5fd;text-decoration:none;margin-left:12px;background:none;border:none;cursor:pointer;font-size:14px}
    .actions button:hover{text-decoration:underline}
    .stats{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:12px;margin-bottom:16px}
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
    .auto-refresh{font-size:11px;color:#94a3b8;margin-left:12px}
    .loading{text-align:center;padding:40px;color:#94a3b8;font-size:14px}
    .pulse{animation:pulse 1.5s ease-in-out infinite}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
    .source-badge{display:inline-block;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600}
    .source-db{background:#1e3a5f;color:#7dd3fc}
    .source-mem{background:#3b1f5e;color:#c4b5fd}
    .new-row{animation:highlightNew 2.5s ease-out}
    @keyframes highlightNew{0%{background:#854d0e}40%{background:#713f12}100%{background:transparent}}
    .new-badge{display:inline-block;background:#f59e0b;color:#000;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;margin-left:10px;animation:badgePop .4s ease-out}
    @keyframes badgePop{0%{transform:scale(0)}60%{transform:scale(1.2)}100%{transform:scale(1)}}
    .btn-retry{background:#dc2626;color:#fff;border:none;border-radius:4px;padding:3px 8px;font-size:11px;cursor:pointer;font-weight:600}
    .btn-retry:hover{background:#b91c1c}
    .btn-retry:disabled{background:#6b7280;cursor:not-allowed}
    .retry-ok{color:#4ade80;font-size:11px;font-weight:600}
    .retry-err{color:#f87171;font-size:11px;font-weight:600}
  </style>
</head>
<body>
  <div class="top">
    <div class="title">🔍 Kapso Debug — FastAPI Backend</div>
    <div class="actions">
      <button onclick="loadData()">⟳ Refrescar</button>
      <a href="/debug/kapso/data" target="_blank">Ver JSON</a>
      <a href="/docs" target="_blank">API Docs</a>
      <span class="auto-refresh" id="autoLabel">Conectando...</span>
      <span id="newBadge" style="display:none"></span>
    </div>
  </div>

  <div class="stats" id="statsGrid">
    <div class="card"><div class="label">Interacciones</div><div class="value" id="statTotal">—</div></div>
    <div class="card"><div class="label">OK</div><div class="value" style="color:#4ade80" id="statOk">—</div></div>
    <div class="card"><div class="label">Errores</div><div class="value" style="color:#f87171" id="statErrors">—</div></div>
    <div class="card"><div class="label">Tiempo avg</div><div class="value" id="statAvg">—</div></div>
  </div>

  <div class="section">
    <table>
      <thead>
        <tr>
          <th>Hora</th><th>Contacto</th><th>Teléfono</th><th>Tipo</th>
          <th>Mensaje</th><th>Agente</th><th>Modelo</th><th>Reply</th>
          <th>Rx</th><th>Tiempo</th><th>Status</th><th>Detalle</th><th>Acción</th>
        </tr>
      </thead>
      <tbody id="interactionRows">
        <tr><td colspan="13" class="loading pulse">Cargando datos desde Supabase...</td></tr>
      </tbody>
    </table>
  </div>

  <div id="interactionDetails"></div>

  <details class="section">
    <summary id="eventsTitle">Eventos raw (0)</summary>
    <table>
      <thead><tr><th>Timestamp</th><th>Source</th><th>Stage</th><th>Payload</th></tr></thead>
      <tbody id="eventRows">
        <tr><td colspan="4" class="loading pulse">Cargando...</td></tr>
      </tbody>
    </table>
  </details>

  <details class="section">
    <summary>FastAPI Config</summary>
    <pre>""" + escape(config_json) + """</pre>
  </details>

  <script>
  const E = s => {
    const d = document.createElement('div');
    d.textContent = s != null ? String(s) : '—';
    return d.innerHTML;
  };

  function timingTable(t) {
    if (!t) t = {};
    const f = v => v != null ? E(v + ' ms') : '—';
    return `<table style="margin-top:8px">
      <thead><tr><th>Total</th><th>LLM</th><th>MCP</th><th>Graph</th><th>Tools</th></tr></thead>
      <tbody><tr><td>${f(t.total_ms)}</td><td>${f(t.llm_ms)}</td><td>${f(t.mcp_discovery_ms)}</td><td>${f(t.graph_build_ms)}</td><td>${f(t.tool_execution_ms)}</td></tr></tbody>
    </table>`;
  }

  function toolList(items) {
    if (!items || !items.length) return '<div style="color:#94a3b8">Sin herramientas.</div>';
    let rows = '';
    for (const it of items) {
      if (typeof it !== 'object') { rows += `<tr><td colspan="5">${E(it)}</td></tr>`; continue; }
      const dur = it.duration_ms != null ? it.duration_ms + ' ms' : '—';
      const errHtml = it.error ? `<div style="margin-top:8px;color:#fca5a5"><strong>Error:</strong> ${E(it.error)}</div>` : '';
      rows += `<tr><td>${E(it.tool_name||'—')}</td><td>${E(it.source||'—')}</td><td>${E(it.status||'ok')}</td><td>${E(dur)}</td><td>${E(it.description||'—')}</td></tr>
        <tr><td colspan="5">
          <div style="margin-bottom:8px"><strong>Input</strong></div><pre>${E(JSON.stringify(it.tool_input||{},null,2))}</pre>
          <div style="margin:8px 0"><strong>Output</strong></div><pre>${E(it.tool_output||'—')}</pre>${errHtml}
        </td></tr>`;
    }
    return `<table style="margin-top:8px"><thead><tr><th>Tool</th><th>Source</th><th>Estado</th><th>Tiempo</th><th>Descripción</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  function agentRuns(runs) {
    if (!runs || !runs.length) return '<div style="color:#94a3b8">Sin trazas detalladas de agentes.</div>';
    return runs.map((r, i) => {
      const nm = E(r.agent_name || r.agent_key || 'Agente '+(i+1));
      const availRows = (r.available_tools||[]).map(t =>
        typeof t === 'object'
          ? `<tr><td>${E(t.tool_name||'—')}</td><td>${E(t.source||'—')}</td><td>${E(t.description||'—')}</td></tr>`
          : `<tr><td colspan="3">${E(t)}</td></tr>`
      ).join('') || '<tr><td colspan="3" style="color:#94a3b8">Sin herramientas disponibles.</td></tr>';
      return `<details style="margin-top:12px">
        <summary>${nm} · ${E(r.agent_kind||'agent')} · ${E(r.model_used||'—')}</summary>
        <div style="margin-top:12px">
          <div style="margin-bottom:10px"><strong>Agent key:</strong> ${E(r.agent_key||'—')}</div>
          <div style="margin-bottom:10px"><strong>Conversation:</strong> ${E(r.conversation_id||'—')}</div>
          <div style="margin-bottom:10px"><strong>Memory session:</strong> ${E(r.memory_session_id||'—')}</div>
          <div style="margin-bottom:10px"><strong>LLM iterations:</strong> ${E(r.llm_iterations??0)}</div>
          <div style="margin:12px 0 6px"><strong>Timing</strong></div>${timingTable(r.timing)}
          <div style="margin:12px 0 6px"><strong>Herramientas disponibles</strong></div>
          <table style="margin-top:8px"><thead><tr><th>Tool</th><th>Source</th><th>Descripción</th></tr></thead><tbody>${availRows}</tbody></table>
          <div style="margin:12px 0 6px"><strong>Herramientas ejecutadas</strong></div>${toolList(r.tools_used)}
          <details style="margin-top:12px"><summary>Prompts</summary><div style="margin-top:12px">
            <div style="margin:0 0 6px"><strong>System prompt</strong></div><pre>${E(r.system_prompt||'')}</pre>
            <div style="margin:12px 0 6px"><strong>User prompt</strong></div><pre>${E(r.user_prompt||'')}</pre>
          </div></details>
        </div>
      </details>`;
    }).join('');
  }

  function renderInteractions(interactions, newIds) {
    if (!newIds) newIds = new Set();
    const tbody = document.getElementById('interactionRows');
    const detailsDiv = document.getElementById('interactionDetails');

    if (!interactions || !interactions.length) {
      tbody.innerHTML = '<tr><td colspan="12" style="padding:20px;color:#94a3b8">Sin interacciones todavía.</td></tr>';
      detailsDiv.innerHTML = '';
      return;
    }

    // Stats
    const okCount = interactions.filter(i => i.status === 'ok').length;
    const errCount = interactions.filter(i => i.status === 'error').length;
    const durs = interactions.filter(i => i.duration_ms != null).map(i => i.duration_ms);
    const avg = durs.length ? Math.round(durs.reduce((a,b) => a+b, 0) / durs.length) : null;
    document.getElementById('statTotal').textContent = interactions.length;
    document.getElementById('statOk').textContent = okCount;
    document.getElementById('statErrors').textContent = errCount;
    document.getElementById('statAvg').textContent = avg != null ? avg + ' ms' : '—';

    // Table rows
    tbody.innerHTML = interactions.map((item, idx) => {
      const isNew = newIds.has(item.message_id);
      const retryBtn = item.status === 'error' && item.message_id
        ? `<button class="btn-retry" id="btn-${item.message_id}" onclick="retryMessage('${item.message_id}')">⟳ Reintentar</button><span id="retry-status-${item.message_id}"></span>`
        : '—';
      return `<tr class="${isNew ? 'new-row' : ''}">
      <td>${E(item.started_at||'—')}</td>
      <td>${E(item.contact_name||'—')}</td>
      <td>${E(item.from_phone||'—')}</td>
      <td>${E(item.message_type||'text')}</td>
      <td style="white-space:pre-wrap;max-width:320px">${E(item.message_text||'—')}</td>
      <td>${E(item.agent_name||'—')}</td>
      <td>${E(item.model_used||'—')}</td>
      <td>${E(item.reply_type||'text')}</td>
      <td>${E(item.reaction_emoji||'—')}</td>
      <td>${E(item.duration_ms != null ? item.duration_ms + ' ms' : '—')}</td>
      <td>${E(item.status||'processing')}</td>
      <td><a href="#interaction-${idx}" style="color:#93c5fd" onclick="document.getElementById('interaction-${idx}').open=true">Ver detalle</a></td>
      <td>${retryBtn}</td>
    </tr>`;
    }).join('');

    // Details
    detailsDiv.innerHTML = interactions.map((item, idx) => {
      const label = E(item.contact_name || item.from_phone || item.message_id || 'Interacción '+(idx+1));
      const dur = item.duration_ms != null ? item.duration_ms + ' ms' : '—';
      const funnelJson = JSON.stringify({
        etapa_nueva: item.funnel_etapa_nueva ?? null,
        metadata_actualizada: item.funnel_metadata_actualizada ?? null,
        error: item.funnel_error ?? null
      }, null, 2);
      return `<details class="section" id="interaction-${idx}">
        <summary>${label} · ${E(item.status||'processing')} · ${E(dur)}</summary>
        <div style="margin-top:12px">
          <div style="margin-bottom:8px"><strong>Message ID:</strong> ${E(item.message_id||'—')}</div>
          <div style="margin:12px 0 6px"><strong>Error</strong></div><pre>${E(item.error||'—')}</pre>
          <div style="margin-bottom:8px"><strong>Mensaje:</strong></div><pre>${E(item.message_text||'—')}</pre>
          <div style="margin:12px 0 6px"><strong>Respuesta preview</strong></div><pre>${E(item.response_preview||'—')}</pre>
          <div style="margin:12px 0 6px"><strong>Embudo en metadata</strong></div><pre>${E(funnelJson)}</pre>
          <div style="margin:12px 0 6px"><strong>Timing global</strong></div>${timingTable(item.timing)}
          <div style="margin:12px 0 6px"><strong>Tools globales</strong></div>${toolList(item.tools_used)}
          <div style="margin:12px 0 6px"><strong>Trazas detalladas del agente</strong></div>${agentRuns(item.agent_runs)}
        </div>
      </details>`;
    }).join('');
  }

  function renderEvents(events) {
    const tbody = document.getElementById('eventRows');
    const title = document.getElementById('eventsTitle');
    title.textContent = 'Eventos raw (' + (events ? events.length : 0) + ')';

    if (!events || !events.length) {
      tbody.innerHTML = '<tr><td colspan="4" style="padding:16px;color:#94a3b8">Sin eventos.</td></tr>';
      return;
    }

    tbody.innerHTML = events.slice(0, 150).map(ev => {
      const payload = ev.payload || {};
      return `<tr>
        <td>${E(ev.timestamp||'—')}</td>
        <td>${E(ev.source||'—')}</td>
        <td>${E(ev.stage||'—')}</td>
        <td style="max-width:400px;word-break:break-word"><pre style="margin:0;font-size:11px">${E(JSON.stringify(payload).substring(0, 500))}</pre></td>
      </tr>`;
    }).join('');
  }

  async function retryMessage(messageId) {
    const btn = document.getElementById('btn-' + messageId);
    const statusEl = document.getElementById('retry-status-' + messageId);
    if (!btn) return;
    btn.disabled = true;
    btn.textContent = '⏳ Reintentando...';
    statusEl.textContent = '';
    try {
      const r = await fetch('/debug/kapso/retry/' + encodeURIComponent(messageId), {
        method: 'POST',
      });
      if (r.ok) {
        statusEl.className = 'retry-ok';
        statusEl.textContent = ' ✓ Enviado';
        btn.textContent = '⟳ Reintentar';
        btn.disabled = false;
        setTimeout(loadData, 3000);
      } else {
        const err = await r.json().catch(() => ({detail: r.statusText}));
        statusEl.className = 'retry-err';
        statusEl.textContent = ' ✗ ' + (err.detail || 'Error');
        btn.textContent = '⟳ Reintentar';
        btn.disabled = false;
      }
    } catch(e) {
      statusEl.className = 'retry-err';
      statusEl.textContent = ' ✗ ' + e.message;
      btn.textContent = '⟳ Reintentar';
      btn.disabled = false;
    }
  }

  const label    = document.getElementById('autoLabel');
  const newBadge = document.getElementById('newBadge');
  let knownMessageIds = new Set();
  let isFirstLoad     = true;
  let sseConnected    = false;
  let sseSource       = null;
  let fallbackTimer   = null;
  let debounceTimer   = null;

  // ── Indicador de estado ──────────────────────────────────────────────
  function updateLiveIndicator() {
    if (sseConnected) {
      label.textContent  = '🟢 En vivo';
      label.style.color  = '#4ade80';
    } else {
      label.textContent  = '🟡 Polling (5s)';
      label.style.color  = '#fbbf24';
    }
  }

  // ── Carga de datos completa ──────────────────────────────────────────
  async function loadData() {
    try {
      const r    = await fetch('/debug/kapso/data', {cache: 'no-store'});
      const data = await r.json();
      const interactions = data.interactions || [];

      // Detectar mensajes nuevos
      const currentIds = new Set(interactions.map(i => i.message_id).filter(Boolean));
      let newIds = new Set();
      if (!isFirstLoad) {
        currentIds.forEach(id => { if (!knownMessageIds.has(id)) newIds.add(id); });
      }
      knownMessageIds = currentIds;
      isFirstLoad = false;

      renderInteractions(interactions, newIds);
      renderEvents(data.fastapi_events || []);

      // Badge de mensajes nuevos
      if (newIds.size > 0) {
        newBadge.textContent = '+' + newIds.size + ' nuevo' + (newIds.size > 1 ? 's' : '');
        newBadge.className   = 'new-badge';
        newBadge.style.display = 'inline-block';
        setTimeout(() => { newBadge.style.display = 'none'; }, 4000);
      }
    } catch (err) {
      console.error('Debug data load error:', err);
      document.getElementById('interactionRows').innerHTML =
        '<tr><td colspan="12" style="padding:20px;color:#fca5a5">Error cargando datos: ' + E(err.message) + '</td></tr>';
    }
  }

  // ── SSE: actualizaciones en tiempo real ──────────────────────────────
  function startSSE() {
    if (sseSource) { sseSource.close(); sseSource = null; }

    sseSource = new EventSource('/debug/kapso/stream');

    sseSource.onopen = () => {
      sseConnected = true;
      updateLiveIndicator();
      // Cancelar el fallback polling si SSE vuelve a conectarse
      if (fallbackTimer) { clearInterval(fallbackTimer); fallbackTimer = null; }
    };

    sseSource.onmessage = () => {
      // Debounce: si llegan varios eventos seguidos solo recargamos una vez
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(loadData, 250);
    };

    sseSource.onerror = () => {
      sseConnected = false;
      updateLiveIndicator();
      // Activar polling de respaldo mientras SSE esté caído
      if (!fallbackTimer) {
        fallbackTimer = setInterval(loadData, 5000);
      }
    };
  }

  // ── Arranque ─────────────────────────────────────────────────────────
  loadData();   // Carga inicial inmediata
  startSSE();   // Abre SSE (carga en tiempo real desde ahora)
  </script>
</body>
</html>"""


@router.get("/api/v1/debug/interactions")
async def debug_interactions(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=500),
    channel: str = Query(default=""),
    empresa_id: int = Query(default=0),
    contacto_id: str = Query(default=""),  # numeric id string — triggers full DB scan
    days: int = Query(default=30, ge=1, le=365),
    since: str = Query(default=""),  # ISO timestamp — incremental load from SSE
):
    """Paginated interactions from Supabase debug_events, grouped by message_id."""
    try:
        db = await get_supabase()
        cutoff = since if since else (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

        base_raw: dict = {
            "created_at": f"gte.{cutoff}",
            "source": "neq.funnel",
        }
        filters: dict = {}

        if channel:
            base_raw["payload->>'_channel'"] = f"eq.{channel}"
        if empresa_id:
            filters["empresa_id"] = empresa_id

        _PAGE = 1000
        # Note: 'channel' is NOT a column — it lives inside payload as _channel
        _select = "source,stage,payload,created_at,empresa_id,contacto_id,message_id"

        async def _fetch_batch(offset: int, extra_raw: dict | None = None) -> list[dict]:
            page_raw = {**base_raw, "offset": str(offset)}
            if extra_raw:
                page_raw.update(extra_raw)
            return await db.query(
                "debug_events",
                select=_select,
                filters=filters if filters else None,
                raw_filters=page_raw,
                order="created_at",
                order_desc=True,
                limit=_PAGE,
            ) or []

        if contacto_id:
            # Two-step: find message_ids for this contact, then fetch ALL events for those IDs.
            # This ensures stages like run_agent_done (which lack the contacto_id column) are included.
            try:
                cid_int = int(contacto_id)
            except ValueError:
                cid_int = None

            rows: list[dict] = []
            if cid_int is not None:
                # Step 1: collect all message_ids where contacto_id = cid_int
                id_rows: list[dict] = []
                offset = 0
                while True:
                    batch = await db.query(
                        "debug_events",
                        select="message_id",
                        raw_filters={
                            "created_at": f"gte.{cutoff}",
                            "contacto_id": f"eq.{cid_int}",
                            "offset": str(offset),
                        },
                        limit=_PAGE,
                    ) or []
                    id_rows.extend(batch)
                    if len(batch) < _PAGE:
                        break
                    offset += _PAGE
                    if offset >= 50_000:
                        break

                msg_ids = list({r.get("message_id") for r in id_rows if r.get("message_id")})

                if msg_ids:
                    # Step 2: fetch ALL events for those message_ids (no contacto_id restriction)
                    # Chunk to avoid URL length limits (~100 ids per request)
                    chunk_size = 100
                    for chunk_start in range(0, len(msg_ids), chunk_size):
                        chunk = msg_ids[chunk_start:chunk_start + chunk_size]
                        chunk_rows = await db.query(
                            "debug_events",
                            select=_select,
                            raw_filters={
                                "source": "neq.funnel",
                                "message_id": f"in.({','.join(str(m) for m in chunk)})",
                            },
                            order="created_at",
                            order_desc=True,
                            limit=len(chunk) * 30,  # up to 30 events per message
                        ) or []
                        rows.extend(chunk_rows)
        else:
            # Normal path: 3-batch parallel fetch (max 3000 rows, ~2 round-trips)
            _MAX_EXTRA = 2
            batch0 = await _fetch_batch(0)
            rows = list(batch0)
            if len(batch0) == _PAGE:
                extra = await asyncio.gather(
                    *[_fetch_batch(_PAGE * i) for i in range(1, _MAX_EXTRA + 1)]
                )
                for batch in extra:
                    rows.extend(batch)
                    if len(batch) < _PAGE:
                        break
    except Exception as exc:
        logger.error("debug_interactions: error querying Supabase: %s", exc)
        return {
            "interactions": [],
            "page": page,
            "limit": limit,
            "total": 0,
            "pages": 1,
            "stats": {"total": 0, "ok": 0, "errors": 0, "avg_ms": None, "by_channel": {}},
            "error": str(exc),
        }

    # ── Group by message_id ────────────────────────────────────────────────────
    interactions_map: dict[str, dict] = {}
    for row in rows:
        payload = row.get("payload") or {}
        stage = row.get("stage", "")
        msg_id = (
            payload.get("message_id")
            or payload.get("interaction_id")
            or row.get("message_id")
        )
        if not msg_id:
            continue

        # Infer channel: explicit _channel > legacy source-based inference
        def _infer_channel(p: dict, r: dict) -> str | None:
            ch = p.get("_channel") or r.get("channel")
            if ch:
                return ch
            src = r.get("source") or ""
            if src in ("fastapi", "kapso"):
                return "whatsapp"
            if src.startswith("ghl"):
                return src  # ghl_instagram / ghl_facebook
            return None

        if msg_id not in interactions_map:
            interactions_map[msg_id] = {
                "message_id": msg_id,
                "started_at": row.get("created_at"),
                "channel": _infer_channel(payload, row),
                "empresa_id": row.get("empresa_id"),
                "contacto_id": row.get("contacto_id"),
                "contact_name": None,
                "from_phone": None,
                "message_type": None,
                "message_text": None,
                "agent_name": None,
                "model_used": None,
                "duration_ms": None,
                "status": "processing",
                "response_preview": None,
                "error": None,
                "stages": [],
                "stages_detail": [],
            }

        interaction = interactions_map[msg_id]

        if stage not in interaction["stages"]:
            interaction["stages"].append(stage)

        # Build rich stage detail for timeline view
        stage_detail: dict = {"stage": stage, "ts": row.get("created_at")}
        if stage == "inbound_received":
            stage_detail.update({
                "from": payload.get("from_phone") or payload.get("from"),
                "contact": payload.get("contact_name"),
                "type": payload.get("message_type"),
                "text": (payload.get("message_text") or payload.get("text") or "")[:500],
            })
        elif stage == "inbound_entities_resolved":
            stage_detail.update({
                "contact_name": payload.get("contact_name"),
                "contacto_id": payload.get("contacto_id"),
                "empresa_id": payload.get("empresa_id"),
                "asesor_id": payload.get("asesor_id"),
            })
        elif stage == "run_agent_start":
            stage_detail.update({
                "agent": payload.get("agent_name"),
                "model": payload.get("model"),
            })
        elif stage == "run_agent_done":
            _timing = payload.get("timing") or {}
            stage_detail.update({
                "agent": payload.get("agent_name"),
                "reply": (payload.get("reply_text") or payload.get("response_preview") or "")[:2000],
                "reply_type": payload.get("reply_type"),
                "tools_used": payload.get("tools_used") or [],
                "total_ms": payload.get("total_ms") or _timing.get("total_ms"),
                "llm_ms": _timing.get("llm_ms"),
                "tool_ms": _timing.get("tool_execution_ms"),
                "bubbles_sent": payload.get("bubbles_sent"),
                "send_ok": payload.get("ghl_send_ok") if payload.get("ghl_send_ok") is not None else payload.get("send_ok"),
                "send_error": payload.get("ghl_send_error") or payload.get("send_error"),
            })
        elif stage == "run_funnel_done":
            stage_detail.update({
                "etapa_anterior": payload.get("etapa_anterior"),
                "etapa_nueva": payload.get("etapa_nueva"),
                "metadata_actualizada": payload.get("metadata_actualizada"),
                "error": payload.get("error"),
            })
        elif stage == "run_contact_update_done":
            stage_detail.update({
                "updated_fields": payload.get("updated_fields"),
            })
        elif stage in ("call_fastapi_done",):
            stage_detail.update({
                "reply_type": payload.get("reply_type"),
                "reply_text": (payload.get("reply_text") or "")[:500],
                "video_url": payload.get("video_url"),
            })
        elif stage == "kapso_send_done":
            stage_detail.update({
                "to": payload.get("to"),
                "reply_type": payload.get("reply_type"),
                "result": payload.get("result"),
                "suppressed": (payload.get("result") or {}).get("suppressed") if isinstance(payload.get("result"), dict) else None,
            })
        elif stage == "slash_command_done":
            stage_detail.update({
                "command": payload.get("command"),
                "result": payload.get("result") or payload.get("response"),
            })
        elif stage == "slash_command_detected":
            stage_detail.update({
                "command": payload.get("command"),
                "text": payload.get("message_text") or payload.get("text"),
            })
        elif stage in ("inbound_error", "error", "exception", "http_error"):
            stage_detail.update({
                "error": payload.get("error") or payload.get("detail"),
                "traceback": (payload.get("traceback") or "")[:800],
            })
        else:
            # Generic: capture top-level scalar fields for unknown stages
            stage_detail["data"] = {
                k: v for k, v in payload.items()
                if k not in ("message_id", "interaction_id", "_channel")
                and isinstance(v, (str, int, float, bool, type(None)))
            }
        interaction["stages_detail"].append(stage_detail)

        # Always prefer earliest timestamp as started_at
        row_ts = row.get("created_at") or ""
        if row_ts and (not interaction["started_at"] or row_ts < interaction["started_at"]):
            interaction["started_at"] = row_ts

        # Always try to fill channel if still missing
        if not interaction["channel"]:
            interaction["channel"] = _infer_channel(payload, row)

        if stage == "inbound_received":
            interaction["channel"] = interaction["channel"] or _infer_channel(payload, row)
            interaction["contact_name"] = interaction["contact_name"] or payload.get("contact_name")
            interaction["from_phone"] = interaction["from_phone"] or payload.get("from_phone") or payload.get("from")
            interaction["message_type"] = interaction["message_type"] or payload.get("message_type")
            interaction["message_text"] = interaction["message_text"] or payload.get("message_text") or payload.get("text")
            interaction["empresa_id"] = interaction["empresa_id"] or row.get("empresa_id")
            interaction["contacto_id"] = interaction["contacto_id"] or row.get("contacto_id")

        # Fallbacks for interactions that lack inbound_received
        if stage == "inbound_entities_resolved":
            interaction["contact_name"] = interaction["contact_name"] or payload.get("contact_name")
            interaction["from_phone"] = interaction["from_phone"] or payload.get("normalized_from_phone") or payload.get("from_phone")
            interaction["empresa_id"] = interaction["empresa_id"] or payload.get("empresa_id") or row.get("empresa_id")
            interaction["contacto_id"] = interaction["contacto_id"] or payload.get("contacto_id") or row.get("contacto_id")

        if stage == "memory_session_resolved":
            # payload.from is the raw WhatsApp phone number
            interaction["from_phone"] = interaction["from_phone"] or payload.get("from") or payload.get("from_phone")
            interaction["contact_name"] = interaction["contact_name"] or payload.get("contact_name")
            interaction["contacto_id"] = interaction["contacto_id"] or payload.get("contacto_id") or row.get("contacto_id")

        if stage == "run_agent_done":
            interaction["status"] = "ok"
            interaction["agent_name"] = payload.get("agent_name") or interaction["agent_name"]
            interaction["model_used"] = payload.get("model_used") or interaction["model_used"]
            timing = payload.get("timing") or {}
            interaction["duration_ms"] = payload.get("total_ms") or timing.get("total_ms") or interaction["duration_ms"]
            preview = payload.get("response_preview") or payload.get("reply_text") or ""
            interaction["response_preview"] = preview[:200] if preview else interaction["response_preview"]
            interaction["channel"] = interaction["channel"] or _infer_channel(payload, row)

        # Slash commands and successful send/call also mark interaction as ok
        if stage in ("slash_command_done", "kapso_send_done", "call_fastapi_done"):
            if interaction["status"] == "processing":
                interaction["status"] = "ok"
            if stage == "kapso_send_done":
                result = payload.get("result") or {}
                if isinstance(result, dict) and result.get("suppressed"):
                    interaction["status"] = "suprimido"
            if stage == "call_fastapi_done":
                interaction["duration_ms"] = interaction["duration_ms"] or payload.get("total_ms")

        if stage in ("inbound_error", "error", "exception", "http_error"):
            if interaction["status"] != "ok":
                interaction["status"] = "error"
            interaction["error"] = payload.get("error") or payload.get("detail") or interaction["error"]

    # Sort stages_detail chronologically within each interaction
    for interaction in interactions_map.values():
        interaction["stages_detail"].sort(key=lambda s: s.get("ts") or "")

    all_interactions = sorted(
        interactions_map.values(),
        key=lambda x: x.get("started_at") or "",
        reverse=True,
    )

    # ── Enrich contact_name from wp_contactos ─────────────────────────────────
    # When filtering by contacto_id: always use CRM name (overrides WhatsApp display name).
    # Normal load: only fill in interactions that have no name at all.
    if contacto_id:
        enrich_ids = list({i["contacto_id"] for i in all_interactions if i.get("contacto_id")})
    else:
        enrich_ids = list({
            i["contacto_id"] for i in all_interactions
            if i.get("contacto_id") and not i.get("contact_name")
        })
    if enrich_ids:
        try:
            contactos_rows = await db.query(
                "wp_contactos",
                select="id,nombre",
                raw_filters={"id": f"in.({','.join(str(x) for x in enrich_ids)})"},
                limit=len(enrich_ids) + 10,
            ) or []
            contactos_map: dict[int, str] = {
                c["id"]: c["nombre"]
                for c in contactos_rows
                if c.get("id") and c.get("nombre")
            }
            for interaction in all_interactions:
                cid = interaction.get("contacto_id")
                if cid and cid in contactos_map:
                    # contacto_id filter: always overwrite (CRM name wins over WhatsApp name)
                    # normal load: only fill if missing
                    if contacto_id or not interaction.get("contact_name"):
                        interaction["contact_name"] = contactos_map[cid]
        except Exception as exc:
            logger.warning("debug_interactions: failed to enrich contact names: %s", exc)

    # ── Stats from all interactions ────────────────────────────────────────────
    total = len(all_interactions)
    ok_count = sum(1 for i in all_interactions if i["status"] == "ok")
    error_count = sum(1 for i in all_interactions if i["status"] == "error")
    durations = [i["duration_ms"] for i in all_interactions if i["duration_ms"] is not None]
    avg_ms = round(sum(durations) / len(durations)) if durations else None

    by_channel: dict[str, int] = {}
    for i in all_interactions:
        ch = i["channel"] or "whatsapp"  # legacy events without _channel default to whatsapp
        by_channel[ch] = by_channel.get(ch, 0) + 1

    stats = {
        "total": total,
        "ok": ok_count,
        "errors": error_count,
        "avg_ms": avg_ms,
        "by_channel": by_channel,
    }

    # ── Incremental: devolver todos sin paginar para merge client-side ────────
    if since:
        return {
            "interactions": all_interactions,
            "incremental": True,
            "stats": stats,
        }

    # ── Paginate ───────────────────────────────────────────────────────────────
    offset = (page - 1) * limit
    page_interactions = all_interactions[offset: offset + limit]
    total_pages = math.ceil(total / limit) if total > 0 else 1

    return {
        "interactions": page_interactions,
        "page": page,
        "limit": limit,
        "total": total,
        "pages": total_pages,
        "stats": stats,
    }


# ── Sender classification for metrics ─────────────────────────────────────────
_SENDER_INBOUND = frozenset({"usuario"})
_SENDER_AI = frozenset({
    "agente", "agente_link", "agente_recontacto", "agente_seguimiento", "asistente",
})
_SENDER_HUMAN = frozenset({
    "asesor", "asesor / human in the loop", "human in the loop", "humano",
})
_SENDER_SYSTEM = frozenset({
    "sistema", "/comando",
    "follow_up_5m", "follow_up_correo_1", "follow_up_correo_10m",
    "follow_up_correo_2", "follow_up_pre_correo_1",
})


def _sender_group(remitente: str) -> str:
    r = (remitente or "").lower().strip()
    if r in _SENDER_INBOUND:
        return "inbound"
    if r in _SENDER_AI:
        return "ia"
    if r in _SENDER_HUMAN:
        return "humano"
    if r in _SENDER_SYSTEM:
        return "sistema"
    return "otro"


def _norm_cita_estado(estado: str) -> str:
    e = (estado or "").lower().strip()
    if e in ("cancelada", "canceled"):
        return "cancelada"
    if e in ("realizada", "completada"):
        return "realizada"
    if e in ("reagendada", "reprogramada"):
        return "reagendada"
    if e in ("no_asistio", "no realizada"):
        return "no_asistio"
    return e


def _percentile(arr: list[int | float], p: int) -> int | None:
    if not arr:
        return None
    s = sorted(arr)
    idx = int(len(s) * p / 100)
    return round(s[min(idx, len(s) - 1)])


@router.get("/api/v1/debug/metrics")
async def debug_metrics(
    days: int = Query(default=30, ge=1, le=365),
    empresa_id: int = Query(default=0),
):
    """Aggregated metrics for the benchmark dashboard."""
    try:
        db = await get_supabase()
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        _PAGE = 1000

        async def _fetch_all(
            table: str,
            select: str,
            filters: dict | None = None,
            raw_filters: dict | None = None,
            max_pages: int = 10,
            order_col: str = "created_at",
        ) -> list[dict]:
            rows: list[dict] = []
            for p in range(max_pages):
                rf = {**(raw_filters or {}), "offset": str(p * _PAGE)}
                batch = await db.query(
                    table,
                    select=select,
                    filters=filters if filters else None,
                    raw_filters=rf,
                    order=order_col,
                    order_desc=True,
                    limit=_PAGE,
                ) or []
                rows.extend(batch)
                if len(batch) < _PAGE:
                    break
            return rows

        # ── Build filters ─────────────────────────────────────────────────────
        emp_f: dict | None = {"empresa_id": empresa_id} if empresa_id else None
        msg_raw = {"created_at": f"gte.{cutoff}"}
        cita_raw = {"created_at": f"gte.{cutoff}"}
        contact_raw = {"created_at": f"gte.{cutoff}"}
        debug_done_raw = {
            "created_at": f"gte.{cutoff}",
            "source": "neq.funnel",
            "stage": "eq.run_agent_done",
        }
        debug_err_raw = {
            "created_at": f"gte.{cutoff}",
            "source": "neq.funnel",
            "stage": "in.(inbound_error,error,exception,http_error)",
        }

        # ── Parallel fetch all data ───────────────────────────────────────────
        results = await asyncio.gather(
            _fetch_all("wp_mensajes", "created_at,remitente,modelo_llm", emp_f, msg_raw, max_pages=20),
            _fetch_all("wp_citas", "created_at,estado", emp_f, cita_raw, max_pages=5),
            _fetch_all("debug_events", "created_at,payload", emp_f, debug_done_raw, max_pages=5),
            _fetch_all("debug_events", "created_at,payload", emp_f, debug_err_raw, max_pages=2),
            _fetch_all("wp_contactos", "created_at", emp_f, contact_raw, max_pages=5),
            return_exceptions=True,
        )

        msg_rows = results[0] if isinstance(results[0], list) else []
        cita_rows = results[1] if isinstance(results[1], list) else []
        agent_done_rows = results[2] if isinstance(results[2], list) else []
        error_rows = results[3] if isinstance(results[3], list) else []
        contact_rows = results[4] if isinstance(results[4], list) else []

        # ══════════════════════════════════════════════════════════════════════
        # AGGREGATE: Messages
        # ══════════════════════════════════════════════════════════════════════
        msg_total = len(msg_rows)
        msg_by_group: dict[str, int] = {"inbound": 0, "ia": 0, "humano": 0, "sistema": 0, "otro": 0}
        msg_by_day: dict[str, dict] = {}
        msg_by_model: dict[str, int] = {}
        msg_by_hour = [0] * 24

        for row in msg_rows:
            grp = _sender_group(row.get("remitente", ""))
            msg_by_group[grp] = msg_by_group.get(grp, 0) + 1

            ts = row.get("created_at") or ""
            date_key = ts[:10]
            if date_key:
                day = msg_by_day.setdefault(date_key, {
                    "total": 0, "inbound": 0, "ia": 0, "humano": 0, "sistema": 0,
                })
                day["total"] += 1
                if grp in day:
                    day[grp] += 1

            if len(ts) >= 13:
                try:
                    msg_by_hour[int(ts[11:13])] += 1
                except (ValueError, IndexError):
                    pass

            model = row.get("modelo_llm") or ""
            if model:
                msg_by_model[model] = msg_by_model.get(model, 0) + 1

        msg_by_day_sorted = [{"date": k, **v} for k, v in sorted(msg_by_day.items())]
        msg_by_model_sorted = sorted(
            [{"model": k, "count": v} for k, v in msg_by_model.items()],
            key=lambda x: x["count"], reverse=True,
        )

        # ══════════════════════════════════════════════════════════════════════
        # AGGREGATE: Appointments
        # ══════════════════════════════════════════════════════════════════════
        cita_total = len(cita_rows)
        cita_by_status: dict[str, int] = {}
        cita_by_day: dict[str, dict] = {}

        for row in cita_rows:
            estado = _norm_cita_estado(row.get("estado", ""))
            cita_by_status[estado] = cita_by_status.get(estado, 0) + 1

            ts = row.get("created_at") or ""
            date_key = ts[:10]
            if date_key:
                day = cita_by_day.setdefault(date_key, {"total": 0})
                day["total"] += 1
                day[estado] = day.get(estado, 0) + 1

        cita_by_day_sorted = [{"date": k, **v} for k, v in sorted(cita_by_day.items())]

        # ══════════════════════════════════════════════════════════════════════
        # AGGREGATE: Performance + Tools
        # ══════════════════════════════════════════════════════════════════════
        timings: list[int] = []
        perf_by_agent: dict[str, dict] = {}
        perf_by_model: dict[str, dict] = {}
        perf_by_hour = [0] * 24
        tools_count: dict[str, int] = {}
        tools_duration: dict[str, list] = {}
        tools_errors: dict[str, int] = {}
        tools_by_hour = [0] * 24
        tools_by_agent: dict[str, dict[str, int]] = {}

        for row in agent_done_rows:
            payload = row.get("payload") or {}
            timing = payload.get("timing") or {}
            total_ms = payload.get("total_ms") or timing.get("total_ms")
            agent_name = payload.get("agent_name") or "desconocido"
            model_used = payload.get("model_used") or ""

            if total_ms is not None:
                try:
                    total_ms = int(total_ms)
                except (ValueError, TypeError):
                    total_ms = None

            if total_ms is not None:
                timings.append(total_ms)
                ag = perf_by_agent.setdefault(agent_name, {"count": 0, "total_ms": 0, "durations": []})
                ag["count"] += 1
                ag["total_ms"] += total_ms
                ag["durations"].append(total_ms)

                if model_used:
                    md = perf_by_model.setdefault(model_used, {"count": 0, "total_ms": 0, "durations": []})
                    md["count"] += 1
                    md["total_ms"] += total_ms
                    md["durations"].append(total_ms)

            ts = row.get("created_at") or ""
            if len(ts) >= 13:
                try:
                    perf_by_hour[int(ts[11:13])] += 1
                except (ValueError, IndexError):
                    pass

            for tool in (payload.get("tools_used") or []):
                if not isinstance(tool, dict):
                    continue
                tname = tool.get("tool_name") or "unknown"
                tdur = tool.get("duration_ms")
                tstatus = tool.get("status") or "ok"

                tools_count[tname] = tools_count.get(tname, 0) + 1
                if tdur is not None:
                    tools_duration.setdefault(tname, []).append(tdur)
                if tstatus == "error":
                    tools_errors[tname] = tools_errors.get(tname, 0) + 1

                if len(ts) >= 13:
                    try:
                        tools_by_hour[int(ts[11:13])] += 1
                    except (ValueError, IndexError):
                        pass

                ta = tools_by_agent.setdefault(agent_name, {})
                ta[tname] = ta.get(tname, 0) + 1

        avg_ms = round(sum(timings) / len(timings)) if timings else None
        p50_ms = _percentile(timings, 50)
        p95_ms = _percentile(timings, 95)

        perf_agents = sorted(
            [
                {
                    "agent": name,
                    "count": data["count"],
                    "avg_ms": round(data["total_ms"] / data["count"]) if data["count"] else None,
                    "p50_ms": _percentile(data["durations"], 50),
                    "p95_ms": _percentile(data["durations"], 95),
                }
                for name, data in perf_by_agent.items()
            ],
            key=lambda x: x["count"], reverse=True,
        )

        perf_models = sorted(
            [
                {
                    "model": name,
                    "count": data["count"],
                    "avg_ms": round(data["total_ms"] / data["count"]) if data["count"] else None,
                }
                for name, data in perf_by_model.items()
            ],
            key=lambda x: x["count"], reverse=True,
        )

        tools_stats = sorted(
            [
                {
                    "tool": tname,
                    "count": cnt,
                    "avg_ms": round(sum(tools_duration.get(tname, [])) / len(tools_duration[tname]))
                    if tools_duration.get(tname)
                    else None,
                    "errors": tools_errors.get(tname, 0),
                }
                for tname, cnt in tools_count.items()
            ],
            key=lambda x: x["count"], reverse=True,
        )

        tools_agent_stats = sorted(
            [
                {
                    "agent": agent,
                    "tools": sorted(
                        [{"tool": t, "count": c} for t, c in tmap.items()],
                        key=lambda x: x["count"], reverse=True,
                    ),
                    "total": sum(tmap.values()),
                }
                for agent, tmap in tools_by_agent.items()
            ],
            key=lambda x: x["total"], reverse=True,
        )

        # ══════════════════════════════════════════════════════════════════════
        # AGGREGATE: Errors
        # ══════════════════════════════════════════════════════════════════════
        error_ids: set = set()
        for row in error_rows:
            p = row.get("payload") or {}
            mid = p.get("message_id") or p.get("interaction_id")
            if mid:
                error_ids.add(mid)
        error_count = len(error_ids)
        total_interactions = len(agent_done_rows)
        denom = total_interactions + error_count
        error_rate = round(error_count / denom * 100, 1) if denom > 0 else 0

        # ══════════════════════════════════════════════════════════════════════
        # AGGREGATE: Contacts
        # ══════════════════════════════════════════════════════════════════════
        contact_total = len(contact_rows)
        contact_by_day: dict[str, int] = {}
        for row in contact_rows:
            ts = row.get("created_at") or ""
            date_key = ts[:10]
            if date_key:
                contact_by_day[date_key] = contact_by_day.get(date_key, 0) + 1
        contact_by_day_sorted = [{"date": k, "count": v} for k, v in sorted(contact_by_day.items())]

        # ── Empresas list for filter dropdown ─────────────────────────────────
        empresas = await db.query("wp_empresa_perfil", select="id,nombre", limit=100) or []
        empresas_list = [
            {"id": e["id"], "nombre": e.get("nombre") or f"Empresa {e['id']}"}
            for e in empresas
        ]

        return {
            "period_days": days,
            "empresa_id": empresa_id,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "empresas": empresas_list,
            "messages": {
                "total": msg_total,
                **msg_by_group,
                "by_day": msg_by_day_sorted,
                "by_model": msg_by_model_sorted,
                "by_hour": msg_by_hour,
            },
            "appointments": {
                "total": cita_total,
                "by_status": cita_by_status,
                "by_day": cita_by_day_sorted,
            },
            "performance": {
                "total_interactions": total_interactions,
                "avg_ms": avg_ms,
                "p50_ms": p50_ms,
                "p95_ms": p95_ms,
                "min_ms": min(timings) if timings else None,
                "max_ms": max(timings) if timings else None,
                "errors": error_count,
                "error_rate": error_rate,
                "by_agent": perf_agents,
                "by_model": perf_models,
                "by_hour": perf_by_hour,
            },
            "tools": {
                "total_executions": sum(tools_count.values()),
                "unique_tools": len(tools_count),
                "by_tool": tools_stats,
                "by_hour": tools_by_hour,
                "by_agent": tools_agent_stats,
            },
            "contacts": {
                "new_total": contact_total,
                "by_day": contact_by_day_sorted,
            },
        }

    except Exception as exc:
        logger.error("debug_metrics error: %s", exc)
        return {"error": str(exc), "period_days": days, "empresa_id": empresa_id}


@router.get("/api/v1/debug/agentes")
async def debug_agentes(
    empresa_id: int = Query(0),
):
    """Agentes agrupados por empresa con canales, conversaciones e instrucciones completas."""
    try:
        db = await get_supabase()

        # Campos base (sin los textos largos) — se traen para todos los agentes
        _AG_BASE = "id,nombre_agente,rol,llm,empresa_id,archivado,url_imagen_agente"
        # Campos completos (con instrucciones) — solo cuando se pide un agente específico
        _AG_FULL = (
            "id,nombre_agente,rol,llm,empresa_id,archivado,url_imagen_agente,"
            "instrucciones,comportamiento,restricciones,instrucciones_mensajes,"
            "instrucciones_multimedia,formato_respuesta,areas_de_expertise,"
            "uso_de_emojis,manejo_herramientas,prompt_personalizado,idioma"
        )

        ag_filters: dict = {}
        if empresa_id:
            ag_filters["empresa_id"] = empresa_id

        # Dos pasadas: base rápida para todos, luego completa solo si hay empresa_id
        use_full = bool(empresa_id)
        agents = await db.query(
            "wp_agentes",
            select=_AG_FULL if use_full else _AG_BASE,
            filters=ag_filters or None,
            order="empresa_id",
            limit=500,
        ) or []

        if not agents:
            return {"empresas": [], "empresa_id": empresa_id}

        # Pre-sort por empresa (agrupación) y archivado; el orden por convs se aplica al final en JS
        agents.sort(key=lambda a: (a.get("empresa_id") or 0, bool(a.get("archivado"))))

        # ── IDs de empresa únicos → fetch nombres ─────────────────────────
        emp_ids = list({a["empresa_id"] for a in agents if a.get("empresa_id")})
        empresas_raw = []
        for eid in emp_ids:
            row = await db.query(
                "wp_empresa_perfil",
                select="id,nombre,rubro,ciudad,pais",
                filters={"id": eid},
                single=True,
            )
            if row:
                empresas_raw.append(row)
        emp_map = {e["id"]: e for e in empresas_raw}

        agent_ids = {a["id"] for a in agents}

        # ── Canales por agente (wp_numeros) ───────────────────────────────
        num_filters: dict = {"activo": True}
        if empresa_id:
            num_filters["empresa_id"] = empresa_id
        numeros = await db.query("wp_numeros", select="agente_id,canal", filters=num_filters) or []

        canales_map: dict[int, list[str]] = {}
        seen_canal: dict[int, set] = {}
        for num in numeros:
            aid = num.get("agente_id")
            canal = (num.get("canal") or "").strip()
            if aid and canal and aid in agent_ids:
                seen_canal.setdefault(aid, set())
                if canal not in seen_canal[aid]:
                    seen_canal[aid].add(canal)
                    canales_map.setdefault(aid, []).append(canal)

        # ── Conversaciones por agente y canal ────────────────────────────
        # Supabase tiene max-rows=1000 a nivel PostgREST que ignora ?limit=N.
        # Paginamos con offset hasta agotar todos los registros.
        _PAGE = 1000
        conv_base: dict[str, str] = {}
        if empresa_id:
            conv_base["empresa_id"] = f"eq.{empresa_id}"
        if agent_ids:
            conv_base["agente_id"] = f"in.({','.join(str(i) for i in agent_ids)})"

        conv_map: dict[int, dict[str, int]] = {}
        offset = 0
        while True:
            page_raw = {**conv_base, "offset": str(offset)}
            page: list[dict] = await db.query(
                "wp_conversaciones",
                select="agente_id,canal",
                raw_filters=page_raw,
                limit=_PAGE,
            ) or []
            for conv in page:
                aid = conv.get("agente_id")
                canal = (conv.get("canal") or "desconocido").strip()
                if aid and aid in agent_ids:
                    conv_map.setdefault(aid, {})
                    conv_map[aid][canal] = conv_map[aid].get(canal, 0) + 1
            if len(page) < _PAGE:
                break  # última página
            offset += _PAGE
            if offset >= 500_000:  # tope de seguridad
                break

        # ── Agrupar agentes por empresa ───────────────────────────────────
        def _build_agent(agent: dict) -> dict:
            aid = agent["id"]
            por_canal = conv_map.get(aid, {})
            return {
                "id": aid,
                "nombre": agent.get("nombre_agente") or "Sin nombre",
                "rol": agent.get("rol") or "",
                "llm": agent.get("llm") or "",
                "empresa_id": agent.get("empresa_id"),
                "activo": not agent.get("archivado", False),
                "url_imagen": agent.get("url_imagen_agente") or "",
                "canales": canales_map.get(aid, []),
                "conversaciones_total": sum(por_canal.values()),
                "por_canal": por_canal,
                # Instrucciones — solo presentes cuando se consultó con empresa_id
                "instrucciones": {
                    "instrucciones": agent.get("instrucciones") or "",
                    "comportamiento": agent.get("comportamiento") or "",
                    "restricciones": agent.get("restricciones") or "",
                    "instrucciones_mensajes": agent.get("instrucciones_mensajes") or "",
                    "instrucciones_multimedia": agent.get("instrucciones_multimedia") or "",
                    "formato_respuesta": agent.get("formato_respuesta") or "",
                    "areas_de_expertise": agent.get("areas_de_expertise") or "",
                    "uso_de_emojis": agent.get("uso_de_emojis") or "",
                    "manejo_herramientas": agent.get("manejo_herramientas") or "",
                    "prompt_personalizado": agent.get("prompt_personalizado") or "",
                    "idioma": agent.get("idioma") or "",
                } if use_full else None,
            }

        grupos: dict[int, dict] = {}
        for agent in agents:
            eid = agent.get("empresa_id") or 0
            if eid not in grupos:
                emp = emp_map.get(eid, {})
                grupos[eid] = {
                    "empresa_id": eid,
                    "nombre": emp.get("nombre") or f"Empresa {eid}",
                    "rubro": emp.get("rubro") or "",
                    "ubicacion": f"{emp.get('ciudad') or ''}, {emp.get('pais') or ''}".strip(", "),
                    "agentes": [],
                }
            grupos[eid]["agentes"].append(_build_agent(agent))

        return {"empresas": list(grupos.values()), "empresa_id": empresa_id}

    except Exception as exc:
        logger.error("debug_agentes error: %s", exc)
        return {"empresas": [], "error": str(exc), "empresa_id": empresa_id}


# ─── Editable fields whitelist ────────────────────────────────────────────────
_AG_EDITABLE_FIELDS = {
    "instrucciones", "comportamiento", "restricciones",
    "instrucciones_mensajes", "instrucciones_multimedia",
    "formato_respuesta", "areas_de_expertise", "uso_de_emojis",
    "manejo_herramientas", "prompt_personalizado", "idioma",
    "nombre_agente", "rol", "llm", "archivado",
}


@router.patch("/api/v1/debug/agentes/{agente_id}")
async def patch_agente(agente_id: int, request: Request):
    """Actualiza campos editables de un agente (solo campos permitidos)."""
    try:
        body = await request.json()
        db = await get_supabase()

        # Filtrar solo campos permitidos y no vacíos por accidente
        payload = {k: v for k, v in body.items() if k in _AG_EDITABLE_FIELDS}
        if not payload:
            raise HTTPException(status_code=400, detail="No hay campos válidos para actualizar")

        # Verificar que el agente existe
        existing = await db.query("wp_agentes", filters={"id": agente_id}, single=True)
        if not existing:
            raise HTTPException(status_code=404, detail="Agente no encontrado")

        await db.update("wp_agentes", filters={"id": agente_id}, data=payload)
        return {"ok": True, "agente_id": agente_id, "updated": list(payload.keys())}

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("patch_agente %s error: %s", agente_id, exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/debug/kapso/", response_class=HTMLResponse)
@router.get("/debug/kapso", response_class=HTMLResponse)
async def debug_kapso_dashboard():
    """Dashboard visual de debug para Kapso."""
    config = _get_debug_config()
    return _render_dashboard_html(config)


@router.get("/debug/kapso/stream")
async def debug_kapso_stream():
    """SSE endpoint para el debug dashboard — emite eventos en tiempo real."""

    q = subscribe_sse()

    async def _generate():
        try:
            while True:
                try:
                    entry = await asyncio.wait_for(q.get(), timeout=15.0)
                    yield f"data: {json.dumps(entry, ensure_ascii=False)}\n\n"
                except asyncio.TimeoutError:
                    yield ": heartbeat\n\n"  # keeps connection alive through proxies
        except asyncio.CancelledError:
            pass
        finally:
            unsubscribe_sse(q)

    return StreamingResponse(
        _generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",   # Evita que nginx bufferice el stream
            "Connection": "keep-alive",
        },
    )


@router.get("/debug/kapso/data")
async def debug_kapso_data(limit: int = Query(default=200, ge=1, le=500)):
    """JSON con eventos merged (memoria + Supabase persistido)."""
    events = await _get_merged_events(limit)
    config = _get_debug_config()
    interactions = _build_interactions(events)
    return {
        "fastapi_config": config,
        "fastapi_events": events,
        "interactions": interactions,
    }


@router.post("/debug/kapso/retry/{message_id}")
async def debug_retry_message(message_id: str):
    """Re-ejecuta un mensaje fallido buscando su payload original en debug_events."""
    from app.api.kapso_routes import kapso_inbound
    from app.schemas.kapso import KapsoInboundRequest

    settings = get_settings()

    # Buscar el raw_request en debug_events
    try:
        db = await get_supabase()
        rows = await db.query(
            "debug_events",
            select="payload",
            filters={"source": "kapso", "stage": "inbound_received"},
            order="created_at",
            order_desc=True,
            limit=500,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error consultando debug_events: {exc}")

    raw_request = None
    for row in (rows or []):
        payload = row.get("payload") or {}
        if payload.get("message_id") == message_id:
            raw_request = payload.get("_raw_request")
            break

    if not raw_request:
        raise HTTPException(
            status_code=404,
            detail=f"No se encontró el request original para message_id={message_id}. "
                   "Solo se pueden reintentar mensajes recibidos después de esta actualización.",
        )

    try:
        request = KapsoInboundRequest(**raw_request)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Error reconstruyendo request: {exc}")

    logger.info("debug_retry: re-ejecutando message_id=%s", message_id)
    try:
        result = await kapso_inbound(
            request=request,
            x_kapso_internal_token=settings.KAPSO_INTERNAL_TOKEN,
        )
        return JSONResponse(content={"success": True, "message_id": message_id, "result": result.model_dump()})
    except Exception as exc:
        logger.error("debug_retry: error re-ejecutando message_id=%s: %s", message_id, exc)
        raise HTTPException(status_code=500, detail=f"Error en reintento: {exc}")
