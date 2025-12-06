/**
 * Vercel Cron Job - Check and Send Due Alerts
 *
 * This endpoint checks for alerts that are due and posts them
 * as messages in their respective channels.
 *
 * Configure in vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/check-alerts",
 *     "schedule": "* * * * *"  // Every minute
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
  // Vercel sets this header for cron jobs
  const isCron = req.headers['x-vercel-cron'] === '1' ||
                 process.env.NODE_ENV !== 'production';

  if (!isCron) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const db = getPool();

  try {
    // Get all due alerts
    const alertsResult = await db.query(`
      SELECT a.*, c.name as channel_name, t.name as team_name
      FROM alerts a
      LEFT JOIN channels c ON a.channel_id = c.id
      LEFT JOIN teams t ON a.team_id = t.id
      WHERE a.status = 'pending'
        AND a.trigger_at <= NOW()
      ORDER BY a.trigger_at ASC
      LIMIT 50
    `);

    const alerts = alertsResult.rows;
    let processedCount = 0;

    for (const alert of alerts) {
      try {
        // Post alert message to channel (if channel exists)
        if (alert.channel_id) {
          await db.query(`
            INSERT INTO messages (channel_id, user_id, content, is_ai, mentions_ai, metadata)
            VALUES ($1, NULL, $2, true, false, $3)
          `, [
            alert.channel_id,
            `**Reminder:** ${alert.message}`,
            JSON.stringify({ alertId: alert.id, type: 'reminder' })
          ]);
        }

        // Mark alert as sent
        await db.query(`
          UPDATE alerts
          SET status = 'sent', sent_at = NOW()
          WHERE id = $1
        `, [alert.id]);

        processedCount++;
      } catch (alertError) {
        console.error(`Error processing alert ${alert.id}:`, alertError);
      }
    }

    return res.status(200).json({
      success: true,
      processed: processedCount,
      total: alerts.length
    });
  } catch (error) {
    console.error('Alert check error:', error);
    return res.status(500).json({ error: error.message });
  }
}

// Configure for Vercel serverless
export const config = {
  api: {
    bodyParser: false,
  },
};
