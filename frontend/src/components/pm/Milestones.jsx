/**
 * Milestones View - Project Timeline Markers
 * Shows project milestones with status and target dates
 *
 * Can be removed by deleting this file and removing imports from TeamDashboard
 */

import { gql, useQuery, useMutation } from '@apollo/client';
import { useState } from 'react';

const GET_MILESTONES = gql`
  query GetMilestones($teamId: ID!, $projectId: ID) {
    getMilestones(teamId: $teamId, projectId: $projectId) {
      id
      name
      description
      targetDate
      completedAt
      status
      project {
        id
        name
      }
      goal {
        id
        title
      }
    }
  }
`;

const GET_PROJECTS = gql`
  query GetProjects($teamId: ID!) {
    getProjects(teamId: $teamId) {
      id
      name
      status
    }
  }
`;

const COMPLETE_MILESTONE = gql`
  mutation CompleteMilestone($milestoneId: ID!) {
    completeMilestone(milestoneId: $milestoneId) {
      id
      status
      completedAt
    }
  }
`;

function Milestones({ teamId, onClose }) {
  const [selectedProjectId, setSelectedProjectId] = useState(null);

  const { data: projectsData } = useQuery(GET_PROJECTS, {
    variables: { teamId }
  });

  const { data, loading, error, refetch } = useQuery(GET_MILESTONES, {
    variables: { teamId, projectId: selectedProjectId },
    fetchPolicy: 'cache-and-network'
  });

  const [completeMilestone] = useMutation(COMPLETE_MILESTONE);

  const milestones = data?.getMilestones || [];
  const projects = projectsData?.getProjects || [];

  const formatDate = (date) => {
    if (!date) return null;
    return new Date(date).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const isOverdue = (targetDate, status) => {
    if (status === 'completed') return false;
    if (!targetDate) return false;
    return new Date(targetDate) < new Date();
  };

  const handleComplete = async (milestoneId, e) => {
    e.stopPropagation();
    try {
      await completeMilestone({ variables: { milestoneId } });
      refetch();
    } catch (err) {
      console.error('Error completing milestone:', err);
    }
  };

  // Sort milestones by status and date
  const sortedMilestones = [...milestones].sort((a, b) => {
    // Completed last
    if (a.status === 'completed' && b.status !== 'completed') return 1;
    if (a.status !== 'completed' && b.status === 'completed') return -1;
    // By target date
    if (!a.targetDate) return 1;
    if (!b.targetDate) return -1;
    return new Date(a.targetDate) - new Date(b.targetDate);
  });

  if (loading && milestones.length === 0) {
    return (
      <main className="milestones-area">
        <header className="milestones-header">
          <button className="mobile-menu-btn" onClick={onClose} aria-label="Close">
            <span></span><span></span><span></span>
          </button>
          <h3>Milestones</h3>
        </header>
        <div className="milestones-content">
          <div className="loading-screen">
            <div className="loading-spinner"></div>
            <p>Loading milestones...</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="milestones-area">
      <header className="milestones-header">
        <button className="mobile-menu-btn" onClick={onClose} aria-label="Close">
          <span></span><span></span><span></span>
        </button>
        <h3>Milestones</h3>
        <select
          className="input-field"
          style={{ width: 'auto', marginLeft: '1rem' }}
          value={selectedProjectId || ''}
          onChange={(e) => setSelectedProjectId(e.target.value || null)}
        >
          <option value="">All Projects</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
        <div className="header-spacer"></div>
      </header>

      <div className="milestones-content">
        {error ? (
          <div className="error-screen">
            <p>Error loading milestones: {error.message}</p>
          </div>
        ) : sortedMilestones.length === 0 ? (
          <div className="milestones-empty">
            <div className="milestones-empty-icon">🏁</div>
            <h4>No milestones yet</h4>
            <p>Create milestones to track major project goals and deadlines</p>
          </div>
        ) : (
          <div className="milestones-timeline">
            {sortedMilestones.map((milestone) => (
              <div
                key={milestone.id}
                className={`milestone-item ${milestone.status}`}
              >
                <div className="milestone-header">
                  <span className="milestone-name">{milestone.name}</span>
                  <span className={`milestone-status ${milestone.status}`}>
                    {milestone.status === 'completed' ? 'Completed' :
                     milestone.status === 'in_progress' ? 'In Progress' :
                     milestone.status === 'missed' ? 'Missed' : 'Pending'}
                  </span>
                </div>
                {milestone.description && (
                  <p className="milestone-description">{milestone.description}</p>
                )}
                <div className="milestone-meta">
                  {milestone.project && (
                    <span className="milestone-project">
                      📁 {milestone.project.name}
                    </span>
                  )}
                  {milestone.targetDate && (
                    <span className={`milestone-date ${isOverdue(milestone.targetDate, milestone.status) ? 'overdue' : ''}`}>
                      🎯 {formatDate(milestone.targetDate)}
                      {isOverdue(milestone.targetDate, milestone.status) && ' (Overdue)'}
                    </span>
                  )}
                  {milestone.completedAt && (
                    <span className="milestone-date">
                      ✓ Completed {formatDate(milestone.completedAt)}
                    </span>
                  )}
                  {milestone.status !== 'completed' && (
                    <button
                      className="btn-secondary btn-small"
                      onClick={(e) => handleComplete(milestone.id, e)}
                      style={{ marginLeft: 'auto' }}
                    >
                      Mark Complete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

export default Milestones;
