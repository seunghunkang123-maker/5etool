# 캠페인 도우미 — 제품 설계 문서

TRPG(기본 D&D 5e) 세션 운영 도구. 던전 마스터(DM)가 캠페인 자료·전투·플레이어 정보를
통합 관리하고, 필요한 정보만 실시간으로 공개하는 것이 핵심이다.

---

## 1. 설계 원칙

1. **서버가 진실의 원천이다.** 공개 범위(reveal scope)와 권한은 UI가 아니라 DB(RLS)와
   서버 함수에서 강제한다. 프론트엔드의 필터링은 UX일 뿐 보안 경계가 아니다.
2. **비공개가 기본값이다.** 카드는 생성 시 `hidden`. 플레이어에게 노출되는 모든 필드는
   화이트리스트 방식(`projectCardForViewer`)으로 통과시킨다.
3. **규칙은 순수 함수다.** HP·이니셔티브·집중·상태 효과·주사위는 `src/domain/`의 부수효과
   없는 모듈이며, UI/DB와 독립적으로 단위 테스트한다. D&D 5e 규칙은 `SystemModule`
   인터페이스 뒤에 두어 다른 시스템을 추가할 수 있게 한다.
4. **데이터 접근은 어댑터 뒤에 둔다.** UI는 `Repository` 인터페이스에만 의존한다.
   구현체는 두 개다 — Supabase(운영), 로컬(데모/테스트).
5. **전투 중 속도가 최우선이다.** 피해·회복·다음 턴은 목록에서 1~2클릭. 낙관적 업데이트 +
   실패 시 롤백.

---

## 2. 핵심 사용자 흐름

### DM 흐름 (주 경로)
```
회원가입/로그인 → 대시보드 → 캠페인 생성 → 참여 코드 발급 → 자료 준비(폴더/카드/이미지)
  → 세션 생성 → 세션 시작 → [운영 화면]
      ├─ 자료 검색 → 카드 공개(공개 범위 선택) → 플레이어 화면에 실시간 반영
      ├─ 전투 생성 → 참가자 추가 → 이니셔티브 굴림 → 전투 시작
      │    → 피해/회복 → 상태 효과 → 집중 확인 → 다음 턴 → 라운드 증가
      ├─ 타이머 시작 → 플레이어 공유
      └─ 세션 노트 작성
  → 세션 종료 → 자동 요약 + 로그 확인
```

### 플레이어 흐름
```
회원가입/로그인 → 참여 코드 입력 or 초대 수락 → 캠페인 참여 → 캐릭터 시트 작성
  → 세션 시작 알림 → [플레이어 화면]
      ├─ 공개된 핸드아웃/카드 확인 (실시간)
      ├─ 내 캐릭터 HP·자원 관리
      ├─ 이니셔티브/현재 차례 확인 (내 차례 시 강조 알림)
      ├─ 파티 상태판 확인
      ├─ 공유 타이머 확인
      └─ 주사위 굴리기 (공개 범위 선택)
```

### 관전자 흐름
공개 카드 + 이니셔티브 + 타이머만 읽기 전용으로 확인.

---

## 3. 페이지 목록

| 경로 | 화면 | 접근 |
|---|---|---|
| `/login`, `/signup`, `/reset-password`, `/auth/callback` | 인증 | 비로그인 |
| `/` | 대시보드 (최근/진행 중/예정 세션, 초대, 참여 코드 입력) | 로그인 |
| `/settings` | 프로필·테마·밀도·알림 설정 | 로그인 |
| `/campaigns/new` | 캠페인 생성 | 로그인 |
| `/campaigns/:id` | 캠페인 개요 (세션 목록, 구성원, 상태) | 구성원 |
| `/campaigns/:id/library` | 자료 보관함 (폴더 트리·태그·검색·카드 목록) | DM/공동DM (플레이어는 공개분만) |
| `/campaigns/:id/library/:cardId` | 카드 편집기 | 편집 권한 |
| `/campaigns/:id/characters` | 캐릭터 목록 / 내 캐릭터 시트 | 구성원 |
| `/campaigns/:id/members` | 구성원·권한·초대·참여 코드 | 소유자/관리 권한 |
| `/campaigns/:id/settings` | 캠페인 설정, 내보내기/가져오기, 보관/삭제 | 소유자 |
| `/campaigns/:id/sessions/:sid` | **세션 운영 화면** (역할에 따라 DM/플레이어 뷰 분기) | 참가자 |
| `/campaigns/:id/sessions/:sid/recap` | 세션 요약·로그 | 참가자(범위 제한) |
| `/admin` | 운영자 화면 | `profiles.is_admin` |
| `/join/:code` | 참여 코드 진입 | 로그인 |

레이아웃: `AppShell`(상단바 + 콘텐츠) / `SessionShell`(4분할 패널, 모바일은 하단 탭).

