---
title: "Sistema de Observabilidad del Chat AI"
---

## 🔎 Visión General

El sistema de observabilidad del Chat AI proporciona una visión profunda del comportamiento, rendimiento y errores de la nueva arquitectura de chat basada en Next.js API Routes y Gemini.

A diferencia del CRM principal que usa `wp_actividades_log`, el Chat AI utiliza su propio esquema dedicado para evitar contaminación de datos y permitir estructuras más flexibles.

## 🏗 Arquitectura

### Base de Datos
Todos los logs se almacenan en el esquema `adaptive_interface`.

**Tabla Principal:** `activity_logs`
- `id`: UUID único
- `session_id`: ID de la sesión de chat
- `user_id`: ID del usuario (relación con `auth.users`)
- `action`: Tipo de evento (ej. `chat.request_completed`)
- `resource_type`: Recurso afectado (`request`, `tool`, `media`)
- `details`: JSONB con métricas detalladas
- `created_at`: Timestamp

### Componentes de Código

1.  **Logger Utilitario** (`lib/chat-activity-logger.ts`)
    - Clase `ChatActivityLogger` para logging estructurado.
    - Maneja el contexto de la solicitud (IP, User Agent, Session ID).
    - Métodos tipados para eventos comunes (`logRequestStarted`, `logToolCalled`, etc.).

2.  **API Route** (`app/api/chat/route.ts`)
    - Integra el logger en 10 puntos clave del ciclo de vida del chat.
    - Captura métricas de latencia, tokens y uso de herramientas.
    - Maneja errores de forma segura asegurando que el log de fallo se escriba.

3.  **Dashboard de Observabilidad** (`components/admin/ObservabilityDashboard.tsx`)
    - Unifica la visualización de logs del CRM y del Chat AI.
    - Muestra métricas de errores, volumen de actividad y salud del sistema.
    - Distingue visualmente entre fuentes con etiquetas "CRM" (Azul) y "AI" (Púrpura).

## 📊 Eventos Registrados

| Evento | Descripción | Detalles Clave |
|--------|-------------|----------------|
| `chat.request_started` | Inicio de una petición HTTP | Method, IP |
| `chat.request_authenticated` | Usuario verificado | User ID, Enterprise ID |
| `chat.request_received` | Body parseado correctamente | Message Length, History Length |
| `gemini.generation_started` | Inicio llamada a LLM | Model, Thinking Level |
| `chat.tool_called` | LLM solicita ejecutar herramienta | Tool Name, Args |
| `chat.tool_completed` | Herramienta finalizó | Success, Duration, Result Summary |
| `gemini.generation_completed` | LLM finalizó respuesta | Duration, Output Length |
| `chat.request_completed` | Ciclo completo exitoso | Total Duration, Status |
| `chat.request_failed` | Error en cualquier punto | Error Message, Error Code |

## 🛠 Guía de Solución de Problemas

### "No veo logs en el dashboard"
1.  **Verificar RLS**: La tabla `activity_logs` tiene políticas de seguridad. Asegúrate de ejecutar el script `scripts/FIX_CHAT_LOGS_RLS.sql` en Supabase.
2.  **Verificar Variables de Entorno**: `SUPABASE_SERVICE_ROLE_KEY` debe estar configurada en `.env` para permitir escrituras privilegiadas.

### "Los logs no tienen Session ID"
- El logger intenta extraer el `session_id` del cuerpo del request. Si falla el parsing inicial, los primeros logs (`request_started`) pueden tener `session_id: null`.

## 📈 Consultas SQL Útiles

```sql
-- Ver herramientas más lentas
SELECT 
  details->>'tool_name' as tool,
  avg((details->>'tool_duration_ms')::int) as avg_duration,
  count(*) as calls
FROM adaptive_interface.activity_logs 
WHERE action = 'chat.tool_completed'
GROUP BY 1 ORDER BY 2 DESC;

-- Tasa de error por modelo
SELECT 
  details->>'model' as model,
  count(*) FILTER (WHERE action = 'chat.request_failed') as errors,
  count(*) FILTER (WHERE action = 'chat.request_completed') as success
FROM adaptive_interface.activity_logs 
GROUP BY 1;
```
