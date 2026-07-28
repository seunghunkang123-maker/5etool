-- =====================================================================
-- 로컬 검증용 부트스트랩
--
-- Supabase가 기본 제공하는 스키마(auth, storage)와 역할을 흉내 낸다.
-- 이 파일은 Supabase 프로젝트에 적용하지 않는다. 마이그레이션 검증 전용이다.
--   psql -f supabase/test/bootstrap_local.sql
--   psql -f supabase/migrations/0001_schema.sql ... (순서대로)
-- =====================================================================

create extension if not exists "pgcrypto";

-- 역할
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end
$$;

create schema if not exists auth;
create schema if not exists storage;

create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

-- 요청 컨텍스트의 사용자 id (Supabase의 auth.uid()와 같은 역할)
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean not null default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz not null default now()
);

create table if not exists storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets (id) on delete cascade,
  name       text not null,
  owner      uuid,
  created_at timestamptz not null default now()
);

alter table storage.objects enable row level security;

create or replace function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
  select string_to_array(name, '/');
$$;

grant usage on schema auth, storage, public to anon, authenticated, service_role;
