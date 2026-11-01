-- SoccerSessions core schema: the fictional company's data, and who may read it.
--
-- Browsers only ever read. Every change goes through a server function that runs
-- the same actions as the demo (src/data/actions.ts), so there are no write
-- policies here and the signed-in API role gets SELECT only.
--
-- The read rules mirror src/engine/access.ts; tests/db/rules.test.ts signs in as
-- each role and checks the database returns exactly what access.ts allows.
--
-- Row rules can hide rows, not columns, so the management-only fields live in
-- their own tables: coach pay and change log in coach_private, a center's price
-- in center_terms.

-- Helpers for the rules below. Outside the API's schemas, so they can't be called directly.
create schema private;

-- ------------------------------------------------------------------ tables

create table public.territories (
  id text primary key,
  name text not null,
  state text not null,
  center_lat double precision not null,
  center_lng double precision not null
);

create table public.coaches (
  id text primary key,
  territory_id text not null references public.territories,
  name text not null,
  phone text not null,
  email text not null,
  level text not null check (level in ('lead', 'assistant', 'trainee')),
  active boolean not null default true,
  -- Hours (9..17) usually free, keyed by weekday 1..6.
  availability jsonb not null,
  time_off jsonb not null default '[]',
  -- One-week changes keyed by that week's Monday.
  week_changes jsonb not null default '{}',
  availability_confirmed_week date
);

-- Management only: pay rate, and the change log (which records pay changes).
create table public.coach_private (
  coach_id text primary key references public.coaches,
  pay_rate numeric(6, 2) not null check (pay_rate > 0),
  history jsonb not null default '[]'
);

-- One row per person who can sign in. auth_user_id links to Supabase's own
-- sign-in record; it stays empty until the person accepts their invite.
create table public.profiles (
  id text primary key,
  auth_user_id uuid unique references auth.users,
  name text not null,
  email text not null unique,
  role text not null check (role in ('ops_admin', 'territory_manager', 'sales_rep', 'coach')),
  territory_ids text[] not null default '{}',
  coach_id text unique references public.coaches,
  status text not null default 'active' check (status in ('invited', 'active', 'deactivated')),
  invited_by text references public.profiles,
  invited_at timestamptz,
  activated_at timestamptz,
  deactivated_at timestamptz,
  deactivated_by text references public.profiles,
  check ((role = 'coach') = (coach_id is not null))
);

create table public.centers (
  id text primary key,
  territory_id text not null references public.territories,
  name text not null,
  phone text not null,
  address text not null,
  lat double precision not null,
  lng double precision not null,
  poc jsonb not null,
  space jsonb not null
);

-- What the center bought, price included, and changes after signing:
-- management and the rep who signed the center only.
create table public.center_terms (
  center_id text primary key references public.centers,
  terms jsonb,
  history jsonb
);

create table public.intakes (
  id text primary key,
  sales_rep_id text not null references public.profiles,
  territory_id text not null references public.territories,
  center_id text not null references public.centers,
  submitted_at timestamptz not null,
  session_ids text[] not null,
  schedule jsonb not null,
  history jsonb not null default '[]'
);

create table public.sessions (
  id text primary key,
  territory_id text not null references public.territories,
  center_id text not null references public.centers,
  date date not null,
  start_time time not null,
  end_time time not null check (end_time > start_time),
  groups jsonb not null,
  status text not null check (status in ('pending', 'confirmed', 'rescheduled', 'cancelled')),
  rescheduled_date date,
  rescheduled_to_id text references public.sessions deferrable initially deferred,
  rescheduled_from_id text references public.sessions deferrable initially deferred,
  cancel_reason text check (cancel_reason in ('facility_closed', 'weather', 'low_enrollment', 'contract_ended', 'no_coach', 'changed_by_sales', 'other')),
  cancel_note text,
  overrides jsonb not null default '[]',
  history jsonb not null default '[]',
  intake_id text references public.intakes,
  notes text,
  check (status <> 'rescheduled' or rescheduled_date is not null),
  check (status <> 'cancelled' or cancel_reason is not null)
);

create table public.session_assignments (
  session_id text not null references public.sessions,
  coach_id text not null references public.coaches,
  -- Keeps the coaching staff in the order the manager picked them.
  position smallint not null,
  confirmed_by_coach boolean not null default false,
  confirmed_at timestamptz,
  primary key (session_id, coach_id)
);

-- Global rules settings: exactly one row.
create table public.settings (
  id boolean primary key default true check (id),
  buffer_minutes integer not null check (buffer_minutes >= 0),
  avg_speed_mph numeric not null check (avg_speed_mph > 0),
  ratio integer not null check (ratio > 0),
  max_override_ratio integer not null check (max_override_ratio >= ratio)
);

create index on public.coaches (territory_id);
create index on public.centers (territory_id);
create index on public.intakes (sales_rep_id);
create index on public.intakes (center_id);
create index on public.sessions (territory_id, date);
create index on public.sessions (center_id);
create index on public.sessions (intake_id);
create index on public.session_assignments (coach_id);

-- ------------------------------------------------------------------ no delete, anywhere

-- Records are cancelled, rescheduled or deactivated, never deleted. This holds
-- even for server code with full access.
create function private.forbid_delete() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Records are never deleted (%). Cancel, reschedule or deactivate instead.', tg_table_name;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['territories', 'coaches', 'coach_private', 'profiles', 'centers', 'center_terms', 'intakes', 'sessions', 'settings'] loop
    execute format('create trigger no_delete before delete on public.%I for each row execute function private.forbid_delete()', t);
  end loop;
