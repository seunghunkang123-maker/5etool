-- =====================================================================
-- RLS 검증 스크립트
--
-- 실행:
--   psql -v ON_ERROR_STOP=1 -f supabase/test/bootstrap_local.sql
--   psql -v ON_ERROR_STOP=1 -f supabase/migrations/000{1..6}_*.sql
--   psql -v ON_ERROR_STOP=1 -f supabase/test/rls_checks.sql
--
-- 각 검사는 실패하면 예외를 던진다. 끝까지 실행되면 모든 정책이 의도대로 동작한 것이다.
-- =====================================================================

\set QUIET on
set client_min_messages = warning;

-- ── 준비 ────────────────────────────────────────────────────────────
do $$
declare
  v_dm     uuid;
  v_player uuid;
begin
  delete from auth.users;

  insert into auth.users (email, raw_user_meta_data)
  values ('dm@test.local', '{"display_name":"던전 마스터"}'::jsonb) returning id into v_dm;
  insert into auth.users (email, raw_user_meta_data)
  values ('player@test.local', '{"display_name":"플레이어"}'::jsonb) returning id into v_player;

  perform set_config('test.dm', v_dm::text, false);
  perform set_config('test.player', v_player::text, false);

  if not exists (select 1 from public.profiles where id = v_dm) then
    raise exception '검사 실패: 회원가입 트리거가 프로필을 만들지 않았습니다.';
  end if;
end
$$;

-- ── DM: 캠페인·카드·세션 생성 ───────────────────────────────────────
set role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.dm'), false);

do $$
declare
  v_campaign uuid;
  v_card     uuid;
  v_session  uuid;
begin
  insert into public.campaigns (owner_id, name)
  values (auth.uid(), '검증 캠페인') returning id into v_campaign;
  perform set_config('test.campaign', v_campaign::text, false);

  if (select role from public.campaign_members where campaign_id = v_campaign and user_id = auth.uid()) <> 'owner' then
    raise exception '검사 실패: 캠페인 생성자가 소유자로 등록되지 않았습니다.';
  end if;
  if (select join_code from public.campaigns where id = v_campaign) is null then
    raise exception '검사 실패: 참여 코드가 생성되지 않았습니다.';
  end if;

  insert into public.cards (campaign_id, name, type, summary, dm_notes)
  values (v_campaign, '비밀 몬스터', 'monster', '숨겨진 요약', '약점은 화염이다')
  returning id into v_card;
  perform set_config('test.card', v_card::text, false);

  if (select reveal_scope from public.cards where id = v_card) <> 'hidden' then
    raise exception '검사 실패: 새 카드의 기본 공개 상태가 비공개가 아닙니다.';
  end if;

  insert into public.monster_stats (card_id, hp, max_hp, ac) values (v_card, 30, 40, 17);

  insert into public.sessions (campaign_id, title) values (v_campaign, '1회차') returning id into v_session;
  perform set_config('test.session', v_session::text, false);
end
$$;

-- ── 플레이어: 참여 및 접근 제한 확인 ────────────────────────────────
select set_config('request.jwt.claim.sub', current_setting('test.player'), false);

do $$
declare
  v_code text;
  v_rows integer;
