# URPE AI Lab — Arquitectura del Sistema

> Diagramas generados el 2026-04-27 a partir del análisis del código.
> Stack: FastAPI + LangGraph + Supabase + Express bridge + n8n + OpenRouter.

---

## 1. Vista general — Arquitectura de alto nivel

```mermaid
flowchart TB
    subgraph EXT["🌐 Plataformas externas"]
        META["WhatsApp Cloud API<br/>(Meta)"]
        IG_FB["Instagram / Facebook<br/>(Meta)"]
        KAPSO_CLOUD["Kapso Cloud"]
        MC_CLOUD["ManyChat Cloud"]
        GHL_CLOUD["GHL / LeadConnector"]
    end

    subgraph DEPLOY["🐳 Contenedor Docker (Railway test / VPS main)"]
        subgraph BRIDGE["Express Bridge (Node 22) — :3001"]
            BR_WH["Webhook receiver<br/>kapso-bridge/server.mjs"]
            BR_ENRICH["Enriquecimiento<br/>(vision + transcripción)"]
            BR_QUEUE["threadQueues<br/>(cola por phone_number_id)"]
            BR_DEBUG["bridgeDebugEvents<br/>(buffer 200)"]
        end

        subgraph FASTAPI["FastAPI / Uvicorn (Python 3.11) — :8000"]
            FA_INBOUND["Webhooks inbound<br/>kapso/manychat/ghl"]
            FA_AGENT["Agent runner<br/>LangGraph"]
            FA_OUTBOUND["Senders<br/>(kapso/manychat/ghl)"]
            FA_DEBUG["Debug dashboard<br/>+ SSE"]
            FA_RETRY["Retry stuck loop<br/>(cada 5min)"]
            FA_SCHED["Scheduling routes<br/>(proxy a n8n)"]
        end
    end

    subgraph DATA["💾 Persistencia & servicios"]
        SUPA[("Supabase<br/>PostgREST")]
        OR["OpenRouter<br/>(Grok 4.1 fast)"]
        N8N["n8n cloud<br/>(scheduling webhooks)"]
        ERR["Error webhook<br/>(n8n)"]
        NYLAS["Nylas Calendar<br/>(via n8n)"]
    end

    META --> KAPSO_CLOUD --> BR_WH
    IG_FB --> MC_CLOUD --> FA_INBOUND
    IG_FB --> GHL_CLOUD --> FA_INBOUND
    BR_WH --> BR_ENRICH --> BR_QUEUE --> FA_INBOUND
    FA_INBOUND --> FA_AGENT
    FA_AGENT <--> OR
    FA_AGENT <--> SUPA
    FA_AGENT --> N8N --> NYLAS
    FA_AGENT --> FA_OUTBOUND
    FA_OUTBOUND --> KAPSO_CLOUD
    FA_OUTBOUND --> MC_CLOUD
    FA_OUTBOUND --> GHL_CLOUD
    FA_RETRY -.lee.-> SUPA
    FA_RETRY -.reinyecta.-> FA_INBOUND
    FA_DEBUG <-.SSE.-> SUPA
    FASTAPI -.errores 500.-> ERR
    FA_SCHED --> N8N
```

---

## 2. Flujo end-to-end de un mensaje (WhatsApp como ejemplo)

