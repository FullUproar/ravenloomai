/**
 * UXPreferencesService
 *
 * Handles AI-controlled UX personalization.
 * Team defaults + user overrides, all controlled through Raven (no UI settings).
 */

import pool from '../db.js';

// Default navigation items in order
const DEFAULT_NAV_ORDER = [
  'digest', 'raven', 'channels', 'tasks', 'goals',
  'projects', 'calendar', 'insights', 'team', 'knowledge'
];

const DEFAULT_NAV_COLLAPSED = ['tasks', 'goals', 'projects', 'team', 'knowledge'];

// Valid values for enum fields
const VALID_DENSITIES = ['compact', 'comfortable', 'spacious'];
const VALID_SIDEBAR_WIDTHS = ['narrow', 'normal', 'wide'];
const VALID_NAV_ITEMS = [
  'digest', 'raven', 'channels', 'tasks', 'goals',
  'projects', 'calendar', 'insights', 'team', 'knowledge'
];

// ============================================================================
// GET PREFERENCES
// ============================================================================

/**
 * Get team UX defaults
 */
export async function getTeamDefaults(teamId) {
  const result = await pool.query(
    `SELECT * FROM team_ux_defaults WHERE team_id = $1`,
    [teamId]
  );

  if (result.rows.length === 0) {
    // Create defaults if they don't exist
    const inserted = await pool.query(
      `INSERT INTO team_ux_defaults (team_id)
       VALUES ($1)
       ON CONFLICT (team_id) DO UPDATE SET updated_at = NOW()
       RETURNING *`,
      [teamId]
    );
    return formatTeamDefaults(inserted.rows[0]);
  }

  return formatTeamDefaults(result.rows[0]);
}

/**
 * Get user UX preferences (overrides only)
 */
