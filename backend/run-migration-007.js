/**
 * Run migration 007: Enhanced multi-persona support
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
    console.log('🔄 Running migration 007: Enhanced multi-persona support...');

    // Read migration file
    const migrationPath = path.join(__dirname, 'migrations', '007_add_persona_switching.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Execute migration
    await db.query(sql);

    console.log('✅ Migration 007 completed successfully');
    console.log('   - Added persona role and switching fields');
    console.log('   - Created persona_switches table');
    console.log('   - Added availability scheduling');

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
