create or replace function public.ff_apply_list_order(
  p_board_id text,
  p_list_id text,
  p_card_ids text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expected_count integer;
  v_payload_count integer;
begin
  select count(*)
  into v_expected_count
  from public.cards
  where board_id = p_board_id
    and list_id = p_list_id;

  v_payload_count := coalesce(cardinality(p_card_ids), 0);

  if v_expected_count <> v_payload_count then
    raise exception using
      errcode = '22023',
      message = format(
        'ff_apply_list_order payload mismatch for list %s: expected %s cards, received %s',
        p_list_id,
        v_expected_count,
        v_payload_count
      );
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_card_ids, array[]::text[])) as requested(card_id)
    left join public.cards c
      on c.id = requested.card_id
     and c.board_id = p_board_id
     and c.list_id = p_list_id
    where c.id is null
  ) then
    raise exception using
      errcode = '22023',
      message = format('ff_apply_list_order received card IDs outside list %s', p_list_id);
  end if;

  if v_payload_count = 0 then
    return;
  end if;

  with desired as (
    select card_id, ordinality::integer - 1 as next_position
    from unnest(p_card_ids) with ordinality as ordered(card_id, ordinality)
  )
  update public.cards c
  set position = -(desired.next_position + 1),
      updated_at = timezone('utc', now())
  from desired
  where c.id = desired.card_id
    and c.board_id = p_board_id
    and c.list_id = p_list_id;

  with desired as (
    select card_id, ordinality::integer - 1 as next_position
    from unnest(p_card_ids) with ordinality as ordered(card_id, ordinality)
  )
  update public.cards c
  set position = desired.next_position,
      updated_at = timezone('utc', now())
  from desired
  where c.id = desired.card_id
    and c.board_id = p_board_id
    and c.list_id = p_list_id;
end;
$$;

revoke all on function public.ff_apply_list_order(text, text, text[]) from public;

create or replace function public.ff_insert_card(
  p_board_id text,
  p_list_id text,
  p_card jsonb,
  p_target_index integer default null
)
returns public.cards
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card public.cards;
  v_current_ids text[];
  v_next_ids text[];
  v_target_index integer;
  v_list_count integer;
  v_temp_position integer;
