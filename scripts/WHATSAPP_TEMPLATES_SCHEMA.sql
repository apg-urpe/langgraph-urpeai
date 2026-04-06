CREATE TABLE IF NOT EXISTS public.wp_whatsapp_templates (
  id BIGSERIAL PRIMARY KEY,
  empresa_id BIGINT NOT NULL REFERENCES public.wp_empresa_perfil(id) ON DELETE CASCADE,
  numero_id BIGINT NOT NULL REFERENCES public.wp_numeros(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'kapso' CHECK (provider = ANY (ARRAY['kapso', 'meta', 'manual'])),
  provider_phone_id TEXT,
  provider_template_id TEXT,
  business_account_id TEXT,
  template_name TEXT NOT NULL,
  language_code TEXT NOT NULL,
  meta_category TEXT NOT NULL CHECK (meta_category = ANY (ARRAY['marketing', 'utility', 'authentication'])) ,
  clasificacion_interna TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status = ANY (ARRAY['draft', 'pending', 'approved', 'rejected', 'disabled', 'paused', 'archived', 'deleted'])),
  is_active BOOLEAN NOT NULL DEFAULT true,
  header_type TEXT,
  components JSONB NOT NULL DEFAULT '[]'::jsonb,
  variables_schema JSONB NOT NULL DEFAULT '[]'::jsonb,
  example_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  rejection_reason TEXT,
  quality_rating TEXT,
  last_synced_at TIMESTAMPTZ,
  external_created_at TIMESTAMPTZ,
  external_updated_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wp_whatsapp_templates_unique_local UNIQUE (numero_id, template_name, language_code)
);

ALTER TABLE public.wp_whatsapp_templates
  ADD COLUMN IF NOT EXISTS meta_category TEXT;

ALTER TABLE public.wp_whatsapp_templates
  ALTER COLUMN meta_category SET DEFAULT 'utility';

UPDATE public.wp_whatsapp_templates
SET meta_category = 'utility'
WHERE meta_category IS NULL;

ALTER TABLE public.wp_whatsapp_templates
  ALTER COLUMN meta_category SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_wp_whatsapp_templates_provider_template
  ON public.wp_whatsapp_templates(provider, provider_template_id)
  WHERE provider_template_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wp_whatsapp_templates_empresa_numero
  ON public.wp_whatsapp_templates(empresa_id, numero_id);

CREATE INDEX IF NOT EXISTS idx_wp_whatsapp_templates_empresa_estado
  ON public.wp_whatsapp_templates(empresa_id, status);

CREATE INDEX IF NOT EXISTS idx_wp_whatsapp_templates_empresa_meta_categoria_estado
  ON public.wp_whatsapp_templates(empresa_id, meta_category, status);

CREATE INDEX IF NOT EXISTS idx_wp_whatsapp_templates_empresa_clasificacion
  ON public.wp_whatsapp_templates(empresa_id, clasificacion_interna)
  WHERE clasificacion_interna IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wp_whatsapp_templates_aprobadas_activas
  ON public.wp_whatsapp_templates(numero_id, language_code)
  WHERE status = 'approved' AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_wp_whatsapp_templates_components_gin
  ON public.wp_whatsapp_templates USING GIN (components);

ALTER TABLE public.wp_whatsapp_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wp_whatsapp_templates_select" ON public.wp_whatsapp_templates;
CREATE POLICY "wp_whatsapp_templates_select" ON public.wp_whatsapp_templates FOR SELECT
  USING (
    empresa_id IN (
      SELECT empresa_id
      FROM public.wp_team_humano
      WHERE auth_uid = auth.uid()
    )
  );

DROP POLICY IF EXISTS "wp_whatsapp_templates_insert" ON public.wp_whatsapp_templates;
CREATE POLICY "wp_whatsapp_templates_insert" ON public.wp_whatsapp_templates FOR INSERT
  WITH CHECK (
    empresa_id IN (
      SELECT empresa_id
      FROM public.wp_team_humano
      WHERE auth_uid = auth.uid() AND role_id IN (1, 2)
    )
  );

DROP POLICY IF EXISTS "wp_whatsapp_templates_update" ON public.wp_whatsapp_templates;
CREATE POLICY "wp_whatsapp_templates_update" ON public.wp_whatsapp_templates FOR UPDATE
  USING (
    empresa_id IN (
      SELECT empresa_id
      FROM public.wp_team_humano
      WHERE auth_uid = auth.uid() AND role_id IN (1, 2)
    )
  );

DROP POLICY IF EXISTS "wp_whatsapp_templates_delete" ON public.wp_whatsapp_templates;
CREATE POLICY "wp_whatsapp_templates_delete" ON public.wp_whatsapp_templates FOR DELETE
  USING (
    empresa_id IN (
      SELECT empresa_id
      FROM public.wp_team_humano
      WHERE auth_uid = auth.uid() AND role_id IN (1, 2)
    )
  );