begin
  reset role;
  select join_code into v_code from public.campaigns where id = current_setting('test.campaign')::uuid;
  set role authenticated;
  perform set_config('request.jwt.claim.sub', current_setting('test.player'), false);

  perform public.join_campaign_by_code(v_code);

  if not public.is_campaign_member(current_setting('test.campaign')::uuid) then
    raise exception '검사 실패: 참여 코드로 참여하지 못했습니다.';
  end if;

  -- 1) 플레이어는 cards 테이블을 직접 읽을 수 없다.
  select count(*) into v_rows from public.cards where campaign_id = current_setting('test.campaign')::uuid;
  if v_rows <> 0 then
    raise exception '검사 실패: 플레이어가 cards 테이블에서 %개 행을 읽었습니다.', v_rows;
  end if;

  -- 2) 비공개 카드는 공개 뷰에도 나타나지 않는다.
  select count(*) into v_rows from public.player_visible_cards where campaign_id = current_setting('test.campaign')::uuid;
  if v_rows <> 0 then
    raise exception '검사 실패: 비공개 카드가 공개 뷰에 노출되었습니다.';
  end if;

  -- 3) 몬스터 능력치도 읽을 수 없다.
  select count(*) into v_rows from public.monster_stats;
  if v_rows <> 0 then
    raise exception '검사 실패: 플레이어가 몬스터 능력치를 읽었습니다.';
  end if;

  -- 4) 카드 수정 시도는 아무 행에도 영향을 주지 못한다.
  update public.cards set name = '해킹됨' where id = current_setting('test.card')::uuid;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception '검사 실패: 플레이어가 카드를 수정했습니다.';
  end if;

  -- 5) 공개 범위 변경 RPC는 권한 오류를 낸다.
  begin
    perform public.set_card_reveal(current_setting('test.card')::uuid, 'full');
    raise exception '검사 실패: 플레이어가 공개 범위를 변경했습니다.';
  exception
    when insufficient_privilege then null;
  end;

  -- 6) 세션을 시작할 수 없다.
  begin
    perform public.start_session(current_setting('test.session')::uuid);
    raise exception '검사 실패: 플레이어가 세션을 시작했습니다.';
  exception
    when insufficient_privilege then null;
  end;
end
$$;

-- ── DM이 이름만 공개 → 플레이어 노출 필드 확인 ──────────────────────
select set_config('request.jwt.claim.sub', current_setting('test.dm'), false);
do $$
begin
  perform public.set_card_reveal(current_setting('test.card')::uuid, 'name_only', null, '{}'::uuid[], false,
                                 current_setting('test.session')::uuid);
end
$$;

select set_config('request.jwt.claim.sub', current_setting('test.player'), false);
do $$
declare
  v_row public.player_visible_cards;
begin
  select * into v_row from public.player_visible_cards where id = current_setting('test.card')::uuid;
  if not found then
    raise exception '검사 실패: 이름만 공개한 카드가 플레이어에게 보이지 않습니다.';
  end if;
  if v_row.name <> '비밀 몬스터' then
    raise exception '검사 실패: 이름이 공개되지 않았습니다.';
  end if;
  if v_row.summary is not null then
    raise exception '검사 실패: 이름만 공개인데 요약이 노출되었습니다.';
  end if;
  if v_row.body is not null or v_row.image_url is not null then
    raise exception '검사 실패: 이름만 공개인데 본문/이미지가 노출되었습니다.';
  end if;
  if v_row.stats is not null then
    raise exception '검사 실패: 이름만 공개인데 능력치가 노출되었습니다.';
  end if;
  if v_row::text like '%약점은 화염%' then
    raise exception '검사 실패: DM 전용 메모가 노출되었습니다.';
  end if;
end
$$;

-- ── 일부 공개: 선택한 필드만 노출 ───────────────────────────────────
select set_config('request.jwt.claim.sub', current_setting('test.dm'), false);
do $$
begin
  perform public.set_card_reveal(current_setting('test.card')::uuid, 'partial',
                                 array['name', 'hp_current']::text[], '{}'::uuid[], false, null);
end
$$;

select set_config('request.jwt.claim.sub', current_setting('test.player'), false);
do $$
declare
  v_row public.player_visible_cards;
begin
  select * into v_row from public.player_visible_cards where id = current_setting('test.card')::uuid;
  if (v_row.stats ->> 'hp')::int <> 30 then
    raise exception '검사 실패: 공개하기로 한 현재 HP가 노출되지 않았습니다.';
  end if;
  if v_row.stats ? 'max_hp' then
    raise exception '검사 실패: 공개하지 않은 최대 HP가 노출되었습니다.';
  end if;
  if v_row.stats ? 'ac' then
    raise exception '검사 실패: 공개하지 않은 방어도가 노출되었습니다.';
  end if;
  if v_row.hp_tier <> 'bruised' then
    raise exception '검사 실패: 부상 단계 계산이 잘못되었습니다. (%)', v_row.hp_tier;
  end if;
end
$$;

-- ── 대상 지정 공개: 지정되지 않은 플레이어는 볼 수 없다 ─────────────
select set_config('request.jwt.claim.sub', current_setting('test.dm'), false);
do $$
begin
  -- 대상이 DM 자신뿐이므로 플레이어에게는 보이지 않아야 한다.
  perform public.set_card_reveal(current_setting('test.card')::uuid, 'full', null,
                                 array[current_setting('test.dm')::uuid], false, null);
