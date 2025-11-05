# User & Profile System Design

## Overview

Comprehensive user system with Google OAuth, unique persona naming, and profile management.

## Core Requirements

### 1. Authentication
- ✅ Google OAuth (primary)
- ✅ Email/password (fallback)
- ✅ Session management
- ✅ Email verification

### 2. Unique Persona Names
- ✅ Curated baby name list (10,000+ names)
- ✅ First-come, first-served ownership
- ✅ One user owns one name per archetype
- ✅ No numbered suffixes (David21219 ❌)
- ✅ No duplicate names across platform

### 3. User Profile
- ✅ Display name (separate from persona names)
- ✅ Email
- ✅ Avatar
- ✅ Timezone
- ✅ Preferences
- ✅ Usage stats

## Database Schema

### Users Table

```sql
CREATE TABLE users (
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
```

### Persona Names Table (Global Registry)

```sql
CREATE TABLE persona_names (
  id SERIAL PRIMARY KEY,

  -- Name ownership
  name VARCHAR(50) UNIQUE NOT NULL, -- "Sarah", "Marcus", "Alex"
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
```

### Updated Personas Table

```sql
ALTER TABLE personas
  ADD COLUMN persona_name VARCHAR(50), -- Just the name (e.g., "Sarah")
  ADD COLUMN display_name VARCHAR(100) NOT NULL; -- Full display (e.g., "Sarah the Health Coach")

-- Remove old display_name column if exists, use new one
-- persona_name comes from persona_names table
-- display_name is constructed: "${persona_name} the ${archetype}"
```

### Sessions Table

```sql
CREATE TABLE sessions (
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
```

### Email Verification Tokens

```sql
CREATE TABLE email_verification_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  used_at TIMESTAMP
);

CREATE INDEX idx_email_tokens_user_id ON email_verification_tokens(user_id);
CREATE INDEX idx_email_tokens_token ON email_verification_tokens(token);
```

### Password Reset Tokens

```sql
CREATE TABLE password_reset_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  used_at TIMESTAMP
);

CREATE INDEX idx_password_tokens_user_id ON password_reset_tokens(user_id);
CREATE INDEX idx_password_tokens_token ON password_reset_tokens(token);
```

## Baby Names Database

### Names Source

Use US Social Security Baby Names dataset:
- **Source**: https://www.ssa.gov/oact/babynames/limits.html
- **Size**: ~10,000 popular names
- **Quality**: Real, culturally appropriate names
- **Gender-neutral**: Include both traditionally male and female names

### Names Table

```sql
CREATE TABLE available_names (
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

-- Sample data
INSERT INTO available_names (name, popularity_rank) VALUES
  ('Sarah', 1),
  ('Marcus', 2),
  ('Alex', 3),
  ('Emma', 4),
  ('Olivia', 5),
  ('Liam', 6),
  ('Noah', 7),
  ('Ava', 8),
  ('Isabella', 9),
  ('Sophia', 10);
  -- ... 10,000 more
```

## Google OAuth Implementation

### Backend Setup

```bash
npm install passport passport-google-oauth20 express-session
```

### Environment Variables

```env
# Google OAuth
GOOGLE_CLIENT_ID=your_client_id_here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret_here
GOOGLE_CALLBACK_URL=http://localhost:4000/auth/google/callback

# Session
SESSION_SECRET=your_random_secret_here
SESSION_MAX_AGE=604800000 # 7 days in milliseconds

# Frontend URL (for redirects)
FRONTEND_URL=http://localhost:5173
```

### Passport Configuration

```javascript
// backend/config/passport.js

import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import db from '../db.js';

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL,
}, async (accessToken, refreshToken, profile, done) => {
  try {
    // Check if user exists
    let user = await db.query(
      'SELECT * FROM users WHERE google_id = $1',
      [profile.id]
    );

    if (user.rows.length > 0) {
      // Existing user - update last login
      user = await db.query(
        `UPDATE users
         SET last_login_at = CURRENT_TIMESTAMP,
             google_avatar_url = $1
         WHERE id = $2
         RETURNING *`,
        [profile.photos?.[0]?.value, user.rows[0].id]
      );
      return done(null, user.rows[0]);
    }

    // New user - create account
    const newUser = await db.query(
      `INSERT INTO users (
        email, email_verified, google_id, google_avatar_url,
        oauth_provider, display_name, avatar_url
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        profile.emails[0].value,
        profile.emails[0].verified,
        profile.id,
        profile.photos?.[0]?.value,
        'google',
        profile.displayName,
        profile.photos?.[0]?.value,
      ]
    );

    return done(null, newUser.rows[0]);
  } catch (error) {
    return done(error, null);
  }
}));

// Serialize user for session
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
  try {
    const result = await db.query(
      'SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
    done(null, result.rows[0]);
  } catch (error) {
    done(error, null);
  }
});

export default passport;
```

### Authentication Routes

```javascript
// backend/routes/auth.js

import express from 'express';
import passport from '../config/passport.js';

const router = express.Router();

