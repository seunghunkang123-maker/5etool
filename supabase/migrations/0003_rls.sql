-- =====================================================================
-- Row Level Security
--
-- 원칙
--  1) 모든 테이블에서 RLS를 켠다. 기본은 거부.
--  2) 캠페인 구성원만 캠페인 데이터에 접근한다.
--  3) 비공개 자료(cards.dm_notes 포함)는 DM 권한자만 읽는다.
--     플레이어는 cards 테이블을 직접 조회할 수 없고 player_visible_cards 뷰만 사용한다.
--  4) 플레이어는 자기 캐릭터만 수정한다.
-- =====================================================================

alter table public.profiles              enable row level security;
alter table public.user_preferences      enable row level security;
alter table public.campaigns             enable row level security;
alter table public.campaign_members      enable row level security;
alter table public.campaign_invites      enable row level security;
alter table public.sessions              enable row level security;
alter table public.session_participants  enable row level security;
alter table public.folders               enable row level security;
alter table public.tags                  enable row level security;
alter table public.cards                 enable row level security;
alter table public.card_tags             enable row level security;
alter table public.card_sections         enable row level security;
alter table public.monster_stats         enable row level security;
alter table public.player_characters     enable row level security;
alter table public.character_resources   enable row level security;
alter table public.encounters            enable row level security;
alter table public.encounter_combatants  enable row level security;
alter table public.conditions            enable row level security;
alter table public.combatant_conditions  enable row level security;
alter table public.timers                enable row level security;
alter table public.dice_rolls            enable row level security;
alter table public.handout_reveals       enable row level security;
alter table public.notifications         enable row level security;
alter table public.session_logs          enable row level security;
alter table public.audit_logs            enable row level security;
alter table public.uploaded_files        enable row level security;
alter table public.deleted_items         enable row level security;
alter table public.card_templates        enable row level security;
alter table public.ai_usage              enable row level security;

-- ── 프로필 ──────────────────────────────────────────────────────────
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or public.is_service_admin()
    -- 같은 캠페인 구성원의 표시 이름은 서로 볼 수 있어야 한다.
    or exists (
      select 1
      from public.campaign_members mine
      join public.campaign_members theirs on theirs.campaign_id = mine.campaign_id
      where mine.user_id = auth.uid() and theirs.user_id = public.profiles.id
    )
  );

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ── 사용자 설정 ─────────────────────────────────────────────────────
drop policy if exists preferences_all on public.user_preferences;
create policy preferences_all on public.user_preferences for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ── 캠페인 ──────────────────────────────────────────────────────────
drop policy if exists campaigns_select on public.campaigns;
create policy campaigns_select on public.campaigns for select to authenticated
  -- owner_id 조건은 INSERT ... RETURNING에도 필요하다.
  -- (구성원 행은 AFTER INSERT 트리거가 만들기 때문에 반환 시점에는 아직 존재하지 않는다.)
  using (
    (owner_id = auth.uid() and public.is_active_user())
    or public.is_campaign_member(id)
    or public.is_service_admin()
  );

drop policy if exists campaigns_insert on public.campaigns;
create policy campaigns_insert on public.campaigns for insert to authenticated
  with check (owner_id = auth.uid() and public.is_active_user());

drop policy if exists campaigns_update on public.campaigns;
create policy campaigns_update on public.campaigns for update to authenticated
  using (public.is_campaign_owner(id) or public.has_campaign_permission(id, 'manage_campaign'))
  with check (public.is_campaign_owner(id) or public.has_campaign_permission(id, 'manage_campaign'));

-- 영구 삭제는 소유자만 (앱은 deleted_at으로 휴지통 처리한다)
drop policy if exists campaigns_delete on public.campaigns;
create policy campaigns_delete on public.campaigns for delete to authenticated
  using (public.is_campaign_owner(id));

