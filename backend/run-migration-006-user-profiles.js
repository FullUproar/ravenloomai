/**
 * Run Migration 006: User Profile System
 *
 * Adds users table, Google OAuth, available_names, persona_names, etc.
 */

import 'dotenv/config';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function runMigration() {
  const client = await pool.connect();

  try {
    console.log('🔄 Running migration 006: User Profile System...');

    // Read migration file
    const migrationPath = path.join(__dirname, 'migrations', '006_add_user_profile_system.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Execute migration
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');

    console.log('✅ Migration 006 completed successfully');
    console.log('   - Created users table with Google OAuth support');
    console.log('   - Created available_names table');
    console.log('   - Created persona_names table (unique name ownership)');
    console.log('   - Created sessions table');
    console.log('   - Created email_verification_tokens table');
    console.log('   - Created password_reset_tokens table');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration().catch(err => {
  console.error(err);
  process.exit(1);
});
