-- =====================================================================
-- 세션 삭제
--
-- 세션을 지우면 그 안의 전투·로그·주사위 기록이 함께 사라진다.
-- 되돌리기 어려운 작업이라 캠페인 소유자만 할 수 있게 하고, 휴지통에 남겨 복구할 수 있게 한다.
--
-- 소프트 삭제를 일반 UPDATE로 하면 sessions_update 정책(manage_session 권한)이 적용돼
-- 공동 DM도 지울 수 있게 된다. 데모 어댑터는 소유자만 허용하고 있어 규칙이 어긋난다.
-- SECURITY DEFINER 함수로 한쪽에 맞춘다.
-- =====================================================================

create or replace function public.soft_delete_session(p_session_id uuid)
returns void
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
  if v_session.deleted_at is not null then
    return; -- 이미 지워진 세션. 다시 호출해도 문제가 없어야 한다.
  end if;
  if not public.is_campaign_owner(v_session.campaign_id) then
    raise exception '세션을 삭제할 권한이 없습니다.' using errcode = '42501';
  end if;

  -- 진행 중인 세션을 지우면 일시 공개된 자료가 공개된 채로 남는다. 먼저 정리한다.
  update public.cards
     set reveal_scope = coalesce(previous_scope, 'hidden'),
         is_temporary_reveal = false,
         previous_scope = null
   where campaign_id = v_session.campaign_id
     and is_temporary_reveal = true;

  update public.sessions
     set deleted_at = now(),
         status = case when status = 'live' then 'cancelled' else status end
   where id = p_session_id;

  insert into public.deleted_items (campaign_id, entity_type, entity_id, label, payload, deleted_by)
  values (
    v_session.campaign_id,
    'session',
    p_session_id,
    coalesce(nullif(v_session.title, ''), '제목 없는 세션'),
    to_jsonb(v_session),
    auth.uid()
  );

  perform public.write_audit_log(
    v_session.campaign_id, 'session.delete', 'session', p_session_id,
    jsonb_build_object('title', v_session.title, 'session_number', v_session.session_number)
  );
end;
$$;

-- 휴지통 복구가 세션을 다루지 못하고 있었다. 지운 세션을 되살릴 수 없으면
-- 휴지통에 넣는 의미가 없으므로 함께 고친다.
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
  elsif v_item.entity_type = 'session' then
    -- 진행 중이던 세션은 취소 상태로 되살린다. 시간이 지난 뒤 되살리는 것이라
    -- 다시 '진행 중'으로 두면 실제 상황과 어긋난다.
    update public.sessions set deleted_at = null where id = v_item.entity_id;
  end if;

  delete from public.deleted_items where id = p_item_id;
  perform public.write_audit_log(v_item.campaign_id, 'trash.restore', v_item.entity_type, v_item.entity_id);
end;
$$;