-- ── 구성원 ──────────────────────────────────────────────────────────
drop policy if exists members_select on public.campaign_members;
create policy members_select on public.campaign_members for select to authenticated
  using (user_id = auth.uid() or public.is_campaign_member(campaign_id));

drop policy if exists members_update on public.campaign_members;
create policy members_update on public.campaign_members for update to authenticated
  using (public.can_manage_players(campaign_id) and role <> 'owner')
  with check (public.can_manage_players(campaign_id) and role <> 'owner');

drop policy if exists members_delete on public.campaign_members;
create policy members_delete on public.campaign_members for delete to authenticated
  using ((public.can_manage_players(campaign_id) or user_id = auth.uid()) and role <> 'owner');

-- 초대 수락과 코드 참여는 SECURITY DEFINER RPC로만 이루어진다(직접 INSERT 불가).

-- ── 초대 ────────────────────────────────────────────────────────────
drop policy if exists invites_select on public.campaign_invites;
create policy invites_select on public.campaign_invites for select to authenticated
  using (
    public.can_manage_players(campaign_id)
    or lower(email) = lower(coalesce((select p.email from public.profiles p where p.id = auth.uid()), ''))
  );

drop policy if exists invites_insert on public.campaign_invites;
create policy invites_insert on public.campaign_invites for insert to authenticated
  with check (public.can_manage_players(campaign_id));

drop policy if exists invites_update on public.campaign_invites;
create policy invites_update on public.campaign_invites for update to authenticated
  using (public.can_manage_players(campaign_id))
  with check (public.can_manage_players(campaign_id));

drop policy if exists invites_delete on public.campaign_invites;
create policy invites_delete on public.campaign_invites for delete to authenticated
  using (public.can_manage_players(campaign_id));

-- ── 세션 ────────────────────────────────────────────────────────────
drop policy if exists sessions_select on public.sessions;
create policy sessions_select on public.sessions for select to authenticated
  using (public.is_campaign_member(campaign_id));

drop policy if exists sessions_insert on public.sessions;
create policy sessions_insert on public.sessions for insert to authenticated
  with check (public.is_campaign_dm(campaign_id));

drop policy if exists sessions_update on public.sessions;
create policy sessions_update on public.sessions for update to authenticated
  using (public.is_campaign_dm(campaign_id))
  with check (public.is_campaign_dm(campaign_id));

drop policy if exists sessions_delete on public.sessions;
create policy sessions_delete on public.sessions for delete to authenticated
  using (public.is_campaign_owner(campaign_id));

drop policy if exists participants_select on public.session_participants;
create policy participants_select on public.session_participants for select to authenticated
  using (public.is_campaign_member(public.session_campaign_id(session_id)));

drop policy if exists participants_upsert on public.session_participants;
create policy participants_upsert on public.session_participants for insert to authenticated
  with check (user_id = auth.uid() and public.is_campaign_member(public.session_campaign_id(session_id)));

drop policy if exists participants_update on public.session_participants;
create policy participants_update on public.session_participants for update to authenticated
  using (user_id = auth.uid() or public.is_campaign_dm(public.session_campaign_id(session_id)))
  with check (user_id = auth.uid() or public.is_campaign_dm(public.session_campaign_id(session_id)));

-- ── 폴더 / 태그 ─────────────────────────────────────────────────────
drop policy if exists folders_select on public.folders;
create policy folders_select on public.folders for select to authenticated
  using (public.can_view_assets(campaign_id) or public.can_edit_assets(campaign_id));

drop policy if exists folders_write on public.folders;
create policy folders_write on public.folders for all to authenticated
  using (public.can_edit_assets(campaign_id))
  with check (public.can_edit_assets(campaign_id));

drop policy if exists tags_select on public.tags;
create policy tags_select on public.tags for select to authenticated
  using (public.is_campaign_member(campaign_id));

drop policy if exists tags_write on public.tags;
create policy tags_write on public.tags for all to authenticated
  using (public.can_edit_assets(campaign_id))
  with check (public.can_edit_assets(campaign_id));

