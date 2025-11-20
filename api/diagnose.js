/**
 * Diagnostic endpoint to test imports
 */

export default async function handler(req, res) {
  const results = {};

  try {
    // Test 1: Basic imports
    results.pg = 'testing...';
    const pg = await import('pg');
    results.pg = 'ok';

    // Test 2: OpenAI
    results.openai = 'testing...';
    const OpenAI = await import('openai');
    results.openai = 'ok';

    // Test 3: Apollo
    results.apollo = 'testing...';
    const apollo = await import('@apollo/server');
    results.apollo = 'ok';

    // Test 4: Backend db
    results.db = 'testing...';
    const db = await import('../backend/db.js');
    results.db = 'ok';

    // Test 5: LLM utils
    results.llm = 'testing...';
    const llm = await import('../backend/utils/llm.js');
    results.llm = 'ok';

    // Test 6: Schema
    results.schema = 'testing...';
    const schema = await import('../backend/graphql/schema.js');
    results.schema = 'ok';

    // Test 7: Resolvers
    results.resolvers = 'testing...';
    const resolvers = await import('../backend/graphql/resolvers/index.js');
    results.resolvers = 'ok';

    res.status(200).json({
      status: 'all imports successful',
      results
    });
  } catch (error) {
    res.status(500).json({
      status: 'import failed',
      results,
      error: {
        message: error.message,
        stack: error.stack
      }
    });
  }
}
