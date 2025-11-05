-- Migration 006: Add User Profile System
-- Adds comprehensive user management, Google OAuth, and unique persona naming

-- ============================================================================
-- USERS TABLE (Enhanced)
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,

  -- Authentication
  email VARCHAR(255) UNIQUE NOT NULL,
  email_verified BOOLEAN DEFAULT FALSE,
  password_hash VARCHAR(255), -- NULL if OAuth-only

  -- OAuth
  google_id VARCHAR(255) UNIQUE,
  google_avatar_url TEXT,
  oauth_provider VARCHAR(50), -- 'google', 'email'

  -- Profile
  display_name VARCHAR(100),
  avatar_url TEXT,
  timezone VARCHAR(50) DEFAULT 'UTC',

  -- Preferences
  preferences JSONB DEFAULT '{}',
  -- {
  --   theme: 'light' | 'dark' | 'auto',
  --   notifications: { email: true, push: true },
  --   language: 'en',
  --   dateFormat: 'MM/DD/YYYY' | 'DD/MM/YYYY',
  --   timeFormat: '12h' | '24h'
  -- }

  -- Usage & Limits
  persona_limit INTEGER DEFAULT 5,
  project_limit INTEGER DEFAULT 10,
  api_calls_today INTEGER DEFAULT 0,
  api_calls_month INTEGER DEFAULT 0,

  -- Subscription (future)
  subscription_tier VARCHAR(50) DEFAULT 'free', -- 'free', 'pro', 'team'
  subscription_expires_at TIMESTAMP,

  -- Security
  last_login_at TIMESTAMP,
  last_login_ip VARCHAR(45),
  failed_login_attempts INTEGER DEFAULT 0,
  account_locked_until TIMESTAMP,

  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP -- Soft delete
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_google_id ON users(google_id);
CREATE INDEX idx_users_created_at ON users(created_at);
CREATE INDEX idx_users_deleted_at ON users(deleted_at);

-- ============================================================================
-- AVAILABLE NAMES (Baby Names Database)
-- ============================================================================

CREATE TABLE IF NOT EXISTS available_names (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,

  -- Metadata (optional, for future features)
  origin VARCHAR(50), -- 'Hebrew', 'Latin', 'Greek', etc.
  meaning TEXT,       -- 'Gift of God', 'Defender', etc.
  popularity_rank INTEGER, -- From SSA dataset

  -- Usage tracking
  times_claimed INTEGER DEFAULT 0,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_available_names_name ON available_names(name);
CREATE INDEX idx_available_names_popularity ON available_names(popularity_rank);

-- ============================================================================
-- PERSONA NAMES (Global Registry)
-- ============================================================================

CREATE TABLE IF NOT EXISTS persona_names (
  id SERIAL PRIMARY KEY,

  -- Name ownership
  name VARCHAR(50) NOT NULL, -- "Sarah", "Marcus", "Alex"
  archetype VARCHAR(50) NOT NULL,   -- "coach", "advisor", etc.

  -- Owner
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  persona_id INTEGER REFERENCES personas(id) ON DELETE SET NULL,

  -- Metadata
  claimed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(name, archetype) -- Each name unique per archetype
);

CREATE INDEX idx_persona_names_name ON persona_names(name);
CREATE INDEX idx_persona_names_user_id ON persona_names(user_id);
CREATE INDEX idx_persona_names_archetype ON persona_names(archetype);
CREATE INDEX idx_persona_names_persona_id ON persona_names(persona_id);

-- ============================================================================
-- SESSIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS sessions (
  id VARCHAR(255) PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Session data
  data JSONB DEFAULT '{}',

  -- Security
  ip_address VARCHAR(45),
  user_agent TEXT,

  -- Expiration
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

-- ============================================================================
-- EMAIL VERIFICATION TOKENS
-- ============================================================================

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  used_at TIMESTAMP
);

CREATE INDEX idx_email_tokens_user_id ON email_verification_tokens(user_id);
CREATE INDEX idx_email_tokens_token ON email_verification_tokens(token);

-- ============================================================================
-- PASSWORD RESET TOKENS
-- ============================================================================

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  used_at TIMESTAMP
);

CREATE INDEX idx_password_tokens_user_id ON password_reset_tokens(user_id);
CREATE INDEX idx_password_tokens_token ON password_reset_tokens(token);

-- ============================================================================
-- UPDATE PERSONAS TABLE
-- ============================================================================

-- Add new columns to personas table
ALTER TABLE personas
  ADD COLUMN IF NOT EXISTS persona_name VARCHAR(50), -- Just the name (e.g., "Sarah")
  ADD COLUMN IF NOT EXISTS name_verified BOOLEAN DEFAULT FALSE; -- Verified claimed in persona_names

-- Note: display_name already exists and will be constructed as "${persona_name} the ${archetype}"

CREATE INDEX IF NOT EXISTS idx_personas_persona_name ON personas(persona_name);

-- ============================================================================
-- SAMPLE DATA (for development)
-- ============================================================================

-- Insert popular names (will be replaced by full dataset)
INSERT INTO available_names (name, popularity_rank) VALUES
  ('Emma', 1),
  ('Olivia', 2),
  ('Ava', 3),
  ('Isabella', 4),
  ('Sophia', 5),
  ('Liam', 6),
  ('Noah', 7),
  ('William', 8),
  ('James', 9),
  ('Oliver', 10),
  ('Sarah', 11),
  ('Marcus', 12),
  ('Alex', 13),
  ('Jordan', 14),
  ('Taylor', 15)
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for users table
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- CLEANUP OLD SESSIONS (for cron job)
-- ============================================================================

-- Function to clean up expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM sessions WHERE expires_at < CURRENT_TIMESTAMP;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Migration version tracking (if you have a migrations table)
-- INSERT INTO migrations (name, applied_at) VALUES ('006_add_user_profile_system', CURRENT_TIMESTAMP);