---

## 4. 역할별 권한표

`R`=읽기, `W`=쓰기, `-`=불가, `*`=세부 권한 플래그로 제어

| 기능 | 소유 DM | 공동 DM | 플레이어 | 관전자 |
|---|---|---|---|---|
| 캠페인 삭제/복원 | W | - | - | - |
| 캠페인 설정 변경 | W | `*manage_campaign` | - | - |
| 구성원 초대/퇴장/권한 | W | `*manage_players` | - | - |
| 폴더/카드 열람(비공개 포함) | R | `*view_assets` | - | - |
| 카드 생성/편집/삭제 | W | `*edit_assets` | 자기 캐릭터 카드만 | - |
| 카드 공개 범위 변경 | W | `*edit_assets` | - | - |
| 공개된 카드 열람 | R | R | R(공개 필드만) | R(공개 필드만) |
| 세션 생성/시작/종료 | W | `*manage_session` | - | - |
| 전투 생성/진행/HP/상태효과 | W | `*manage_combat` | 자기 캐릭터 HP만 | - |
| 이니셔티브 제출 | W | `*manage_combat` | 자기 것만 | - |
| 타이머 관리 | W | `*manage_combat` | R(공유분) | R(공유분) |
| 주사위 굴리기 | W | W | W | - |
| 캐릭터 시트 편집 | 전원 | `*edit_assets` | 자기 것만 | - |
| AI 몬스터 생성 | W | `*use_ai` | - | - |
| 세션 로그 전체 열람 | R | `*view_assets` | 공개 이벤트만 | - |
| 감사 로그 | R | - | - | - |
| 데이터 내보내기/가져오기 | W | `*manage_campaign` | - | - |

세부 권한 플래그(`campaign_members.permissions` JSONB):
`view_assets, edit_assets, manage_combat, manage_players, manage_session, use_ai, manage_campaign`

### 공개 범위(reveal scope)

| 값 | 플레이어에게 보이는 것 |
|---|---|
| `hidden` | 카드 존재 자체 없음 |
| `name_only` | 이름 + 유형 |
| `image_only` | 이름 + 대표 이미지 |
| `partial` | `reveal_fields` 화이트리스트에 포함된 필드만 |
| `full` | 공개 가능한 전체 (DM 전용 메모 제외) |

`is_temporary=true`면 현재 세션 종료 시 `previous_scope`로 자동 복귀.
`reveal_targets`가 비어 있지 않으면 지정된 플레이어에게만 공개.

**DM 전용 메모(`dm_notes`)와 `stats`의 비공개 필드는 어떤 scope에서도 자동 노출되지 않는다.**

---

## 5. 데이터 모델

