/**
 * Vercel Cron Job - Send Daily Digests
 *
 * This endpoint generates and sends daily digests to users
 * who have enabled digest notifications.
 *
 * Configure in vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/send-digests",
 *     "schedule": "0 * * * *"  // Every hour (checks user's digestTime)
 *   }]
 * }
 */

import pg from 'pg';

const { Pool } = pg;

// Initialize database connection
let pool;
function getPool() {
  if (!pool) {
    const connString = process.env.POSTGRES_URL || process.env.DB_POSTGRES_URL || process.env.DATABASE_URL;
    pool = new Pool({
      connectionString: connString,
      ssl: { rejectUnauthorized: false },
      max: 1,
      connectionTimeoutMillis: 10000,
    });
  }
  return pool;
}

export default async function handler(req, res) {
  // Verify this is a cron job request (in production)
  const isCron = req.headers['x-vercel-cron'] === '1' ||
                 process.env.NODE_ENV !== 'production';

  if (!isCron) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const db = getPool();

  try {
    // Get current hour in HH:00 format
    const now = new Date();
    const currentHour = now.toISOString().substring(11, 13) + ':00';

    // Get users who should receive digest at this hour
    const usersResult = await db.query(`
      SELECT DISTINCT u.id, u.email, u.display_name, u.digest_time, tm.team_id
      FROM users u
      JOIN team_members tm ON u.id = tm.user_id
      WHERE u.digest_enabled = true
        AND u.digest_time::text LIKE $1 || '%'
        AND (u.last_digest_at IS NULL OR u.last_digest_at < CURRENT_DATE)
      ORDER BY u.id
      LIMIT 100
    `, [currentHour]);

    const users = usersResult.rows;
    let digestsSent = 0;

    for (const user of users) {
      try {
        // Generate digest for this user's team
        const digest = await generateDigestForUser(db, user.team_id, user.id);

        if (digest.hasContent) {
          // In a production environment, you would send this via email
          // For now, we'll just log it and mark as sent
          console.log(`Generated digest for ${user.email} in team ${user.team_id}`);

          // Mark digest as sent
          await db.query(`
            UPDATE users SET last_digest_at = NOW() WHERE id = $1
          `, [user.id]);

          // Log to digest_log
          await db.query(`
            INSERT INTO digest_log (user_id, team_id, digest_date)
            VALUES ($1, $2, CURRENT_DATE)
            ON CONFLICT (user_id, team_id, digest_date)
            DO UPDATE SET sent_at = NOW()
          `, [user.id, user.team_id]);

          digestsSent++;
        }
      } catch (userError) {
        console.error(`Error generating digest for user ${user.id}:`, userError);
      }
    }

    return res.status(200).json({
      success: true,
      hour: currentHour,
      usersChecked: users.length,
      digestsSent
    });
  } catch (error) {
    console.error('Digest cron error:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * Generate digest content for a user
 */
async function generateDigestForUser(db, teamId, userId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Get overdue tasks
  const overdueResult = await db.query(`
    SELECT COUNT(*) as count
    FROM tasks
    WHERE team_id = $1
      AND status != 'done'
      AND due_at < $2
  `, [teamId, today]);

  // Get tasks due today
  const dueTodayResult = await db.query(`
    SELECT COUNT(*) as count
    FROM tasks
    WHERE team_id = $1
      AND status != 'done'
      AND due_at >= $2
      AND due_at < $3
  `, [teamId, today, tomorrow]);

  // Get upcoming alerts
  const alertsResult = await db.query(`
    SELECT COUNT(*) as count
    FROM alerts
    WHERE team_id = $1
      AND status = 'pending'
      AND trigger_at >= $2
      AND trigger_at < $3
  `, [teamId, today, tomorrow]);

  // Get recent decisions
  const decisionsResult = await db.query(`
    SELECT COUNT(*) as count
    FROM decisions
    WHERE team_id = $1
      AND created_at >= $2 - INTERVAL '24 hours'
  `, [teamId, today]);

  const overdueCount = parseInt(overdueResult.rows[0].count);
  const dueTodayCount = parseInt(dueTodayResult.rows[0].count);
  const alertsCount = parseInt(alertsResult.rows[0].count);
  const decisionsCount = parseInt(decisionsResult.rows[0].count);

  const hasContent = overdueCount > 0 || dueTodayCount > 0 || alertsCount > 0 || decisionsCount > 0;

  return {
    hasContent,
    overdueTasks: overdueCount,
    dueTodayTasks: dueTodayCount,
    upcomingAlerts: alertsCount,
    recentDecisions: decisionsCount
  };
}

// Configure for Vercel serverless
export const config = {
  api: {
    bodyParser: false,
  },
};
