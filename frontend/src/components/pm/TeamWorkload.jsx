/**
 * Team Workload Dashboard - Resource Allocation View
 * Shows team member utilization, task counts, and capacity
 *
 * Can be removed by deleting this file and removing imports from TeamDashboard
 */

import { gql, useQuery } from '@apollo/client';

const GET_TEAM_WORKLOAD = gql`
  query GetTeamWorkload($teamId: ID!) {
    getTeamWorkload(teamId: $teamId) {
      teamId
      totalOpenTasks
      totalOverdueTasks
      averageUtilization
      overallocatedMembers
      members {
        userId
        displayName
        openTasks
        overdueTasks
        dueThisWeek
        totalEstimatedHours
        weeklyCapacity
        utilizationPercent
        isOverallocated
      }
    }
  }
`;

function TeamWorkload({ teamId, onClose }) {
  const { data, loading, error } = useQuery(GET_TEAM_WORKLOAD, {
    variables: { teamId },
    fetchPolicy: 'cache-and-network'
  });

  const workload = data?.getTeamWorkload;

  const getUtilizationClass = (percent) => {
    if (percent >= 100) return 'high';
    if (percent >= 75) return 'medium';
    return 'low';
  };

  const getStatusText = (member) => {
    if (member.isOverallocated) return 'Overallocated';
    if (member.utilizationPercent >= 75) return 'Busy';
    return 'Available';
  };

  const getStatusClass = (member) => {
    if (member.isOverallocated) return 'overallocated';
    if (member.utilizationPercent >= 75) return 'busy';
    return 'available';
  };

  if (loading && !workload) {
    return (
      <main className="workload-area">
        <header className="workload-header">
          <button className="mobile-menu-btn" onClick={onClose} aria-label="Close">
            <span></span><span></span><span></span>
          </button>
          <h3>Team Workload</h3>
        </header>
        <div className="workload-content">
          <div className="loading-screen">
            <div className="loading-spinner"></div>
            <p>Loading workload data...</p>
          </div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="workload-area">
        <header className="workload-header">
          <button className="mobile-menu-btn" onClick={onClose} aria-label="Close">
            <span></span><span></span><span></span>
          </button>
          <h3>Team Workload</h3>
        </header>
        <div className="workload-content">
          <div className="error-screen">
            <p>Error loading workload: {error.message}</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="workload-area">
      <header className="workload-header">
        <button className="mobile-menu-btn" onClick={onClose} aria-label="Close">
          <span></span><span></span><span></span>
        </button>
        <h3>Team Workload</h3>
        <div className="header-spacer"></div>
      </header>

      {/* Summary Cards */}
      <div className="workload-summary">
        <div className="summary-card">
          <div className="summary-value">{workload?.totalOpenTasks || 0}</div>
          <div className="summary-label">Open Tasks</div>
        </div>
        <div className="summary-card">
          <div className={`summary-value ${workload?.totalOverdueTasks > 0 ? 'warning' : ''}`}>
            {workload?.totalOverdueTasks || 0}
          </div>
          <div className="summary-label">Overdue</div>
        </div>
        <div className="summary-card">
          <div className={`summary-value ${workload?.averageUtilization >= 100 ? 'warning' : ''}`}>
            {Math.round(workload?.averageUtilization || 0)}%
          </div>
          <div className="summary-label">Avg Utilization</div>
        </div>
        <div className="summary-card">
          <div className={`summary-value ${workload?.overallocatedMembers > 0 ? 'warning' : 'success'}`}>
            {workload?.overallocatedMembers || 0}
          </div>
          <div className="summary-label">Overallocated</div>
        </div>
      </div>

      {/* Team Members */}
      <div className="workload-content">
        {!workload?.members || workload.members.length === 0 ? (
          <div className="workload-empty">
            <div className="workload-empty-icon">👥</div>
            <h4>No workload data</h4>
            <p>Assign tasks to team members to see workload data</p>
          </div>
        ) : (
          <div className="workload-grid">
            {workload.members.map((member) => (
              <div
                key={member.userId}
                className={`member-card ${member.isOverallocated ? 'overallocated' : ''}`}
              >
                <div className="member-header">
                  <div className="member-avatar">
                    {(member.displayName || 'U')[0].toUpperCase()}
                  </div>
                  <div className="member-info">
                    <div className="member-name">{member.displayName || 'Unknown'}</div>
                    <div className="member-role">{member.weeklyCapacity}h/week capacity</div>
                  </div>
                  <span className={`member-status ${getStatusClass(member)}`}>
                    {getStatusText(member)}
                  </span>
                </div>

                <div className="utilization-bar">
                  <div className="utilization-header">
                    <span className="utilization-label">Utilization</span>
                    <span className="utilization-value">{Math.round(member.utilizationPercent)}%</span>
                  </div>
                  <div className="utilization-track">
                    <div
                      className={`utilization-fill ${getUtilizationClass(member.utilizationPercent)}`}
                      style={{ width: `${Math.min(member.utilizationPercent, 100)}%` }}
                    />
                  </div>
                </div>

                <div className="task-stats">
                  <div className="stat-item">
                    <span className="stat-icon">📋</span>
                    <span className="stat-value">{member.openTasks}</span>
                    <span className="stat-label">open</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-icon">⚠️</span>
                    <span className="stat-value">{member.overdueTasks}</span>
                    <span className="stat-label">overdue</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-icon">📅</span>
                    <span className="stat-value">{member.dueThisWeek}</span>
                    <span className="stat-label">this week</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

export default TeamWorkload;