// Google OAuth - Initiate
router.get('/google',
  passport.authenticate('google', {
    scope: ['profile', 'email']
  })
);

// Google OAuth - Callback
router.get('/google/callback',
  passport.authenticate('google', {
    failureRedirect: `${process.env.FRONTEND_URL}/login?error=auth_failed`
  }),
  (req, res) => {
    // Successful authentication
    res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
  }
);

// Logout
router.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ success: true });
  });
});

// Get current user
router.get('/me', (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  res.json({ user: req.user });
});

export default router;
```

### Express Server Setup

```javascript
// backend/index.js

import express from 'express';
import session from 'express-session';
import passport from './config/passport.js';
import authRoutes from './routes/auth.js';

const app = express();

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    httpOnly: true,
    maxAge: parseInt(process.env.SESSION_MAX_AGE),
  },
}));

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Auth routes
app.use('/auth', authRoutes);

// ... rest of server setup
```

## Frontend Implementation

### Login Component

```jsx
// frontend/src/Login.jsx

import React from 'react';
import './Login.css';

const Login = () => {
  const handleGoogleLogin = () => {
    // Redirect to backend OAuth endpoint
    window.location.href = 'http://localhost:4000/auth/google';
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Welcome to RavenLoom</h1>
        <p>AI-powered project management with personalized personas</p>

        <button className="google-login-button" onClick={handleGoogleLogin}>
          <img src="/google-icon.svg" alt="Google" />
          Continue with Google
        </button>

        <div className="divider">
          <span>or</span>
        </div>

        <form className="email-login-form">
          <input type="email" placeholder="Email" />
          <input type="password" placeholder="Password" />
          <button type="submit">Sign In</button>
        </form>

        <p className="signup-link">
          Don't have an account? <a href="/signup">Sign up</a>
        </p>
      </div>
    </div>
  );
};

export default Login;
```

## Persona Name Selection Flow

### 1. Get Available Names

```javascript
// backend/graphql/resolvers/personaNameResolvers.js

