-- Migration 008: Add Visual Fields to Personas
-- Adds color and shape fields for persona avatars

ALTER TABLE personas
ADD COLUMN IF NOT EXISTS color VARCHAR(7) DEFAULT '#3B82F6',
ADD COLUMN IF NOT EXISTS shape VARCHAR(10) DEFAULT 'circle';

-- Update existing personas with default values
UPDATE personas
SET color = '#3B82F6'
WHERE color IS NULL;

UPDATE personas
SET shape = 'circle'
WHERE shape IS NULL;

CREATE INDEX IF NOT EXISTS idx_personas_color ON personas(color);

COMMENT ON COLUMN personas.color IS 'Hex color code for persona avatar (e.g., #3B82F6)';
COMMENT ON COLUMN personas.shape IS 'Avatar shape: circle or square';