begin
  if not (select public.can_edit_board(p_board_id)) then
    raise exception using errcode = '42501', message = 'ff_insert_card: permission denied for board';
  end if;

  perform pg_advisory_xact_lock(hashtext('ff_board:' || p_board_id));

  perform 1
  from public.lists
  where id = p_list_id
    and board_id = p_board_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'ff_insert_card: target list not found';
  end if;

  perform 1
  from public.cards
  where board_id = p_board_id
    and list_id = p_list_id
  for update;

  select coalesce(array_agg(id order by position, id), array[]::text[])
  into v_current_ids
  from public.cards
  where board_id = p_board_id
    and list_id = p_list_id;

  v_list_count := coalesce(cardinality(v_current_ids), 0);
  v_target_index := least(greatest(coalesce(p_target_index, v_list_count), 0), v_list_count);
  v_temp_position := -(v_list_count + 1);

  insert into public.cards (
    id,
    board_id,
    list_id,
    position,
    title,
    description,
    due_date,
    assignee,
    content_type,
    titulos_linden,
    gancho_8s,
    narrativa,
    miniatura_checklist,
    thumbnail_plan,
    ctr_2_hours,
    interlinking,
    link_drive,
    drive_links,
    guion,
    keywords,
    storytelling,
    post_publication,
    monetization,
    interlinking_targets,
    shorts_hook,
    shorts_loop,
    shorts_funnel,
    column_history,
    production_brief,
    seo_source_text,
    created_at,
    updated_at
  )
  values (
    p_card->>'id',
    p_board_id,
    p_list_id,
    v_temp_position,
    coalesce(p_card->>'title', ''),
    coalesce(p_card->>'description', ''),
    nullif(p_card->>'due_date', '')::timestamptz,
    nullif(p_card->>'assignee', ''),
    nullif(p_card->>'content_type', ''),
    coalesce(p_card->>'titulos_linden', ''),
    coalesce(p_card->>'gancho_8s', ''),
    coalesce(p_card->>'narrativa', ''),
    coalesce(p_card->'miniatura_checklist', '{"rostro": false, "texto": false, "contexto": false}'::jsonb),
    coalesce(p_card->'thumbnail_plan', '{}'::jsonb),
    coalesce(p_card->>'ctr_2_hours', ''),
    coalesce(p_card->>'interlinking', ''),
    coalesce(p_card->>'link_drive', ''),
    coalesce(p_card->'drive_links', '{}'::jsonb),
    coalesce(p_card->>'guion', ''),
    coalesce(p_card->>'keywords', ''),
    coalesce(p_card->'storytelling', '{}'::jsonb),
    coalesce(p_card->'post_publication', '{}'::jsonb),
    coalesce(p_card->'monetization', '{}'::jsonb),
    coalesce(p_card->'interlinking_targets', '[]'::jsonb),
    coalesce(p_card->>'shorts_hook', ''),
    coalesce((p_card->>'shorts_loop')::boolean, false),
    coalesce(p_card->>'shorts_funnel', ''),
    coalesce(p_card->'column_history', '[]'::jsonb),
    coalesce(p_card->'production_brief', '{}'::jsonb),
    coalesce(p_card->>'seo_source_text', ''),
    coalesce(nullif(p_card->>'created_at', '')::timestamptz, timezone('utc', now())),
    timezone('utc', now())
  )
  returning *
  into v_card;

  v_next_ids := coalesce(v_current_ids[1:v_target_index], array[]::text[])
    || array[v_card.id]
    || coalesce(v_current_ids[v_target_index + 1:v_list_count], array[]::text[]);

  perform public.ff_apply_list_order(p_board_id, p_list_id, v_next_ids);

  select *
  into v_card
  from public.cards
  where id = v_card.id;

  return v_card;
end;
$$;

revoke all on function public.ff_insert_card(text, text, jsonb, integer) from public;
grant execute on function public.ff_insert_card(text, text, jsonb, integer) to authenticated;
grant execute on function public.ff_insert_card(text, text, jsonb, integer) to service_role;

create or replace function public.ff_update_card_core(
  p_board_id text,
  p_card_id text,
  p_card jsonb
)
returns public.cards
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card public.cards;
begin
  if not (select public.can_edit_board(p_board_id)) then
    raise exception using errcode = '42501', message = 'ff_update_card_core: permission denied for board';
  end if;

  perform pg_advisory_xact_lock(hashtext('ff_board:' || p_board_id));

  update public.cards
  set title = coalesce(p_card->>'title', ''),
      description = coalesce(p_card->>'description', ''),
      due_date = nullif(p_card->>'due_date', '')::timestamptz,
      assignee = nullif(p_card->>'assignee', ''),
      content_type = nullif(p_card->>'content_type', ''),
      titulos_linden = coalesce(p_card->>'titulos_linden', ''),
      gancho_8s = coalesce(p_card->>'gancho_8s', ''),
      narrativa = coalesce(p_card->>'narrativa', ''),
      miniatura_checklist = coalesce(p_card->'miniatura_checklist', '{"rostro": false, "texto": false, "contexto": false}'::jsonb),
      thumbnail_plan = coalesce(p_card->'thumbnail_plan', '{}'::jsonb),
      ctr_2_hours = coalesce(p_card->>'ctr_2_hours', ''),
      interlinking = coalesce(p_card->>'interlinking', ''),
      link_drive = coalesce(p_card->>'link_drive', ''),
      drive_links = coalesce(p_card->'drive_links', '{}'::jsonb),
      guion = coalesce(p_card->>'guion', ''),
      keywords = coalesce(p_card->>'keywords', ''),
      storytelling = coalesce(p_card->'storytelling', '{}'::jsonb),
      post_publication = coalesce(p_card->'post_publication', '{}'::jsonb),
      monetization = coalesce(p_card->'monetization', '{}'::jsonb),
      interlinking_targets = coalesce(p_card->'interlinking_targets', '[]'::jsonb),
      shorts_hook = coalesce(p_card->>'shorts_hook', ''),
      shorts_loop = coalesce((p_card->>'shorts_loop')::boolean, false),
      shorts_funnel = coalesce(p_card->>'shorts_funnel', ''),
      column_history = coalesce(p_card->'column_history', '[]'::jsonb),
      production_brief = coalesce(p_card->'production_brief', '{}'::jsonb),
      seo_source_text = coalesce(p_card->>'seo_source_text', ''),
      updated_at = timezone('utc', now())
  where id = p_card_id
    and board_id = p_board_id
  returning *
  into v_card;

  if not found then
    raise exception using errcode = 'P0002', message = 'ff_update_card_core: card not found';
  end if;

  return v_card;
