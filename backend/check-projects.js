import db from './db.js';

try {
  console.log('All projects for test-user-001:');
  const result = await db.query('SELECT * FROM projects WHERE user_id = $1 ORDER BY created_at DESC', ['test-user-001']);
  result.rows.forEach((project, i) => {
    console.log(`${i+1}. ${project.title} (${project.domain}) - ID: ${project.id} - Created: ${project.created_at}`);
  });
  
  console.log(`\nTotal: ${result.rows.length} projects`);
} catch (error) {
  console.error('Error:', error.message);
} finally {
  await db.end();
}