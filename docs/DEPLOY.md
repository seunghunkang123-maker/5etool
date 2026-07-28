# 배포 안내

이 문서는 Arcanum Table을 운영 환경에 올리는 절차를 설명합니다.
로컬 실행과 Supabase 초기 설정은 [`README.md`](../README.md)를 먼저 보세요.

구성 요소는 세 가지입니다.

| 구성 요소 | 배포 대상 |
| --- | --- |
| 프론트엔드 (정적 파일) | Vercel / Netlify / Cloudflare Pages / S3+CloudFront 등 정적 호스팅 |
| 데이터베이스 · 인증 · 저장소 · 실시간 | Supabase 프로젝트 |
| Edge Function (`generate-monster`, `delete-account`) | Supabase Edge Functions |

---

## 1. Supabase 준비

### 1-1. 마이그레이션 적용

```bash
supabase link --project-ref <project-ref>
supabase db push
```

또는 대시보드 SQL Editor에서 `supabase/migrations/`의 파일을 번호 순서대로 실행합니다.

적용 후 확인:

```sql
-- 모든 public 테이블에 RLS가 켜져 있어야 한다. 결과가 0행이어야 정상.
select relname
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = false;
```

### 1-2. 인증 설정

- Authentication → Providers → **Email** 활성화, 이메일 확인 사용 권장
- Authentication → URL Configuration
  - Site URL: 배포 주소 (예: `https://table.example.com`)
  - Redirect URLs: `https://table.example.com/**`, 개발용으로 `http://localhost:5173/**`
- 비밀번호 재설정 메일의 링크는 앱의 `/reset-password`로 돌아옵니다.

### 1-3. Storage

`0004_storage.sql`이 두 버킷을 만들고 정책을 겁니다.

| 버킷 | 공개 | 크기 제한 | 허용 형식 |
| --- | --- | --- | --- |
| `campaign-media` | 비공개 (서명 URL로만 접근) | 8MB | png, jpeg, webp, gif, avif |
| `avatars` | 공개 읽기 | 2MB | png, jpeg, webp |

버킷이 이미 있다면 크기 제한과 허용 MIME 타입이 마이그레이션 값과 같은지 확인하세요.

업로드 경로 규칙은 `{campaign_id}/{uuid}.{ext}`입니다.
정책이 경로의 첫 번째 폴더 이름을 캠페인 id로 보고 구성원 여부를 확인하므로, 이 규칙을 바꾸면 안 됩니다.

### 1-4. 휴지통 자동 정리 (선택)

30일이 지난 휴지통 항목을 정리하려면 `pg_cron`으로 예약합니다.

```sql
create extension if not exists pg_cron;
select cron.schedule('purge-trash', '0 4 * * *', $$select public.purge_expired_trash()$$);
```

---

## 2. Edge Function 배포

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase secrets set ALLOWED_ORIGINS=https://table.example.com

supabase functions deploy generate-monster
supabase functions deploy delete-account
```

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`는 런타임이 자동으로 넣어 주므로 따로 설정하지 않습니다.
- `ALLOWED_ORIGINS`를 비워 두면 모든 출처를 허용합니다. **운영에서는 반드시 지정하세요.**
- 두 함수 모두 JWT 검증이 필요하므로 `--no-verify-jwt` 옵션을 쓰지 마세요.
- `ANTHROPIC_API_KEY`를 설정하지 않으면 AI 기능만 비활성화되고 나머지 기능은 정상 동작합니다.

배포 후 확인:

```bash
# 인증 없이 호출하면 401이어야 한다.
curl -i -X POST "https://<project-ref>.supabase.co/functions/v1/generate-monster" \
  -H "Content-Type: application/json" -d '{}'
```

---

## 3. 프론트엔드 배포

### 3-1. 환경 변수

빌드 시점에 주입되므로 호스팅 대시보드의 환경 변수에 등록합니다.

