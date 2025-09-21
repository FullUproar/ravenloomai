import pg from 'pg';

const { Pool } = pg;

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Simple auth check (you should use proper auth in production)
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const pool = new Pool({
    connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    // Drop old tables if they exist
    await pool.query('DROP TABLE IF EXISTS plans CASCADE');

    // Create tables if they don't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        domain VARCHAR(100) NOT NULL,
        status VARCHAR(50) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        config JSONB DEFAULT '{}',
        metadata JSONB DEFAULT '{}'
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS goals (
        id SERIAL PRIMARY KEY,
        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        target_value DECIMAL,
        current_value DECIMAL DEFAULT 0,
        unit VARCHAR(50),
        priority INTEGER DEFAULT 1,
        status VARCHAR(50) DEFAULT 'active',
        target_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
        goal_id INTEGER REFERENCES goals(id) ON DELETE SET NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        type VARCHAR(100) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        priority INTEGER DEFAULT 2,
        assigned_to VARCHAR(100) DEFAULT 'ai',
        requires_approval BOOLEAN DEFAULT FALSE,
        due_date TIMESTAMP,
        completed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        config JSONB DEFAULT '{}',
        result JSONB DEFAULT '{}'
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS metrics (
        id SERIAL PRIMARY KEY,
        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
        goal_id INTEGER REFERENCES goals(id) ON DELETE SET NULL,
        name VARCHAR(255) NOT NULL,
        value DECIMAL NOT NULL,
        unit VARCHAR(50),
        recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        source VARCHAR(100) DEFAULT 'manual',
        metadata JSONB DEFAULT '{}'
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id SERIAL PRIMARY KEY,
        project_id INTEGER,
        user_id VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        metadata JSONB DEFAULT '{}'
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS reminders (
        id SERIAL PRIMARY KEY,
        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
        user_id VARCHAR(255) NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        type VARCHAR(50) NOT NULL,
        due_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_recurring BOOLEAN DEFAULT FALSE,
        recurrence_pattern VARCHAR(50),
        recurrence_interval INTEGER,
        recurrence_days JSONB,
        recurrence_end_date TIMESTAMP,
        status VARCHAR(50) DEFAULT 'pending',
        completed_at TIMESTAMP,
        snoozed_until TIMESTAMP,
        task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
        goal_id INTEGER REFERENCES goals(id) ON DELETE SET NULL,
        metric_name VARCHAR(255),
        notification_methods JSONB DEFAULT '[]',
        notification_advance_minutes INTEGER DEFAULT 0,
        priority INTEGER DEFAULT 2,
        metadata JSONB DEFAULT '{}'
      )
    `);

    // Create indexes
    await pool.query('CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_goals_project_id ON goals(project_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_metrics_project_id ON metrics(project_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_chat_messages_project_id ON chat_messages(project_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON chat_messages(user_id)');

    // Check if we should add sample data
    const projectsResult = await pool.query('SELECT COUNT(*) FROM projects');
    const projectCount = parseInt(projectsResult.rows[0].count);

    if (projectCount === 0) {
      // Add sample data
      await pool.query(`
        INSERT INTO projects (user_id, title, description, domain)
        VALUES
        ('test-user-001', 'E-commerce Startup', 'Building an online marketplace', 'business'),
        ('test-user-001', 'Health Journey', 'Improve fitness and nutrition', 'health')
      `);
    }

    res.status(200).json({
      success: true,
      message: 'Database initialized successfully',
      projectCount
    });

  } catch (error) {
    console.error('Database initialization error:', error);
    res.status(500).json({
      error: 'Failed to initialize database',
      details: error.message
    });
  } finally {
    await pool.end();
  }
}