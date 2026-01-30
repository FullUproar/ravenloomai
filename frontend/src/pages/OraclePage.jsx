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
      scopeType
    }
  }
`;

export default function OraclePage() {
  const { data: teamsData, loading: teamsLoading, error: teamsError } = useQuery(GET_MY_TEAMS);
  const [selectedTeam, setSelectedTeam] = useState(null);

  // Get team scope once we have a team
  const { data: scopeData, loading: scopeLoading } = useQuery(GET_TEAM_SCOPE, {
    variables: { teamId: selectedTeam?.id },
    skip: !selectedTeam?.id
  });

  // Auto-select first team
  useEffect(() => {
    if (teamsData?.getMyTeams?.[0] && !selectedTeam) {
      setSelectedTeam(teamsData.getMyTeams[0]);
    }
  }, [teamsData, selectedTeam]);

  const loading = teamsLoading || scopeLoading;

  if (loading) {
    return (
      <div className="oracle-loading">
        <div className="oracle-loading-spinner" />
      </div>
    );
  }

  if (teamsError || !teamsData?.getMyTeams?.length) {
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