end
$$;

select set_config('request.jwt.claim.sub', current_setting('test.player'), false);
do $$
declare
  v_rows integer;
begin
  select count(*) into v_rows from public.player_visible_cards where id = current_setting('test.card')::uuid;
  if v_rows <> 0 then
    raise exception '검사 실패: 대상 지정 공개에서 지정되지 않은 플레이어에게 카드가 노출되었습니다.';
  end if;
end
$$;

-- ── 전투: 권한과 HP 계산 ────────────────────────────────────────────
select set_config('request.jwt.claim.sub', current_setting('test.dm'), false);
do $$
declare
  v_encounter uuid;
  v_combatant uuid;
  v_hp        integer;
  v_temp      integer;
begin
  insert into public.encounters (session_id, campaign_id, name)
  values (current_setting('test.session')::uuid, current_setting('test.campaign')::uuid, '검증 전투')
  returning id into v_encounter;
  perform set_config('test.encounter', v_encounter::text, false);

  insert into public.encounter_combatants (encounter_id, name, hp, max_hp, ac, temp_hp)
  values (v_encounter, '고블린', 12, 12, 13, 5)
  returning id into v_combatant;
  perform set_config('test.combatant', v_combatant::text, false);

  -- 임시 HP 5 + 현재 HP 12에 8 피해 → 임시 0, 현재 9
  perform public.apply_hp_changes(v_encounter, jsonb_build_array(
    jsonb_build_object('combatant_id', v_combatant, 'amount', 8, 'kind', 'damage')
  ));

  select hp, temp_hp into v_hp, v_temp from public.encounter_combatants where id = v_combatant;
  if v_hp <> 9 or v_temp <> 0 then
    raise exception '검사 실패: HP 계산이 잘못되었습니다. hp=%, temp=%', v_hp, v_temp;
  end if;

  -- 최대치를 넘는 회복은 최대 HP에서 멈춘다.
  perform public.apply_hp_changes(v_encounter, jsonb_build_array(
    jsonb_build_object('combatant_id', v_combatant, 'amount', 999, 'kind', 'heal')
  ));
  select hp into v_hp from public.encounter_combatants where id = v_combatant;
  if v_hp <> 12 then
    raise exception '검사 실패: 회복이 최대 HP를 넘었습니다. hp=%', v_hp;
  end if;

  -- 0 미만으로 내려가지 않는다.
  perform public.apply_hp_changes(v_encounter, jsonb_build_array(
    jsonb_build_object('combatant_id', v_combatant, 'amount', 500, 'kind', 'damage')
  ));
  select hp into v_hp from public.encounter_combatants where id = v_combatant;
  if v_hp <> 0 then
    raise exception '검사 실패: HP가 0 미만으로 내려갔습니다. hp=%', v_hp;
  end if;
  if not (select is_defeated from public.encounter_combatants where id = v_combatant) then
    raise exception '검사 실패: HP 0인데 전투 불능으로 표시되지 않았습니다.';
  end if;
end
$$;

-- 앱이 실제로 보내는 열 목록 그대로 여러 명을 한 번에 넣을 수 있어야 한다.
-- (한 열이라도 없거나 제약에 걸리면 "참가자 추가"가 통째로 실패한다.)
do $$
declare
  v_rows integer;
begin
  insert into public.encounter_combatants
    (encounter_id, source_type, source_card_id, character_id, name, image_url,
     initiative, dex_score, dex_mod, hp, max_hp, ac, is_hidden, hide_hp_numbers, dm_notes, sort_order)
  select
    current_setting('test.encounter')::uuid, 'custom', null, null, '성난 군중 ' || i, null,
    null, 14, 2, 24, 24, 11, false, true, '', i
  from generate_series(1, 3) as i;

  select count(*) into v_rows
  from public.encounter_combatants
  where encounter_id = current_setting('test.encounter')::uuid and name like '성난 군중%';
  if v_rows <> 3 then
    raise exception '검사 실패: 한 번에 여러 참가자를 넣지 못했습니다. rows=%', v_rows;
  end if;

  -- 현재 HP가 최대 HP보다 크면 거부된다. 클라이언트가 미리 맞춰 보내야 하는 이유다.
  begin
    insert into public.encounter_combatants (encounter_id, name, hp, max_hp, ac)
    values (current_setting('test.encounter')::uuid, '잘못된 HP', 40, 12, 10);
    raise exception '검사 실패: 현재 HP가 최대 HP보다 큰 참가자가 저장되었습니다.';
  exception
    when check_violation then null;
  end;

  -- 뒤에 오는 검사가 참가자 수를 세므로 여기서 넣은 것은 되돌린다.
  delete from public.encounter_combatants
  where encounter_id = current_setting('test.encounter')::uuid and name like '성난 군중%';
