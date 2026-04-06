-- ==========================================================================
-- TRANSFERENCIA MASIVA DE CONTACTOS ENTRE MIEMBROS DEL EQUIPO
-- ==========================================================================
-- v1 alcance:
-- - Transfiere responsables principales en wp_contactos
-- - Reasigna o elimina colaboradores/observadores en wp_contacto_team_asignaciones
-- - No toca citas, tareas ni notificaciones operativas
-- ==========================================================================

DROP FUNCTION IF EXISTS public.preview_transfer_contacts_between_team_members(BIGINT, BIGINT, BIGINT);
DROP FUNCTION IF EXISTS public.preview_transfer_contacts_between_team_members(BIGINT, BIGINT, BIGINT, TEXT, BIGINT[]);

CREATE OR REPLACE FUNCTION public.preview_transfer_contacts_between_team_members(
  p_empresa_id BIGINT,
  p_from_team_member_id BIGINT,
  p_to_team_member_id BIGINT DEFAULT NULL,
  p_transfer_mode TEXT DEFAULT 'single_target',
  p_eligible_team_member_ids BIGINT[] DEFAULT NULL
)
RETURNS TABLE (
  principal_contacts_count BIGINT,
  secondary_collaborator_count BIGINT,
  secondary_observer_count BIGINT,
  target_existing_assignment_merges_count BIGINT,
  future_appointments_count BIGINT,
  eligible_team_members_count BIGINT,
  round_robin_distribution JSONB
) AS $$
DECLARE
  v_eligible_count BIGINT := 0;
  v_requested_eligible_count BIGINT := 0;
