# 캠페인 도우미 — TRPG 세션 운영 도구

던전 앤 드래곤 5판을 중심으로 한 **웹 기반 TRPG 세션 운영 애플리케이션**입니다.
캐릭터 시트 도구가 아니라, **던전 마스터(DM)가 캠페인 자료·몬스터·NPC·전투·핸드아웃을 관리하고
필요한 정보만 골라서 플레이어에게 실시간으로 공개**하는 것을 목표로 합니다.

기본 언어는 한국어입니다.

---

## 목차

1. [무엇을 할 수 있나](#무엇을-할-수-있나)
2. [빠르게 실행하기 (데모 모드)](#빠르게-실행하기-데모-모드)
3. [Supabase 연결하기 (운영 모드)](#supabase-연결하기-운영-모드)
4. [Edge Function 배포 (AI·계정 삭제)](#edge-function-배포-ai계정-삭제)
5. [Vercel에 배포하기](#vercel에-배포하기)
6. [환경 변수](#환경-변수)
7. [npm 스크립트와 검증](#npm-스크립트와-검증)
8. [샘플 데이터](#샘플-데이터)
9. [관리자 계정 설정](#관리자-계정-설정)
10. [프로젝트 구조](#프로젝트-구조)
11. [보안 설계 요약](#보안-설계-요약)
12. [접근성](#접근성)
13. [키보드 단축키](#키보드-단축키)
14. [문서](#문서)
15. [알려진 제약](#알려진-제약)

---

## 무엇을 할 수 있나

| 영역 | 내용 |
| --- | --- |
| 역할 | DM / 공동 DM(7가지 세부 권한) / 플레이어 / 관전자 |
| 캠페인 | 생성·수정·복제·보관·휴지통 삭제, 참여 코드, 초대, 내보내기/가져오기 |
| 세션 | 6가지 상태, 4패널 운영 화면(데스크톱) + 하단 탭(모바일), 종료 시 자동 요약 |
| 자료 카드 | 13종 카드(몬스터·NPC·지도·장소·아이템·주문·퀘스트·핸드아웃 등), 폴더·태그·일괄 작업 |
| 공개 범위 | 비공개 / 이름만 / 이미지만 / 부분 공개(항목별) / 전체 공개 + 일시 공개 + 특정 플레이어 지정 |
| 몬스터·NPC | 5판 스탯블록 전체, 능력 수정치 `floor((점수-10)/2)`, 부상 5단계 표시 |
| 전투 | 인카운터, 이니셔티브(동점 규칙·자동 라운드 증가), 5판 상태이상 + 사용자 정의, 6가지 지속 시간 |
| 상태 도감 | 상태 배지를 누르면 효과 설명이 열린다. 플레이어도 조회 가능. **캠페인 전용 상태를 DM이 직접 추가**하고, 보스 기믹용 **스택(누적 수치)** 을 추적한다 |
| HP | 임시 HP 우선 차감·0 미만 없음·최대치 초과 회복 없음, 광역 피해(전체/절반/무효/직접 입력), 되돌리기 |
| 집중 | 피해 시 DC `max(10, floor(피해/2))` 자동 안내 |
| 타이머 | 카운트다운·스톱워치, 공유/비공개. **매초 DB에 쓰지 않고 종료 예정 시각으로부터 계산** |
| 주사위 | `d20`, `2d6`, `1d20+5`, `4d6-2`, `2d20kh1`, `2d20kl1` 표기, 4단계 공개 수준 |
| AI | 콘셉트를 넣으면 몬스터 초안 생성 → **DM이 검토한 뒤 저장**. API 키는 서버에만 존재 |
| 개인 설정 | 프로필 이미지, 표시 이름, 밝은/어두운/시스템 테마, 글자 크기, 3단계 밀도, 애니메이션 줄이기, 알림 채널 |
| 캠페인 외형 | 캠페인마다 강조 색상을 지정하면 그 캠페인에 있는 동안 앱 강조 색이 바뀐다 |
| 기타 | 통합 검색, 이미지/핸드아웃 업로드, 리치 텍스트(공개 영역 / DM 전용 영역), 세션 로그·되돌리기, 감사 로그, 알림 |

---

## 빠르게 실행하기 (데모 모드)

Supabase 계정 없이도 전체 기능을 바로 볼 수 있습니다.
환경 변수가 비어 있으면 앱은 **데모 모드**로 실행되고, 모든 데이터는 브라우저 저장소에 보관됩니다.

```bash
npm install
npm run dev          # http://localhost:5173
```

1. `회원가입`으로 계정을 하나 만듭니다. (DM 역할)
2. 캠페인을 만들고 참여 코드를 확인합니다.
3. **다른 탭**에서 같은 주소를 열고 두 번째 계정으로 가입한 뒤 참여 코드로 들어갑니다.
   데모 모드의 로그인 정보는 탭마다(`sessionStorage`) 따로 유지되므로, 브라우저 하나로 DM과 플레이어를 동시에 볼 수 있습니다.
4. 세션을 시작하고 자료를 공개해 보면 다른 탭에 실시간으로 반영됩니다.

> 데모 모드는 개발·시연·자동화 테스트용입니다. 권한 규칙은 흉내 내지만 **보안 경계가 아닙니다.**
> 실제 보안 경계는 Supabase의 RLS 정책입니다.

---

## Supabase 연결하기 (운영 모드)

### 1) 프로젝트 만들기

[supabase.com](https://supabase.com)에서 프로젝트를 만들고 **Project URL**과 **anon(publishable) 키**를 복사합니다.
anon 키는 공개되어도 안전한 키이며, 실제 접근 제어는 RLS가 담당합니다.
**service_role 키는 절대로 프론트엔드에 넣지 마세요.**

### 2) 환경 변수 설정

```bash
cp .env.example .env.local
```

```dotenv
VITE_SUPABASE_URL="https://<project-ref>.supabase.co"
VITE_SUPABASE_ANON_KEY="<anon key>"
```

### 3) 마이그레이션 적용

`supabase/migrations/`의 SQL을 **번호 순서대로** 적용합니다.

Supabase CLI를 쓰는 경우:

```bash
supabase link --project-ref <project-ref>
supabase db push
```

대시보드를 쓰는 경우 SQL Editor에서 아래 순서로 실행합니다.

| 파일 | 내용 |
| --- | --- |
| `0001_schema.sql` | 테이블·인덱스·제약·트리거 |
| `0002_functions.sql` | 권한 확인 함수, 공개 범위 뷰, 서버 측 RPC |
| `0003_rls.sql` | 모든 테이블의 RLS 정책, 실시간 발행 대상 |
| `0004_storage.sql` | Storage 버킷과 정책 |
| `0005_seed_conditions.sql` | 5판 기본 상태이상, 기본 카드 템플릿 |
| `0006_grants.sql` | 역할별 GRANT, 운영 전용 열 보호 |
| `0007_condition_stacks.sql` | 상태 효과 스택, 캠페인 전용 상태 라이브러리 |

### 4) 인증 설정

Supabase 대시보드 → Authentication에서:

- **Email** 공급자를 켭니다. (이메일 확인 사용 권장)
- Site URL과 Redirect URL에 배포 주소와 `http://localhost:5173`을 등록합니다.
- 비밀번호 재설정 링크는 앱의 `/reset-password` 경로로 돌아옵니다.
- OAuth(Google 등)를 추가하려면 대시보드에서 공급자만 켜면 됩니다. 앱 코드는 그대로 동작합니다.

### 5) 데이터베이스 검증 (선택)

로컬 PostgreSQL 14 이상이 있으면 마이그레이션과 RLS 정책을 실제로 검증할 수 있습니다.

```bash
./supabase/test/run_checks.sh
```

이 스크립트는 임시 데이터베이스를 만들고 `auth`·`storage` 스키마를 흉내 낸 뒤 마이그레이션을 모두 적용하고,
`supabase/test/rls_checks.sql`의 검사를 실행합니다. 검사에는 다음이 포함됩니다.

- 플레이어는 `cards`·`monster_stats`를 직접 읽지 못한다
- 플레이어는 카드나 공개 범위를 바꾸지 못하고, 세션·전투를 조작하지 못한다
- `이름만`·`부분 공개`는 정확히 지정한 항목만 노출한다
- `dm_notes`는 어떤 공개 범위에서도 플레이어에게 가지 않는다
- 특정 플레이어 지정 공개는 대상이 아닌 사람에게 보이지 않는다
- 서버 측 HP 계산(임시 HP 우선, 최대치 제한, 0 미만 없음)이 정확하다
- DM 전용 주사위·로그가 플레이어에게 보이지 않는다
- 사용자는 스스로 `is_admin`을 켜거나 이용 정지를 해제할 수 없다
- 이용이 정지된 계정은 캠페인과 공개 자료에 접근할 수 없다
- 가져오기는 폴더 계층·태그·스탯·섹션을 복원하고, 가져온 카드는 항상 비공개다
- 참여하지 않은 캠페인은 목록에도 나타나지 않는다

---

## Edge Function 배포 (AI·계정 삭제)

두 개의 Edge Function이 있습니다. 둘 다 서버 전용 비밀 키가 필요해서 브라우저에서 직접 호출할 수 없는 작업입니다.

| 함수 | 역할 |
| --- | --- |
| `generate-monster` | Anthropic Messages API를 호출해 몬스터 초안을 생성 |
| `delete-account` | 사용자가 요청한 자기 계정 삭제 (`auth.users` 삭제는 service_role 권한 필요) |

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase functions deploy generate-monster
supabase functions deploy delete-account
```

`generate-monster`가 하는 일:

1. `Authorization` 헤더의 JWT로 사용자를 확인합니다.
2. 데이터베이스 함수 `has_campaign_permission(campaign_id, 'use_ai')`로 권한을 **다시** 확인합니다.
   화면에서 버튼을 숨기는 것에 의존하지 않습니다.
3. 입력 길이를 제한합니다. (설명 1500자, 요청 본문 16KB)
4. `ai_usage` 테이블을 기준으로 사용자당 시간당 호출 횟수를 제한합니다. (기본 20회)
5. `claude-opus-5` 모델에 JSON 스키마를 지정해 구조화된 응답을 받고, 타임아웃(기본 90초)을 겁니다.
6. 응답을 스키마로 검증·정규화한 뒤 돌려줍니다. 저장은 DM이 화면에서 확인한 다음에 이루어집니다.
7. 실패 시 한국어 메시지만 반환하고, 프롬프트 원문이나 키는 로그에 남기지 않습니다.

`ANTHROPIC_API_KEY`를 설정하지 않으면 AI 기능만 비활성화되고 나머지는 정상 동작합니다.

---

## Vercel에 배포하기

프론트엔드는 순수 정적 파일이라 Vercel에 그대로 올라갑니다.
빌드 명령·출력 폴더·SPA 라우팅·캐시·보안 헤더는 저장소의 **`vercel.json`에 이미 들어 있으므로**
대시보드에서 설정할 것은 환경 변수 두 개뿐입니다.

```bash
npm i -g vercel
vercel link
vercel env add VITE_SUPABASE_URL production        # https://<project-ref>.supabase.co
vercel env add VITE_SUPABASE_ANON_KEY production   # anon(publishable) 키
vercel --prod
```

배포 주소가 정해지면 Supabase에도 알려 줘야 로그인과 AI 호출이 동작합니다.

```bash
supabase secrets set ALLOWED_ORIGINS=https://<프로젝트>.vercel.app
supabase functions deploy generate-monster         # 시크릿 반영을 위해 재배포
```

Supabase 대시보드 → Authentication → URL Configuration에 Site URL과
Redirect URL(`https://<프로젝트>.vercel.app/**`)을 등록합니다.
이 설정을 빠뜨리면 가입 확인 메일과 비밀번호 재설정 링크가 `localhost`로 돌아갑니다.

> 환경 변수를 넣지 않아도 배포는 성공합니다. 다만 앱이 **데모 모드**로 뜨고
> 데이터가 브라우저에만 저장됩니다. 운영 배포라면 반드시 두 값을 넣으세요.

자세한 절차와 배포 전 점검 목록은 [`docs/DEPLOY.md`](docs/DEPLOY.md)에 있습니다.

---

## 환경 변수

`.env.example`을 참고하세요.

| 이름 | 위치 | 설명 |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | 클라이언트 | Supabase 프로젝트 URL. 비우면 데모 모드 |
| `VITE_SUPABASE_ANON_KEY` | 클라이언트 | anon(publishable) 키. 공개되어도 안전 |
| `VITE_FORCE_DEMO` | 클라이언트 | `"true"`이면 강제로 데모 모드 (E2E 테스트용) |
| `ANTHROPIC_API_KEY` | **Edge Function 시크릿** | AI 생성용 키. 클라이언트 번들에 절대 포함되지 않음 |
| `AI_MODEL` | Edge Function | 기본값 `claude-opus-5` |
| `AI_RATE_LIMIT_PER_HOUR` | Edge Function | 사용자당 시간당 호출 제한. 기본 20 |
| `AI_TIMEOUT_MS` | Edge Function | 외부 API 타임아웃. 기본 90000 |
| `ALLOWED_ORIGINS` | Edge Function | CORS 허용 출처(쉼표 구분). 운영에서는 반드시 지정 |

`VITE_` 접두사가 붙은 값만 클라이언트 번들에 포함됩니다. 서버 비밀 키에는 절대 이 접두사를 붙이지 마세요.

---

## npm 스크립트와 검증

| 명령 | 설명 |
| --- | --- |
| `npm run dev` | 개발 서버 |
| `npm run build` | 타입 검사 후 프로덕션 빌드 |
| `npm run preview` | 빌드 결과 미리보기 (포트 4173) |
| `npm run typecheck` | `tsc -b` (strict + `noUncheckedIndexedAccess`) |
| `npm run lint` | ESLint (경고도 실패로 취급) |
| `npm run test` | Vitest 단위·컴포넌트 테스트 |
| `npm run test:e2e` | Playwright E2E (데모 모드로 실행) |

### 마지막 실행 결과

이 저장소에서 실제로 실행한 결과입니다.

```
npm run typecheck   통과 (오류 0)
npm run lint        통과 (경고 0)
npm run test        24개 파일 / 284개 테스트 통과
npm run build       통과 (코드 분할된 청크로 빌드)
npm run test:e2e    3개 시나리오 통과 (전체 세션 흐름 / 설정 화면 / 상태 도감)
./supabase/test/run_checks.sh
                    마이그레이션 6개 적용 + RLS 검사 전부 통과
정적 빌드 스모크   통과 — dist/를 Vercel과 같은 방식(파일 우선, 없으면 index.html)으로
                    서빙하고 실제 브라우저로 가입 → 캠페인 생성 → 딥 링크 새로고침 →
                    카드 생성까지 확인. 콘솔 오류 없음.
```

E2E는 미리 설치된 Chromium을 사용합니다. 브라우저 경로가 다르면 다음과 같이 지정합니다.

```bash
PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e
```

---

## 샘플 데이터

`docs/sample/sample-campaign.json`에 예제 캠페인(“잊혀진 등대의 서약”)이 들어 있습니다.
폴더 4개, 태그 4개, 카드 8개(몬스터 3종은 스탯블록과 행동까지 포함)로 구성되어 있습니다.

가져오는 방법:

1. 캠페인 → **캠페인 설정** → *데이터* 영역의 **가져오기**
2. `docs/sample/sample-campaign.json` 선택
3. 미리보기에서 항목 수를 확인하고 가져오기 방식(건너뛰기 / 덮어쓰기 / 복사본)을 고릅니다.

가져온 카드는 **항상 비공개 상태**로 들어옵니다. 실수로 스포일러가 공개되지 않도록 하기 위한 규칙이며,
클라이언트와 서버(`import_campaign_data`) 양쪽에서 동일하게 강제됩니다.

---

## 관리자 계정 설정

운영자 화면(`/admin`)은 `profiles.is_admin`이 `true`인 계정에게만 보입니다.
이 값은 **사용자가 스스로 바꿀 수 없습니다.** `0006_grants.sql`에서 열 단위 GRANT로 막혀 있습니다.

먼저 앱에서 평범하게 회원가입한 뒤, Supabase 대시보드의 SQL Editor에서 실행합니다.

```sql
update public.profiles set is_admin = true where email = 'admin@example.com';
```

계정 이용을 정지하려면:

```sql
update public.profiles set is_suspended = true where email = 'abuser@example.com';
```

정지된 계정은 로그인은 되지만 어떤 캠페인·자료에도 접근할 수 없습니다.
이 차단은 화면이 아니라 데이터베이스 함수(`is_active_user()`)에서 이루어집니다.

---

## 프로젝트 구조

```
src/
  components/ui/     디자인 시스템 (Button, Dialog, Field, Toast, ConfirmDialog …)
  data/
    types.ts         엔티티 타입과 한국어 라벨
    repository.ts    저장소 인터페이스 (어댑터 경계)
    supabase/        운영 어댑터 — Supabase
    local/           데모 어댑터 — 브라우저 저장소
  domain/            순수 로직 (부수 효과 없음, 단위 테스트 대상)
                     abilities, hp, dice, initiative, conditions, concentration,
                     timer, reveal, permissions, sanitize, search, monsterSchema
  features/          화면 단위 기능 (auth, campaigns, library, session, combat,
                     timers, dice, characters, settings, admin, ai)
  hooks/             queries, useRealtime, useAutosave, useShortcuts, useTick
  stores/            auth, preferences (Zustand)
supabase/
  config.toml        Supabase CLI 설정 (link · db push · functions deploy)
  migrations/        스키마 · 함수 · RLS · Storage · 시드 · GRANT
  functions/         Edge Function (generate-monster, delete-account)
  test/              로컬 PostgreSQL 검증 하네스
e2e/                 Playwright 시나리오
docs/                설계 문서, 배포·백업 안내, 샘플 데이터
vercel.json          Vercel 빌드 · SPA 라우팅 · 캐시 · 보안 헤더
```

핵심은 `src/data/repository.ts`의 **어댑터 경계**입니다.
화면은 저장소 구현을 알지 못하고, 같은 인터페이스를 Supabase와 데모 어댑터가 각각 구현합니다.
덕분에 Supabase 없이도 전체 흐름을 E2E로 검증할 수 있습니다.

---

## 보안 설계 요약

자세한 내용은 [`docs/DESIGN.md` §7](docs/DESIGN.md)에 있습니다.

- **비밀번호는 이 앱의 데이터베이스에 저장되지 않습니다.** 인증은 Supabase Auth가 담당합니다.
- **권한은 화면이 아니라 데이터베이스에서 결정됩니다.** 버튼을 숨기는 것은 편의일 뿐이고,
  모든 중요한 작업은 RLS 정책 또는 `SECURITY DEFINER` 함수에서 다시 검증됩니다.
- 플레이어는 `cards` 테이블을 직접 읽을 수 없습니다. `player_visible_cards` 뷰를 통해
  **공개 범위에 따라 허용된 열만** 볼 수 있습니다. 허용 목록 방식이라 새 열이 생겨도 기본은 비공개입니다.
- `dm_notes`는 어떤 공개 범위에서도 플레이어 쪽 결과에 포함되지 않습니다.
- 업로드는 캠페인 구성원 여부·크기·MIME 타입을 확인하고, 저장 파일 이름을 난수로 바꿉니다.
  확장자만 믿지 않습니다.
- 리치 텍스트는 DOMPurify로 정화한 뒤 저장·표시합니다.
- AI 키는 Edge Function 시크릿에만 존재하며, 호출에는 인증·권한 확인·입력 길이 제한·횟수 제한·타임아웃이 걸려 있습니다.
- 로그에는 민감한 내용(프롬프트 원문, 토큰, 키)을 남기지 않습니다.
- 낙관적 잠금(`version` 열)으로 동시 수정 충돌을 감지하고, 사용자에게 비교 후 선택하게 합니다.

---

## 접근성

WCAG 2.1 AA를 목표로 만들었습니다.

- 모든 기능을 키보드만으로 사용할 수 있고, 포커스 표시가 항상 보입니다.
- 아이콘만 있는 버튼에도 접근 가능한 이름이 있습니다.
- 정보를 색으로만 전달하지 않습니다. (예: 부상 단계는 색 + 텍스트 + 아이콘)
- 다이얼로그는 포커스를 가두고 Escape로 닫히며, 열기 전 위치로 포커스를 돌려줍니다.
- 오류 메시지는 해당 입력란과 연결되어 스크린 리더가 함께 읽습니다.
- `prefers-reduced-motion`을 존중합니다.
- 타이머 종료 등 소리로 알리는 상황에는 시각적 표시가 함께 나옵니다.
- **브라우저 기본 `alert`·`confirm`·`prompt`를 사용하지 않습니다.** 토스트와 접근 가능한 다이얼로그로 대체했습니다.

---

## 키보드 단축키

입력란에 글을 쓰는 중에는 단일 키 단축키가 동작하지 않습니다. `?`로 목록을 열 수 있습니다.

| 키 | 동작 |
| --- | --- |
| `Ctrl`/`Cmd` + `K` | 통합 검색 |
| `Ctrl`/`Cmd` + `S` | 현재 카드 저장 |
| `N` | 새 카드 |
| `T` | 타이머 패널 (타이머가 없으면 바로 만들기) |
| `I` | 이니셔티브 — 다음 턴 버튼으로 이동 |
| `Space` | 타이머 시작 / 일시 정지 |
| `Ctrl`/`Cmd` + `Enter` | 선택한 자료 공개 |
| `?` | 단축키 도움말 |
| `Esc` | 다이얼로그 닫기 |

---

## 문서

| 문서 | 내용 |
| --- | --- |
| [`docs/DESIGN.md`](docs/DESIGN.md) | 제품 구조, 사용자 흐름, 권한표, 데이터 모델, 보안 구조, 구현 단계 |
| [`docs/DEPLOY.md`](docs/DEPLOY.md) | 배포 절차와 배포 전 점검 목록 |
| [`docs/BACKUP.md`](docs/BACKUP.md) | 백업·복구·데이터 삭제 요청 처리 |
| [`docs/sample/sample-campaign.json`](docs/sample/sample-campaign.json) | 예제 캠페인 데이터 |

---

## 알려진 제약

정직하게 적어 둡니다.

- **Edge Function은 이 환경에서 실행 검증을 하지 못했습니다.** Deno 런타임과 Supabase 프로젝트가 없어서,
  타입 검사(Deno 전역과 supabase-js를 스텁으로 대체)와 코드 리뷰까지만 마쳤습니다.
  실제 Anthropic API 호출은 배포 후 확인이 필요합니다.
- Supabase에 연결한 상태의 E2E는 실행하지 않았습니다. E2E는 데모 어댑터로 동작합니다.
  대신 서버 측 규칙은 로컬 PostgreSQL에 마이그레이션을 그대로 적용해 SQL 수준에서 검증했습니다.
- PDF 내보내기는 브라우저 인쇄(`window.print()`) 기반입니다. 별도 PDF 엔진을 쓰지 않습니다.
- 규칙 모듈은 D&D 5판과 범용 두 가지가 구현되어 있습니다. 캠페인 생성 화면에서 고를 수 있는
  Pathfinder 2판·크툴루의 부름 7판은 범용 규칙으로 동작합니다.
  `src/domain/systems/index.ts`의 `SystemModule` 인터페이스를 구현하면 전용 모듈을 추가할 수 있습니다.