end;
$$;

revoke all on function public.ff_update_card_core(text, text, jsonb) from public;
grant execute on function public.ff_update_card_core(text, text, jsonb) to authenticated;
grant execute on function public.ff_update_card_core(text, text, jsonb) to service_role;

create or replace function public.ff_move_card(
  p_board_id text,
  p_card_id text,
  p_source_list_id text,
  p_dest_list_id text,
  p_dest_index integer,
  p_card jsonb
)
returns public.cards
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card public.cards;
  v_source_ids text[];
  v_dest_ids text[];
  v_new_source_ids text[];
  v_new_dest_ids text[];
  v_source_count integer;
  v_dest_count integer;
  v_dest_index integer;
  v_temp_position integer;
begin
  if not (select public.can_edit_board(p_board_id)) then
    raise exception using errcode = '42501', message = 'ff_move_card: permission denied for board';
  end if;

  perform pg_advisory_xact_lock(hashtext('ff_board:' || p_board_id));

  perform 1
  from public.lists
  where id = p_source_list_id
    and board_id = p_board_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'ff_move_card: source list not found';
  end if;

  perform 1
  from public.lists
  where id = p_dest_list_id
    and board_id = p_board_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'ff_move_card: destination list not found';
  end if;

  select *
  into v_card
  from public.cards
  where id = p_card_id
    and board_id = p_board_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'ff_move_card: card not found';
  end if;

  if v_card.list_id <> p_source_list_id then
    raise exception using errcode = '22023', message = 'ff_move_card: card is not in the declared source list';
  end if;

  perform 1
  from public.cards
  where board_id = p_board_id
    and list_id = p_source_list_id
  for update;

  select coalesce(array_agg(id order by position, id), array[]::text[])
  into v_source_ids
  from public.cards
  where board_id = p_board_id
    and list_id = p_source_list_id;

  v_new_source_ids := array_remove(v_source_ids, p_card_id);
  v_source_count := coalesce(cardinality(v_new_source_ids), 0);

  if p_source_list_id = p_dest_list_id then
    v_dest_index := least(greatest(coalesce(p_dest_index, v_source_count), 0), v_source_count);
    v_new_source_ids := coalesce(v_new_source_ids[1:v_dest_index], array[]::text[])
      || array[p_card_id]
      || coalesce(v_new_source_ids[v_dest_index + 1:v_source_count], array[]::text[]);

    update public.cards
    set title = coalesce(p_card->>'title', ''),
        description = coalesce(p_card->>'description', ''),
        due_date = nullif(p_card->>'due_date', '')::timestamptz,
        assignee = nullif(p_card->>'assignee', ''),
        content_type = nullif(p_card->>'content_type', ''),
        titulos_linden = coalesce(p_card->>'titulos_linden', ''),
        gancho_8s = coalesce(p_card->>'gancho_8s', ''),
        narrativa = coalesce(p_card->>'narrativa', ''),
        miniatura_checklist = coalesce(p_card->'miniatura_checklist', '{"rostro": false, "texto": false, "contexto": false}'::jsonb),
        thumbnail_plan = coalesce(p_card->'thumbnail_plan', '{}'::jsonb),
        ctr_2_hours = coalesce(p_card->>'ctr_2_hours', ''),
        interlinking = coalesce(p_card->>'interlinking', ''),
        link_drive = coalesce(p_card->>'link_drive', ''),
        drive_links = coalesce(p_card->'drive_links', '{}'::jsonb),
        guion = coalesce(p_card->>'guion', ''),
        keywords = coalesce(p_card->>'keywords', ''),
        storytelling = coalesce(p_card->'storytelling', '{}'::jsonb),
        post_publication = coalesce(p_card->'post_publication', '{}'::jsonb),
        monetization = coalesce(p_card->'monetization', '{}'::jsonb),
        interlinking_targets = coalesce(p_card->'interlinking_targets', '[]'::jsonb),
        shorts_hook = coalesce(p_card->>'shorts_hook', ''),
        shorts_loop = coalesce((p_card->>'shorts_loop')::boolean, false),
        shorts_funnel = coalesce(p_card->>'shorts_funnel', ''),
        column_history = coalesce(p_card->'column_history', '[]'::jsonb),
        production_brief = coalesce(p_card->'production_brief', '{}'::jsonb),
        seo_source_text = coalesce(p_card->>'seo_source_text', ''),
        updated_at = timezone('utc', now())
    where id = p_card_id
      and board_id = p_board_id;

    perform public.ff_apply_list_order(p_board_id, p_source_list_id, v_new_source_ids);
  else
    perform 1
    from public.cards
    where board_id = p_board_id
      and list_id = p_dest_list_id
    for update;

    select coalesce(array_agg(id order by position, id), array[]::text[])
    into v_dest_ids
    from public.cards
    where board_id = p_board_id
      and list_id = p_dest_list_id;

    v_dest_count := coalesce(cardinality(v_dest_ids), 0);
    v_dest_index := least(greatest(coalesce(p_dest_index, v_dest_count), 0), v_dest_count);
    v_temp_position := -(v_dest_count + 1);

    v_new_dest_ids := coalesce(v_dest_ids[1:v_dest_index], array[]::text[])
      || array[p_card_id]
      || coalesce(v_dest_ids[v_dest_index + 1:v_dest_count], array[]::text[]);

    update public.cards
    set list_id = p_dest_list_id,
        position = v_temp_position,
        title = coalesce(p_card->>'title', ''),
        description = coalesce(p_card->>'description', ''),
        due_date = nullif(p_card->>'due_date', '')::timestamptz,
        assignee = nullif(p_card->>'assignee', ''),
        content_type = nullif(p_card->>'content_type', ''),
        titulos_linden = coalesce(p_card->>'titulos_linden', ''),
        gancho_8s = coalesce(p_card->>'gancho_8s', ''),
        narrativa = coalesce(p_card->>'narrativa', ''),
        miniatura_checklist = coalesce(p_card->'miniatura_checklist', '{"rostro": false, "texto": false, "contexto": false}'::jsonb),
        thumbnail_plan = coalesce(p_card->'thumbnail_plan', '{}'::jsonb),
        ctr_2_hours = coalesce(p_card->>'ctr_2_hours', ''),
        interlinking = coalesce(p_card->>'interlinking', ''),
        link_drive = coalesce(p_card->>'link_drive', ''),
        drive_links = coalesce(p_card->'drive_links', '{}'::jsonb),
        guion = coalesce(p_card->>'guion', ''),
        keywords = coalesce(p_card->>'keywords', ''),
        storytelling = coalesce(p_card->'storytelling', '{}'::jsonb),
        post_publication = coalesce(p_card->'post_publication', '{}'::jsonb),
        monetization = coalesce(p_card->'monetization', '{}'::jsonb),
        interlinking_targets = coalesce(p_card->'interlinking_targets', '[]'::jsonb),
        shorts_hook = coalesce(p_card->>'shorts_hook', ''),
        shorts_loop = coalesce((p_card->>'shorts_loop')::boolean, false),
        shorts_funnel = coalesce(p_card->>'shorts_funnel', ''),
        column_history = coalesce(p_card->'column_history', '[]'::jsonb),
        production_brief = coalesce(p_card->'production_brief', '{}'::jsonb),
        seo_source_text = coalesce(p_card->>'seo_source_text', ''),
        updated_at = timezone('utc', now())
    where id = p_card_id
      and board_id = p_board_id;

    perform public.ff_apply_list_order(p_board_id, p_source_list_id, v_new_source_ids);
    perform public.ff_apply_list_order(p_board_id, p_dest_list_id, v_new_dest_ids);
  end if;

  select *
  into v_card
  from public.cards
  where id = p_card_id;

  return v_card;
