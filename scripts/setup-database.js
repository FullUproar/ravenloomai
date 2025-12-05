#!/usr/bin/env node

/**
 * Database Setup Script
 *
 * Runs the clean slate migration to set up the new team-based schema.
 *
 * Usage:
 *   node scripts/setup-database.js
 */

import pkg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load env from backend folder
dotenv.config({ path: path.join(__dirname, '../backend/.env') });

const { Pool } = pkg;

async function setup() {
  const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;

  if (!connectionString) {
    console.error('❌ No database URL found.');
    console.error('   Set POSTGRES_URL in backend/.env');
    process.exit(1);
  }

  console.log('🔌 Connecting to database...');
  console.log('   Host:', connectionString.split('@')[1]?.split('/')[0] || 'unknown');

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    // Test connection
    const result = await pool.query('SELECT NOW() as now, current_database() as db');
    console.log('✅ Connected to:', result.rows[0].db, 'at', result.rows[0].now);

    // Read migration file
    console.log('');
    console.log('📄 Reading migration file...');
    const migrationPath = path.join(__dirname, '../backend/migrations/100_clean_slate_teams.sql');
    let migration = fs.readFileSync(migrationPath, 'utf8');

    // Remove vector columns (not supported on all platforms)
    migration = migration.replace(/,?\s*embedding vector\(1536\)/g, '');

    // Remove the CREATE EXTENSION line for vector
    migration = migration.replace(/CREATE EXTENSION IF NOT EXISTS vector;?/g, '');

    // Split into individual statements
    const statements = migration
      .split(';')
      .map(s => s.trim())
      .filter(s => {
        // Filter out empty statements and comments-only blocks
        const withoutComments = s.replace(/--[^\n]*/g, '').trim();
        return withoutComments.length > 0;
      });

    console.log(`   Found ${statements.length} SQL statements`);

    // Execute each statement
    console.log('');
    console.log('🔨 Running migration...');
    let successCount = 0;
    let skipCount = 0;

    for (const statement of statements) {
      try {
        await pool.query(statement);
        successCount++;

        // Extract table/index name for logging
        const match = statement.match(/CREATE\s+(?:TABLE|INDEX)\s+(?:IF NOT EXISTS\s+)?(\w+)/i);
        if (match) {
          console.log(`   ✓ Created ${match[1]}`);
        }
      } catch (err) {
        if (err.message.includes('already exists')) {
          skipCount++;
          const match = statement.match(/CREATE\s+(?:TABLE|INDEX)\s+(?:IF NOT EXISTS\s+)?(\w+)/i);
          if (match) {
            console.log(`   - ${match[1]} (already exists)`);
          }
        } else {
          console.error(`   ✗ Error: ${err.message}`);
          console.error(`     Statement: ${statement.substring(0, 80)}...`);
        }
      }
    }

    console.log('');
    console.log(`✅ Migration complete: ${successCount} created, ${skipCount} skipped`);

    // List tables
    console.log('');
    console.log('📊 Tables in database:');
    const tables = await pool.query(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);
    tables.rows.forEach(row => console.log('   -', row.tablename));

    console.log('');
    console.log('🎉 Database setup complete!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Add your OPENAI_API_KEY to backend/.env');
    console.log('2. Run: cd backend && npm run dev');
    console.log('3. Run: cd frontend && npm run dev');

  } catch (err) {
    console.error('❌ Setup failed:', err.message);
    if (err.message.includes('ENOTFOUND') || err.message.includes('ECONNREFUSED')) {
      console.error('   Could not connect to database. Check your connection string.');
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

setup();
