-- Obtener tu UUID real para pruebas
SELECT 
    auth.uid() as user_uuid,
    id as team_humano_id,
    email,
    role_id,
    empresa_id
FROM wp_team_humano 
WHERE auth_uid = auth.uid();

-- O si solo necesitas el UUID:
SELECT auth.uid() as user_uuid;
