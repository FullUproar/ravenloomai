-- ============================================
-- BILLING & QUOTAS (Phase 3-4 Preparation)
-- Migration 208: Schema for multi-tenant quotas and Stripe billing
-- These tables are created now but used later.
-- ============================================

-- Team quotas — enforced in Phase 3, populated in Phase 4 from Stripe
CREATE TABLE IF NOT EXISTS team_quotas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    plan VARCHAR(30) DEFAULT 'free',
    max_facts INTEGER DEFAULT 500,
    max_members INTEGER DEFAULT 5,
    max_asks_per_day INTEGER DEFAULT 50,
    max_remembers_per_day INTEGER DEFAULT 100,
    max_documents INTEGER DEFAULT 20,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(team_id)
);

CREATE INDEX IF NOT EXISTS idx_team_quotas_team ON team_quotas(team_id);

COMMENT ON TABLE team_quotas IS 'Per-team usage quotas. Phase 3 enforces limits. Phase 4 ties to Stripe plans.';

-- Billing customers — Stripe integration in Phase 4
CREATE TABLE IF NOT EXISTS billing_customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    stripe_customer_id VARCHAR(255) UNIQUE,
    stripe_subscription_id VARCHAR(255),
    plan VARCHAR(30) DEFAULT 'free',
    status VARCHAR(30) DEFAULT 'active',
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(team_id)
);

-- Billing events — Stripe webhook log
CREATE TABLE IF NOT EXISTS billing_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID REFERENCES teams(id),
    stripe_event_id VARCHAR(255) UNIQUE,
    event_type VARCHAR(100) NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit log — for multi-tenant compliance
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID REFERENCES teams(id),
    user_id VARCHAR(128),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id UUID,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_team ON audit_log(team_id, created_at);

-- Usage events — analytics for Phase 2+
CREATE TABLE IF NOT EXISTS usage_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id VARCHAR(128),
    event_type VARCHAR(50) NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_events_team_type ON usage_events(team_id, event_type, created_at);

COMMENT ON TABLE usage_events IS 'Tracks user actions for analytics. Event types: ask, remember, confirm, recall_triggered, etc.';
