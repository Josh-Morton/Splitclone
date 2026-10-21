-- ============================================================================
-- Avatar photos (backlog: "Avatar photos — add-photo affordance").
--
-- profile.avatar_url already exists and is already exposed to co-members by
-- profile_public (whose WHERE clause limits it to yourself + people you share
-- an active Tally with — see 20260828000000_fix_profile_public_leak.sql). This
-- adds somewhere to put the image.
--
-- PUBLIC bucket, deliberately. Each file lives at
--   avatars/<user_id>/<random uuid>.jpg
-- so a URL is unguessable, and the only way to learn one is to be shown it by
-- profile_public — i.e. to share a Tally with that person. Public means avatars
-- load straight from the CDN with no per-render signed-URL round trip (they
-- appear in every member list). The trade-off, stated in the privacy page: a
-- link, once someone has it, opens the photo.
--
-- Writes are locked to your own folder. SELECT is granted on your own folder
-- only because Storage's delete endpoint reads the row before removing it;
-- public reads go through the CDN and don't consult these policies.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists avatars_select on storage.objects;
drop policy if exists avatars_insert on storage.objects;
drop policy if exists avatars_update on storage.objects;
drop policy if exists avatars_delete on storage.objects;

create policy avatars_select on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy avatars_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy avatars_update on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy avatars_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
