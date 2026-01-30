/**
 * OraclePage - Full-screen RavenOracle experience
 *
 * Handles auth and team/scope resolution, then renders the immersive Oracle interface.
 */

import { useState, useEffect } from 'react';
import { gql, useQuery } from '@apollo/client';
import RavenOracle from '../components/RavenOracle';
import '../components/RavenOracle.css';

const GET_USER_TEAMS = gql`
  query GetUserTeams {
    me {
      id
      teams {
        id
        name
        scopes {
          id
          name
          scopeType
        }
      }
    }
  }
`;

export default function OraclePage() {
  const { data, loading, error } = useQuery(GET_USER_TEAMS);
  const [selectedScope, setSelectedScope] = useState(null);

  // Auto-select first team's root scope
  useEffect(() => {
    if (data?.me?.teams?.[0]) {
      const team = data.me.teams[0];
      // Find team-level scope or first scope
      const teamScope = team.scopes?.find(s => s.scopeType === 'team') || team.scopes?.[0];
      if (teamScope) {
        setSelectedScope({
          scopeId: teamScope.id,
          teamId: team.id,
          teamName: team.name,
          scopeName: teamScope.name
        });
      }
    }
  }, [data]);

  if (loading) {
    return (
      <div className="oracle-loading">
        <div className="oracle-loading-spinner" />
      </div>
    );
  }

  if (error || !data?.me) {
    return (
      <div className="oracle-error">
        <p>Please sign in to access the Oracle.</p>
        <a href="/">Go to login</a>
      </div>
    );
  }

  if (!selectedScope) {
    return (
      <div className="oracle-error">
        <p>No team found. Please create or join a team first.</p>
        <a href="/">Go to dashboard</a>
      </div>
    );
  }

  return (
    <RavenOracle
      scopeId={selectedScope.scopeId}
      teamId={selectedScope.teamId}
    />
  );
}