-- ── 카드 (핵심 보안 경계) ───────────────────────────────────────────
-- 플레이어는 cards 테이블을 직접 조회할 수 없다. 공개된 자료는 player_visible_cards 뷰로만 본다.
drop policy if exists cards_select on public.cards;
create policy cards_select on public.cards for select to authenticated
  using (public.can_view_assets(campaign_id) or public.can_edit_assets(campaign_id));

drop policy if exists cards_insert on public.cards;
create policy cards_insert on public.cards for insert to authenticated
  with check (public.can_edit_assets(campaign_id));

drop policy if exists cards_update on public.cards;
create policy cards_update on public.cards for update to authenticated
  using (public.can_edit_assets(campaign_id))
  with check (public.can_edit_assets(campaign_id));

drop policy if exists cards_delete on public.cards;
create policy cards_delete on public.cards for delete to authenticated
  using (public.can_edit_assets(campaign_id));

drop policy if exists card_tags_select on public.card_tags;
create policy card_tags_select on public.card_tags for select to authenticated
  using (public.can_view_assets(public.card_campaign_id(card_id)) or public.can_edit_assets(public.card_campaign_id(card_id)));

drop policy if exists card_tags_write on public.card_tags;
create policy card_tags_write on public.card_tags for all to authenticated
  using (public.can_edit_assets(public.card_campaign_id(card_id)))
  with check (public.can_edit_assets(public.card_campaign_id(card_id)));

drop policy if exists card_sections_select on public.card_sections;
create policy card_sections_select on public.card_sections for select to authenticated
  using (public.can_view_assets(public.card_campaign_id(card_id)) or public.can_edit_assets(public.card_campaign_id(card_id)));

drop policy if exists card_sections_write on public.card_sections;
create policy card_sections_write on public.card_sections for all to authenticated
  using (public.can_edit_assets(public.card_campaign_id(card_id)))
  with check (public.can_edit_assets(public.card_campaign_id(card_id)));

drop policy if exists monster_stats_select on public.monster_stats;
create policy monster_stats_select on public.monster_stats for select to authenticated
  using (public.can_view_assets(public.card_campaign_id(card_id)) or public.can_edit_assets(public.card_campaign_id(card_id)));

drop policy if exists monster_stats_write on public.monster_stats;
create policy monster_stats_write on public.monster_stats for all to authenticated
  using (public.can_edit_assets(public.card_campaign_id(card_id)))
  with check (public.can_edit_assets(public.card_campaign_id(card_id)));

-- ── 캐릭터 ──────────────────────────────────────────────────────────
drop policy if exists characters_select on public.player_characters;
create policy characters_select on public.player_characters for select to authenticated
  using (public.is_campaign_member(campaign_id));

drop policy if exists characters_insert on public.player_characters;
create policy characters_insert on public.player_characters for insert to authenticated
  with check (
    public.is_campaign_member(campaign_id)
    and (user_id = auth.uid() or public.is_campaign_dm(campaign_id))
  );

drop policy if exists characters_update on public.player_characters;
create policy characters_update on public.player_characters for update to authenticated
  using (user_id = auth.uid() or public.is_campaign_dm(campaign_id))
  with check (user_id = auth.uid() or public.is_campaign_dm(campaign_id));

drop policy if exists characters_delete on public.player_characters;
create policy characters_delete on public.player_characters for delete to authenticated
  using (user_id = auth.uid() or public.is_campaign_owner(campaign_id));

drop policy if exists resources_select on public.character_resources;
create policy resources_select on public.character_resources for select to authenticated
  using (public.is_campaign_member(public.character_campaign_id(character_id)));

drop policy if exists resources_write on public.character_resources;
create policy resources_write on public.character_resources for all to authenticated
  using (public.owns_character(character_id) or public.is_campaign_dm(public.character_campaign_id(character_id)))
  with check (public.owns_character(character_id) or public.is_campaign_dm(public.character_campaign_id(character_id)));

