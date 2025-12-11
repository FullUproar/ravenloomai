-- Workflow Personas - User role-based UI customization
-- Run: DATABASE_URL="$DB_POSTGRES_URL" node run-migration.js migrations/126_workflow_personas.sql

-- Add workflow_persona column to user_feature_flags
-- Personas determine default nav structure and feature visibility
ALTER TABLE user_feature_flags
ADD COLUMN IF NOT EXISTS workflow_persona VARCHAR(32) DEFAULT 'contributor';

-- Valid personas:
-- 'contributor' - Individual contributor focus (tasks, goals, personal productivity)
-- 'team_lead' - Team coordination (tasks, team view, workload)
-- 'project_manager' - Project delivery (projects, Gantt, milestones, dependencies)
-- 'executive' - Strategic oversight (goals/OKRs, dashboards, high-level metrics)

COMMENT ON COLUMN user_feature_flags.workflow_persona IS
'User workflow persona: contributor, team_lead, project_manager, executive';

-- Create index for potential filtering
CREATE INDEX IF NOT EXISTS idx_feature_flags_persona ON user_feature_flags(workflow_persona);
