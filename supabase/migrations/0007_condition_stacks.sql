-- =====================================================================
-- 상태 효과 확장: 스택과 캠페인별 상태 라이브러리
--
-- 목적
-- 1. 보스 기믹처럼 누적되는 상태(예: 출혈 3, 파열 5)를 숫자로 추적한다.
-- 2. 캠페인마다 고유한 상태를 만들고, 플레이어도 그 설명을 조회할 수 있게 한다.
--
-- conditions 테이블의 RLS는 이미 "구성원은 읽기, 편집 권한자는 캠페인 상태만 쓰기"로
-- 되어 있으므로(0003_rls.sql) 정책은 바꾸지 않는다. 열만 추가한다.
-- =====================================================================

-- ── 적용된 상태에 스택 ──────────────────────────────────────────────
alter table public.combatant_conditions
  add column if not exists stacks integer not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'combatant_conditions_stacks_range'
  ) then
    alter table public.combatant_conditions
      add constraint combatant_conditions_stacks_range
      check (stacks between 0 and 999);
  end if;
end
$$;

-- ── 상태 라이브러리 확장 ────────────────────────────────────────────
alter table public.conditions
  add column if not exists is_stackable boolean not null default false;

alter table public.conditions
  add column if not exists color text;

alter table public.conditions
  add column if not exists sort_order integer not null default 0;

-- 배지 색은 화면 스타일에 직접 들어가므로 형식을 제한한다.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'conditions_color_format') then
    alter table public.conditions
      add constraint conditions_color_format
      check (color is null or color ~ '^#[0-9a-fA-F]{6}$');
  end if;
end
$$;

-- 캠페인 상태 목록을 자주 읽으므로 인덱스를 둔다.
create index if not exists idx_conditions_campaign
  on public.conditions (campaign_id, sort_order);
