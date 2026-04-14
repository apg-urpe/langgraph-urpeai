"""
Tests de funciones helper puras de scheduling_routes.

Cubre lógica de negocio sin llamadas a Nylas ni Supabase:
  - _rangos_solapan: detección de solapamiento de rangos horarios
  - _parse_iso_to_unix: parseo de fechas ISO
  - _calcular_slots: generación de slots filtrados por busy periods de Nylas
  - _periodo_dia: clasificación mañana/tarde/noche
"""
import pytest
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from app.services.scheduling import (
    calcular_slots as _calcular_slots,
    parse_iso_to_unix as _parse_iso_to_unix,
    periodo_dia as _periodo_dia,
    rangos_solapan as _rangos_solapan,
)


# ══════════════════════════════════════════════════════════════════════════════
# _rangos_solapan
# ══════════════════════════════════════════════════════════════════════════════

class TestRangosSolapan:
    def test_solapamiento_parcial_izquierda(self):
        # [0──5) vs [3──8) → solapan
        assert _rangos_solapan(0, 5, 3, 8) is True

    def test_solapamiento_parcial_derecha(self):
        # [3──8) vs [0──5) → solapan
        assert _rangos_solapan(3, 8, 0, 5) is True

    def test_solapamiento_contenido(self):
        # A contiene a B
        assert _rangos_solapan(0, 20, 5, 15) is True

    def test_solapamiento_identicos(self):
        assert _rangos_solapan(10, 20, 10, 20) is True

    def test_adyacentes_no_solapan(self):
        # [0──10) vs [10──20) → NO solapan (extremo no incluido)
        assert _rangos_solapan(0, 10, 10, 20) is False

    def test_separados_no_solapan(self):
        assert _rangos_solapan(0, 5, 10, 15) is False

    def test_separados_invertidos_no_solapan(self):
        assert _rangos_solapan(10, 15, 0, 5) is False


# ══════════════════════════════════════════════════════════════════════════════
# _parse_iso_to_unix
# ══════════════════════════════════════════════════════════════════════════════

class TestParseIsoToUnix:
    def test_fecha_hora_basica(self):
        unix, dt = _parse_iso_to_unix("2024-06-15T10:30:00")
        assert isinstance(unix, int)
        assert dt.year == 2024
        assert dt.month == 6
        assert dt.day == 15
        assert dt.hour == 10
        assert dt.minute == 30

    def test_solo_fecha_sin_hora(self):
        unix, dt = _parse_iso_to_unix("2024-12-25")
        assert isinstance(unix, int)
        assert dt.year == 2024
        assert dt.month == 12
        assert dt.day == 25

    def test_unix_es_positivo(self):
        unix, _ = _parse_iso_to_unix("2024-01-01T00:00:00")
        assert unix > 0

    def test_fecha_mas_tarde_mayor_unix(self):
        unix1, _ = _parse_iso_to_unix("2024-01-01T09:00:00")
        unix2, _ = _parse_iso_to_unix("2024-01-01T10:00:00")
        assert unix2 > unix1
        assert unix2 - unix1 == 3600  # exactamente 1 hora


# ══════════════════════════════════════════════════════════════════════════════
# _periodo_dia
# ══════════════════════════════════════════════════════════════════════════════

class TestPeriodoDia:
    def test_manana(self):
        assert _periodo_dia(9) == "Mañana"
        assert _periodo_dia(0) == "Mañana"
        assert _periodo_dia(11) == "Mañana"

    def test_tarde(self):
        assert _periodo_dia(12) == "Tarde"
        assert _periodo_dia(15) == "Tarde"
        assert _periodo_dia(17) == "Tarde"

    def test_noche(self):
        assert _periodo_dia(18) == "Noche"
        assert _periodo_dia(23) == "Noche"


# ══════════════════════════════════════════════════════════════════════════════
# _calcular_slots
# ══════════════════════════════════════════════════════════════════════════════

class TestCalcularSlots:
    TZ = "America/Bogota"

    def _fecha_futura(self):
        """Fecha futura garantizada (2099-06-17)."""
        return datetime(2099, 6, 17, 0, 0, 0, tzinfo=ZoneInfo(self.TZ))

    def test_slots_tienen_campos_requeridos(self):
        fecha = self._fecha_futura()
        slots = _calcular_slots(fecha, [], 60, self.TZ)
        assert len(slots) > 0
        slot = slots[0]
        assert "inicio" in slot
        assert "fin" in slot
        assert "hora" in slot
        assert "startUnix" in slot
        assert "endUnix" in slot

    def test_slot_ocupado_excluido(self):
        fecha = self._fecha_futura()
        slots_libres = _calcular_slots(fecha, [], 60, self.TZ)

        # Ocupar el primer slot disponible
        if slots_libres:
            busy = [{"start": slots_libres[0]["startUnix"], "end": slots_libres[0]["endUnix"]}]
            slots_con_ocupado = _calcular_slots(fecha, busy, 60, self.TZ)
            assert len(slots_con_ocupado) < len(slots_libres)

    def test_todos_ocupados_retorna_vacio(self):
        fecha = self._fecha_futura()
        # Bloquear toda la ventana del día (00:00-24:00)
        start = int(datetime(2099, 6, 17, 0, 0, 0, tzinfo=ZoneInfo(self.TZ)).timestamp())
        end = int(datetime(2099, 6, 18, 0, 0, 0, tzinfo=ZoneInfo(self.TZ)).timestamp())
        busy = [{"start": start, "end": end}]
        slots = _calcular_slots(fecha, busy, 30, self.TZ)
        assert slots == []