end;
$$;

-- ------------------------------------------------------------------ who is asking

-- Helpers the read rules use. They run with the owner's rights so the rules can
-- look things up without tripping over each other. A deactivated or invited
-- person gets nulls: they see nothing.

create function private.my_profile_id() returns text
language sql stable security definer set search_path = '' as $$
  select id from public.profiles where auth_user_id = (select auth.uid()) and status = 'active'
$$;

create function private.my_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where auth_user_id = (select auth.uid()) and status = 'active'
$$;

create function private.my_territories() returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce((select territory_ids from public.profiles where auth_user_id = (select auth.uid()) and status = 'active'), '{}')
$$;

create function private.my_coach_id() returns text
language sql stable security definer set search_path = '' as $$
  select coach_id from public.profiles where auth_user_id = (select auth.uid()) and status = 'active'
$$;

-- access.ts canSeeTerritory: ops admins see all; managers and reps their own; coaches none.
create function private.sees_territory(t text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.my_role() = 'ops_admin'
    or (private.my_role() in ('territory_manager', 'sales_rep') and t = any(private.my_territories())), false)
$$;

-- access.ts canAssign / canSeeMoney within a territory: management only.
create function private.manages(t text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.my_role() = 'ops_admin'
    or (private.my_role() = 'territory_manager' and t = any(private.my_territories())), false)
$$;

create function private.on_session(s text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.session_assignments where session_id = s and coach_id = private.my_coach_id())
$$;

create function private.my_intake(i text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.intakes where id = i and sales_rep_id = private.my_profile_id())
$$;

create function private.signed_center(c text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.intakes where center_id = c and sales_rep_id = private.my_profile_id())
$$;

create function private.coaches_at_center(c text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.sessions s join public.session_assignments a on a.session_id = s.id
    where s.center_id = c and a.coach_id = private.my_coach_id()
  )
$$;

create function private.coach_territory(c text) returns text
language sql stable security definer set search_path = '' as $$
  select territory_id from public.coaches where id = c
$$;

create function private.center_territory(c text) returns text
language sql stable security definer set search_path = '' as $$
  select territory_id from public.centers where id = c
$$;

-- ------------------------------------------------------------------ read rules

alter table public.territories enable row level security;
alter table public.coaches enable row level security;
alter table public.coach_private enable row level security;
alter table public.profiles enable row level security;
alter table public.centers enable row level security;
alter table public.center_terms enable row level security;
alter table public.intakes enable row level security;
alter table public.sessions enable row level security;
alter table public.session_assignments enable row level security;
alter table public.settings enable row level security;

create policy "Active staff read territories" on public.territories
  for select to authenticated using (private.my_role() is not null);

create policy "Active staff read settings" on public.settings
  for select to authenticated using (private.my_role() is not null);

-- Yourself; ops admins everyone; territory managers people in their territories.
create policy "Read profiles" on public.profiles
  for select to authenticated using (
    auth_user_id = (select auth.uid())
    or private.my_role() = 'ops_admin'
    or (private.my_role() = 'territory_manager' and territory_ids && private.my_territories())
  );

-- access.ts visibleRoster: management and reps in their territories; a coach
-- sees their own record and the active coaches in their territory.
create policy "Read coaches" on public.coaches
  for select to authenticated using (
    private.sees_territory(territory_id)
    or id = private.my_coach_id()
    or (private.my_role() = 'coach' and active and territory_id = any(private.my_territories()))
  );

-- access.ts canSeeMoney.
create policy "Management reads pay" on public.coach_private
  for select to authenticated using (private.manages(private.coach_territory(coach_id)));

-- Management in their territories; a rep the centers they signed; a coach the
-- centers they're scheduled at (for the address and the director's number).
create policy "Read centers" on public.centers
  for select to authenticated using (
    private.manages(territory_id)
    or private.signed_center(id)
    or private.coaches_at_center(id)
  );

-- access.ts canSeePrice.
create policy "Read program terms" on public.center_terms
  for select to authenticated using (
    private.manages(private.center_territory(center_id))
    or private.signed_center(center_id)
  );

-- access.ts visibleIntakes.
create policy "Read intakes" on public.intakes
  for select to authenticated using (
    sales_rep_id = private.my_profile_id()
    or private.manages(territory_id)
  );

-- access.ts visibleSessions + intakeSessions: management in their territories,
-- coaches their own shifts, reps the sessions their intakes created.
create policy "Read sessions" on public.sessions
  for select to authenticated using (
    private.manages(territory_id)
    or private.on_session(id)
    or (intake_id is not null and private.my_intake(intake_id))
  );

-- Whoever can read a session can read its coaching staff.
create policy "Read assignments" on public.session_assignments
  for select to authenticated using (exists (select 1 from public.sessions s where s.id = session_id));

-- ------------------------------------------------------------------ grants

-- New tables aren't exposed automatically (config.toml), so say exactly who gets what:
-- signed-in people read (filtered by the rules above), nobody anonymous gets anything,
-- and server code gets full access.
revoke all on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;

revoke all on schema private from public;
grant usage on schema private to authenticated;
revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;