```dotenv
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

**`VITE_` 접두사가 붙은 값은 모두 클라이언트 번들에 포함됩니다.**
`ANTHROPIC_API_KEY`나 service_role 키에는 절대로 이 접두사를 붙이지 마세요.

### 3-2. 빌드

```bash
npm ci
npm run build      # dist/ 생성
```

| 설정 | 값 |
| --- | --- |
| Build command | `npm run build` |
| Output directory | `dist` |
| Node 버전 | 20 이상 |

### 3-3. SPA 라우팅

React Router를 쓰므로 모든 경로를 `index.html`로 넘겨야 합니다.

- **Vercel** — `vercel.json`

  ```json
  { "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
  ```

- **Netlify** — `public/_redirects`

  ```
  /*  /index.html  200
  ```

- **Nginx**

  ```nginx
  location / {
    try_files $uri $uri/ /index.html;
  }
  ```

### 3-4. 캐시 정책

- `index.html` — `no-cache` (새 배포가 즉시 반영되도록)
- `assets/*` — 파일 이름에 해시가 붙으므로 `public, max-age=31536000, immutable`

### 3-5. 권장 응답 헤더

```
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
X-Frame-Options: DENY
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

Content-Security-Policy를 적용한다면 Supabase 주소를 허용해야 합니다.

```
default-src 'self';
img-src 'self' data: blob: https://<project-ref>.supabase.co;
connect-src 'self' https://<project-ref>.supabase.co wss://<project-ref>.supabase.co;
style-src 'self' 'unsafe-inline';
font-src 'self' data:;
```

`wss:`를 빼면 실시간 동기화가 동작하지 않습니다.

---

## 4. 배포 전 점검 목록

- [ ] `npm run typecheck` · `npm run lint` · `npm run test` · `npm run build` 모두 통과
- [ ] `./supabase/test/run_checks.sh` 통과 (RLS 정책을 바꿨다면 필수)
- [ ] `npm run test:e2e` 통과
- [ ] 빌드 산출물에 비밀 키가 없는지 확인
      `grep -ri "service_role\|sk-ant" dist/` 결과가 비어 있어야 합니다
- [ ] 모든 `public` 테이블에 RLS가 켜져 있는지 확인 (위 SQL)
- [ ] `campaign-media` 버킷이 **비공개**이고 크기(8MB)·MIME 제한이 걸려 있는지 확인
      (`avatars`는 프로필 이미지용이라 공개 읽기가 의도된 설정입니다)
- [ ] Edge Function이 인증 없이 호출되면 401을 반환하는지 확인
- [ ] `ALLOWED_ORIGINS`가 배포 도메인으로 설정되어 있는지 확인
- [ ] Site URL / Redirect URL이 배포 도메인인지 확인
- [ ] 운영자 계정 지정 (`profiles.is_admin`)
- [ ] 백업 계획 확인 → [`BACKUP.md`](BACKUP.md)

---

## 5. 배포 후 확인

1. 회원가입 → 이메일 확인 → 로그인이 되는가
2. 캠페인 생성 → 참여 코드로 두 번째 계정 참여가 되는가
3. 세션을 시작하고 카드를 공개했을 때 플레이어 화면에 **몇 초 안에** 반영되는가
   (반영되지 않으면 CSP의 `wss:` 허용과 `supabase_realtime` 발행 대상을 확인하세요)
4. 이미지 업로드와 표시가 되는가
5. AI 몬스터 생성이 되는가 (키를 설정한 경우)
6. 플레이어 계정으로 로그인해 DM 전용 자료가 **보이지 않는지** 직접 확인

---

## 6. 롤백

프론트엔드는 호스팅의 이전 배포로 되돌리면 됩니다.

데이터베이스 마이그레이션은 자동 롤백이 없습니다.
스키마를 바꾸는 변경을 배포하기 전에는 [`BACKUP.md`](BACKUP.md)의 절차로 백업을 먼저 받으세요.
