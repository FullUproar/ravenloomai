/**
 * Database Utility Functions
 *
 * Provides common database query patterns with consistent error handling.
 */

import db from '../db.js';

/**
 * Execute a query and return a single row
 *
 * @param {string} query - SQL query
 * @param {Array} params - Query parameters
 * @param {string} errorMessage - Custom error message if row not found
 * @returns {Promise<Object>} - Single row
 * @throws {Error} If no rows found or query fails
 */
export async function queryOne(query, params = [], errorMessage = 'Record not found') {
  try {
    const result = await db.query(query, params);

    if (result.rows.length === 0) {
      throw new Error(errorMessage);
    }

    return result.rows[0];
  } catch (error) {
    if (error.message === errorMessage) {
      throw error; // Re-throw our custom error
    }
    throw new Error(`Database query failed: ${error.message}`);
  }
}

/**
 * Execute a query and return first row or null
 *
 * @param {string} query - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<Object|null>} - First row or null
 * @throws {Error} If query fails
 */
export async function queryFirst(query, params = []) {
  try {
    const result = await db.query(query, params);
    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    throw new Error(`Database query failed: ${error.message}`);
  }
}

/**
 * Execute a query and return all rows
 *
 * @param {string} query - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<Array>} - Array of rows (empty if no results)
 * @throws {Error} If query fails
 */
export async function queryMany(query, params = []) {
  try {
    const result = await db.query(query, params);
    return result.rows;
  } catch (error) {
    throw new Error(`Database query failed: ${error.message}`);
  }
}

/**
 * Execute an INSERT query and return the created record
 *
 * @param {string} query - SQL INSERT query with RETURNING *
 * @param {Array} params - Query parameters
 * @param {string} errorMessage - Custom error message if insert fails
 * @returns {Promise<Object>} - Inserted row
 * @throws {Error} If insert fails
 */
export async function insertOne(query, params = [], errorMessage = 'Failed to create record') {
  try {
    const result = await db.query(query, params);

    if (result.rows.length === 0) {
      throw new Error(errorMessage);
    }

    return result.rows[0];
  } catch (error) {
    // Check for common PostgreSQL errors
    if (error.code === '23505') {
      throw new Error('A record with these values already exists');
    }
    if (error.code === '23503') {
      throw new Error('Referenced record does not exist');
    }
    if (error.code === '23502') {
      throw new Error('Required field is missing');
    }

    throw new Error(`${errorMessage}: ${error.message}`);
  }
}

/**
 * Execute an UPDATE query and return the updated record
 *
 * @param {string} query - SQL UPDATE query with RETURNING *
 * @param {Array} params - Query parameters
 * @param {string} errorMessage - Custom error message if update fails
 * @returns {Promise<Object>} - Updated row
 * @throws {Error} If update fails or no rows affected
 */
export async function updateOne(query, params = [], errorMessage = 'Failed to update record') {
  try {
    const result = await db.query(query, params);

    if (result.rows.length === 0) {
      throw new Error('Record not found or no changes made');
    }

    return result.rows[0];
  } catch (error) {
    throw new Error(`${errorMessage}: ${error.message}`);
  }
}

/**
 * Execute a DELETE query
 *
 * @param {string} query - SQL DELETE query
 * @param {Array} params - Query parameters
 * @returns {Promise<boolean>} - True if rows were deleted
 * @throws {Error} If delete fails
 */
export async function deleteRecords(query, params = []) {
  try {
    const result = await db.query(query, params);
    return result.rowCount > 0;
  } catch (error) {
    throw new Error(`Failed to delete records: ${error.message}`);
  }
}

/**
 * Execute a query in a transaction
 *
 * @param {Function} callback - Async function that performs queries
 * @returns {Promise<any>} - Result of callback
 * @throws {Error} If transaction fails (automatically rolls back)
 */
export async function transaction(callback) {
  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw new Error(`Transaction failed: ${error.message}`);
  } finally {
    client.release();
  }
}

export default {
  queryOne,
  queryFirst,
  queryMany,
  insertOne,
  updateOne,
  deleteRecords,
  transaction
};
