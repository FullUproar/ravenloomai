/**
 * Gantt Chart View - Simplified Task Timeline
 * Shows tasks on a timeline with start/end dates
 *
 * Can be removed by deleting this file and removing imports from TeamDashboard
 */

import { gql, useQuery } from '@apollo/client';
import { useState, useMemo } from 'react';

const GET_GANTT_DATA = gql`
  query GetGanttData($teamId: ID!, $projectId: ID) {
    getGanttData(teamId: $teamId, projectId: $projectId) {
      tasks {
        id
        title
        startDate
        endDate
        status
        assignedTo
        projectId
      }
      milestones {
        id
        name
        targetDate
        status
      }
      projectStart
      projectEnd
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

function GanttChart({ teamId, onClose, onTaskClick }) {
  const [selectedProjectId, setSelectedProjectId] = useState(null);

  const { data: projectsData } = useQuery(GET_PROJECTS, {
    variables: { teamId }
  });

  const { data, loading, error } = useQuery(GET_GANTT_DATA, {
    variables: { teamId, projectId: selectedProjectId },
    fetchPolicy: 'cache-and-network'
  });

  const gantt = data?.getGanttData;
  const projects = projectsData?.getProjects || [];

  // Calculate date range for display
  const { dates, dateRange } = useMemo(() => {
    if (!gantt) return { dates: [], dateRange: { start: null, end: null } };

    let start = gantt.projectStart ? new Date(gantt.projectStart) : new Date();
    let end = gantt.projectEnd ? new Date(gantt.projectEnd) : new Date();

    // Ensure at least 14 days of range
    const minDays = 14;
    const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    if (daysDiff < minDays) {
      end = new Date(start);
      end.setDate(end.getDate() + minDays);
    }

    // Add padding
    start.setDate(start.getDate() - 2);
    end.setDate(end.getDate() + 2);

    // Generate dates array
    const datesArr = [];
    const current = new Date(start);
    while (current <= end) {
      datesArr.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }

    return {
      dates: datesArr,
      dateRange: { start, end }
    };
  }, [gantt]);

  const getBarPosition = (task) => {
    if (!task.startDate || !task.endDate || !dateRange.start) {
      return { left: '0%', width: '0%' };
    }

    const totalDays = (dateRange.end - dateRange.start) / (1000 * 60 * 60 * 24);
    const startDays = (new Date(task.startDate) - dateRange.start) / (1000 * 60 * 60 * 24);
    const endDays = (new Date(task.endDate) - dateRange.start) / (1000 * 60 * 60 * 24);

    const left = Math.max(0, (startDays / totalDays) * 100);
    const width = Math.max(2, ((endDays - startDays) / totalDays) * 100);

    return {
      left: `${left}%`,
      width: `${Math.min(width, 100 - left)}%`
    };
  };

  const getBarClass = (task) => {
    if (task.status === 'done') return 'completed';
    if (task.status === 'in_progress') return 'in-progress';
    if (task.endDate && new Date(task.endDate) < new Date()) return 'overdue';
    return '';
  };

  const getTodayPosition = () => {
    if (!dateRange.start || !dateRange.end) return null;
    const totalDays = (dateRange.end - dateRange.start) / (1000 * 60 * 60 * 24);
    const todayDays = (new Date() - dateRange.start) / (1000 * 60 * 60 * 24);
    const position = (todayDays / totalDays) * 100;
    if (position < 0 || position > 100) return null;
    return `${position}%`;
  };

  const formatDateHeader = (date) => {
    const today = new Date();
    if (date.toDateString() === today.toDateString()) return 'Today';
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const isToday = (date) => {
    return date.toDateString() === new Date().toDateString();
  };

  if (loading && !gantt) {
    return (
      <main className="gantt-area">
        <header className="gantt-header">
          <button className="mobile-menu-btn" onClick={onClose} aria-label="Close">
            <span></span><span></span><span></span>
          </button>
          <h3>Gantt Chart</h3>
        </header>
        <div className="gantt-content">
          <div className="loading-screen">
            <div className="loading-spinner"></div>
            <p>Loading timeline...</p>
          </div>
        </div>
      </main>
    );
  }

  const todayPos = getTodayPosition();

  return (
    <main className="gantt-area">
      <header className="gantt-header">
        <button className="mobile-menu-btn" onClick={onClose} aria-label="Close">
          <span></span><span></span><span></span>
        </button>
        <h3>Gantt Chart</h3>
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

      <div className="gantt-content">
        {error ? (
          <div className="error-screen">
            <p>Error loading gantt data: {error.message}</p>
          </div>
        ) : !gantt?.tasks || gantt.tasks.length === 0 ? (
          <div className="gantt-empty">
            <div className="gantt-empty-icon">📊</div>
            <h4>No tasks with dates</h4>
            <p>Add start and end dates to tasks to see them on the timeline</p>
          </div>
        ) : (
          <div className="gantt-chart">
            {/* Timeline Header */}
            <div className="gantt-timeline-header">
              <div className="gantt-task-col">Task</div>
              <div className="gantt-dates-col">
                {dates.filter((_, i) => i % 2 === 0).map((date, i) => (
                  <div
                    key={i}
                    className={`gantt-date ${isToday(date) ? 'today' : ''}`}
                    style={{ flex: 2 }}
                  >
                    {formatDateHeader(date)}
                  </div>
                ))}
              </div>
            </div>

            {/* Task Rows */}
            <div className="gantt-rows">
              {gantt.tasks.map((task, index) => (
                <div
                  key={task.id}
                  className="gantt-row"
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  <div
                    className="gantt-task-name"
                    onClick={() => onTaskClick?.(task.id)}
                    style={{ cursor: 'pointer' }}
                    title={task.title}
                  >
                    {task.title}
                  </div>
                  <div className="gantt-task-bar-container">
                    {todayPos && (
                      <div
                        className="gantt-today-line"
                        style={{ left: todayPos }}
                      />
                    )}
                    <div
                      className={`gantt-task-bar ${getBarClass(task)}`}
                      style={getBarPosition(task)}
                      title={`${task.title}: ${task.startDate ? new Date(task.startDate).toLocaleDateString() : '?'} - ${task.endDate ? new Date(task.endDate).toLocaleDateString() : '?'}`}
                    />
                  </div>
                </div>
              ))}

              {/* Milestones */}
              {gantt.milestones?.map((milestone, index) => (
                <div
                  key={`milestone-${milestone.id}`}
                  className="gantt-row"
                  style={{ animationDelay: `${(gantt.tasks.length + index) * 0.05}s` }}
                >
                  <div className="gantt-task-name" title={milestone.name}>
                    🏁 {milestone.name}
                  </div>
                  <div className="gantt-task-bar-container">
                    {milestone.targetDate && (
                      <div
                        className={`gantt-task-bar ${milestone.status === 'completed' ? 'completed' : ''}`}
                        style={{
                          ...getBarPosition({
                            startDate: milestone.targetDate,
                            endDate: milestone.targetDate
                          }),
                          width: '4px',
                          background: 'var(--pop)'
                        }}
                        title={`Milestone: ${new Date(milestone.targetDate).toLocaleDateString()}`}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

export default GanttChart;
