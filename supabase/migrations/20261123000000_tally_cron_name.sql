-- ============================================================================
-- Rename the daily recurring-bills cron job from its SettleUp-era name.
--
-- pg_cron can't rename a job, so unschedule the old one (by id, so this is a
-- no-op where it's already gone) and schedule the same command at the same
-- time under the new name: 04:15 UTC daily, as in 20260714000000.
-- ============================================================================

select cron.unschedule(jobid) from cron.job where jobname = 'settleup-recurring-daily';
select cron.schedule('tally-recurring-daily', '15 4 * * *', $$select process_due_recurring()$$);
