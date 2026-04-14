"""
Tests de los endpoints de scheduling (Nylas).

Verifica que:
  1. Cuando ocurre un error inesperado el endpoint retorna
     un response con campo `error` (no un crash 500).
  2. Se llama a send_error_to_webhook con el contexto correcto.
  3. Errores de negocio conocidos (asesor no disponible) se manejan
     correctamente sin llamar al webhook.

Toda comunicación con Supabase, Nylas y el webhook está mockeada.
No se necesitan credenciales reales.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.scheduling_routes import router


# ── Mini app solo con el router de scheduling ─────────────────────────────────
_app = FastAPI()
_app.include_router(router)
client = TestClient(_app, raise_server_exceptions=False)


# ── Payloads de prueba ────────────────────────────────────────────────────────

DISPONIBILIDAD_PAYLOAD = {
    "contacto_id": 999,
    "empresa_id": 1,
    "time_zone_contacto": "America/Bogota",
}

CREAR_EVENTO_PAYLOAD = {
    "contacto_id": 999,
    "empresa_id": 1,
    "start": "2099-06-17T14:00:00",
    "summary": "Consulta | Juan Pérez",
    "attendeeEmail": "juan@example.com",
    "Virtual_presencial": "Virtual",
    "time_zone_contacto": "America/Bogota",
}

REAGENDAR_PAYLOAD = {
    "event_id": "fake_event_id_123",
    "contacto_id": 999,
    "empresa_id": 1,
    "start": "2099-06-18T14:00:00",
    "summary": "Consulta | Juan Pérez",
    "attendeeEmail": "juan@example.com",
    "Virtual_presencial": "Virtual",
    "time_zone_contacto": "America/Bogota",
}

ELIMINAR_PAYLOAD = {
    "event_id": "fake_event_id_123",
    "contacto_id": 999,
}


# ── Helper: mock de SupabaseClient ────────────────────────────────────────────

def _mock_db_empty():
    """Supabase que retorna listas vacías (sin asesores, sin citas)."""
    db = AsyncMock()
    db.query = AsyncMock(return_value=[])
    db.insert = AsyncMock(return_value={"id": 1})
    db.update = AsyncMock(return_value=[])
    return db


def _mock_db_crash():
    """Supabase que lanza excepción en cualquier operación."""
    db = AsyncMock()
    db.query = AsyncMock(side_effect=ConnectionError("Supabase unreachable"))
    return db


# ══════════════════════════════════════════════════════════════════════════════
# /disponibilidad
# ══════════════════════════════════════════════════════════════════════════════

class TestDisponibilidadEndpoint:
    def test_sin_asesores_retorna_error_de_negocio(self):
        """Sin asesores configurados → respuesta válida con hay_disponibilidad=False."""
        with patch("app.services.scheduling.get_supabase", new_callable=AsyncMock) as mock_db, \
             patch("app.services.scheduling.get_nylas", new_callable=AsyncMock):
            mock_db.return_value = _mock_db_empty()
            resp = client.post("/api/v1/scheduling/disponibilidad", json=DISPONIBILIDAD_PAYLOAD)

        assert resp.status_code == 200
        data = resp.json()
        assert data["hay_disponibilidad"] is False
        assert data["contacto_id"] == 999

    def test_error_db_retorna_campo_error_y_notifica_webhook(self):
        """Cuando Supabase falla inesperadamente → error en respuesta + webhook llamado."""
        with patch("app.services.scheduling.get_supabase", new_callable=AsyncMock) as mock_db, \
             patch("app.api.scheduling_routes.send_error_to_webhook", new_callable=AsyncMock) as mock_wh:
            mock_db.return_value = _mock_db_crash()
            resp = client.post("/api/v1/scheduling/disponibilidad", json=DISPONIBILIDAD_PAYLOAD)

        assert resp.status_code == 200
        data = resp.json()
        assert "error" in data
        assert data["error"] is not None
        # Webhook debe haber sido llamado exactamente una vez
        mock_wh.assert_called_once()
        # Con el contexto correcto
        call_kwargs = mock_wh.call_args.kwargs
        assert call_kwargs["context"] == "scheduling_disponibilidad"
        assert call_kwargs["severity"] == "error"

    def test_payload_invalido_retorna_422(self):
        """Payload sin campos requeridos → FastAPI retorna 422."""
        resp = client.post("/api/v1/scheduling/disponibilidad", json={})
        assert resp.status_code == 422


# ══════════════════════════════════════════════════════════════════════════════
# /crear-evento
# ══════════════════════════════════════════════════════════════════════════════

class TestCrearEventoEndpoint:
    def test_sin_asesores_retorna_error_de_negocio(self):
        """Sin asesores disponibles → respuesta con error, sin webhook."""
        with patch("app.services.scheduling.get_supabase", new_callable=AsyncMock) as mock_db, \
             patch("app.services.scheduling.get_nylas", new_callable=AsyncMock), \
             patch("app.api.scheduling_routes.send_error_to_webhook", new_callable=AsyncMock) as mock_wh:
            mock_db.return_value = _mock_db_empty()
            resp = client.post("/api/v1/scheduling/crear-evento", json=CREAR_EVENTO_PAYLOAD)

        assert resp.status_code == 200
        data = resp.json()
        assert data.get("success") is not True
        assert "error" in data
        # Error de negocio (sin asesores) NO debe llamar al webhook
        mock_wh.assert_not_called()

    def test_error_inesperado_retorna_campo_error_y_notifica_webhook(self):
        """Excepción no prevista → campo error en respuesta + webhook llamado."""
        with patch("app.services.scheduling.get_supabase", new_callable=AsyncMock) as mock_db, \
             patch("app.api.scheduling_routes.send_error_to_webhook", new_callable=AsyncMock) as mock_wh:
            mock_db.return_value = _mock_db_crash()
            resp = client.post("/api/v1/scheduling/crear-evento", json=CREAR_EVENTO_PAYLOAD)

        assert resp.status_code == 200
        data = resp.json()
        assert "error" in data
        mock_wh.assert_called_once()
        call_kwargs = mock_wh.call_args.kwargs
        assert call_kwargs["context"] == "scheduling_crear_evento"

    def test_payload_invalido_retorna_422(self):
        resp = client.post("/api/v1/scheduling/crear-evento", json={"contacto_id": 1})
        assert resp.status_code == 422


# ══════════════════════════════════════════════════════════════════════════════
# /reagendar-evento
# ══════════════════════════════════════════════════════════════════════════════

class TestReagendarEventoEndpoint:
    def test_event_id_no_encontrado_retorna_error_de_negocio(self):
        """Cita no existe en BD → error de negocio sin webhook."""
        with patch("app.services.scheduling.get_supabase", new_callable=AsyncMock) as mock_db, \
             patch("app.services.scheduling.get_nylas", new_callable=AsyncMock), \
             patch("app.api.scheduling_routes.send_error_to_webhook", new_callable=AsyncMock) as mock_wh:
            db = AsyncMock()
            db.query = AsyncMock(return_value=None)  # cita no encontrada
            mock_db.return_value = db
            resp = client.post("/api/v1/scheduling/reagendar-evento", json=REAGENDAR_PAYLOAD)

        assert resp.status_code == 200
        data = resp.json()
        assert "error" in data
        mock_wh.assert_not_called()

    def test_error_inesperado_notifica_webhook(self):
        with patch("app.services.scheduling.get_supabase", new_callable=AsyncMock) as mock_db, \
             patch("app.api.scheduling_routes.send_error_to_webhook", new_callable=AsyncMock) as mock_wh:
            mock_db.return_value = _mock_db_crash()
            resp = client.post("/api/v1/scheduling/reagendar-evento", json=REAGENDAR_PAYLOAD)

        assert resp.status_code == 200
        mock_wh.assert_called_once()
        call_kwargs = mock_wh.call_args.kwargs
        assert call_kwargs["context"] == "scheduling_reagendar_evento"


# ══════════════════════════════════════════════════════════════════════════════
# /eliminar-evento
# ══════════════════════════════════════════════════════════════════════════════

class TestEliminarEventoEndpoint:
    def test_event_id_no_encontrado_retorna_error_de_negocio(self):
        with patch("app.services.scheduling.get_supabase", new_callable=AsyncMock) as mock_db, \
             patch("app.services.scheduling.get_nylas", new_callable=AsyncMock), \
             patch("app.api.scheduling_routes.send_error_to_webhook", new_callable=AsyncMock) as mock_wh:
            db = AsyncMock()
            db.query = AsyncMock(return_value=None)
            mock_db.return_value = db
            resp = client.post("/api/v1/scheduling/eliminar-evento", json=ELIMINAR_PAYLOAD)

        assert resp.status_code == 200
        data = resp.json()
        assert "error" in data
        mock_wh.assert_not_called()

    def test_error_inesperado_notifica_webhook(self):
        with patch("app.services.scheduling.get_supabase", new_callable=AsyncMock) as mock_db, \
             patch("app.api.scheduling_routes.send_error_to_webhook", new_callable=AsyncMock) as mock_wh:
            mock_db.return_value = _mock_db_crash()
            resp = client.post("/api/v1/scheduling/eliminar-evento", json=ELIMINAR_PAYLOAD)

        assert resp.status_code == 200
        mock_wh.assert_called_once()
        call_kwargs = mock_wh.call_args.kwargs
        assert call_kwargs["context"] == "scheduling_eliminar_evento"

    def test_payload_invalido_retorna_422(self):
        resp = client.post("/api/v1/scheduling/eliminar-evento", json={})
        assert resp.status_code == 422
