-- Accounts (docs/accounts-plan.md, phase 4): each person's account history,
-- turning an invitation into an active account on first sign-in, and the one
-- way server code writes changes.

alter table public.profiles add column history jsonb not null default '[]';

-- ------------------------------------------------------------------ accepting an invitation

-- The first time an invited person signs in (within 7 days of the invitation),
-- their account becomes active, and a coach can be scheduled. Same rules as
-- the demo's acceptInvite action (src/data/actions.ts).
create function private.accept_invite_on_sign_in() returns trigger
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
  if p.coach_id is not null then
    update public.coaches set active = true where id = p.coach_id;
  end if;
  if p.id is not null then
    -- Their sign-in emails stop reading as an invitation.
    update auth.users set raw_user_meta_data = raw_user_meta_data - 'invited_by' where id = new.id;
  end if;
  return new;
end;
$$;

create trigger accept_invite_on_sign_in
  after update of last_sign_in_at on auth.users
  for each row execute function private.accept_invite_on_sign_in();

-- ------------------------------------------------------------------ writing changes

-- Server code (supabase/functions/run-action) runs an action, works out which
-- rows changed, and hands them all here: they're written in one transaction,
-- so a change is never half saved. Only the columns sent are written, so
-- columns the app doesn't know about (like auth_user_id) are left alone.
-- Rows are inserted or updated, never deleted, except a session's coaching
-- staff, which is replaced as a whole for the sessions listed in
-- "replace_assignments".
create function public.apply_changes(changes jsonb) returns void
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
end;
$$;

revoke execute on function public.apply_changes(jsonb) from public, anon, authenticated;
grant execute on function public.apply_changes(jsonb) to service_role;
