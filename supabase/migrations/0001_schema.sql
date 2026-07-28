-- =====================================================================
-- Arcanum Table — 스키마
-- 컬럼 이름은 프론트엔드 타입(src/data/types.ts)과 1:1로 대응한다.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ── 프로필 / 설정 ────────────────────────────────────────────────────
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  email         text        not null,
  display_name  text        not null default '모험가' check (char_length(display_name) between 1 and 40),
  avatar_url    text,
  locale        text        not null default 'ko',
  is_admin      boolean     not null default false,
  is_suspended  boolean     not null default false,
  created_at    timestamptz not null default now()
);

create table if not exists public.user_preferences (
  user_id            uuid primary key references public.profiles (id) on delete cascade,
  theme              text    not null default 'system' check (theme in ('light', 'dark', 'system')),
  density            text    not null default 'default' check (density in ('comfortable', 'default', 'compact')),
  font_scale         numeric not null default 1 check (font_scale between 0.5 and 2),
  reduce_motion      boolean not null default false,
  panel_layout       jsonb   not null default '{}'::jsonb,
  notification_prefs jsonb   not null default '{"in_app":true,"sound":false,"browser":false,"email":false}'::jsonb
);

-- ── 캠페인 ──────────────────────────────────────────────────────────
create table if not exists public.campaigns (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid        not null references public.profiles (id) on delete cascade,
  name               text        not null check (char_length(name) between 1 and 80),
  description        text        not null default '',
  system             text        not null default 'dnd5e',
  cover_url          text,
  theme_color        text        not null default '#7c3aed',
  status             text        not null default 'planning'
                       check (status in ('planning', 'active', 'hiatus', 'completed', 'archived')),
  join_policy        text        not null default 'code' check (join_policy in ('code', 'invite_only', 'request')),
  join_code          text        not null unique,
  max_players        integer     not null default 6 check (max_players between 1 and 20),
  is_mature          boolean     not null default false,
  party_visibility   jsonb       not null default
                       '{"hp_numbers":true,"ac":true,"conditions":true,"concentration":true,"class_level":true}'::jsonb,
  allow_player_notes boolean     not null default true,
  deleted_at         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists public.campaign_members (
  campaign_id uuid        not null references public.campaigns (id) on delete cascade,
  user_id     uuid        not null references public.profiles (id) on delete cascade,
  role        text        not null default 'player' check (role in ('owner', 'co_dm', 'player', 'spectator')),
  permissions jsonb       not null default '{}'::jsonb,
  joined_at   timestamptz not null default now(),
  primary key (campaign_id, user_id)
);

create table if not exists public.campaign_invites (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid        not null references public.campaigns (id) on delete cascade,
  email       text        not null,
  role        text        not null default 'player' check (role in ('co_dm', 'player', 'spectator')),
  token       uuid        not null default gen_random_uuid(),
  status      text        not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '14 days',
  unique (campaign_id, email)
);

-- ── 세션 ────────────────────────────────────────────────────────────
create table if not exists public.sessions (
  id             uuid primary key default gen_random_uuid(),
  campaign_id    uuid        not null references public.campaigns (id) on delete cascade,
  title          text        not null default '새 세션',
  session_number integer     not null default 1,
  scheduled_at   timestamptz,
  started_at     timestamptz,
  ended_at       timestamptz,
  status         text        not null default 'scheduled'
                   check (status in ('scheduled', 'preparing', 'live', 'paused', 'ended', 'cancelled')),
  description    text        not null default '',
  cover_url      text,
  summary        jsonb,
  deleted_at     timestamptz,
  created_at     timestamptz not null default now()
);

create table if not exists public.session_participants (
  session_id uuid        not null references public.sessions (id) on delete cascade,
  user_id    uuid        not null references public.profiles (id) on delete cascade,
  is_online  boolean     not null default false,
  joined_at  timestamptz not null default now(),
  left_at    timestamptz,
  primary key (session_id, user_id)
);

-- ── 폴더 / 태그 / 카드 ──────────────────────────────────────────────
create table if not exists public.folders (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid    not null references public.campaigns (id) on delete cascade,
  parent_id   uuid    references public.folders (id) on delete set null,
  name        text    not null default '새 폴더' check (char_length(name) between 1 and 80),
  color       text,
  icon        text,
  sort_order  integer not null default 0,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  constraint folder_not_self_parent check (parent_id is null or parent_id <> id)
);

create table if not exists public.tags (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 40),
  color       text not null default '#6d3fd4',
  unique (campaign_id, name)
);

