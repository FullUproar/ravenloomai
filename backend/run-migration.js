/**
 * Database Migration Runner
 *
 * Runs database migrations.
 * Usage: node run-migration.js [migration-file]
 * Example: node run-migration.js 002_add_memory_system.sql
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

async function runMigration(migrationFile) {
  console.log('🔄 Starting database migration...\n');

  try {
    // Read migration file
    const migrationPath = migrationFile.includes('/')
      ? path.join(__dirname, migrationFile)
      : path.join(__dirname, 'migrations', migrationFile);

    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log(`📄 Running migration: ${path.basename(migrationPath)}`);

    // Execute migration
    await pool.query(migrationSQL);

    console.log('\n✅ Migration completed successfully!');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Get migration file from command line argument
const migrationFile = process.argv[2] || '001_add_personas.sql';

console.log(`Running migration: ${migrationFile}\n`);

// Run migration
runMigration(migrationFile);
