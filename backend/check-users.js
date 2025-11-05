import db from './db.js';

async function checkUsers() {
  try {
    const result = await db.query(`
      SELECT id, user_id, title, created_at
      FROM projects
      ORDER BY created_at DESC
      LIMIT 10
    `);

    console.log('\n=== PROJECTS IN DATABASE ===\n');
    result.rows.forEach(row => {
      console.log(`ID: ${row.id}`);
      console.log(`User ID: ${row.user_id}`);
      console.log(`Title: ${row.title}`);
      console.log(`Created: ${row.created_at}`);
      console.log('---');
    });

    const userCount = await db.query(`
      SELECT user_id, COUNT(*) as project_count
      FROM projects
      GROUP BY user_id
    `);

    console.log('\n=== PROJECTS BY USER ===\n');
    userCount.rows.forEach(row => {
      console.log(`User: ${row.user_id} - Projects: ${row.project_count}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkUsers();
