#!/usr/bin/env node

/**
 * Setup script for Vercel Postgres
 *
 * Prerequisites:
 * 1. Create a Postgres database in Vercel Dashboard (Storage tab)
 * 2. Copy the POSTGRES_URL from the database settings
 * 3. Set it in your .env file or Vercel environment variables
 *
 * Usage:
 *   node scripts/setup-vercel-postgres.js
 *
 * This will:
 * - Connect to your Vercel Postgres
 * - Run the clean slate migration
 * - Create a default team for testing
 */

import pkg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load env
dotenv.config({ path: path.join(__dirname, '../backend/.env') });

const { Pool } = pkg;

async function setup() {
  const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;

  if (!connectionString) {
    console.error('❌ No database URL found.');
    console.error('   Set POSTGRES_URL in backend/.env or environment variables.');
    console.error('');
    console.error('   To get your Vercel Postgres URL:');
    console.error('   1. Go to Vercel Dashboard → Your Project → Storage');
    console.error('   2. Create a Postgres database (or select existing)');
    console.error('   3. Copy the POSTGRES_URL from the .env.local tab');
    process.exit(1);
  }

  console.log('🔌 Connecting to Vercel Postgres...');

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    // Test connection
    const result = await pool.query('SELECT NOW()');
    console.log('✅ Connected at', result.rows[0].now);

    // Check if pgvector extension exists (needed for embeddings)
    console.log('');
    console.log('📦 Checking pgvector extension...');
    try {
      await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
      console.log('✅ pgvector extension enabled');
    } catch (err) {
      console.log('⚠️  pgvector not available (embeddings will be disabled)');
      console.log('   This is fine for initial setup. Semantic search will use keyword matching.');
    }

    // Run migration
    console.log('');
    console.log('📄 Running clean slate migration...');

    const migrationPath = path.join(__dirname, '../backend/migrations/100_clean_slate_teams.sql');
    let migration = fs.readFileSync(migrationPath, 'utf8');

    // Remove the vector columns if pgvector isn't available
    // (We'll add them back when we set up semantic search)
    try {
      await pool.query('SELECT 1 FROM pg_extension WHERE extname = \'vector\'');
    } catch {
      console.log('   Removing vector columns from migration (pgvector not available)');
      migration = migration.replace(/embedding vector\(1536\),?\n?/g, '');
    }

    // Split and run statements (simple split, handles most cases)
    const statements = migration
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const statement of statements) {
      try {
        await pool.query(statement);
      } catch (err) {
        // Ignore "already exists" errors
        if (!err.message.includes('already exists')) {
          console.error('   Error:', err.message);
          console.error('   Statement:', statement.substring(0, 100) + '...');
        }
      }
    }

    console.log('✅ Migration complete');

    // Check what tables we have
    console.log('');
    console.log('📊 Tables created:');
    const tables = await pool.query(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);
    tables.rows.forEach(row => console.log('   -', row.tablename));

    console.log('');
    console.log('🎉 Setup complete!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Set OPENAI_API_KEY in your environment');
    console.log('2. Run: cd backend && npm run dev');
    console.log('3. Run: cd frontend && npm run dev');

  } catch (err) {
    console.error('❌ Setup failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

setup();
