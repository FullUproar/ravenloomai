-- Site-wide invite system
-- Users must have a valid invite to create an account (unless already existing)

-- Table to store site invites
CREATE TABLE IF NOT EXISTS site_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  invited_by VARCHAR(255) REFERENCES users(id),
  invite_code VARCHAR(64) UNIQUE NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',  -- pending, accepted, expired, revoked
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(email, status) -- Only one pending invite per email
);

-- Index for looking up invites by email
CREATE INDEX IF NOT EXISTS idx_site_invites_email ON site_invites(email);
CREATE INDEX IF NOT EXISTS idx_site_invites_code ON site_invites(invite_code);
CREATE INDEX IF NOT EXISTS idx_site_invites_status ON site_invites(status);

-- Add is_admin flag to users for invite management
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_site_admin BOOLEAN DEFAULT FALSE;

-- Make the first user an admin (you - the site owner)
-- This will be applied when you next log in
