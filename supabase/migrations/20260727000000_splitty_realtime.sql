-- ============================================================================
-- Splitty realtime (Phase 8 follow-up): add the split_* tables to the
-- supabase_realtime publication so postgres_changes actually fires for guests.
--
-- Without this, subscribeSplitBill() sets up listeners that never receive
-- anything — cross-user sync only happened when the receiving client made its
-- own change (and refetched). This is the free, standard fix (same mechanism
-- shopping_item already uses). Default replica identity is sufficient: the
-- filter (bill_id / id) is a stable column present in the new row on UPDATE,
-- exactly like shopping_item's group_id filter.
-- ============================================================================

alter publication supabase_realtime add table split_bill;
alter publication supabase_realtime add table split_guest;
alter publication supabase_realtime add table split_item;
