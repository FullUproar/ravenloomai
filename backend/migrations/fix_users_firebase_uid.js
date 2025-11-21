import db from '../db.js';

async function runMigration() {
  try {
    console.log('🔧 Adding missing firebase_uid column to users table...');

    // Add firebase_uid column if it doesn't exist
    await db.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS firebase_uid TEXT UNIQUE;
    `);

    console.log('✅ Migration complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
