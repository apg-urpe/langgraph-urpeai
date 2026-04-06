-- ============================================================
-- wp_citas_participantes: Permite que una cita tenga múltiples
-- asesores (dueño + invitados) sin duplicar el registro en wp_citas.
-- ============================================================

-- 1. Tabla principal
create table if not exists public.wp_citas_participantes (
  id            bigserial    primary key,
  cita_id       bigint       not null references wp_citas(id) on delete cascade,
  team_humano_id bigint      not null references wp_team_humano(id) on delete cascade,
  rol           text         not null default 'equipo',     -- 'organizador' | 'equipo' | 'invitado' | 'opcional'
  estado_rsvp   text         default 'pendiente',           -- 'pendiente' | 'aceptada' | 'rechazada' | 'tentativa'
  email         text,                                        -- email del participante (para match con Nylas)
  added_by      text         default 'manual',              -- 'manual' | 'nylas_sync' | 'n8n'
  created_at    timestamptz  default now(),

  constraint uq_cita_participante unique(cita_id, team_humano_id)
);

comment on table public.wp_citas_participantes is 'Invitados adicionales de una cita. El dueño sigue siendo wp_citas.team_humano_id.';

-- 2. Índices
create index if not exists idx_citas_part_team on public.wp_citas_participantes (team_humano_id, cita_id);
create index if not exists idx_citas_part_cita on public.wp_citas_participantes (cita_id);

-- 3. RLS
alter table public.wp_citas_participantes enable row level security;

-- Política SELECT: puede leer si la cita pertenece a la empresa del usuario
create policy "participantes_select_by_empresa"
  on public.wp_citas_participantes
  for select
  using (
    exists (
      select 1 from wp_citas c
      join wp_team_humano t on t.auth_uid = auth.uid()
      where c.id = cita_id
        and c.empresa_id = t.empresa_id
    )
    or
    exists (
      select 1 from wp_team_humano t
      where t.auth_uid = auth.uid()
        and t.role_id = 1
    )
  );

-- Política INSERT: miembros activos de la misma empresa
create policy "participantes_insert_by_empresa"
  on public.wp_citas_participantes
  for insert
  with check (
    exists (
      select 1 from wp_citas c
      join wp_team_humano t on t.auth_uid = auth.uid()
      where c.id = cita_id
        and c.empresa_id = t.empresa_id
        and t.is_active = true
    )
    or
    exists (
      select 1 from wp_team_humano t
      where t.auth_uid = auth.uid()
        and t.role_id = 1
    )
  );

-- Política UPDATE
create policy "participantes_update_by_empresa"
  on public.wp_citas_participantes
  for update
  using (
    exists (
      select 1 from wp_citas c
      join wp_team_humano t on t.auth_uid = auth.uid()
      where c.id = cita_id
        and c.empresa_id = t.empresa_id
        and t.is_active = true
    )
    or
    exists (
      select 1 from wp_team_humano t
      where t.auth_uid = auth.uid()
        and t.role_id = 1
    )
  );

-- Política DELETE
create policy "participantes_delete_by_empresa"
  on public.wp_citas_participantes
  for delete
  using (
    exists (
      select 1 from wp_citas c
      join wp_team_humano t on t.auth_uid = auth.uid()
      where c.id = cita_id
        and c.empresa_id = t.empresa_id
        and t.is_active = true
    )
    or
    exists (
      select 1 from wp_team_humano t
      where t.auth_uid = auth.uid()
        and t.role_id = 1
    )
  );

-- 4. Habilitar Realtime
alter publication supabase_realtime add table public.wp_citas_participantes;