```mermaid
sequenceDiagram
    autonumber
    actor U as Usuario WhatsApp
    participant META as Meta Cloud API
    participant KP as Kapso
    participant BR as Express Bridge :3001
    participant FA as FastAPI :8000<br/>/api/v1/kapso/inbound
    participant DBG as kapso_debug<br/>(buffer + SSE)
    participant SUP as Supabase
    participant FN as Funnel Agent
    participant CU as Contact Update Agent
    participant CA as Conversational Agent
    participant OR as OpenRouter (LLM)
    participant N8 as n8n / Nylas
    participant SND as WhatsApp sender

    U->>META: Mensaje
    META->>KP: webhook
    KP->>BR: POST webhook + secret
    BR->>BR: enriquece (vision/audio)
    BR->>BR: encola en threadQueue por phone_id
    BR->>FA: POST /api/v1/kapso/inbound

    FA->>DBG: stage=inbound_received
    DBG-)SUP: insert debug_events (fire&forget)

    par Phase 1 — paralelo (timeout 20–25s)
        FA->>FN: run_funnel_agent()
        FN->>SUP: lee wp_empresa_embudo + wp_contactos
        FN->>OR: identifica etapa
        FN-->>FA: etapa + contexto
    and
        FA->>CU: run_contact_update_agent()
        CU->>OR: extrae nombre/datos
        CU->>SUP: update wp_contactos
        CU-->>FA: ok
    end

    FA->>FA: build_kapso_system_prompt() + funnel result
    FA->>CA: run_agent() — Phase 2
    loop hasta 4 iteraciones
        CA->>OR: invoke LLM con tools
        OR-->>CA: tool_calls / mensaje
        alt LLM llama herramienta
            CA->>CA: tool_execution_node
            note over CA: agendar_cita / reagendar /<br/>cancelar / consultar_disp /<br/>guardar_nota / marcar_calificado
            opt scheduling
                CA->>N8: webhook crear/reagendar/cancelar
                N8-->>CA: resultado evento
            end
            opt CRM
                CA->>SUP: update wp_contactos / wp_contactos_nota
            end
        else respuesta final
        end
    end

    CA-->>FA: respuesta + tools_used
    FA->>SUP: insert wp_mensajes (in/out)
    FA->>DBG: stage=run_agent_done
    DBG-)SUP: insert debug_events
    FA->>SND: send_message()
    SND->>KP: WhatsAppClient
    KP->>META: respuesta
    META->>U: mensaje del bot
```

---

## 3. Grafo del Conversational Agent (LangGraph)

```mermaid
flowchart LR
    START((START)) --> AG["agent_node<br/>LLM + tools bind"]
    AG -->|"_should_use_tools()<br/>tool_calls?"| DEC{tool_calls?}
    DEC -->|sí| TX["tool_execution_node"]
    DEC -->|no| END((END))
    TX --> CHK{"_should_continue<br/>iter < 4?"}
    CHK -->|sí| AG
    CHK -->|no MAX| END

    subgraph TOOLS["Tools disponibles"]
        T1["consultar_disponibilidad<br/>→ webhook n8n disp-nylas"]
        T2["agendar_cita<br/>→ webhook n8n crear-evento"]
        T3["reagendar_cita<br/>→ webhook n8n reagendar"]
        T4["cancelar_cita<br/>→ webhook n8n cancelar"]
        T5["guardar_nota<br/>→ Supabase wp_contactos_nota"]
        T6["marcar_calificado<br/>→ Supabase wp_contactos"]
        T7["desactivar_contacto_spam<br/>→ Supabase"]
        T8["enviar_reaccion<br/>(WhatsApp emoji)"]
        T9["ejecutar_comando<br/>(WhatsApp CLI)"]
    end

    TX -.invoca.-> TOOLS
```

**Estado** (`AgentState`): `messages`, `tools_used`, `reaction_emoji`, métricas de timing.
**Constraints**: hard cap 4 iteraciones, timeout 30s por LLM call.
**LLM**: `ChatOpenAI` apuntando a OpenRouter (`x-ai/grok-4.1-fast` por defecto), instancias cacheadas en `_llm_cache`.

---

## 4. Multi-canal — adaptadores y senders