```
profiles(id→auth.users, display_name, avatar_url, locale, is_admin, ...)
user_preferences(user_id, theme, density, font_scale, panel_layout, notification_prefs)

campaigns(id, owner_id, name, description, system, cover_url, theme_color,
          status, join_policy, join_code, max_players, is_mature, party_visibility,
          deleted_at, created_at, updated_at)
campaign_members(campaign_id, user_id, role[owner|co_dm|player|spectator],
                 permissions jsonb, joined_at)   PK(campaign_id,user_id)
campaign_invites(id, campaign_id, email, role, token, status, expires_at)

sessions(id, campaign_id, title, session_number, scheduled_at, started_at, ended_at,
         status, description, cover_url, summary jsonb, deleted_at)
session_participants(session_id, user_id, joined_at, left_at, is_online)

folders(id, campaign_id, parent_id, name, color, icon, sort_order, deleted_at)
tags(id, campaign_id, name, color)   UNIQUE(campaign_id, name)
cards(id, campaign_id, folder_id, type, name, summary, body jsonb, image_url,
      reveal_scope, reveal_fields text[], reveal_targets uuid[], is_temporary_reveal,
      previous_scope, is_favorite, is_archived, sort_order, dm_notes,
      created_by, version, deleted_at, created_at, updated_at,
      search_tsv tsvector GENERATED)
card_tags(card_id, tag_id)  PK(card_id, tag_id)
card_sections(id, card_id, kind[trait|action|bonus|reaction|legendary|mythic|lair|regional|spell],
              name, description, sort_order)
monster_stats(card_id PK, size, type, alignment, cr, proficiency_bonus, xp, ac, ac_note,
              hp, max_hp, temp_hp, hit_dice, speeds jsonb, abilities jsonb, saves jsonb,
              skills jsonb, resistances/immunities/vulnerabilities/condition_immunities text[],
              senses, passive_perception, languages, spellcasting_ability)

player_characters(id, campaign_id, user_id, name, class, subclass, level, race,
                  background, alignment, xp, image_url, description,
                  ac, hp, max_hp, temp_hp, speed, proficiency_bonus, initiative_bonus,
                  passive_perception, inspiration, abilities jsonb, saves jsonb,
                  skills jsonb, death_saves jsonb, sheet jsonb, share_settings jsonb, version)
character_resources(id, character_id, name, current, max, recharge[short|long|none], sort_order)

encounters(id, session_id, campaign_id, name, status, round, active_combatant_id,
           turn_started_at, tiebreak_rule, version)
encounter_combatants(id, encounter_id, source_type, source_card_id, character_id,
                     name, image_url, initiative, initiative_tiebreak, dex_mod, dex_score,
                     hp, max_hp, temp_hp, ac, is_hidden, is_defeated, is_concentrating,
                     concentration_note, dm_notes, sort_order)
conditions(id, campaign_id NULLABLE /*NULL=시스템 기본*/, key, name, icon, description)
combatant_conditions(id, combatant_id, condition_id, custom_name, started_round,
                     duration_rounds, duration_mode, expires_at_round, source_user_id,
                     linked_concentration, is_public)

timers(id, session_id, name, description, kind[countdown|stopwatch], duration_seconds,
       ends_at, paused_remaining_ms, state[idle|running|paused|finished],
       is_shared, end_message, created_by)

dice_rolls(id, session_id, campaign_id, user_id, expression, detail jsonb, total,
           purpose, visibility[all|dm|self|dm_secret], created_at)
handout_reveals(id, session_id, card_id, revealed_by, scope, targets uuid[], revealed_at, hidden_at)
notifications(id, user_id, campaign_id, session_id, type, title, body, data jsonb,
              read_at, created_at)
session_logs(id, session_id, campaign_id, actor_id, event_type, target_type, target_id,
             before jsonb, after jsonb, visibility, created_at)
audit_logs(id, campaign_id, actor_id, action, target_type, target_id, meta jsonb, created_at)
uploaded_files(id, campaign_id, owner_id, bucket, path, mime_type, size_bytes,
               width, height, thumb_path, original_name)
deleted_items(id, campaign_id, entity_type, entity_id, payload jsonb, deleted_by,
              deleted_at, purge_after)   -- 휴지통
card_templates(id, campaign_id NULLABLE, name, card_type, payload jsonb, is_system)
ai_usage(id, user_id, campaign_id, kind, tokens, created_at)   -- 속도 제한/사용량
```

동시 수정 충돌: `cards`, `player_characters`, `encounters`에 `version integer`를 두고
`UPDATE ... WHERE id=$1 AND version=$2` 형태로 낙관적 잠금 → 0행이면 충돌 오류(409).

인덱스: 모든 FK, `cards(campaign_id, folder_id)`, `cards(campaign_id, reveal_scope)`,
`cards USING GIN(search_tsv)`, `session_logs(session_id, created_at DESC)`,
`notifications(user_id, read_at)`, `campaigns(join_code) UNIQUE`.

---

## 6. 실시간 동기화 대상

Supabase Realtime(Postgres 변경 스트림)을 세션 단위 채널로 구독한다.

| 채널 | 테이블/이벤트 | 구독자 |
|---|---|---|
| `session:{id}:cards` | `cards` UPDATE(공개 범위) , `handout_reveals` | 전원 |
| `session:{id}:encounter` | `encounters`, `encounter_combatants`, `combatant_conditions` | 전원 |
| `session:{id}:timers` | `timers` | 전원(공유분만 RLS 통과) |
| `session:{id}:dice` | `dice_rolls` INSERT | 가시성에 따라 |
| `session:{id}:presence` | Presence(접속 상태) | 전원 |
| `user:{id}:notifications` | `notifications` INSERT | 본인 |

원칙:
- 이벤트는 **증분**으로 React Query 캐시에 반영한다(전체 재조회 금지).
- 재연결 시에만 해당 쿼리를 `invalidate`하여 전체 재동기화.
- 타이머는 `ends_at`(절대 시각)만 저장하고 클라이언트가 계산한다 → 매초 DB 쓰기 없음,
  새로고침·백그라운드 탭에서도 정확.
- 여러 탭/기기: 서버 상태가 유일한 진실. 낙관적 업데이트는 실패 시 롤백.

---

## 7. 보안 구조

```
브라우저 ──anon key──► Supabase (RLS 강제) ──► PostgreSQL
    │
    └──JWT──► Edge Function (AI 생성) ──service role/AI key(서버 전용)──► AI API
```

- 인증: Supabase Auth(이메일+비밀번호, 이메일 인증, 비밀번호 재설정, OAuth 확장 가능).
  비밀번호는 앱 DB에 저장하지 않는다.
- 인가: 모든 테이블 RLS 활성화. 헬퍼 함수
  `is_campaign_member(cid)`, `can(cid, 'edit_assets')`, `is_campaign_dm(cid)`를
  `SECURITY DEFINER`로 정의해 정책 재귀를 피한다.
