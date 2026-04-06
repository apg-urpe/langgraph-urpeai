DROP POLICY IF EXISTS notificaciones_select_policy ON public.wp_notificaciones_team;
CREATE POLICY notificaciones_select_policy ON public.wp_notificaciones_team
  FOR SELECT
  USING (
    is_dev_team_member()
    OR (
      empresa_id = get_user_empresa_id()
      AND (
        EXISTS (
          SELECT 1
          FROM public.wp_team_humano th
          WHERE th.auth_uid = auth.uid()
            AND th.empresa_id = public.wp_notificaciones_team.empresa_id
            AND th.role_id IN (1, 2)
        )
        OR asesor_id IS NULL
        OR asesor_id IN (
          SELECT id
          FROM public.wp_team_humano
          WHERE auth_uid = auth.uid()
        )
      )
    )
  );

DROP POLICY IF EXISTS notificaciones_insert_policy ON public.wp_notificaciones_team;
CREATE POLICY notificaciones_insert_policy ON public.wp_notificaciones_team
  FOR INSERT
  WITH CHECK (
    is_dev_team_member()
    OR empresa_id = get_user_empresa_id()
  );

DROP POLICY IF EXISTS notificaciones_update_policy ON public.wp_notificaciones_team;
CREATE POLICY notificaciones_update_policy ON public.wp_notificaciones_team
  FOR UPDATE
  USING (
    is_dev_team_member()
    OR (
      empresa_id = get_user_empresa_id()
      AND (
        EXISTS (
          SELECT 1
          FROM public.wp_team_humano th
          WHERE th.auth_uid = auth.uid()
            AND th.empresa_id = public.wp_notificaciones_team.empresa_id
            AND th.role_id IN (1, 2)
        )
        OR asesor_id IS NULL
        OR asesor_id IN (
          SELECT id
          FROM public.wp_team_humano
          WHERE auth_uid = auth.uid()
        )
      )
    )
  )
  WITH CHECK (
    is_dev_team_member()
    OR empresa_id = get_user_empresa_id()
  );

DROP POLICY IF EXISTS notificaciones_delete_policy ON public.wp_notificaciones_team;
CREATE POLICY notificaciones_delete_policy ON public.wp_notificaciones_team
  FOR DELETE
  USING (
    is_dev_team_member()
    OR (
      empresa_id = get_user_empresa_id()
      AND (
        EXISTS (
          SELECT 1
          FROM public.wp_team_humano th
          WHERE th.auth_uid = auth.uid()
            AND th.empresa_id = public.wp_notificaciones_team.empresa_id
            AND th.role_id IN (1, 2)
        )
        OR asesor_id IS NULL
        OR asesor_id IN (
          SELECT id
          FROM public.wp_team_humano
          WHERE auth_uid = auth.uid()
        )
      )
    )
  );
