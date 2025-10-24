/**
 * ChatElements - Structured UI components for chat messages
 *
 * Allows AI to present tasks, milestones, and metrics in a formatted way
 */

export function TaskSuggestion({ task, onAccept, onDismiss }) {
  return (
    <div style={{
      background: '#2D2D40',
      border: '2px solid #5D4B8C',
      borderRadius: '8px',
      padding: '1rem',
      marginTop: '0.75rem'
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
        <div style={{
          fontSize: '1.5rem',
          flexShrink: 0
        }}>
          ✅
        </div>
        <div style={{ flex: 1 }}>
          <div style={{
            color: '#9D8BCC',
            fontWeight: '600',
            marginBottom: '0.5rem',
            fontSize: '0.95rem'
          }}>
            Suggested Task
          </div>
          <div style={{ color: '#D9D9E3', marginBottom: '0.5rem' }}>
            {task.title}
          </div>
          {task.description && (
            <div style={{ color: '#888', fontSize: '0.9rem', marginBottom: '0.75rem' }}>
              {task.description}
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
            {task.context && (
              <span style={{
                backgroundColor: '#1A1A1A',
                color: '#9D8BCC',
                padding: '0.25rem 0.5rem',
                borderRadius: '8px'
              }}>
                {task.context}
              </span>
            )}
            {task.energyLevel && (
              <span style={{
                backgroundColor: '#1A1A1A',
                color: task.energyLevel === 'high' ? '#FF6B6B' :
                       task.energyLevel === 'medium' ? '#FFD93D' : '#6BCF7F',
                padding: '0.25rem 0.5rem',
                borderRadius: '8px'
              }}>
                {task.energyLevel} energy
              </span>
            )}
            {task.timeEstimate && (
              <span style={{ color: '#666' }}>
                ⏱️ {task.timeEstimate} min
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => onAccept(task)}
              style={{
                background: '#5D4B8C',
                color: '#fff',
                border: 'none',
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: '500'
              }}
            >
              Add to Tasks
            </button>
            <button
              onClick={() => onDismiss(task)}
              style={{
                background: 'transparent',
                color: '#888',
                border: '1px solid #444',
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.85rem'
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MilestoneSuggestion({ milestone, onAccept, onDismiss }) {
  return (
    <div style={{
      background: '#2D2D40',
      border: '2px solid #FFD93D',
      borderRadius: '8px',
      padding: '1rem',
      marginTop: '0.75rem'
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
        <div style={{
          fontSize: '1.5rem',
          flexShrink: 0
        }}>
          🎯
        </div>
        <div style={{ flex: 1 }}>
          <div style={{
            color: '#FFD93D',
            fontWeight: '600',
            marginBottom: '0.5rem',
            fontSize: '0.95rem'
          }}>
            Milestone
          </div>
          <div style={{ color: '#D9D9E3', marginBottom: '0.5rem', fontWeight: '500' }}>
            {milestone.title}
          </div>
          {milestone.description && (
            <div style={{ color: '#888', fontSize: '0.9rem', marginBottom: '0.75rem' }}>
              {milestone.description}
            </div>
          )}
          {milestone.dueDate && (
            <div style={{ color: '#aaa', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
              📅 Target: {new Date(milestone.dueDate).toLocaleDateString()}
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => onAccept(milestone)}
              style={{
                background: '#FFD93D',
                color: '#0D0D0D',
                border: 'none',
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: '600'
              }}
            >
              Set Milestone
            </button>
            <button
              onClick={() => onDismiss(milestone)}
              style={{
                background: 'transparent',
                color: '#888',
                border: '1px solid #444',
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.85rem'
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MetricCard({ metric }) {
  return (
    <div style={{
      background: '#1A1A1A',
      border: '1px solid #2D2D40',
      borderRadius: '8px',
      padding: '1rem',
      marginTop: '0.75rem'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div style={{
          fontSize: '2rem',
          flexShrink: 0
        }}>
          📊
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#888', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
            {metric.name}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
            <span style={{
              fontSize: '1.75rem',
              fontWeight: '700',
              color: '#5D4B8C'
            }}>
              {metric.value}
            </span>
            {metric.unit && (
              <span style={{ color: '#888', fontSize: '0.9rem' }}>
                {metric.unit}
              </span>
            )}
          </div>
          {metric.change && (
            <div style={{
              color: metric.change > 0 ? '#6BCF7F' : '#FF6B6B',
              fontSize: '0.85rem',
              marginTop: '0.25rem'
            }}>
              {metric.change > 0 ? '↑' : '↓'} {Math.abs(metric.change)}{metric.unit || ''}
              {metric.changeLabel && ` ${metric.changeLabel}`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ProgressCard({ title, current, target, unit }) {
  const percentage = Math.min(100, Math.round((current / target) * 100));

  return (
    <div style={{
      background: '#1A1A1A',
      border: '1px solid #2D2D40',
      borderRadius: '8px',
      padding: '1rem',
      marginTop: '0.75rem'
    }}>
      <div style={{
        color: '#888',
        fontSize: '0.85rem',
        marginBottom: '0.5rem'
      }}>
        {title}
      </div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        marginBottom: '0.5rem'
      }}>
        <span style={{ color: '#D9D9E3', fontSize: '1.1rem', fontWeight: '600' }}>
          {current} / {target} {unit}
        </span>
        <span style={{ color: '#9D8BCC', fontSize: '1.1rem', fontWeight: '600' }}>
          {percentage}%
        </span>
      </div>
      <div style={{
        background: '#0D0D0D',
        height: '8px',
        borderRadius: '4px',
        overflow: 'hidden'
      }}>
        <div style={{
          background: `linear-gradient(90deg, #5D4B8C, ${percentage >= 100 ? '#6BCF7F' : '#9D8BCC'})`,
          height: '100%',
          width: `${percentage}%`,
          transition: 'width 0.3s ease'
        }} />
      </div>
    </div>
  );
}

/**
 * Parse message content for special markers and extract structured elements
 *
 * Looks for patterns like:
 * [TASK: title | description | context:@home | energy:low | time:15]
 * [MILESTONE: title | description | date:2024-12-31]
 * [METRIC: name | value | unit | change]
 * [PROGRESS: title | current | target | unit]
 */
export function parseMessageElements(content) {
  const elements = [];
  let cleanedContent = content;

  // Parse task suggestions
  const taskRegex = /\[TASK:\s*([^\|]+)\s*\|\s*([^\|]*)\s*(?:\|\s*context:([^\|]*))?\s*(?:\|\s*energy:([^\|]*))?\s*(?:\|\s*time:(\d+))?\]/gi;
  let match;

  while ((match = taskRegex.exec(content)) !== null) {
    elements.push({
      type: 'task',
      task: {
        title: match[1].trim(),
        description: match[2].trim(),
        context: match[3]?.trim(),
        energyLevel: match[4]?.trim(),
        timeEstimate: match[5] ? parseInt(match[5]) : null
      }
    });
    cleanedContent = cleanedContent.replace(match[0], '');
  }

  // Parse milestones
  const milestoneRegex = /\[MILESTONE:\s*([^\|]+)\s*\|\s*([^\|]*)\s*(?:\|\s*date:([^\]]*))?\]/gi;

  while ((match = milestoneRegex.exec(content)) !== null) {
    elements.push({
      type: 'milestone',
      milestone: {
        title: match[1].trim(),
        description: match[2].trim(),
        dueDate: match[3]?.trim()
      }
    });
    cleanedContent = cleanedContent.replace(match[0], '');
  }

  // Parse metrics
  const metricRegex = /\[METRIC:\s*([^\|]+)\s*\|\s*([^\|]+)\s*(?:\|\s*([^\|]*))?\s*(?:\|\s*change:([^\]]*))?\]/gi;

  while ((match = metricRegex.exec(content)) !== null) {
    elements.push({
      type: 'metric',
      metric: {
        name: match[1].trim(),
        value: parseFloat(match[2].trim()),
        unit: match[3]?.trim(),
        change: match[4] ? parseFloat(match[4]) : null
      }
    });
    cleanedContent = cleanedContent.replace(match[0], '');
  }

  // Parse progress
  const progressRegex = /\[PROGRESS:\s*([^\|]+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*(?:\|\s*([^\]]*))?\]/gi;

  while ((match = progressRegex.exec(content)) !== null) {
    elements.push({
      type: 'progress',
      progress: {
        title: match[1].trim(),
        current: parseInt(match[2]),
        target: parseInt(match[3]),
        unit: match[4]?.trim() || ''
      }
    });
    cleanedContent = cleanedContent.replace(match[0], '');
  }

  return {
    cleanedContent: cleanedContent.trim(),
    elements
  };
}
