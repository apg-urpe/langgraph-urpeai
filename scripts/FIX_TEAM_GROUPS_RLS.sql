DROP POLICY IF EXISTS "team_groups_select" ON public.team_groups;
CREATE POLICY "team_groups_select" ON public.team_groups
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.wp_team_humano actor
    WHERE actor.auth_uid = auth.uid()
    AND (
      actor.role_id = 1
      OR actor.empresa_id = team_groups.empresa_id
    )
  )
);

DROP POLICY IF EXISTS "team_groups_insert" ON public.team_groups;
CREATE POLICY "team_groups_insert" ON public.team_groups
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.wp_team_humano actor
    WHERE actor.auth_uid = auth.uid()
      AND actor.role_id IN (1, 2)
      AND (
        actor.role_id = 1
        OR actor.empresa_id = team_groups.empresa_id
      )
  )
);

DROP POLICY IF EXISTS "team_groups_update" ON public.team_groups;
CREATE POLICY "team_groups_update" ON public.team_groups
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.wp_team_humano actor
    WHERE actor.auth_uid = auth.uid()
      AND actor.role_id IN (1, 2)
      AND (
        actor.role_id = 1
        OR actor.empresa_id = team_groups.empresa_id
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.wp_team_humano actor
    WHERE actor.auth_uid = auth.uid()
      AND actor.role_id IN (1, 2)
      AND (
        actor.role_id = 1
        OR actor.empresa_id = team_groups.empresa_id
      )
  )
);

DROP POLICY IF EXISTS "team_groups_delete" ON public.team_groups;
CREATE POLICY "team_groups_delete" ON public.team_groups
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.wp_team_humano actor
    WHERE actor.auth_uid = auth.uid()
      AND actor.role_id IN (1, 2)
      AND (
        actor.role_id = 1
        OR actor.empresa_id = team_groups.empresa_id
      )
  )
);
