-- Allows multiple crew members on one visit (big jobs, 2+ people) --
-- 017_add_visit_assignments.sql originally made jobber_visit_id itself
-- the primary key, which only allowed one assignee per visit. Switching
-- to a composite key on (jobber_visit_id, assigned_user_id) so a visit
-- can have any number of assignment rows.
--
-- Run this once in the Supabase SQL editor (Project vasskxstyvshfiwgpuxj -> SQL Editor).

alter table visit_assignments drop constraint if exists visit_assignments_pkey;
alter table visit_assignments add primary key (jobber_visit_id, assigned_user_id);
