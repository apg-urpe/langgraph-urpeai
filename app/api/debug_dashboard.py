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

from fastapi import APIRouter, HTTPException, Query
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
    days: int = Query(default=30, ge=1, le=365),
    since: str = Query(default=""),  # ISO timestamp — incremental load from SSE
):
    """Paginated interactions from Supabase debug_events, grouped by message_id."""
    try:
        db = await get_supabase()
        cutoff = since if since else (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

        raw_filters: dict = {
            "created_at": f"gte.{cutoff}",
            "source": "neq.funnel",
        }
        filters: dict = {}

        if channel:
            raw_filters["payload->>'_channel'"] = f"eq.{channel}"
        if empresa_id:
            filters["empresa_id"] = empresa_id

        rows = await db.query(
            "debug_events",
            select="*",
            filters=filters if filters else None,
            raw_filters=raw_filters,
            order="created_at",
            order_desc=True,
            limit=2000,
        )
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

    rows = rows or []

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
