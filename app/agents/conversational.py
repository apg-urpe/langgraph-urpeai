"""Agente conversacional principal — LangGraph + OpenRouter.

Este módulo sólo contiene la lógica del grafo LangGraph y el runner principal
(run_agent).  Todo lo relacionado con canales específicos vive en app/channels/
y las herramientas CRM genéricas viven en app/tools/crm.py.
"""
import asyncio
import logging
import re
import time
import uuid
from typing import Annotated, TypedDict

from langchain_core.callbacks.base import Callbacks
from langchain_core.caches import BaseCache
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages

from app.agents.funnel import ainvoke_with_retry
from app.channels.base import ChannelContext, FastPathResult
from app.channels.registry import get_channel
# Re-export these constants so existing imports keep working:
#   from app.agents.conversational import CLOSING_FOLLOWUP_MARKER
#   from app.agents.conversational import SEND_REACTION_TOOL_NAME
#   from app.agents.conversational import _create_comandos_tool, EJECUTAR_COMANDO_TOOL_NAME
#   from app.agents.conversational import _is_closing_followup, _infer_closing_emoji
from app.channels.whatsapp import (
    CLOSING_FOLLOWUP_MARKER,
    EJECUTAR_COMANDO_TOOL_NAME,
    SEND_REACTION_TOOL_NAME,
    _create_comandos_tool,
    _infer_closing_emoji,
    _is_closing_followup,
    _is_reaction_only_request,
)
from app.core.cache import response_cache
from app.core.config import get_settings
from app.core.error_webhook import send_error_to_webhook
from app.core.http_client import get_shared_http_client
from app.db import queries as db
from app.schemas.chat import (
    AgentRunTrace,
    ChatRequest,
    ChatResponse,
    TimingInfo,
    ToolCall,
    ToolDefinition,
)
from app.tools.crm import (
    _create_desactivar_contacto_spam_tool,
    _create_guardar_nota_tool,
    _create_marcar_calificado_tool,
)
from app.tools.scheduling import (
    _create_agendar_cita_tool,
    _create_cancelar_cita_tool,
    _create_consultar_disponibilidad_tool,
    _create_reagendar_cita_tool,
)

logger = logging.getLogger(__name__)

ChatOpenAI.model_rebuild(_types_namespace={"BaseCache": BaseCache, "Callbacks": Callbacks})


# ── Agent graph state ─────────────────────────────────────────────────────────

class AgentState(TypedDict):
    messages: Annotated[list, add_messages]
    tools_used: list[ToolCall]
    reaction_emoji: str | None
    tool_execution_ms: float
    llm_elapsed_ms: float
    llm_iterations: int
    original_user_message: str
    short_circuit_after_tools: bool
    short_circuit_response: str | None


# ── Module-level constants ────────────────────────────────────────────────────

_llm_cache: dict[str, ChatOpenAI] = {}

MAX_CONVERSATIONAL_LLM_ITERATIONS = 6
AGENT_GRAPH_TIMEOUT_SECONDS = 120
RECOVERY_LLM_TIMEOUT_SECONDS = 20


# ── LLM factory ───────────────────────────────────────────────────────────────

def _create_llm(model: str, max_tokens: int = 1024, temperature: float = 0.7) -> ChatOpenAI:
    """Crea una instancia del LLM usando OpenRouter. Cachea por modelo+params."""
    settings = get_settings()
    cache_key = f"{model}:{max_tokens}:{temperature}"
    if cache_key not in _llm_cache:
        _llm_cache[cache_key] = ChatOpenAI(
            model=model,
            openai_api_key=settings.OPENROUTER_API_KEY,
            openai_api_base=settings.OPENROUTER_BASE_URL,
            temperature=temperature,
            max_tokens=max_tokens,
            request_timeout=30,
            http_async_client=get_shared_http_client(),
        )
        logger.info("LLM creado: model=%s, max_tokens=%s", model, max_tokens)
    return _llm_cache[cache_key]


# ── Graph helpers ─────────────────────────────────────────────────────────────

