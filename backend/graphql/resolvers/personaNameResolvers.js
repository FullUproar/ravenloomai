/**
 * Persona Name Resolvers
 *
 * Handles unique persona name claiming and availability checking.
 */

import db from '../../db.js';

const personaNameResolvers = {
  Query: {
    /**
     * Get available names for an archetype
     * Returns names that haven't been claimed for this archetype yet
     */
    getAvailableNames: async (_, { archetype }) => {
      try {
        const result = await db.query(
          `SELECT
            an.id,
            an.name,
            an.popularity_rank as "popularityRank",
            an.times_claimed as "timesClaimed",
            CASE
              WHEN pn.id IS NULL THEN true
              ELSE false
            END as "isAvailable"
          FROM available_names an
          LEFT JOIN persona_names pn ON an.name = pn.name AND pn.archetype = $1
          ORDER BY an.popularity_rank ASC NULLS LAST, an.name ASC`,
          [archetype]
        );

        return result.rows;
      } catch (error) {
        console.error('Error fetching available names:', error);
        throw new Error('Failed to fetch available names');
      }
    },

    /**
     * Check if a specific name is available for an archetype
     */
    checkNameAvailability: async (_, { name, archetype }) => {
      try {
        const result = await db.query(
          `SELECT id FROM persona_names
           WHERE name = $1 AND archetype = $2`,
          [name, archetype]
        );

        return result.rows.length === 0; // Available if no rows found
      } catch (error) {
        console.error('Error checking name availability:', error);
        throw new Error('Failed to check name availability');
      }
    },

    /**
     * Get all persona names claimed by a user
     */
    getUserPersonaNames: async (_, { userId }) => {
      try {
        const result = await db.query(
          `SELECT
            id,
            name,
            archetype,
            user_id as "userId",
            persona_id as "personaId",
            claimed_at as "claimedAt"
          FROM persona_names
          WHERE user_id = $1
          ORDER BY claimed_at DESC`,
          [userId]
        );

        return result.rows;
      } catch (error) {
        console.error('Error fetching user persona names:', error);
        throw new Error('Failed to fetch user persona names');
      }
    },
  },

  Mutation: {
    /**
     * Claim a persona name for a user
     * The name becomes unavailable for this archetype globally
     */
    claimPersonaName: async (_, { userId, name, archetype, color, shape }) => {
      const client = await db.connect();

      try {
        await client.query('BEGIN');

        // Check if name exists in available_names
        const nameCheck = await client.query(
          'SELECT id FROM available_names WHERE name = $1',
          [name]
        );

        if (nameCheck.rows.length === 0) {
          throw new Error(`Name "${name}" is not in the approved names list`);
        }

        // Check if already claimed for this archetype
        const claimCheck = await client.query(
          'SELECT id FROM persona_names WHERE name = $1 AND archetype = $2',
          [name, archetype]
        );

        if (claimCheck.rows.length > 0) {
          throw new Error(`Name "${name}" is already claimed for archetype "${archetype}"`);
        }

        // Claim the name
        const result = await client.query(
          `INSERT INTO persona_names (name, archetype, user_id)
           VALUES ($1, $2, $3)
           RETURNING
             id,
             name,
             archetype,
             user_id as "userId",
             persona_id as "personaId",
             claimed_at as "claimedAt"`,
          [name, archetype, userId]
        );

        // Update times_claimed counter
        await client.query(
          `UPDATE available_names
           SET times_claimed = times_claimed + 1
           WHERE name = $1`,
          [name]
        );

        await client.query('COMMIT');

        return result.rows[0];
      } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error claiming persona name:', error);
        throw error;
      } finally {
        client.release();
      }
    },

    /**
     * Release a persona name back to the available pool
     */
    releasePersonaName: async (_, { personaNameId }) => {
      const client = await db.connect();

      try {
        await client.query('BEGIN');

        // Get the name before deleting
        const nameResult = await client.query(
          'SELECT name FROM persona_names WHERE id = $1',
          [personaNameId]
        );

        if (nameResult.rows.length === 0) {
          throw new Error('Persona name not found');
        }

        const name = nameResult.rows[0].name;

        // Delete the claim
        await client.query(
          'DELETE FROM persona_names WHERE id = $1',
          [personaNameId]
        );

        // Decrement times_claimed counter
        await client.query(
          `UPDATE available_names
           SET times_claimed = GREATEST(times_claimed - 1, 0)
           WHERE name = $1`,
          [name]
        );

        await client.query('COMMIT');

        return true;
      } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error releasing persona name:', error);
        throw error;
      } finally {
        client.release();
      }
    },
  },
};

export default personaNameResolvers;
