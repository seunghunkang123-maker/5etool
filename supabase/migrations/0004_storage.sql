-- =====================================================================
-- Storage 버킷과 정책
--
-- 버킷은 비공개이며, 경로의 첫 세그먼트(캠페인 id)로 접근을 통제한다.
--   경로 형식: {campaign_id}/{uuid}.{ext}
-- 파일 이름은 클라이언트에서 무작위 UUID로 생성한다(원본 이름은 메타데이터로만 보관).
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'campaign-media',
  'campaign-media',
  false,
  8388608, -- 8MB
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 캠페인 구성원은 자료를 볼 수 있다.
drop policy if exists campaign_media_select on storage.objects;
create policy campaign_media_select on storage.objects for select to authenticated
  using (
    bucket_id = 'campaign-media'
    and public.is_campaign_member(((storage.foldername(name))[1])::uuid)
  );

-- 업로드는 자료 편집 권한이 있는 사용자만.
drop policy if exists campaign_media_insert on storage.objects;
create policy campaign_media_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'campaign-media'
    and public.can_edit_assets(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists campaign_media_update on storage.objects;
create policy campaign_media_update on storage.objects for update to authenticated
  using (
    bucket_id = 'campaign-media'
    and public.can_edit_assets(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'campaign-media'
    and public.can_edit_assets(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists campaign_media_delete on storage.objects;
create policy campaign_media_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'campaign-media'
    and public.can_edit_assets(((storage.foldername(name))[1])::uuid)
  );

-- 프로필 이미지 버킷 (공개 읽기, 본인만 쓰기)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists avatars_read on storage.objects;
create policy avatars_read on storage.objects for select to authenticated, anon
  using (bucket_id = 'avatars');

drop policy if exists avatars_write on storage.objects;
create policy avatars_write on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_delete on storage.objects;
create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
