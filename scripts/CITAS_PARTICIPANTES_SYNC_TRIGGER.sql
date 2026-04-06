-- ============================================================
-- Trigger: Auto-sync participants from wp_citas metadata
-- When n8n inserts/updates a cita, this trigger checks the
-- event participants (stored in metadata->participants) and
-- matches them against wp_team_humano.email in the same empresa.
-- Matched team members are inserted into wp_citas_participantes.
-- ============================================================

create or replace function sync_cita_participantes()
returns trigger as $$
declare
  _participants jsonb;
  _participant jsonb;
  _email text;
  _matched_team_id bigint;
begin
  -- Extract participants array from metadata
  _participants := NEW.metadata -> 'participants';
  
  -- If no participants array, nothing to do
  if _participants is null or jsonb_typeof(_participants) <> 'array' then
    return NEW;
  end if;

  -- Iterate over each participant
  for _participant in select jsonb_array_elements(_participants)
  loop
    _email := lower(trim(_participant ->> 'email'));
    
    -- Skip empty emails or the owner's own email
    if _email is null or _email = '' then
      continue;
    end if;

    -- Find a matching team member in the same empresa
    select id into _matched_team_id
    from wp_team_humano
    where empresa_id = NEW.empresa_id
      and lower(trim(email)) = _email
      and is_active = true
      and id <> coalesce(NEW.team_humano_id, -1)  -- Skip the owner
    limit 1;

    -- If matched, upsert into wp_citas_participantes
    if _matched_team_id is not null then
      insert into wp_citas_participantes (cita_id, team_humano_id, rol, estado_rsvp, email, added_by)
      values (
        NEW.id,
        _matched_team_id,
        'invitado',
        coalesce(_participant ->> 'status', 'pendiente'),
        _email,
        'nylas_sync'
      )
      on conflict (cita_id, team_humano_id) do update set
        estado_rsvp = coalesce(excluded.estado_rsvp, wp_citas_participantes.estado_rsvp),
        email = coalesce(excluded.email, wp_citas_participantes.email);
    end if;
  end loop;

  return NEW;
end;
$$ language plpgsql security definer;

-- Drop existing trigger if any
drop trigger if exists trigger_sync_cita_participantes on wp_citas;

-- Create trigger: fires after INSERT or UPDATE of metadata
create trigger trigger_sync_cita_participantes
  after insert or update of metadata on wp_citas
  for each row
  when (NEW.metadata is not null and NEW.metadata ? 'participants')
  execute function sync_cita_participantes();

comment on function sync_cita_participantes() is 'Auto-matches event participants emails to team members and inserts into wp_citas_participantes';
