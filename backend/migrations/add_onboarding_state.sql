-- Add onboarding state tracking to projects

-- Simple JSON column to track onboarding progress
ALTER TABLE projects ADD COLUMN IF NOT EXISTS onboarding_state JSONB DEFAULT NULL;

-- Example onboarding_state structure:
-- {
--   "stage": "persona_selection" | "preferences" | "success_criteria" | "blocker_identification" | "complete",
--   "domain": "health_fitness" | "business_entrepreneurship" | "financial" | "creative_technical" | "learning_education" | "personal_development" | "general",
--   "collected": {
--     "personaPreference": "supportive",
--     "verbosity": "balanced",
--     "currentWeight": 350,
--     "targetWeight": 330,
--     "targetDate": "2025-06-22"
--   },
--   "userIsReturning": false
-- }

-- Add index for querying onboarding state
CREATE INDEX IF NOT EXISTS idx_projects_onboarding_state ON projects USING GIN (onboarding_state);

COMMENT ON COLUMN projects.onboarding_state IS 'Tracks conversational onboarding progress - stage, domain, and collected data';
