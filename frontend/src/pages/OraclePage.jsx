/**
 * OraclePage - Full-screen RavenOracle experience
 *
 * Handles auth and team/scope resolution, then renders the immersive Oracle interface.
 */

import { useState, useEffect } from 'react';
import { gql, useQuery } from '@apollo/client';
import RavenOracle from '../components/RavenOracle';
import '../components/RavenOracle.css';

const GET_MY_TEAMS = gql`
  query GetMyTeams {
    getMyTeams {
      id
      name
    }
  }
`;

const GET_TEAM_SCOPE = gql`
  query GetTeamScope($teamId: ID!) {
    getTeamScope(teamId: $teamId) {
      id
      name
      type
    }
  }
`;

export default function OraclePage() {
  const [retryCount, setRetryCount] = useState(0);

  // Check if user appears to be logged in (has userId in localStorage)
  const hasStoredUserId = !!localStorage.getItem('userId');

  const { data: teamsData, loading: teamsLoading, error: teamsError, refetch: refetchTeams } = useQuery(GET_MY_TEAMS, {
    fetchPolicy: 'network-only' // Always fetch fresh to avoid stale cache issues
  });
  const [selectedTeam, setSelectedTeam] = useState(null);

  // Get team scope once we have a team
  const { data: scopeData, loading: scopeLoading, error: scopeError } = useQuery(GET_TEAM_SCOPE, {
    variables: { teamId: selectedTeam?.id },
    skip: !selectedTeam?.id
  });

  // Log scope errors for debugging
  if (scopeError) {
    console.error('Scope query error:', scopeError);
  }

  // Auto-select first team
  useEffect(() => {
    if (teamsData?.getMyTeams?.[0] && !selectedTeam) {
      setSelectedTeam(teamsData.getMyTeams[0]);
    }
  }, [teamsData, selectedTeam]);

  // Retry logic: if we have a stored userId but query failed/empty, retry a few times
  useEffect(() => {
    if (hasStoredUserId && !teamsLoading && (!teamsData?.getMyTeams?.length || teamsError) && retryCount < 3) {
      const timer = setTimeout(() => {
        console.log(`[OraclePage] Retrying teams query (attempt ${retryCount + 1})...`);
        setRetryCount(c => c + 1);
        refetchTeams();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [hasStoredUserId, teamsLoading, teamsData, teamsError, retryCount, refetchTeams]);

  const loading = teamsLoading || scopeLoading;

  // Still loading or retrying
  if (loading || (hasStoredUserId && retryCount < 3 && !teamsData?.getMyTeams?.length)) {
    return (
      <div className="oracle-loading">
        <div className="oracle-loading-spinner" />
      </div>
    );
  }

  // Only show sign in error if there's genuinely no user
  if (!hasStoredUserId || teamsError || !teamsData?.getMyTeams?.length) {
    return (
      <div className="oracle-error">
        <p>Please sign in to access the Oracle.</p>
        <a href="/">Go to login</a>
      </div>
    );
  }

  if (!scopeData?.getTeamScope) {
    return (
      <div className="oracle-error">
        <p>Setting up your knowledge space...</p>
      </div>
    );
  }

  return (
    <RavenOracle
      scopeId={scopeData.getTeamScope.id}
      teamId={selectedTeam.id}
    />
  );
}
