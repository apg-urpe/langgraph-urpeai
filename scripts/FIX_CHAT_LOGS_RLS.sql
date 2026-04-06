-- Habilitar RLS en la tabla (si no lo está)
ALTER TABLE adaptive_interface.activity_logs ENABLE ROW LEVEL SECURITY;

-- 1. Política para permitir INSERT a usuarios autenticados y service roles
CREATE POLICY "Permitir inserción de logs para usuarios autenticados"
ON adaptive_interface.activity_logs
FOR INSERT
TO authenticated, service_role
WITH CHECK (true);

-- 2. Política para permitir SELECT (ver logs) a usuarios autenticados (admins)
CREATE POLICY "Permitir ver logs a usuarios autenticados"
ON adaptive_interface.activity_logs
FOR SELECT
TO authenticated, service_role
USING (true);

-- 3. Política para message_requests (si falta)
ALTER TABLE adaptive_interface.message_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir todo en message_requests para usuarios autenticados"
ON adaptive_interface.message_requests
FOR ALL
TO authenticated, service_role
USING (true)
WITH CHECK (true);

-- 4. Política para chat_messages (si falta)
ALTER TABLE adaptive_interface.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir todo en chat_messages para usuarios autenticados"
ON adaptive_interface.chat_messages
FOR ALL
TO authenticated, service_role
USING (true)
WITH CHECK (true);
