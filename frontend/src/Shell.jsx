/**
 * Shell - Minimal layout shell for RavenLoom
 *
 * Replaces the 4,683-line TeamDashboard monolith.
 * Routes between Onboarding (first-time), RavenHome (primary), and KnowledgeExplorer (secondary).
 * Handles scope switching (Just Me / My Team) and recall alerts.
 */

import { useState, useEffect, Component, lazy, Suspense } from 'react';
import { gql, useQuery, useLazyQuery } from '@apollo/client';
import { useNavigate, useParams } from 'react-router-dom';
import RavenHome from './components/RavenHome';
import KnowledgeExplorer from './components/KnowledgeExplorer';
import { useToast } from './Toast.jsx';
import './Shell.css';

// Lazy load Onboarding — only needed on first visit
const Onboarding = lazy(() => import('./components/Onboarding'));

// Error Boundary
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('Shell Error:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="shell-error">
          <h3>Something went wrong</h3>
          <p>{this.state.error?.message}</p>
          <button onClick={() => this.setState({ hasError: false, error: null })}>
            Try again
          </button>
          <button onClick={() => window.location.reload()}>
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── GraphQL ──────────────────────────────────────────────────────────────────

const GET_TEAM = gql`
  query GetTeam($teamId: ID!) {
    getTeam(teamId: $teamId) {
      id
      name
      slug
      members {
        id
        userId
        role
        user {
          id
          email
          displayName
        }
      }
    }
  }
`;

const GET_TEAM_SCOPE = gql`
  query GetTeamScope($teamId: ID!) {
    getTeamScope(teamId: $teamId) {
      id
      teamId
      type
      name
    }
  }
`;

const GET_PRIVATE_SCOPE = gql`
  query GetMyPrivateScope($teamId: ID!, $coupledScopeId: ID!) {
    getMyPrivateScope(teamId: $teamId, coupledScopeId: $coupledScopeId) {
      id
      teamId
      type
      name
    }
  }
`;

const GET_FACT_COUNT = gql`
  query GetFactCount($teamId: ID!) {
    getFactCount(teamId: $teamId)
  }
`;

const GET_PENDING_ALERTS = gql`
  query GetPendingAlerts($teamId: ID!) {
    getPendingAlerts(teamId: $teamId) {
      id
      message
      triggerType
      triggerAt
      relatedFactId
      status
      createdAt
    }
  }
`;

// ── Component ────────────────────────────────────────────────────────────────

export default function Shell({ teamId, initialView, user, onSignOut }) {
  const navigate = useNavigate();
  const { view: urlView } = useParams();
  const toast = useToast();

  // Onboarding state — check if user has completed onboarding
  const onboardingKey = `ravenloom_onboarded_${teamId}`;
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return !localStorage.getItem(onboardingKey);
  });

  // Active view synced with URL: 'home' (default) or 'explore'
  const resolvedView = urlView === 'explore' ? 'explore' : (initialView === 'explore' ? 'explore' : 'home');
  const [activeView, setActiveViewState] = useState(resolvedView);

  // Sync view changes to URL (deep links)
  const setActiveView = (view) => {
    setActiveViewState(view);
    navigate(`/team/${teamId}/${view}`, { replace: true });
  };
  // Scope toggle: false = "My Team" (team scope), true = "Just Me" (private scope)
  const [isPrivate, setIsPrivate] = useState(false);
  // Private scope ID (fetched on demand)
  const [privateScopeId, setPrivateScopeId] = useState(null);
  // User menu
  const [showUserMenu, setShowUserMenu] = useState(false);
  // Recall panel
  const [showRecalls, setShowRecalls] = useState(false);

  // Close user menu when clicking outside
  useEffect(() => {
    if (!showUserMenu && !showRecalls) return;
    const handleClick = () => {
      setShowUserMenu(false);
      setShowRecalls(false);
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [showUserMenu, showRecalls]);

  // ── Data fetching ────────────────────────────────────────────────────────

  const { data: teamData, loading: teamLoading } = useQuery(GET_TEAM, {
    variables: { teamId },
    skip: !teamId
  });
  const team = teamData?.getTeam;

  const { data: scopeData, loading: scopeLoading } = useQuery(GET_TEAM_SCOPE, {
    variables: { teamId },
    skip: !teamId
  });
  const teamScope = scopeData?.getTeamScope;

  // Fetch private scope on demand
  const [fetchPrivateScope] = useLazyQuery(GET_PRIVATE_SCOPE, {
    fetchPolicy: 'cache-first',
    onCompleted: (data) => {
      setPrivateScopeId(data.getMyPrivateScope.id);
    },
    onError: (err) => {
      console.error('Failed to fetch private scope:', err);
      toast?.('Could not switch to private mode. Try again.');
      setIsPrivate(false);
    }
  });

  const { data: factCountData, refetch: refetchFactCount } = useQuery(GET_FACT_COUNT, {
    variables: { teamId },
    skip: !teamId,
    fetchPolicy: 'cache-and-network',
    pollInterval: 10000 // Auto-refresh every 10s — see new facts as they're added
  });
  const factCount = factCountData?.getFactCount || 0;

  // Fetch pending alerts/recalls
  const { data: alertsData } = useQuery(GET_PENDING_ALERTS, {
    variables: { teamId },
    skip: !teamId,
    pollInterval: 60000 // Check every minute
  });
  const pendingAlerts = alertsData?.getPendingAlerts || [];

  // ── Scope switching ──────────────────────────────────────────────────────

  const handleTogglePrivate = () => {
    if (!isPrivate && teamScope) {
      // Switching TO private — fetch or create private scope
      if (privateScopeId) {
        setIsPrivate(true);
      } else {
        fetchPrivateScope({
          variables: { teamId, coupledScopeId: teamScope.id }
        });
        setIsPrivate(true);
      }
    } else {
      // Switching back to team
      setIsPrivate(false);
    }
  };

  // The active scope ID — either team or private
  const activeScopeId = isPrivate && privateScopeId ? privateScopeId : teamScope?.id;

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleOnboardingComplete = () => {
    localStorage.setItem(onboardingKey, 'true');
    setShowOnboarding(false);
    refetchFactCount();
  };

  // ── Loading state ────────────────────────────────────────────────────────

  if (teamLoading || scopeLoading) {
    return (
      <div className="shell">
        <div className="shell-loading">
          <div className="shell-loading-spinner" />
          <p className="shell-loading-text">Loading your workspace...</p>
        </div>
      </div>
    );
  }

  if (!team || !teamScope) {
    return (
      <div className="shell">
        <div className="shell-loading">
          <p>Team not found</p>
          <button onClick={() => navigate('/')} className="btn-secondary">
            Back to Teams
          </button>
        </div>
      </div>
    );
  }

  // ── Onboarding ───────────────────────────────────────────────────────────

  if (showOnboarding) {
    return (
      <ErrorBoundary>
        <div className="shell">
          <Suspense fallback={
            <div className="shell-loading">
              <div className="shell-loading-spinner" />
            </div>
          }>
            <Onboarding
              scopeId={teamScope.id}
              onComplete={handleOnboardingComplete}
              onFactsChanged={refetchFactCount}
            />
          </Suspense>
          <footer className="shell-footer">
            <span className="shell-footer-brand">Brought to you by Full Uproar</span>
          </footer>
        </div>
      </ErrorBoundary>
    );
  }

  // ── Main app ─────────────────────────────────────────────────────────────

  return (
    <ErrorBoundary>
      <div className="shell">
        {/* Minimal header */}
        <header className="shell-header">
          <div className="shell-header-left">
            <span className="shell-logo" role="img" aria-label="RavenLoom">Raven</span>
            <span className="shell-team-name">{team.name}</span>
          </div>

          <div className="shell-header-center">
            <nav className="shell-nav" role="tablist" aria-label="Main navigation">
              <button
                role="tab"
                aria-selected={activeView === 'home'}
                className={`shell-nav-tab ${activeView === 'home' ? 'active' : ''}`}
                onClick={() => setActiveView('home')}
              >
                Raven
              </button>
              <button
                role="tab"
                aria-selected={activeView === 'explore'}
                className={`shell-nav-tab ${activeView === 'explore' ? 'active' : ''}`}
                onClick={() => setActiveView('explore')}
              >
                Explore
              </button>
            </nav>
          </div>

          <div className="shell-header-right">
            {/* Fact counter */}
            {factCount > 0 && (
              <span className="shell-fact-counter" title={`${factCount} confirmed facts`}>
                {factCount} {factCount === 1 ? 'thing' : 'things'}
              </span>
            )}

            {/* Recall alerts badge */}
            {pendingAlerts.length > 0 && (
              <div className="shell-recall-container">
                <button
                  className="shell-recall-btn"
                  onClick={(e) => { e.stopPropagation(); setShowRecalls(!showRecalls); }}
                  title={`${pendingAlerts.length} pending recall${pendingAlerts.length > 1 ? 's' : ''}`}
                >
                  <span className="shell-recall-badge">{pendingAlerts.length}</span>
                </button>
                {showRecalls && (
                  <div className="shell-recall-dropdown" onClick={(e) => e.stopPropagation()}>
                    <div className="shell-recall-header">Recalls</div>
                    {pendingAlerts.slice(0, 5).map(alert => (
                      <div key={alert.id} className="shell-recall-item">
                        <span className="shell-recall-message">{alert.message}</span>
                        {alert.triggerAt && (
                          <span className="shell-recall-time">
                            {new Date(alert.triggerAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    ))}
                    {pendingAlerts.length > 5 && (
                      <div className="shell-recall-more">
                        +{pendingAlerts.length - 5} more
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* User menu */}
            <div className="shell-user-menu-container">
              <button
                className="shell-user-btn"
                onClick={(e) => { e.stopPropagation(); setShowUserMenu(!showUserMenu); }}
                aria-expanded={showUserMenu}
                aria-haspopup="true"
              >
                {user.displayName || user.email?.split('@')[0] || 'User'}
              </button>
              {showUserMenu && (
                <div className="shell-user-dropdown" role="menu">
                  <span className="shell-user-email">{user.email}</span>
                  <button role="menuitem" onClick={onSignOut}>Sign Out</button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="shell-main" role="tabpanel">
          {activeView === 'home' && (
            <RavenHome
              teamId={teamId}
              scopeId={activeScopeId}
              scopeName={isPrivate ? 'Just Me' : team.name}
              isPrivate={isPrivate}
              onTogglePrivate={handleTogglePrivate}
              factCount={factCount}
              onFactsChanged={refetchFactCount}
              user={user}
            />
          )}

          {activeView === 'explore' && (
            <KnowledgeExplorer
              teamId={teamId}
              scopeId={activeScopeId}
              onSwitchToHome={() => setActiveView('home')}
            />
          )}
        </main>

        {/* Footer branding */}
        <footer className="shell-footer">
          <span className="shell-footer-brand">Brought to you by Full Uproar</span>
        </footer>
      </div>
    </ErrorBoundary>
  );
}