```mermaid
flowchart LR
    subgraph IN["Inbound webhooks (FastAPI)"]
        IK["/api/v1/kapso/inbound<br/>kapso_routes.py:1218"]
        IM["/api/v1/manychat/inbound<br/>manychat_routes.py:345"]
        IG["/api/v1/ghl/inbound<br/>ghl_routes.py:182"]
    end

    subgraph CORE["Núcleo común"]
        ADP["channel_adapter<br/>(normaliza payload)"]
        DBG["kapso_debug<br/>(stage events)"]
        AGENT["Funnel + ContactUpdate<br/>+ Conversational"]
    end

    subgraph OUT["Outbound senders"]
        SK["WhatsAppClient<br/>(Kapso /meta/whatsapp)"]
        SM["ManyChat sendContent<br/>api.manychat.com/fb/sending"]
        SG["GHL Conversations API<br/>services.leadconnectorhq.com"]
    end

    IK --> ADP
    IM --> ADP
    IG --> ADP
    ADP --> DBG --> AGENT
    AGENT --> SK
    AGENT --> SM
    AGENT --> SG
```

| Canal | Webhook entrada | Sender |
|-------|-----------------|--------|
| WhatsApp | Kapso → Bridge → `/kapso/inbound` | `WhatsAppClient` (Kapso API) |
| Instagram/FB (ManyChat) | `/manychat/inbound` | `POST api.manychat.com/fb/sending/sendContent` |
| Instagram/FB (GHL) | `/ghl/inbound` | `POST /v1/conversations/{id}/messages` |

---

## 5. Persistencia — tablas Supabase

```mermaid
erDiagram
    wp_empresa_perfil ||--o{ wp_empresa_embudo : configura
    wp_empresa_perfil ||--o{ wp_contactos : tiene
    wp_empresa_perfil ||--o{ wp_agentes : posee
    wp_agentes ||--o{ wp_agente_tools : usa
    wp_contactos ||--o{ wp_conversaciones : abre
    wp_conversaciones ||--o{ wp_mensajes : contiene
    wp_contactos ||--o{ wp_contactos_nota : anota
    wp_contactos ||--o{ wp_citas : agenda
    debug_events }o--|| wp_contactos : refiere

    wp_mensajes {
        uuid id
        timestamp timestamp "PK timing — NO es created_at"
        text contenido
        text direccion
    }
    debug_events {
        uuid id
        text source "kapso/manychat/ghl"
        text stage "inbound_received / run_agent_done / etc"
        jsonb payload "incluye _channel y timing.total_ms"
        uuid empresa_id "puede ser NULL aunque payload lo tenga"
    }
```

> **Gotchas confirmados (CLAUDE.md)**:
> - `wp_mensajes.timestamp` ≠ resto de tablas que usan `created_at`.
> - `debug_events.empresa_id` puede ser NULL aunque `payload.empresa_id` traiga valor.
> - Timing real vive en `payload.timing.total_ms`, no en `payload.total_ms`.

Cliente: `app/db/client.py` — `httpx.AsyncClient` HTTP/2 pooled (20 max, 10 keepalive), 3 reintentos × 0.8s en 502/503/504/HTML.

---

## 6. Observabilidad — debug & SSE

```mermaid
flowchart LR
    subgraph PROD["Eventos producidos"]
        P1["inbound_received"]
        P2["funnel_completed / funnel_error"]
        P3["run_agent_done / run_agent_error"]
        P4["retry_started"]
    end

    subgraph KD["app/core/kapso_debug.py"]
        DEQ["deque(maxlen=200)<br/>buffer en memoria"]
        SUBS["_sse_subscribers<br/>asyncio.Queue por cliente"]
    end

    subgraph SINK["Sinks"]
        SUP[("debug_events<br/>(Supabase)")]
        SSE["SSE stream<br/>/debug/kapso/stream"]
    end

    subgraph UI["Paneles bridge :3001"]
        UK["/debug/kapso<br/>WhatsApp"]
        UM["/debug/manychat"]
        UG["/debug/ghl"]
        UC["/debug/canales<br/>(unificado)"]
        UV["/debug/kapso/visual<br/>diagrama LangGraph"]
    end

    P1 & P2 & P3 & P4 --> DEQ
    DEQ -.fire&forget.-> SUP
    DEQ --> SUBS --> SSE
    SSE --> UK & UM & UG & UC
    SUP -.hidrata al boot.-> DEQ
    UC -.fallback paginado.-> SUP
```