export const personaNameResolvers = {
  Query: {
    /**
     * Get available names for an archetype
     */
    availablePersonaNames: async (parent, { archetype, search, limit = 100 }, context) => {
      // Must be authenticated
      if (!context.user) {
        throw new Error('Not authenticated');
      }

      // Get all claimed names for this archetype
      const claimed = await db.query(
        'SELECT name FROM persona_names WHERE archetype = $1',
        [archetype]
      );
      const claimedNames = claimed.rows.map(row => row.name.toLowerCase());

      // Query available names (not claimed for this archetype)
      let query = `
        SELECT name, popularity_rank
        FROM available_names
        WHERE LOWER(name) NOT IN (${claimedNames.map((_, i) => `$${i + 1}`).join(',')})
      `;
      const params = claimedNames;

      // Add search filter if provided
      if (search) {
        query += ` AND name ILIKE $${params.length + 1}`;
        params.push(`${search}%`);
      }

      // Order by popularity and limit
      query += ` ORDER BY popularity_rank ASC LIMIT $${params.length + 1}`;
      params.push(limit);

      const result = await db.query(query, params);
      return result.rows;
    },

    /**
     * Check if a name is available
     */
    isPersonaNameAvailable: async (parent, { name, archetype }, context) => {
      if (!context.user) {
        throw new Error('Not authenticated');
      }

      // Check if name exists in available_names
      const nameExists = await db.query(
        'SELECT id FROM available_names WHERE LOWER(name) = LOWER($1)',
        [name]
      );

      if (nameExists.rows.length === 0) {
        return { available: false, reason: 'Name not in approved list' };
      }

      // Check if already claimed for this archetype
      const claimed = await db.query(
        'SELECT user_id FROM persona_names WHERE LOWER(name) = LOWER($1) AND archetype = $2',
        [name, archetype]
      );

      if (claimed.rows.length > 0) {
        const isOwnedByUser = claimed.rows[0].user_id === context.user.id;
        return {
          available: false,
          reason: isOwnedByUser
            ? 'You already own this name for this archetype'
            : 'Name already claimed by another user'
        };
      }

      return { available: true };
    },
  },

  Mutation: {
    /**
     * Claim a persona name
     */
    claimPersonaName: async (parent, { name, archetype, personaId }, context) => {
      if (!context.user) {
        throw new Error('Not authenticated');
      }

      // Validate name is in approved list
      const nameExists = await db.query(
        'SELECT id FROM available_names WHERE LOWER(name) = LOWER($1)',
        [name]
      );

      if (nameExists.rows.length === 0) {
        throw new Error('Name not in approved list');
      }

      // Check if already claimed
      const claimed = await db.query(
        'SELECT user_id FROM persona_names WHERE LOWER(name) = LOWER($1) AND archetype = $2',
        [name, archetype]
      );

      if (claimed.rows.length > 0) {
        throw new Error('Name already claimed for this archetype');
      }

      // Claim the name
      const result = await db.query(
        `INSERT INTO persona_names (name, archetype, user_id, persona_id)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [name, archetype, context.user.id, personaId]
      );

      // Update usage counter
      await db.query(
        'UPDATE available_names SET times_claimed = times_claimed + 1 WHERE LOWER(name) = LOWER($1)',
        [name]
      );

      return result.rows[0];
    },

    /**
     * Release a persona name (when deleting persona)
     */
    releasePersonaName: async (parent, { personaId }, context) => {
      if (!context.user) {
        throw new Error('Not authenticated');
      }

      // Delete the claim (must own the persona)
      const result = await db.query(
        `DELETE FROM persona_names
         WHERE persona_id = $1 AND user_id = $2
         RETURNING *`,
        [personaId, context.user.id]
      );

      if (result.rows.length === 0) {
        throw new Error('Persona name not found or not owned by you');
      }

      return { success: true };
    },
  },
};
```

### 2. Frontend Name Selector

```jsx
// frontend/src/PersonaNameSelector.jsx

import React, { useState, useEffect } from 'react';
import { useQuery } from '@apollo/client';
import { AVAILABLE_PERSONA_NAMES } from './queries';

const PersonaNameSelector = ({ archetype, onSelectName }) => {
  const [search, setSearch] = useState('');
  const [selectedName, setSelectedName] = useState(null);

  const { data, loading } = useQuery(AVAILABLE_PERSONA_NAMES, {
    variables: { archetype, search, limit: 50 },
  });

  const handleSelectName = (name) => {
    setSelectedName(name);
    onSelectName(name);
  };

  return (
    <div className="name-selector">
      <h3>Choose a Name</h3>
      <p>Select from available names. Each name is unique per archetype.</p>

      <input
        type="text"
        placeholder="Search names..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="name-search"
      />

      {loading ? (
        <p>Loading names...</p>
      ) : (
        <div className="name-grid">
          {data?.availablePersonaNames?.map((nameData) => (
            <button
              key={nameData.name}
              className={`name-option ${selectedName === nameData.name ? 'selected' : ''}`}
              onClick={() => handleSelectName(nameData.name)}
            >
              {nameData.name}
            </button>
          ))}
        </div>
      )}

      {data?.availablePersonaNames?.length === 0 && (
        <p className="no-results">
          No names found. Try a different search.
        </p>
      )}
    </div>
  );
};

export default PersonaNameSelector;
```

## User Profile Management

### Profile Component

```jsx
// frontend/src/UserProfile.jsx

const UserProfile = () => {
  const [user, setUser] = useState(null);

  useEffect(() => {
    fetch('http://localhost:4000/auth/me', {
      credentials: 'include'
    })
      .then(res => res.json())
      .then(data => setUser(data.user));
  }, []);

  return (
    <div className="user-profile">
      <div className="profile-header">
        <img src={user?.avatar_url} alt={user?.display_name} />
        <h2>{user?.display_name}</h2>
        <p>{user?.email}</p>
      </div>

      <div className="profile-stats">
        <div className="stat">
          <span className="stat-value">{user?.persona_count || 0}</span>
          <span className="stat-label">Personas</span>
        </div>
        <div className="stat">
          <span className="stat-value">{user?.project_count || 0}</span>
          <span className="stat-label">Projects</span>
        </div>
      </div>

      <div className="owned-names">
        <h3>Your Persona Names</h3>
        {/* List of claimed names */}
      </div>
    </div>
  );
};
```

## Migration Plan

### Phase 1: User System
1. ✅ Create users table
2. ✅ Set up Google OAuth
3. ✅ Implement session management
4. ✅ Add authentication middleware

### Phase 2: Names System
1. ✅ Load baby names dataset
2. ✅ Create persona_names table
3. ✅ Implement name claiming
4. ✅ Update persona creation flow

### Phase 3: Profile Management
1. ✅ User profile UI
2. ✅ Settings page
3. ✅ Usage stats
4. ✅ Name ownership display

## Security Considerations

### Google OAuth
- ✅ Verify email from Google
- ✅ Store only necessary data
- ✅ Use HTTPS in production
- ✅ Secure session cookies

### Name System
- ✅ Prevent SQL injection (parameterized queries)
- ✅ Case-insensitive uniqueness
- ✅ Validate name exists in approved list
- ✅ Verify ownership before release

### Session Management
- ✅ HttpOnly cookies
- ✅ Secure flag in production
- ✅ Session expiration
- ✅ CSRF protection

## Next Steps

1. **Set up Google OAuth Console**
   - Create project
   - Enable Google+ API
   - Get client ID and secret

2. **Load Baby Names Data**
   - Download SSA dataset
   - Parse and import to database
   - ~10,000 names

3. **Update Persona Creation**
   - Add name selector step
   - Check availability
   - Claim name on creation

4. **Build Profile UI**
   - User settings
   - Owned names display
   - Usage stats

5. **Testing**
   - OAuth flow
   - Name claiming
   - Duplicate prevention
   - Session persistence

This gives you a robust, scalable user system with unique persona naming!
