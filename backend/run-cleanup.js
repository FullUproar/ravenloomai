// Quick script to run the duplicate cleanup migration
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const connectionString = process.env.DB_POSTGRES_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL;
const db = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function cleanup() {
  console.log('🧹 Cleaning up duplicate calendar events...');

  // First, identify and delete duplicates where we have entries with and without google_event_id
  const result1 = await db.query(`
    DELETE FROM events e1
    WHERE e1.google_event_id IS NULL
    AND EXISTS (
      SELECT 1 FROM events e2
      WHERE e2.team_id = e1.team_id
      AND e2.title = e1.title
      AND DATE(e2.start_at) = DATE(e1.start_at)
      AND DATE(e2.end_at) = DATE(e1.end_at)
      AND e2.google_event_id IS NOT NULL
    )
  `);
  console.log(`  Deleted ${result1.rowCount} events without google_event_id that had duplicates with google_event_id`);

  // Then, for any remaining duplicates (same title + start date), keep only the oldest one
  // Since id is UUID, we use created_at to find the oldest and select its id via DISTINCT ON
  const result2 = await db.query(`
    DELETE FROM events e1
    WHERE e1.id NOT IN (
      SELECT DISTINCT ON (team_id, title, DATE(start_at), DATE(end_at)) id
      FROM events
      ORDER BY team_id, title, DATE(start_at), DATE(end_at), created_at ASC
    )
  `);
  console.log(`  Deleted ${result2.rowCount} remaining duplicate events`);

  console.log('✅ Cleanup complete!');

  await db.end();
}

cleanup().catch(err => {
  console.error('❌ Cleanup failed:', err);
  process.exit(1);
});