- 플레이어의 카드 접근: `cards` 테이블 직접 SELECT는 DM/공동DM만 허용.
  플레이어는 **뷰 `player_visible_cards`**(공개 범위에 따라 필드를 마스킹)만 조회한다.
  → 비공개 필드가 애초에 네트워크로 나가지 않는다.
- 업로드: 버킷 `campaign-media`(비공개). 경로 `{campaign_id}/{uuid}.{ext}` 무작위 이름.
  Storage 정책이 경로 첫 세그먼트를 캠페인 구성원 자격과 대조. MIME/용량 클라이언트 +
  정책 양쪽 검증.
- XSS: 리치 텍스트는 TipTap JSON으로 저장하고, HTML로 렌더링할 때 DOMPurify로 정화.
  붙여넣기 HTML도 저장 전 정화.
- 비밀 키: AI 키는 Edge Function 환경 변수에만 존재. 클라이언트 번들에는 anon key만.
- 속도 제한: `ai_usage` 기반 사용자별 시간당 호출 제한, 입력 길이 제한, 타임아웃.
- 감사 로그: 권한 변경·삭제·가져오기·공개 범위 변경 등은 `audit_logs`에 분리 기록.
- 운영 전용 열 보호: RLS는 "어떤 행"만 정하고 "어떤 열"은 정하지 못한다.
  `profiles.is_admin`과 `profiles.is_suspended`는 **열 단위 GRANT**로 막아
  사용자가 스스로 운영자가 되거나 이용 정지를 해제할 수 없게 한다(`0006_grants.sql`).
- 이용 정지: 모든 캠페인 권한 함수가 `is_active_user()`를 먼저 확인한다.
  정지된 계정은 화면이 아니라 데이터베이스에서 차단된다.

---

## 8. 디렉터리 구조

```
src/
  domain/          순수 규칙 (부수효과 없음, 100% 단위 테스트)
    abilities.ts hp.ts initiative.ts conditions.ts concentration.ts
    dice.ts timer.ts reveal.ts sanitize.ts monsterSchema.ts systems/
  data/            데이터 접근 추상화
    types.ts repository.ts
    local/         로컬 어댑터(데모/E2E, localStorage + BroadcastChannel 실시간)
    supabase/      Supabase 어댑터(postgrest + realtime + storage)
  features/        기능 단위 UI
    auth/ dashboard/ campaigns/ library/ cards/ characters/
    session/ combat/ timers/ dice/ notifications/ settings/ admin/
  components/ui/   디자인 시스템 프리미티브 (Dialog, Toast, Button, ...)
  hooks/ stores/ lib/ styles/
supabase/
  migrations/      0001_schema → 0005_seed_conditions
  functions/generate-monster/
e2e/               Playwright 시나리오
docs/              설계·보안·배포·백업 문서
```

---

## 9. 기능 우선순위 / 구현 단계

| 단계 | 범위 | 상태 |
|---|---|---|
| 1 | 설계 문서, 데이터 모델, 권한표 | ✅ |
| 2 | 프로젝트 초기화, 인증, 라우팅, 레이아웃, 스키마+RLS, 프로필, 캠페인 생성/참여 | ✅ |
| 3 | 폴더, 태그, 카드, 이미지 업로드, 리치 텍스트, 공개 범위, 검색 | ✅ |
| 4 | 세션, 캐릭터 시트, 전투, 이니셔티브, HP, 상태 효과, 집중, 타이머, 주사위 | ✅ |
| 5 | 실시간(카드/HP/이니셔티브/타이머/알림), 연결 복구 | ✅ |
| 6 | AI 몬스터 생성, 템플릿, 내보내기/가져오기, 세션 요약, 감사 로그, 오프라인 임시 저장 | ✅ |
| 7 | 타입 검사, 린트, 단위/컴포넌트/E2E 테스트, 프로덕션 빌드, 접근성 | ✅ |

후속(미구현, 확장 지점만 마련): 지도 핀·전장의 안개, 브라우저 푸시, PDF 내보내기,
외부 D&D 데이터 가져오기, 고급 3-way 병합.

---

## 10. 데모 모드 (Supabase 없이 실행)

`VITE_SUPABASE_URL`이 비어 있으면 앱은 **로컬 어댑터**로 부팅한다.
- 데이터: `localStorage`(네임스페이스 `arcanum:*`)
- 실시간: `BroadcastChannel`로 같은 브라우저의 탭 간 동기화
- 인증: 로컬 계정(비밀번호는 저장하지 않고 세션 토큰만 보관)
- AI 생성: 결정적 목(mock) 생성기

이 모드 덕분에 E2E 테스트와 UI 검증이 외부 인프라 없이 실행된다.
운영 배포에서는 반드시 Supabase 어댑터를 사용한다(§7 보안 구조가 적용되는 쪽).
