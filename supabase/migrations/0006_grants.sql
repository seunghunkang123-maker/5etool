-- =====================================================================
-- 권한 부여
--
-- RLS가 켜져 있어야 의미가 있다. GRANT는 "어떤 테이블에 접근을 시도할 수 있는가"만 정하고,
-- 실제 행 단위 접근 여부는 0003_rls.sql의 정책이 결정한다.
-- =====================================================================

grant usage on schema public to anon, authenticated;

-- 익명 사용자는 어떤 데이터에도 접근하지 못한다.
revoke all on all tables in schema public from anon;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- 감사 로그는 애플리케이션이 직접 쓰지 못하게 한다(SECURITY DEFINER 함수만 기록).
revoke insert, update, delete on public.audit_logs from authenticated;

-- 프로필의 운영 전용 열은 사용자가 바꿀 수 없어야 한다.
-- RLS는 "어떤 행"만 정하고 "어떤 열"은 정하지 못하므로, 열 단위 GRANT로 막는다.
-- 이렇게 하지 않으면 사용자가 스스로 is_admin을 켜거나 이용 정지를 해제할 수 있다.
revoke update on public.profiles from authenticated;
grant update (display_name, avatar_url, locale) on public.profiles to authenticated;

-- 프로필 행 생성/삭제도 트리거(handle_new_user)와 auth 연쇄 삭제에만 맡긴다.
revoke insert, delete on public.profiles from authenticated;

-- 이후 만들어질 객체에도 같은 기본 권한을 적용한다.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant usage, select on sequences to authenticated;
alter default privileges in schema public
  grant execute on functions to authenticated;