BEGIN
  IF p_empresa_id IS NULL OR p_from_team_member_id IS NULL THEN
    RAISE EXCEPTION 'empresa_id y from_team_member_id son requeridos';
  END IF;

  IF p_transfer_mode NOT IN ('single_target', 'round_robin') THEN
    RAISE EXCEPTION 'transfer_mode inválido: %', p_transfer_mode;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.wp_team_humano actor
    WHERE actor.auth_uid = auth.uid()
      AND (
        actor.role_id = 1
        OR (actor.role_id IN (2, 4) AND actor.empresa_id = p_empresa_id)
      )
  ) THEN
    RAISE EXCEPTION 'No autorizado para previsualizar transferencias de contactos';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.wp_team_humano t
    WHERE t.id = p_from_team_member_id
      AND t.empresa_id = p_empresa_id
  ) THEN
    RAISE EXCEPTION 'Miembro origen no pertenece a la empresa';
  END IF;

  IF p_transfer_mode = 'single_target' THEN
    IF p_to_team_member_id IS NULL THEN
      RAISE EXCEPTION 'to_team_member_id es requerido para single_target';
    END IF;

    IF p_from_team_member_id = p_to_team_member_id THEN
      RAISE EXCEPTION 'El miembro origen y destino no pueden ser iguales';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.wp_team_humano t
      WHERE t.id = p_to_team_member_id
        AND t.empresa_id = p_empresa_id
        AND t.is_active = true
    ) THEN
      RAISE EXCEPTION 'Miembro destino no pertenece a la empresa o no está activo';
    END IF;

    v_eligible_count := 1;
  ELSE
    SELECT COUNT(DISTINCT member_id)
    INTO v_requested_eligible_count
    FROM unnest(COALESCE(p_eligible_team_member_ids, ARRAY[]::BIGINT[])) AS member_id;

    IF v_requested_eligible_count = 0 THEN
      RAISE EXCEPTION 'Se requiere al menos un miembro elegible para round_robin';
    END IF;

    SELECT COUNT(*)
    INTO v_eligible_count
    FROM public.wp_team_humano t
    WHERE t.empresa_id = p_empresa_id
      AND t.id = ANY(COALESCE(p_eligible_team_member_ids, ARRAY[]::BIGINT[]))
      AND t.id <> p_from_team_member_id
      AND t.is_active = true
      AND COALESCE(t.acepta_citas, false) = true
      AND t.grant_id IS NOT NULL;

    IF v_eligible_count = 0 THEN
      RAISE EXCEPTION 'No hay miembros elegibles para round_robin';
    END IF;

    IF v_eligible_count <> v_requested_eligible_count THEN
      RAISE EXCEPTION 'La lista de elegibles contiene miembros inválidos o no habilitados para citas';
    END IF;
  END IF;

  RETURN QUERY
  WITH target_pool AS (
    SELECT member_id AS id, ROW_NUMBER() OVER (ORDER BY member_id) AS rn
    FROM (
      SELECT DISTINCT unnest(COALESCE(p_eligible_team_member_ids, ARRAY[]::BIGINT[])) AS member_id
      WHERE p_transfer_mode = 'round_robin'
      UNION ALL
      SELECT p_to_team_member_id AS member_id
      WHERE p_transfer_mode = 'single_target'
        AND p_to_team_member_id IS NOT NULL
    ) target_members
  ),
  principal_contacts AS (
    SELECT c.id, ROW_NUMBER() OVER (ORDER BY c.id) AS rn
    FROM public.wp_contactos c
    WHERE c.empresa_id = p_empresa_id
      AND c.team_humano_id = p_from_team_member_id
  ),
  principal_targets AS (
    SELECT
      pc.id AS contacto_id,
      CASE
        WHEN p_transfer_mode = 'single_target' THEN p_to_team_member_id
        ELSE (
          SELECT tp.id
          FROM target_pool tp
          WHERE tp.rn = (((pc.rn - 1) % GREATEST(v_eligible_count, 1)::INT) + 1)
        )
      END AS target_team_member_id
    FROM principal_contacts pc
  ),
  secondary_assignments AS (
    SELECT a.contacto_id, COALESCE(a.rol_asignacion, 'colaborador') AS rol_asignacion
    FROM public.wp_contacto_team_asignaciones a
    WHERE a.empresa_id = p_empresa_id
      AND a.team_humano_id = p_from_team_member_id
      AND COALESCE(a.es_principal, false) = false
  ),
  secondary_contacts AS (
    SELECT source.contacto_id, ROW_NUMBER() OVER (ORDER BY source.contacto_id) AS rn
    FROM (
      SELECT DISTINCT a.contacto_id
      FROM public.wp_contacto_team_asignaciones a
      WHERE a.empresa_id = p_empresa_id
        AND a.team_humano_id = p_from_team_member_id
        AND COALESCE(a.es_principal, false) = false
    ) source
  ),
  secondary_targets AS (
    SELECT
      sc.contacto_id,
      COALESCE(
        pt.target_team_member_id,
        CASE
          WHEN p_transfer_mode = 'single_target' THEN p_to_team_member_id
          ELSE (
            SELECT tp.id
            FROM target_pool tp
            WHERE tp.rn = (((sc.rn - 1) % GREATEST(v_eligible_count, 1)::INT) + 1)
          )
        END
      ) AS target_team_member_id
    FROM secondary_contacts sc
    LEFT JOIN principal_targets pt ON pt.contacto_id = sc.contacto_id
  ),
  future_appointments AS (
    SELECT COUNT(DISTINCT cita.id) AS count_future
    FROM public.wp_citas cita
    INNER JOIN principal_targets pt ON pt.contacto_id = cita.contacto_id
    WHERE cita.empresa_id = p_empresa_id
      AND cita.fecha_hora >= NOW()
      AND COALESCE(cita.estado, '') <> 'cancelada'
  ),
  target_merges AS (
    SELECT COUNT(*) AS count_merge
    FROM (
      SELECT DISTINCT a.contacto_id, st.target_team_member_id
      FROM public.wp_contacto_team_asignaciones a
      INNER JOIN secondary_targets st ON st.contacto_id = a.contacto_id
      INNER JOIN public.wp_contacto_team_asignaciones target
        ON target.contacto_id = a.contacto_id
       AND target.team_humano_id = st.target_team_member_id
       AND target.empresa_id = p_empresa_id
      WHERE a.empresa_id = p_empresa_id
        AND a.team_humano_id = p_from_team_member_id
        AND st.target_team_member_id IS NOT NULL
    ) merges
  ),
  distribution AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'team_member_id', distribution_rows.target_team_member_id,
          'contacts_count', distribution_rows.contacts_count
        )
        ORDER BY distribution_rows.target_team_member_id
      ),
      '[]'::jsonb
    ) AS data
    FROM (
      SELECT pt.target_team_member_id, COUNT(*)::BIGINT AS contacts_count
      FROM principal_targets pt
      WHERE pt.target_team_member_id IS NOT NULL
      GROUP BY pt.target_team_member_id
    ) distribution_rows
  )
  SELECT
    (SELECT COUNT(*) FROM principal_contacts),
    (SELECT COUNT(*) FROM secondary_assignments WHERE rol_asignacion <> 'observador'),
    (SELECT COUNT(*) FROM secondary_assignments WHERE rol_asignacion = 'observador'),
    COALESCE((SELECT count_merge FROM target_merges), 0),
    COALESCE((SELECT count_future FROM future_appointments), 0),
    v_eligible_count,
    COALESCE((SELECT data FROM distribution), '[]'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


DROP FUNCTION IF EXISTS public.transfer_contacts_between_team_members(BIGINT, BIGINT, BIGINT, TEXT, TEXT, BIGINT);
DROP FUNCTION IF EXISTS public.transfer_contacts_between_team_members(BIGINT, BIGINT, BIGINT, TEXT, TEXT, BIGINT, TEXT, BIGINT[]);

CREATE OR REPLACE FUNCTION public.transfer_contacts_between_team_members(
  p_empresa_id BIGINT,
  p_from_team_member_id BIGINT,
  p_to_team_member_id BIGINT DEFAULT NULL,
  p_collaborator_strategy TEXT DEFAULT 'reassign',
  p_observer_strategy TEXT DEFAULT 'remove',
  p_actor_team_member_id BIGINT DEFAULT NULL,
  p_transfer_mode TEXT DEFAULT 'single_target',
  p_eligible_team_member_ids BIGINT[] DEFAULT NULL
)
RETURNS TABLE (
  principal_contacts_transferred BIGINT,
  collaborator_assignments_reassigned BIGINT,
  collaborator_assignments_removed BIGINT,
  observer_assignments_reassigned BIGINT,
  observer_assignments_removed BIGINT,
  target_existing_assignment_merges BIGINT,
  future_appointment_participants_added BIGINT,
  eligible_team_members_count BIGINT,
  round_robin_distribution JSONB
) AS $$
DECLARE
  v_principal_contacts_transferred BIGINT := 0;
  v_collaborator_assignments_reassigned BIGINT := 0;
  v_collaborator_assignments_removed BIGINT := 0;
  v_observer_assignments_reassigned BIGINT := 0;
  v_observer_assignments_removed BIGINT := 0;
  v_target_existing_assignment_merges BIGINT := 0;
  v_future_appointment_participants_added BIGINT := 0;
  v_eligible_count BIGINT := 0;
  v_requested_eligible_count BIGINT := 0;
  v_round_robin_distribution JSONB := '[]'::jsonb;
BEGIN
  IF p_empresa_id IS NULL OR p_from_team_member_id IS NULL THEN
    RAISE EXCEPTION 'empresa_id y from_team_member_id son requeridos';
  END IF;

  IF p_transfer_mode NOT IN ('single_target', 'round_robin') THEN
    RAISE EXCEPTION 'transfer_mode inválido: %', p_transfer_mode;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.wp_team_humano actor
    WHERE actor.auth_uid = auth.uid()
      AND (
        actor.role_id = 1
        OR (actor.role_id IN (2, 4) AND actor.empresa_id = p_empresa_id)
      )
  ) THEN
    RAISE EXCEPTION 'No autorizado para transferir contactos';
  END IF;

  IF p_collaborator_strategy NOT IN ('reassign', 'remove') THEN
    RAISE EXCEPTION 'collaborator_strategy inválida: %', p_collaborator_strategy;
  END IF;

  IF p_observer_strategy NOT IN ('reassign', 'remove') THEN
    RAISE EXCEPTION 'observer_strategy inválida: %', p_observer_strategy;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.wp_team_humano t
    WHERE t.id = p_from_team_member_id
      AND t.empresa_id = p_empresa_id
  ) THEN
    RAISE EXCEPTION 'Miembro origen no pertenece a la empresa';
  END IF;

  IF p_transfer_mode = 'single_target' THEN
    IF p_to_team_member_id IS NULL THEN
      RAISE EXCEPTION 'to_team_member_id es requerido para single_target';
    END IF;

    IF p_from_team_member_id = p_to_team_member_id THEN
      RAISE EXCEPTION 'El miembro origen y destino no pueden ser iguales';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.wp_team_humano t
      WHERE t.id = p_to_team_member_id
        AND t.empresa_id = p_empresa_id
        AND t.is_active = true
    ) THEN
      RAISE EXCEPTION 'Miembro destino no pertenece a la empresa o no está activo';
    END IF;

    v_eligible_count := 1;
  ELSE
    SELECT COUNT(DISTINCT member_id)
    INTO v_requested_eligible_count
    FROM unnest(COALESCE(p_eligible_team_member_ids, ARRAY[]::BIGINT[])) AS member_id;

    IF v_requested_eligible_count = 0 THEN
      RAISE EXCEPTION 'Se requiere al menos un miembro elegible para round_robin';
    END IF;

    SELECT COUNT(*)
    INTO v_eligible_count
    FROM public.wp_team_humano t
    WHERE t.empresa_id = p_empresa_id
      AND t.id = ANY(COALESCE(p_eligible_team_member_ids, ARRAY[]::BIGINT[]))
      AND t.id <> p_from_team_member_id
      AND t.is_active = true
      AND COALESCE(t.acepta_citas, false) = true
      AND t.grant_id IS NOT NULL;

    IF v_eligible_count = 0 THEN
      RAISE EXCEPTION 'No hay miembros elegibles para round_robin';
    END IF;

    IF v_eligible_count <> v_requested_eligible_count THEN
      RAISE EXCEPTION 'La lista de elegibles contiene miembros inválidos o no habilitados para citas';
    END IF;
  END IF;

  WITH target_pool AS (
    SELECT member_id AS id, ROW_NUMBER() OVER (ORDER BY member_id) AS rn
    FROM (
      SELECT DISTINCT unnest(COALESCE(p_eligible_team_member_ids, ARRAY[]::BIGINT[])) AS member_id
      WHERE p_transfer_mode = 'round_robin'
      UNION ALL
      SELECT p_to_team_member_id AS member_id
      WHERE p_transfer_mode = 'single_target'
        AND p_to_team_member_id IS NOT NULL
    ) target_members
  ),
  principal_contacts AS (
    SELECT c.id, ROW_NUMBER() OVER (ORDER BY c.id) AS rn
    FROM public.wp_contactos c
    WHERE c.empresa_id = p_empresa_id
      AND c.team_humano_id = p_from_team_member_id
  ),
  principal_targets AS (
    SELECT
      pc.id AS contacto_id,
      CASE
        WHEN p_transfer_mode = 'single_target' THEN p_to_team_member_id
        ELSE (
          SELECT tp.id
          FROM target_pool tp
          WHERE tp.rn = (((pc.rn - 1) % GREATEST(v_eligible_count, 1)::INT) + 1)
        )
      END AS target_team_member_id
    FROM principal_contacts pc
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'team_member_id', distribution_rows.target_team_member_id,
        'contacts_count', distribution_rows.contacts_count
      )
      ORDER BY distribution_rows.target_team_member_id
    ),
    '[]'::jsonb
  )
  INTO v_round_robin_distribution
  FROM (
    SELECT pt.target_team_member_id, COUNT(*)::BIGINT AS contacts_count
    FROM principal_targets pt
    WHERE pt.target_team_member_id IS NOT NULL
    GROUP BY pt.target_team_member_id
  ) distribution_rows;

  WITH target_pool AS (
    SELECT member_id AS id, ROW_NUMBER() OVER (ORDER BY member_id) AS rn
    FROM (
      SELECT DISTINCT unnest(COALESCE(p_eligible_team_member_ids, ARRAY[]::BIGINT[])) AS member_id
      WHERE p_transfer_mode = 'round_robin'
      UNION ALL
      SELECT p_to_team_member_id AS member_id
      WHERE p_transfer_mode = 'single_target'
        AND p_to_team_member_id IS NOT NULL
    ) target_members
  ),
  principal_contacts AS (
    SELECT c.id, ROW_NUMBER() OVER (ORDER BY c.id) AS rn
    FROM public.wp_contactos c
    WHERE c.empresa_id = p_empresa_id
      AND c.team_humano_id = p_from_team_member_id
  ),
  principal_targets AS (
    SELECT
      pc.id AS contacto_id,
      CASE
        WHEN p_transfer_mode = 'single_target' THEN p_to_team_member_id
        ELSE (
          SELECT tp.id
          FROM target_pool tp
          WHERE tp.rn = (((pc.rn - 1) % GREATEST(v_eligible_count, 1)::INT) + 1)
        )
      END AS target_team_member_id
    FROM principal_contacts pc
  ),
  updated_contacts AS (
    UPDATE public.wp_contactos c
    SET team_humano_id = pt.target_team_member_id,
        updated_at = NOW()
    FROM principal_targets pt
    WHERE c.id = pt.contacto_id
      AND pt.target_team_member_id IS NOT NULL
    RETURNING c.id
  )
  SELECT COUNT(*)
  INTO v_principal_contacts_transferred
  FROM updated_contacts;

  WITH target_pool AS (
    SELECT member_id AS id, ROW_NUMBER() OVER (ORDER BY member_id) AS rn
    FROM (
      SELECT DISTINCT unnest(COALESCE(p_eligible_team_member_ids, ARRAY[]::BIGINT[])) AS member_id
      WHERE p_transfer_mode = 'round_robin'
      UNION ALL
      SELECT p_to_team_member_id AS member_id
      WHERE p_transfer_mode = 'single_target'
        AND p_to_team_member_id IS NOT NULL
    ) target_members
  ),
  principal_contacts AS (
    SELECT c.id, ROW_NUMBER() OVER (ORDER BY c.id) AS rn
    FROM public.wp_contactos c
    WHERE c.empresa_id = p_empresa_id
      AND c.team_humano_id = p_from_team_member_id
  ),
  principal_targets AS (
    SELECT
      pc.id AS contacto_id,
      CASE
        WHEN p_transfer_mode = 'single_target' THEN p_to_team_member_id
        ELSE (
          SELECT tp.id
          FROM target_pool tp
          WHERE tp.rn = (((pc.rn - 1) % GREATEST(v_eligible_count, 1)::INT) + 1)
        )
      END AS target_team_member_id
    FROM principal_contacts pc
  ),
  appointment_candidates AS (
    SELECT cita.id AS cita_id, pt.target_team_member_id, target_member.email
    FROM public.wp_citas cita
    INNER JOIN principal_targets pt ON pt.contacto_id = cita.contacto_id
    INNER JOIN public.wp_team_humano target_member ON target_member.id = pt.target_team_member_id
    LEFT JOIN public.wp_citas_participantes existing_participant
      ON existing_participant.cita_id = cita.id
     AND existing_participant.team_humano_id = pt.target_team_member_id
    WHERE cita.empresa_id = p_empresa_id
      AND cita.fecha_hora >= NOW()
      AND COALESCE(cita.estado, '') <> 'cancelada'
      AND pt.target_team_member_id IS NOT NULL
      AND cita.team_humano_id <> pt.target_team_member_id
      AND existing_participant.id IS NULL
  ),
  inserted_participants AS (
    INSERT INTO public.wp_citas_participantes (
      cita_id,
      team_humano_id,
      rol,
      estado_rsvp,
      email,
      added_by
    )
    SELECT
      ac.cita_id,
      ac.target_team_member_id,
      'equipo',
      'pendiente',
      ac.email,
      'contact_transfer'
    FROM appointment_candidates ac
    ON CONFLICT (cita_id, team_humano_id) DO NOTHING
    RETURNING cita_id
  )
  SELECT COUNT(*)
  INTO v_future_appointment_participants_added
  FROM inserted_participants;

  IF p_collaborator_strategy = 'reassign' THEN
    WITH target_pool AS (
      SELECT member_id AS id, ROW_NUMBER() OVER (ORDER BY member_id) AS rn
      FROM (
        SELECT DISTINCT unnest(COALESCE(p_eligible_team_member_ids, ARRAY[]::BIGINT[])) AS member_id
        WHERE p_transfer_mode = 'round_robin'
        UNION ALL
        SELECT p_to_team_member_id AS member_id
        WHERE p_transfer_mode = 'single_target'
          AND p_to_team_member_id IS NOT NULL
      ) target_members
    ),
    principal_contacts AS (
      SELECT c.id, ROW_NUMBER() OVER (ORDER BY c.id) AS rn
      FROM public.wp_contactos c
      WHERE c.empresa_id = p_empresa_id
        AND c.team_humano_id = p_from_team_member_id
    ),
    principal_targets AS (
      SELECT
        pc.id AS contacto_id,
        CASE
          WHEN p_transfer_mode = 'single_target' THEN p_to_team_member_id
          ELSE (
            SELECT tp.id
            FROM target_pool tp
            WHERE tp.rn = (((pc.rn - 1) % GREATEST(v_eligible_count, 1)::INT) + 1)
          )
        END AS target_team_member_id
      FROM principal_contacts pc
    ),
    source_rows AS (
      SELECT source.contacto_id, ROW_NUMBER() OVER (ORDER BY source.contacto_id) AS rn
      FROM (
        SELECT DISTINCT a.contacto_id
        FROM public.wp_contacto_team_asignaciones a
        WHERE a.empresa_id = p_empresa_id
          AND a.team_humano_id = p_from_team_member_id
          AND COALESCE(a.es_principal, false) = false
          AND COALESCE(a.rol_asignacion, 'colaborador') <> 'observador'
      ) source
    ),
    secondary_targets AS (
      SELECT
        s.contacto_id,
        COALESCE(
          pt.target_team_member_id,
          CASE
            WHEN p_transfer_mode = 'single_target' THEN p_to_team_member_id
            ELSE (
              SELECT tp.id
              FROM target_pool tp
              WHERE tp.rn = (((s.rn - 1) % GREATEST(v_eligible_count, 1)::INT) + 1)
            )
          END
        ) AS target_team_member_id
      FROM source_rows s
      LEFT JOIN principal_targets pt ON pt.contacto_id = s.contacto_id
    ),
    target_existing AS (
      SELECT DISTINCT s.contacto_id, st.target_team_member_id
      FROM source_rows s
      INNER JOIN secondary_targets st ON st.contacto_id = s.contacto_id
      INNER JOIN public.wp_contacto_team_asignaciones t
        ON t.contacto_id = s.contacto_id
       AND t.team_humano_id = st.target_team_member_id
       AND t.empresa_id = p_empresa_id
      WHERE st.target_team_member_id IS NOT NULL
    ),
    updated_existing AS (
      UPDATE public.wp_contacto_team_asignaciones t
      SET rol_asignacion = CASE
            WHEN t.es_principal = true THEN 'principal'
            ELSE 'colaborador'
          END,
          updated_at = NOW()
      WHERE t.empresa_id = p_empresa_id
        AND EXISTS (
          SELECT 1
          FROM secondary_targets st
          WHERE st.contacto_id = t.contacto_id
            AND st.target_team_member_id = t.team_humano_id
            AND st.target_team_member_id IS NOT NULL
        )
      RETURNING t.contacto_id
    ),
    inserted_missing AS (
      INSERT INTO public.wp_contacto_team_asignaciones (
        contacto_id,
        team_humano_id,
        es_principal,
        rol_asignacion,
        asignado_por,
        empresa_id,
        created_at,
        updated_at
      )
      SELECT
        s.contacto_id,
        st.target_team_member_id,
        false,
        'colaborador',
        p_actor_team_member_id,
        p_empresa_id,
        NOW(),
        NOW()
      FROM source_rows s
      INNER JOIN secondary_targets st ON st.contacto_id = s.contacto_id
      WHERE st.target_team_member_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM public.wp_contacto_team_asignaciones t
          WHERE t.contacto_id = s.contacto_id
            AND t.team_humano_id = st.target_team_member_id
            AND t.empresa_id = p_empresa_id
        )
      RETURNING contacto_id
    ),
    deleted_source AS (
      DELETE FROM public.wp_contacto_team_asignaciones a
      WHERE a.empresa_id = p_empresa_id
        AND a.team_humano_id = p_from_team_member_id
        AND COALESCE(a.es_principal, false) = false
        AND COALESCE(a.rol_asignacion, 'colaborador') <> 'observador'
      RETURNING a.contacto_id
    )
    SELECT
      (SELECT COUNT(*) FROM deleted_source),
      v_target_existing_assignment_merges + (SELECT COUNT(*) FROM target_existing)
    INTO v_collaborator_assignments_reassigned, v_target_existing_assignment_merges;
  ELSE
    WITH deleted_source AS (
      DELETE FROM public.wp_contacto_team_asignaciones a
      WHERE a.empresa_id = p_empresa_id
        AND a.team_humano_id = p_from_team_member_id
        AND COALESCE(a.es_principal, false) = false
        AND COALESCE(a.rol_asignacion, 'colaborador') <> 'observador'
      RETURNING a.contacto_id
    )
    SELECT COUNT(*) INTO v_collaborator_assignments_removed
    FROM deleted_source;
  END IF;

  IF p_observer_strategy = 'reassign' THEN
    WITH target_pool AS (
      SELECT member_id AS id, ROW_NUMBER() OVER (ORDER BY member_id) AS rn
      FROM (
        SELECT DISTINCT unnest(COALESCE(p_eligible_team_member_ids, ARRAY[]::BIGINT[])) AS member_id
        WHERE p_transfer_mode = 'round_robin'
        UNION ALL
        SELECT p_to_team_member_id AS member_id
        WHERE p_transfer_mode = 'single_target'
          AND p_to_team_member_id IS NOT NULL
      ) target_members
    ),
    principal_contacts AS (
      SELECT c.id, ROW_NUMBER() OVER (ORDER BY c.id) AS rn
      FROM public.wp_contactos c
      WHERE c.empresa_id = p_empresa_id
        AND c.team_humano_id = p_from_team_member_id
    ),
    principal_targets AS (
      SELECT
        pc.id AS contacto_id,
        CASE
          WHEN p_transfer_mode = 'single_target' THEN p_to_team_member_id
          ELSE (
            SELECT tp.id
            FROM target_pool tp
            WHERE tp.rn = (((pc.rn - 1) % GREATEST(v_eligible_count, 1)::INT) + 1)
          )
        END AS target_team_member_id
      FROM principal_contacts pc
    ),
    source_rows AS (
      SELECT source.contacto_id, ROW_NUMBER() OVER (ORDER BY source.contacto_id) AS rn
      FROM (
        SELECT DISTINCT a.contacto_id
        FROM public.wp_contacto_team_asignaciones a
        WHERE a.empresa_id = p_empresa_id
          AND a.team_humano_id = p_from_team_member_id
          AND COALESCE(a.es_principal, false) = false
          AND COALESCE(a.rol_asignacion, 'colaborador') = 'observador'
      ) source
    ),
    secondary_targets AS (
      SELECT
        s.contacto_id,
        COALESCE(
          pt.target_team_member_id,
          CASE
            WHEN p_transfer_mode = 'single_target' THEN p_to_team_member_id
            ELSE (
              SELECT tp.id
              FROM target_pool tp
              WHERE tp.rn = (((s.rn - 1) % GREATEST(v_eligible_count, 1)::INT) + 1)
            )
          END
        ) AS target_team_member_id
      FROM source_rows s
      LEFT JOIN principal_targets pt ON pt.contacto_id = s.contacto_id
    ),
    target_existing AS (
      SELECT DISTINCT s.contacto_id, st.target_team_member_id
      FROM source_rows s
      INNER JOIN secondary_targets st ON st.contacto_id = s.contacto_id
      INNER JOIN public.wp_contacto_team_asignaciones t
        ON t.contacto_id = s.contacto_id
       AND t.team_humano_id = st.target_team_member_id
       AND t.empresa_id = p_empresa_id
      WHERE st.target_team_member_id IS NOT NULL
    ),
    updated_existing AS (
      UPDATE public.wp_contacto_team_asignaciones t
      SET rol_asignacion = CASE
            WHEN t.es_principal = true THEN 'principal'
            WHEN COALESCE(t.rol_asignacion, 'colaborador') = 'observador' THEN 'observador'
            ELSE 'colaborador'
          END,
          updated_at = NOW()
      WHERE t.empresa_id = p_empresa_id
        AND EXISTS (
          SELECT 1
          FROM secondary_targets st
          WHERE st.contacto_id = t.contacto_id
            AND st.target_team_member_id = t.team_humano_id
            AND st.target_team_member_id IS NOT NULL
        )
      RETURNING t.contacto_id
    ),
    inserted_missing AS (
      INSERT INTO public.wp_contacto_team_asignaciones (
        contacto_id,
        team_humano_id,
        es_principal,
        rol_asignacion,
        asignado_por,
        empresa_id,
        created_at,
        updated_at
      )
      SELECT
        s.contacto_id,
        st.target_team_member_id,
        false,
        'observador',
        p_actor_team_member_id,
        p_empresa_id,
        NOW(),
        NOW()
      FROM source_rows s
      INNER JOIN secondary_targets st ON st.contacto_id = s.contacto_id
      WHERE st.target_team_member_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM public.wp_contacto_team_asignaciones t
          WHERE t.contacto_id = s.contacto_id
            AND t.team_humano_id = st.target_team_member_id
            AND t.empresa_id = p_empresa_id
        )
      RETURNING contacto_id
    ),
    deleted_source AS (
      DELETE FROM public.wp_contacto_team_asignaciones a
      WHERE a.empresa_id = p_empresa_id
        AND a.team_humano_id = p_from_team_member_id
        AND COALESCE(a.es_principal, false) = false
        AND COALESCE(a.rol_asignacion, 'colaborador') = 'observador'
      RETURNING a.contacto_id
    )
    SELECT
      (SELECT COUNT(*) FROM deleted_source),
      v_target_existing_assignment_merges + (SELECT COUNT(*) FROM target_existing)
    INTO v_observer_assignments_reassigned, v_target_existing_assignment_merges;
  ELSE
    WITH deleted_source AS (
      DELETE FROM public.wp_contacto_team_asignaciones a
      WHERE a.empresa_id = p_empresa_id
        AND a.team_humano_id = p_from_team_member_id
        AND COALESCE(a.es_principal, false) = false
        AND COALESCE(a.rol_asignacion, 'colaborador') = 'observador'
      RETURNING a.contacto_id
    )
    SELECT COUNT(*) INTO v_observer_assignments_removed
    FROM deleted_source;
  END IF;

  RETURN QUERY
  SELECT
    v_principal_contacts_transferred,
    v_collaborator_assignments_reassigned,
    v_collaborator_assignments_removed,
    v_observer_assignments_reassigned,
    v_observer_assignments_removed,
    v_target_existing_assignment_merges,
    v_future_appointment_participants_added,
    v_eligible_count,
    v_round_robin_distribution;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
