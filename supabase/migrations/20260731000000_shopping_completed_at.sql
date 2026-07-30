-- ============================================================================
-- Shopping list: record when an item was crossed off (Phase 13).
--
-- `created_at` already records when an item was added; this records when it
-- was bought, so the "Sorted" section can show both dates. Nullable: null
-- means "still to buy". Cleared back to null if an item is un-checked.
--
-- Existing checked rows stay null — we can't know retroactively when they
-- were ticked, and inventing a timestamp would be worse than showing none.
-- The UI renders the bought date only when it's present.
--
-- No change needed to the Phase 9 push trigger (shopping_item_checked_push):
-- it fires on the `checked` false->true transition, which is untouched.
-- ============================================================================

alter table shopping_item add column completed_at timestamptz;
