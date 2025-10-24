/**
 * Database Migration Runner
 *
 * Runs the persona system migration.
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
  console.log('🔄 Starting database migration...\n');

  try {
    // Read migration file
    const migrationPath = path.join(__dirname, 'migrations', '001_add_personas.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('📄 Running migration: 001_add_personas.sql');

    // Execute migration
    await pool.query(migrationSQL);

    console.log('\n✅ Migration completed successfully!');
    console.log('\nTables created/updated:');
    console.log('  - personas');
    console.log('  - conversations');
    console.log('  - conversation_messages');
    console.log('  - projects (enhanced)');
    console.log('  - tasks (enhanced)');
    console.log('  - triggers (enhanced)');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run migration
runMigration();
