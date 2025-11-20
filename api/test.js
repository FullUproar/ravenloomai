/**
 * Minimal test endpoint to verify environment
 */

export default async function handler(req, res) {
  try {
    // Test if environment variables are accessible
    const hasPostgresUrl = !!process.env.POSTGRES_URL;
    const hasDatabaseUrl = !!process.env.DATABASE_URL;
    const hasOpenAI = !!process.env.OPENAI_API_KEY;
    const isVercel = !!process.env.VERCEL;

    res.status(200).json({
      status: 'ok',
      environment: {
        POSTGRES_URL: hasPostgresUrl ? 'present' : 'missing',
        DATABASE_URL: hasDatabaseUrl ? 'present' : 'missing',
        OPENAI_API_KEY: hasOpenAI ? 'present' : 'missing',
        VERCEL: isVercel ? 'yes' : 'no',
        NODE_ENV: process.env.NODE_ENV || 'undefined'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
      stack: error.stack
    });
  }
}
