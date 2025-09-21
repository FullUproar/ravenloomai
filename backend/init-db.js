import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function initDatabase() {
  try {
    console.log('🔧 Initializing database...');

    // Read the SQL file
    const sqlPath = path.join(__dirname, 'init-database.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    // Execute the SQL
    await pool.query(sql);

    console.log('✅ Database initialized successfully!');

    // Check what tables exist
    const result = await pool.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename;
    `);

    console.log('\n📊 Existing tables:');
    result.rows.forEach(row => {
      console.log(`  - ${row.tablename}`);
    });

    // Check if we have any projects
    const projectsResult = await pool.query('SELECT COUNT(*) FROM projects');
    console.log(`\n📁 Total projects: ${projectsResult.rows[0].count}`);

  } catch (error) {
    console.error('❌ Error initializing database:', error.message || error);
    if (error.detail) {
      console.error('   Details:', error.detail);
    }
    if (error.stack) {
      console.error('   Stack:', error.stack);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

initDatabase();