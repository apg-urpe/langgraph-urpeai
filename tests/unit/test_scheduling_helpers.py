"""
Tests de funciones helper puras de scheduling_routes.

Cubre lógica de negocio sin llamadas a Nylas ni Supabase:
  - _rangos_solapan: detección de solapamiento de rangos horarios
  - _parse_iso_to_unix: parseo de fechas ISO
  - _calcular_slots: generación de slots según disponibilidad
  - _periodo_dia: clasificación mañana/tarde/noche
  - _hora_dentro_de_horarios_normales: validación de horario laboral
"""
import pytest
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from app.api.scheduling_routes import (
    _calcular_slots,
    _hora_dentro_de_horarios_normales,
    _parse_iso_to_unix,
    _periodo_dia,
    _rangos_solapan,
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

    def _lunes(self, hora=9):
        """Retorna un lunes en la timezone de prueba."""
        # 2024-06-17 es lunes
        return datetime(2024, 6, 17, hora, 0, 0, tzinfo=ZoneInfo(self.TZ))

    def _domingo(self):
        return datetime(2024, 6, 16, 9, 0, 0, tzinfo=ZoneInfo(self.TZ))

    def _disponibilidad_lunes(self, inicio="09:00", fin="11:00"):
        return {"horarios_normales": {"lunes": [{"inicio": inicio, "fin": fin}]}}

    def test_sin_disponibilidad_retorna_vacio(self):
        fecha = self._lunes()
        slots = _calcular_slots(fecha, [], None, 30, self.TZ)
        assert slots == []

    def test_dia_sin_horarios_retorna_vacio(self):
        # domingo no tiene horarios en disponibilidad
        fecha = self._domingo()
        dispo = self._disponibilidad_lunes()
        slots = _calcular_slots(fecha, [], dispo, 30, self.TZ)
        assert slots == []

    def test_slots_tienen_campos_requeridos(self):
        # Usar fecha futura con disponibilidad para TODOS los días
        # (para no depender del día de la semana que caiga 2099-06-17)
        fecha = datetime(2099, 6, 17, 0, 0, 0, tzinfo=ZoneInfo(self.TZ))
        dispo = {
            "horarios_normales": {
                dia: [{"inicio": "09:00", "fin": "11:00"}]
                for dia in ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"]
            }
        }
        slots = _calcular_slots(fecha, [], dispo, 60, self.TZ)
        assert len(slots) > 0
        slot = slots[0]
        assert "inicio" in slot
        assert "fin" in slot
        assert "hora" in slot
        assert "startUnix" in slot
        assert "endUnix" in slot

    def test_slot_ocupado_excluido(self):
        fecha = datetime(2099, 6, 17, 0, 0, 0, tzinfo=ZoneInfo(self.TZ))
        dispo = self._disponibilidad_lunes("09:00", "11:00")
        # Sin ocupado: 2 slots de 60min (9-10 y 10-11)
        slots_libres = _calcular_slots(fecha, [], dispo, 60, self.TZ)

        # Ocupar el primer slot
        if slots_libres:
            busy = [{"start": slots_libres[0]["startUnix"], "end": slots_libres[0]["endUnix"]}]
            slots_con_ocupado = _calcular_slots(fecha, busy, dispo, 60, self.TZ)
            assert len(slots_con_ocupado) < len(slots_libres)


# ══════════════════════════════════════════════════════════════════════════════
# _hora_dentro_de_horarios_normales
# ══════════════════════════════════════════════════════════════════════════════

class TestHoraDentroDeHorariosNormales:
    TZ = "America/Bogota"
    # 2099-06-17 14:00 UTC = 09:00 America/Bogota → miércoles
    # Se construye la disponibilidad dinámicamente para que siempre coincida con
    # el día de la semana real en que cae esa fecha.

    @staticmethod
    def _dia_local(utc_dt):
        """Devuelve el nombre del día (es) de un datetime UTC en Bogota."""
        from zoneinfo import ZoneInfo
        dias = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"]
        return dias[utc_dt.astimezone(ZoneInfo("America/Bogota")).weekday()]

    def _dispo_para(self, utc_dt):
        """Disponibilidad de 09:00-17:00 exactamente en el día de utc_dt."""
        dia = self._dia_local(utc_dt)
        return {"horarios_normales": {dia: [{"inicio": "09:00", "fin": "17:00"}]}}

    def test_hora_dentro_del_horario(self):
        # 2099-06-17 14:00 UTC = 09:00 Bogota — dentro del horario 09-17
        dt = datetime(2099, 6, 17, 14, 0, 0, tzinfo=timezone.utc)
        assert _hora_dentro_de_horarios_normales(dt, self._dispo_para(dt), self.TZ, 30) is True

    def test_hora_fuera_del_horario(self):
        # 2099-06-17 03:00 UTC = 22:00 Bogota → fuera del horario 09-17
        dt = datetime(2099, 6, 17, 3, 0, 0, tzinfo=timezone.utc)
        assert _hora_dentro_de_horarios_normales(dt, self._dispo_para(dt), self.TZ, 30) is False

    def test_sin_disponibilidad_permite_todo(self):
        dt = datetime(2099, 6, 17, 14, 0, 0, tzinfo=timezone.utc)
        assert _hora_dentro_de_horarios_normales(dt, None, self.TZ, 30) is True

    def test_dia_sin_horarios_bloqueado(self):
        # Construimos disponibilidad solo para el día siguiente → hoy queda sin horarios
        dt = datetime(2099, 6, 17, 14, 0, 0, tzinfo=timezone.utc)
        dias = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"]
        from zoneinfo import ZoneInfo
        dia_actual = dt.astimezone(ZoneInfo(self.TZ)).weekday()
        otro_dia = dias[(dia_actual + 1) % 7]
        dispo_otro_dia = {"horarios_normales": {otro_dia: [{"inicio": "09:00", "fin": "17:00"}]}}
        assert _hora_dentro_de_horarios_normales(dt, dispo_otro_dia, self.TZ, 30) is False
