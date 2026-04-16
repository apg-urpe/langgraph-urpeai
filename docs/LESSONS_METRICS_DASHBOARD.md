# Lesson: Why we removed the "Metricas" dashboard tab

**Status:** Attempted April 2026, removed. Do **not** rebuild without reading this first.

The Events PWA (`/events/app`) used to have three tabs: Debug, Agentes, Metricas.
The Metricas tab aggregated global stats (messages, citas, timing avg, tools usage, contacts)
over configurable periods (7/30/90/180/365 days) and empresas.

We removed it because the benefits never outweighed the operational cost.
This document is the postmortem so nobody repeats the same mistakes.

---

## What it did

A benchmark dashboard showing:

- Mensajes (total, inbound/IA/humano/sistema, by day, by hour, by model)
- Citas (total, by estado, by day)
- Rendimiento (avg / p50 / p95 response time, by agent, by model, by hour)
- Herramientas (executions count, by tool, by hour, by agent)
- Contactos nuevos (total, by day)
- Tasa de error

Data came from `wp_mensajes`, `wp_citas`, `debug_events`, `wp_contactos`.

---

## Why we removed it

### 1. It kept crashing production

The root cause was that the metrics endpoint fired **many** Supabase queries
(up to ~15 parallel when computing a 30-day global view). Those queries saturated
the Supabase connection pool and triggered cascading `503 status transitorio`
errors that **also affected the real-time inbound pipeline** (`kapso_inbound_exception`).

Quote from the logs of one incident:

> Error: ValueError
> Mensaje: Supabase devolvió status transitorio 503 en intento 3/3
> Contexto: kapso_inbound_exception

A nice-to-have dashboard was taking production down. That's never an acceptable trade-off.

### 2. The "fix it with more code" arms race

We tried, in order:

| Fix                                                    | Problem that appeared                             |
| ------------------------------------------------------ | ------------------------------------------------- |
| Parallel page fetches                                  | Hit Supabase concurrency limits → 503             |
| `asyncio.Semaphore(3)` to throttle                     | Still slow for 30-day / Todas las empresas        |
| Per-page timeout 5 → 8s                                | Pages still timed out on large datasets           |
| `count=exact` header for accurate totals               | `select=created_at` failed on `wp_mensajes`       |
|                                                        | (it uses `timestamp`, not `created_at`)           |
| Fetch-all with empresa filter on `debug_events`        | `run_agent_done` rows had `empresa_id=NULL` in    |
|                                                        | the column → no results → "Tiempo AVG —"          |
| Python-side empresa filter (check column OR payload)   | Works but still requires fetching every row       |
| PostgreSQL RPC `metrics_dashboard()` (aggregation      | Would have worked — but requires migrations       |
| server-side)                                           | and ongoing schema maintenance                    |
| 5-minute response cache + in-flight dedup              | Great for reducing load, but hid how expensive    |
|                                                        | the actual query was                              |

Each fix removed one symptom and revealed the next. After ~10 iterations the
code was a pile of defensive layers (semaphores, timeouts, aborts, fallbacks,
caches, dedup, diagnostic footers) around a fundamentally expensive operation.

### 3. The tab wasn't delivering enough value

For all that complexity, the user feedback was things like "no me gustó cómo
quedó" and "sigue sin funcionar". The visual output was hard to read on mobile,
the timing KPI frequently showed `—` (empty), and empresas with a lot of
traffic (Insolvec) could never load the 30-day view reliably.

### 4. The Debug tab already covers the real need

90% of the questions we wanted to answer ("what is this agent doing right now?",
"why did this interaction fail?", "is there a timing regression?") are better
answered by the existing Debug tab, which:

- Shows recent interactions with full trace
- Already has per-interaction timing (`run_agent_done.payload.timing.total_ms`)
- Only loads the latest N rows (bounded cost)
- Has SSE live updates instead of polling

We were building a second, parallel observability stack for stats that would
be better served by Grafana / Logflare / a dedicated analytics tool, not
another endpoint that hits Supabase directly.

---

## Lessons to take to the next observability attempt

1. **Don't aggregate in application code over the REST API.**
   If you want `AVG`, `percentile`, `COUNT GROUP BY`, run it in PostgreSQL,
   either through an RPC function, a materialized view refreshed on a cron,
   or a dedicated analytics pipeline. Transferring millions of rows over
   HTTPS to compute averages in Python is always going to fight you.

2. **`wp_mensajes` uses `timestamp`, not `created_at`.**
   Every other table in this schema uses `created_at`. This tripped us up
   twice (filter + count query). If you ever write a new query against
   `wp_mensajes`, use the right column.

3. **`debug_events.empresa_id` (the column) can be NULL even when the
   payload has it.** Never rely on `empresa_id=eq.X` alone on this table.
   Either filter on `payload->>'empresa_id'` in SQL, or fetch without
   empresa filter and post-filter in Python.

4. **Concurrent Supabase requests from the metrics endpoint will affect
   the inbound message pipeline.** They share the same connection pool.
   A single-tenant read-only dashboard should never be able to take down
   the writer path. If it can, the design is wrong.

5. **`Prefer: count=exact` adds significant cost on huge filtered tables.**
   For a table with millions of rows and a date filter without a good index,
   `count=exact` has to scan matches. Use `count=planned` or `count=estimated`
   if you ever do need counts without slowing down the query.

6. **PostgREST `stage=in.(a,b)` filter was unreliable in our setup.**
   We saw it return 0 rows when we expected many. Using `stage=eq.a` in a
   separate query worked. Root cause never fully diagnosed — could have been
   URL-encoding of parentheses, a specific PostgREST version quirk, or
   something else. If you need a multi-value stage filter, test it in
   isolation first.

7. **Timing data lives at `payload->timing->total_ms`, not `payload->total_ms`.**
   The `timing` key contains a `TimingInfo` sub-object (`total_ms`, `llm_ms`,
   `mcp_discovery_ms`, `graph_build_ms`, `tool_execution_ms`).

8. **If you do rebuild this, do it somewhere else.**
   A separate analytics service (Metabase / Grafana / a nightly job writing
   to a small summary table) is almost certainly a better fit than a
   FastAPI endpoint. The main app process should not be the aggregator.

---

## What remains in the repo

- `docs/LESSONS_METRICS_DASHBOARD.md` (this file)
- `CLAUDE.md` has a short note under the observability section pointing here

All of the following were **removed** in the same commit that created this doc:

- `app/api/debug_dashboard.py`: `debug_metrics()` endpoint, `_compute_metrics()`,
  sender/estado classification helpers, percentile helper, metrics cache
  constants.
- `kapso-bridge/server.mjs`: `/events/api/metrics` proxy, `.metrics-screen`
  markup, `.m-*` CSS, third tab button, `mBarChart`/`mHourChart`/`mHBarRows`/
  `citaPill`/`renderMetrics`/`loadMetrics`/`fmtNum`/`fmtMs`/`fmtPct` JS.
- `scripts/sql/metrics_dashboard.sql`: PL/pgSQL aggregation function.

The Events PWA now has exactly two tabs: **Debug** and **Agentes**.
