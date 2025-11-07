import { Routes, Route, Navigate } from 'react-router-dom';
import ProjectDashboardMobile from './ProjectDashboardMobile.jsx';

function AppRoutes({ user, projects, onSignOut, onCreateProject }) {
  if (projects.length === 0) {
    return null; // Parent will handle empty state
  }

  return (
    <Routes>
      {/* Redirect root to first project */}
      <Route path="/" element={<Navigate to={`/project/${projects[0].id}/chat`} replace />} />

      {/* Project routes with view */}
      <Route path="/project/:projectId/:view" element={
        <ProjectDashboardMobile
          userId={user?.uid || "test-user-123"}
          projects={projects}
          onSignOut={onSignOut}
          onCreateProject={onCreateProject}
        />
      } />

      {/* Project routes without view default to chat */}
      <Route path="/project/:projectId" element={
        <Navigate to={window.location.pathname + '/chat'} replace />
      } />

      {/* Fallback to first project */}
      <Route path="*" element={<Navigate to={`/project/${projects[0].id}/chat`} replace />} />
    </Routes>
  );
}

export default AppRoutes;