**Hidratación al startup** (`main.py:62`): `hydrate_from_supabase()` carga últimos 200 eventos de `debug_events` para que el dashboard no quede vacío post-restart.

---

## 7. Background loop — retry de mensajes "stuck"

```mermaid
flowchart TB
    BOOT["Startup main.py:64"] -->|delay 60s| LOOP{{"_retry_stuck_loop()<br/>cada 5 min"}}
    LOOP --> CYCLE["run_debug_retry_cycle()<br/>core/debug_retry.py"]

    CYCLE --> Q1["Query debug_events<br/>últimas 2h: stage=inbound_received"]
    CYCLE --> Q2["Query debug_events<br/>últimas 24h: funnel_error"]

    Q1 --> CHK1{"¿hay run_agent_done<br/>correspondiente?"}
    CHK1 -->|no, > 5min| STUCK["Marcar stuck"]
    CHK1 -->|sí| OK1["skip"]

    Q2 --> CHK2{"¿retries < 3?"}
    CHK2 -->|sí| STUCK
    CHK2 -->|no| OK2["skip"]

    STUCK --> DEDUP{"¿retry_started<br/>ya emitido?"}
    DEDUP -->|sí| OK3["skip (dedup)"]
    DEDUP -->|no| EMIT["emite stage=retry_started<br/>+ reinyecta payload original"]
    EMIT --> LOOP

    SHUTDOWN["Lifespan shutdown"] -.cancel().-> LOOP

    style LOOP fill:#fff3cd
    style STUCK fill:#f8d7da
```

**Toggle**: `RETRY_STUCK_ENABLED=false` desactiva el loop (útil para debug).
**Max retries**: 3 por `message_id`.

---

## 8. Scheduling — integración con n8n + Nylas

```mermaid
sequenceDiagram
    autonumber
    participant CA as Conversational Agent
    participant TOOL as tools/scheduling.py
    participant N8 as n8n cloud webhooks
    participant NYLAS as Nylas Calendar
    participant SUP as Supabase wp_citas

    CA->>TOOL: consultar_disponibilidad(asesor, rango)
    TOOL->>N8: POST /webhook/disponibilidad-nylas
    N8->>NYLAS: free/busy query
    NYLAS-->>N8: slots
    N8-->>TOOL: huecos disponibles
    TOOL-->>CA: lista de slots

    CA->>TOOL: agendar_cita(slot, contacto)
    TOOL->>N8: POST /webhook/crear-evento
    N8->>NYLAS: create event
    N8->>SUP: insert wp_citas
    N8-->>TOOL: evento_id + confirmación
    TOOL-->>CA: confirmado

    note over CA,TOOL: reagendar_cita y cancelar_cita<br/>siguen el mismo patrón con sus<br/>webhooks respectivos en n8n.
```

**Webhooks n8n (commits recientes en `f90e186`, `6b0f2df`, `1388d8d`)**:
- `https://marketia.app.n8n.cloud/webhook/disponibilidad-nylas`
- `https://marketia.app.n8n.cloud/webhook/crear-evento`
- `https://marketia.app.n8n.cloud/webhook/reagendar-dashboard`
- `https://marketia.app.n8n.cloud/webhook/cancelar-evento`

**Timeout**: 60s (Nylas + validaciones pueden tardar).
**Política anti-alucinación** (commit `f90e186`): `cancelar_cita` usa estrictamente la respuesta del webhook como fuente de verdad — no inventa confirmaciones.

---

## 9. Manejo de errores — error webhook

