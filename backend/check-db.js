import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function checkDatabase() {
  try {
    console.log('🔍 Checking database state...\n');

    // Check what tables exist
    const tablesResult = await pool.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename;
    `);

    console.log('📊 Existing tables:');
    tablesResult.rows.forEach(row => {
      console.log(`  ✓ ${row.tablename}`);
    });

    // Check if plans table exists
    const plansExists = tablesResult.rows.some(row => row.tablename === 'plans');
    const projectsExists = tablesResult.rows.some(row => row.tablename === 'projects');

    console.log('\n📋 Status:');
    console.log(`  - Old 'plans' table: ${plansExists ? '❌ EXISTS (needs removal)' : '✅ Removed'}`);
    console.log(`  - New 'projects' table: ${projectsExists ? '✅ Exists' : '❌ MISSING'}`);

    if (plansExists) {
      console.log('\n⚠️  WARNING: Old plans table still exists!');
      console.log('Run: node init-db.js to migrate');
    }

    if (projectsExists) {
      // Check projects content
      const projectsCount = await pool.query('SELECT COUNT(*) FROM projects');
      console.log(`\n📁 Projects table has ${projectsCount.rows[0].count} entries`);

      // Show first project
      const firstProject = await pool.query('SELECT id, title, domain FROM projects LIMIT 1');
      if (firstProject.rows.length > 0) {
        console.log('  Sample project:', firstProject.rows[0]);
      }
    }

    // Check for any queries referencing plans
    console.log('\n🔎 Checking for active queries using "plans" table...');
    const activeQueries = await pool.query(`
      SELECT query, state, wait_event_type
      FROM pg_stat_activity
      WHERE query LIKE '%plans%'
      AND query NOT LIKE '%pg_stat_activity%'
      AND state != 'idle';
    `);

    if (activeQueries.rows.length > 0) {
      console.log('⚠️  Found active queries referencing "plans":');
      activeQueries.rows.forEach(row => {
        console.log(`  - ${row.query.substring(0, 100)}...`);
      });
    } else {
      console.log('  ✅ No active queries using "plans" table');
    }

  } catch (error) {
    console.error('❌ Database check failed:', error.message);
    if (error.detail) {
      console.error('   Details:', error.detail);
    }
  } finally {
    await pool.end();
  }
}

checkDatabase();