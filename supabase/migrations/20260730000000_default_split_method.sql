-- ============================================================================
-- Per-Tally default split method (Phase 12).
--
-- Each Tally ("group") gets a default split method that pre-selects in the
-- Add-expense sheet. Purely a form default — the segmented control stays
-- fully interactive, and the existing "salary split falls back to equal when
-- a participant has no salary" rule is untouched.
--
-- Constrained to the three methods actually surfaced in the UI. 'percent' and
-- 'shares' exist in the split_method enum and in the domain layer but were
-- deliberately never exposed (see docs/BACKLOG.md design-fidelity note), so
-- they're excluded here rather than silently allowed as a default nobody can
-- pick.
-- ============================================================================

alter table "group"
  add column default_split_method split_method not null default 'equal';

alter table "group"
  add constraint group_default_split_method_supported
  check (default_split_method in ('equal', 'exact', 'salary'));