end
$$;

-- 같은 상태를 다시 적용하면 스택이 쌓인다(0007 마이그레이션).
do $$
declare
  v_condition uuid;
  v_stacks    integer;
begin
  insert into public.combatant_conditions (combatant_id, condition_key, custom_name, duration_mode, stacks)
  values (current_setting('test.combatant')::uuid, 'bleed', '출혈', 'manual', 1)
  returning id into v_condition;

  update public.combatant_conditions set stacks = stacks + 2 where id = v_condition;
  select stacks into v_stacks from public.combatant_conditions where id = v_condition;
  if v_stacks <> 3 then
    raise exception '검사 실패: 상태 스택이 누적되지 않았습니다. stacks=%', v_stacks;
  end if;

  -- 스택은 0 미만이나 999 초과가 될 수 없다.
  begin
    update public.combatant_conditions set stacks = -1 where id = v_condition;
    raise exception '검사 실패: 음수 스택이 저장되었습니다.';
  exception
    when check_violation then null;
  end;

  delete from public.combatant_conditions where id = v_condition;
end
$$;

select set_config('request.jwt.claim.sub', current_setting('test.player'), false);
do $$
declare
  v_rows integer;
begin
  -- 플레이어는 전투 참가자를 추가하거나 HP를 바꿀 수 없다.
  begin
    insert into public.encounter_combatants (encounter_id, name, hp, max_hp, ac)
    values (current_setting('test.encounter')::uuid, '난입', 1, 1, 1);
    raise exception '검사 실패: 플레이어가 전투 참가자를 추가했습니다.';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.apply_hp_changes(current_setting('test.encounter')::uuid, jsonb_build_array(
      jsonb_build_object('combatant_id', current_setting('test.combatant')::uuid, 'amount', 5, 'kind', 'heal')
    ));
    raise exception '검사 실패: 플레이어가 몬스터 HP를 변경했습니다.';
  exception
    when insufficient_privilege then null;
  end;

  -- 전투 참가자 목록 자체는 볼 수 있어야 한다(이니셔티브 표시).
  select count(*) into v_rows from public.encounter_combatants
  where encounter_id = current_setting('test.encounter')::uuid;
  if v_rows <> 1 then
    raise exception '검사 실패: 플레이어가 전투 참가자 목록을 보지 못했습니다.';
  end if;
end
$$;

-- ── 주사위 공개 범위 ────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', current_setting('test.dm'), false);
do $$
begin
  insert into public.dice_rolls (session_id, campaign_id, user_id, expression, total, visibility)
  values (current_setting('test.session')::uuid, current_setting('test.campaign')::uuid, auth.uid(), '1d20', 15, 'dm_secret');
end
$$;

select set_config('request.jwt.claim.sub', current_setting('test.player'), false);
do $$
declare
  v_rows integer;
begin
  select count(*) into v_rows from public.dice_rolls;
  if v_rows <> 0 then
    raise exception '검사 실패: DM 비공개 굴림이 플레이어에게 노출되었습니다.';
  end if;
end
$$;

-- ── 세션 로그 가시성 ────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', current_setting('test.dm'), false);
do $$
begin
  perform public.write_session_log(current_setting('test.session')::uuid, 'dm.note', 'DM 전용 기록', 'dm');
  perform public.write_session_log(current_setting('test.session')::uuid, 'session.note', '공개 기록', 'all');
end
$$;

select set_config('request.jwt.claim.sub', current_setting('test.player'), false);
do $$
declare
  v_rows integer;
begin
  select count(*) into v_rows from public.session_logs where visibility = 'dm';
  if v_rows <> 0 then
    raise exception '검사 실패: DM 전용 로그가 플레이어에게 노출되었습니다.';
  end if;
  select count(*) into v_rows from public.session_logs where visibility = 'all';
  if v_rows = 0 then
    raise exception '검사 실패: 공개 로그가 플레이어에게 보이지 않습니다.';
  end if;
