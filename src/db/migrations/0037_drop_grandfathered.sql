-- Plans apply from the day they ship: the app isn't launched, so there is no
-- 90-day grace period and nothing to grandfather. 0034 added and backfilled
-- this flag before that was decided; dropping it here (rather than editing
-- 0034) keeps every database that already ran 0034 on the same history.
ALTER TABLE "workspaces" DROP COLUMN "grandfathered";
