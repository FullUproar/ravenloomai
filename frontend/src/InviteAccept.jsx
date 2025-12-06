import { gql, useQuery, useMutation } from '@apollo/client';
import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { auth } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import Login from './Login.jsx';

// ============================================================================
// GraphQL Operations
// ============================================================================

const VALIDATE_INVITE = gql`
  query ValidateInviteToken($token: String!) {
    validateInviteToken(token: $token) {
      id
      teamId
      email
      role
      expiresAt
    }
  }
`;

const ACCEPT_INVITE = gql`
  mutation AcceptInvite($token: String!) {
    acceptInvite(token: $token) {
      id
      teamId
      role
      user {
        id
        email
        displayName
      }
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

const GET_TEAM = gql`
  query GetTeam($teamId: ID!) {
    getTeam(teamId: $teamId) {
      id
      name
    }
  }
`;

// ============================================================================
// InviteAccept Component
// ============================================================================

function InviteAccept({ apolloClient }) {
  const navigate = useNavigate();
  const { token } = useParams();

  // Auth state
  const [user, setUser] = useState(undefined);
  const [authLoading, setAuthLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  // Mutations
  const [acceptInvite] = useMutation(ACCEPT_INVITE);
  const [createOrUpdateUser] = useMutation(CREATE_OR_UPDATE_USER);

  // Validate the invite token
  const { data: inviteData, loading: inviteLoading, error: inviteError } = useQuery(VALIDATE_INVITE, {
    variables: { token },
    fetchPolicy: 'network-only'
  });

  const invite = inviteData?.validateInviteToken;

  // Get team info if invite is valid
  const { data: teamData } = useQuery(GET_TEAM, {
    variables: { teamId: invite?.teamId },
    skip: !invite?.teamId
  });

  const team = teamData?.getTeam;

  // ============================================================================
  // Auth Effect
  // ============================================================================

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        localStorage.setItem('userId', firebaseUser.uid);

        // Create/update user in database
        try {
          await createOrUpdateUser({
            variables: {
              email: firebaseUser.email,
              displayName: firebaseUser.displayName,
              avatarUrl: firebaseUser.photoURL
            }
          });
        } catch (err) {
          console.error('Error syncing user:', err);
        }

        setUser(firebaseUser);
      } else {
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

  const handleAcceptInvite = async () => {
    if (accepting) return;

    setAccepting(true);
    setError(null);

    try {
      const { data } = await acceptInvite({
        variables: { token }
      });

      setSuccess(true);

      // Navigate to the team after a short delay
      setTimeout(() => {
        navigate(`/team/${data.acceptInvite.teamId}`);
      }, 1500);
    } catch (err) {
      console.error('Error accepting invite:', err);
      setError(err.message);
    } finally {
      setAccepting(false);
    }
  };

  // ============================================================================
  // Render
  // ============================================================================

  // Loading state
  if (authLoading || inviteLoading) {
    return (
      <div className="app-container">
        <div className="loading-screen">
          <div className="loading-spinner"></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  // Invalid or expired invite
  if (inviteError || !invite) {
    return (
      <div className="app-container">
        <div className="invite-page">
          <div className="invite-card error">
            <h2>Invalid Invite</h2>
            <p>This invite link is invalid or has expired.</p>
            <button onClick={() => navigate('/')} className="btn-primary">
              Go to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Not logged in - show login
  if (!user) {
    return (
      <div className="app-container">
        <div className="invite-page">
          <div className="invite-card">
            <h2>Team Invitation</h2>
            <p>You've been invited to join <strong>{team?.name || 'a team'}</strong></p>
            <p className="invite-email">Invite sent to: {invite.email}</p>
            <p className="invite-hint">Please sign in to accept this invitation.</p>
            <Login onLogin={() => {}} />
          </div>
        </div>
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="app-container">
        <div className="invite-page">
          <div className="invite-card success">
            <h2>Welcome!</h2>
            <p>You've joined <strong>{team?.name}</strong></p>
            <p>Redirecting to your team...</p>
          </div>
        </div>
      </div>
    );
  }

  // Logged in - show accept button
  return (
    <div className="app-container">
      <div className="invite-page">
        <div className="invite-card">
          <h2>Team Invitation</h2>
          <p>You've been invited to join:</p>
          <h3 className="team-name-large">{team?.name || 'Loading...'}</h3>
          <p className="invite-role">Role: <strong>{invite.role}</strong></p>

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <div className="invite-actions">
            <button
              onClick={handleAcceptInvite}
              disabled={accepting}
              className="btn-primary"
            >
              {accepting ? 'Joining...' : 'Join Team'}
            </button>
            <button
              onClick={() => navigate('/')}
              className="btn-secondary"
            >
              Decline
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default InviteAccept;
