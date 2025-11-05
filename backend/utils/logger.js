/**
 * Logging Service
 *
 * Centralized logging with levels, formatting, and optional persistence.
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

const LOG_COLORS = {
  DEBUG: '\x1b[36m', // Cyan
  INFO: '\x1b[32m',  // Green
  WARN: '\x1b[33m',  // Yellow
  ERROR: '\x1b[31m'  // Red
};

const RESET_COLOR = '\x1b[0m';

class Logger {
  constructor() {
    // Set log level from environment or default to INFO
    this.logLevel = LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase()] ?? LOG_LEVELS.INFO;
    this.enableColors = process.env.NODE_ENV !== 'production';
  }

  /**
   * Format log message with timestamp and level
   *
   * @private
   */
  _format(level, message, context = {}) {
    const timestamp = new Date().toISOString();
    const contextStr = Object.keys(context).length > 0
      ? ` ${JSON.stringify(context)}`
      : '';

    return `[${timestamp}] [${level}]${contextStr} ${message}`;
  }

  /**
   * Write log to output
   *
   * @private
   */
  _write(level, message, context = {}) {
    const formatted = this._format(level, message, context);

    if (this.enableColors) {
      const color = LOG_COLORS[level] || '';
      console.log(`${color}${formatted}${RESET_COLOR}`);
    } else {
      console.log(formatted);
    }

    // TODO: Add persistent logging to file or external service
    // if (level === 'ERROR' || level === 'WARN') {
    //   this._persistLog(level, message, context);
    // }
  }

  /**
   * Log debug message (verbose information for development)
   *
   * @param {string} message - Log message
   * @param {Object} context - Additional context
   */
  debug(message, context = {}) {
    if (this.logLevel <= LOG_LEVELS.DEBUG) {
      this._write('DEBUG', message, context);
    }
  }

  /**
   * Log info message (general information)
   *
   * @param {string} message - Log message
   * @param {Object} context - Additional context
   */
  info(message, context = {}) {
    if (this.logLevel <= LOG_LEVELS.INFO) {
      this._write('INFO', message, context);
    }
  }

  /**
   * Log warning message (something unexpected but not critical)
   *
   * @param {string} message - Log message
   * @param {Object} context - Additional context
   */
  warn(message, context = {}) {
    if (this.logLevel <= LOG_LEVELS.WARN) {
      this._write('WARN', message, context);
    }
  }

  /**
   * Log error message (something failed)
   *
   * @param {string} message - Log message
   * @param {Error|Object} error - Error object or context
   */
  error(message, error = {}) {
    if (this.logLevel <= LOG_LEVELS.ERROR) {
      const context = error instanceof Error
        ? { error: error.message, stack: error.stack }
        : error;

      this._write('ERROR', message, context);
    }
  }

  /**
   * Log with custom emoji prefix (for visual categorization)
   *
   * @param {string} emoji - Emoji prefix
   * @param {string} message - Log message
   * @param {Object} context - Additional context
   */
  custom(emoji, message, context = {}) {
    this.info(`${emoji} ${message}`, context);
  }

  /**
   * Log database operation
   *
   * @param {string} operation - Operation name (INSERT, UPDATE, etc.)
   * @param {string} table - Table name
   * @param {Object} context - Additional context
   */
  database(operation, table, context = {}) {
    this.debug(`💾 Database ${operation} on ${table}`, context);
  }

  /**
   * Log API call
   *
   * @param {string} service - Service name (OpenAI, etc.)
   * @param {string} endpoint - Endpoint or operation
   * @param {Object} context - Additional context
   */
  api(service, endpoint, context = {}) {
    this.debug(`🌐 API call to ${service}.${endpoint}`, context);
  }

  /**
   * Log performance metric
   *
   * @param {string} operation - Operation name
   * @param {number} durationMs - Duration in milliseconds
   * @param {Object} context - Additional context
   */
  performance(operation, durationMs, context = {}) {
    this.debug(`⏱️  ${operation} took ${durationMs}ms`, context);
  }

  /**
   * Log AI function execution
   *
   * @param {string} functionName - Function name
   * @param {Object} args - Function arguments
   */
  aiFunction(functionName, args = {}) {
    this.info(`🤖 AI Function: ${functionName}`, { args });
  }

  /**
   * Log persona switch
   *
   * @param {string} fromPersona - Previous persona name
   * @param {string} toPersona - New persona name
   * @param {string} reason - Switch reason
   */
  personaSwitch(fromPersona, toPersona, reason) {
    this.info(`🔄 Persona switch: ${fromPersona || 'none'} → ${toPersona}`, { reason });
  }

  /**
   * Log onboarding progress
   *
   * @param {string} flowId - Flow ID
   * @param {string} step - Current step
   * @param {Object} context - Additional context
   */
  onboarding(flowId, step, context = {}) {
    this.info(`🎯 Onboarding [${flowId}]: ${step}`, context);
  }
}

// Create singleton instance
const logger = new Logger();

// Export singleton and class
export { logger, Logger };
export default logger;
