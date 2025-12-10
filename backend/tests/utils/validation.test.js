/**
 * Validation Utilities Tests
 *
 * Comprehensive tests for validation functions.
 */

import {
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
  validatePriority,
  validateStatus
} from '../../utils/validation.js';

describe('Validation Utils', () => {
  describe('validateString', () => {
    it('should pass for valid string', () => {
      const result = validateString('Hello World', 'testField');
      expect(result).toBe('Hello World');
    });

    it('should trim whitespace', () => {
      const result = validateString('  Hello World  ', 'testField');
      expect(result).toBe('Hello World');
    });

    it('should throw ValidationError for null', () => {
      expect(() => {
        validateString(null, 'testField');
      }).toThrow(ValidationError);
    });

    it('should throw ValidationError for undefined', () => {
      expect(() => {
        validateString(undefined, 'testField');
      }).toThrow(ValidationError);
    });

    it('should throw ValidationError for empty string', () => {
      expect(() => {
        validateString('', 'testField');
      }).toThrow(ValidationError);
    });

    it('should throw ValidationError for whitespace-only string', () => {
      expect(() => {
        validateString('   ', 'testField');
      }).toThrow(ValidationError);
    });

    it('should throw ValidationError for non-string', () => {
      expect(() => {
        validateString(123, 'testField');
      }).toThrow(ValidationError);

      expect(() => {
        validateString({}, 'testField');
      }).toThrow(ValidationError);
    });

    it('should validate minimum length', () => {
      expect(() => {
        validateString('Hi', 'testField', { minLength: 3 });
      }).toThrow(ValidationError);

      const result = validateString('Hello', 'testField', { minLength: 3 });
      expect(result).toBe('Hello');
    });

    it('should validate maximum length', () => {
      expect(() => {
        validateString('Hello World', 'testField', { maxLength: 5 });
      }).toThrow(ValidationError);

      const result = validateString('Hello', 'testField', { maxLength: 10 });
      expect(result).toBe('Hello');
    });

    it('should include field name in error message', () => {
      try {
        validateString('', 'username');
        fail('Should have thrown');
      } catch (error) {
        expect(error.message).toContain('username');
        expect(error.field).toBe('username');
      }
    });
  });

  describe('validateOptionalString', () => {
    it('should return null for null', () => {
      expect(validateOptionalString(null, 'testField')).toBeNull();
    });

    it('should return null for undefined', () => {
      expect(validateOptionalString(undefined, 'testField')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(validateOptionalString('', 'testField')).toBeNull();
    });

    it('should validate non-empty strings', () => {
      const result = validateOptionalString('Hello', 'testField');
      expect(result).toBe('Hello');
    });

    it('should apply length constraints', () => {
      expect(() => {
        validateOptionalString('Hi', 'testField', { minLength: 3 });
      }).toThrow(ValidationError);
    });
  });

  describe('validateNumber', () => {
    it('should pass for valid number', () => {
      expect(validateNumber(42, 'testField')).toBe(42);
      expect(validateNumber(0, 'testField')).toBe(0);
      expect(validateNumber(-10, 'testField')).toBe(-10);
      expect(validateNumber(3.14, 'testField')).toBe(3.14);
    });

    it('should convert string numbers', () => {
      expect(validateNumber('42', 'testField')).toBe(42);
      expect(validateNumber('3.14', 'testField')).toBe(3.14);
    });

    it('should throw for null', () => {
      expect(() => {
        validateNumber(null, 'testField');
      }).toThrow(ValidationError);
    });

    it('should throw for undefined', () => {
      expect(() => {
        validateNumber(undefined, 'testField');
      }).toThrow(ValidationError);
    });

    it('should throw for NaN', () => {
      expect(() => {
        validateNumber(NaN, 'testField');
      }).toThrow(ValidationError);

      expect(() => {
        validateNumber('not a number', 'testField');
      }).toThrow(ValidationError);
    });

    it('should validate minimum value', () => {
      expect(() => {
        validateNumber(5, 'testField', { min: 10 });
      }).toThrow(ValidationError);

      expect(validateNumber(10, 'testField', { min: 10 })).toBe(10);
      expect(validateNumber(15, 'testField', { min: 10 })).toBe(15);
    });

    it('should validate maximum value', () => {
      expect(() => {
        validateNumber(15, 'testField', { max: 10 });
      }).toThrow(ValidationError);

      expect(validateNumber(10, 'testField', { max: 10 })).toBe(10);
      expect(validateNumber(5, 'testField', { max: 10 })).toBe(5);
    });

    it('should validate integer when required', () => {
      expect(() => {
        validateNumber(3.14, 'testField', { integer: true });
      }).toThrow(ValidationError);

      expect(validateNumber(42, 'testField', { integer: true })).toBe(42);
    });
  });

  describe('validateOptionalNumber', () => {
    it('should return null for null', () => {
      expect(validateOptionalNumber(null, 'testField')).toBeNull();
    });

    it('should return null for undefined', () => {
      expect(validateOptionalNumber(undefined, 'testField')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(validateOptionalNumber('', 'testField')).toBeNull();
    });

    it('should validate non-null numbers', () => {
      expect(validateOptionalNumber(42, 'testField')).toBe(42);
    });
  });

  describe('validateEnum', () => {
    const validValues = ['red', 'green', 'blue'];

    it('should pass for valid enum value', () => {
      expect(validateEnum('red', validValues, 'color')).toBe('red');
      expect(validateEnum('green', validValues, 'color')).toBe('green');
      expect(validateEnum('blue', validValues, 'color')).toBe('blue');
    });

    it('should throw for invalid enum value', () => {
      expect(() => {
        validateEnum('yellow', validValues, 'color');
      }).toThrow(ValidationError);
    });

    it('should include valid options in error message', () => {
      try {
        validateEnum('yellow', validValues, 'color');
        fail('Should have thrown');
      } catch (error) {
        expect(error.message).toContain('red, green, blue');
      }
    });
  });

  describe('validateDate', () => {
    it('should pass for valid Date object', () => {
      const date = new Date('2025-01-01');
      const result = validateDate(date, 'testField');
      expect(result).toEqual(date);
    });

    it('should pass for valid date string', () => {
      const result = validateDate('2025-01-01', 'testField');
      expect(result).toBeInstanceOf(Date);
      // Use UTC to avoid timezone issues
      expect(result.getUTCFullYear()).toBe(2025);
    });

    it('should throw for invalid date string', () => {
      expect(() => {
        validateDate('not a date', 'testField');
      }).toThrow(ValidationError);
    });

    it('should throw for null', () => {
      expect(() => {
        validateDate(null, 'testField');
      }).toThrow(ValidationError);
    });

    it('should validate minimum date', () => {
      const minDate = new Date('2025-01-01');

      expect(() => {
        validateDate('2024-12-31', 'testField', { minDate });
      }).toThrow(ValidationError);

      const result = validateDate('2025-01-02', 'testField', { minDate });
      expect(result.getTime()).toBeGreaterThan(minDate.getTime());
    });

    it('should validate maximum date', () => {
      const maxDate = new Date('2025-12-31');

      expect(() => {
        validateDate('2026-01-01', 'testField', { maxDate });
      }).toThrow(ValidationError);

      const result = validateDate('2025-12-30', 'testField', { maxDate });
      expect(result.getTime()).toBeLessThan(maxDate.getTime());
    });
  });

  describe('validateOptionalDate', () => {
    it('should return null for null', () => {
      expect(validateOptionalDate(null, 'testField')).toBeNull();
    });

    it('should return null for undefined', () => {
      expect(validateOptionalDate(undefined, 'testField')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(validateOptionalDate('', 'testField')).toBeNull();
    });

    it('should validate non-null dates', () => {
      const result = validateOptionalDate('2025-01-01', 'testField');
      expect(result).toBeInstanceOf(Date);
    });
  });

  describe('validateId', () => {
    it('should pass for positive integers', () => {
      expect(validateId(1, 'testId')).toBe(1);
      expect(validateId(123, 'testId')).toBe(123);
      expect(validateId(999999, 'testId')).toBe(999999);
    });

    it('should convert string integers', () => {
      expect(validateId('123', 'testId')).toBe(123);
    });

    it('should throw for zero', () => {
      expect(() => {
        validateId(0, 'testId');
      }).toThrow(ValidationError);
    });

    it('should throw for negative numbers', () => {
      expect(() => {
        validateId(-1, 'testId');
      }).toThrow(ValidationError);
    });

    it('should throw for decimals', () => {
      expect(() => {
        validateId(1.5, 'testId');
      }).toThrow(ValidationError);
    });
  });

  describe('validateOptionalId', () => {
    it('should return null for null', () => {
      expect(validateOptionalId(null, 'testId')).toBeNull();
    });

    it('should return null for undefined', () => {
      expect(validateOptionalId(undefined, 'testId')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(validateOptionalId('', 'testId')).toBeNull();
    });

    it('should validate non-null IDs', () => {
      expect(validateOptionalId(123, 'testId')).toBe(123);
    });
  });

  describe('validatePriority', () => {
    it('should pass for valid priorities', () => {
      expect(validatePriority(1)).toBe(1);
      expect(validatePriority(2)).toBe(2);
      expect(validatePriority(3)).toBe(3);
    });

    it('should throw for invalid priorities', () => {
      expect(() => validatePriority(0)).toThrow(ValidationError);
      expect(() => validatePriority(4)).toThrow(ValidationError);
      expect(() => validatePriority(1.5)).toThrow(ValidationError);
    });
  });

  describe('validateStatus', () => {
    it('should pass for valid task statuses', () => {
      expect(validateStatus('not_started')).toBe('not_started');
      expect(validateStatus('in_progress')).toBe('in_progress');
      expect(validateStatus('blocked')).toBe('blocked');
      expect(validateStatus('done')).toBe('done');
      expect(validateStatus('cancelled')).toBe('cancelled');
    });

    it('should pass for valid goal statuses', () => {
      expect(validateStatus('active')).toBe('active');
      expect(validateStatus('paused')).toBe('paused');
      expect(validateStatus('completed')).toBe('completed');
      expect(validateStatus('abandoned')).toBe('abandoned');
    });

    it('should throw for invalid status', () => {
      expect(() => {
        validateStatus('invalid_status');
      }).toThrow(ValidationError);
    });
  });
});
