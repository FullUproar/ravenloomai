-- Migration 009: Fix ravens_sent foreign key to cascade on delete
-- This allows projects to be deleted without foreign key constraint errors

-- Drop the existing foreign key constraint
ALTER TABLE ravens_sent
DROP CONSTRAINT IF EXISTS ravens_sent_project_id_fkey;

-- Add it back with ON DELETE CASCADE
ALTER TABLE ravens_sent
ADD CONSTRAINT ravens_sent_project_id_fkey
FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
