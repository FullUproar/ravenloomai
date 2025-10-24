/**
 * Database Migration Runner - Migration 002
 *
 * Fixes the projects table by removing obsolete domain column.
 */

import dotenv from 'dotenv';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

// Create database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function runMigration() {
  console.log('🔄 Starting database migration 002...\\n');

  try {
    // Read migration file
    const migrationPath = path.join(__dirname, 'migrations', '002_fix_projects_table.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('📄 Running migration: 002_fix_projects_table.sql');

    // Execute migration
    await pool.query(migrationSQL);

    console.log('\\n✅ Migration completed successfully!');
    console.log('\\nChanges:');
    console.log('  - Removed domain column from projects table');
    console.log('  - Ensured all persona-related columns exist');

  } catch (error) {
    console.error('\\n❌ Migration failed:', error.message);
    console.error('\\nFull error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run migration
runMigration();