-- ── 전투 ────────────────────────────────────────────────────────────
drop policy if exists encounters_select on public.encounters;
create policy encounters_select on public.encounters for select to authenticated
  using (public.is_campaign_member(campaign_id));

drop policy if exists encounters_write on public.encounters;
create policy encounters_write on public.encounters for all to authenticated
  using (public.can_manage_combat(campaign_id))
  with check (public.can_manage_combat(campaign_id));

drop policy if exists combatants_select on public.encounter_combatants;
create policy combatants_select on public.encounter_combatants for select to authenticated
  using (public.is_campaign_member(public.encounter_campaign_id(encounter_id)));

drop policy if exists combatants_insert on public.encounter_combatants;
create policy combatants_insert on public.encounter_combatants for insert to authenticated
  with check (public.can_manage_combat(public.encounter_campaign_id(encounter_id)));

-- 자기 캐릭터의 HP는 본인도 수정할 수 있다.
drop policy if exists combatants_update on public.encounter_combatants;
create policy combatants_update on public.encounter_combatants for update to authenticated
  using (
    public.can_manage_combat(public.encounter_campaign_id(encounter_id))
    or (character_id is not null and public.owns_character(character_id))
  )
  with check (
    public.can_manage_combat(public.encounter_campaign_id(encounter_id))
    or (character_id is not null and public.owns_character(character_id))
  );

drop policy if exists combatants_delete on public.encounter_combatants;
create policy combatants_delete on public.encounter_combatants for delete to authenticated
  using (public.can_manage_combat(public.encounter_campaign_id(encounter_id)));

drop policy if exists conditions_select on public.conditions;
create policy conditions_select on public.conditions for select to authenticated
  using (campaign_id is null or public.is_campaign_member(campaign_id));

drop policy if exists conditions_write on public.conditions;
create policy conditions_write on public.conditions for all to authenticated
  using (campaign_id is not null and public.can_edit_assets(campaign_id))
  with check (campaign_id is not null and public.can_edit_assets(campaign_id));

-- 비공개 상태 효과는 DM만 볼 수 있다.
drop policy if exists combatant_conditions_select on public.combatant_conditions;
create policy combatant_conditions_select on public.combatant_conditions for select to authenticated
  using (
    public.is_campaign_member(public.combatant_campaign_id(combatant_id))
    and (is_public or public.can_manage_combat(public.combatant_campaign_id(combatant_id)))
  );

drop policy if exists combatant_conditions_write on public.combatant_conditions;
create policy combatant_conditions_write on public.combatant_conditions for all to authenticated
  using (public.can_manage_combat(public.combatant_campaign_id(combatant_id)))
  with check (public.can_manage_combat(public.combatant_campaign_id(combatant_id)));

-- ── 타이머 ──────────────────────────────────────────────────────────
drop policy if exists timers_select on public.timers;
create policy timers_select on public.timers for select to authenticated
  using (
    public.is_campaign_member(public.session_campaign_id(session_id))
    and (is_shared or public.is_campaign_dm(public.session_campaign_id(session_id)))
  );

drop policy if exists timers_write on public.timers;
create policy timers_write on public.timers for all to authenticated
  using (public.is_campaign_dm(public.session_campaign_id(session_id)))
  with check (public.is_campaign_dm(public.session_campaign_id(session_id)));

-- ── 주사위 ──────────────────────────────────────────────────────────
drop policy if exists dice_select on public.dice_rolls;
create policy dice_select on public.dice_rolls for select to authenticated
  using (
    public.is_campaign_member(campaign_id)
    and (
      visibility = 'all'
      or (visibility = 'self' and user_id = auth.uid())
      or (visibility = 'dm' and (user_id = auth.uid() or public.is_campaign_dm(campaign_id)))
      or (visibility = 'dm_secret' and public.is_campaign_dm(campaign_id))
    )
  );