create table if not exists public.cards (
  id                  uuid primary key default gen_random_uuid(),
  campaign_id         uuid        not null references public.campaigns (id) on delete cascade,
  folder_id           uuid        references public.folders (id) on delete set null,
  type                text        not null default 'text'
                        check (type in ('monster','npc','pc','image','map','location','item','spell','quest','handout','text','rule','custom')),
  name                text        not null default '이름 없는 카드' check (char_length(name) between 1 and 120),
  summary             text        not null default '',
  body                jsonb,
  image_url           text,
  -- 새 카드는 언제나 비공개로 시작한다.
  reveal_scope        text        not null default 'hidden'
                        check (reveal_scope in ('hidden', 'name_only', 'image_only', 'partial', 'full')),
  reveal_fields       text[]      not null default array['name','image']::text[],
  reveal_targets      uuid[]      not null default '{}'::uuid[],
  is_temporary_reveal boolean     not null default false,
  previous_scope      text        check (previous_scope in ('hidden', 'name_only', 'image_only', 'partial', 'full')),
  is_favorite         boolean     not null default false,
  is_archived         boolean     not null default false,
  sort_order          integer     not null default 0,
  dm_notes            text        not null default '',
  created_by          uuid        references public.profiles (id) on delete set null,
  version             integer     not null default 1,
  deleted_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  search_tsv          tsvector generated always as (
                        to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(summary, ''))
                      ) stored
);

create table if not exists public.card_tags (
  card_id uuid not null references public.cards (id) on delete cascade,
  tag_id  uuid not null references public.tags (id) on delete cascade,
  primary key (card_id, tag_id)
);

create table if not exists public.card_sections (
  id          uuid primary key default gen_random_uuid(),
  card_id     uuid    not null references public.cards (id) on delete cascade,
  kind        text    not null default 'action'
                check (kind in ('trait','action','bonus','reaction','legendary','mythic','lair','regional','spell')),
  name        text    not null default '',
  description text    not null default '',
  sort_order  integer not null default 0
);

create table if not exists public.monster_stats (
  card_id              uuid primary key references public.cards (id) on delete cascade,
  size                 text    not null default '중형',
  type                 text    not null default '괴물류',
  alignment            text    not null default '중립',
  cr                   text    not null default '1',
  proficiency_bonus    integer not null default 2,
  xp                   integer not null default 200,
  ac                   integer not null default 12 check (ac between 0 and 40),
  ac_note              text    not null default '',
  hp                   integer not null default 11 check (hp >= 0),
  max_hp               integer not null default 11 check (max_hp >= 0),
  temp_hp              integer not null default 0 check (temp_hp >= 0),
  hit_dice             text    not null default '',
  speeds               jsonb   not null default '{"walk":30,"fly":0,"swim":0,"climb":0,"burrow":0}'::jsonb,
  abilities            jsonb   not null default '{"str":10,"dex":10,"con":10,"int":10,"wis":10,"cha":10}'::jsonb,
  saves                jsonb   not null default '{}'::jsonb,
  skills               jsonb   not null default '{}'::jsonb,
  vulnerabilities      text[]  not null default '{}',
  resistances          text[]  not null default '{}',
  immunities           text[]  not null default '{}',
  condition_immunities text[]  not null default '{}',
  senses               text    not null default '',
  passive_perception   integer not null default 10,
  languages            text    not null default '',
  spellcasting_ability text,
  constraint monster_hp_within_max check (hp <= max_hp)
);

-- ── 캐릭터 ──────────────────────────────────────────────────────────
create table if not exists public.player_characters (
  id                 uuid primary key default gen_random_uuid(),
  campaign_id        uuid        not null references public.campaigns (id) on delete cascade,
  user_id            uuid        not null references public.profiles (id) on delete cascade,
  name               text        not null default '새 캐릭터' check (char_length(name) between 1 and 80),
  player_name        text        not null default '',
  klass              text        not null default '',
  subclass           text        not null default '',
  level              integer     not null default 1 check (level between 1 and 20),
  race               text        not null default '',
  background         text        not null default '',
  alignment          text        not null default '',
  xp                 integer     not null default 0 check (xp >= 0),
  image_url          text,
  description        text        not null default '',
  ac                 integer     not null default 10,
  hp                 integer     not null default 10 check (hp >= 0),
  max_hp             integer     not null default 10 check (max_hp >= 0),
  temp_hp            integer     not null default 0 check (temp_hp >= 0),
  speed              integer     not null default 30,
  proficiency_bonus  integer     not null default 2,
  initiative_bonus   integer     not null default 0,
  passive_perception integer     not null default 10,
  inspiration        boolean     not null default false,
  abilities          jsonb       not null default '{"str":10,"dex":10,"con":10,"int":10,"wis":10,"cha":10}'::jsonb,
  saves              jsonb       not null default '{}'::jsonb,
  skills             jsonb       not null default '{}'::jsonb,
  death_saves        jsonb       not null default '{"successes":0,"failures":0}'::jsonb,
  sheet              jsonb       not null default '{}'::jsonb,
  share_settings     jsonb       not null default
                       '{"show_hp_numbers":true,"show_ac":true,"show_conditions":true,"show_sheet":false}'::jsonb,
  version            integer     not null default 1,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint character_hp_within_max check (hp <= max_hp)
);

