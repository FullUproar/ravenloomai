import db from './db.js';

async function deleteMealTasks() {
  try {
    console.log('🗑️ Deleting meal recording tasks...');
    await db.query('DELETE FROM tasks WHERE id IN (12, 13, 14)');
    console.log('✅ Deleted tasks 12, 13, 14 (meal recording tasks)');
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await db.end();
    process.exit(0);
  }
}

deleteMealTasks();