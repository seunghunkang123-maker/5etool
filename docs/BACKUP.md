# 백업 · 복구 · 데이터 삭제 요청

이 문서는 운영자가 알아야 할 데이터 관리 절차를 정리합니다.
운영자 화면(`/admin`)에서 이 문서를 안내하고 있습니다.

백업 대상은 세 가지입니다.

| 대상 | 내용 | 도구 |
| --- | --- | --- |
| PostgreSQL | 캠페인·카드·세션·로그 등 모든 구조화 데이터 | `pg_dump` 또는 Supabase 자동 백업 |
| Storage | 업로드한 이미지·핸드아웃 | Supabase CLI / S3 호환 클라이언트 |
| 인증 정보 | `auth.users` (이메일, 해시된 비밀번호) | Supabase 자동 백업 |

> 비밀번호 원문은 어디에도 저장되어 있지 않습니다. `auth.users`에는 해시만 있습니다.

---

## 1. 정기 백업

### 1-1. Supabase 자동 백업

유료 플랜에서는 대시보드 → Database → Backups에서 일 단위 백업이 제공됩니다.
무료 플랜이라면 아래 수동 절차를 정기 작업으로 걸어 두세요.

### 1-2. 데이터베이스 수동 백업

```bash
# 연결 문자열은 대시보드 → Project Settings → Database에서 확인
export PGURL="postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres"

# 전체 덤프 (스키마 + 데이터)
pg_dump "$PGURL" \
  --no-owner --no-privileges \
  --schema=public --schema=auth --schema=storage \
  -Fc -f "backup-$(date +%Y%m%d).dump"
```

`-Fc`(custom format)로 받아 두면 특정 테이블만 골라 복구할 수 있습니다.

데이터만 필요하면:

```bash
pg_dump "$PGURL" --no-owner --no-privileges --schema=public --data-only \
  -Fc -f "data-$(date +%Y%m%d).dump"
```

### 1-3. Storage 백업

```bash
supabase storage download --recursive ss://campaign-media ./backup/campaign-media
supabase storage download --recursive ss://avatars ./backup/avatars
```

Storage 파일과 `public.uploaded_files` 행은 짝을 이룹니다.
한쪽만 복구하면 앱에서 깨진 이미지가 보이므로 **항상 같은 시점의 것을 함께 보관**하세요.

### 1-4. 보관 권장값

| 주기 | 보관 기간 |
| --- | --- |
| 매일 | 7일 |
| 매주 | 4주 |
| 매월 | 6개월 |

백업 파일에는 개인정보(이메일)와 캠페인 내용이 들어 있습니다.
암호화된 저장소에 두고 접근 권한을 제한하세요.

---

## 2. 복구

### 2-1. 전체 복구

```bash
# 주의: 기존 데이터를 지웁니다. 반드시 새 프로젝트나 스테이징에서 먼저 검증하세요.
pg_restore --clean --if-exists --no-owner --no-privileges -d "$PGURL" backup-20260101.dump
```

복구 후 확인:

```sql
-- RLS가 꺼진 테이블이 없어야 한다 (결과 0행)
select relname from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = false;

-- 정책 개수 확인
select count(*) from pg_policies where schemaname = 'public';
```

정책이 사라졌다면 `supabase/migrations/0003_rls.sql`과 `0006_grants.sql`을 다시 적용하세요.

### 2-2. 특정 테이블만 복구

```bash
pg_restore --data-only --table=cards --table=card_sections --table=monster_stats \
  --no-owner -d "$PGURL" backup-20260101.dump
```

외래 키 때문에 순서가 중요합니다. `campaigns` → `folders`/`tags` → `cards` → `card_*` 순으로 복구하세요.

### 2-3. 캠페인 하나만 되살리기

전체 복구가 부담스러우면 앱의 내보내기/가져오기를 씁니다.

1. 백업을 스테이징 데이터베이스에 복구
2. 스테이징 앱에서 해당 캠페인을 **JSON으로 내보내기**
3. 운영 앱에서 **가져오기** (덮어쓰기 방식 선택)

이 방법으로는 카드·폴더·태그·스탯·섹션이 복구됩니다.
세션 기록과 로그는 포함되지 않습니다.

### 2-4. 휴지통에서 복구

삭제된 캠페인·폴더·카드는 30일 동안 `deleted_items`에 남습니다.
사용자가 직접 앱의 **휴지통** 화면에서 되돌릴 수 있으므로, 백업 복구 전에 먼저 확인하세요.

```sql
select entity_type, label, deleted_at, purge_after
from public.deleted_items
where campaign_id = '<campaign-id>'
order by deleted_at desc;
```

---

## 3. 데이터 삭제 요청 처리

사용자가 계정·데이터 삭제를 요청했을 때의 절차입니다.

### 3-1. 사용자가 직접 하는 경우

설정 화면의 **계정 삭제**를 쓰면 `delete-account` Edge Function이 처리합니다.

- 소유 중인 캠페인이 있으면 삭제가 거부됩니다.
  먼저 캠페인을 삭제하거나 다른 사람에게 소유권을 넘겨야 합니다.
- `auth.users` 행이 지워지면 `profiles`가 연쇄 삭제되고,
  그에 딸린 설정·캐릭터·알림도 함께 정리됩니다.

### 3-2. 운영자가 처리하는 경우

```sql
-- 1) 대상 확인
select id, email, created_at from auth.users where email = 'user@example.com';

-- 2) 소유 캠페인 확인 (있으면 사용자와 처리 방법을 먼저 합의)
select id, name from public.campaigns where owner_id = '<user-id>';

-- 3) 남은 흔적 확인 — 표시 이름이 남는 로그
select count(*) from public.session_logs where actor_id = '<user-id>';
```

`session_logs.actor_id`와 `audit_logs.actor_id`는 `on delete set null`입니다.
사용자를 지워도 로그 행 자체는 남고 행위자만 비게 됩니다.
로그까지 지워야 한다면 삭제 전에 별도로 처리하세요.

```sql
-- 4) 삭제 (service_role 권한 필요)
delete from auth.users where id = '<user-id>';
```

### 3-3. 처리 기록

삭제 요청은 **누가, 언제, 무엇을 요청했고, 언제 처리했는지**를 앱 밖(운영 티켓 등)에 남기세요.
삭제된 계정의 정보는 앱 안에 남기지 않는 것이 원칙입니다.

---

## 4. 휴지통 자동 정리

30일이 지난 휴지통 항목을 지우는 함수가 있습니다.

```sql
select public.purge_expired_trash();
```

`pg_cron`으로 매일 실행하려면:

```sql
create extension if not exists pg_cron;
select cron.schedule('purge-trash', '0 4 * * *', $$select public.purge_expired_trash()$$);
```

이 정리는 되돌릴 수 없습니다. 정리 주기보다 백업 주기가 짧아야 안전합니다.

---

## 5. 점검 주기

| 항목 | 주기 |
| --- | --- |
| 백업이 실제로 만들어지는지 확인 | 매주 |
| **복구 리허설** (스테이징에 복구해 보기) | 분기 1회 |
| 백업 보관소 접근 권한 검토 | 분기 1회 |
| Storage와 `uploaded_files` 정합성 확인 | 분기 1회 |

복구를 해 본 적 없는 백업은 백업이 아닙니다. 분기마다 한 번은 실제로 되살려 보세요.
