/**
 * Validation Utility Functions
 *
 * Common validation patterns for inputs, types, and business logic.
 */

/**
 * Custom validation error
 */
export class ValidationError extends Error {
  constructor(message, field = null) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

/**
 * Validate required string field
 *
 * @param {any} value - Value to validate
 * @param {string} fieldName - Field name for error messages
 * @param {Object} options - Validation options
 * @param {number} options.minLength - Minimum length
 * @param {number} options.maxLength - Maximum length
 * @throws {ValidationError} If validation fails
 */
export function validateString(value, fieldName, options = {}) {
  if (value === null || value === undefined || value === '') {
    throw new ValidationError(`${fieldName} is required`, fieldName);
  }

  if (typeof value !== 'string') {
    throw new ValidationError(`${fieldName} must be a string`, fieldName);
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    throw new ValidationError(`${fieldName} cannot be empty`, fieldName);
  }

  if (options.minLength && trimmed.length < options.minLength) {
    throw new ValidationError(
      `${fieldName} must be at least ${options.minLength} characters`,
      fieldName
    );
  }

  if (options.maxLength && trimmed.length > options.maxLength) {
    throw new ValidationError(
      `${fieldName} must be at most ${options.maxLength} characters`,
      fieldName
    );
  }

  return trimmed;
}

/**
 * Validate optional string field
 *
 * @param {any} value - Value to validate
 * @param {string} fieldName - Field name for error messages
 * @param {Object} options - Validation options
 * @returns {string|null} - Validated string or null
 * @throws {ValidationError} If validation fails
 */
export function validateOptionalString(value, fieldName, options = {}) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  return validateString(value, fieldName, options);
}

/**
 * Validate required number field
 *
 * @param {any} value - Value to validate
 * @param {string} fieldName - Field name for error messages
 * @param {Object} options - Validation options
 * @param {number} options.min - Minimum value
 * @param {number} options.max - Maximum value
 * @param {boolean} options.integer - Must be integer
 * @throws {ValidationError} If validation fails
 */
export function validateNumber(value, fieldName, options = {}) {
  if (value === null || value === undefined) {
    throw new ValidationError(`${fieldName} is required`, fieldName);
  }

  const num = Number(value);

  if (isNaN(num)) {
    throw new ValidationError(`${fieldName} must be a number`, fieldName);
  }

  if (options.integer && !Number.isInteger(num)) {
    throw new ValidationError(`${fieldName} must be an integer`, fieldName);
  }

  if (options.min !== undefined && num < options.min) {
    throw new ValidationError(
      `${fieldName} must be at least ${options.min}`,
      fieldName
    );
  }

  if (options.max !== undefined && num > options.max) {
    throw new ValidationError(
      `${fieldName} must be at most ${options.max}`,
      fieldName
    );
  }

  return num;
}

/**
 * Validate optional number field
 *
 * @param {any} value - Value to validate
 * @param {string} fieldName - Field name for error messages
 * @param {Object} options - Validation options
 * @returns {number|null} - Validated number or null
 * @throws {ValidationError} If validation fails
 */
export function validateOptionalNumber(value, fieldName, options = {}) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  return validateNumber(value, fieldName, options);
}

/**
 * Validate enum value
 *
 * @param {any} value - Value to validate
 * @param {Array} allowedValues - Allowed values
 * @param {string} fieldName - Field name for error messages
 * @throws {ValidationError} If validation fails
 */
export function validateEnum(value, allowedValues, fieldName) {
  if (!allowedValues.includes(value)) {
    throw new ValidationError(
      `${fieldName} must be one of: ${allowedValues.join(', ')}`,
      fieldName
    );
  }

  return value;
}

/**
 * Validate date string or Date object
 *
 * @param {any} value - Value to validate
 * @param {string} fieldName - Field name for error messages
 * @param {Object} options - Validation options
 * @param {Date} options.minDate - Minimum date
 * @param {Date} options.maxDate - Maximum date
 * @returns {Date} - Valid Date object
 * @throws {ValidationError} If validation fails
 */
