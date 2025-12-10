-- Site-wide role system for access control
-- Roles: 'user' (default), 'team_creator', 'super_admin'

-- Add site_role column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS site_role VARCHAR(20) DEFAULT 'user';

-- Migrate existing is_site_admin users to super_admin role
UPDATE users SET site_role = 'super_admin' WHERE is_site_admin = TRUE;

-- Create index for role lookups
CREATE INDEX IF NOT EXISTS idx_users_site_role ON users(site_role);

-- Note: Keeping is_site_admin for backwards compatibility, but site_role is the primary
-- Role hierarchy:
--   'user' - Can only engage with teams they're invited to
--   'team_creator' - Can create teams + everything above
--   'super_admin' - Can manage entire site + everything above
