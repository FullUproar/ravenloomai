import db from './db.js';
import fs from 'fs';

const sql = fs.readFileSync('./reminders-schema.sql', 'utf8');
console.log('Creating reminders framework...');

try {
  await db.query(sql);
  console.log('✅ Reminders framework created successfully');
  
  // Show sample reminders
  const result = await db.query('SELECT * FROM reminders WHERE user_id = $1 ORDER BY due_at ASC', ['test-user-001']);
  console.log(`\nSample reminders (${result.rows.length}):`);
  result.rows.forEach(reminder => {
    const dueDate = new Date(reminder.due_at).toLocaleString();
    console.log(`- ${reminder.title} (due: ${dueDate}, recurring: ${reminder.is_recurring})`);
  });
} catch (error) {
  console.error('❌ Error:', error.message);
} finally {
  await db.end();
}