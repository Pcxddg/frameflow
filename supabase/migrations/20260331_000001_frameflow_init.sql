create extension if not exists pgcrypto;

create or replace function public.current_user_email()
returns text
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  email_lowercase text not null unique,
  display_name text not null default '',
  photo_url text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.boards (
  id text primary key,
  title text not null,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  niche_name text,
  default_content_type text,
  youtube_channel_url text,
  description_presets jsonb not null default '{}'::jsonb,
  workflow_config jsonb not null default '{}'::jsonb,
  seo_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint boards_default_content_type_check check (
    default_content_type in ('long', 'short', '') or default_content_type is null
  )
);

create table if not exists public.board_members (
  board_id text not null references public.boards(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  email_lowercase text not null,
  role text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (board_id, user_id),
  unique (board_id, email_lowercase),
  constraint board_members_role_check check (role in ('owner', 'editor', 'viewer'))
);

create table if not exists public.labels (
  board_id text not null references public.boards(id) on delete cascade,
  id text not null,
  name text not null,
  color text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (board_id, id)
);

create table if not exists public.lists (
  id text primary key,
  board_id text not null references public.boards(id) on delete cascade,
  title text not null,
  position integer not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  -- position ordering enforced by RPC functions, not DB constraint
  constraint lists_no_unique_position check (true)
);

create table if not exists public.cards (
  id text primary key,
  board_id text not null references public.boards(id) on delete cascade,
  list_id text not null references public.lists(id) on delete cascade,
  position integer not null,
  title text not null,
  description text not null default '',
  due_date timestamptz,
  assignee text,
  content_type text,
  titulos_linden text not null default '',
  gancho_8s text not null default '',
  narrativa text not null default '',
  miniatura_checklist jsonb not null default '{"rostro": false, "texto": false, "contexto": false}'::jsonb,
  thumbnail_plan jsonb not null default '{}'::jsonb,
  ctr_2_hours text not null default '',
  interlinking text not null default '',
  link_drive text not null default '',
  drive_links jsonb not null default '{}'::jsonb,
  guion text not null default '',
  keywords text not null default '',
  storytelling jsonb not null default '{}'::jsonb,
  post_publication jsonb not null default '{}'::jsonb,
  monetization jsonb not null default '{}'::jsonb,
  interlinking_targets jsonb not null default '[]'::jsonb,
  shorts_hook text not null default '',
  shorts_loop boolean not null default false,
  shorts_funnel text not null default '',
  column_history jsonb not null default '[]'::jsonb,
  production_brief jsonb not null default '{}'::jsonb,
  seo_source_text text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint cards_content_type_check check (content_type in ('long', 'short') or content_type is null)
);

create table if not exists public.card_labels (
  board_id text not null,
  card_id text not null references public.cards(id) on delete cascade,
  label_id text not null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (card_id, label_id),
  constraint card_labels_board_fk foreign key (board_id, label_id)
    references public.labels(board_id, id) on delete cascade
);

create table if not exists public.checklists (
  id text primary key,
  card_id text not null references public.cards(id) on delete cascade,
  title text not null,
  position integer not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.checklist_items (
  id text primary key,
  checklist_id text not null references public.checklists(id) on delete cascade,
  text text not null,
  is_completed boolean not null default false,
  position integer not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.production_flows (
  card_id text primary key references public.cards(id) on delete cascade,
  template_id text not null,
  publish_at timestamptz not null,
  created_from_wizard_at timestamptz not null,
  current_stage_id text not null,
  schedule_mode text not null,
  is_tight_schedule boolean not null default false,
  kickoff_at timestamptz,
  working_days_budget integer not null default 0,
  work_mode text not null,
  schedule_status text not null,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.production_stages (
  card_id text not null references public.production_flows(card_id) on delete cascade,
  stage_id text not null,
  label text not null,
  macro_column_id text not null,
  owner_role text not null,
  fallback_owner_role text not null,
  deliverable text not null,
  status text not null,
  due_at timestamptz not null,
  completed_at timestamptz,
  notes text,
  checklist_title text not null,
  has_ai_draft boolean not null default false,
  position integer not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (card_id, stage_id)
);

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  board_id text not null references public.boards(id) on delete cascade,
  board_title_snapshot text not null,
  invitee_email_lowercase text not null,
  inviter_user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null,
  status text not null default 'pending',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  responded_at timestamptz,
  constraint invitations_role_check check (role in ('editor', 'viewer')),
  constraint invitations_status_check check (status in ('pending', 'accepted', 'declined', 'revoked'))
);

create table if not exists public.audit_events (
  id text primary key,
  board_id text not null references public.boards(id) on delete cascade,
  card_id text references public.cards(id) on delete cascade,
  actor_email text not null,
  type text not null,
  at timestamptz not null,
  from_list_id text,
  to_list_id text,
  payload jsonb not null default '{}'::jsonb
);

create table if not exists public.presence_sessions (
  id text primary key,
  board_id text not null references public.boards(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  email_lowercase text not null,
  display_name text not null default '',
  photo_url text not null default '',
  active_surface text,
  is_online boolean not null default true,
  last_heartbeat_at timestamptz not null default timezone('utc', now()),
  entered_at timestamptz not null default timezone('utc', now()),
  left_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.presence_events (
  id uuid primary key default gen_random_uuid(),
  board_id text not null references public.boards(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  email_lowercase text not null,
  display_name text not null default '',
  photo_url text not null default '',
  type text not null,
  surface text,
  at timestamptz not null default timezone('utc', now()),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_board_members_user on public.board_members(user_id);
create index if not exists idx_board_members_email on public.board_members(email_lowercase);
create index if not exists idx_lists_board on public.lists(board_id, position);
create index if not exists idx_cards_board on public.cards(board_id, position);
create index if not exists idx_cards_list on public.cards(list_id, position);
create index if not exists idx_checklists_card on public.checklists(card_id, position);
create index if not exists idx_checklist_items_checklist on public.checklist_items(checklist_id, position);
create index if not exists idx_production_stages_card_position on public.production_stages(card_id, position);
create index if not exists idx_audit_events_board on public.audit_events(board_id, at desc);
create index if not exists idx_invitations_board on public.invitations(board_id, created_at desc);
create index if not exists idx_invitations_email on public.invitations(invitee_email_lowercase, status);
create index if not exists idx_presence_sessions_board on public.presence_sessions(board_id, updated_at desc);
create index if not exists idx_presence_events_board on public.presence_events(board_id, at desc);

create or replace function public.handle_new_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, email_lowercase, display_name, photo_url)
  values (
    new.id,
    coalesce(new.email, ''),
    lower(coalesce(new.email, '')),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(coalesce(new.email, ''), '@', 1), 'Usuario'),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', '')
  )
  on conflict (id) do update
  set
    email = excluded.email,
    email_lowercase = excluded.email_lowercase,
    display_name = excluded.display_name,
    photo_url = excluded.photo_url,
    updated_at = timezone('utc', now());

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_profile();

create or replace function public.seed_board_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.board_members (board_id, user_id, email_lowercase, role)
  select new.id, new.owner_id, p.email_lowercase, 'owner'
  from public.profiles p
  where p.id = new.owner_id
  on conflict (board_id, user_id) do update
  set role = 'owner', updated_at = timezone('utc', now());

  insert into public.labels (board_id, id, name, color)
  values
    (new.id, 'label-red', 'Urgente', 'red'),
    (new.id, 'label-yellow', 'Esperando feedback', 'yellow'),
    (new.id, 'label-blue', 'En manos del editor', 'blue'),
    (new.id, 'label-green', 'Listo para publicar', 'green'),
    (new.id, 'label-purple', 'Short', 'purple'),
    (new.id, 'label-orange', 'Monetizado', 'orange')
  on conflict (board_id, id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_board_created_seed_defaults on public.boards;
create trigger on_board_created_seed_defaults
after insert on public.boards
for each row execute function public.seed_board_defaults();

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists boards_touch_updated_at on public.boards;
create trigger boards_touch_updated_at before update on public.boards
for each row execute function public.touch_updated_at();

drop trigger if exists board_members_touch_updated_at on public.board_members;
create trigger board_members_touch_updated_at before update on public.board_members
for each row execute function public.touch_updated_at();

drop trigger if exists labels_touch_updated_at on public.labels;
create trigger labels_touch_updated_at before update on public.labels
for each row execute function public.touch_updated_at();

drop trigger if exists lists_touch_updated_at on public.lists;
create trigger lists_touch_updated_at before update on public.lists
for each row execute function public.touch_updated_at();

drop trigger if exists cards_touch_updated_at on public.cards;
create trigger cards_touch_updated_at before update on public.cards
for each row execute function public.touch_updated_at();

drop trigger if exists checklists_touch_updated_at on public.checklists;
create trigger checklists_touch_updated_at before update on public.checklists
for each row execute function public.touch_updated_at();

drop trigger if exists checklist_items_touch_updated_at on public.checklist_items;
create trigger checklist_items_touch_updated_at before update on public.checklist_items
for each row execute function public.touch_updated_at();

drop trigger if exists production_flows_touch_updated_at on public.production_flows;
create trigger production_flows_touch_updated_at before update on public.production_flows
for each row execute function public.touch_updated_at();

drop trigger if exists production_stages_touch_updated_at on public.production_stages;
create trigger production_stages_touch_updated_at before update on public.production_stages
for each row execute function public.touch_updated_at();

drop trigger if exists invitations_touch_updated_at on public.invitations;
create trigger invitations_touch_updated_at before update on public.invitations
for each row execute function public.touch_updated_at();

drop trigger if exists presence_sessions_touch_updated_at on public.presence_sessions;
create trigger presence_sessions_touch_updated_at before update on public.presence_sessions
for each row execute function public.touch_updated_at();

create or replace function public.is_board_member(target_board_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.board_members bm
    where bm.board_id = target_board_id
      and bm.user_id = auth.uid()
  );
$$;

create or replace function public.board_role(target_board_id text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select bm.role
    from public.board_members bm
    where bm.board_id = target_board_id
      and bm.user_id = auth.uid()
    limit 1
  ), '');
$$;

create or replace function public.can_edit_board(target_board_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.board_role(target_board_id) in ('owner', 'editor');
$$;

create or replace function public.lookup_profile_by_email(target_email text)
returns table(id uuid, email_lowercase text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.email_lowercase
  from public.profiles p
  where p.email_lowercase = lower(trim(target_email))
  limit 1;
$$;

create or replace view public.board_online_members as
select distinct on (ps.board_id, ps.user_id)
  ps.board_id,
  ps.user_id,
  ps.email_lowercase,
  ps.display_name,
  ps.photo_url,
  ps.active_surface,
  ps.last_heartbeat_at,
  ps.entered_at,
  ps.updated_at
from public.presence_sessions ps
where ps.is_online = true
  and ps.last_heartbeat_at > timezone('utc', now()) - interval '75 seconds'
order by ps.board_id, ps.user_id, ps.last_heartbeat_at desc;

create or replace view public.board_health as
select
  b.id as board_id,
  count(distinct c.id) as total_cards,
  count(distinct case when pf.card_id is not null then c.id end) as guided_cards,
  count(distinct case when pf.schedule_status in ('blocked', 'overdue', 'at_risk') then c.id end) as risky_cards,
  count(distinct case when c.list_id = last_list.id then c.id end) as published_cards,
  count(distinct bom.user_id) as online_members
from public.boards b
left join public.cards c on c.board_id = b.id
left join public.production_flows pf on pf.card_id = c.id
left join lateral (
  select l.id
  from public.lists l
  where l.board_id = b.id
  order by l.position desc
  limit 1
) as last_list on true
left join public.board_online_members bom on bom.board_id = b.id
group by b.id, last_list.id;

create or replace view public.board_flow_summary as
select
  c.board_id,
  pf.current_stage_id,
  pf.schedule_status,
  count(*) as cards_count
from public.cards c
join public.production_flows pf on pf.card_id = c.id
group by c.board_id, pf.current_stage_id, pf.schedule_status;

alter table public.profiles enable row level security;
alter table public.boards enable row level security;
alter table public.board_members enable row level security;
alter table public.labels enable row level security;
alter table public.lists enable row level security;
alter table public.cards enable row level security;
alter table public.card_labels enable row level security;
alter table public.checklists enable row level security;
alter table public.checklist_items enable row level security;
alter table public.production_flows enable row level security;
alter table public.production_stages enable row level security;
alter table public.invitations enable row level security;
alter table public.audit_events enable row level security;
alter table public.presence_sessions enable row level security;
alter table public.presence_events enable row level security;

drop policy if exists "profiles_select_self" on public.profiles;
create policy "profiles_select_self" on public.profiles
for select using (id = auth.uid());

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self" on public.profiles
for insert with check (id = auth.uid());

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles
for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "boards_select_member" on public.boards;
create policy "boards_select_member" on public.boards
for select using (public.is_board_member(id));

drop policy if exists "boards_insert_owner" on public.boards;
create policy "boards_insert_owner" on public.boards
for insert with check (owner_id = auth.uid());

drop policy if exists "boards_update_editor" on public.boards;
create policy "boards_update_editor" on public.boards
for update using (public.can_edit_board(id)) with check (public.can_edit_board(id));

drop policy if exists "boards_delete_owner" on public.boards;
create policy "boards_delete_owner" on public.boards
for delete using (public.board_role(id) = 'owner');

drop policy if exists "board_members_select_member" on public.board_members;
create policy "board_members_select_member" on public.board_members
for select using (public.is_board_member(board_id));

drop policy if exists "board_members_insert_owner" on public.board_members;
create policy "board_members_insert_owner" on public.board_members
for insert with check (
  public.board_role(board_id) = 'owner'
  or (
    user_id = auth.uid()
    and role = 'owner'
    and exists(select 1 from public.boards b where b.id = board_id and b.owner_id = auth.uid())
  )
);

drop policy if exists "board_members_update_owner" on public.board_members;
create policy "board_members_update_owner" on public.board_members
for update using (public.board_role(board_id) = 'owner') with check (public.board_role(board_id) = 'owner');

drop policy if exists "board_members_delete_owner" on public.board_members;
create policy "board_members_delete_owner" on public.board_members
for delete using (public.board_role(board_id) = 'owner');

drop policy if exists "labels_select_member" on public.labels;
create policy "labels_select_member" on public.labels
for select using (public.is_board_member(board_id));

drop policy if exists "labels_modify_editor" on public.labels;
create policy "labels_modify_editor" on public.labels
for all using (public.can_edit_board(board_id)) with check (public.can_edit_board(board_id));

drop policy if exists "lists_select_member" on public.lists;
create policy "lists_select_member" on public.lists
for select using (public.is_board_member(board_id));

drop policy if exists "lists_modify_editor" on public.lists;
create policy "lists_modify_editor" on public.lists
for all using (public.can_edit_board(board_id)) with check (public.can_edit_board(board_id));

drop policy if exists "cards_select_member" on public.cards;
create policy "cards_select_member" on public.cards
for select using (public.is_board_member(board_id));

drop policy if exists "cards_modify_editor" on public.cards;
create policy "cards_modify_editor" on public.cards
for all using (public.can_edit_board(board_id)) with check (public.can_edit_board(board_id));

drop policy if exists "card_labels_select_member" on public.card_labels;
create policy "card_labels_select_member" on public.card_labels
for select using (public.is_board_member(board_id));

drop policy if exists "card_labels_modify_editor" on public.card_labels;
create policy "card_labels_modify_editor" on public.card_labels
for all using (public.can_edit_board(board_id)) with check (public.can_edit_board(board_id));

drop policy if exists "checklists_select_member" on public.checklists;
create policy "checklists_select_member" on public.checklists
for select using (
  exists(select 1 from public.cards c where c.id = card_id and public.is_board_member(c.board_id))
);

drop policy if exists "checklists_modify_editor" on public.checklists;
create policy "checklists_modify_editor" on public.checklists
for all using (
  exists(select 1 from public.cards c where c.id = card_id and public.can_edit_board(c.board_id))
) with check (
  exists(select 1 from public.cards c where c.id = card_id and public.can_edit_board(c.board_id))
);

drop policy if exists "checklist_items_select_member" on public.checklist_items;
create policy "checklist_items_select_member" on public.checklist_items
for select using (
  exists(
    select 1
    from public.checklists cl
    join public.cards c on c.id = cl.card_id
    where cl.id = checklist_id
      and public.is_board_member(c.board_id)
  )
);

drop policy if exists "checklist_items_modify_editor" on public.checklist_items;
create policy "checklist_items_modify_editor" on public.checklist_items
for all using (
  exists(
    select 1
    from public.checklists cl
    join public.cards c on c.id = cl.card_id
    where cl.id = checklist_id
      and public.can_edit_board(c.board_id)
  )
) with check (
  exists(
    select 1
    from public.checklists cl
    join public.cards c on c.id = cl.card_id
    where cl.id = checklist_id
      and public.can_edit_board(c.board_id)
  )
);

drop policy if exists "production_flows_select_member" on public.production_flows;
create policy "production_flows_select_member" on public.production_flows
for select using (
  exists(select 1 from public.cards c where c.id = card_id and public.is_board_member(c.board_id))
);

drop policy if exists "production_flows_modify_editor" on public.production_flows;
create policy "production_flows_modify_editor" on public.production_flows
for all using (
  exists(select 1 from public.cards c where c.id = card_id and public.can_edit_board(c.board_id))
) with check (
  exists(select 1 from public.cards c where c.id = card_id and public.can_edit_board(c.board_id))
);

drop policy if exists "production_stages_select_member" on public.production_stages;
create policy "production_stages_select_member" on public.production_stages
for select using (
  exists(select 1 from public.cards c where c.id = card_id and public.is_board_member(c.board_id))
);

drop policy if exists "production_stages_modify_editor" on public.production_stages;
create policy "production_stages_modify_editor" on public.production_stages
for all using (
  exists(select 1 from public.cards c where c.id = card_id and public.can_edit_board(c.board_id))
) with check (
  exists(select 1 from public.cards c where c.id = card_id and public.can_edit_board(c.board_id))
);

drop policy if exists "invitations_select_participants" on public.invitations;
create policy "invitations_select_participants" on public.invitations
for select using (
  public.board_role(board_id) = 'owner'
  or invitee_email_lowercase = public.current_user_email()
);

drop policy if exists "invitations_insert_owner" on public.invitations;
create policy "invitations_insert_owner" on public.invitations
for insert with check (public.board_role(board_id) = 'owner' and inviter_user_id = auth.uid());

drop policy if exists "invitations_update_owner_or_invitee" on public.invitations;
create policy "invitations_update_owner_or_invitee" on public.invitations
for update using (
  public.board_role(board_id) = 'owner'
  or invitee_email_lowercase = public.current_user_email()
) with check (
  public.board_role(board_id) = 'owner'
  or invitee_email_lowercase = public.current_user_email()
);

drop policy if exists "audit_events_select_member" on public.audit_events;
create policy "audit_events_select_member" on public.audit_events
for select using (public.is_board_member(board_id));

drop policy if exists "audit_events_insert_editor" on public.audit_events;
create policy "audit_events_insert_editor" on public.audit_events
for insert with check (public.can_edit_board(board_id));

drop policy if exists "presence_sessions_select_member" on public.presence_sessions;
create policy "presence_sessions_select_member" on public.presence_sessions
for select using (public.is_board_member(board_id));

drop policy if exists "presence_sessions_insert_self" on public.presence_sessions;
create policy "presence_sessions_insert_self" on public.presence_sessions
for insert with check (public.is_board_member(board_id) and user_id = auth.uid());

drop policy if exists "presence_sessions_update_self" on public.presence_sessions;
create policy "presence_sessions_update_self" on public.presence_sessions
for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "presence_sessions_delete_self" on public.presence_sessions;
create policy "presence_sessions_delete_self" on public.presence_sessions
for delete using (user_id = auth.uid());

drop policy if exists "presence_events_select_member" on public.presence_events;
create policy "presence_events_select_member" on public.presence_events
for select using (public.is_board_member(board_id));

drop policy if exists "presence_events_insert_self" on public.presence_events;
create policy "presence_events_insert_self" on public.presence_events
for insert with check (public.is_board_member(board_id) and user_id = auth.uid());

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'boards',
    'board_members',
    'labels',
    'lists',
    'cards',
    'card_labels',
    'checklists',
    'checklist_items',
    'production_flows',
    'production_stages',
    'invitations',
    'audit_events',
    'presence_sessions',
    'presence_events'
  ]
  loop
    execute format('alter table public.%I replica identity full', tbl);
    begin
      execute format('alter publication supabase_realtime add table public.%I', tbl);
    exception
      when duplicate_object then null;
      when undefined_object then null;
    end;
  end loop;
end $$;
