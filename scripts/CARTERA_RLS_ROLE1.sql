DROP POLICY IF EXISTS "wp_crm_servicios_select_role1" ON public.wp_crm_servicios;
CREATE POLICY "wp_crm_servicios_select_role1" ON public.wp_crm_servicios
  FOR SELECT
  USING (
    is_dev_team_member()
  );

DROP POLICY IF EXISTS "wp_crm_servicios_insert_role1" ON public.wp_crm_servicios;
CREATE POLICY "wp_crm_servicios_insert_role1" ON public.wp_crm_servicios
  FOR INSERT
  WITH CHECK (
    is_dev_team_member()
  );

DROP POLICY IF EXISTS "wp_crm_servicios_update_role1" ON public.wp_crm_servicios;
CREATE POLICY "wp_crm_servicios_update_role1" ON public.wp_crm_servicios
  FOR UPDATE
  USING (
    is_dev_team_member()
  )
  WITH CHECK (
    is_dev_team_member()
  );

DROP POLICY IF EXISTS "wp_crm_servicios_delete_role1" ON public.wp_crm_servicios;
CREATE POLICY "wp_crm_servicios_delete_role1" ON public.wp_crm_servicios
  FOR DELETE
  USING (
    is_dev_team_member()
  );

DROP POLICY IF EXISTS "wp_crm_pagos_select_role1" ON public.wp_crm_pagos;
CREATE POLICY "wp_crm_pagos_select_role1" ON public.wp_crm_pagos
  FOR SELECT
  USING (
    is_dev_team_member()
  );

DROP POLICY IF EXISTS "wp_crm_pagos_insert_role1" ON public.wp_crm_pagos;
CREATE POLICY "wp_crm_pagos_insert_role1" ON public.wp_crm_pagos
  FOR INSERT
  WITH CHECK (
    is_dev_team_member()
  );

DROP POLICY IF EXISTS "wp_crm_pagos_update_role1" ON public.wp_crm_pagos;
CREATE POLICY "wp_crm_pagos_update_role1" ON public.wp_crm_pagos
  FOR UPDATE
  USING (
    is_dev_team_member()
  )
  WITH CHECK (
    is_dev_team_member()
  );

DROP POLICY IF EXISTS "wp_crm_pagos_delete_role1" ON public.wp_crm_pagos;
CREATE POLICY "wp_crm_pagos_delete_role1" ON public.wp_crm_pagos
  FOR DELETE
  USING (
    is_dev_team_member()
  );
SELECT
  tablename,
  policyname,
  cmd
FROM pg_policies
WHERE tablename IN ('wp_crm_servicios', 'wp_crm_pagos')
ORDER BY tablename, policyname;
