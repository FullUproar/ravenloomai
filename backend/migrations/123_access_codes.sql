-- Access code system for users without email invites
-- Allows admins to create reusable codes that grant site access

CREATE TABLE IF NOT EXISTS access_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(32) UNIQUE NOT NULL,
  description VARCHAR(255),
  created_by VARCHAR(255) REFERENCES users(id),
  max_uses INTEGER DEFAULT 1,  -- NULL = unlimited
  uses_remaining INTEGER DEFAULT 1,
  team_id UUID REFERENCES teams(id),  -- Optional: auto-join this team
  is_active BOOLEAN DEFAULT TRUE,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Track who used each access code
CREATE TABLE IF NOT EXISTS access_code_uses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  access_code_id UUID REFERENCES access_codes(id) ON DELETE CASCADE,
  user_id VARCHAR(255) REFERENCES users(id),
  email VARCHAR(255) NOT NULL,
  used_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_access_codes_code ON access_codes(code);
CREATE INDEX IF NOT EXISTS idx_access_codes_active ON access_codes(is_active);
CREATE INDEX IF NOT EXISTS idx_access_code_uses_code ON access_code_uses(access_code_id);
CREATE INDEX IF NOT EXISTS idx_access_code_uses_user ON access_code_uses(user_id);
