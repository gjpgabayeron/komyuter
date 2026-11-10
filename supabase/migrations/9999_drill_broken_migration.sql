-- M4 rollback Drill 1 (staging only) — deliberately invalid SQL.
--
-- This file exists to prove that a failing pre-deploy blocks the deployment and
-- applies nothing: `supabase db push` must fail on this statement before the new
-- container serves. It is a drill artifact and is deleted in the next commit;
-- `docs/ROLLBACK.md` §Drill 1 is the procedure and the rule that no drill
-- migration reaches `main`.
THIS STATEMENT IS INTENTIONALLY INVALID;
