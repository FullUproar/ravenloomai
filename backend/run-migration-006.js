/**
 * Run migration 006: Add onboarding sessions
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './db.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  try {
    console.log('🔄 Running migration 006: Add onboarding sessions...');

    // Read migration file
    const migrationPath = path.join(__dirname, 'migrations', '006_add_onboarding_sessions.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Execute migration
    await db.query(sql);

    console.log('✅ Migration 006 completed successfully');
    console.log('   - Created onboarding_sessions table');
    console.log('   - Added indexes for performance');

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
