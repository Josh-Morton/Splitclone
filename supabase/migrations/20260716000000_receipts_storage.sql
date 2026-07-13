-- ============================================================================
-- Phase 5: receipt photos (scope §6.4 "Receipt photo [V1]").
--
-- Private bucket `receipts`; object paths are `<group_id>/<expense_id>.jpg`.
-- Access is gated by group membership via my_group_ids() (same boundary as
-- every table): only members of the group in the path can read/write/delete.
-- Clients view via short-lived signed URLs.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy receipts_select on storage.objects for select
  using (
    bucket_id = 'receipts'
    and ((storage.foldername(name))[1])::uuid in (select my_group_ids())
  );

create policy receipts_insert on storage.objects for insert
  with check (
    bucket_id = 'receipts'
    and ((storage.foldername(name))[1])::uuid in (select my_group_ids())
  );

create policy receipts_update on storage.objects for update
  using (
    bucket_id = 'receipts'
    and ((storage.foldername(name))[1])::uuid in (select my_group_ids())
  );

create policy receipts_delete on storage.objects for delete
  using (
    bucket_id = 'receipts'
    and ((storage.foldername(name))[1])::uuid in (select my_group_ids())
  );
