#!/usr/bin/env bash
# 로컬 PostgreSQL에 마이그레이션을 적용하고 RLS 검사를 실행한다.
#
#   ./supabase/test/run_checks.sh
#
# 필요: PostgreSQL 14 이상. PGDATABASE 환경 변수로 대상 DB를 바꿀 수 있다.
set -euo pipefail

DB="${PGDATABASE:-arcanum_test}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

echo "▶ 테스트 데이터베이스를 다시 만듭니다: $DB"
dropdb --if-exists "$DB"
createdb "$DB"

echo "▶ 부트스트랩(auth/storage 흉내)"
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$ROOT/supabase/test/bootstrap_local.sql"

for file in "$ROOT"/supabase/migrations/*.sql; do
  echo "▶ 마이그레이션 적용: $(basename "$file")"
  psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$file"
done

echo "▶ RLS 검사 실행"
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$ROOT/supabase/test/rls_checks.sql"
