-- ============================================================================
-- CONTACT PAUSE SYSTEM - Schema Migration
-- ============================================================================
-- This script adds support for temporarily pausing contacts
-- 
-- Features:
--   - Temporary pause (5, 15, 30 minutes)
--   - Permanent deactivation
--   - Automatic reactivation via cron/scheduled function (optional)
-- ============================================================================

-- Step 1: Add paused_until column to wp_contactos (if not exists)
-- This column stores the ISO timestamp when the pause should expire
-- NULL = permanent deactivation or not paused

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'wp_contactos' 
        AND column_name = 'paused_until'
    ) THEN
        ALTER TABLE wp_contactos 
        ADD COLUMN paused_until TIMESTAMPTZ DEFAULT NULL;
        
        COMMENT ON COLUMN wp_contactos.paused_until IS 
            'ISO timestamp indicating when a temporary pause expires. NULL means permanent deactivation or active contact.';
    END IF;
END $$;

-- Step 2: Create index for efficient querying of paused contacts
CREATE INDEX IF NOT EXISTS idx_wp_contactos_pause_status 
ON wp_contactos (is_active, paused_until) 
WHERE is_active = false;

-- Step 3: Create a function to auto-reactivate expired pauses
-- This can be called by a cron job or pg_cron extension
CREATE OR REPLACE FUNCTION reactivate_expired_pauses()
RETURNS INTEGER AS $$
DECLARE
    reactivated_count INTEGER;
BEGIN
    UPDATE wp_contactos
    SET 
        is_active = true,
        paused_until = NULL,
        updated_at = NOW()
    WHERE 
        is_active = false
        AND paused_until IS NOT NULL
        AND paused_until <= NOW();
    
    GET DIAGNOSTICS reactivated_count = ROW_COUNT;
    
    RETURN reactivated_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION reactivate_expired_pauses() IS 
    'Reactivates contacts whose pause period has expired. Returns the number of contacts reactivated.';

-- Step 4: Create a view for easily querying contact pause status
CREATE OR REPLACE VIEW vw_contact_pause_status AS
SELECT 
    id,
    nombre,
    apellido,
    telefono,
    email,
    empresa_id,
    is_active,
    paused_until,
    CASE 
        WHEN is_active = true THEN 'active'
        WHEN is_active = false AND paused_until IS NULL THEN 'deactivated_permanent'
        WHEN is_active = false AND paused_until > NOW() THEN 'paused_temporary'
        WHEN is_active = false AND paused_until <= NOW() THEN 'pause_expired'
        ELSE 'unknown'
    END AS pause_status,
    CASE 
        WHEN paused_until IS NOT NULL AND paused_until > NOW() THEN
            EXTRACT(EPOCH FROM (paused_until - NOW()))::INTEGER
        ELSE NULL
    END AS seconds_remaining
FROM wp_contactos;

COMMENT ON VIEW vw_contact_pause_status IS 
    'View showing contact pause status with calculated fields for UI display.';

-- ============================================================================
-- OPTIONAL: pg_cron job for automatic reactivation
-- Uncomment if you have pg_cron extension installed
-- ============================================================================
-- SELECT cron.schedule(
--     'reactivate-paused-contacts',
--     '* * * * *',  -- Run every minute
--     'SELECT reactivate_expired_pauses();'
-- );

-- ============================================================================
-- Usage Examples
-- ============================================================================

-- Pause a contact for 15 minutes:
-- UPDATE wp_contactos 
-- SET is_active = false, paused_until = NOW() + INTERVAL '15 minutes', updated_at = NOW()
-- WHERE id = 123;

-- Permanently deactivate a contact:
-- UPDATE wp_contactos 
-- SET is_active = false, paused_until = NULL, updated_at = NOW()
-- WHERE id = 123;

-- Reactivate a contact:
-- UPDATE wp_contactos 
-- SET is_active = true, paused_until = NULL, updated_at = NOW()
-- WHERE id = 123;

-- Check paused contacts:
-- SELECT * FROM vw_contact_pause_status WHERE pause_status != 'active';

-- Manual reactivation of expired pauses:
-- SELECT reactivate_expired_pauses();
