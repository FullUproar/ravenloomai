import { gql, useQuery, useMutation } from '@apollo/client';
import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { auth } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import Login from './Login.jsx';
import TeamDashboard from './TeamDashboard.jsx';

// ============================================================================
// GraphQL Operations
// ============================================================================

const GET_MY_TEAMS = gql`
  query GetMyTeams {
    getMyTeams {
      id
      name
      slug
    }
  }
`;

const CREATE_TEAM = gql`
  mutation CreateTeam($input: CreateTeamInput!) {
    createTeam(input: $input) {
      id
      name
      slug
    }
  }
`;

const CREATE_OR_UPDATE_USER = gql`
  mutation CreateOrUpdateUser($email: String!, $displayName: String, $avatarUrl: String) {
    createOrUpdateUser(email: $email, displayName: $displayName, avatarUrl: $avatarUrl) {
      id
      email
      displayName
    }
  }
`;

// ============================================================================
// App Component
// ============================================================================

function App({ apolloClient }) {
  const navigate = useNavigate();
  const { teamId: urlTeamId, view: urlView, itemId: urlItemId } = useParams();

  // Auth state
  const [user, setUser] = useState(undefined); // undefined = loading, null = logged out
  const [authLoading, setAuthLoading] = useState(true);

  // UI state
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');

  // Mutations
  const [createTeam] = useMutation(CREATE_TEAM);
  const [createOrUpdateUser] = useMutation(CREATE_OR_UPDATE_USER);

  // Fetch teams when user is logged in
  const { data: teamsData, loading: teamsLoading, refetch: refetchTeams } = useQuery(GET_MY_TEAMS, {
    skip: !user,
    fetchPolicy: 'network-only'
  });

  // ============================================================================
  // Auth Effect
  // ============================================================================

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // User is signed in
        console.log('Firebase auth successful, uid:', firebaseUser.uid);
        localStorage.setItem('userId', firebaseUser.uid);
        console.log('localStorage userId set:', localStorage.getItem('userId'));

        // Create/update user in our database
        try {
          console.log('Calling createOrUpdateUser mutation...');
          const result = await createOrUpdateUser({
            variables: {
              email: firebaseUser.email,
              displayName: firebaseUser.displayName,
              avatarUrl: firebaseUser.photoURL
            }
          });
          console.log('createOrUpdateUser result:', result);
        } catch (err) {
          console.error('Error syncing user:', err);
        }

        setUser(firebaseUser);
      } else {
        // User is signed out
        localStorage.removeItem('userId');
        setUser(null);
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, [createOrUpdateUser]);

  // ============================================================================
  // Handlers
  // ============================================================================

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      await apolloClient.clearStore();
      navigate('/');
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  const handleCreateTeam = async (e) => {
    e.preventDefault();
    console.log('handleCreateTeam called, team name:', newTeamName);
    if (!newTeamName.trim()) {
      console.log('Team name is empty, returning');
      return;
    }

    try {
      const { data } = await createTeam({
        variables: {
          input: { name: newTeamName.trim() }
        }
      });

      setShowCreateTeam(false);
      setNewTeamName('');
      await refetchTeams();

      // Navigate to the new team
      navigate(`/team/${data.createTeam.id}`);
    } catch (error) {
      console.error('Error creating team:', error);
      alert('Failed to create team: ' + error.message);
    }
  };

  const handleSelectTeam = (teamId) => {
    navigate(`/team/${teamId}`);
  };

  // ============================================================================
  // Render
  // ============================================================================

  // Loading state
  if (authLoading) {
    return (
      <div className="app-container">
        <div className="loading-screen">
          <div className="loading-spinner"></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  // Not logged in - show login
  if (!user) {
    return <Login onLogin={() => {}} />;
  }

  // User is logged in but viewing team
  if (urlTeamId) {
    return (
      <TeamDashboard
        teamId={urlTeamId}
        initialView={urlView}
        initialItemId={urlItemId}
        user={user}
        onSignOut={handleSignOut}
      />
    );
  }

  // User is logged in - show team selector
  const teams = teamsData?.getMyTeams || [];

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <h1 className="app-title">RavenLoom</h1>
        <div className="header-actions">
          <span className="user-email">{user.email}</span>
          <button onClick={handleSignOut} className="btn-secondary">
            Sign Out
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="main-content">
        <div className="team-selector">
          <h2>Your Teams</h2>

          {teamsLoading ? (
            <p>Loading teams...</p>
          ) : teams.length === 0 ? (
            <div className="no-teams">
              <p>You don't have any teams yet.</p>
              <p>Create one to get started!</p>
            </div>
          ) : (
            <div className="team-list">
              {teams.map((team) => (
                <button
                  key={team.id}
                  className="team-card"
                  onClick={() => handleSelectTeam(team.id)}
                >
                  <span className="team-name">{team.name}</span>
                  <span className="team-arrow">→</span>
                </button>
              ))}
            </div>
          )}

          {/* Create Team */}
          {showCreateTeam ? (
            <form onSubmit={handleCreateTeam} className="create-team-form">
              <input
                type="text"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                placeholder="Team name..."
                autoFocus
                className="input-field"
              />
              <div className="form-actions">
                <button type="submit" className="btn-primary">
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateTeam(false);
                    setNewTeamName('');
                  }}
                  className="btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => {
                console.log('Create Team button clicked, showing form');
                setShowCreateTeam(true);
              }}
              className="btn-primary create-team-btn"
            >
              + Create Team
            </button>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
