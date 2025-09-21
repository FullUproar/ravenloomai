import { gql, useQuery, useMutation } from '@apollo/client';
import { useState, useEffect } from 'react';
import { auth } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import Login from './Login.jsx';
import ProjectDashboard from './ProjectDashboard.jsx';
import ReactMarkdown from 'react-markdown';

// GraphQL queries/mutations
const GET_PROJECTS = gql`
  query GetProjects($userId: String!) {
    getProjects(userId: $userId) {
      id
      title
      description
      domain
      status
      createdAt
    }
  }
`;

const GET_PROJECT = gql`
  query GetProject($userId: String!, $projectId: ID!) {
    getProject(userId: $userId, projectId: $projectId) {
      id
      title
      description
      domain
      status
      goals {
        id
        title
        description
        targetValue
        currentValue
        unit
        status
        targetDate
      }
      tasks {
        id
        title
        description
        type
        status
        priority
        assignedTo
        requiresApproval
        dueDate
        completedAt
      }
      metrics {
        id
        name
        value
        unit
        recordedAt
        source
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
      domain
    }
  }
`;

const CHAT = gql`
  mutation Chat($userId: String!, $projectId: ID, $message: String!) {
    chat(userId: $userId, projectId: $projectId, message: $message) {
      reply
      suggestedTasks {
        title
        description
        type
      }
      suggestedMetrics {
        name
        value
        unit
      }
    }
  }
`;

