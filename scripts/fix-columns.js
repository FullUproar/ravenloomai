#!/usr/bin/env node

/**
 * Fix missing columns script
 * Adds columns that couldn't be created due to DO $$ block parsing issues
 */

import pkg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../backend/.env') });

const { Pool } = pkg;

async function fix() {
  const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;

  if (!connectionString) {
    console.error('❌ No database URL found.');
    process.exit(1);
  }

  console.log('🔌 Connecting to database...');

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await pool.query('SELECT NOW()');
    console.log('✅ Connected');

    // Add missing columns to projects
    console.log('\n📦 Fixing projects table...');

    const projectColumns = [
      { name: 'goal_id', sql: 'ALTER TABLE projects ADD COLUMN IF NOT EXISTS goal_id UUID REFERENCES goals(id) ON DELETE SET NULL' },
      { name: 'color', sql: "ALTER TABLE projects ADD COLUMN IF NOT EXISTS color VARCHAR(7) DEFAULT '#5D4B8C'" },
      { name: 'due_date', sql: 'ALTER TABLE projects ADD COLUMN IF NOT EXISTS due_date DATE' },
      { name: 'owner_id', sql: 'ALTER TABLE projects ADD COLUMN IF NOT EXISTS owner_id VARCHAR(128) REFERENCES users(id)' },
      { name: 'goals_inherit', sql: 'ALTER TABLE projects ADD COLUMN IF NOT EXISTS goals_inherit BOOLEAN DEFAULT true' }
    ];

    for (const col of projectColumns) {
      try {
        await pool.query(col.sql);
        console.log(`   ✓ Added ${col.name}`);
      } catch (err) {
        if (err.message.includes('already exists')) {
          console.log(`   - ${col.name} (already exists)`);
        } else {
          console.log(`   ✗ ${col.name}: ${err.message}`);
        }
      }
    }

    // Add missing columns to tasks
    console.log('\n📋 Fixing tasks table...');

    const taskColumns = [
      { name: 'start_date', sql: 'ALTER TABLE tasks ADD COLUMN IF NOT EXISTS start_date DATE' },
      { name: 'estimated_hours', sql: 'ALTER TABLE tasks ADD COLUMN IF NOT EXISTS estimated_hours DECIMAL(5,2)' },
      { name: 'actual_hours', sql: 'ALTER TABLE tasks ADD COLUMN IF NOT EXISTS actual_hours DECIMAL(5,2)' },
      { name: 'tags', sql: "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'" },
      { name: 'sort_order', sql: 'ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0' }
    ];

    for (const col of taskColumns) {
      try {
        await pool.query(col.sql);
        console.log(`   ✓ Added ${col.name}`);
      } catch (err) {
        if (err.message.includes('already exists')) {
          console.log(`   - ${col.name} (already exists)`);
        } else {
          console.log(`   ✗ ${col.name}: ${err.message}`);
        }
      }
    }

    // Create missing indexes
    console.log('\n📇 Creating missing indexes...');

    const indexes = [
      { name: 'idx_projects_goal', sql: 'CREATE INDEX IF NOT EXISTS idx_projects_goal ON projects(goal_id)' },
      { name: 'idx_tasks_sort', sql: 'CREATE INDEX IF NOT EXISTS idx_tasks_sort ON tasks(project_id, sort_order)' }
    ];

    for (const idx of indexes) {
      try {
        await pool.query(idx.sql);
        console.log(`   ✓ Created ${idx.name}`);
      } catch (err) {
        if (err.message.includes('already exists')) {
          console.log(`   - ${idx.name} (already exists)`);
        } else {
          console.log(`   ✗ ${idx.name}: ${err.message}`);
        }
      }
    }

    console.log('\n✅ Column fixes complete!');

  } catch (err) {
    console.error('❌ Fix failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

fix();