CREATE TABLE IF NOT EXISTS public.wp_whatsapp_template_envios (
  id BIGSERIAL PRIMARY KEY,
  empresa_id BIGINT NOT NULL REFERENCES public.wp_empresa_perfil(id) ON DELETE CASCADE,
  numero_id BIGINT NOT NULL REFERENCES public.wp_numeros(id) ON DELETE CASCADE,
  template_id BIGINT REFERENCES public.wp_whatsapp_templates(id) ON DELETE SET NULL,
  conversacion_id BIGINT REFERENCES public.wp_conversaciones(id) ON DELETE SET NULL,
  mensaje_id BIGINT REFERENCES public.wp_mensajes(id) ON DELETE SET NULL,
  contacto_id BIGINT REFERENCES public.wp_contactos(id) ON DELETE SET NULL,
  enviado_por BIGINT REFERENCES public.wp_team_humano(id) ON DELETE SET NULL,
  provider TEXT NOT NULL DEFAULT 'kapso' CHECK (provider = ANY (ARRAY['kapso', 'meta', 'manual'])),
  provider_message_id TEXT,
  provider_template_id TEXT,
  template_name TEXT NOT NULL,
  language_code TEXT NOT NULL,
  meta_category TEXT CHECK (meta_category IS NULL OR meta_category = ANY (ARRAY['marketing', 'utility', 'authentication'])),
  clasificacion_interna TEXT,
  telefono_destino TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  parametros_resueltos JSONB NOT NULL DEFAULT '[]'::jsonb,
  rendered_body TEXT,
  estado TEXT NOT NULL DEFAULT 'queued' CHECK (estado = ANY (ARRAY['queued', 'accepted', 'sent', 'delivered', 'read', 'failed', 'rejected', 'cancelled'])),
  error_code TEXT,
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.wp_whatsapp_template_envios
  ADD COLUMN IF NOT EXISTS meta_category TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_wp_whatsapp_template_envios_provider_message
  ON public.wp_whatsapp_template_envios(provider, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wp_whatsapp_template_envios_empresa_contacto
  ON public.wp_whatsapp_template_envios(empresa_id, contacto_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wp_whatsapp_template_envios_empresa_conversacion
  ON public.wp_whatsapp_template_envios(empresa_id, conversacion_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wp_whatsapp_template_envios_empresa_estado
  ON public.wp_whatsapp_template_envios(empresa_id, estado, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wp_whatsapp_template_envios_empresa_clasificacion
  ON public.wp_whatsapp_template_envios(empresa_id, clasificacion_interna, created_at DESC)
  WHERE clasificacion_interna IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wp_whatsapp_template_envios_template
  ON public.wp_whatsapp_template_envios(template_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wp_whatsapp_template_envios_mensaje
  ON public.wp_whatsapp_template_envios(mensaje_id)
  WHERE mensaje_id IS NOT NULL;

ALTER TABLE public.wp_whatsapp_template_envios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wp_whatsapp_template_envios_select" ON public.wp_whatsapp_template_envios;
CREATE POLICY "wp_whatsapp_template_envios_select" ON public.wp_whatsapp_template_envios FOR SELECT
  USING (
    empresa_id IN (
      SELECT empresa_id
      FROM public.wp_team_humano
      WHERE auth_uid = auth.uid()
    )
  );

DROP POLICY IF EXISTS "wp_whatsapp_template_envios_insert" ON public.wp_whatsapp_template_envios;
CREATE POLICY "wp_whatsapp_template_envios_insert" ON public.wp_whatsapp_template_envios FOR INSERT
  WITH CHECK (
    empresa_id IN (
      SELECT empresa_id
      FROM public.wp_team_humano
      WHERE auth_uid = auth.uid() AND role_id IN (1, 2)
    )
  );

DROP POLICY IF EXISTS "wp_whatsapp_template_envios_update" ON public.wp_whatsapp_template_envios;
CREATE POLICY "wp_whatsapp_template_envios_update" ON public.wp_whatsapp_template_envios FOR UPDATE
  USING (
    empresa_id IN (
      SELECT empresa_id
      FROM public.wp_team_humano
      WHERE auth_uid = auth.uid() AND role_id IN (1, 2)
    )
  );

DROP POLICY IF EXISTS "wp_whatsapp_template_envios_delete" ON public.wp_whatsapp_template_envios;
CREATE POLICY "wp_whatsapp_template_envios_delete" ON public.wp_whatsapp_template_envios FOR DELETE
  USING (
    empresa_id IN (
      SELECT empresa_id
      FROM public.wp_team_humano
      WHERE auth_uid = auth.uid() AND role_id IN (1, 2)
    )
  );