create table if not exists public.character_resources (
  id           uuid primary key default gen_random_uuid(),
  character_id uuid    not null references public.player_characters (id) on delete cascade,
  name         text    not null default '새 자원',
  current      integer not null default 0 check (current >= 0),
  max          integer not null default 0 check (max >= 0),
  recharge     text    not null default 'long' check (recharge in ('short', 'long', 'none')),
  sort_order   integer not null default 0
);

-- ── 전투 ────────────────────────────────────────────────────────────
create table if not exists public.encounters (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid        not null references public.sessions (id) on delete cascade,
  campaign_id         uuid        not null references public.campaigns (id) on delete cascade,
  name                text        not null default '새 전투',
  status              text        not null default 'draft' check (status in ('draft', 'active', 'paused', 'ended')),
  round               integer     not null default 0 check (round >= 0),
  active_combatant_id uuid,
  turn_started_at     timestamptz,
  tiebreak_rule       text        not null default 'dex_mod' check (tiebreak_rule in ('dex_mod', 'dex_score', 'manual')),
  version             integer     not null default 1,
  created_at          timestamptz not null default now()
);

create table if not exists public.encounter_combatants (
  id                  uuid primary key default gen_random_uuid(),
  encounter_id        uuid    not null references public.encounters (id) on delete cascade,
  source_type         text    not null default 'custom' check (source_type in ('monster', 'npc', 'pc', 'custom')),
  source_card_id      uuid    references public.cards (id) on delete set null,
  character_id        uuid    references public.player_characters (id) on delete set null,
  name                text    not null default '참가자',
  image_url           text,
  initiative          integer,
  initiative_tiebreak integer not null default 0,
  dex_mod             integer not null default 0,
  dex_score           integer not null default 10,
  hp                  integer not null default 1 check (hp >= 0),
  max_hp              integer not null default 1 check (max_hp >= 0),
  temp_hp             integer not null default 0 check (temp_hp >= 0),
  ac                  integer not null default 10,
  is_hidden           boolean not null default false,
  is_defeated         boolean not null default false,
  is_concentrating    boolean not null default false,
  concentration_note  text    not null default '',
  hide_hp_numbers     boolean not null default true,
  dm_notes            text    not null default '',
  sort_order          integer not null default 0,
  constraint combatant_hp_within_max check (hp <= max_hp)
);

alter table public.encounters
  drop constraint if exists encounters_active_combatant_fk;
alter table public.encounters
  add constraint encounters_active_combatant_fk
  foreign key (active_combatant_id) references public.encounter_combatants (id) on delete set null;

create table if not exists public.conditions (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.campaigns (id) on delete cascade, -- null이면 시스템 기본 상태
  key         text not null,
  name        text not null,
  icon        text not null default 'circle',
  description text not null default '',
  unique (campaign_id, key)
);

create table if not exists public.combatant_conditions (
  id                   uuid primary key default gen_random_uuid(),
  combatant_id         uuid        not null references public.encounter_combatants (id) on delete cascade,
  condition_key        text        not null,
  custom_name          text,
  icon                 text        not null default 'circle',
  description          text        not null default '',
  started_round        integer     not null default 1,
  duration_mode        text        not null default 'manual'
                         check (duration_mode in ('rounds','target_turn_start','target_turn_end','source_turn_start','source_turn_end','manual')),
  duration_rounds      integer     check (duration_rounds is null or duration_rounds > 0),
  source_combatant_id  uuid        references public.encounter_combatants (id) on delete set null,
  linked_concentration boolean     not null default false,
  is_public            boolean     not null default true,
  created_at           timestamptz not null default now()
);

