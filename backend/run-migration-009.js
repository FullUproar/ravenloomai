import pg from 'pg';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ravenloom'
});

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('Running migration 009: Fix ravens_sent cascade delete...');

    const migrationSQL = fs.readFileSync(
      join(__dirname, 'migrations', '009_fix_ravens_cascade.sql'),
      'utf8'
    );

    await client.query(migrationSQL);

    console.log('✅ Migration 009 completed successfully!');
    console.log('Ravens sent records will now be automatically deleted when projects are deleted.');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration().catch(console.error);
