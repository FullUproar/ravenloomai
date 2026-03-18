/**
 * Shell - Minimal layout shell for RavenLoom
 *
 * Replaces the 4,683-line TeamDashboard monolith.
 * Routes between Onboarding (first-time), RavenHome (primary), and KnowledgeExplorer (secondary).
 * No sidebar navigation tree. Minimal chrome.
 */

import { useState, useEffect, Component } from 'react';
import { gql, useQuery } from '@apollo/client';
import { useNavigate } from 'react-router-dom';
import RavenHome from './components/RavenHome';
import Onboarding from './components/Onboarding';
import { useToast } from './Toast.jsx';
import './Shell.css';

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

// GraphQL - only what we need
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

const GET_FACT_COUNT = gql`
  query GetFactCount($teamId: ID!) {
    getFactCount(teamId: $teamId)
  }
`;

export default function Shell({ teamId, initialView, user, onSignOut }) {
  const navigate = useNavigate();
  const toast = useToast();

  // Onboarding state — check if user has completed onboarding
  const onboardingKey = `ravenloom_onboarded_${teamId}`;
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return !localStorage.getItem(onboardingKey);
  });

  // Active view: 'home' (default) or 'explore'
  const [activeView, setActiveView] = useState(initialView === 'explore' ? 'explore' : 'home');
  // Scope toggle: false = "My Team" (team scope), true = "Just Me" (private scope)
  const [isPrivate, setIsPrivate] = useState(false);
  // User menu
  const [showUserMenu, setShowUserMenu] = useState(false);

  // Close user menu when clicking outside
  useEffect(() => {
    if (!showUserMenu) return;
    const handleClick = () => setShowUserMenu(false);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [showUserMenu]);

  // Fetch team data
  const { data: teamData, loading: teamLoading } = useQuery(GET_TEAM, {
    variables: { teamId },
    skip: !teamId
  });
  const team = teamData?.getTeam;

  // Fetch team's root scope (needed by RavenKnowledge)
  const { data: scopeData, loading: scopeLoading } = useQuery(GET_TEAM_SCOPE, {
    variables: { teamId },
    skip: !teamId
  });
  const teamScope = scopeData?.getTeamScope;

  // Fact count for the running counter
  const { data: factCountData, refetch: refetchFactCount } = useQuery(GET_FACT_COUNT, {
    variables: { teamId },
    skip: !teamId,
    fetchPolicy: 'cache-and-network'
  });
  const factCount = factCountData?.getFactCount || 0;

  const handleOnboardingComplete = () => {
    localStorage.setItem(onboardingKey, 'true');
    setShowOnboarding(false);
    refetchFactCount();
  };

  // Loading state
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

  // Show onboarding for first-time users
  if (showOnboarding) {
    return (
      <ErrorBoundary>
        <div className="shell">
          <Onboarding
            scopeId={teamScope.id}
            onComplete={handleOnboardingComplete}
            onFactsChanged={refetchFactCount}
          />
          {/* Footer branding */}
          <footer className="shell-footer">
            <span className="shell-footer-brand">Brought to you by Full Uproar</span>
          </footer>
        </div>
      </ErrorBoundary>
    );
  }

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
            {/* Navigation tabs */}
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
                Raven knows {factCount} {factCount === 1 ? 'thing' : 'things'}
              </span>
            )}

            {/* User menu */}
            <div className="shell-user-menu-container">
              <button
                className="shell-user-btn"
                onClick={(e) => { e.stopPropagation(); setShowUserMenu(!showUserMenu); }}
                aria-expanded={showUserMenu}
                aria-haspopup="true"
              >
                {user.displayName || user.email?.split('@')[0]}
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
              scopeId={teamScope.id}
              scopeName={isPrivate ? 'Just Me' : team.name}
              isPrivate={isPrivate}
              onTogglePrivate={() => setIsPrivate(!isPrivate)}
              factCount={factCount}
              onFactsChanged={refetchFactCount}
              user={user}
            />
          )}

          {activeView === 'explore' && (
            <div className="explore-placeholder">
              <h2>Knowledge Explorer</h2>
              <p>Coming soon — browse and search your confirmed facts.</p>
              <button
                className="onboarding-btn-primary"
                onClick={() => setActiveView('home')}
              >
                Back to Raven
              </button>
            </div>
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
