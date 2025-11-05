import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import db from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigration() {
  try {
    console.log('Running migration 004: Add task notifications...');

    const migrationPath = join(__dirname, 'migrations', '004_add_task_notifications.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    await db.query(sql);

    console.log('✅ Migration 004 completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration 004 failed:', error);
    process.exit(1);
  }
}

runMigration();
