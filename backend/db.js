import pkg from 'pg';
import dotenv from 'dotenv';

// Only load .env in local development (Vercel injects env vars directly)
if (!process.env.VERCEL) {
  dotenv.config();
}

const { Pool } = pkg;

const db = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' || process.env.VERCEL ? { rejectUnauthorized: false } : false
});

export default db;