export function validateDate(value, fieldName, options = {}) {
  if (!value) {
    throw new ValidationError(`${fieldName} is required`, fieldName);
  }

  const date = value instanceof Date ? value : new Date(value);

  if (isNaN(date.getTime())) {
    throw new ValidationError(`${fieldName} is not a valid date`, fieldName);
  }

  if (options.minDate && date < options.minDate) {
    throw new ValidationError(
      `${fieldName} must be after ${options.minDate.toISOString()}`,
      fieldName
    );
  }

  if (options.maxDate && date > options.maxDate) {
    throw new ValidationError(
      `${fieldName} must be before ${options.maxDate.toISOString()}`,
      fieldName
    );
  }

  return date;
}

/**
 * Validate optional date
 *
 * @param {any} value - Value to validate
 * @param {string} fieldName - Field name for error messages
 * @param {Object} options - Validation options
 * @returns {Date|null} - Valid Date object or null
 * @throws {ValidationError} If validation fails
 */
export function validateOptionalDate(value, fieldName, options = {}) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  return validateDate(value, fieldName, options);
}

/**
 * Validate ID (must be positive integer)
 *
 * @param {any} value - Value to validate
 * @param {string} fieldName - Field name for error messages
 * @returns {number} - Valid ID
 * @throws {ValidationError} If validation fails
 */
export function validateId(value, fieldName) {
  const id = validateNumber(value, fieldName, { integer: true, min: 1 });
  return id;
}

/**
 * Validate optional ID
 *
 * @param {any} value - Value to validate
 * @param {string} fieldName - Field name for error messages
 * @returns {number|null} - Valid ID or null
 * @throws {ValidationError} If validation fails
 */
export function validateOptionalId(value, fieldName) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  return validateId(value, fieldName);
}

/**
 * Validate array field
 *
 * @param {any} value - Value to validate
 * @param {string} fieldName - Field name for error messages
 * @param {Object} options - Validation options
 * @param {number} options.minLength - Minimum array length
 * @param {number} options.maxLength - Maximum array length
 * @returns {Array} - Valid array
 * @throws {ValidationError} If validation fails
 */
export function validateArray(value, fieldName, options = {}) {
  if (!Array.isArray(value)) {
    throw new ValidationError(`${fieldName} must be an array`, fieldName);
  }

  if (options.minLength !== undefined && value.length < options.minLength) {
    throw new ValidationError(
      `${fieldName} must have at least ${options.minLength} items`,
      fieldName
    );
  }

  if (options.maxLength !== undefined && value.length > options.maxLength) {
    throw new ValidationError(
      `${fieldName} must have at most ${options.maxLength} items`,
      fieldName
    );
  }

  return value;
}

/**
 * Validate priority value (1-3)
 *
 * @param {any} value - Value to validate
 * @param {string} fieldName - Field name for error messages
 * @returns {number} - Valid priority (1, 2, or 3)
 * @throws {ValidationError} If validation fails
 */
export function validatePriority(value, fieldName = 'priority') {
  return validateEnum(value, [1, 2, 3], fieldName);
}

/**
 * Validate task/goal status
 *
 * @param {any} value - Value to validate
 * @param {string} fieldName - Field name for error messages
 * @returns {string} - Valid status
 * @throws {ValidationError} If validation fails
 */
export function validateStatus(value, fieldName = 'status') {
  const validStatuses = ['not_started', 'in_progress', 'blocked', 'done', 'cancelled', 'active', 'paused', 'completed', 'abandoned'];
  return validateEnum(value, validStatuses, fieldName);
}

export default {
  ValidationError,
  validateString,
  validateOptionalString,
  validateNumber,
  validateOptionalNumber,
  validateEnum,
  validateDate,
  validateOptionalDate,
  validateId,
  validateOptionalId,
  validateArray,
  validatePriority,
  validateStatus
};
