/**
 * Pro Mode Settings - Feature Flags Toggle
 * Allows users to enable/disable advanced PM features
 *
 * Can be removed by deleting this file and removing imports from TeamDashboard
 */

import { gql, useQuery, useMutation } from '@apollo/client';

const GET_MY_FEATURE_FLAGS = gql`
  query GetMyFeatureFlags {
    getMyFeatureFlags {
      proModeEnabled
      showGanttChart
      showWBS
      showTimeTracking
      showDependenciesGraph
      showResourceAllocation
      showCriticalPath
      showEisenhowerMatrix
      showWorkloadHistogram
      showMilestones
      showTimeBlocking
      showContexts
      preferredProductivityMethod
    }
  }
`;

const UPDATE_MY_FEATURE_FLAGS = gql`
  mutation UpdateMyFeatureFlags($input: UserFeatureFlagsInput!) {
    updateMyFeatureFlags(input: $input) {
      proModeEnabled
      showGanttChart
      showWBS
      showTimeTracking
      showDependenciesGraph
      showResourceAllocation
      showCriticalPath
      showEisenhowerMatrix
      showWorkloadHistogram
      showMilestones
      showTimeBlocking
      showContexts
      preferredProductivityMethod
    }
  }
`;

const ENABLE_PRO_MODE = gql`
  mutation EnableProMode {
    enableProMode {
      proModeEnabled
      showGanttChart
      showEisenhowerMatrix
      showWorkloadHistogram
      showMilestones
      showTimeBlocking
    }
  }
`;

const DISABLE_PRO_MODE = gql`
  mutation DisableProMode {
    disableProMode {
      proModeEnabled
      showGanttChart
      showEisenhowerMatrix
      showWorkloadHistogram
      showMilestones
      showTimeBlocking
    }
  }
`;

const featureDefinitions = [
  { key: 'showGanttChart', label: 'Gantt Chart', icon: '📊' },
  { key: 'showWBS', label: 'Work Breakdown Structure', icon: '🌳' },
  { key: 'showEisenhowerMatrix', label: 'Eisenhower Matrix', icon: '⚡' },
  { key: 'showWorkloadHistogram', label: 'Workload Dashboard', icon: '👥' },
  { key: 'showMilestones', label: 'Milestones', icon: '🏁' },
  { key: 'showTimeBlocking', label: 'Time Blocking', icon: '📅' },
  { key: 'showContexts', label: 'GTD Contexts', icon: '🏷️' },
  { key: 'showTimeTracking', label: 'Time Tracking', icon: '⏱️' },
  { key: 'showDependenciesGraph', label: 'Dependencies Graph', icon: '🔗' },
  { key: 'showResourceAllocation', label: 'Resource Allocation', icon: '📈' },
  { key: 'showCriticalPath', label: 'Critical Path', icon: '🛤️' },
];

function ProModeSettings({ onClose }) {
  const { data, loading, refetch } = useQuery(GET_MY_FEATURE_FLAGS);
  const [updateFlags] = useMutation(UPDATE_MY_FEATURE_FLAGS);
  const [enableProMode] = useMutation(ENABLE_PRO_MODE);
  const [disableProMode] = useMutation(DISABLE_PRO_MODE);

  const flags = data?.getMyFeatureFlags;

  // Use sticky proModeEnabled flag from backend
  const isProModeEnabled = flags?.proModeEnabled || false;

  const handleToggleProMode = async () => {
    try {
      if (isProModeEnabled) {
        await disableProMode();
      } else {
        await enableProMode();
      }
      refetch();
    } catch (err) {
      console.error('Error toggling pro mode:', err);
    }
  };

  const handleToggleFeature = async (key) => {
    if (!flags) return;
    try {
      await updateFlags({
        variables: {
          input: {
            [key]: !flags[key]
          }
        }
      });
      refetch();
    } catch (err) {
      console.error('Error updating feature:', err);
    }
  };

  if (loading) {
    return (
      <div className="pro-mode-settings">
        <div className="loading-screen">
          <div className="loading-spinner"></div>
          <p>Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pro-mode-settings" style={{ padding: '1rem' }}>
      <h4 style={{ marginBottom: '1rem', fontFamily: 'var(--font-header)' }}>
        Pro Mode Settings
      </h4>

      {/* Master Toggle */}
      <div
        className={`pro-mode-toggle ${isProModeEnabled ? 'active' : ''}`}
        onClick={handleToggleProMode}
      >
        <span className="pro-mode-icon">⚡</span>
        <div className="pro-mode-label">
          <div className="pro-mode-title">Pro Mode</div>
          <div className="pro-mode-subtitle">
            Enable advanced project management features
          </div>
        </div>
        <div className="pro-mode-switch" />
      </div>

      {/* Individual Features */}
      {isProModeEnabled && (
        <div className="pro-features-grid">
          {featureDefinitions.map((feature) => (
            <div
              key={feature.key}
              className={`pro-feature-item ${flags?.[feature.key] ? 'enabled' : ''}`}
              onClick={() => handleToggleFeature(feature.key)}
            >
              <div className="pro-feature-checkbox" />
              <span style={{ marginRight: '0.5rem' }}>{feature.icon}</span>
              <span className="pro-feature-label">{feature.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Productivity Method */}
      {isProModeEnabled && (
        <div style={{ marginTop: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            Preferred Productivity Method
          </label>
          <select
            className="input-field"
            value={flags?.preferredProductivityMethod || 'gtd'}
            onChange={(e) => handleToggleFeature('preferredProductivityMethod', e.target.value)}
            style={{ width: '100%' }}
          >
            <option value="gtd">GTD (Getting Things Done)</option>
            <option value="eisenhower">Eisenhower Matrix</option>
            <option value="eat_the_frog">Eat the Frog</option>
            <option value="time_blocking">Time Blocking</option>
          </select>
        </div>
      )}
    </div>
  );
}

export default ProModeSettings;
