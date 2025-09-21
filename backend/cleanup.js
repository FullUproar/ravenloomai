import db from './db.js';

async function cleanup() {
  try {
    console.log('🗑️ Deleting task 16 and duplicate metric 18...');
    await db.query('DELETE FROM tasks WHERE id = 16');
    await db.query('DELETE FROM metrics WHERE id = 18');
    console.log('✅ Cleaned up unwanted task and duplicate metric');
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await db.end();
    process.exit(0);
  }
}

cleanup();