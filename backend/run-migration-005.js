import db from './db.js';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigration() {
  try {
    console.log('🔄 Running migration 005: Add Recurring Tasks...');

    const migrationSQL = fs.readFileSync(
      join(__dirname, 'migrations', '005_add_recurring_tasks.sql'),
      'utf8'
    );

    await db.query(migrationSQL);

    console.log('✅ Migration 005 completed successfully!');
    console.log('📋 Added recurring task fields:');
    console.log('   - is_recurring');
    console.log('   - parent_task_id');
    console.log('   - recurrence_type (daily, weekly, monthly, yearly)');
    console.log('   - recurrence_interval');
    console.log('   - recurrence_days');
    console.log('   - recurrence_end_type');
    console.log('   - recurrence_end_date');
    console.log('   - recurrence_end_count');

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
