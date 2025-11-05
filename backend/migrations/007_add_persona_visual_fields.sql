-- Migration 007: Add Visual Fields to Personas
-- Adds color and shape fields for persona avatars

ALTER TABLE personas
ADD COLUMN IF NOT EXISTS color VARCHAR(7) DEFAULT '#3B82F6',
ADD COLUMN IF NOT EXISTS shape VARCHAR(10) DEFAULT 'circle';

-- Update existing personas with default color
UPDATE personas
SET color = '#3B82F6', shape = 'circle'
WHERE color IS NULL OR shape IS NULL;

CREATE INDEX IF NOT EXISTS idx_personas_color ON personas(color);
