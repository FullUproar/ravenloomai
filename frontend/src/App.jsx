import { gql, useQuery, useMutation } from '@apollo/client';
import { useState, useEffect } from 'react';
import { auth } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import Login from './Login.jsx';
import ProjectDashboard from './ProjectDashboard.jsx';

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

function App() {
  const [user, setUser] = useState(null);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [showCreateProject, setShowCreateProject] = useState(false);

  const { loading: projectsLoading, error: projectsError, data: projectsData } = useQuery(GET_PROJECTS, {
    variables: { userId: user?.uid || "test-user-123" },
    skip: !user
  });

  const [createProject] = useMutation(CREATE_PROJECT);
  const [createPersona] = useMutation(CREATE_PERSONA_FROM_GOAL, {
    refetchQueries: ['GetProjects']
  });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  // Auto-select first project if none selected
  useEffect(() => {
    if (projectsData?.getProjects?.length > 0 && !selectedProjectId) {
      setSelectedProjectId(projectsData.getProjects[0].id);
    }
  }, [projectsData, selectedProjectId]);

  // Show login if no user
  if (!user) return <Login onLogin={setUser} />;

  if (projectsLoading) return <p style={{ color: '#ccc' }}>Loading projects...</p>;

  if (projectsError) {
    return <p style={{ color: '#f88' }}>Error loading projects: {projectsError.message}</p>;
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

      // Select the new project
      setSelectedProjectId(projectId);
      setShowCreateProject(false);
    } catch (error) {
      console.error('Error creating project:', error);
      alert('Failed to create project: ' + error.message);
    }
  };

  if (showCreateProject) {
    return (
      <CreateProjectForm
        onSubmit={handleCreateProject}
        onCancel={() => setShowCreateProject(false)}
      />
    );
  }

  if (selectedProjectId) {
    return (
      <ProjectDashboard
        userId={user?.uid || "test-user-123"}
        projectId={selectedProjectId}
        projects={projects}
        onProjectChange={setSelectedProjectId}
        onCreateProject={() => setShowCreateProject(true)}
        onSignOut={() => signOut(auth)}
      />
    );
  }

  return (
    <main style={{
      backgroundColor: '#0D0D0D',
      color: '#D9D9E3',
      minHeight: '100vh',
      padding: '2rem',
      fontFamily: "'Inter', sans-serif",
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center'
    }}>
      <div style={{ maxWidth: 700, width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{
            fontFamily: "'Cinzel', serif",
            fontSize: '2.5rem',
            color: '#5D4B8C',
            marginTop: '1rem',
          }}>
            🪶 RavenLoom
          </h1>
          <p style={{ color: '#aaa', marginTop: '0.5rem' }}>PM in a box. Just add any human.</p>
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
                  onClick={() => setSelectedProjectId(project.id)}
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
      <button
        onClick={() => signOut(auth)}
        style={{
          marginTop: '3rem',
          color: '#666',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: '0.9rem'
        }}
        onMouseEnter={(e) => e.target.style.color = '#888'}
        onMouseLeave={(e) => e.target.style.color = '#666'}
      >
        Sign Out
      </button>
    </main>
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
      padding: '2rem',
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
