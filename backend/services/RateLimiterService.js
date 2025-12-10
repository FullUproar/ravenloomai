/**
 * RateLimiterService - API Rate Limiting for AI Calls
 *
 * Provides safeguards against excessive AI API usage:
 * - Per-team rate limiting (calls per hour/day)
 * - Token usage tracking
 * - API call logging for audit
 */

import db from '../db.js';

// Default rate limits per team
const DEFAULT_LIMITS = {
  minute: 20,      // Max 20 AI calls per minute (burst protection)
  hour: 200,       // Max 200 AI calls per hour
  day: 2000        // Max 2000 AI calls per day
};

// Token limits (optional, primarily for monitoring)
const TOKEN_LIMITS = {
  hour: 500000,    // 500k tokens per hour
  day: 5000000     // 5M tokens per day
};

/**
 * Check if a team can make an AI API call
 * Returns { allowed: boolean, reason?: string, remaining?: number }
 */
export async function checkRateLimit(teamId, windowType = 'hour') {
  try {
    // Get or create rate limit record
    const result = await db.query(`
      SELECT * FROM ai_rate_limits
      WHERE team_id = $1 AND window_type = $2
    `, [teamId, windowType]);

    if (result.rows.length === 0) {
      // No record exists, create one
      await db.query(`
        INSERT INTO ai_rate_limits (team_id, window_type, window_start, call_count)
        VALUES ($1, $2, NOW(), 0)
      `, [teamId, windowType]);
      return { allowed: true, remaining: DEFAULT_LIMITS[windowType] };
    }

    const record = result.rows[0];
    const windowStart = new Date(record.window_start);
    const now = new Date();

    // Calculate window duration in milliseconds
    const windowDurations = {
      minute: 60 * 1000,
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000
    };

    const windowDuration = windowDurations[windowType];
    const windowAge = now - windowStart;

    // Check if we need to reset the window
    if (windowAge >= windowDuration) {
      // Reset the window
      await db.query(`
        UPDATE ai_rate_limits
        SET window_start = NOW(), call_count = 0, token_count = 0, updated_at = NOW()
        WHERE team_id = $1 AND window_type = $2
      `, [teamId, windowType]);
      return { allowed: true, remaining: DEFAULT_LIMITS[windowType] };
    }

    // Check if we're at the limit
    const limit = DEFAULT_LIMITS[windowType];
    if (record.call_count >= limit) {
      const resetTime = new Date(windowStart.getTime() + windowDuration);
      return {
        allowed: false,
        reason: `Rate limit exceeded. Limit: ${limit} calls per ${windowType}. Resets at ${resetTime.toISOString()}`,
        remaining: 0,
        resetAt: resetTime
      };
    }

    return {
      allowed: true,
      remaining: limit - record.call_count
    };

  } catch (error) {
    console.error('Error checking rate limit:', error);
    // On error, allow the call but log it
    return { allowed: true, remaining: -1, error: error.message };
  }
}

/**
 * Increment the rate limit counter after a successful API call
 */
export async function incrementRateLimit(teamId, tokens = 0) {
  try {
    // Increment for all window types
    for (const windowType of ['minute', 'hour', 'day']) {
      await db.query(`
        INSERT INTO ai_rate_limits (team_id, window_type, call_count, token_count)
        VALUES ($1, $2, 1, $3)
        ON CONFLICT (team_id, window_type)
        DO UPDATE SET
          call_count = ai_rate_limits.call_count + 1,
          token_count = ai_rate_limits.token_count + $3,
          updated_at = NOW()
      `, [teamId, windowType, tokens]);
    }
  } catch (error) {
    console.error('Error incrementing rate limit:', error);
  }
}

/**
 * Log an AI API call for audit and analytics
 */
export async function logApiCall({
  teamId,
  userId,
  service,
  operation,
  model,
  promptTokens = 0,
  completionTokens = 0,
  totalTokens = 0,
  durationMs = 0,
  success = true,
  errorMessage = null
}) {
  try {
    await db.query(`
      INSERT INTO ai_api_calls
      (team_id, user_id, service, operation, model, prompt_tokens, completion_tokens, total_tokens, duration_ms, success, error_message)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [teamId, userId, service, operation, model, promptTokens, completionTokens, totalTokens, durationMs, success, errorMessage]);
  } catch (error) {
    console.error('Error logging API call:', error);
  }
}

/**
 * Get usage statistics for a team
 */
export async function getUsageStats(teamId, period = 'day') {
  try {
    const periodMap = {
      hour: "1 hour",
      day: "1 day",
      week: "7 days",
      month: "30 days"
    };

    const interval = periodMap[period] || "1 day";

    // Get call counts by service
    const byService = await db.query(`
      SELECT service, COUNT(*) as calls, SUM(total_tokens) as tokens
      FROM ai_api_calls
      WHERE team_id = $1 AND created_at > NOW() - INTERVAL '${interval}'
      GROUP BY service
      ORDER BY calls DESC
    `, [teamId]);

    // Get total stats
    const totals = await db.query(`
      SELECT
        COUNT(*) as total_calls,
        SUM(total_tokens) as total_tokens,
        AVG(duration_ms) as avg_duration,
        SUM(CASE WHEN success = false THEN 1 ELSE 0 END) as failed_calls
      FROM ai_api_calls
      WHERE team_id = $1 AND created_at > NOW() - INTERVAL '${interval}'
    `, [teamId]);

    // Get current rate limit status
    const rateLimits = await db.query(`
      SELECT window_type, call_count, token_count, window_start
      FROM ai_rate_limits
      WHERE team_id = $1
    `, [teamId]);

    return {
      period,
      byService: byService.rows,
      totals: totals.rows[0],
      rateLimits: rateLimits.rows.map(r => ({
        windowType: r.window_type,
        callCount: r.call_count,
        tokenCount: r.token_count,
        limit: DEFAULT_LIMITS[r.window_type],
        remaining: Math.max(0, DEFAULT_LIMITS[r.window_type] - r.call_count)
      }))
    };

  } catch (error) {
    console.error('Error getting usage stats:', error);
    return null;
  }
}

/**
 * Wrapper to check limits before making an AI call
 * Throws an error if rate limited
 */
export async function enforceRateLimit(teamId) {
  // Check minute limit (burst protection)
  const minuteCheck = await checkRateLimit(teamId, 'minute');
  if (!minuteCheck.allowed) {
    throw new Error(`Rate limited: ${minuteCheck.reason}`);
  }

  // Check hour limit
  const hourCheck = await checkRateLimit(teamId, 'hour');
  if (!hourCheck.allowed) {
    throw new Error(`Rate limited: ${hourCheck.reason}`);
  }

  // Check day limit
  const dayCheck = await checkRateLimit(teamId, 'day');
  if (!dayCheck.allowed) {
    throw new Error(`Rate limited: ${dayCheck.reason}`);
  }

  return { allowed: true };
}

export default {
  checkRateLimit,
  incrementRateLimit,
  logApiCall,
  getUsageStats,
  enforceRateLimit,
  DEFAULT_LIMITS,
  TOKEN_LIMITS
};