-- ── 타이머 / 주사위 ─────────────────────────────────────────────────
create table if not exists public.timers (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid        not null references public.sessions (id) on delete cascade,
  name                text        not null default '새 타이머',
  description         text        not null default '',
  kind                text        not null default 'countdown' check (kind in ('countdown', 'stopwatch')),
  duration_seconds    integer     not null default 60 check (duration_seconds >= 0),
  -- 남은 시간은 저장하지 않고 종료 예정 시각만 저장한다(매초 쓰기 방지).
  ends_at             timestamptz,
  started_at          timestamptz,
  paused_remaining_ms integer,
  elapsed_ms          integer     not null default 0,
  state               text        not null default 'idle' check (state in ('idle', 'running', 'paused', 'finished')),
  is_shared           boolean     not null default true,
  end_message         text        not null default '',
  sound_on_end        boolean     not null default false,
  created_by          uuid        references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now()
);

create table if not exists public.dice_rolls (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid        references public.sessions (id) on delete cascade,
  campaign_id uuid        not null references public.campaigns (id) on delete cascade,
  user_id     uuid        not null references public.profiles (id) on delete cascade,
  expression  text        not null check (char_length(expression) <= 100),
  detail      jsonb       not null default '{}'::jsonb,
  total       integer     not null,
  purpose     text        not null default '',
  visibility  text        not null default 'all' check (visibility in ('all', 'dm', 'self', 'dm_secret')),
  created_at  timestamptz not null default now()
);

create table if not exists public.handout_reveals (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid        not null references public.sessions (id) on delete cascade,
  card_id     uuid        not null references public.cards (id) on delete cascade,
  revealed_by uuid        references public.profiles (id) on delete set null,
  scope       text        not null default 'full',
  targets     uuid[]      not null default '{}'::uuid[],
  revealed_at timestamptz not null default now(),
  hidden_at   timestamptz
);

-- ── 알림 / 로그 ─────────────────────────────────────────────────────
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid        not null references public.profiles (id) on delete cascade,
  campaign_id uuid        references public.campaigns (id) on delete cascade,
  session_id  uuid        references public.sessions (id) on delete cascade,
  type        text        not null,
  title       text        not null default '',
  body        text        not null default '',
  data        jsonb       not null default '{}'::jsonb,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create table if not exists public.session_logs (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid        not null references public.sessions (id) on delete cascade,
  campaign_id uuid        not null references public.campaigns (id) on delete cascade,
  actor_id    uuid        references public.profiles (id) on delete set null,
  actor_name  text        not null default '',
  event_type  text        not null,
  target_type text,
  target_id   uuid,
  target_name text        not null default '',
  before      jsonb,
  after       jsonb,
  message     text        not null default '',
  visibility  text        not null default 'dm' check (visibility in ('all', 'dm')),
  undone      boolean     not null default false,
  created_at  timestamptz not null default now()
);

-- 감사 로그는 세션 로그와 분리한다.
create table if not exists public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid        references public.campaigns (id) on delete cascade,
  actor_id    uuid        references public.profiles (id) on delete set null,
  actor_name  text        not null default '',
  action      text        not null,
  target_type text,
  target_id   uuid,
  meta        jsonb       not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create table if not exists public.uploaded_files (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid        not null references public.campaigns (id) on delete cascade,
  owner_id      uuid        references public.profiles (id) on delete set null,
  bucket        text        not null default 'campaign-media',
  path          text        not null unique,
  mime_type     text        not null,
  size_bytes    bigint      not null check (size_bytes >= 0 and size_bytes <= 8 * 1024 * 1024),
  width         integer,
  height        integer,
  thumb_path    text,
  original_name text        not null default '',
  created_at    timestamptz not null default now(),
  constraint uploaded_files_mime_allowed
    check (mime_type in ('image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'))
);

create table if not exists public.deleted_items (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid        not null references public.campaigns (id) on delete cascade,
  entity_type text        not null,
  entity_id   uuid        not null,
  label       text        not null default '',
  payload     jsonb,
  deleted_by  uuid        references public.profiles (id) on delete set null,
  deleted_at  timestamptz not null default now(),
  purge_after timestamptz not null default now() + interval '30 days'
);

create table if not exists public.card_templates (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.campaigns (id) on delete cascade,
  name        text    not null,
  card_type   text    not null default 'custom',
  description text    not null default '',
  payload     jsonb   not null default '{}'::jsonb,
  is_system   boolean not null default false
);

-- AI 사용량 (속도 제한과 운영 모니터링용)
create table if not exists public.ai_usage (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid        not null references public.profiles (id) on delete cascade,
  campaign_id uuid        references public.campaigns (id) on delete set null,
  kind        text        not null default 'monster',
  tokens      integer     not null default 0,
  created_at  timestamptz not null default now()
);

