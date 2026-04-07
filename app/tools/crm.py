"""CRM tools — channel-agnostic, write to Supabase (wp_contactos).

These tools are injected into the agent for every channel that has a
contacto_id.  They do not depend on any specific messaging platform.
"""
from __future__ import annotations

import logging

from langchain_core.tools import tool

from app.core.http_client import get_shared_http_client
from app.db.client import get_supabase

logger = logging.getLogger(__name__)

DESACTIVAR_SPAM_URL = (
    "https://vecspltvmyopwbjzerow.supabase.co/functions/v1/apagar-contacto-spam-v1"
)


# ── guardar_nota ──────────────────────────────────────────────────────────────

def _create_guardar_nota_tool(contacto_id: int):
    """Crea un tool guardar_nota con el contacto_id capturado por closure."""

    @tool
    async def guardar_nota(nota: str) -> str:
        """🧠 MEMORIA PERSISTENTE / Tu agenda - Guarda información importante aquí para recordarla en futuras conversaciones.

USA DESPUÉS DE:
✓ Consultar otras herramientas (búsquedas, cálculos, APIs)
✓ Hacer acuerdos o compromisos
✓ Descubrir contexto relevante del contacto
✓ Luego de una búsqueda en la web o información que se requiere para tener contexto en las siguientes interacciones.

GUARDA:
• Resultados de herramientas externas
• Acuerdos y fechas importantes
• Cualquier dato que necesites recordar después

⚠️ CRÍTICO: Sin guardar aquí, perderás toda la información en la próxima conversación. Usa formato: [FECHA] CATEGORÍA: detalles

* No añadir datos que tienen variaciones como disponibilidad de agendas.

Información relevante: deuda, situación financiera, contexto importante.
Sistema de memoria a largo plazo.
No sobre escribas, agrega. Si actualizas sin añadir las notas anteriores puedes perder las notas anteriores.

Args:
    nota: Texto de la nota a guardar. Usa formato [FECHA] CATEGORÍA: detalles
"""
        try:
            supabase = await get_supabase()
            existing = await supabase.query(
                "wp_contactos",
                select="notas",
                filters={"id": contacto_id},
                single=True,
            )
            existing_notas = ""
            if existing and existing.get("notas"):
                existing_notas = str(existing["notas"]).strip()
            updated_notas = f"{existing_notas}\n{nota}" if existing_notas else nota
            await supabase.update(
                "wp_contactos",
                filters={"id": contacto_id},
                data={"notas": updated_notas},
            )
            return f"✅ Nota guardada exitosamente para contacto {contacto_id}."
        except Exception as exc:
            logger.error("Error guardando nota para contacto %s: %s", contacto_id, exc)
            return f"❌ Error al guardar nota: {exc}"

    return guardar_nota


# ── marcar_prospecto_calificado ───────────────────────────────────────────────

def _create_marcar_calificado_tool(contacto_id: int):
    """Crea un tool marcar_prospecto_calificado con el contacto_id capturado por closure."""

    @tool
    async def marcar_prospecto_calificado(es_calificado: str) -> str:
        """✅ Marcar_Prospecto_Calificado — Actualiza estado de calificación del contacto en base de datos.

PROPÓSITO: Registrar en el sistema cuando un prospecto cumple criterios de calificación.

MARCAR "si" cuando el contacto:
- Completó todas las preguntas de perfilación
- Cumple criterios de elegibilidad del servicio
- Está listo para agendar consulta
- No tiene objeciones bloqueantes

MARCAR "no" cuando el contacto:
- No cumple criterios mínimos
- Está fuera del mercado objetivo
- Tiene restricciones que impiden el servicio
- Expresamente no está interesado
- Solicita explícitamente que no quiere recibir más mensajes

MOMENTO DE EJECUCIÓN:
1. Después de completar perfilación
2. Antes de enviar link de calendario (si califica)
3. Una sola vez por contacto en la conversación

IMPORTANTE:
• Esta marca es permanente en el sistema
• Afecta el seguimiento y remarketing futuro
• Se usa para métricas de conversión
• NO cambiar si ya está marcado

NO USAR si no has completado la perfilación, para marcar interés temporal, o si el estado es ambiguo.

FLUJO: Perfilar → Evaluar → Marcar calificación → Si califica: continuar flujo.

Args:
    es_calificado: "si" o "no" (solo minúsculas)
"""
        valor = es_calificado.strip().lower()
        if valor not in ("si", "no"):
            return f"❌ Valor inválido: '{es_calificado}'. Debe ser 'si' o 'no'."
        try:
            supabase = await get_supabase()
            await supabase.update(
                "wp_contactos",
                filters={"id": contacto_id},
                data={"es_calificado": valor},
            )
            return f"✅ Contacto {contacto_id} marcado como es_calificado='{valor}'."
        except Exception as exc:
            logger.error("Error marcando calificación para contacto %s: %s", contacto_id, exc)
            return f"❌ Error al marcar calificación: {exc}"

    return marcar_prospecto_calificado


# ── desactivar_contacto_spam ──────────────────────────────────────────────────

def _create_desactivar_contacto_spam_tool(contacto_id: int, empresa_id: int):
    """Crea un tool para desactivar contacto spam via Supabase Edge Function."""

    @tool
    async def desactivar_contacto_spam() -> str:
        """🚫 Desactivar contacto por comportamiento inadecuado (spam/abuso).

USA ESTA HERRAMIENTA cuando el usuario muestre comportamiento inadecuado:
- Mensajes de spam repetitivos
- Contenido ofensivo, acoso o amenazas
- Intentos de phishing o estafa
- Abuso persistente del canal de comunicación

EFECTO: Desactiva permanentemente el contacto y bloquea futuras conversaciones.

⚠️ IMPORTANTE: Solo usar en casos claros de abuso. Esta acción es irreversible.
No requiere parámetros, se ejecuta automáticamente con los datos del contacto actual.
"""
        try:
            client = get_shared_http_client()
            resp = await client.post(
                DESACTIVAR_SPAM_URL,
                json={"contacto_id": contacto_id, "empresa_id": empresa_id},
                headers={"Content-Type": "application/json"},
            )
            data = resp.json()
            if resp.status_code == 200 and data.get("success"):
                return f"✅ Contacto {contacto_id} desactivado correctamente. {data.get('message', '')}"
            return f"❌ Error al desactivar contacto: {data.get('error', resp.text)}"
        except Exception as exc:
            logger.error("Error desactivando contacto spam %s: %s", contacto_id, exc)
            return f"❌ Error al desactivar contacto: {exc}"

    return desactivar_contacto_spam