```mermaid
flowchart TB
    REQ["Request entrante"] --> MW["error_webhook_middleware<br/>main.py:98"]
    MW --> HND["Route handler"]

    HND -->|ok| RES["Response 2xx/4xx"]
    HND -->|excepción| EXC["global_exception_handler<br/>main.py:145"]
    HND -->|HTTPException 5xx| RES5["Response 5xx"]

    EXC --> CHK1{"¿es debug endpoint?<br/>/debug/* /api/v1/debug/*"}
    RES5 --> CHK2{"¿es debug endpoint?"}

    CHK1 -->|no| WH["send_error_to_webhook()<br/>severity=critical"]
    CHK2 -->|no| WH2["send_error_to_webhook()<br/>severity=error"]
    CHK1 -->|sí| SKIP1["skip (silencio)"]
    CHK2 -->|sí| SKIP2["skip (silencio)"]

    WH & WH2 --> ERRWH["ERROR_WEBHOOK_URL<br/>(n8n) — fire&forget"]

    style WH fill:#f8d7da
    style WH2 fill:#fff3cd
```

---

## 10. Despliegue — dual proceso en un contenedor

```mermaid
flowchart LR
    subgraph IMG["Docker image (node:22-bookworm-slim)"]
        PY["Python 3.11 venv<br/>/opt/venv"]
        APP["/app<br/>(FastAPI source)"]
        BR["/kapso-bridge<br/>(Express source)"]
        DOCS["/docs<br/>(static, montado en /public)"]
    end

    IMG --> ENTRY["docker-entrypoint.sh<br/>+ railway-start.sh"]
    ENTRY --> N["Node Express :3001"]
    ENTRY --> U["Uvicorn FastAPI :8000"]

    N -.INTERNAL_AGENT_API_URL<br/>http://127.0.0.1:8000/api/v1/kapso/inbound.-> U

    subgraph TARGETS["Targets"]
        RAIL["Railway<br/>(branch test)<br/>auto deploy"]
        VPS["VPS Docker<br/>(branch main)<br/>GitHub Actions CI/CD"]
    end

    IMG --> RAIL
    IMG --> VPS
```

**Reglas operativas (CLAUDE.md)**:
- Trabajar siempre en `test` → merge a `main` para producción.
- No mergear con `ort` sin verificar `debug_dashboard.py` y `server.mjs` (merges previos borraron imports).
- `docs/` se copia al image → cambios en docs requieren rebuild.
- Si el bridge crashea, todos los endpoints de WhatsApp caen.

---

## 11. Mapa rápido de archivos clave

| Componente | Archivo |
|------------|---------|
| Entry FastAPI | [main.py](main.py) |
| Bridge Express | [kapso-bridge/server.mjs](kapso-bridge/server.mjs) |
| Webhook WhatsApp | [app/api/kapso_routes.py](app/api/kapso_routes.py) |
| Webhook ManyChat | [app/api/manychat_routes.py](app/api/manychat_routes.py) |
| Webhook GHL | [app/api/ghl_routes.py](app/api/ghl_routes.py) |
| Scheduling routes | [app/api/scheduling_routes.py](app/api/scheduling_routes.py) |
| Conversational agent | [app/agents/conversational.py](app/agents/conversational.py) |
| Funnel agent | [app/agents/funnel.py](app/agents/funnel.py) |
| Contact update agent | [app/agents/contact_update.py](app/agents/contact_update.py) |
| Tool scheduling | [app/tools/scheduling.py](app/tools/scheduling.py) |
| Tool CRM | [app/tools/crm.py](app/tools/crm.py) |
| Cliente Supabase | [app/db/client.py](app/db/client.py) |
| Debug + SSE | [app/core/kapso_debug.py](app/core/kapso_debug.py) |
| Retry loop | [app/core/debug_retry.py](app/core/debug_retry.py) |
| Error webhook | [app/core/error_webhook.py](app/core/error_webhook.py) |
| Dashboard | [app/api/debug_dashboard.py](app/api/debug_dashboard.py) |
| Channel adapter | [app/services/channel_adapter.py](app/services/channel_adapter.py) |