-- ── 인덱스 ──────────────────────────────────────────────────────────
create index if not exists idx_campaign_members_user     on public.campaign_members (user_id);
create index if not exists idx_campaigns_owner           on public.campaigns (owner_id);
create index if not exists idx_sessions_campaign         on public.sessions (campaign_id, session_number desc);
create index if not exists idx_folders_campaign          on public.folders (campaign_id, sort_order);
create index if not exists idx_tags_campaign             on public.tags (campaign_id);
create index if not exists idx_cards_campaign_folder     on public.cards (campaign_id, folder_id);
create index if not exists idx_cards_campaign_scope      on public.cards (campaign_id, reveal_scope) where deleted_at is null;
create index if not exists idx_cards_campaign_updated    on public.cards (campaign_id, updated_at desc);
create index if not exists idx_cards_search              on public.cards using gin (search_tsv);
create index if not exists idx_card_tags_tag             on public.card_tags (tag_id);
create index if not exists idx_card_sections_card        on public.card_sections (card_id, sort_order);
create index if not exists idx_characters_campaign       on public.player_characters (campaign_id);
create index if not exists idx_characters_user           on public.player_characters (user_id);
create index if not exists idx_resources_character       on public.character_resources (character_id, sort_order);
create index if not exists idx_encounters_session        on public.encounters (session_id);
create index if not exists idx_combatants_encounter      on public.encounter_combatants (encounter_id, sort_order);
create index if not exists idx_conditions_combatant      on public.combatant_conditions (combatant_id);
create index if not exists idx_timers_session            on public.timers (session_id);
create index if not exists idx_dice_session              on public.dice_rolls (session_id, created_at desc);
create index if not exists idx_notifications_user        on public.notifications (user_id, read_at, created_at desc);
create index if not exists idx_session_logs_session      on public.session_logs (session_id, created_at desc);
create index if not exists idx_audit_logs_campaign       on public.audit_logs (campaign_id, created_at desc);
create index if not exists idx_uploaded_files_campaign   on public.uploaded_files (campaign_id, created_at desc);
create index if not exists idx_deleted_items_campaign    on public.deleted_items (campaign_id, deleted_at desc);
create index if not exists idx_ai_usage_user_time        on public.ai_usage (user_id, created_at desc);

-- ── 공통 트리거 ─────────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_campaigns_updated on public.campaigns;
create trigger trg_campaigns_updated before update on public.campaigns
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_cards_updated on public.cards;
create trigger trg_cards_updated before update on public.cards
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_characters_updated on public.player_characters;
create trigger trg_characters_updated before update on public.player_characters
  for each row execute function public.touch_updated_at();

-- 회원가입 시 프로필과 기본 설정을 생성한다.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(coalesce(new.email, '모험가'), '@', 1))
  )
  on conflict (id) do nothing;

  insert into public.user_preferences (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_auth_user_created on auth.users;
create trigger trg_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 캠페인을 만들면 만든 사람이 소유자 구성원이 된다.
create or replace function public.handle_new_campaign()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.campaign_members (campaign_id, user_id, role, permissions)
  values (
    new.id,
    new.owner_id,
    'owner',
    '{"view_assets":true,"edit_assets":true,"manage_combat":true,"manage_players":true,"manage_session":true,"use_ai":true,"manage_campaign":true}'::jsonb
  )
  on conflict (campaign_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_campaign_created on public.campaigns;
create trigger trg_campaign_created after insert on public.campaigns
  for each row execute function public.handle_new_campaign();

-- 참여 코드 자동 생성 (혼동하기 쉬운 문자 제외)
create or replace function public.generate_join_code()
returns text
language plpgsql
as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  result   text := '';
  i        integer;
begin
  for i in 1..6 loop
    result := result || substr(alphabet, floor(random() * length(alphabet))::int + 1, 1);
  end loop;
  return result;
end;
$$;

create or replace function public.set_join_code()
returns trigger
language plpgsql
as $$
declare
  candidate text;
  attempts  integer := 0;
begin
  if new.join_code is not null and new.join_code <> '' then
    return new;
  end if;
  loop
    candidate := public.generate_join_code();
    exit when not exists (select 1 from public.campaigns where join_code = candidate);
    attempts := attempts + 1;
    if attempts > 20 then
      raise exception '참여 코드를 생성하지 못했습니다.';
    end if;
  end loop;
  new.join_code := candidate;
  return new;
end;
$$;

drop trigger if exists trg_campaign_join_code on public.campaigns;
create trigger trg_campaign_join_code before insert on public.campaigns
  for each row execute function public.set_join_code();
