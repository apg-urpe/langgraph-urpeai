# Built-in agent tools (channel-agnostic).
from app.tools.crm import (  # noqa: F401
    _create_desactivar_contacto_spam_tool,
    _create_guardar_nota_tool,
    _create_marcar_calificado_tool,
)
from app.tools.scheduling import (  # noqa: F401
    _create_agendar_cita_tool,
    _create_cancelar_cita_tool,
    _create_consultar_disponibilidad_tool,
    _create_reagendar_cita_tool,
)
