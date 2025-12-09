-- Migration 117: Clean up duplicate Google Calendar events
-- Keeps the event with google_event_id set, or the oldest one if none have it

-- First, identify and delete duplicates where we have entries with and without google_event_id
DELETE FROM events e1
WHERE e1.google_event_id IS NULL
AND EXISTS (
  SELECT 1 FROM events e2
  WHERE e2.team_id = e1.team_id
  AND e2.title = e1.title
  AND DATE(e2.start_at) = DATE(e1.start_at)
  AND DATE(e2.end_at) = DATE(e1.end_at)
  AND e2.google_event_id IS NOT NULL
);

-- Then, for any remaining duplicates (same title + start date), keep only the oldest one
DELETE FROM events e1
WHERE e1.id NOT IN (
  SELECT MIN(id)
  FROM events
  GROUP BY team_id, title, DATE(start_at), DATE(end_at)
);
