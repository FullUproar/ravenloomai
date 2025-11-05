/**
 * Persona Creation Validation
 *
 * Safety-first validation for user-created personas.
 * Prevents abuse while allowing creative freedom within guardrails.
 */

import { ValidationError } from './validation.js';

// Blocklist of inappropriate terms and hate figures
const BLOCKLIST = [
  // Hate figures
  'hitler', 'nazi', 'stalin', 'mussolini', 'bin laden',
  'kkk', 'isis', 'al qaeda', 'white supremacist', 'terrorist',

  // Offensive terms
  'fuck', 'shit', 'bitch', 'ass', 'damn', 'crap',
  'whore', 'slut', 'bastard', 'dick', 'piss',

  // Inappropriate modifiers
  'sexy', 'sexual', 'horny', 'kinky', 'erotic',
  'evil', 'satanic', 'demonic', 'killer', 'murderer',

  // Sensitive topics (context-dependent, but safer to block)
  'slave', 'master race', 'genocide', 'holocaust denier',
];

// Allowed archetypes (must match archetypes.js)
const ALLOWED_ARCHETYPES = [
  'coach',
  'advisor',
  'strategist',
  'partner',
  'manager',
  'coordinator',
];

// Prompt injection patterns
const INJECTION_PATTERNS = [
  /ignore (all )?previous (instructions?|prompts?)/i,
  /disregard (all )?previous (instructions?|prompts?)/i,
  /forget (all )?previous (instructions?|prompts?)/i,
  /you are (now|actually) /i,
  /new instructions?:/i,
  /system: /i,
  /\[system\]/i,
  /<\|im_start\|>/i,
  /act as if you (are|were)/i,
  /pretend (you are|to be)/i,
];

/**
 * Validate display name
 *
 * Rules:
 * - Max 50 characters
 * - Must follow pattern: "[Name] the [Archetype]"
 * - No profanity or blocklist terms
 * - No special characters (alphanumeric + spaces only)
 *
 * @param {string} displayName - Proposed display name
 * @param {string} archetype - Selected archetype
 * @returns {Object} - { valid: boolean, error?: string }
 */
export function validateDisplayName(displayName, archetype) {
  // Length check
  if (!displayName || displayName.trim().length === 0) {
    return { valid: false, error: 'Display name is required' };
  }

  if (displayName.length > 50) {
    return { valid: false, error: 'Display name too long (max 50 characters)' };
  }

  // Normalize archetype for comparison
  const archetypeCapitalized = archetype.charAt(0).toUpperCase() + archetype.slice(1);

  // Pattern check: "[Name] the [Archetype]"
  const pattern = new RegExp(`^[\\w\\s]+ the ${archetypeCapitalized}$`, 'i');
  if (!pattern.test(displayName)) {
    return {
      valid: false,
      error: `Display name must follow pattern: "[Name] the ${archetypeCapitalized}"`,
      example: `Sarah the ${archetypeCapitalized}`,
    };
  }

  // Extract the name part (before " the Archetype")
  const namePart = displayName.split(' the ')[0];

  // Special characters check (allow only letters, numbers, spaces)
  if (!/^[a-zA-Z0-9\s]+$/.test(namePart)) {
    return { valid: false, error: 'Name can only contain letters, numbers, and spaces' };
  }

  // Blocklist check
  const blocklistMatch = matchesBlocklist(displayName);
  if (blocklistMatch) {
    return {
      valid: false,
      error: 'Display name contains inappropriate content',
      flagged: blocklistMatch,
    };
  }

  return { valid: true };
}

/**
 * Validate custom instructions
 *
 * Rules:
 * - Max 500 characters
 * - No prompt injection attempts
 * - No blocklist terms
 * - Should be moderated by OpenAI Moderation API (caller responsibility)
 *
 * @param {string} customInstructions - User-provided context
 * @returns {Object} - { valid: boolean, error?: string, flags?: Array }
 */
export function validateCustomInstructions(customInstructions) {
  if (!customInstructions || customInstructions.trim().length === 0) {
    return { valid: true }; // Optional field
  }

  // Length check
  if (customInstructions.length > 500) {
    return { valid: false, error: 'Custom instructions too long (max 500 characters)' };
  }

  // Prompt injection detection
  const injectionAttempts = detectPromptInjection(customInstructions);
  if (injectionAttempts.length > 0) {
    return {
      valid: false,
      error: 'Custom instructions contain disallowed patterns',
      flags: injectionAttempts,
    };
  }

  // Blocklist check
  const blocklistMatch = matchesBlocklist(customInstructions);
  if (blocklistMatch) {
    return {
      valid: false,
      error: 'Custom instructions contain inappropriate content',
      flagged: blocklistMatch,
    };
  }

  return { valid: true };
}

/**
 * Validate archetype selection
 *
 * @param {string} archetype - Selected archetype
 * @returns {Object} - { valid: boolean, error?: string }
 */
