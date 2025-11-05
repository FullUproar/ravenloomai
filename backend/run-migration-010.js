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
    console.log('Running migration 010: Add sharing and connections...');

    const migrationSQL = fs.readFileSync(
      join(__dirname, 'migrations', '010_add_sharing_and_connections.sql'),
      'utf8'
    );

    await client.query(migrationSQL);

    console.log('✅ Migration 010 completed successfully!');
    console.log('Added tables: user_connections, project_shares, user_messages, message_threads');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration().catch(console.error);
