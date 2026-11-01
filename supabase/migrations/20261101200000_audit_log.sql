-- The company-wide audit log (docs/accounts-plan.md, phase 5): one row per
-- logged change. Written by server code in the same transaction as the change
-- (apply_changes), and by the database itself when someone accepts an
-- invitation. Only ops admins read it. Nobody, server code included, can edit
-- or delete a row.

create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null,
  actor_id text references public.profiles,
  actor_name text not null,
  action text not null,
  target_type text not null check (target_type in ('session', 'coach', 'person', 'center', 'intake', 'settings')),
  target_id text not null,
  text text not null
);

create index on public.audit_log (actor_id);
create index on public.audit_log (target_type, target_id);

create function private.audit_log_is_permanent() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'The audit log can only be added to.';
end;
$$;

create trigger audit_log_is_permanent before update or delete on public.audit_log
  for each row execute function private.audit_log_is_permanent();
create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function private.audit_log_is_permanent();

alter table public.audit_log enable row level security;

create policy "Ops admins read the audit log" on public.audit_log
  for select to authenticated using (private.my_role() = 'ops_admin');

revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;
grant select, insert on public.audit_log to service_role;

-- ------------------------------------------------------------------ writing changes, now with their audit entries

create or replace function public.apply_changes(changes jsonb) returns void
language plpgsql set search_path = '' as $$
declare
  t text;
  cols text;
  sets text;
  pk text;
begin
  if changes ? 'replace_assignments' then
    delete from public.session_assignments
     where session_id in (select jsonb_array_elements_text(changes -> 'replace_assignments'));
  end if;

  foreach t in array array['territories', 'coaches', 'coach_private', 'profiles', 'centers', 'center_terms', 'intakes', 'sessions', 'session_assignments', 'settings'] loop
    if jsonb_array_length(coalesce(changes -> t, '[]')) = 0 then
      continue;
    end if;
    select string_agg(quote_ident(k), ', '), string_agg(format('%1$I = excluded.%1$I', k), ', ')
      into cols, sets
      from jsonb_object_keys(changes -> t -> 0) as k;
    select string_agg(quote_ident(a.attname), ', ')
      into pk
      from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
     where i.indrelid = format('public.%I', t)::regclass and i.indisprimary;
    execute format(
      'insert into public.%1$I (%2$s) select %2$s from jsonb_populate_recordset(null::public.%1$I, $1) on conflict (%3$s) do update set %4$s',
      t, cols, pk, sets
    ) using changes -> t;
  end loop;

  insert into public.audit_log (at, actor_id, actor_name, action, target_type, target_id, text)
  select at, actor_id, actor_name, action, target_type, target_id, text
    from jsonb_to_recordset(coalesce(changes -> 'audit', '[]'))
      as a(at timestamptz, actor_id text, actor_name text, action text, target_type text, target_id text, text text);
end;
$$;

revoke execute on function public.apply_changes(jsonb) from public, anon, authenticated;
grant execute on function public.apply_changes(jsonb) to service_role;

-- ------------------------------------------------------------------ accepting an invitation, now logged

create or replace function private.accept_invite_on_sign_in() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles;
  stamp text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if new.last_sign_in_at is not distinct from old.last_sign_in_at then
    return new;
  end if;
  update public.profiles
     set status = 'active',
         activated_at = now(),
         history = history || jsonb_build_array(jsonb_build_object('at', stamp, 'by', name, 'text', 'Accepted the invitation'))
   where auth_user_id = new.id
     and status = 'invited'
     and invited_at > now() - interval '7 days'
  returning * into p;
  if p.id is null then
    return new;
  end if;
  if p.coach_id is not null then
    update public.coaches set active = true where id = p.coach_id;
  end if;
  -- Their sign-in emails stop reading as an invitation.
  update auth.users set raw_user_meta_data = raw_user_meta_data - 'invited_by' where id = new.id;
  insert into public.audit_log (at, actor_id, actor_name, action, target_type, target_id, text)
  values (now(), p.id, p.name, 'acceptInvite', 'person', p.id, 'Accepted the invitation');
  return new;
end;
$$;