end;
$$;

revoke all on function public.ff_move_card(text, text, text, text, integer, jsonb) from public;
grant execute on function public.ff_move_card(text, text, text, text, integer, jsonb) to authenticated;
grant execute on function public.ff_move_card(text, text, text, text, integer, jsonb) to service_role;

create or replace function public.ff_delete_card(
  p_board_id text,
  p_card_id text,
  p_list_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining_ids text[];
begin
  if not (select public.can_edit_board(p_board_id)) then
    raise exception using errcode = '42501', message = 'ff_delete_card: permission denied for board';
  end if;

  perform pg_advisory_xact_lock(hashtext('ff_board:' || p_board_id));

  perform 1
  from public.lists
  where id = p_list_id
    and board_id = p_board_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'ff_delete_card: list not found';
  end if;

  perform 1
  from public.cards
  where id = p_card_id
    and board_id = p_board_id
    and list_id = p_list_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'ff_delete_card: card not found';
  end if;

  delete from public.cards
  where id = p_card_id
    and board_id = p_board_id;

  perform 1
  from public.cards
  where board_id = p_board_id
    and list_id = p_list_id
  for update;

  select coalesce(array_agg(id order by position, id), array[]::text[])
  into v_remaining_ids
  from public.cards
  where board_id = p_board_id
    and list_id = p_list_id;

  perform public.ff_apply_list_order(p_board_id, p_list_id, v_remaining_ids);
end;
$$;

revoke all on function public.ff_delete_card(text, text, text) from public;
grant execute on function public.ff_delete_card(text, text, text) to authenticated;
grant execute on function public.ff_delete_card(text, text, text) to service_role;

create or replace function public.ff_repair_list_positions(
  p_board_id text,
  p_list_id text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_list record;
  v_card_ids text[];
  v_repaired integer := 0;
begin
  if not (select public.can_edit_board(p_board_id)) then
    raise exception using errcode = '42501', message = 'ff_repair_list_positions: permission denied for board';
  end if;

  perform pg_advisory_xact_lock(hashtext('ff_board:' || p_board_id));

  for v_list in
    select id
    from public.lists
    where board_id = p_board_id
      and (p_list_id is null or id = p_list_id)
    order by position
    for update
  loop
    perform 1
    from public.cards
    where board_id = p_board_id
      and list_id = v_list.id
    for update;

    select coalesce(array_agg(id order by position, updated_at, id), array[]::text[])
    into v_card_ids
    from public.cards
    where board_id = p_board_id
      and list_id = v_list.id;

    perform public.ff_apply_list_order(p_board_id, v_list.id, v_card_ids);
    v_repaired := v_repaired + 1;
  end loop;

  return v_repaired;
end;
$$;

revoke all on function public.ff_repair_list_positions(text, text) from public;
grant execute on function public.ff_repair_list_positions(text, text) to authenticated;
grant execute on function public.ff_repair_list_positions(text, text) to service_role;

drop policy if exists "boards_select_member" on public.boards;
create policy "boards_select_member" on public.boards
for select using ((select public.is_board_member(id)));

drop policy if exists "boards_update_editor" on public.boards;
create policy "boards_update_editor" on public.boards
for update using ((select public.can_edit_board(id))) with check ((select public.can_edit_board(id)));

drop policy if exists "labels_select_member" on public.labels;
create policy "labels_select_member" on public.labels
for select using ((select public.is_board_member(board_id)));

drop policy if exists "labels_modify_editor" on public.labels;
create policy "labels_modify_editor" on public.labels
for all using ((select public.can_edit_board(board_id))) with check ((select public.can_edit_board(board_id)));

drop policy if exists "lists_select_member" on public.lists;
create policy "lists_select_member" on public.lists
for select using ((select public.is_board_member(board_id)));

drop policy if exists "lists_modify_editor" on public.lists;
create policy "lists_modify_editor" on public.lists
for all using ((select public.can_edit_board(board_id))) with check ((select public.can_edit_board(board_id)));

drop policy if exists "cards_select_member" on public.cards;
create policy "cards_select_member" on public.cards
for select using ((select public.is_board_member(board_id)));

drop policy if exists "cards_modify_editor" on public.cards;
create policy "cards_modify_editor" on public.cards
for all using ((select public.can_edit_board(board_id))) with check ((select public.can_edit_board(board_id)));

drop policy if exists "card_labels_select_member" on public.card_labels;
create policy "card_labels_select_member" on public.card_labels
for select using ((select public.is_board_member(board_id)));

drop policy if exists "card_labels_modify_editor" on public.card_labels;
create policy "card_labels_modify_editor" on public.card_labels
for all using ((select public.can_edit_board(board_id))) with check ((select public.can_edit_board(board_id)));

drop policy if exists "checklists_select_member" on public.checklists;
create policy "checklists_select_member" on public.checklists
for select using (
  exists(
    select 1
    from public.cards c
    where c.id = card_id
      and (select public.is_board_member(c.board_id))
  )
);

drop policy if exists "checklists_modify_editor" on public.checklists;
create policy "checklists_modify_editor" on public.checklists
for all using (
  exists(
    select 1
    from public.cards c
    where c.id = card_id
      and (select public.can_edit_board(c.board_id))
  )
) with check (
  exists(
    select 1
    from public.cards c
    where c.id = card_id
      and (select public.can_edit_board(c.board_id))
  )
);

drop policy if exists "checklist_items_select_member" on public.checklist_items;
create policy "checklist_items_select_member" on public.checklist_items
for select using (
  exists(
    select 1
    from public.checklists cl
    join public.cards c on c.id = cl.card_id
    where cl.id = checklist_id
      and (select public.is_board_member(c.board_id))
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
      and (select public.can_edit_board(c.board_id))
  )
) with check (
  exists(
    select 1
    from public.checklists cl
    join public.cards c on c.id = cl.card_id
    where cl.id = checklist_id
      and (select public.can_edit_board(c.board_id))
  )
);

drop policy if exists "production_flows_select_member" on public.production_flows;
create policy "production_flows_select_member" on public.production_flows
for select using (
  exists(
    select 1
    from public.cards c
    where c.id = card_id
      and (select public.is_board_member(c.board_id))
  )
);

drop policy if exists "production_flows_modify_editor" on public.production_flows;
create policy "production_flows_modify_editor" on public.production_flows
for all using (
  exists(
    select 1
    from public.cards c
    where c.id = card_id
      and (select public.can_edit_board(c.board_id))
  )
) with check (
  exists(
    select 1
    from public.cards c
    where c.id = card_id
      and (select public.can_edit_board(c.board_id))
  )
);

drop policy if exists "production_stages_select_member" on public.production_stages;
create policy "production_stages_select_member" on public.production_stages
for select using (
  exists(
    select 1
    from public.cards c
    where c.id = card_id
      and (select public.is_board_member(c.board_id))
  )
);

drop policy if exists "production_stages_modify_editor" on public.production_stages;
create policy "production_stages_modify_editor" on public.production_stages
for all using (
  exists(
    select 1
    from public.cards c
    where c.id = card_id
      and (select public.can_edit_board(c.board_id))
  )
) with check (
  exists(
    select 1
    from public.cards c
    where c.id = card_id
      and (select public.can_edit_board(c.board_id))
  )
);

drop policy if exists "audit_events_select_member" on public.audit_events;
create policy "audit_events_select_member" on public.audit_events
for select using ((select public.is_board_member(board_id)));

drop policy if exists "audit_events_insert_editor" on public.audit_events;
create policy "audit_events_insert_editor" on public.audit_events
for insert with check ((select public.can_edit_board(board_id)));
