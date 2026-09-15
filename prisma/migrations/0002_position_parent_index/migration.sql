-- Cover the self-referencing hierarchy FK (LeadershipPosition.parentId)
-- flagged by the Supabase linter as an unindexed foreign key.
CREATE INDEX "LeadershipPosition_parentId_idx" ON "LeadershipPosition"("parentId");
