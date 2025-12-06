#!/usr/bin/env node
/**
 * Check data integrity - diagnose goals, projects, tasks connections
 */

import 'dotenv/config';
import pg from 'pg';

// Load from backend/.env
import { config } from 'dotenv';
config({ path: 'backend/.env' });

const { Pool } = pg;

const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const pool = new Pool({
  connectionString,
  ssl: connectionString?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function checkData() {
  console.log('🔍 Checking database data...\n');

  try {
    // Check goals
    const goals = await pool.query('SELECT id, title, status FROM goals ORDER BY created_at DESC LIMIT 10');
    console.log(`📊 Goals (${goals.rowCount}):`);
    goals.rows.forEach(g => console.log(`   - ${g.title} [${g.status}] (${g.id})`));

    // Check projects
    const projects = await pool.query('SELECT id, name, status, goal_id, team_id FROM projects ORDER BY created_at DESC LIMIT 10');
    console.log(`\n📁 Projects (${projects.rowCount}):`);
    projects.rows.forEach(p => console.log(`   - ${p.name} [${p.status}] goal: ${p.goal_id?.substring(0,8) || 'none'} team: ${p.team_id?.substring(0,8)} (${p.id.substring(0,8)})`));

    // Check tasks
    const tasks = await pool.query('SELECT id, title, status, project_id FROM tasks ORDER BY created_at DESC LIMIT 10');
    console.log(`\n✅ Tasks (${tasks.rowCount}):`);
    tasks.rows.forEach(t => console.log(`   - ${t.title} [${t.status}] project: ${t.project_id || 'none'} (${t.id})`));

    // Check junction tables
    const goalProjects = await pool.query('SELECT * FROM goal_projects');
    console.log(`\n🔗 goal_projects junction table (${goalProjects.rowCount}):`);
    goalProjects.rows.forEach(gp => console.log(`   - goal: ${gp.goal_id} -> project: ${gp.project_id}`));

    const goalTasks = await pool.query('SELECT * FROM goal_tasks');
    console.log(`\n🔗 goal_tasks junction table (${goalTasks.rowCount}):`);
    goalTasks.rows.forEach(gt => console.log(`   - goal: ${gt.goal_id} -> task: ${gt.task_id}`));

    // Check for orphaned data
    console.log('\n⚠️  Checking for data issues...');

    // Projects with goal_id but no goal_projects entry
    const orphanedProjects = await pool.query(`
      SELECT p.id, p.name, p.goal_id
      FROM projects p
      WHERE p.goal_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM goal_projects gp WHERE gp.project_id = p.id AND gp.goal_id = p.goal_id)
    `);
    if (orphanedProjects.rowCount > 0) {
      console.log(`\n❌ Projects with goal_id but missing from goal_projects (${orphanedProjects.rowCount}):`);
      orphanedProjects.rows.forEach(p => console.log(`   - ${p.name} (${p.id}) has goal_id ${p.goal_id} but no junction entry`));
    } else {
      console.log('   ✓ No orphaned project-goal relationships');
    }

    // Get teams and their data counts
    const teams = await pool.query('SELECT id, name FROM teams');
    console.log(`\n👥 Teams (${teams.rowCount}):`);
    for (const t of teams.rows) {
      const teamProjects = await pool.query(`
        SELECT p.* FROM projects p WHERE p.team_id = $1
        ORDER BY p.updated_at DESC
      `, [t.id]);
      const teamTasks = await pool.query(`
        SELECT t.* FROM tasks t WHERE t.team_id = $1
      `, [t.id]);
      const teamGoals = await pool.query(`
        SELECT g.* FROM goals g WHERE g.team_id = $1
      `, [t.id]);
      console.log(`   - ${t.name} (${t.id}): ${teamGoals.rowCount} goals, ${teamProjects.rowCount} projects, ${teamTasks.rowCount} tasks`);
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkData();