end
$$;

-- ── 감사 로그: 소유자만 열람 ────────────────────────────────────────
do $$
declare
  v_rows integer;
begin
  select count(*) into v_rows from public.audit_logs;
  if v_rows <> 0 then
    raise exception '검사 실패: 플레이어가 감사 로그를 열람했습니다.';
  end if;
end
$$;

select set_config('request.jwt.claim.sub', current_setting('test.dm'), false);
do $$
declare
  v_rows integer;
begin
  select count(*) into v_rows from public.audit_logs where campaign_id = current_setting('test.campaign')::uuid;
  if v_rows = 0 then
    raise exception '검사 실패: 감사 로그가 기록되지 않았습니다.';
  end if;
end
$$;

-- ── 세션 종료 시 일시 공개 복원 ─────────────────────────────────────
do $$
declare
  v_scope text;
begin
  perform public.set_card_reveal(current_setting('test.card')::uuid, 'hidden', null, '{}'::uuid[], false, null);
  perform public.set_card_reveal(current_setting('test.card')::uuid, 'full', null, '{}'::uuid[], true,
                                 current_setting('test.session')::uuid);

  select reveal_scope into v_scope from public.cards where id = current_setting('test.card')::uuid;
  if v_scope <> 'full' then
    raise exception '검사 실패: 일시 공개가 적용되지 않았습니다.';
  end if;

  perform public.end_session(current_setting('test.session')::uuid);

  select reveal_scope into v_scope from public.cards where id = current_setting('test.card')::uuid;
  if v_scope <> 'hidden' then
    raise exception '검사 실패: 세션 종료 후 일시 공개가 되돌아가지 않았습니다. (%)', v_scope;
  end if;
end
$$;

-- ── 프로필의 운영 전용 열 보호 ──────────────────────────────────────
-- 사용자가 스스로 운영자 권한을 켜거나 이용 정지를 풀 수 없어야 한다.
select set_config('request.jwt.claim.sub', current_setting('test.player'), false);
do $$
begin
  -- 표시 이름은 바꿀 수 있다.
  update public.profiles set display_name = '이름 변경' where id = auth.uid();
  if (select display_name from public.profiles where id = auth.uid()) <> '이름 변경' then
    raise exception '검사 실패: 자신의 표시 이름을 바꾸지 못했습니다.';
  end if;

  begin
    update public.profiles set is_admin = true where id = auth.uid();
    raise exception '검사 실패: 사용자가 스스로 운영자 권한을 얻을 수 있었습니다.';
  exception when insufficient_privilege then
    null;
  end;

  begin
    update public.profiles set is_suspended = false where id = auth.uid();
    raise exception '검사 실패: 사용자가 스스로 이용 정지를 해제할 수 있었습니다.';
  exception when insufficient_privilege then
    null;
  end;
end
$$;

-- ── 이용 정지 계정 차단 ─────────────────────────────────────────────
do $$
declare
  v_rows integer;
begin
  -- 운영자가 정지시킨 상황을 흉내 낸다(정지는 대시보드/service_role로 수행).
  set local role postgres;
  update public.profiles set is_suspended = true where id = current_setting('test.player')::uuid;
  set local role authenticated;

  select count(*) into v_rows from public.campaigns where id = current_setting('test.campaign')::uuid;
  if v_rows <> 0 then
    raise exception '검사 실패: 이용이 정지된 계정에게 캠페인이 보였습니다.';
  end if;

  select count(*) into v_rows from public.player_visible_cards where campaign_id = current_setting('test.campaign')::uuid;
  if v_rows <> 0 then
    raise exception '검사 실패: 이용이 정지된 계정에게 공개 자료가 보였습니다.';
  end if;

  set local role postgres;
  update public.profiles set is_suspended = false where id = current_setting('test.player')::uuid;
  set local role authenticated;

  select count(*) into v_rows from public.campaigns where id = current_setting('test.campaign')::uuid;
  if v_rows <> 1 then
    raise exception '검사 실패: 정지 해제 후에도 캠페인이 보이지 않습니다.';
  end if;
end
$$;
select set_config('request.jwt.claim.sub', current_setting('test.dm'), false);