export function validateArchetype(archetype) {
  if (!archetype || archetype.trim().length === 0) {
    return { valid: false, error: 'Archetype is required' };
  }

  const normalized = archetype.toLowerCase();
  if (!ALLOWED_ARCHETYPES.includes(normalized)) {
    return {
      valid: false,
      error: 'Invalid archetype',
      allowed: ALLOWED_ARCHETYPES,
    };
  }

  return { valid: true };
}

/**
 * Validate communication preferences
 *
 * @param {Object} preferences - Communication preferences
 * @returns {Object} - { valid: boolean, error?: string }
 */
export function validateCommunicationPreferences(preferences) {
  if (!preferences || typeof preferences !== 'object') {
    return { valid: false, error: 'Communication preferences must be an object' };
  }

  // Formality (0-10 scale, 0=casual, 10=formal)
  if (preferences.formality !== undefined) {
    if (typeof preferences.formality !== 'number' || preferences.formality < 0 || preferences.formality > 10) {
      return { valid: false, error: 'Formality must be a number between 0 and 10' };
    }
  }

  // Emoji usage (0-10 scale, 0=none, 10=frequent)
  if (preferences.emojiUsage !== undefined) {
    if (typeof preferences.emojiUsage !== 'number' || preferences.emojiUsage < 0 || preferences.emojiUsage > 10) {
      return { valid: false, error: 'Emoji usage must be a number between 0 and 10' };
    }
  }

  // Check-in frequency
  if (preferences.checkinFrequency !== undefined) {
    const allowed = ['as_needed', 'daily', 'weekly', 'biweekly', 'monthly'];
    if (!allowed.includes(preferences.checkinFrequency)) {
      return {
        valid: false,
        error: 'Invalid check-in frequency',
        allowed,
      };
    }
  }

  return { valid: true };
}

/**
 * Validate complete persona creation request
 *
 * @param {Object} personaData - Complete persona data
 * @returns {Object} - { valid: boolean, errors: Array }
 */
export function validatePersonaCreation(personaData) {
  const errors = [];

  // Validate archetype
  const archetypeCheck = validateArchetype(personaData.archetype);
  if (!archetypeCheck.valid) {
    errors.push({ field: 'archetype', message: archetypeCheck.error });
  }

  // Validate specialization (must be done with archetype context in resolver)
  if (!personaData.specialization || personaData.specialization.trim().length === 0) {
    errors.push({ field: 'specialization', message: 'Specialization is required' });
  }

  // Validate display name
  if (archetypeCheck.valid) {
    const nameCheck = validateDisplayName(personaData.displayName, personaData.archetype);
    if (!nameCheck.valid) {
      errors.push({ field: 'displayName', message: nameCheck.error });
    }
  }

  // Validate custom instructions
  if (personaData.customInstructions) {
    const instructionsCheck = validateCustomInstructions(personaData.customInstructions);
    if (!instructionsCheck.valid) {
      errors.push({ field: 'customInstructions', message: instructionsCheck.error });
    }
  }

  // Validate communication preferences
  if (personaData.communicationPreferences) {
    const prefsCheck = validateCommunicationPreferences(personaData.communicationPreferences);
    if (!prefsCheck.valid) {
      errors.push({ field: 'communicationPreferences', message: prefsCheck.error });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Check if text matches blocklist
 *
 * @private
 * @param {string} text - Text to check
 * @returns {string|null} - Matched term or null
 */
function matchesBlocklist(text) {
  const normalized = text.toLowerCase();
  const matched = BLOCKLIST.find(blocked => normalized.includes(blocked));
  return matched || null;
}

/**
 * Detect prompt injection attempts
 *
 * @private
 * @param {string} text - Text to check
 * @returns {Array} - Array of matched patterns
 */
function detectPromptInjection(text) {
  const matches = [];
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      matches.push(pattern.source);
    }
  }
  return matches;
}

/**
 * Content moderation via OpenAI Moderation API
 *
 * NOTE: This should be called from the resolver, not here (requires OpenAI client)
 *
 * @param {string} text - Text to moderate
 * @returns {Promise<Object>} - { flagged: boolean, categories: Object }
 */
export async function moderateContent(text, openaiClient) {
  try {
    const moderation = await openaiClient.moderations.create({
      input: text,
    });

    const result = moderation.results[0];

    return {
      flagged: result.flagged,
      categories: result.categories,
      scores: result.category_scores,
    };
  } catch (error) {
    console.error('Content moderation failed:', error);
    // Fail safe - if moderation API is down, allow (log for review)
    return { flagged: false, error: error.message };
  }
}

export default {
  validateDisplayName,
  validateCustomInstructions,
  validateArchetype,
  validateCommunicationPreferences,
  validatePersonaCreation,
  moderateContent,
};
