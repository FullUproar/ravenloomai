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
  ssl: process.env.NODE_ENV === 'production' || process.env.VERCEL ? { rejectUnauthorized: false } : false
});

export default db;
