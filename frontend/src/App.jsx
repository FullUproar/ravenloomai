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

  const handleCreateProject = async (projectData) => {
    try {
      console.log('Creating project:', projectData);

      // Step 1: Create the project
      const projectResult = await createProject({
        variables: {
          userId: user?.uid || "test-user-123",
          input: {
            title: projectData.title,
            description: projectData.description,
            completionType: projectData.completionType || 'milestone',
            outcome: projectData.outcome
          }
        }
      });

      const projectId = projectResult.data.createProject.id;
      console.log('Project created with ID:', projectId);

      // Step 2: Create AI persona from user goal
      const personaResult = await createPersona({
        variables: {
          projectId: parseInt(projectId),
          userId: user?.uid || "test-user-123",
          userGoal: projectData.userGoal,
          preferences: projectData.preferences || {
            tone: 'friendly',
            verbosity: 'balanced',
            emoji: true,
            platitudes: false
          }
        }
      });

      console.log('Persona created:', personaResult.data.createPersonaFromGoal);

      // Navigate to the new project
      navigate(`/project/${projectId}/overview`);
      setShowCreateProject(false);
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
  const [step, setStep] = useState(1);
  const [userGoal, setUserGoal] = useState('');
  const [title, setTitle] = useState('');
  const [outcome, setOutcome] = useState('');
  const [completionType, setCompletionType] = useState('milestone');
  const [preferences, setPreferences] = useState({
    tone: 'friendly',
    verbosity: 'balanced',
    emoji: true,
    platitudes: false
  });

  const handleContinue = () => {
    // Extract title from first sentence of user goal
    const extractedTitle = userGoal.split('.')[0].split('\n')[0].substring(0, 80);
    setTitle(extractedTitle);
    setStep(2);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      title,
      description: userGoal,
      outcome,
      completionType,
      userGoal,
      preferences
    });
  };

  return (
    <main style={{
      backgroundColor: '#0D0D0D',
      color: '#D9D9E3',
      minHeight: '100vh',
      padding: 'clamp(1rem, 3vw, 2rem)',
      fontFamily: "'Inter', sans-serif",
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center'
    }}>
      <div style={{ maxWidth: 600, width: '100%' }}>
        <h1 style={{
          textAlign: 'center',
          color: '#5D4B8C',
          marginBottom: '0.5rem',
          fontFamily: "'Cinzel', serif"
        }}>
          Create New Project
        </h1>
        <p style={{ textAlign: 'center', color: '#888', marginBottom: '2rem' }}>
          Step {step} of 2
        </p>

        {step === 1 && (
          <div>
            <label style={{
              display: 'block',
              marginBottom: '1rem',
              color: '#D9D9E3',
              fontSize: '1.1rem',
              fontWeight: '500'
            }}>
              What do you want to achieve?
            </label>
            <p style={{ color: '#aaa', marginBottom: '1rem', fontSize: '0.95rem' }}>
              Describe your goal in your own words. Our AI will help you create a plan and guide you every step of the way.
            </p>
            <textarea
              value={userGoal}
              onChange={(e) => setUserGoal(e.target.value)}
              placeholder="Example: I want to lose 20 pounds by eating healthier and exercising regularly. I need someone to keep me accountable and help me build better habits."
              rows={6}
              style={{
                width: '100%',
                padding: '1rem',
                fontSize: '1rem',
                background: '#1A1A1A',
                border: '2px solid #2D2D40',
                borderRadius: '8px',
                color: '#D9D9E3',
                resize: 'vertical',
                lineHeight: '1.5',
                fontFamily: 'inherit'
              }}
              onFocus={(e) => e.target.style.borderColor = '#5D4B8C'}
              onBlur={(e) => e.target.style.borderColor = '#2D2D40'}
            />

            <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
              <button
                type="button"
                onClick={onCancel}
                style={{
                  flex: 1,
                  padding: '0.875rem',
                  fontSize: '1rem',
                  backgroundColor: '#2D2D40',
                  color: '#D9D9E3',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '500'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleContinue}
                disabled={!userGoal.trim() || userGoal.trim().length < 20}
                style={{
                  flex: 2,
                  padding: '0.875rem',
                  fontSize: '1rem',
                  backgroundColor: (userGoal.trim() && userGoal.trim().length >= 20) ? '#5D4B8C' : '#333',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: (userGoal.trim() && userGoal.trim().length >= 20) ? 'pointer' : 'not-allowed',
                  fontWeight: '500'
                }}
              >
                Continue →
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: '#D9D9E3', fontWeight: '500' }}>
                Project Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  fontSize: '1rem',
                  background: '#1A1A1A',
                  border: '2px solid #2D2D40',
                  borderRadius: '8px',
                  color: '#D9D9E3'
                }}
                onFocus={(e) => e.target.style.borderColor = '#5D4B8C'}
                onBlur={(e) => e.target.style.borderColor = '#2D2D40'}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: '#D9D9E3', fontWeight: '500' }}>
                Desired Outcome
              </label>
              <input
                type="text"
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
                placeholder="What does success look like?"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  fontSize: '1rem',
                  background: '#1A1A1A',
                  border: '2px solid #2D2D40',
                  borderRadius: '8px',
                  color: '#D9D9E3'
                }}
                onFocus={(e) => e.target.style.borderColor = '#5D4B8C'}
                onBlur={(e) => e.target.style.borderColor = '#2D2D40'}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: '#D9D9E3', fontWeight: '500' }}>
                Project Type
              </label>
              <select
                value={completionType}
                onChange={(e) => setCompletionType(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  fontSize: '1rem',
                  background: '#1A1A1A',
                  border: '2px solid #2D2D40',
                  borderRadius: '8px',
                  color: '#D9D9E3'
                }}
              >
                <option value="milestone">📍 Milestone (One-time goal)</option>
                <option value="habit_formation">🔁 Habit Formation (Build a routine)</option>
                <option value="ongoing">⏳ Ongoing (Continuous improvement)</option>
              </select>
            </div>

            <div style={{
              background: '#1A1A1A',
              padding: '1rem',
              borderRadius: '8px',
              border: '1px solid #2D2D40'
            }}>
              <label style={{ display: 'block', marginBottom: '1rem', color: '#D9D9E3', fontWeight: '500' }}>
                AI Coach Preferences
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.25rem', color: '#aaa', fontSize: '0.9rem' }}>
                    Tone
                  </label>
                  <select
                    value={preferences.tone}
                    onChange={(e) => setPreferences({...preferences, tone: e.target.value})}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      fontSize: '0.9rem',
                      background: '#0D0D0D',
                      border: '1px solid #333',
                      borderRadius: '4px',
                      color: '#D9D9E3'
                    }}
                  >
                    <option value="friendly">Friendly</option>
                    <option value="direct">Direct</option>
                    <option value="professional">Professional</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '0.25rem', color: '#aaa', fontSize: '0.9rem' }}>
                    Verbosity
                  </label>
                  <select
                    value={preferences.verbosity}
                    onChange={(e) => setPreferences({...preferences, verbosity: e.target.value})}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      fontSize: '0.9rem',
                      background: '#0D0D0D',
                      border: '1px solid #333',
                      borderRadius: '4px',
                      color: '#D9D9E3'
                    }}
                  >
                    <option value="concise">Concise</option>
                    <option value="balanced">Balanced</option>
                    <option value="detailed">Detailed</option>
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={preferences.emoji}
                    onChange={(e) => setPreferences({...preferences, emoji: e.target.checked})}
                    style={{ cursor: 'pointer' }}
                  />
                  <label style={{ color: '#aaa', fontSize: '0.9rem', cursor: 'pointer' }}>
                    Use Emoji
                  </label>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={!preferences.platitudes}
                    onChange={(e) => setPreferences({...preferences, platitudes: !e.target.checked})}
                    style={{ cursor: 'pointer' }}
                  />
                  <label style={{ color: '#aaa', fontSize: '0.9rem', cursor: 'pointer' }}>
                    Skip Platitudes
                  </label>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
              <button
                type="button"
                onClick={() => setStep(1)}
                style={{
                  flex: 1,
                  padding: '0.875rem',
                  fontSize: '1rem',
                  backgroundColor: '#2D2D40',
                  color: '#D9D9E3',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '500'
                }}
              >
                ← Back
              </button>
              <button
                type="submit"
                disabled={!title.trim()}
                style={{
                  flex: 2,
                  padding: '0.875rem',
                  fontSize: '1rem',
                  backgroundColor: title.trim() ? '#5D4B8C' : '#333',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: title.trim() ? 'pointer' : 'not-allowed',
                  fontWeight: '500'
                }}
              >
                Create Project & AI Coach
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}

export default App;
