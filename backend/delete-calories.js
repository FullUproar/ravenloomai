import db from './db.js';

async function deleteCalorieMetrics() {
  try {
    console.log('🔍 Finding calorie metrics...');
    const result = await db.query('SELECT * FROM metrics WHERE name = $1 ORDER BY recorded_at DESC', ['calories']);
    console.log('Found metrics:', result.rows.map(r => ({
      id: r.id,
      value: r.value,
      recorded_at: r.recorded_at,
      source: r.source
    })));
    
    if (result.rows.length > 0) {
      console.log('🗑️ Deleting calorie metrics...');
      await db.query('DELETE FROM metrics WHERE name = $1', ['calories']);
      console.log('✅ Deleted', result.rows.length, 'calorie metrics');
    } else {
      console.log('ℹ️ No calorie metrics found');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await db.end();
    process.exit(0);
  }
}

deleteCalorieMetrics();