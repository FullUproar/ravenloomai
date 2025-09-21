import db from './db.js';

async function deleteLatestTask() {
  try {
    const latest = await db.query('SELECT * FROM tasks ORDER BY created_at DESC LIMIT 1');
    if (latest.rows.length > 0) {
      const task = latest.rows[0];
      console.log('Deleting task:', task.title);
      await db.query('DELETE FROM tasks WHERE id = $1', [task.id]);
      console.log('✅ Deleted task ID', task.id);
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await db.end();
    process.exit(0);
  }
}

deleteLatestTask();