def _should_use_tools(state: AgentState) -> str:
    last_message = state["messages"][-1]
    if isinstance(last_message, AIMessage) and last_message.tool_calls:
        return "tools"
    return END


def _should_continue_after_tools(state: AgentState) -> str:
    if state.get("short_circuit_after_tools"):
        return END
    iters = int(state.get("llm_iterations", 0))
    # Hard cap: never exceed MAX + 1 iterations
    if iters > MAX_CONVERSATIONAL_LLM_ITERATIONS:
        return END
    # At the limit: allow one extra iteration ONLY so the LLM can
    # generate a text response after tool results (otherwise reply is empty)
    if iters == MAX_CONVERSATIONAL_LLM_ITERATIONS:
        from langchain_core.messages import ToolMessage
        last_msg = state["messages"][-1] if state.get("messages") else None
        if isinstance(last_msg, ToolMessage):
            return "agent"
        return END
    return "agent"


# ── Tool metadata helpers ─────────────────────────────────────────────────────

def _tool_source(tool_obj) -> str:
    name = getattr(tool_obj, "name", "") or ""
    if name == SEND_REACTION_TOOL_NAME:
        return "kapso"
    return "native"


def _tool_description(tool_obj) -> str | None:
    description = getattr(tool_obj, "description", None)
    return str(description).strip() if description else None


def _describe_available_tools(tools: list) -> list[ToolDefinition]:
    return [
        ToolDefinition(
            tool_name=getattr(t, "name", "unknown"),
            description=_tool_description(t),
            source=_tool_source(t),
        )
        for t in tools
    ]


# ── Response text cleanup ─────────────────────────────────────────────────────

_TOOL_LEAK_PATTERNS = re.compile(
    r"^("
    r"[Uu]sar\s+herramienta[s]?\s*[:：].*"
    r"|[Ll]lamar\s+herramienta[s]?\s*[:：].*"
    r"|[Uu]se\s+tool[s]?\s*[:：].*"
    r"|[Cc]all\s+tool[s]?\s*[:：].*"
    r"|[Tt]ool\s+call[s]?\s*[:：].*"
    r"|[Hh]erramienta\s*[:：]\s*\w+.*"
    r"|[Aa]cción\s*[:：]\s*\w+.*"
    r"|→\s*\w+\(.*\).*"
    r")$",
    re.MULTILINE,
)

# Code fences (```json ... ``` o ```...```) que contienen dumps de tool calls.
_TOOL_LEAK_FENCE = re.compile(
    r"```[a-zA-Z]*[ \t]*\r?\n?"
    r"[\s\S]*?"
    r"(?:\"herramienta\"|human[-_]in[-_]the[-_]loop|\"tool[_-]?call\"|\"function[_-]?call\"|\"motivo\"|\"action\")"
    r"[\s\S]*?"
    r"```",
    re.IGNORECASE,
)

# JSON crudo (sin fence) que contiene claves de tool call.
_TOOL_LEAK_JSON = re.compile(
    r"\{[^{}]*?"
    r"\"(?:herramienta|motivo|tool[_-]?call|function[_-]?call|action|human[-_]in[-_]the[-_]loop)\""
    r"[^{}]*?\}",
    re.IGNORECASE | re.DOTALL,
)


