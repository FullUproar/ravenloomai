import db from './db.js';
import { ChatLLM } from './llm/chat.js';

export default {
  Query: {
    getPlan: async (_, { userId }) => {
      const result = await db.query('SELECT * FROM plans WHERE user_id = $1 LIMIT 1', [userId]);
      return result.rows[0];
    }
  },

  Mutation: {
    savePlan: async (_, { userId, input }) => {
      const { businessName, description, productOrService } = input;

      const result = await db.query(
        `INSERT INTO plans (user_id, business_name, description, product_or_service)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id) DO UPDATE SET
           business_name = EXCLUDED.business_name,
           description = EXCLUDED.description,
           product_or_service = EXCLUDED.product_or_service
         RETURNING *`,
        [userId, businessName, description, productOrService]
      );

      return result.rows[0];
    },

    chat: async (_, { userId, message }) => {
      const planRes = await db.query('SELECT * FROM plans WHERE user_id = $1', [userId]);
      const plan = planRes.rows[0];
      const llm = new ChatLLM(process.env.OPENAI_API_KEY);

      const reply = await llm.getResponse(plan, message);
      return { reply };
    }
  }
};
