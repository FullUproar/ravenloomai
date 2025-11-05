import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  try {
    console.log('Running migration 003: Add Ravens (Push Notifications)...');

    const sql = fs.readFileSync(
      path.join(__dirname, 'migrations', '003_add_ravens.sql'),
      'utf8'
    );

    await pool.query(sql);
    console.log('✅ Migration 003 completed successfully!');
    console.log('Tables created:');
    console.log('  - push_subscriptions');
    console.log('  - ravens_sent');
    console.log('  - notification_preferences');
    console.log('  - project_notification_settings');
    console.log('  - raven_schedule');

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