def _clean_tool_leaks(text: str) -> str:
    """Remove lines/blocks where the LLM leaked tool usage instructions into the response."""
    if not text:
        return text
    cleaned = _TOOL_LEAK_FENCE.sub("", text)
    cleaned = _TOOL_LEAK_JSON.sub("", cleaned)
    cleaned = _TOOL_LEAK_PATTERNS.sub("", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip()
    # Safeguard: if the cleaner emptied a non-empty response, the regexes were
    # over-aggressive. A raw reply with a visible tool-call leak is less broken
    # than silently dropping the whole answer to the generic courtesy fallback.
    if not cleaned and text.strip():
        return text.strip()
    return cleaned


# ── LangGraph graph builder ───────────────────────────────────────────────────

def _build_graph(llm_with_tools, tools: list) -> StateGraph:
    """Construye el grafo LangGraph para el agente conversacional."""
    tool_map = {getattr(t, "name", ""): t for t in tools}

    async def agent_node(state: AgentState) -> dict:
        """Nodo principal del agente: genera respuesta o decide usar herramientas."""
        t_llm = time.perf_counter()
        response = await ainvoke_with_retry(llm_with_tools, state["messages"])
        llm_elapsed_ms = (time.perf_counter() - t_llm) * 1000
        return {
            "messages": [response],
            "llm_elapsed_ms": round(float(state.get("llm_elapsed_ms", 0)) + llm_elapsed_ms, 1),
            "llm_iterations": int(state.get("llm_iterations", 0)) + 1,
        }

    async def tool_execution_node(state: AgentState) -> dict:
        """Ejecuta herramientas y captura trazas detalladas por invocación."""
        tools_used = list(state.get("tools_used", []))
        reaction_emoji: str | None = state.get("reaction_emoji") or None
        tool_messages: list[ToolMessage] = []
        tool_execution_ms = float(state.get("tool_execution_ms", 0))
        short_circuit_after_tools = False
        short_circuit_response: str | None = state.get("short_circuit_response")
        last_message = state["messages"][-1]

        if not isinstance(last_message, AIMessage) or not last_message.tool_calls:
            return {
                "messages": tool_messages,
                "tools_used": tools_used,
                "reaction_emoji": reaction_emoji,
                "tool_execution_ms": round(tool_execution_ms, 1),
                "short_circuit_after_tools": short_circuit_after_tools,
                "short_circuit_response": short_circuit_response,
            }

        tool_names: list[str] = []
        all_tools_ok = True
        for tc in last_message.tool_calls:
            tool_name = tc.get("name") or "unknown"
            raw_args = tc.get("args") or {}
            tool_input = raw_args if isinstance(raw_args, dict) else {"input": raw_args}
            tool_obj = tool_map.get(tool_name)
            tool_start = time.perf_counter()
            status = "ok"
            error_text: str | None = None

            try:
                if tool_obj is None:
                    raise ValueError(f"Tool no encontrada: {tool_name}")
                result = await tool_obj.ainvoke(tool_input)
                tool_output = str(result)[:1000]
            except Exception as exc:
                status = "error"
                error_text = str(exc)
                tool_output = f"Error ejecutando {tool_name}: {exc}"
                all_tools_ok = False

            duration_ms = (time.perf_counter() - tool_start) * 1000
            tool_execution_ms += duration_ms
            tool_names.append(tool_name)

            tool_messages.append(
                ToolMessage(
                    content=tool_output,
                    name=tool_name,
                    tool_call_id=tc.get("id"),
                )
            )

            tool_call = ToolCall(
                tool_name=tool_name,
                tool_input=tool_input,
                tool_output=tool_output,
                duration_ms=round(duration_ms, 1),
                status=status,
                error=error_text,
                source=_tool_source(tool_obj) if tool_obj is not None else "unknown",
                description=_tool_description(tool_obj) if tool_obj is not None else None,
            )
            tools_used.append(tool_call)

            if tool_name == SEND_REACTION_TOOL_NAME and tool_input.get("emoji"):
                reaction_emoji = str(tool_input["emoji"])

        original_user_message = state.get("original_user_message") or ""
        only_reaction_tools = (
            tool_names
            and all(name == SEND_REACTION_TOOL_NAME for name in tool_names)
            and all_tools_ok
        )
        # Short-circuit after a WhatsApp reaction-only tool call (no follow-up LLM needed)
        if only_reaction_tools and _is_reaction_only_request(original_user_message):
            short_circuit_after_tools = True

        # When only a reaction was called but the message needs more processing
        # give back the iteration so the agent keeps its full budget for real work.
        current_iterations = int(state.get("llm_iterations", 0))
        if only_reaction_tools and not short_circuit_after_tools:
            current_iterations = max(0, current_iterations - 1)

        return {
            "messages": tool_messages,
            "tools_used": tools_used,
            "reaction_emoji": reaction_emoji,
            "tool_execution_ms": round(tool_execution_ms, 1),
            "short_circuit_after_tools": short_circuit_after_tools,
            "short_circuit_response": short_circuit_response,
            "llm_iterations": current_iterations,
        }

    graph = StateGraph(AgentState)
    graph.add_node("agent", agent_node)
    graph.add_node("tools", tool_execution_node)
    graph.set_entry_point("agent")
    graph.add_conditional_edges("agent", _should_use_tools, {"tools": "tools", END: END})
    graph.add_conditional_edges("tools", _should_continue_after_tools, {"agent": "agent", END: END})
    return graph


# ── Memory helpers ────────────────────────────────────────────────────────────

def _memory_to_message(payload: dict | None):
    if not isinstance(payload, dict):
        return None
    role = str(payload.get("role") or "").strip().lower()
    content = payload.get("content")
    if not content:
        return None
    if role in {"user", "human"}:
        return HumanMessage(content=str(content))
    if role in {"assistant", "ai"}:
        return AIMessage(content=str(content))
    if role == "system":
        return SystemMessage(content=str(content))
    return None


async def _load_memory_messages(session_id: str, memory_window: int) -> list:
    try:
        rows = await db.get_agent_memory(session_id, limit=max(memory_window * 2, 2))
    except Exception as exc:
        logger.warning("No se pudo cargar agent_memory session_id=%s: %s", session_id, exc)
        return []
    messages: list = []
    for row in rows:
        message = _memory_to_message(row.get("message"))
        if message is not None:
            messages.append(message)
    return messages


async def _persist_memory_turn(
    session_id: str,
    user_message: str,
    assistant_message: str,
    conversation_id: str,
    model: str,
) -> None:
    try:
        await asyncio.gather(
            db.insert_agent_memory(
                session_id,
                {"role": "user", "content": user_message, "conversation_id": conversation_id},
            ),
            db.insert_agent_memory(
                session_id,
                {"role": "assistant", "content": assistant_message, "conversation_id": conversation_id, "model": model},
            ),
        )
    except Exception as exc:
        logger.warning("No se pudo persistir agent_memory session_id=%s: %s", session_id, exc)


# ── Fast-path response builder ────────────────────────────────────────────────

def _make_fast_path_response(
    fast_path: FastPathResult,
    conversation_id: str,
    model: str,
    memory_session_id: str | None,
    t_start: float,
    request: ChatRequest,
) -> ChatResponse:
    """Builds a ChatResponse directly from a channel fast-path (no LLM invoked)."""
    total_ms = round((time.perf_counter() - t_start) * 1000, 1)
    is_closing = fast_path.response_text == CLOSING_FOLLOWUP_MARKER
    agent_kind = "closing_followup" if is_closing else "response"

    tool_call = ToolCall(
        tool_name=fast_path.tool_name,
        tool_input=fast_path.tool_input,
        tool_output=fast_path.tool_output,
        duration_ms=0.0,
        status="ok",
        error=None,
        source=fast_path.source,
        description=fast_path.description,
    )
    timing = TimingInfo(
        total_ms=total_ms,
        llm_ms=0,
        mcp_discovery_ms=0,
        graph_build_ms=0,
        tool_execution_ms=0,
    )
    agent_runs = [
        AgentRunTrace(
            agent_key="conversational_agent",
            agent_name="Agente Conversacional",
            agent_kind=agent_kind,
            conversation_id=conversation_id,
            memory_session_id=memory_session_id,
            model_used=model,
            system_prompt=request.system_prompt if not is_closing else "",
            user_prompt=request.message,
            available_tools=[],
            tools_used=[tool_call],
            timing=timing,
            llm_iterations=0,
        )
    ]
    return ChatResponse(
        response=fast_path.response_text,
        conversation_id=conversation_id,
        model_used=model,
        tools_used=[tool_call],
        timing=timing,
        agent_runs=agent_runs,
    )


# ── Main entry point ──────────────────────────────────────────────────────────

async def run_agent(request: ChatRequest) -> ChatResponse:
    """Ejecuta el agente conversacional completo."""
    t_start = time.perf_counter()
    settings = get_settings()
    model = request.model or settings.DEFAULT_MODEL
    max_tokens = request.max_tokens or 1024
    temperature = request.temperature if request.temperature is not None else 0.7
    conversation_id = request.conversation_id or str(uuid.uuid4())
    memory_session_id = request.memory_session_id.strip() if request.memory_session_id else None
    memory_window = max(1, request.memory_window or 8)

    channel_name = getattr(request, "channel", None) or "generic"
    channel = get_channel(channel_name)
    ctx = ChannelContext(
        channel=channel_name,
        contacto_id=request.contacto_id,
        empresa_id=request.empresa_id,
    )
    logger.info("run_agent: model=%s max_tokens=%s channel=%s", model, max_tokens, channel_name)

    # ── Fast-path: channel-specific LLM bypass (reactions, farewells, …) ──────
    fast_path = channel.get_fast_path(request.message, ctx)
    if fast_path:
        if memory_session_id:
            is_closing = fast_path.response_text == CLOSING_FOLLOWUP_MARKER
            memory_note = (
                f"[reacción de cierre: {fast_path.tool_input.get('emoji')}]"
                if is_closing
                else fast_path.response_text
            )
            await _persist_memory_turn(memory_session_id, request.message, memory_note, conversation_id, model)
        logger.info(
            "Fast-path '%s' aplicado conversation_id=%s",
            fast_path.source, conversation_id,
        )
        return _make_fast_path_response(fast_path, conversation_id, model, memory_session_id, t_start, request)

    # ── Cache check (only when there is no memory session) ──
    if not memory_session_id:
        cached = response_cache.get(request.system_prompt, request.message, model)
        if cached is not None:
            total_ms = (time.perf_counter() - t_start) * 1000
            logger.info("Cache HIT - total: %.1fms", total_ms)
            return ChatResponse(
                response=cached,
                conversation_id=conversation_id,
                model_used=model,
                tools_used=[],
                timing=TimingInfo(
                    total_ms=round(total_ms, 1), llm_ms=0, mcp_discovery_ms=0, graph_build_ms=0
                ),
                agent_runs=[],
            )

    # ── Build tool list ───────────────────────────────────────────────────────
    t_mcp = time.perf_counter()
    tools: list = []

    # 1. CRM tools — channel-agnostic, write to Supabase
    if request.contacto_id:
        tools.append(_create_guardar_nota_tool(request.contacto_id))
        tools.append(_create_marcar_calificado_tool(request.contacto_id))
        if request.empresa_id:
            tools.append(_create_desactivar_contacto_spam_tool(request.contacto_id, request.empresa_id))

    # 2. Scheduling tools — Nylas calendar operations
    if request.contacto_id and request.empresa_id:
        tools.append(_create_consultar_disponibilidad_tool(request.contacto_id, request.empresa_id))
        tools.append(_create_agendar_cita_tool(request.contacto_id, request.empresa_id))
        tools.append(_create_reagendar_cita_tool(request.contacto_id, request.empresa_id))
        tools.append(_create_cancelar_cita_tool(request.contacto_id))

    # 3. Channel-specific tools (e.g. send_reaction + ejecutar_comando for WhatsApp)
    if request.contacto_id:
        channel_tools = channel.get_tools(ctx)
        tools.extend(channel_tools)
        if channel_tools:
            logger.info(
                "Tools del canal '%s': %s",
                channel_name, [getattr(t, "name", "") for t in channel_tools],
            )

    mcp_discovery_ms = (time.perf_counter() - t_mcp) * 1000
    available_tools = _describe_available_tools(tools)
    logger.info(
        "Tools totales para contacto_id=%s channel=%s: %d",
        request.contacto_id, channel_name, len(tools),
    )

    # ── Enrich system prompt with tool descriptions ───────────────────────────
    system_prompt = request.system_prompt
    if tools:
        tool_lines = []
        for t in tools:
            name = getattr(t, "name", "unknown")
            desc = getattr(t, "description", "") or ""
            schema = getattr(t, "args_schema", None)
            params = (
                ", ".join(schema.model_fields.keys())
                if schema and hasattr(schema, "model_fields")
                else ""
            )
            tool_lines.append(f"- **{name}**({params}): {desc}")
        tool_section = (
            "\n\n---\n\n"
            "## 🔧 HERRAMIENTAS DISPONIBLES\n"
            "Tienes acceso a las siguientes herramientas. DEBES usarlas cuando la situación lo requiera. "
            "No describas la herramienta al usuario ni menciones que la vas a usar; simplemente ejecútala internamente.\n\n"
            + "\n".join(tool_lines)
        )
        system_prompt = system_prompt + tool_section

    # ── Create LLM + compile graph ────────────────────────────────────────────
    llm = _create_llm(model, max_tokens, temperature)
    llm_with_tools = llm.bind_tools(tools)
    t_graph = time.perf_counter()
    graph = _build_graph(llm_with_tools, tools)
    compiled = graph.compile()
    graph_build_ms = (time.perf_counter() - t_graph) * 1000

    # ── Prepare initial messages ──────────────────────────────────────────────
    messages = [SystemMessage(content=system_prompt)]
    if memory_session_id:
        memory_messages = await _load_memory_messages(memory_session_id, memory_window)
        messages.extend(memory_messages)
    messages.append(HumanMessage(content=request.message))

    initial_state: AgentState = {
        "messages": messages,
        "tools_used": [],
        "reaction_emoji": None,
        "tool_execution_ms": 0,
        "llm_elapsed_ms": 0,
        "llm_iterations": 0,
        "original_user_message": request.message,
        "short_circuit_after_tools": False,
        "short_circuit_response": None,
    }

    # ── Execute graph ─────────────────────────────────────────────────────────
    timed_out = False
    try:
        final_state = await asyncio.wait_for(
            compiled.ainvoke(initial_state),
            timeout=AGENT_GRAPH_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError as timeout_exc:
        logger.warning("run_agent timeout after %ss", AGENT_GRAPH_TIMEOUT_SECONDS)
        await send_error_to_webhook(
            timeout_exc,
            context="conversational_agent_timeout",
            severity="warning",
            fallback="El agente conversacional excedió el timeout. Se devolvió respuesta parcial.",
        )
        timed_out = True
        final_state = initial_state

    # ── Extract response ──────────────────────────────────────────────────────
    short_circuit_response = final_state.get("short_circuit_response")
    last_message = final_state["messages"][-1] if final_state.get("messages") else None
    if short_circuit_response:
        response_text = short_circuit_response
    elif timed_out:
        response_text = ""
    else:
        response_text = str(last_message.content or "") if isinstance(last_message, AIMessage) else ""

    # ── Recovery pass: force a text reply when the graph ended without one ────
    # Triggered when the LLM kept calling tools until the iteration cap, or
    # produced an AIMessage with empty content. We re-invoke the LLM WITHOUT
    # tools and with an explicit nudge, so it has to summarise into text.
    recovery_used = False
    if (
        not short_circuit_response
        and not timed_out
        and not response_text.strip()
        and final_state.get("messages")
    ):
        try:
            recovery_messages = list(final_state["messages"]) + [
                HumanMessage(
                    content=(
                        "Responde ahora al usuario con un mensaje de texto claro y breve "
                        "usando la información que ya obtuviste. NO llames más herramientas: "
                        "solo redacta la respuesta final."
                    )
                )
            ]
            recovery_response = await asyncio.wait_for(
                ainvoke_with_retry(llm, recovery_messages),
                timeout=RECOVERY_LLM_TIMEOUT_SECONDS,
            )
            if isinstance(recovery_response, AIMessage):
                recovered_text = str(recovery_response.content or "")
                if recovered_text.strip():
                    response_text = recovered_text
                    recovery_used = True
                    logger.info(
                        "run_agent: recovery LLM produjo %d chars tras grafo vacío",
                        len(recovered_text),
                    )
        except Exception:
            logger.exception("run_agent.recovery_invocation_failed")

    raw_response_text = response_text
    response_text = _clean_tool_leaks(response_text)

    # ── Empty-reply detection: notify webhook with root cause ─────────────────
    # The caller will fall back to a generic courtesy message; we surface the
    # cause (timeout, iterations exhausted, empty AIMessage, or over-aggressive
    # cleaner) so we can act on patterns instead of guessing from the symptom.
    if not response_text.strip() and not short_circuit_response:
        iters_final = int(final_state.get("llm_iterations", 0))
        last_msg_type = type(last_message).__name__ if last_message is not None else "None"
        last_msg_content_len = len(str(getattr(last_message, "content", "") or ""))
        last_msg_tool_calls = (
            len(getattr(last_message, "tool_calls", None) or [])
            if isinstance(last_message, AIMessage)
            else 0
        )

        if timed_out:
            empty_reason = "timeout"
        elif raw_response_text.strip():
            empty_reason = "response_cleared_by_clean_tool_leaks"
        elif iters_final > MAX_CONVERSATIONAL_LLM_ITERATIONS and last_msg_type == "ToolMessage":
            empty_reason = "iterations_exhausted_with_pending_tools"
        elif last_msg_type == "AIMessage" and last_msg_content_len == 0:
            empty_reason = "llm_returned_empty_aimessage"
        else:
            empty_reason = "unknown_empty_response"

        # Timeout ya fue notificado arriba; no duplicamos.
        if not timed_out:
            try:
                empty_exc = RuntimeError(
                    f"Conversational agent devolvió respuesta vacía ({empty_reason}). "
                    f"iters={iters_final}, last_msg={last_msg_type}, "
                    f"content_len={last_msg_content_len}, tool_calls={last_msg_tool_calls}, "
                    f"raw_preview={raw_response_text[:200]!r}, "
                    f"model={model}, conversation_id={conversation_id}, channel={channel_name}"
                )
                await send_error_to_webhook(
                    empty_exc,
                    context=f"conversational_agent_empty_reply:{empty_reason}",
                    severity="warning",
                    fallback="Se enviará mensaje genérico de cortesía al usuario.",
                )
            except Exception:
                logger.exception("error_webhook.notify_failed_for_empty_reply")

    if memory_session_id:
        await _persist_memory_turn(memory_session_id, request.message, response_text, conversation_id, model)
    if not memory_session_id and response_text.strip():
        response_cache.set(request.system_prompt, request.message, model, response_text)

    total_ms = (time.perf_counter() - t_start) * 1000
    llm_ms = float(final_state.get("llm_elapsed_ms", 0))
    tool_execution_ms = float(final_state.get("tool_execution_ms", 0))
    timing = TimingInfo(
        total_ms=round(total_ms, 1),
        llm_ms=round(llm_ms, 1),
        mcp_discovery_ms=round(mcp_discovery_ms, 1),
        graph_build_ms=round(graph_build_ms, 1),
        tool_execution_ms=round(tool_execution_ms, 1),
    )
    logger.info(
        "Timing - total: %sms | llm: %sms | mcp: %sms | graph: %sms | recovery_used=%s",
        timing.total_ms, timing.llm_ms, timing.mcp_discovery_ms, timing.graph_build_ms, recovery_used,
    )

    agent_runs = [
        AgentRunTrace(
            agent_key="conversational_agent",
            agent_name="Agente Conversacional",
            agent_kind="response",
            conversation_id=conversation_id,
            memory_session_id=memory_session_id,
            model_used=model,
            system_prompt=request.system_prompt,
            user_prompt=request.message,
            available_tools=available_tools,
            tools_used=final_state.get("tools_used", []),
            timing=timing,
            llm_iterations=int(final_state.get("llm_iterations", 0)),
        )
    ]

    return ChatResponse(
        response=response_text,
        conversation_id=conversation_id,
        model_used=model,
        tools_used=final_state.get("tools_used", []),
        timing=timing,
        agent_runs=agent_runs,
    )
