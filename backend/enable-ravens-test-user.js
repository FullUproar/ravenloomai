import db from './db.js';

const userId = 'test-user-123';

const result = await db.query(
  `INSERT INTO user_settings (user_id, ravens_enabled)
   VALUES ($1, true)
   ON CONFLICT (user_id) DO UPDATE SET
   ravens_enabled = true, updated_at = NOW()
   RETURNING *`,
  [userId]
);

console.log('✅ Enabled Ravens for', userId);
console.log('Settings:', result.rows[0]);

process.exit(0);
