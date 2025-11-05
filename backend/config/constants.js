/**
 * Application Constants
 *
 * Centralized constants for magic numbers, enums, and configuration values.
 */

// ============================================================================
// PRIORITY LEVELS
// ============================================================================

export const PRIORITY = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3
};

export const PRIORITY_LABELS = {
  [PRIORITY.LOW]: 'Low',
  [PRIORITY.MEDIUM]: 'Medium',
  [PRIORITY.HIGH]: 'High'
};

// ============================================================================
// STATUS VALUES
// ============================================================================

export const TASK_STATUS = {
  NOT_STARTED: 'not_started',
  IN_PROGRESS: 'in_progress',
  BLOCKED: 'blocked',
  DONE: 'done',
  CANCELLED: 'cancelled'
};

export const GOAL_STATUS = {
  ACTIVE: 'active',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  ABANDONED: 'abandoned'
};

export const PROJECT_STATUS = {
  ACTIVE: 'active',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  ARCHIVED: 'archived'
};

export const ONBOARDING_STATUS = {
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  ABANDONED: 'abandoned'
};

// ============================================================================
// GTD (GETTING THINGS DONE) TYPES
// ============================================================================

export const GTD_TYPE = {
  NEXT_ACTION: 'next_action',
  WAITING_FOR: 'waiting_for',
  SOMEDAY_MAYBE: 'someday_maybe',
  PROJECT: 'project'
};

// ============================================================================
// CONTEXT (WHERE/HOW TASK CAN BE DONE)
// ============================================================================

export const CONTEXT = {
  ANYWHERE: '@anywhere',
  HOME: '@home',
  OFFICE: '@office',
  COMPUTER: '@computer',
  PHONE: '@phone',
  ERRANDS: '@errands'
};

// ============================================================================
// ENERGY LEVELS
// ============================================================================

export const ENERGY_LEVEL = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high'
};

// ============================================================================
// PERSONA ROLES
// ============================================================================

export const PERSONA_ROLE = {
  PRIMARY: 'primary',
  SPECIALIST: 'specialist',
  ADVISOR: 'advisor',
  MENTOR: 'mentor'
};

// ============================================================================
// PERSONA ARCHETYPES
// ============================================================================

export const PERSONA_ARCHETYPE = {
  COACH: 'coach',
  STRATEGIST: 'strategist',
  MENTOR: 'mentor',
  PARTNER: 'partner'
};

// ============================================================================
// PROJECT COMPLETION TYPES
// ============================================================================

export const COMPLETION_TYPE = {
  MILESTONE: 'milestone',
  HABIT_FORMATION: 'habit_formation',
  ONGOING: 'ongoing'
};

// ============================================================================
// MEMORY TIERS
// ============================================================================

export const MEMORY_TYPE = {
  SHORT_TERM: 'short_term',
  MEDIUM_TERM: 'medium_term',
  LONG_TERM: 'long_term'
};

export const MEMORY_CATEGORY = {
  FACT: 'fact',
  DECISION: 'decision',
  BLOCKER: 'blocker',
  PREFERENCE: 'preference',
  INSIGHT: 'insight'
};

// ============================================================================
// CONVERSATION SETTINGS
// ============================================================================

export const CONVERSATION = {
  MAX_RECENT_MESSAGES: 20,          // Messages to include in context
  SUMMARY_TRIGGER_COUNT: 20,        // Create summary after N messages
  MESSAGES_AFTER_SUMMARY: 10,       // Recent messages to keep after summary
  MAX_HISTORY_RETRIEVAL: 50         // Max messages to retrieve from database
};

// ============================================================================
// LLM SETTINGS
// ============================================================================

export const LLM = {
  DEFAULT_MODEL: 'gpt-4',
  DEFAULT_TEMPERATURE: 0.7,
  DEFAULT_MAX_TOKENS: 1000,
  FUNCTION_CALLING_MAX_TOKENS: 1500,
  MAX_TOKENS_LIMIT: 4096,
  MIN_TEMPERATURE: 0.0,
  MAX_TEMPERATURE: 2.0
};

// ============================================================================
// ONBOARDING FLOW IDS
// ============================================================================

export const ONBOARDING_FLOW = {
  PROJECT: 'project',
  GOAL: 'goal',
  TASK: 'task'
};

// ============================================================================
// PERSONA SWITCH TRIGGERS
// ============================================================================

export const SWITCH_TRIGGER_TYPE = {
  KEYWORD: 'keyword',
  TASK_TYPE: 'task_type',
  GOAL_TYPE: 'goal_type',
  TIME_OF_DAY: 'time_of_day',
  DAY_OF_WEEK: 'day_of_week',
  CONVERSATION_TOPIC: 'conversation_topic'
};

export const SWITCH_TRIGGER_BY = {
  USER: 'user',
  SYSTEM: 'system',
  AI: 'ai'
};

// ============================================================================
// VALIDATION LIMITS
// ============================================================================

export const VALIDATION = {
  TITLE_MIN_LENGTH: 3,
  TITLE_MAX_LENGTH: 200,
  DESCRIPTION_MAX_LENGTH: 2000,
  CUSTOM_INSTRUCTIONS_MAX_LENGTH: 5000,
  MIN_PRIORITY: 1,
  MAX_PRIORITY: 3,
  MIN_TIME_ESTIMATE: 1,              // minutes
  MAX_TIME_ESTIMATE: 480,            // 8 hours
  MAX_RECURRENCE_INTERVAL: 365       // days
};

// ============================================================================
// METRIC SOURCES
// ============================================================================

export const METRIC_SOURCE = {
  USER_REPORTED: 'user_reported',
  DEVICE: 'device',
  APP: 'app',
  AI: 'ai',
  AUTOMATED: 'automated'
};

// ============================================================================
// RECURRENCE TYPES
// ============================================================================

export const RECURRENCE_TYPE = {
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  YEARLY: 'yearly'
};

export const RECURRENCE_END_TYPE = {
  NEVER: 'never',
  AFTER_DATE: 'after_date',
  AFTER_COUNT: 'after_count'
};

// ============================================================================
// DATABASE ERRORS
// ============================================================================

export const DB_ERROR_CODE = {
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
  NOT_NULL_VIOLATION: '23502',
  CHECK_VIOLATION: '23514'
};

// ============================================================================
// DAYS OF WEEK (0 = Sunday)
// ============================================================================

export const DAY_OF_WEEK = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6
};

// ============================================================================
// EXPORT ALL
// ============================================================================

export default {
  PRIORITY,
  PRIORITY_LABELS,
  TASK_STATUS,
  GOAL_STATUS,
  PROJECT_STATUS,
  ONBOARDING_STATUS,
  GTD_TYPE,
  CONTEXT,
  ENERGY_LEVEL,
  PERSONA_ROLE,
  PERSONA_ARCHETYPE,
  COMPLETION_TYPE,
  MEMORY_TYPE,
  MEMORY_CATEGORY,
  CONVERSATION,
  LLM,
  ONBOARDING_FLOW,
  SWITCH_TRIGGER_TYPE,
  SWITCH_TRIGGER_BY,
  VALIDATION,
  METRIC_SOURCE,
  RECURRENCE_TYPE,
  RECURRENCE_END_TYPE,
  DB_ERROR_CODE,
  DAY_OF_WEEK
};
