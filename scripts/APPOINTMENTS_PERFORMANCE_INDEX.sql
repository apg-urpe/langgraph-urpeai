-- ============================================
-- APPOINTMENTS PERFORMANCE INDEX
-- Optimizes fetchEnterpriseAppointments query
-- ============================================
-- Problem: Query takes 3+ seconds without proper index
-- Solution: Composite index on (empresa_id, fecha_hora DESC)

-- Index for appointments filtered by empresa + date range (most common query)
CREATE INDEX IF NOT EXISTS idx_wp_citas_empresa_fecha 
ON wp_citas (empresa_id, fecha_hora DESC);

-- Index for team member filtering (secondary filter)
CREATE INDEX IF NOT EXISTS idx_wp_citas_team_humano 
ON wp_citas (team_humano_id) 
WHERE team_humano_id IS NOT NULL;

-- Composite index for the full query pattern
CREATE INDEX IF NOT EXISTS idx_wp_citas_empresa_fecha_team 
ON wp_citas (empresa_id, fecha_hora DESC, team_humano_id);

-- ============================================
-- EXECUTION INSTRUCTIONS
-- ============================================
-- Run this in Supabase SQL Editor
-- Expected improvement: 3000ms -> ~50-150ms
