/**
 * JSON Utility Functions
 *
 * Safe JSON parsing and stringification with fallbacks.
 */

/**
 * Safely parse JSON with fallback value
 *
 * @param {any} value - Value to parse
 * @param {any} fallback - Fallback value if parsing fails
 * @returns {any} - Parsed value or fallback
 */
export function safeJsonParse(value, fallback = null) {
  // Already parsed
  if (value === null || value === undefined) {
    return fallback;
  }

  // Already an object
  if (typeof value === 'object') {
    return value;
  }

  // Try to parse string
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (error) {
      console.warn('Failed to parse JSON:', error.message);
      return fallback;
    }
  }

  // Unexpected type
  return fallback;
}

/**
 * Safely stringify value to JSON
 *
 * @param {any} value - Value to stringify
 * @param {string} fallback - Fallback string if stringification fails
 * @returns {string} - JSON string or fallback
 */
export function safeJsonStringify(value, fallback = null) {
  if (value === null || value === undefined) {
    return fallback;
  }

  try {
    return JSON.stringify(value);
  } catch (error) {
    console.warn('Failed to stringify JSON:', error.message);
    return fallback;
  }
}

/**
 * Parse JSON array from database column
 *
 * @param {any} value - Value from database
 * @returns {Array} - Parsed array or empty array
 */
export function parseJsonArray(value) {
  return safeJsonParse(value, []);
}

/**
 * Parse JSON object from database column
 *
 * @param {any} value - Value from database
 * @returns {Object} - Parsed object or empty object
 */
export function parseJsonObject(value) {
  return safeJsonParse(value, {});
}

export default {
  safeJsonParse,
  safeJsonStringify,
  parseJsonArray,
  parseJsonObject
};