export async function getUserPreferences(teamId, userId) {
  const result = await pool.query(
    `SELECT * FROM user_ux_preferences WHERE team_id = $1 AND user_id = $2`,
    [teamId, userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return formatUserPreferences(result.rows[0]);
}

/**
 * Get effective preferences - merges team defaults with user overrides
 */
export async function getEffectivePreferences(teamId, userId) {
  const teamDefaults = await getTeamDefaults(teamId);
  const userPrefs = await getUserPreferences(teamId, userId);

  // User values override team defaults (null = use default)
  return {
    navOrder: userPrefs?.navOrder ?? teamDefaults.navOrder,
    navHidden: userPrefs?.navHidden ?? teamDefaults.navHidden,
    navCollapsed: userPrefs?.navCollapsed ?? teamDefaults.navCollapsed,
    cardDensity: userPrefs?.cardDensity ?? teamDefaults.cardDensity,
    defaultView: userPrefs?.defaultView ?? teamDefaults.defaultView,
    sidebarWidth: userPrefs?.sidebarWidth ?? teamDefaults.sidebarWidth,
    animationsEnabled: userPrefs?.animationsEnabled ?? teamDefaults.animationsEnabled,
    showBadges: userPrefs?.showBadges ?? teamDefaults.showBadges,
    showAISummaries: userPrefs?.showAISummaries ?? teamDefaults.showAISummaries
  };
}

// ============================================================================
// UPDATE PREFERENCES
// ============================================================================

/**
 * Update team UX defaults (admin only)
 */
export async function updateTeamDefaults(teamId, updates) {
  const validUpdates = validateUpdates(updates);

  const result = await pool.query(
    `INSERT INTO team_ux_defaults (team_id, nav_order, nav_hidden, nav_collapsed, card_density, default_view, sidebar_width, animations_enabled, show_badges, show_ai_summaries)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (team_id) DO UPDATE SET
       nav_order = COALESCE($2, team_ux_defaults.nav_order),
       nav_hidden = COALESCE($3, team_ux_defaults.nav_hidden),
       nav_collapsed = COALESCE($4, team_ux_defaults.nav_collapsed),
       card_density = COALESCE($5, team_ux_defaults.card_density),
       default_view = COALESCE($6, team_ux_defaults.default_view),
       sidebar_width = COALESCE($7, team_ux_defaults.sidebar_width),
       animations_enabled = COALESCE($8, team_ux_defaults.animations_enabled),
       show_badges = COALESCE($9, team_ux_defaults.show_badges),
       show_ai_summaries = COALESCE($10, team_ux_defaults.show_ai_summaries),
       updated_at = NOW()
     RETURNING *`,
    [
      teamId,
      validUpdates.navOrder ? JSON.stringify(validUpdates.navOrder) : null,
      validUpdates.navHidden ? JSON.stringify(validUpdates.navHidden) : null,
      validUpdates.navCollapsed ? JSON.stringify(validUpdates.navCollapsed) : null,
      validUpdates.cardDensity || null,
      validUpdates.defaultView || null,
      validUpdates.sidebarWidth || null,
      validUpdates.animationsEnabled,
      validUpdates.showBadges,
      validUpdates.showAISummaries
    ]
  );

  return formatTeamDefaults(result.rows[0]);
}

/**
 * Update user UX preferences
 */
export async function updateUserPreferences(teamId, userId, updates) {
  const validUpdates = validateUpdates(updates);

  const result = await pool.query(
    `INSERT INTO user_ux_preferences (user_id, team_id, nav_order, nav_hidden, nav_collapsed, card_density, default_view, sidebar_width, animations_enabled, show_badges, show_ai_summaries)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (user_id, team_id) DO UPDATE SET
       nav_order = COALESCE($3, user_ux_preferences.nav_order),
       nav_hidden = COALESCE($4, user_ux_preferences.nav_hidden),
       nav_collapsed = COALESCE($5, user_ux_preferences.nav_collapsed),
       card_density = COALESCE($6, user_ux_preferences.card_density),
       default_view = COALESCE($7, user_ux_preferences.default_view),
       sidebar_width = COALESCE($8, user_ux_preferences.sidebar_width),
       animations_enabled = COALESCE($9, user_ux_preferences.animations_enabled),
       show_badges = COALESCE($10, user_ux_preferences.show_badges),
       show_ai_summaries = COALESCE($11, user_ux_preferences.show_ai_summaries),
       updated_at = NOW()
     RETURNING *`,
    [
      userId,
      teamId,
      validUpdates.navOrder ? JSON.stringify(validUpdates.navOrder) : null,
      validUpdates.navHidden ? JSON.stringify(validUpdates.navHidden) : null,
      validUpdates.navCollapsed ? JSON.stringify(validUpdates.navCollapsed) : null,
      validUpdates.cardDensity || null,
      validUpdates.defaultView || null,
      validUpdates.sidebarWidth || null,
      validUpdates.animationsEnabled,
      validUpdates.showBadges,
      validUpdates.showAISummaries
    ]
  );

  return formatUserPreferences(result.rows[0]);
}

/**
 * Reset user preferences to team defaults
 */
export async function resetUserPreferences(teamId, userId) {
  await pool.query(
    `DELETE FROM user_ux_preferences WHERE team_id = $1 AND user_id = $2`,
    [teamId, userId]
  );

  return { success: true, message: 'Preferences reset to team defaults' };
}

// ============================================================================
// NAV ITEM OPERATIONS
// ============================================================================

/**
 * Hide a nav item for a user
 */
export async function hideNavItem(teamId, userId, item) {
  const normalizedItem = normalizeNavItem(item);
  if (!normalizedItem) {
    return { success: false, error: `Unknown nav item: ${item}` };
  }

  const current = await getEffectivePreferences(teamId, userId);
  const userPrefs = await getUserPreferences(teamId, userId);

  // Add to hidden if not already there
  const currentHidden = userPrefs?.navHidden ?? current.navHidden ?? [];
  if (currentHidden.includes(normalizedItem)) {
    return { success: true, message: `${formatNavItemName(normalizedItem)} is already hidden` };
  }

  const newHidden = [...currentHidden, normalizedItem];
  await updateUserPreferences(teamId, userId, { navHidden: newHidden });

  return { success: true, message: `Hidden ${formatNavItemName(normalizedItem)} from your sidebar` };
}

/**
 * Show a hidden nav item for a user
 */
export async function showNavItem(teamId, userId, item) {
  const normalizedItem = normalizeNavItem(item);
  if (!normalizedItem) {
    return { success: false, error: `Unknown nav item: ${item}` };
  }

  const userPrefs = await getUserPreferences(teamId, userId);
  const currentHidden = userPrefs?.navHidden ?? [];

  if (!currentHidden.includes(normalizedItem)) {
    return { success: true, message: `${formatNavItemName(normalizedItem)} is already visible` };
  }

  const newHidden = currentHidden.filter(i => i !== normalizedItem);
  await updateUserPreferences(teamId, userId, { navHidden: newHidden });

  return { success: true, message: `${formatNavItemName(normalizedItem)} is now visible in your sidebar` };
}

/**
 * Move a nav item to a different position
 */
export async function moveNavItem(teamId, userId, item, beforeItem) {
  const normalizedItem = normalizeNavItem(item);
  const normalizedBefore = beforeItem ? normalizeNavItem(beforeItem) : null;

  if (!normalizedItem) {
    return { success: false, error: `Unknown nav item: ${item}` };
  }
  if (beforeItem && !normalizedBefore) {
    return { success: false, error: `Unknown nav item: ${beforeItem}` };
  }

  const current = await getEffectivePreferences(teamId, userId);
  const currentOrder = [...current.navOrder];

  // Remove item from current position
  const itemIndex = currentOrder.indexOf(normalizedItem);
  if (itemIndex === -1) {
    currentOrder.push(normalizedItem);
  } else {
    currentOrder.splice(itemIndex, 1);
  }

  // Insert at new position
  if (normalizedBefore) {
    const beforeIndex = currentOrder.indexOf(normalizedBefore);
    if (beforeIndex === -1) {
      currentOrder.push(normalizedItem);
    } else {
      currentOrder.splice(beforeIndex, 0, normalizedItem);
    }
  } else {
    // No "before" specified = move to top
    currentOrder.unshift(normalizedItem);
  }

  await updateUserPreferences(teamId, userId, { navOrder: currentOrder });

  const position = normalizedBefore
    ? `before ${formatNavItemName(normalizedBefore)}`
    : 'to the top';

  return { success: true, message: `Moved ${formatNavItemName(normalizedItem)} ${position}` };
}

/**
 * Get list of hidden items for a user
 */
export async function getHiddenItems(teamId, userId) {
  const prefs = await getEffectivePreferences(teamId, userId);
  return prefs.navHidden || [];
}

// ============================================================================
// DENSITY/VIEW OPERATIONS
// ============================================================================

/**
 * Set card density
 */
export async function setDensity(teamId, userId, density) {
  const normalized = density.toLowerCase();
  if (!VALID_DENSITIES.includes(normalized)) {
    return { success: false, error: `Unknown density: ${density}. Use compact, comfortable, or spacious.` };
  }

  await updateUserPreferences(teamId, userId, { cardDensity: normalized });
  return { success: true, message: `Switched to ${normalized} mode` };
}

/**
 * Toggle animations
 */
export async function setAnimations(teamId, userId, enabled) {
  await updateUserPreferences(teamId, userId, { animationsEnabled: enabled });
  return { success: true, message: enabled ? 'Animations enabled' : 'Animations disabled' };
}

/**
 * Toggle badges
 */
export async function setBadges(teamId, userId, enabled) {
  await updateUserPreferences(teamId, userId, { showBadges: enabled });
  return { success: true, message: enabled ? 'Badges enabled' : 'Badges hidden' };
}

/**
 * Toggle AI summaries
 */
export async function setAISummaries(teamId, userId, enabled) {
  await updateUserPreferences(teamId, userId, { showAISummaries: enabled });
  return { success: true, message: enabled ? 'AI summaries enabled' : 'AI summaries hidden' };
}

// ============================================================================
// AI SIMPLIFICATION
// ============================================================================

/**
 * Simplify view based on usage patterns
 */
export async function simplifyView(teamId, userId) {
  // Get usage patterns
  const patterns = await analyzeUsagePatterns(teamId, userId);

  // Determine what to hide based on low usage
  const lowUsageItems = patterns.lowUsageItems || [];
  const frequentItems = patterns.frequentItems || ['digest', 'raven', 'tasks'];

  // Build simplified configuration
  const navHidden = lowUsageItems.filter(item =>
    !['digest', 'raven'].includes(item) // Never hide core items
  );

  const navCollapsed = VALID_NAV_ITEMS.filter(item =>
    !frequentItems.includes(item) && !navHidden.includes(item)
  );

  await updateUserPreferences(teamId, userId, {
    navHidden,
    navCollapsed,
    cardDensity: 'comfortable'
  });

  // Build response message
  const hiddenNames = navHidden.map(formatNavItemName);
  const collapsedNames = navCollapsed.map(formatNavItemName);

  let message = "I've simplified your view:\n";
  if (hiddenNames.length > 0) {
    message += `- Hidden: ${hiddenNames.join(', ')} (you rarely use these)\n`;
  }
  if (collapsedNames.length > 0) {
    message += `- Collapsed: ${collapsedNames.join(', ')}\n`;
  }
  message += `- Kept prominent: ${frequentItems.map(formatNavItemName).join(', ')}\n`;
  message += '\nSay "@raven reset my preferences" to undo.';

  return { success: true, message };
}

// ============================================================================
// USAGE TRACKING
// ============================================================================

/**
 * Track a UX usage event
 */
export async function trackUsageEvent(teamId, userId, eventType, target, context = {}) {
  await pool.query(
    `INSERT INTO ux_usage_events (user_id, team_id, event_type, event_target, event_context)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, teamId, eventType, target, JSON.stringify(context)]
  );
}

/**
 * Analyze usage patterns for AI suggestions
 */
export async function analyzeUsagePatterns(teamId, userId) {
  // Get nav click counts from last 30 days
  const result = await pool.query(
    `SELECT event_target, COUNT(*) as count
     FROM ux_usage_events
     WHERE user_id = $1 AND team_id = $2
       AND event_type = 'nav_click'
       AND created_at > NOW() - INTERVAL '30 days'
     GROUP BY event_target
     ORDER BY count DESC`,
    [userId, teamId]
  );

  const clickCounts = {};
  result.rows.forEach(row => {
    clickCounts[row.event_target] = parseInt(row.count, 10);
  });

  // Determine frequent vs low usage items
  const totalClicks = Object.values(clickCounts).reduce((a, b) => a + b, 0);
  const avgClicks = totalClicks / VALID_NAV_ITEMS.length;

  const frequentItems = [];
  const lowUsageItems = [];

  VALID_NAV_ITEMS.forEach(item => {
    const count = clickCounts[item] || 0;
    if (count >= avgClicks * 0.5) {
      frequentItems.push(item);
    } else if (count < avgClicks * 0.1) {
      lowUsageItems.push(item);
    }
  });

  return {
    clickCounts,
    frequentItems,
    lowUsageItems,
    totalClicks
  };
}

/**
 * Get AI suggestions for UX improvements
 */
export async function getAISuggestions(teamId, userId) {
  const patterns = await analyzeUsagePatterns(teamId, userId);
  const prefs = await getEffectivePreferences(teamId, userId);

  const suggestions = [];

  // Suggest hiding rarely used items
  patterns.lowUsageItems.forEach(item => {
    if (!prefs.navHidden.includes(item) && !['digest', 'raven'].includes(item)) {
      suggestions.push({
        type: 'hide',
        item,
        reason: `You rarely use ${formatNavItemName(item)}`
      });
    }
  });

  // Suggest promoting frequently used items
  if (patterns.frequentItems.length > 0) {
    const currentTop3 = prefs.navOrder.slice(0, 3);
    patterns.frequentItems.slice(0, 3).forEach(item => {
      if (!currentTop3.includes(item)) {
        suggestions.push({
          type: 'promote',
          item,
          reason: `You use ${formatNavItemName(item)} frequently`
        });
      }
    });
  }

  return suggestions;
}

// ============================================================================
// HELPERS
// ============================================================================

function formatTeamDefaults(row) {
  if (!row) return null;
  return {
    teamId: row.team_id,
    navOrder: parseJsonField(row.nav_order, DEFAULT_NAV_ORDER),
    navHidden: parseJsonField(row.nav_hidden, []),
    navCollapsed: parseJsonField(row.nav_collapsed, DEFAULT_NAV_COLLAPSED),
    cardDensity: row.card_density || 'comfortable',
    defaultView: row.default_view || 'digest',
    sidebarWidth: row.sidebar_width || 'normal',
    animationsEnabled: row.animations_enabled !== false,
    showBadges: row.show_badges !== false,
    showAISummaries: row.show_ai_summaries !== false
  };
}

function formatUserPreferences(row) {
  if (!row) return null;
  return {
    userId: row.user_id,
    teamId: row.team_id,
    navOrder: parseJsonField(row.nav_order, null),
    navHidden: parseJsonField(row.nav_hidden, null),
    navCollapsed: parseJsonField(row.nav_collapsed, null),
    cardDensity: row.card_density || null,
    defaultView: row.default_view || null,
    sidebarWidth: row.sidebar_width || null,
    animationsEnabled: row.animations_enabled,
    showBadges: row.show_badges,
    showAISummaries: row.show_ai_summaries
  };
}

function parseJsonField(value, defaultValue) {
  if (value === null || value === undefined) return defaultValue;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return defaultValue;
    }
  }
  return value;
}

function validateUpdates(updates) {
  const valid = {};

  if (updates.navOrder) {
    valid.navOrder = updates.navOrder.filter(item => VALID_NAV_ITEMS.includes(item));
  }
  if (updates.navHidden) {
    valid.navHidden = updates.navHidden.filter(item => VALID_NAV_ITEMS.includes(item));
  }
  if (updates.navCollapsed) {
    valid.navCollapsed = updates.navCollapsed.filter(item => VALID_NAV_ITEMS.includes(item));
  }
  if (updates.cardDensity && VALID_DENSITIES.includes(updates.cardDensity)) {
    valid.cardDensity = updates.cardDensity;
  }
  if (updates.defaultView) {
    valid.defaultView = updates.defaultView;
  }
  if (updates.sidebarWidth && VALID_SIDEBAR_WIDTHS.includes(updates.sidebarWidth)) {
    valid.sidebarWidth = updates.sidebarWidth;
  }
  if (typeof updates.animationsEnabled === 'boolean') {
    valid.animationsEnabled = updates.animationsEnabled;
  }
  if (typeof updates.showBadges === 'boolean') {
    valid.showBadges = updates.showBadges;
  }
  if (typeof updates.showAISummaries === 'boolean') {
    valid.showAISummaries = updates.showAISummaries;
  }

  return valid;
}

// Normalize user input to valid nav item
function normalizeNavItem(input) {
  const normalized = input.toLowerCase().trim();

  // Direct matches
  if (VALID_NAV_ITEMS.includes(normalized)) {
    return normalized;
  }

  // Common aliases
  const aliases = {
    'cal': 'calendar',
    'channel': 'channels',
    'task': 'tasks',
    'goal': 'goals',
    'project': 'projects',
    'insight': 'insights',
    'ai insights': 'insights',
    'home': 'digest',
    'dashboard': 'digest',
    'chat': 'raven',
    'ai': 'raven',
    'kb': 'knowledge',
    'knowledge base': 'knowledge',
    'docs': 'knowledge',
    'members': 'team',
    'people': 'team'
  };

  return aliases[normalized] || null;
}

// Format nav item for display
function formatNavItemName(item) {
  const names = {
    digest: 'Digest',
    raven: 'Raven',
    channels: 'Channels',
    tasks: 'Tasks',
    goals: 'Goals',
    projects: 'Projects',
    calendar: 'Calendar',
    insights: 'AI Insights',
    team: 'Team',
    knowledge: 'Knowledge'
  };
  return names[item] || item;
}

export default {
  // Get preferences
  getTeamDefaults,
  getUserPreferences,
  getEffectivePreferences,

  // Update preferences
  updateTeamDefaults,
  updateUserPreferences,
  resetUserPreferences,

  // Nav operations
  hideNavItem,
  showNavItem,
  moveNavItem,
  getHiddenItems,

  // Density/view operations
  setDensity,
  setAnimations,
  setBadges,
  setAISummaries,

  // AI simplification
  simplifyView,

  // Usage tracking
  trackUsageEvent,
  analyzeUsagePatterns,
  getAISuggestions
};