-- ── 가져오기(import_campaign_data) ──────────────────────────────────
-- 폴더 계층, 태그 연결, 몬스터 스탯, 섹션이 함께 들어오는지 확인한다.
-- 그리고 가져온 카드는 언제나 비공개(hidden)여야 한다.
do $$
declare
  v_payload   jsonb;
  v_card      uuid;
  v_child     uuid;
  v_parent    uuid;
  v_sections  integer;
  v_tags      integer;
  v_scope     text;
  v_hp        integer;
  v_max_hp    integer;
begin
  v_payload := jsonb_build_object(
    'version', 1,
    'folders', jsonb_build_array(
      jsonb_build_object('id', '11111111-1111-4111-8111-111111111111', 'parent_id', null,
                         'name', '가져온 상위 폴더', 'sort_order', 0),
      jsonb_build_object('id', '22222222-2222-4222-8222-222222222222',
                         'parent_id', '11111111-1111-4111-8111-111111111111',
                         'name', '가져온 하위 폴더', 'sort_order', 1)
    ),
    'tags', jsonb_build_array(
      jsonb_build_object('id', '33333333-3333-4333-8333-333333333333', 'name', '가져온 태그', 'color', '#ff0000')
    ),
    'cards', jsonb_build_array(
      jsonb_build_object(
        'name', '가져온 드레이크',
        'type', 'monster',
        'summary', '수입산 드레이크',
        'dm_notes', 'DM 전용 메모',
        'folder_id', '22222222-2222-4222-8222-222222222222',
        'reveal_scope', 'full',           -- 무시되어야 한다
        'tag_ids', jsonb_build_array('33333333-3333-4333-8333-333333333333'),
        'stats', jsonb_build_object(
          'cr', '4', 'ac', 16, 'hp', 999, 'max_hp', 60,   -- hp > max_hp: 정리되어야 한다
          'senses', '암시야 18m', 'languages', '용언',
          'resistances', jsonb_build_array('화염'),
          'abilities', jsonb_build_object('str', 18, 'dex', 12, 'con', 16, 'int', 6, 'wis', 11, 'cha', 8)
        ),
        'sections', jsonb_build_array(
          jsonb_build_object('kind', 'action', 'name', '물기', 'description', '명중 +6, 피해 11 (2d6+4) 관통 피해.', 'sort_order', 0),
          jsonb_build_object('kind', '알수없음', 'name', '꼬리치기', 'description', '명중 +6.', 'sort_order', 1)
        )
      )
    )
  );

  perform public.import_campaign_data(current_setting('test.campaign')::uuid, v_payload, 'skip');

  select id into v_parent from public.folders
   where campaign_id = current_setting('test.campaign')::uuid and name = '가져온 상위 폴더';
  select id into v_child from public.folders
   where campaign_id = current_setting('test.campaign')::uuid and name = '가져온 하위 폴더';
  if v_parent is null or v_child is null then
    raise exception '검사 실패: 가져오기에서 폴더가 만들어지지 않았습니다.';
  end if;
  if (select parent_id from public.folders where id = v_child) is distinct from v_parent then
    raise exception '검사 실패: 가져온 폴더의 부모 관계가 복원되지 않았습니다.';
  end if;

  select id, reveal_scope into v_card, v_scope from public.cards
   where campaign_id = current_setting('test.campaign')::uuid and name = '가져온 드레이크';
  if v_card is null then
    raise exception '검사 실패: 가져오기에서 카드가 만들어지지 않았습니다.';
  end if;
  if v_scope <> 'hidden' then
    raise exception '검사 실패: 가져온 카드가 비공개가 아닙니다. (%)', v_scope;
  end if;
  if (select folder_id from public.cards where id = v_card) is distinct from v_child then
    raise exception '검사 실패: 가져온 카드가 폴더에 배치되지 않았습니다.';
  end if;

  select hp, max_hp into v_hp, v_max_hp from public.monster_stats where card_id = v_card;
  if v_max_hp <> 60 or v_hp <> 60 then
    raise exception '검사 실패: 가져온 hp 값이 정리되지 않았습니다. (hp=%, max=%)', v_hp, v_max_hp;
  end if;
  if not ('화염' = any (select unnest(resistances) from public.monster_stats where card_id = v_card)) then
    raise exception '검사 실패: 가져온 저항 목록이 비어 있습니다.';
  end if;

  select count(*) into v_sections from public.card_sections where card_id = v_card;
  if v_sections <> 2 then
    raise exception '검사 실패: 가져온 섹션 수가 다릅니다. (%)', v_sections;
  end if;
  if (select kind from public.card_sections where card_id = v_card and name = '꼬리치기') <> 'action' then
    raise exception '검사 실패: 허용되지 않는 섹션 종류가 기본값으로 바뀌지 않았습니다.';
  end if;

  select count(*) into v_tags from public.card_tags where card_id = v_card;
  if v_tags <> 1 then
    raise exception '검사 실패: 가져온 태그 연결이 복원되지 않았습니다. (%)', v_tags;
  end if;

  -- 같은 payload를 skip 방식으로 다시 가져와도 카드와 폴더가 늘어나면 안 된다.
  perform public.import_campaign_data(current_setting('test.campaign')::uuid, v_payload, 'skip');
  if (select count(*) from public.cards
       where campaign_id = current_setting('test.campaign')::uuid and name = '가져온 드레이크' and deleted_at is null) <> 1 then
    raise exception '검사 실패: skip 방식인데 카드가 중복 생성되었습니다.';
  end if;
  if (select count(*) from public.folders
       where campaign_id = current_setting('test.campaign')::uuid and name = '가져온 상위 폴더' and deleted_at is null) <> 1 then
    raise exception '검사 실패: 폴더가 중복 생성되었습니다.';
  end if;
