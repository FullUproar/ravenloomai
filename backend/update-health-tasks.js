import db from './db.js';

console.log('Updating health project tasks to use specific health task types...');

try {
  // Update existing health project tasks
  await db.query(`
    UPDATE tasks SET 
      title = 'Calculate Daily Calorie Needs',
      description = 'Calculate personalized daily calorie target based on current weight, height, age, and activity level',
      type = 'calorie_calculation'
    WHERE project_id = 2 AND title = 'Calculate daily calorie target'
  `);

  await db.query(`
    UPDATE tasks SET 
      title = 'Generate 7-Day Meal Plan',
      description = 'Create a complete 7-day meal plan with balanced nutrition to meet calorie and macro targets',
      type = 'meal_planning'
    WHERE project_id = 2 AND title = 'Plan weekly meals'
  `);

  await db.query(`
    UPDATE tasks SET 
      title = 'Create Personalized Workout Routine',
      description = 'Generate a 4-week progressive workout plan based on fitness level and available time',
      type = 'workout_creation'
    WHERE project_id = 2 AND title = 'Create workout schedule'
  `);

  await db.query(`
    UPDATE tasks SET 
      title = 'Calculate Hydration Needs',
      description = 'Determine daily water intake requirements based on body weight and activity level',
      type = 'hydration_planning'
    WHERE project_id = 2 AND title = 'Weekly weigh-in'
  `);

  // Add some new health-specific tasks
  await db.query(`
    INSERT INTO tasks (project_id, goal_id, title, description, type, priority, assigned_to, requires_approval)
    VALUES 
    (2, 4, 'Calculate Macro Distribution', 'Calculate optimal protein, carbs, and fat ratios for weight loss goals', 'macro_calculation', 1, 'ai', false),
    (2, 4, 'Track Weight Progress', 'Analyze weight trends and progress toward goals', 'progress_tracking', 2, 'ai', false),
    (2, 5, 'Daily Check-in Reminder', 'Set up automated daily health check-ins and reminders', 'automation', 2, 'ai', false)
  `);

  // Update health project config with more specific data
  await db.query(`
    UPDATE projects SET 
      config = '{
        "current_weight": 180,
        "target_weight": 160,
        "height_inches": 70,
        "age": 32,
        "gender": "male",
        "activity_level": "sedentary",
        "goal": "weight_loss",
        "dietary_restrictions": [],
        "available_workout_time": 30,
        "fitness_level": "beginner",
        "equipment": ["bodyweight"]
      }'
    WHERE id = 2 AND domain = 'health'
  `);

  console.log('✅ Health project tasks updated successfully!');
  
  // Show updated tasks
  const result = await db.query(`
    SELECT t.id, t.title, t.type, t.description, g.title as goal_title
    FROM tasks t
    LEFT JOIN goals g ON t.goal_id = g.id
    WHERE t.project_id = 2
    ORDER BY t.priority ASC
  `);
  
  console.log('\\nUpdated health tasks:');
  result.rows.forEach(task => {
    console.log(`- ${task.title} (${task.type}) - Goal: ${task.goal_title || 'No goal'}`);
  });

} catch (error) {
  console.error('❌ Update failed:', error.message);
} finally {
  await db.end();
  process.exit(0);
}