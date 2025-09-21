import db from './db.js';

async function nuclearCleanup() {
  try {
    console.log('🧹 Nuclear cleanup of unwanted data...');
    
    // Delete the task
    await db.query('DELETE FROM tasks WHERE id = 19');
    console.log('✅ Deleted task 19');
    
    // Delete duplicate metrics
    await db.query('DELETE FROM metrics WHERE id = 21');
    console.log('✅ Deleted duplicate metric 21');
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await db.end();
    process.exit(0);
  }
}

nuclearCleanup();