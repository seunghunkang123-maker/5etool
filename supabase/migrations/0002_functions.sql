-- =====================================================================
-- 권한 헬퍼 · 뷰 · RPC
-- 헬퍼는 SECURITY DEFINER로 정의해 RLS 정책 안에서 재귀가 생기지 않게 한다.
-- =====================================================================

-- ── 권한 헬퍼 ───────────────────────────────────────────────────────
/**
 * 이용이 정지되지 않은 계정인지 확인한다.
 * 운영자가 profiles.is_suspended를 켜면 이 계정은 어떤 캠페인에도 접근할 수 없다.
 * 모든 캠페인 권한 함수가 이 값을 먼저 확인하므로, 화면이 아니라 데이터베이스에서 차단된다.
 */
create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select not is_suspended from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.campaign_role(p_campaign_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.campaign_members
  where campaign_id = p_campaign_id and user_id = auth.uid() and public.is_active_user();
$$;

create or replace function public.is_campaign_member(p_campaign_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_user() and exists (
    select 1 from public.campaign_members
    where campaign_id = p_campaign_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_campaign_owner(p_campaign_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_user() and exists (
    select 1 from public.campaign_members
    where campaign_id = p_campaign_id and user_id = auth.uid() and role = 'owner'
  );
$$;

create or replace function public.is_campaign_dm(p_campaign_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_user() and exists (
    select 1 from public.campaign_members
    where campaign_id = p_campaign_id and user_id = auth.uid() and role in ('owner', 'co_dm')
  );
$$;

/**
 * 세부 권한 확인.
 * 소유자는 항상 true, 공동 DM은 permissions JSON의 값에 따른다.
 * 플레이어와 관전자는 어떤 관리 권한도 갖지 못한다.
 */
create or replace function public.has_campaign_permission(p_campaign_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_user() and exists (
    select 1 from public.campaign_members m
    where m.campaign_id = p_campaign_id
      and m.user_id = auth.uid()
      and (
        m.role = 'owner'
        or (m.role = 'co_dm' and coalesce((m.permissions ->> p_permission)::boolean, false))
      )
  );
$$;

create or replace function public.can_view_assets(p_campaign_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_campaign_permission(p_campaign_id, 'view_assets');
$$;

create or replace function public.can_edit_assets(p_campaign_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_campaign_permission(p_campaign_id, 'edit_assets');
$$;

create or replace function public.can_manage_combat(p_campaign_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_campaign_permission(p_campaign_id, 'manage_combat');
$$;

create or replace function public.can_manage_players(p_campaign_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_campaign_permission(p_campaign_id, 'manage_players');
$$;

create or replace function public.can_manage_session(p_campaign_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_campaign_permission(p_campaign_id, 'manage_session')
      or public.has_campaign_permission(p_campaign_id, 'manage_campaign');
$$;

create or replace function public.session_campaign_id(p_session_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select campaign_id from public.sessions where id = p_session_id;
$$;

create or replace function public.encounter_campaign_id(p_encounter_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select campaign_id from public.encounters where id = p_encounter_id;
$$;

create or replace function public.combatant_campaign_id(p_combatant_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select e.campaign_id
  from public.encounter_combatants c
  join public.encounters e on e.id = c.encounter_id
  where c.id = p_combatant_id;
$$;

create or replace function public.card_campaign_id(p_card_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select campaign_id from public.cards where id = p_card_id;
$$;

create or replace function public.character_campaign_id(p_character_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select campaign_id from public.player_characters where id = p_character_id;
$$;

create or replace function public.owns_character(p_character_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.player_characters where id = p_character_id and user_id = auth.uid());
$$;

create or replace function public.is_service_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- ── 감사 로그 도우미 ────────────────────────────────────────────────
create or replace function public.write_audit_log(
  p_campaign_id uuid,
  p_action      text,
  p_target_type text default null,
  p_target_id   uuid default null,
  p_meta        jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_logs (campaign_id, actor_id, actor_name, action, target_type, target_id, meta)
  values (
    p_campaign_id,
    auth.uid(),
    coalesce((select display_name from public.profiles where id = auth.uid()), '시스템'),
    p_action,
    p_target_type,
    p_target_id,
    coalesce(p_meta, '{}'::jsonb)
  );
end;
$$;

create or replace function public.write_session_log(
  p_session_id  uuid,
  p_event_type  text,
  p_message     text,
  p_visibility  text default 'dm',
  p_target_type text default null,
  p_target_id   uuid default null,
  p_target_name text default '',
  p_before      jsonb default null,
  p_after       jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.session_logs (
    session_id, campaign_id, actor_id, actor_name, event_type,
    target_type, target_id, target_name, before, after, message, visibility
  )
  values (
    p_session_id,
    public.session_campaign_id(p_session_id),
    auth.uid(),
    coalesce((select display_name from public.profiles where id = auth.uid()), '시스템'),
    p_event_type,
    p_target_type,
    p_target_id,
    coalesce(p_target_name, ''),
    p_before,
    p_after,
    p_message,
    p_visibility
  )
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.notify_users(
  p_user_ids    uuid[],
  p_campaign_id uuid,
  p_session_id  uuid,
  p_type        text,
  p_title       text,
  p_body        text,
  p_data        jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, campaign_id, session_id, type, title, body, data)
  select unnest(p_user_ids), p_campaign_id, p_session_id, p_type, p_title, p_body, coalesce(p_data, '{}'::jsonb);
end;
$$;

create or replace function public.campaign_player_ids(p_campaign_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(user_id), '{}'::uuid[])
  from public.campaign_members
  where campaign_id = p_campaign_id and role in ('player', 'spectator');
$$;

-- ── 뷰 ──────────────────────────────────────────────────────────────
create or replace view public.campaign_overview
with (security_invoker = true)
as
select
  c.*,
  (select count(*) from public.campaign_members m where m.campaign_id = c.id)                     as member_count,
  (select m.role from public.campaign_members m where m.campaign_id = c.id and m.user_id = auth.uid()) as my_role,
  (select p.display_name from public.profiles p where p.id = c.owner_id)                          as owner_name,
  (select max(s.ended_at) from public.sessions s where s.campaign_id = c.id)                      as last_session_at,
  (select min(s.scheduled_at) from public.sessions s
     where s.campaign_id = c.id and s.status = 'scheduled' and s.scheduled_at > now())            as next_session_at
from public.campaigns c
where c.deleted_at is null;

create or replace view public.my_invites
with (security_invoker = true)
as
select i.*, c.name as campaign_name
from public.campaign_invites i
join public.campaigns c on c.id = i.campaign_id
where i.status = 'pending'
  and i.expires_at > now()
  and lower(i.email) = lower(coalesce((select email from public.profiles where id = auth.uid()), ''));

create or replace view public.session_participant_view
with (security_invoker = true)
as
select
  s.id as session_id,
  m.user_id,
  p.display_name,
  m.role,
  coalesce(sp.is_online, false) as is_online,
  coalesce(sp.joined_at, m.joined_at) as joined_at
from public.sessions s
join public.campaign_members m on m.campaign_id = s.campaign_id
join public.profiles p on p.id = m.user_id
left join public.session_participants sp on sp.session_id = s.id and sp.user_id = m.user_id;

/**
 * 플레이어에게 노출되는 카드 뷰.
 *
 * ⚠️ 보안 경계: 이 뷰는 security_invoker를 켜지 않는다(뷰 소유자 권한으로 실행).
 *    따라서 cards 테이블의 RLS를 우회하지만, 아래 CASE 식으로 공개 범위에 맞는 필드만 내보낸다.
 *    dm_notes는 어떤 경우에도 선택 목록에 포함되지 않는다.
 */
create or replace view public.player_visible_cards as
select
  c.id,
  c.campaign_id,
  c.type,
  c.reveal_scope,
  case when public.can_view_assets(c.campaign_id) or c.reveal_scope <> 'hidden' then c.name end as name,
  case
    when public.can_view_assets(c.campaign_id) then c.summary
    when c.reveal_scope = 'full' then c.summary
    when c.reveal_scope = 'partial' and 'summary' = any (c.reveal_fields) then c.summary
  end as summary,
  case
    when public.can_view_assets(c.campaign_id) then c.body
    when c.reveal_scope = 'full' then c.body
    when c.reveal_scope = 'partial' and 'body' = any (c.reveal_fields) then c.body
  end as body,
  case
    when public.can_view_assets(c.campaign_id) then c.image_url
    when c.reveal_scope in ('image_only', 'full') then c.image_url
    when c.reveal_scope = 'partial' and 'image' = any (c.reveal_fields) then c.image_url
  end as image_url,
  case
    when public.can_view_assets(c.campaign_id) or c.reveal_scope = 'full' then
      (select to_jsonb(ms) - 'card_id' from public.monster_stats ms where ms.card_id = c.id)
    when c.reveal_scope = 'partial' then
      (select
         coalesce(
           (case when 'hp_current' = any (c.reveal_fields) then jsonb_build_object('hp', ms.hp) else '{}'::jsonb end) ||
           (case when 'hp_max'     = any (c.reveal_fields) then jsonb_build_object('max_hp', ms.max_hp) else '{}'::jsonb end) ||
           (case when 'ac'         = any (c.reveal_fields) then jsonb_build_object('ac', ms.ac) else '{}'::jsonb end) ||
           (case when 'abilities'  = any (c.reveal_fields) then jsonb_build_object('abilities', ms.abilities) else '{}'::jsonb end) ||
           (case when 'speeds'     = any (c.reveal_fields) then jsonb_build_object('speeds', ms.speeds) else '{}'::jsonb end) ||
           (case when 'cr'         = any (c.reveal_fields) then jsonb_build_object('cr', ms.cr, 'type', ms.type, 'size', ms.size) else '{}'::jsonb end),
           '{}'::jsonb)
       from public.monster_stats ms where ms.card_id = c.id)
  end as stats,
  case
    when public.can_view_assets(c.campaign_id)
      or c.reveal_scope = 'full'
      or (c.reveal_scope = 'partial' and 'actions' = any (c.reveal_fields))
    then (
      select coalesce(jsonb_agg(to_jsonb(s) order by s.sort_order), '[]'::jsonb)
      from public.card_sections s where s.card_id = c.id
    )
  end as sections,
  case
    when (select ms.max_hp from public.monster_stats ms where ms.card_id = c.id) is null then null
    else (
      select case
        when ms.hp <= 0 then 'down'
        when ms.max_hp = 0 then 'healthy'
        when ms.hp::numeric / ms.max_hp > 0.75 then 'healthy'
        when ms.hp::numeric / ms.max_hp > 0.50 then 'bruised'
        when ms.hp::numeric / ms.max_hp > 0.25 then 'wounded'
        else 'critical'
      end
      from public.monster_stats ms where ms.card_id = c.id
    )
  end as hp_tier
from public.cards c
where c.deleted_at is null
  and c.is_archived = false
  and public.is_campaign_member(c.campaign_id)
  and (
    public.can_view_assets(c.campaign_id)
    or (
      c.reveal_scope <> 'hidden'
      and (cardinality(c.reveal_targets) = 0 or auth.uid() = any (c.reveal_targets))
    )
  );

-- ── RPC ─────────────────────────────────────────────────────────────
create or replace function public.join_campaign_by_code(p_code text)
returns setof public.campaigns
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign public.campaigns;
  v_players  integer;
begin
  select * into v_campaign from public.campaigns
  where upper(join_code) = upper(trim(p_code)) and deleted_at is null;

  if not found then
    raise exception '참여 코드를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  if not exists (select 1 from public.campaign_members where campaign_id = v_campaign.id and user_id = auth.uid()) then
    select count(*) into v_players from public.campaign_members
    where campaign_id = v_campaign.id and role = 'player';

    if v_players >= v_campaign.max_players then
      raise exception '이 캠페인은 정원이 가득 찼습니다.' using errcode = 'P0001';
    end if;

    insert into public.campaign_members (campaign_id, user_id, role) values (v_campaign.id, auth.uid(), 'player');
    perform public.write_audit_log(v_campaign.id, 'member.join', 'member', auth.uid(), '{}'::jsonb);
    perform public.notify_users(
      array[v_campaign.owner_id], v_campaign.id, null, 'join_approved', '새 플레이어 참여',
      coalesce((select display_name from public.profiles where id = auth.uid()), '누군가') || ' 님이 참여했습니다.'
    );
  end if;

  return query select * from public.campaigns where id = v_campaign.id;
end;
$$;

create or replace function public.regenerate_join_code(p_campaign_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if not public.can_manage_players(p_campaign_id) then
    raise exception '참여 코드를 변경할 권한이 없습니다.' using errcode = '42501';
  end if;

  loop
    v_code := public.generate_join_code();
    exit when not exists (select 1 from public.campaigns where join_code = v_code);
  end loop;

  update public.campaigns set join_code = v_code where id = p_campaign_id;
  perform public.write_audit_log(p_campaign_id, 'campaign.regenerate_code');
  return v_code;
end;
$$;

create or replace function public.respond_to_invite(p_invite_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.campaign_invites;
  v_email  text;
begin
  select * into v_invite from public.campaign_invites where id = p_invite_id;
  if not found then
    raise exception '초대를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  select email into v_email from public.profiles where id = auth.uid();
  if lower(v_invite.email) <> lower(coalesce(v_email, '')) then
    raise exception '이 초대를 수락할 권한이 없습니다.' using errcode = '42501';
  end if;
  if v_invite.expires_at < now() then
    raise exception '만료된 초대입니다.' using errcode = 'P0001';
  end if;

  update public.campaign_invites
     set status = case when p_accept then 'accepted' else 'revoked' end
   where id = p_invite_id;

  if p_accept then
    insert into public.campaign_members (campaign_id, user_id, role)
    values (v_invite.campaign_id, auth.uid(), v_invite.role)
    on conflict (campaign_id, user_id) do nothing;
    perform public.write_audit_log(v_invite.campaign_id, 'invite.accept', 'member', auth.uid());
  end if;
end;
$$;

create or replace function public.set_card_reveal(
  p_card_id    uuid,
  p_scope      text,
  p_fields     text[] default null,
  p_targets    uuid[] default '{}'::uuid[],
  p_temporary  boolean default false,
  p_session_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card    public.cards;
  v_targets uuid[];
begin
  select * into v_card from public.cards where id = p_card_id;
  if not found then
    raise exception '카드를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;
  if not public.can_edit_assets(v_card.campaign_id) then
    raise exception '공개 범위를 변경할 권한이 없습니다.' using errcode = '42501';
  end if;

  update public.cards
     set previous_scope      = case when p_temporary and not is_temporary_reveal then reveal_scope else previous_scope end,
         reveal_scope        = p_scope,
         reveal_fields       = coalesce(p_fields, reveal_fields),
         reveal_targets      = coalesce(p_targets, '{}'::uuid[]),
         is_temporary_reveal = coalesce(p_temporary, false),
         version             = version + 1
   where id = p_card_id;

  if p_session_id is not null then
    perform public.write_session_log(
      p_session_id,
      'card.reveal',
      case when p_scope = 'hidden'
        then '"' || v_card.name || '" 카드를 비공개로 되돌렸습니다.'
        else '"' || v_card.name || '" 카드를 공개했습니다.' end,
      'all', 'card', p_card_id, v_card.name,
      jsonb_build_object('reveal_scope', v_card.reveal_scope),
      jsonb_build_object('reveal_scope', p_scope)
    );

    insert into public.handout_reveals (session_id, card_id, revealed_by, scope, targets)
    values (p_session_id, p_card_id, auth.uid(), p_scope, coalesce(p_targets, '{}'::uuid[]));
  end if;

  if p_scope <> 'hidden' then
    v_targets := case
      when p_targets is not null and cardinality(p_targets) > 0 then p_targets
      else public.campaign_player_ids(v_card.campaign_id)
    end;
    perform public.notify_users(
      v_targets, v_card.campaign_id, p_session_id,
      case when v_card.type = 'handout' then 'handout_revealed' else 'card_revealed' end,
      case when v_card.type = 'handout' then '새 핸드아웃' else '새 자료 공개' end,
      '"' || v_card.name || '"이(가) 공개되었습니다.',
      jsonb_build_object('card_id', p_card_id)
    );
  end if;

  perform public.write_audit_log(
    v_card.campaign_id, 'card.reveal_scope_change', 'card', p_card_id,
    jsonb_build_object('before', v_card.reveal_scope, 'after', p_scope)
  );
end;
$$;

create or replace function public.soft_delete_card(p_card_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card public.cards;
begin
  select * into v_card from public.cards where id = p_card_id;
  if not found then
    raise exception '카드를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;
  if not public.can_edit_assets(v_card.campaign_id) then
    raise exception '이 자료를 삭제할 권한이 없습니다.' using errcode = '42501';
  end if;

  update public.cards set deleted_at = now(), reveal_scope = 'hidden' where id = p_card_id;

  insert into public.deleted_items (campaign_id, entity_type, entity_id, label, payload, deleted_by)
  values (v_card.campaign_id, 'card', p_card_id, v_card.name, to_jsonb(v_card), auth.uid());
end;
$$;

create or replace function public.restore_deleted_item(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.deleted_items;
begin
  select * into v_item from public.deleted_items where id = p_item_id;
  if not found then
    raise exception '휴지통 항목을 찾을 수 없습니다.' using errcode = 'P0002';
  end if;
  if not public.can_edit_assets(v_item.campaign_id) then
    raise exception '복구할 권한이 없습니다.' using errcode = '42501';
  end if;

  if v_item.entity_type = 'card' then
    update public.cards set deleted_at = null where id = v_item.entity_id;
  elsif v_item.entity_type = 'folder' then
    update public.folders set deleted_at = null where id = v_item.entity_id;
  elsif v_item.entity_type = 'campaign' then
    update public.campaigns set deleted_at = null where id = v_item.entity_id;
  end if;

  delete from public.deleted_items where id = p_item_id;
  perform public.write_audit_log(v_item.campaign_id, 'trash.restore', v_item.entity_type, v_item.entity_id);
end;
$$;

create or replace function public.duplicate_card(p_card_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card   public.cards;
  v_new_id uuid;
begin
  select * into v_card from public.cards where id = p_card_id;
  if not found then
    raise exception '카드를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;
  if not public.can_edit_assets(v_card.campaign_id) then
    raise exception '카드를 복제할 권한이 없습니다.' using errcode = '42501';
  end if;

  insert into public.cards (campaign_id, folder_id, type, name, summary, body, image_url, dm_notes, created_by, sort_order)
  values (v_card.campaign_id, v_card.folder_id, v_card.type, v_card.name || ' (사본)', v_card.summary,
          v_card.body, v_card.image_url, v_card.dm_notes, auth.uid(), v_card.sort_order)
  returning id into v_new_id;

  insert into public.card_tags (card_id, tag_id)
  select v_new_id, tag_id from public.card_tags where card_id = p_card_id;

  insert into public.card_sections (card_id, kind, name, description, sort_order)
  select v_new_id, kind, name, description, sort_order from public.card_sections where card_id = p_card_id;

  insert into public.monster_stats
  select (jsonb_populate_record(null::public.monster_stats,
            to_jsonb(ms) || jsonb_build_object('card_id', v_new_id))).*
  from public.monster_stats ms where ms.card_id = p_card_id;

  return v_new_id;
end;
$$;

create or replace function public.delete_folder(p_folder_id uuid, p_mode text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_folder public.folders;
begin
  select * into v_folder from public.folders where id = p_folder_id;
  if not found then
    raise exception '폴더를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;
  if not public.can_edit_assets(v_folder.campaign_id) then
    raise exception '폴더를 삭제할 권한이 없습니다.' using errcode = '42501';
  end if;

  if p_mode = 'trash_cards' then
    insert into public.deleted_items (campaign_id, entity_type, entity_id, label, payload, deleted_by)
    select v_folder.campaign_id, 'card', c.id, c.name, to_jsonb(c), auth.uid()
    from public.cards c where c.folder_id = p_folder_id and c.deleted_at is null;

    update public.cards set deleted_at = now(), reveal_scope = 'hidden'
     where folder_id = p_folder_id and deleted_at is null;
  elsif p_mode = 'move_up' then
    update public.cards set folder_id = v_folder.parent_id where folder_id = p_folder_id;
  else
    update public.cards set folder_id = null where folder_id = p_folder_id;
  end if;

  update public.folders set parent_id = v_folder.parent_id where parent_id = p_folder_id;
  update public.folders set deleted_at = now() where id = p_folder_id;

  insert into public.deleted_items (campaign_id, entity_type, entity_id, label, payload, deleted_by)
  values (v_folder.campaign_id, 'folder', p_folder_id, v_folder.name, to_jsonb(v_folder), auth.uid());
end;
$$;

create or replace function public.start_session(p_session_id uuid)
returns setof public.sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.sessions;
begin
  select * into v_session from public.sessions where id = p_session_id;
  if not found then
    raise exception '세션을 찾을 수 없습니다.' using errcode = 'P0002';
  end if;
  if not public.is_campaign_dm(v_session.campaign_id) then
    raise exception '세션을 시작할 권한이 없습니다.' using errcode = '42501';
  end if;

  update public.sessions
     set status = 'live', started_at = coalesce(started_at, now())
   where id = p_session_id;

  perform public.write_session_log(p_session_id, 'session.start', '세션이 시작되었습니다.', 'all');
  perform public.notify_users(
    public.campaign_player_ids(v_session.campaign_id), v_session.campaign_id, p_session_id,
    'session_started', '세션 시작', '"' || v_session.title || '" 세션이 시작되었습니다.'
  );

  return query select * from public.sessions where id = p_session_id;
end;
$$;

/**
 * 세션 종료.
 * 일시 공개된 카드를 이전 상태로 되돌리고 진행 중이던 전투와 타이머를 정리한다.
 */
create or replace function public.end_session(p_session_id uuid)
returns setof public.sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.sessions;
begin
  select * into v_session from public.sessions where id = p_session_id;
  if not found then
    raise exception '세션을 찾을 수 없습니다.' using errcode = 'P0002';
  end if;
  if not public.is_campaign_dm(v_session.campaign_id) then
    raise exception '세션을 종료할 권한이 없습니다.' using errcode = '42501';
  end if;

  update public.sessions set status = 'ended', ended_at = now() where id = p_session_id;

  update public.cards
     set reveal_scope        = coalesce(previous_scope, 'hidden'),
         previous_scope      = null,
         is_temporary_reveal = false,
         reveal_targets      = '{}'::uuid[]
   where campaign_id = v_session.campaign_id and is_temporary_reveal;

  update public.encounters set status = 'ended', active_combatant_id = null
   where session_id = p_session_id and status <> 'ended';

  update public.timers set state = 'finished' where session_id = p_session_id and state = 'running';

  perform public.write_session_log(p_session_id, 'session.end', '세션이 종료되었습니다.', 'all');
  return query select * from public.sessions where id = p_session_id;
end;
$$;

/**
 * HP 변경을 서버에서 계산한다.
 * 임시 HP를 먼저 차감하고, 현재 HP는 0 미만이 되지 않으며 최대 HP를 넘지 않는다.
 */
create or replace function public.apply_hp_changes(p_encounter_id uuid, p_changes jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign_id uuid := public.encounter_campaign_id(p_encounter_id);
  v_session_id  uuid;
  v_change      jsonb;
  v_combatant   public.encounter_combatants;
  v_amount      integer;
  v_kind        text;
  v_absorbed    integer;
  v_new_hp      integer;
  v_new_temp    integer;
  v_new_max     integer;
  v_message     text;
begin
  if v_campaign_id is null then
    raise exception '전투를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  select session_id into v_session_id from public.encounters where id = p_encounter_id;

  for v_change in select * from jsonb_array_elements(p_changes) loop
    select * into v_combatant from public.encounter_combatants
    where id = (v_change ->> 'combatant_id')::uuid and encounter_id = p_encounter_id;
    continue when not found;

    -- 자기 캐릭터의 HP는 본인도 조작할 수 있다.
    if not public.can_manage_combat(v_campaign_id)
       and not (v_combatant.character_id is not null and public.owns_character(v_combatant.character_id)) then
      raise exception 'HP를 변경할 권한이 없습니다.' using errcode = '42501';
    end if;

    v_amount   := greatest(0, coalesce((v_change ->> 'amount')::integer, 0));
    v_kind     := coalesce(v_change ->> 'kind', 'damage');
    v_new_hp   := v_combatant.hp;
    v_new_temp := v_combatant.temp_hp;
    v_new_max  := v_combatant.max_hp;

    if v_kind = 'damage' then
      v_absorbed := least(v_new_temp, v_amount);
      v_new_temp := v_new_temp - v_absorbed;
      v_new_hp   := greatest(0, v_new_hp - (v_amount - v_absorbed));
      v_message  := v_combatant.name || '이(가) ' || v_amount || ' 피해를 입었습니다.';
    elsif v_kind = 'heal' then
      v_new_hp  := least(v_new_max, v_new_hp + v_amount);
      v_message := v_combatant.name || '이(가) ' || v_amount || ' 회복했습니다.';
    elsif v_kind = 'temp' then
      v_new_temp := greatest(v_new_temp, v_amount);
      v_message  := v_combatant.name || '에게 임시 HP ' || v_amount || '을(를) 부여했습니다.';
    elsif v_kind = 'set_hp' then
      v_new_hp  := least(v_new_max, v_amount);
      v_message := v_combatant.name || '의 HP를 ' || v_new_hp || '(으)로 설정했습니다.';
    elsif v_kind = 'set_max_hp' then
      v_new_max := v_amount;
      v_new_hp  := least(v_new_hp, v_new_max);
      v_message := v_combatant.name || '의 최대 HP를 ' || v_new_max || '(으)로 설정했습니다.';
    else
      raise exception '알 수 없는 HP 변경 종류입니다.' using errcode = 'P0001';
    end if;

    update public.encounter_combatants
       set hp = v_new_hp,
           temp_hp = v_new_temp,
           max_hp = v_new_max,
           is_defeated = (v_new_hp = 0),
           is_concentrating = case when v_new_hp = 0 then false else is_concentrating end
     where id = v_combatant.id;

    -- 캐릭터 시트와 동기화
    if v_combatant.character_id is not null then
      update public.player_characters
         set hp = v_new_hp, temp_hp = v_new_temp, max_hp = v_new_max
       where id = v_combatant.character_id;
    end if;

    perform public.write_session_log(
      v_session_id, 'combat.hp', v_message, 'all', 'combatant', v_combatant.id, v_combatant.name,
      jsonb_build_object('hp', v_combatant.hp, 'temp_hp', v_combatant.temp_hp, 'max_hp', v_combatant.max_hp),
      jsonb_build_object('hp', v_new_hp, 'temp_hp', v_new_temp, 'max_hp', v_new_max)
    );

    if v_new_hp = 0 and v_combatant.character_id is not null then
      perform public.notify_users(
        array[(select user_id from public.player_characters where id = v_combatant.character_id)],
        v_campaign_id, v_session_id, 'hp_zero', 'HP 0', v_combatant.name || '의 HP가 0이 되었습니다.'
      );
    end if;
  end loop;
end;
$$;

create or replace function public.apply_rest(p_character_id uuid, p_kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign_id uuid := public.character_campaign_id(p_character_id);
begin
  if not public.owns_character(p_character_id) and not public.is_campaign_dm(v_campaign_id) then
    raise exception '휴식을 적용할 권한이 없습니다.' using errcode = '42501';
  end if;

  update public.character_resources
     set current = max
   where character_id = p_character_id
     and (recharge = 'short' or (p_kind = 'long' and recharge = 'long'));

  if p_kind = 'long' then
    update public.player_characters
       set hp = max_hp, temp_hp = 0, death_saves = '{"successes":0,"failures":0}'::jsonb
     where id = p_character_id;
  end if;
end;
$$;

/** 중요한 변경(HP, 공개 범위)을 되돌린다. */
create or replace function public.undo_session_log(p_log_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log public.session_logs;
begin
  select * into v_log from public.session_logs where id = p_log_id;
  if not found then
    raise exception '로그를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;
  if not public.can_manage_combat(v_log.campaign_id) then
    raise exception '변경을 취소할 권한이 없습니다.' using errcode = '42501';
  end if;
  if v_log.undone then
    raise exception '이미 취소된 변경입니다.' using errcode = 'P0001';
  end if;

  if v_log.target_type = 'combatant' and v_log.before is not null then
    update public.encounter_combatants
       set hp      = coalesce((v_log.before ->> 'hp')::integer, hp),
           temp_hp = coalesce((v_log.before ->> 'temp_hp')::integer, temp_hp),
           max_hp  = coalesce((v_log.before ->> 'max_hp')::integer, max_hp),
           is_defeated = coalesce((v_log.before ->> 'hp')::integer, hp) = 0
     where id = v_log.target_id;
  elsif v_log.target_type = 'card' and v_log.before is not null then
    update public.cards
       set reveal_scope = coalesce(v_log.before ->> 'reveal_scope', reveal_scope)
     where id = v_log.target_id;
  end if;

  update public.session_logs set undone = true where id = p_log_id;
end;
$$;

create or replace function public.duplicate_campaign(p_campaign_id uuid, p_name text)
returns setof public.campaigns
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_id uuid;
  v_folder record;
  v_card   record;
begin
  if not public.has_campaign_permission(p_campaign_id, 'manage_campaign') then
    raise exception '캠페인을 복제할 권한이 없습니다.' using errcode = '42501';
  end if;

  insert into public.campaigns (owner_id, name, description, system, cover_url, theme_color, status,
                                join_policy, max_players, is_mature, party_visibility, allow_player_notes)
  select auth.uid(), p_name, description, system, cover_url, theme_color, 'planning',
         join_policy, max_players, is_mature, party_visibility, allow_player_notes
  from public.campaigns where id = p_campaign_id
  returning id into v_new_id;

  -- 폴더 (부모 관계는 두 단계로 복원한다)
  for v_folder in select * from public.folders where campaign_id = p_campaign_id and deleted_at is null loop
    insert into public.folders (campaign_id, name, color, icon, sort_order)
    values (v_new_id, v_folder.name, v_folder.color, v_folder.icon, v_folder.sort_order);
  end loop;

  insert into public.tags (campaign_id, name, color)
  select v_new_id, name, color from public.tags where campaign_id = p_campaign_id
  on conflict do nothing;

  for v_card in select * from public.cards where campaign_id = p_campaign_id and deleted_at is null loop
    insert into public.cards (campaign_id, type, name, summary, body, image_url, dm_notes, created_by, sort_order)
    values (v_new_id, v_card.type, v_card.name, v_card.summary, v_card.body, v_card.image_url,
            v_card.dm_notes, auth.uid(), v_card.sort_order);
  end loop;

  perform public.write_audit_log(v_new_id, 'campaign.duplicate', 'campaign', p_campaign_id);
  return query select * from public.campaigns where id = v_new_id;
end;
$$;

/** 텍스트를 uuid로 안전하게 변환한다. 형식이 맞지 않으면 null. */
create or replace function public.safe_uuid(p_value text)
returns uuid
language plpgsql
immutable
as $$
begin
  return p_value::uuid;
exception when others then
  return null;
end;
$$;

/** jsonb 배열을 text[]로 바꾼다. 배열이 아니면 null. */
create or replace function public.jsonb_to_text_array(p_value jsonb)
returns text[]
language sql
immutable
as $$
  select case
    when jsonb_typeof(p_value) = 'array'
      then (select coalesce(array_agg(value), '{}') from jsonb_array_elements_text(p_value) as value)
    else null
  end;
$$;

/**
 * 백업 JSON에서 폴더/태그/카드(스탯·섹션·태그 연결 포함)를 가져온다.
 * - 가져온 카드는 항상 비공개(hidden)로 저장한다. 공개 상태는 절대 함께 가져오지 않는다.
 * - 폴더와 태그는 같은 이름이 있으면 재사용한다(반복 가져오기로 중복이 쌓이지 않게).
 * - 클라이언트 어댑터(src/data/local/repo.ts)의 importData와 같은 결과를 만든다.
 */
create or replace function public.import_campaign_data(p_campaign_id uuid, p_payload jsonb, p_strategy text)
returns setof public.campaigns
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card       jsonb;
  v_folder     jsonb;
  v_tag        jsonb;
  v_section    jsonb;
  v_stats      jsonb;
  v_existing   uuid;
  v_new_id     uuid;
  v_folder_id  uuid;
  v_tag_id     uuid;
  v_old_id     uuid;
  v_max_hp     integer;
  v_hp         integer;
  v_count      integer := 0;
begin
  if not public.can_edit_assets(p_campaign_id) then
    raise exception '자료를 가져올 권한이 없습니다.' using errcode = '42501';
  end if;
  if p_payload is null or jsonb_typeof(p_payload -> 'cards') <> 'array' then
    raise exception '가져올 수 없는 파일 형식입니다.' using errcode = 'P0001';
  end if;
  if p_strategy not in ('skip', 'overwrite', 'duplicate') then
    raise exception '알 수 없는 가져오기 방식입니다.' using errcode = 'P0001';
  end if;

  create temporary table if not exists tmp_import_map (
    kind   text not null,
    old_id uuid not null,
    new_id uuid not null,
    primary key (kind, old_id)
  ) on commit drop;
  delete from tmp_import_map;

  -- ── 폴더 (1단계: 생성, 2단계: 부모 연결) ──────────────────────────
  for v_folder in select * from jsonb_array_elements(coalesce(p_payload -> 'folders', '[]'::jsonb)) loop
    v_old_id := public.safe_uuid(v_folder ->> 'id');
    if v_old_id is null then
      continue;
    end if;

    select id into v_folder_id from public.folders
    where campaign_id = p_campaign_id
      and name = coalesce(v_folder ->> 'name', '새 폴더')
      and deleted_at is null
    limit 1;

    if v_folder_id is null then
      insert into public.folders (campaign_id, parent_id, name, color, icon, sort_order)
      values (
        p_campaign_id,
        null,
        left(coalesce(nullif(v_folder ->> 'name', ''), '새 폴더'), 80),
        v_folder ->> 'color',
        v_folder ->> 'icon',
        coalesce((v_folder ->> 'sort_order')::integer, 0)
      )
      returning id into v_folder_id;
    end if;

    insert into tmp_import_map (kind, old_id, new_id)
    values ('folder', v_old_id, v_folder_id)
    on conflict do nothing;
  end loop;

  for v_folder in select * from jsonb_array_elements(coalesce(p_payload -> 'folders', '[]'::jsonb)) loop
    update public.folders f
       set parent_id = parent_map.new_id
      from tmp_import_map self, tmp_import_map parent_map
     where self.kind = 'folder'   and self.old_id   = public.safe_uuid(v_folder ->> 'id')
       and parent_map.kind = 'folder' and parent_map.old_id = public.safe_uuid(v_folder ->> 'parent_id')
       and f.id = self.new_id
       and f.id <> parent_map.new_id;
  end loop;

  -- ── 태그 ──────────────────────────────────────────────────────────
  for v_tag in select * from jsonb_array_elements(coalesce(p_payload -> 'tags', '[]'::jsonb)) loop
    v_old_id := public.safe_uuid(v_tag ->> 'id');
    if v_old_id is null or coalesce(v_tag ->> 'name', '') = '' then
      continue;
    end if;

    insert into public.tags (campaign_id, name, color)
    values (p_campaign_id, v_tag ->> 'name', coalesce(v_tag ->> 'color', '#6d3fd4'))
    on conflict (campaign_id, name) do nothing;

    select id into v_tag_id from public.tags
    where campaign_id = p_campaign_id and name = (v_tag ->> 'name');

    if v_tag_id is not null then
      insert into tmp_import_map (kind, old_id, new_id) values ('tag', v_old_id, v_tag_id)
      on conflict do nothing;
    end if;
  end loop;

  -- ── 카드 ──────────────────────────────────────────────────────────
  for v_card in select * from jsonb_array_elements(p_payload -> 'cards') loop
    if coalesce(v_card ->> 'name', '') = '' then
      continue;
    end if;

    select id into v_existing from public.cards
    where campaign_id = p_campaign_id and name = (v_card ->> 'name') and deleted_at is null
    limit 1;

    if v_existing is not null and p_strategy = 'skip' then
      continue;
    end if;

    select m.new_id into v_folder_id from tmp_import_map m
    where m.kind = 'folder' and m.old_id = public.safe_uuid(v_card ->> 'folder_id');

    if v_existing is not null and p_strategy = 'overwrite' then
      update public.cards
         set summary   = coalesce(v_card ->> 'summary', ''),
             body      = v_card -> 'body',
             dm_notes  = coalesce(v_card ->> 'dm_notes', ''),
             type      = coalesce(v_card ->> 'type', 'text'),
             image_url = v_card ->> 'image_url',
             folder_id = coalesce(v_folder_id, folder_id),
             version   = version + 1
       where id = v_existing;
      v_new_id := v_existing;
    else
      insert into public.cards (campaign_id, folder_id, type, name, summary, body, image_url, dm_notes, created_by)
      values (
        p_campaign_id,
        v_folder_id,
        coalesce(v_card ->> 'type', 'text'),
        case when v_existing is not null then (v_card ->> 'name') || ' (사본)' else (v_card ->> 'name') end,
        coalesce(v_card ->> 'summary', ''),
        v_card -> 'body',
        v_card ->> 'image_url',
        coalesce(v_card ->> 'dm_notes', ''),
        auth.uid()
      )
      returning id into v_new_id;
    end if;

    -- 몬스터 스탯
    v_stats := v_card -> 'stats';
    if jsonb_typeof(v_stats) = 'object' then
      -- hp <= max_hp 제약을 지키도록 먼저 정리한다.
      v_max_hp := greatest(0, coalesce((v_stats ->> 'max_hp')::integer, (v_stats ->> 'hp')::integer, 11));
      v_hp     := least(v_max_hp, greatest(0, coalesce((v_stats ->> 'hp')::integer, v_max_hp)));

      insert into public.monster_stats (
        card_id, size, type, alignment, cr, proficiency_bonus, xp,
        ac, ac_note, hp, max_hp, temp_hp, hit_dice, speeds, abilities, saves, skills,
        vulnerabilities, resistances, immunities, condition_immunities,
        senses, passive_perception, languages, spellcasting_ability
      )
      values (
        v_new_id,
        coalesce(v_stats ->> 'size', '중형'),
        coalesce(v_stats ->> 'type', '괴물류'),
        coalesce(v_stats ->> 'alignment', '중립'),
        coalesce(v_stats ->> 'cr', '1'),
        coalesce((v_stats ->> 'proficiency_bonus')::integer, 2),
        coalesce((v_stats ->> 'xp')::integer, 0),
        least(40, greatest(0, coalesce((v_stats ->> 'ac')::integer, 12))),
        coalesce(v_stats ->> 'ac_note', ''),
        v_hp,
        v_max_hp,
        0,
        coalesce(v_stats ->> 'hit_dice', ''),
        coalesce(v_stats -> 'speeds', '{"walk":30,"fly":0,"swim":0,"climb":0,"burrow":0}'::jsonb),
        coalesce(v_stats -> 'abilities', '{"str":10,"dex":10,"con":10,"int":10,"wis":10,"cha":10}'::jsonb),
        coalesce(v_stats -> 'saves', '{}'::jsonb),
        coalesce(v_stats -> 'skills', '{}'::jsonb),
        coalesce(public.jsonb_to_text_array(v_stats -> 'vulnerabilities'), '{}'),
        coalesce(public.jsonb_to_text_array(v_stats -> 'resistances'), '{}'),
        coalesce(public.jsonb_to_text_array(v_stats -> 'immunities'), '{}'),
        coalesce(public.jsonb_to_text_array(v_stats -> 'condition_immunities'), '{}'),
        coalesce(v_stats ->> 'senses', ''),
        coalesce((v_stats ->> 'passive_perception')::integer, 10),
        coalesce(v_stats ->> 'languages', ''),
        v_stats ->> 'spellcasting_ability'
      )
      on conflict (card_id) do update set
        size = excluded.size, type = excluded.type, alignment = excluded.alignment,
        cr = excluded.cr, proficiency_bonus = excluded.proficiency_bonus, xp = excluded.xp,
        ac = excluded.ac, ac_note = excluded.ac_note,
        hp = excluded.hp, max_hp = excluded.max_hp, temp_hp = 0, hit_dice = excluded.hit_dice,
        speeds = excluded.speeds, abilities = excluded.abilities,
        saves = excluded.saves, skills = excluded.skills,
        vulnerabilities = excluded.vulnerabilities, resistances = excluded.resistances,
        immunities = excluded.immunities, condition_immunities = excluded.condition_immunities,
        senses = excluded.senses, passive_perception = excluded.passive_perception,
        languages = excluded.languages, spellcasting_ability = excluded.spellcasting_ability;
    end if;

    -- 섹션 (특징/행동 등)은 통째로 교체한다.
    if jsonb_typeof(v_card -> 'sections') = 'array' then
      delete from public.card_sections where card_id = v_new_id;
      for v_section in select * from jsonb_array_elements(v_card -> 'sections') loop
        insert into public.card_sections (card_id, kind, name, description, sort_order)
        values (
          v_new_id,
          case
            when (v_section ->> 'kind') in ('trait','action','bonus','reaction','legendary','mythic','lair','regional','spell')
              then v_section ->> 'kind'
            else 'action'
          end,
          coalesce(v_section ->> 'name', ''),
          coalesce(v_section ->> 'description', ''),
          coalesce((v_section ->> 'sort_order')::integer, 0)
        );
      end loop;
    end if;

    -- 태그 연결
    if jsonb_typeof(v_card -> 'tag_ids') = 'array' then
      insert into public.card_tags (card_id, tag_id)
      select v_new_id, m.new_id
      from jsonb_array_elements_text(v_card -> 'tag_ids') t
      join tmp_import_map m on m.kind = 'tag' and m.old_id = public.safe_uuid(t)
      on conflict do nothing;
    end if;

    v_count := v_count + 1;
  end loop;

  perform public.write_audit_log(p_campaign_id, 'campaign.import', 'campaign', p_campaign_id,
                                 jsonb_build_object('cards', v_count, 'strategy', p_strategy));
  return query select * from public.campaigns where id = p_campaign_id;
end;
$$;

/** 30일이 지난 휴지통 항목을 정리한다 (pg_cron 등에서 주기 실행). */
create or replace function public.purge_expired_trash()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  delete from public.cards c
  using public.deleted_items d
  where d.entity_type = 'card' and d.entity_id = c.id and d.purge_after < now();

  delete from public.deleted_items where purge_after < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
