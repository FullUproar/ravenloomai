import { gql, useQuery, useMutation } from '@apollo/client';
import { useState, useEffect, useRef } from 'react';
import { Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom';
import { auth } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import Login from './Login.jsx';
import LandingPage from './LandingPage.jsx';
import Header from './Header.jsx';
import Footer from './Footer.jsx';
import ProjectDashboardMobile from './ProjectDashboardMobile.jsx';
import strings from './strings.js';

// GraphQL queries/mutations for persona-based system
const GET_PROJECTS = gql`
  query GetProjects($userId: String!) {
    getProjects(userId: $userId) {
      id
      title
      description
      status
      completionType
      outcome
      createdAt
      persona {
        id
        displayName
        archetype
        specialization
      }
    }
  }
`;

const CREATE_PROJECT = gql`
  mutation CreateProject($userId: String!, $input: ProjectInput!) {
    createProject(userId: $userId, input: $input) {
      id
      title
      description
      completionType
      outcome
    }
  }
`;

const CREATE_PERSONA_FROM_GOAL = gql`
  mutation CreatePersonaFromGoal(
    $projectId: ID!
    $userId: String!
    $userGoal: String!
    $preferences: CommunicationPreferencesInput
  ) {
    createPersonaFromGoal(
      projectId: $projectId
      userId: $userId
      userGoal: $userGoal
      preferences: $preferences
    ) {
      id
      displayName
      archetype
      specialization
      voice
      interventionStyle
      communicationPreferences {
        tone
        verbosity
        emoji
        platitudes
      }
    }
  }
`;

function App({ apolloClient }) {
  const navigate = useNavigate();
  const { projectId: urlProjectId, view: urlView } = useParams();

  const [user, setUser] = useState(undefined); // undefined = loading, null = logged out
  const [isTestUser, setIsTestUser] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false); // Track active sign-in
  const [showLogin, setShowLogin] = useState(false); // Toggle between landing page and login

  // Get project ID from URL or state
  const selectedProjectId = urlProjectId || null;

  // Use ref to track test user status across renders
  const isTestUserRef = useRef(isTestUser);

  // Keep ref in sync with state
  useEffect(() => {
    isTestUserRef.current = isTestUser;
  }, [isTestUser]);

  // Custom login handler that supports test users
  const handleLogin = (userData) => {
    console.log('handleLogin called with:', userData);
    if (userData?.uid === 'test-user-123') {
      setIsTestUser(true);
      console.log('Setting test user flag');
    } else {
      setIsTestUser(false);
    }
    setUser(userData);
    setAuthLoading(false);
  };

  // Custom sign-out handler that supports test users
  const handleSignOut = async () => {
    console.log('=== SIGN OUT STARTED ===');
    console.log('isTestUser:', isTestUser);
    console.log('isTestUserRef.current:', isTestUserRef.current);
    console.log('Current user:', user);

    // Clear Apollo cache first
    if (apolloClient) {
      try {
        await apolloClient.clearStore();
        console.log('✓ Apollo cache cleared');
      } catch (error) {
        console.error('✗ Error clearing Apollo cache:', error);
      }
    }

    if (isTestUser) {
      console.log('Processing TEST USER sign out');
      // For test user, just clear state
      setUser(null);
      setIsTestUser(false);
      setSelectedProjectId(null);
      setShowCreateProject(false);
      console.log('✓ Test user state cleared');
      console.log('=== SIGN OUT COMPLETE (TEST USER) ===');
    } else {
      console.log('Processing FIREBASE USER sign out');
      // For real users, use Firebase sign out
      try {
        console.log('Calling Firebase signOut()...');

        // Sign out from Firebase - this will trigger onAuthStateChanged
        // which will set user to null
        await signOut(auth);
        console.log('✓ Firebase signOut() completed');

        // Clear Apollo cache to remove any cached user data
        if (apolloClient) {
          await apolloClient.clearStore();
          console.log('✓ Apollo cache cleared');
        }

        // Clear local state
        setSelectedProjectId(null);
        setShowCreateProject(false);

        // Force clear any remaining Firebase auth state from localStorage
        // This ensures a clean slate for the next login
        try {
          const authKey = `firebase:authUser:${auth.config.apiKey}:[DEFAULT]`;
          localStorage.removeItem(authKey);
          // Also clear any other Firebase keys
          Object.keys(localStorage).forEach(key => {
            if (key.startsWith('firebase:')) {
              localStorage.removeItem(key);
            }
          });
          console.log('✓ Firebase localStorage cleared');
        } catch (e) {
          console.warn('Could not clear localStorage:', e);
        }

        console.log('✓ Local state cleared');
        console.log('=== SIGN OUT COMPLETE (FIREBASE USER) ===');
      } catch (err) {
        console.error('✗ Sign out error:', err);
        alert('Error signing out: ' + err.message);
      }
    }
  };

  const { loading: projectsLoading, error: projectsError, data: projectsData } = useQuery(GET_PROJECTS, {
    variables: { userId: user?.uid || "" },
    skip: !user || !user?.uid, // Skip query if no user or no uid
    fetchPolicy: 'network-only', // Always fetch fresh data from server
    onCompleted: (data) => {
      console.log('Projects query completed for user:', user?.uid);
      console.log('Projects returned:', data?.getProjects?.map(p => ({
        id: p.id,
        title: p.title,
        userId: user?.uid
      })));
    },
    onError: (error) => {
      console.error('GraphQL Query Error:', error);
      console.error('Network Error:', error.networkError);
      console.error('GraphQL Errors:', error.graphQLErrors);
    }
  });

  const [createProject] = useMutation(CREATE_PROJECT, {
    refetchQueries: ['GetProjects']
  });
  const [createPersona] = useMutation(CREATE_PERSONA_FROM_GOAL, {
    refetchQueries: ['GetProjects']
  });

  // Handle auth state changes from Firebase
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      // Don't override test user with Firebase auth state
      // Use ref to get current value without depending on state
      if (isTestUserRef.current) {
        console.log('Ignoring Firebase auth change - test user is active');
        setAuthLoading(false);
        return;
      }

      console.log('Firebase auth state changed:', {
        previousUser: user?.uid,
        newUser: u?.uid,
        userEmail: u?.email,
        userDisplayName: u?.displayName,
        isSigningIn,
        authLoading
      });

      // When user changes, update state first, then clear cache
      // This prevents race conditions with active queries
      const userChanged = u?.uid !== user?.uid && user?.uid !== undefined;
      console.log('User changed?', userChanged);

      // Always update user state - this handles login, logout, and session restoration
      console.log('Setting user to:', u ? { uid: u.uid, email: u.email } : null);
      setUser(u);

      // Clear signing-in flag when we get a user (successful sign-in)
      if (u && isSigningIn) {
        console.log('✅ Sign-in successful - clearing isSigningIn flag');
        setIsSigningIn(false);
      }

      // Only mark auth as loaded after first check completes
      if (authLoading) {
        console.log('Marking auth as loaded (authLoading: true -> false)');
        setAuthLoading(false);
      }

      // Clear cache AFTER setting new user to prevent query conflicts
      if (userChanged && apolloClient) {
        console.log('User changed - resetting Apollo cache');
        try {
          // Use resetStore instead of clearStore to avoid query conflicts
          await apolloClient.resetStore();
          console.log('Apollo cache reset complete');
        } catch (error) {
          console.error('Error resetting Apollo cache:', error);
        }
      }
    });
    return () => unsub();
  }, [user?.uid, apolloClient]);

  // Handle user state changes (including manual test login)
  useEffect(() => {
    console.log('User state updated:', {
      uid: user?.uid,
      email: user?.email,
      hasUser: !!user
    });
  }, [user]);

  // Setup reset callback for Login component
  useEffect(() => {
    window.resetSigningIn = () => setIsSigningIn(false);
    return () => {
      delete window.resetSigningIn;
    };
  }, []);

  // Show loading screen while auth is initializing OR during active sign-in
  if (authLoading || isSigningIn) {
    console.log('📋 Rendering loading screen:', { authLoading, isSigningIn, user: user?.uid });
    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#0D0D0D', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#5D4B8C', fontSize: '1.2rem' }}>
          {isSigningIn ? 'Signing in...' : 'Loading...'}
        </p>
      </div>
    );
  }

  // Show landing page or login if no user (after auth has loaded and not actively signing in)
  if (!user) {
    console.log('📋 Rendering landing/login screen:', { user, authLoading, isSigningIn, showLogin });

    if (showLogin) {
      return <Login onLogin={handleLogin} onSignInStart={() => {
        console.log('🚀 onSignInStart called - setting isSigningIn to true');
        setIsSigningIn(true);
      }} />;
    }

    return <LandingPage onGetStarted={() => setShowLogin(true)} />;
  }

  console.log('📋 Rendering main app for user:', user.uid);

  // SPA Layout wrapper for loading and error states
  if (projectsLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#0D0D0D' }}>
        <Header user={user} onSignOut={handleSignOut} />
        <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#ccc' }}>Loading projects...</p>
        </main>
        <Footer />
      </div>
    );
  }

  if (projectsError) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#0D0D0D' }}>
        <Header user={user} onSignOut={handleSignOut} />
        <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#f88' }}>Error loading projects: {projectsError.message}</p>
        </main>
        <Footer />
      </div>
    );
  }

  const projects = projectsData?.getProjects || [];

  const handleCreateProject = async (goalStatement) => {
    try {
      console.log('Creating project with conversational onboarding:', goalStatement);

      // Create the project with minimal data (just the goal as title)
      const projectResult = await createProject({
        variables: {
          userId: user?.uid || "test-user-123",
          input: {
            title: goalStatement,
            description: null,
            completionType: 'milestone', // Default, AI will adjust during onboarding
            outcome: null,
            onboardingState: JSON.stringify({
              stage: "introduction",
              domain: null, // AI will detect
              collected: {}
            })
          }
        }
      });

      const projectId = projectResult.data.createProject.id;
      console.log('Project created with ID:', projectId);

      // Create a default neutral onboarding persona
      // AI will configure this during conversational onboarding
      const personaResult = await createPersona({
        variables: {
          projectId: parseInt(projectId),
          userId: user?.uid || "test-user-123",
          userGoal: goalStatement,
          preferences: {
            tone: 'supportive',
            verbosity: 'balanced',
            emoji: false,
            platitudes: false
          }
        }
      });

      console.log('Onboarding persona created:', personaResult.data.createPersonaFromGoal);

      // Navigate IMMEDIATELY to chat view (not overview)
      // This triggers the conversational onboarding
      navigate(`/project/${projectId}/chat`);
      setShowCreateProject(false);

      // The goal statement will be sent as the first message by ProjectDashboardMobile
      // when it detects a new project with onboarding state
    } catch (error) {
      console.error('Error creating project:', error);
      alert('Failed to create project: ' + error.message);
    }
  };

  if (showCreateProject) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#0D0D0D' }}>
        <Header user={user} onSignOut={handleSignOut} />
        <main style={{ flex: 1 }}>
          <CreateProjectForm
            onSubmit={handleCreateProject}
            onCancel={() => setShowCreateProject(false)}
          />
        </main>
        <Footer />
      </div>
    );
  }

  // Render project dashboard if we have a project ID in URL
  if (selectedProjectId) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#0D0D0D' }}>
        <Header user={user} onSignOut={handleSignOut} />
        <main style={{ flex: 1 }}>
          <ProjectDashboardMobile
            userId={user?.uid || "test-user-123"}
            projectId={selectedProjectId}
            initialView={urlView || 'overview'}
            projects={projects}
            onProjectChange={(newProjectId) => navigate(`/project/${newProjectId}/overview`)}
            onCreateProject={() => setShowCreateProject(true)}
            onSignOut={handleSignOut}
          />
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#0D0D0D' }}>
      <Header user={user} onSignOut={handleSignOut} />
      <main style={{
        flex: 1,
        color: '#D9D9E3',
        padding: 'clamp(1rem, 3vw, 2rem)',
        fontFamily: "'Inter', sans-serif",
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center'
      }}>
      <div style={{ maxWidth: 700, width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{
            fontFamily: "'Cinzel', serif",
            fontSize: 'clamp(1.8rem, 5vw, 2.5rem)',
            color: '#5D4B8C',
            marginTop: '1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.25rem'
          }}>
            <img src="/web-app-manifest-192x192.png" alt="RavenLoom Logo" style={{ width: 'clamp(75px, 12vw, 100px)', height: 'clamp(75px, 12vw, 100px)' }} />
            RavenLoom
          </h1>
          <p style={{ color: '#aaa', marginTop: '0.5rem', fontSize: 'clamp(0.9rem, 3vw, 1rem)' }}>{strings.app.tagline}</p>
        </div>

        {projects.length === 0 ? (
          <div style={{ textAlign: 'center', marginTop: '3rem' }}>
            <h2 style={{ color: '#D9D9E3', marginBottom: '1rem' }}>Welcome to RavenLoom</h2>
            <p style={{ color: '#aaa', marginBottom: '2rem' }}>
              Create your first project and let AI guide you to success
            </p>
            <button
              onClick={() => setShowCreateProject(true)}
              style={{
                padding: '1rem 2rem',
                fontSize: '1.1rem',
                backgroundColor: '#5D4B8C',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'background-color 0.2s'
              }}
              onMouseEnter={(e) => e.target.style.backgroundColor = '#6D5B9C'}
              onMouseLeave={(e) => e.target.style.backgroundColor = '#5D4B8C'}
            >
              Create Project
            </button>
          </div>
        ) : (
          <div style={{ marginTop: '2rem' }}>
            <h2 style={{ color: '#D9D9E3', marginBottom: '1.5rem', fontSize: '1.5rem' }}>Your Projects</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {projects.map(project => (
                <div
                  key={project.id}
                  onClick={() => navigate(`/project/${project.id}/overview`)}
                  style={{
                    background: '#1A1A1A',
                    padding: '1.5rem',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    border: '2px solid #2D2D40',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#5D4B8C';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#2D2D40';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                    <h3 style={{ color: '#5D4B8C', margin: 0, fontSize: '1.3rem' }}>{project.title}</h3>
                    {project.persona && (
                      <span style={{
                        backgroundColor: '#2D2D40',
                        color: '#9D8BCC',
                        padding: '0.25rem 0.75rem',
                        borderRadius: '12px',
                        fontSize: '0.85rem',
                        fontWeight: '500'
                      }}>
                        {project.persona.displayName}
                      </span>
                    )}
                  </div>
                  <p style={{ color: '#aaa', margin: '0.5rem 0', lineHeight: '1.5' }}>
                    {project.description}
                  </p>
                  {project.outcome && (
                    <p style={{ color: '#888', margin: '0.5rem 0', fontSize: '0.9rem' }}>
                      🎯 {project.outcome}
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: '1rem', fontSize: '0.85rem', marginTop: '0.75rem' }}>
                    <span style={{ color: '#666' }}>
                      {project.completionType === 'milestone' && '📍 Milestone'}
                      {project.completionType === 'habit_formation' && '🔁 Habit'}
                      {project.completionType === 'ongoing' && '⏳ Ongoing'}
                    </span>
                    <span style={{
                      color: project.status === 'active' ? '#4CAF50' : '#888',
                      fontWeight: '500'
                    }}>
                      ● {project.status}
                    </span>
                  </div>
                </div>
              ))}
              <button
                onClick={() => setShowCreateProject(true)}
                style={{
                  padding: '1.25rem',
                  fontSize: '1rem',
                  backgroundColor: 'transparent',
                  color: '#5D4B8C',
                  border: '2px dashed #5D4B8C',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  fontWeight: '500'
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = '#1A1A1A';
                  e.target.style.borderColor = '#6D5B9C';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = 'transparent';
                  e.target.style.borderColor = '#5D4B8C';
                }}
              >
                + Create New Project
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
    <Footer />
    </div>
  );
}

function CreateProjectForm({ onSubmit, onCancel }) {
  const [goalStatement, setGoalStatement] = useState('');
  const textareaRef = useState(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(goalStatement.trim());
  };

  // Auto-focus the textarea when component mounts
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  return (
    <main style={{
      backgroundColor: '#0D0D0D',
      color: '#D9D9E3',
      minHeight: '100vh',
      padding: 'clamp(1rem, 3vw, 2rem)',
      fontFamily: "'Inter', sans-serif",
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <div style={{ maxWidth: 600, width: '100%' }}>
        <h1 style={{
          textAlign: 'center',
          color: '#5D4B8C',
          marginBottom: '0.5rem',
          fontFamily: "'Cinzel', serif",
          fontSize: 'clamp(1.8rem, 5vw, 2.5rem)'
        }}>
          What do you want to accomplish?
        </h1>
        <p style={{ textAlign: 'center', color: '#aaa', marginBottom: '2.5rem', fontSize: '1rem', lineHeight: '1.6' }}>
          Just type your goal and I'll guide you through the rest. No forms, just conversation.
        </p>

        <form onSubmit={handleSubmit}>
          <textarea
            ref={textareaRef}
            value={goalStatement}
            onChange={(e) => setGoalStatement(e.target.value)}
            placeholder="Examples:
• I want to lose 20 pounds
• I need to launch my SaaS product
• I'm trying to save $10,000 for a house
• I want to learn Python programming
• I need to be more confident in social situations"
            rows={8}
            style={{
              width: '100%',
              padding: '1.25rem',
              fontSize: '1.1rem',
              background: '#1A1A1A',
              border: '2px solid #2D2D40',
              borderRadius: '12px',
              color: '#D9D9E3',
              resize: 'vertical',
              lineHeight: '1.6',
              fontFamily: 'inherit'
            }}
            onFocus={(e) => e.target.style.borderColor = '#5D4B8C'}
            onBlur={(e) => e.target.style.borderColor = '#2D2D40'}
            onKeyDown={(e) => {
              // Submit on Cmd/Ctrl + Enter
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                if (goalStatement.trim()) {
                  handleSubmit(e);
                }
              }
            }}
          />

          <p style={{ color: '#666', fontSize: '0.85rem', marginTop: '0.75rem', textAlign: 'center' }}>
            Tip: Press {navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl'} + Enter to submit
          </p>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
            <button
              type="button"
              onClick={onCancel}
              style={{
                flex: 1,
                padding: '1rem',
                fontSize: '1.05rem',
                backgroundColor: 'transparent',
                color: '#aaa',
                border: '2px solid #2D2D40',
                borderRadius: '10px',
                cursor: 'pointer',
                fontWeight: '500',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.target.style.borderColor = '#5D4B8C';
                e.target.style.color = '#D9D9E3';
              }}
              onMouseLeave={(e) => {
                e.target.style.borderColor = '#2D2D40';
                e.target.style.color = '#aaa';
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!goalStatement.trim()}
              style={{
                flex: 2,
                padding: '1rem',
                fontSize: '1.05rem',
                backgroundColor: goalStatement.trim() ? '#5D4B8C' : '#333',
                color: '#fff',
                border: 'none',
                borderRadius: '10px',
                cursor: goalStatement.trim() ? 'pointer' : 'not-allowed',
                fontWeight: '600',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                if (goalStatement.trim()) {
                  e.target.style.backgroundColor = '#6D5B9C';
                  e.target.style.transform = 'translateY(-1px)';
                }
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = goalStatement.trim() ? '#5D4B8C' : '#333';
                e.target.style.transform = 'translateY(0)';
              }}
            >
              Start →
            </button>
          </div>
        </form>

        <p style={{
          textAlign: 'center',
          color: '#666',
          marginTop: '2rem',
          fontSize: '0.9rem',
          lineHeight: '1.5'
        }}>
          Don't worry about getting it perfect. We'll figure out the details together.
        </p>
      </div>
    </main>
  );
}

export default App;