drop policy if exists dice_insert on public.dice_rolls;
create policy dice_insert on public.dice_rolls for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.is_campaign_member(campaign_id)
    and public.campaign_role(campaign_id) <> 'spectator'
  );

drop policy if exists handout_reveals_select on public.handout_reveals;
create policy handout_reveals_select on public.handout_reveals for select to authenticated
  using (public.is_campaign_member(public.session_campaign_id(session_id)));

drop policy if exists handout_reveals_write on public.handout_reveals;
create policy handout_reveals_write on public.handout_reveals for all to authenticated
  using (public.can_edit_assets(public.session_campaign_id(session_id)))
  with check (public.can_edit_assets(public.session_campaign_id(session_id)));

-- ── 알림 / 로그 ─────────────────────────────────────────────────────
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = auth.uid());

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications for delete to authenticated
  using (user_id = auth.uid());

-- 플레이어는 공개 이벤트만, DM은 전체 로그를 본다.
drop policy if exists session_logs_select on public.session_logs;
create policy session_logs_select on public.session_logs for select to authenticated
  using (
    public.is_campaign_member(campaign_id)
    and (visibility = 'all' or actor_id = auth.uid() or public.can_view_assets(campaign_id))
  );

drop policy if exists session_logs_insert on public.session_logs;
create policy session_logs_insert on public.session_logs for insert to authenticated
  with check (public.is_campaign_member(campaign_id) and actor_id = auth.uid());

drop policy if exists session_logs_update on public.session_logs;
create policy session_logs_update on public.session_logs for update to authenticated
  using (public.can_manage_combat(campaign_id))
  with check (public.can_manage_combat(campaign_id));

-- 감사 로그는 읽기 전용(쓰기는 SECURITY DEFINER 함수만)
drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (public.is_campaign_owner(campaign_id) or public.is_service_admin());

-- ── 파일 / 휴지통 / 템플릿 ──────────────────────────────────────────
drop policy if exists uploaded_files_select on public.uploaded_files;
create policy uploaded_files_select on public.uploaded_files for select to authenticated
  using (public.is_campaign_member(campaign_id));

drop policy if exists uploaded_files_write on public.uploaded_files;
create policy uploaded_files_write on public.uploaded_files for all to authenticated
  using (public.can_edit_assets(campaign_id))
  with check (public.can_edit_assets(campaign_id) and owner_id = auth.uid());

drop policy if exists deleted_items_select on public.deleted_items;
create policy deleted_items_select on public.deleted_items for select to authenticated
  using (public.can_view_assets(campaign_id) or public.can_edit_assets(campaign_id));

drop policy if exists deleted_items_delete on public.deleted_items;
create policy deleted_items_delete on public.deleted_items for delete to authenticated
  using (public.can_edit_assets(campaign_id));

drop policy if exists card_templates_select on public.card_templates;
create policy card_templates_select on public.card_templates for select to authenticated
  using (campaign_id is null or public.is_campaign_member(campaign_id));

drop policy if exists card_templates_write on public.card_templates;
create policy card_templates_write on public.card_templates for all to authenticated
  using (campaign_id is not null and public.can_edit_assets(campaign_id) and is_system = false)
  with check (campaign_id is not null and public.can_edit_assets(campaign_id) and is_system = false);

drop policy if exists ai_usage_select on public.ai_usage;
create policy ai_usage_select on public.ai_usage for select to authenticated
  using (user_id = auth.uid() or public.is_service_admin());

-- ── 실시간 구독 대상 ────────────────────────────────────────────────
-- Realtime은 RLS를 그대로 적용하므로, 권한이 없는 사용자에게는 변경이 전달되지 않는다.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.cards,
      public.sessions,
      public.encounters,
      public.encounter_combatants,
      public.combatant_conditions,
      public.timers,
      public.dice_rolls,
      public.session_logs,
      public.notifications,
      public.player_characters,
      public.campaign_members,
      public.session_participants;
  end if;
end
$$;
