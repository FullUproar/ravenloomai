import db from './db.js';

async function checkTasksAndMetrics() {
  try {
    console.log('📋 Recent tasks:');
    const tasks = await db.query('SELECT * FROM tasks ORDER BY created_at DESC LIMIT 10');
    tasks.rows.forEach(task => {
      console.log(`  ID ${task.id}: ${task.title} (${task.status})`);
    });
    
    console.log('\n📊 Recent metrics:');
    const metrics = await db.query('SELECT * FROM metrics ORDER BY recorded_at DESC LIMIT 5');
    metrics.rows.forEach(metric => {
      console.log(`  ID ${metric.id}: ${metric.name} = ${metric.value} ${metric.unit || ''} at ${metric.recorded_at}`);
    });
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await db.end();
    process.exit(0);
  }
}

checkTasksAndMetrics();