function App() {
  const [user, setUser] = useState(null);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [showCreateProject, setShowCreateProject] = useState(false);

  const { loading: projectsLoading, error: projectsError, data: projectsData } = useQuery(GET_PROJECTS, {
    variables: { userId: user?.uid || "test-user-001" },
    skip: !user
  });

  const [createProject] = useMutation(CREATE_PROJECT, {
    refetchQueries: [{ query: GET_PROJECTS, variables: { userId: user?.uid || "test-user-001" } }],
    onCompleted: (data) => {
      // Select the newly created project
      setSelectedProjectId(data.createProject.id);
    }
  });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  // Auto-select first project if none selected
  useEffect(() => {
    if (projectsData?.getProjects?.length > 0 && !selectedProjectId) {
      console.log('Auto-selecting project:', projectsData.getProjects[0].title, 'ID:', projectsData.getProjects[0].id);
      setSelectedProjectId(projectsData.getProjects[0].id);
    }
  }, [projectsData, selectedProjectId]);

  // Bypass auth for testing - remove this line to re-enable authentication
  if (!user) setUser({ uid: "test-user-001" });
  
  // if (!user) return <Login onLogin={setUser} />;

  if (projectsLoading) return <p style={{ color: '#ccc' }}>Loading projects...</p>;
  if (projectsError) return <p style={{ color: '#f88' }}>Error loading projects: {projectsError.message}</p>;

  const projects = projectsData?.getProjects || [];

  const handleCreateProject = async (projectData) => {
    try {
      console.log('Creating project:', projectData);
      const result = await createProject({
        variables: {
          userId: user?.uid || "test-user-001",
          input: projectData
        }
      });
      console.log('Project created:', result.data.createProject);
      setShowCreateProject(false);
    } catch (error) {
      console.error('Error creating project:', error);
    }
  };

  if (showCreateProject) {
    return <CreateProjectForm onSubmit={handleCreateProject} onCancel={() => setShowCreateProject(false)} />;
  }

  if (selectedProjectId) {
    return (
      <ProjectDashboard 
        userId={user?.uid || "test-user-001"}
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
          <img
            src="/raven.png"
            alt="RavenLoom"
            style={{
              width: '96px',
              filter: 'drop-shadow(0 0 6px #5D4B8C)'
            }}
          />
          <h1 style={{
            fontFamily: "'Cinzel', serif",
            fontSize: '2.5rem',
            color: '#5D4B8C',
            marginTop: '1rem',
          }}>
            RavenLoom
          </h1>
        </div>

        {projects.length === 0 ? (
          <div style={{ textAlign: 'center', marginTop: '3rem' }}>
            <h2 style={{ color: '#D9D9E3', marginBottom: '1rem' }}>Welcome to RavenLoom</h2>
            <p style={{ color: '#aaa', marginBottom: '2rem' }}>
              Create your first project to get started with autonomous goal achievement
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
                cursor: 'pointer'
              }}
            >
              Create Project
            </button>
          </div>
        ) : (
          <div style={{ textAlign: 'center', marginTop: '3rem' }}>
            <h2 style={{ color: '#D9D9E3', marginBottom: '1rem' }}>Your Projects</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {projects.map(project => (
                <div 
                  key={project.id}
                  onClick={() => setSelectedProjectId(project.id)}
                  style={{
                    background: '#1A1A1A',
                    padding: '1.5rem',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    border: '2px solid transparent',
                    transition: 'border-color 0.2s'
                  }}
                  onMouseEnter={(e) => e.target.style.borderColor = '#5D4B8C'}
                  onMouseLeave={(e) => e.target.style.borderColor = 'transparent'}
                >
                  <h3 style={{ color: '#5D4B8C', margin: '0 0 0.5rem 0' }}>{project.title}</h3>
                  <p style={{ color: '#aaa', margin: '0 0 0.5rem 0' }}>{project.description}</p>
                  <div style={{ display: 'flex', gap: '1rem', fontSize: '0.9rem' }}>
                    <span style={{ color: '#888' }}>Domain: {project.domain}</span>
                    <span style={{ color: '#888' }}>Status: {project.status}</span>
                  </div>
                </div>
              ))}
              <button 
                onClick={() => setShowCreateProject(true)}
                style={{
                  padding: '1rem',
                  fontSize: '1rem',
                  backgroundColor: '#2D2D40',
                  color: '#5D4B8C',
                  border: '2px dashed #5D4B8C',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                + Create New Project
              </button>
            </div>
          </div>
        )}
      </div>
      <button onClick={() => signOut(auth)} style={{ marginTop: '2rem', color: '#ccc', background: 'none', border: 'none', cursor: 'pointer' }}>
        Sign Out
      </button>
    </main>
  );
}

function CreateProjectForm({ onSubmit, onCancel }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [domain, setDomain] = useState('business');

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({ title, description, domain });
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
      <div style={{ maxWidth: 500, width: '100%' }}>
        <h1 style={{ textAlign: 'center', color: '#5D4B8C', marginBottom: '2rem' }}>Create New Project</h1>
        
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#D9D9E3' }}>Project Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="e.g., E-commerce Startup, Health Journey"
              style={{
                width: '100%',
                padding: '0.75rem',
                fontSize: '1rem',
                background: '#1A1A1A',
                border: '1px solid #333',
                borderRadius: '4px',
                color: '#D9D9E3'
              }}
            />
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#D9D9E3' }}>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe your project goals and what you want to achieve..."
              rows={4}
              style={{
                width: '100%',
                padding: '0.75rem',
                fontSize: '1rem',
                background: '#1A1A1A',
                border: '1px solid #333',
                borderRadius: '4px',
                color: '#D9D9E3',
                resize: 'vertical'
              }}
            />
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#D9D9E3' }}>Domain</label>
            <select
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                fontSize: '1rem',
                background: '#1A1A1A',
                border: '1px solid #333',
                borderRadius: '4px',
                color: '#D9D9E3'
              }}
            >
              <option value="business">Business</option>
              <option value="health">Health & Fitness</option>
              <option value="creative">Creative</option>
              <option value="personal">Personal Development</option>
              <option value="education">Education</option>
              <option value="other">Other</option>
            </select>
          </div>
          
          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            <button
              type="submit"
              disabled={!title.trim()}
              style={{
                flex: 1,
                padding: '0.75rem',
                fontSize: '1rem',
                backgroundColor: title.trim() ? '#5D4B8C' : '#333',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: title.trim() ? 'pointer' : 'not-allowed'
              }}
            >
              Create Project
            </button>
            <button
              type="button"
              onClick={onCancel}
              style={{
                flex: 1,
                padding: '0.75rem',
                fontSize: '1rem',
                backgroundColor: '#333',
                color: '#D9D9E3',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

export default App;
