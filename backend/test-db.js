import db from './db.js';

console.log('Testing database connection...');

try {
  const result = await db.query('SELECT * FROM projects WHERE user_id = $1', ['test-user-001']);
  console.log('✅ Query successful. Found', result.rows.length, 'projects');
  if (result.rows.length > 0) {
    console.log('Sample project:', result.rows[0]);
  }
} catch (error) {
  console.error('❌ Query failed:', error.message);
} finally {
  await db.end();
  process.exit(0);
}