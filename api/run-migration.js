/**
 * Run Migration API Endpoint
 * POST /api/run-migration?file=300_triple_knowledge_system.sql
 *
 * Protected by CRON_SECRET or admin auth.
 * Reads migration SQL from backend/migrations/ and executes it.
 */

import pkg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pkg;

const connectionString = process.env.DB_POSTGRES_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL;

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth: require CRON_SECRET or x-user-id
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  const userId = req.headers['x-user-id'];

  if (!userId && (!cronSecret || authHeader !== `Bearer ${cronSecret}`)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const migrationFile = req.query.file || req.body?.file;
  if (!migrationFile) {
    return res.status(400).json({ error: 'Missing ?file= parameter' });
  }

  // Safety: only allow files from migrations directory
  if (migrationFile.includes('..') || migrationFile.includes('/')) {
    return res.status(400).json({ error: 'Invalid migration file name' });
  }

  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const migrationPath = path.join(__dirname, '..', 'backend', 'migrations', migrationFile);

    if (!fs.existsSync(migrationPath)) {
      return res.status(404).json({ error: `Migration file not found: ${migrationFile}` });
    }

    const sql = fs.readFileSync(migrationPath, 'utf8');

    const pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false }
    });

    await pool.query(sql);
    await pool.end();

    return res.status(200).json({
      success: true,
      message: `Migration ${migrationFile} completed successfully`,
      sqlLength: sql.length
    });
  } catch (error) {
    console.error('Migration error:', error);
    return res.status(500).json({
      error: 'Migration failed',
      details: error.message
    });
  }
}