end
$$;

-- 플레이어는 가져오기를 실행할 수 없다.
select set_config('request.jwt.claim.sub', current_setting('test.player'), false);
do $$
begin
  begin
    perform public.import_campaign_data(current_setting('test.campaign')::uuid,
                                        jsonb_build_object('cards', '[]'::jsonb), 'skip');
    raise exception '검사 실패: 플레이어가 자료를 가져올 수 있었습니다.';
  exception when insufficient_privilege then
    null;
  end;
end
$$;
select set_config('request.jwt.claim.sub', current_setting('test.dm'), false);

-- ── 상태 효과 라이브러리 ────────────────────────────────────────────
-- 플레이어도 조회는 할 수 있어야 한다(도감). 편집은 DM만 가능해야 한다.
do $$
declare
  v_id uuid;
begin
  insert into public.conditions (campaign_id, key, name, description, is_stackable, color)
  values (current_setting('test.campaign')::uuid, 'bleed', '출혈', '턴마다 피해.', true, '#b91c1c')
  returning id into v_id;
  perform set_config('test.condition', v_id::text, false);

  if (select count(*) from public.conditions where campaign_id is null) = 0 then
    raise exception '검사 실패: 시스템 기본 상태가 없습니다.';
  end if;
end
$$;

select set_config('request.jwt.claim.sub', current_setting('test.player'), false);
do $$
declare
  v_rows integer;
begin
  -- 플레이어는 시스템 기본과 자기 캠페인 상태를 모두 읽을 수 있다.
  select count(*) into v_rows from public.conditions
   where campaign_id = current_setting('test.campaign')::uuid;
  if v_rows <> 1 then
    raise exception '검사 실패: 플레이어가 캠페인 상태를 읽지 못했습니다. (%)', v_rows;
  end if;

  select count(*) into v_rows from public.conditions where campaign_id is null;
  if v_rows = 0 then
    raise exception '검사 실패: 플레이어가 시스템 기본 상태를 읽지 못했습니다.';
  end if;

  -- 편집은 막혀야 한다.
  begin
    insert into public.conditions (campaign_id, key, name)
    values (current_setting('test.campaign')::uuid, 'hack', '몰래추가');
    raise exception '검사 실패: 플레이어가 상태를 추가할 수 있었습니다.';
  exception when insufficient_privilege then
    null;
  end;

  update public.conditions set name = '변조됨' where id = current_setting('test.condition')::uuid;
  if (select name from public.conditions where id = current_setting('test.condition')::uuid) <> '출혈' then
    raise exception '검사 실패: 플레이어가 상태 이름을 바꿀 수 있었습니다.';
  end if;

  delete from public.conditions where id = current_setting('test.condition')::uuid;
  if (select count(*) from public.conditions where id = current_setting('test.condition')::uuid) <> 1 then
    raise exception '검사 실패: 플레이어가 상태를 삭제할 수 있었습니다.';
  end if;
