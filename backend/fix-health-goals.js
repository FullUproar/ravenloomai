import db from './db.js';

try {
  console.log('Health project goals:');
  const goals = await db.query('SELECT * FROM goals WHERE project_id = 2');
  goals.rows.forEach(goal => {
    console.log(`Goal ${goal.id}: ${goal.title}`);
  });
  
  console.log('\nUpdating task-goal associations...');
  
  // Fix goal associations for health tasks
  await db.query('UPDATE tasks SET goal_id = 4 WHERE project_id = 2 AND type IN (\'calorie_calculation\', \'macro_calculation\', \'progress_tracking\')');
  await db.query('UPDATE tasks SET goal_id = 5 WHERE project_id = 2 AND type IN (\'workout_creation\', \'automation\')');
  await db.query('UPDATE tasks SET goal_id = 6 WHERE project_id = 2 AND type IN (\'meal_planning\', \'hydration_planning\')');
  
  console.log('✅ Task-goal associations updated');
  
  // Show final state
  const tasks = await db.query(`
    SELECT t.title, t.type, g.title as goal_title
    FROM tasks t
    LEFT JOIN goals g ON t.goal_id = g.id
    WHERE t.project_id = 2
    ORDER BY t.priority ASC
  `);
  
  console.log('\nFinal health tasks:');
  tasks.rows.forEach(task => {
    console.log(`- ${task.title} (${task.type}) → ${task.goal_title || 'No goal'}`);
  });
  
} catch (error) {
  console.error('Error:', error.message);
} finally {
  await db.end();
}