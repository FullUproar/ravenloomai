-- Migration 007: Enhanced multi-persona support
-- Adds fields and tables for persona switching and persona roles

-- Add persona role and switching fields
ALTER TABLE personas ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'primary';
ALTER TABLE personas ADD COLUMN IF NOT EXISTS switch_triggers JSONB DEFAULT '[]';
ALTER TABLE personas ADD COLUMN IF NOT EXISTS availability_schedule JSONB DEFAULT NULL;
ALTER TABLE personas ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Create persona_switches table to track when personas are activated
CREATE TABLE IF NOT EXISTS persona_switches (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  from_persona_id INTEGER REFERENCES personas(id) ON DELETE SET NULL,
  to_persona_id INTEGER NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
  trigger_type VARCHAR(50) NOT NULL, -- 'manual', 'automatic', 'scheduled', 'context'
  trigger_reason TEXT,
  switched_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  switched_by VARCHAR(50) -- 'user', 'system', 'ai'
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_persona_switches_project_id ON persona_switches(project_id);
CREATE INDEX IF NOT EXISTS idx_persona_switches_to_persona ON persona_switches(to_persona_id);
CREATE INDEX IF NOT EXISTS idx_persona_switches_switched_at ON persona_switches(switched_at);

-- Update personas table comments
COMMENT ON COLUMN personas.role IS 'Role of persona: primary (main), specialist (domain expert), advisor (occasional), mentor (guidance)';
COMMENT ON COLUMN personas.switch_triggers IS 'Conditions that auto-activate this persona (e.g., task type, time of day, keywords)';
COMMENT ON COLUMN personas.availability_schedule IS 'When this persona is available (e.g., working hours, specific days)';
COMMENT ON COLUMN personas.active IS 'Whether this persona is currently active for the project';
COMMENT ON COLUMN personas.deactivated_at IS 'When this persona was deactivated (if inactive)';

COMMENT ON TABLE persona_switches IS 'Tracks persona switching events for analytics and context';