end
$$;
select set_config('request.jwt.claim.sub', current_setting('test.dm'), false);

-- 시스템 기본 상태는 DM도 고칠 수 없다(모든 캠페인이 공유하기 때문).
do $$
declare
  v_name text;
begin
  select name into v_name from public.conditions where campaign_id is null and key = 'prone';
  update public.conditions set name = '변조됨' where campaign_id is null and key = 'prone';
  if (select name from public.conditions where campaign_id is null and key = 'prone') <> v_name then
    raise exception '검사 실패: 시스템 기본 상태가 수정되었습니다.';
  end if;
end
$$;

-- 스택 값의 범위 제약을 확인한다.
do $$
declare
  v_ok boolean := false;
begin
  begin
    insert into public.combatant_conditions (combatant_id, condition_key, stacks)
    values (current_setting('test.combatant')::uuid, 'bleed', -1);
  exception when check_violation then
    v_ok := true;
  end;
  if not v_ok then
    raise exception '검사 실패: 음수 스택이 저장되었습니다.';
  end if;
end
$$;

-- ── 세션 삭제 ───────────────────────────────────────────────────────
-- 소유자만 지울 수 있고, 휴지통에 남아 복구할 수 있어야 한다.
do $$
declare
  v_session uuid;
  v_item    uuid;
begin
  insert into public.sessions (campaign_id, title, session_number)
  values (current_setting('test.campaign')::uuid, '삭제 검증 세션', 99)
  returning id into v_session;
  perform set_config('test.delete_session', v_session::text, false);
end
$$;

-- 플레이어는 삭제할 수 없다.
select set_config('request.jwt.claim.sub', current_setting('test.player'), false);
do $$
begin
  begin
    perform public.soft_delete_session(current_setting('test.delete_session')::uuid);
    raise exception '검사 실패: 플레이어가 세션을 삭제할 수 있었습니다.';
  exception when insufficient_privilege then
    null;
  end;
end
$$;
select set_config('request.jwt.claim.sub', current_setting('test.dm'), false);

do $$
declare
  v_item uuid;
  v_rows integer;
begin
  perform public.soft_delete_session(current_setting('test.delete_session')::uuid);

  if (select deleted_at from public.sessions where id = current_setting('test.delete_session')::uuid) is null then
    raise exception '검사 실패: 세션이 삭제 표시되지 않았습니다.';
  end if;

  select id into v_item from public.deleted_items
   where entity_type = 'session' and entity_id = current_setting('test.delete_session')::uuid;
  if v_item is null then
    raise exception '검사 실패: 삭제한 세션이 휴지통에 없습니다.';
  end if;

  -- 두 번 호출해도 휴지통 항목이 늘지 않는다.
  perform public.soft_delete_session(current_setting('test.delete_session')::uuid);
  select count(*) into v_rows from public.deleted_items
   where entity_type = 'session' and entity_id = current_setting('test.delete_session')::uuid;
  if v_rows <> 1 then
    raise exception '검사 실패: 중복 삭제로 휴지통 항목이 늘었습니다. (%)', v_rows;
  end if;

  -- 복구되어야 한다.
  perform public.restore_deleted_item(v_item);
  if (select deleted_at from public.sessions where id = current_setting('test.delete_session')::uuid) is not null then
    raise exception '검사 실패: 세션이 복구되지 않았습니다.';
  end if;
end
$$;

-- ── 다른 캠페인 격리 ────────────────────────────────────────────────
do $$
declare
  v_other uuid;
  v_rows  integer;
begin
  insert into public.campaigns (owner_id, name) values (auth.uid(), '다른 캠페인') returning id into v_other;
  perform set_config('test.other_campaign', v_other::text, false);
end
$$;

select set_config('request.jwt.claim.sub', current_setting('test.player'), false);
do $$
declare
  v_rows integer;
begin
  select count(*) into v_rows from public.campaigns where id = current_setting('test.other_campaign')::uuid;
  if v_rows <> 0 then
    raise exception '검사 실패: 참여하지 않은 캠페인이 노출되었습니다.';
  end if;
end
$$;

reset role;
\echo '모든 RLS 검사를 통과했습니다.'
