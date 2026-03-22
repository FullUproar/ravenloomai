import pkg from 'pg';
import dotenv from 'dotenv';

// Only load .env in local development (Vercel injects env vars directly)
if (!process.env.VERCEL) {
  dotenv.config();
}

const { Pool } = pkg;

// Vercel Postgres uses DB_POSTGRES_URL prefix when linked to project
// Priority: DB_POSTGRES_URL (Vercel linked) > POSTGRES_URL > DATABASE_URL
const connectionString = process.env.DB_POSTGRES_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL;

const db = new Pool({
  connectionString,
  ssl: process.env.NODE_ENV === 'production' || process.env.VERCEL ? { rejectUnauthorized: false } : { rejectUnauthorized: false },
  max: 3,
  idleTimeoutMillis: 20000,
  connectionTimeoutMillis: 10000,
});

// Prevent unhandled pool errors from crashing the process
db.on('error', (err) => {
  console.error('[DB Pool] Idle client error:', err.message);
});

export default db;
