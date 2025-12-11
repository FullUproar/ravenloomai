/**
 * Work Breakdown Structure (WBS) - Hierarchical Project Decomposition
 * Shows a tree graph of project → sections → tasks with effort rollup
 *
 * Can be removed by deleting this file and removing imports from TeamDashboard
 */

import { gql, useQuery, useMutation } from '@apollo/client';
import { useState, useRef, useEffect } from 'react';

const GET_WBS_DATA = gql`
  query GetWBSData($projectId: ID!) {
    getWBSData(projectId: $projectId) {
      id
      name
      title
      description
      type
      status
      estimatedHours
      actualHours
      rollupEstimatedHours
      rollupActualHours
      completionPercent
      assignedTo
      parentId
      children {
        id
        title
        description
        type
        status
        estimatedHours
        actualHours
        rollupEstimatedHours
        rollupActualHours
        completionPercent
        assignedTo
        parentId
        children {
          id
          title
          description
          type
          status
          estimatedHours
          actualHours
          rollupEstimatedHours
          rollupActualHours
          completionPercent
          assignedTo
          parentId
          children {
            id
            title
            description
            type
            status
            estimatedHours
            actualHours
            rollupEstimatedHours
            rollupActualHours
            completionPercent
            assignedTo
            parentId
            children {
              id
              title
              type
              status
              estimatedHours
              rollupEstimatedHours
              completionPercent
            }
          }
        }
      }
    }
  }
`;

const CREATE_WBS_TASK = gql`
  mutation CreateWBSTask($projectId: ID!, $teamId: ID!, $input: WBSTaskInput!) {
    createWBSTask(projectId: $projectId, teamId: $teamId, input: $input) {
      id
      title
    }
  }
`;

function WBSNode({ node, level = 0, onAddChild, onSelect, selectedId, teamId, projectId }) {
  const [expanded, setExpanded] = useState(level < 2);
  const hasChildren = node.children && node.children.length > 0;
  const isProject = node.type === 'project';
  const isSelected = selectedId === node.id;

  const getStatusColor = (status, completionPercent) => {
    if (completionPercent === 100 || status === 'done') return 'var(--success)';
    if (completionPercent > 0 || status === 'in_progress') return 'var(--warning)';
    return 'var(--text-muted)';
  };

  return (
    <div className="wbs-node-container">
      <div
        className={`wbs-node ${isProject ? 'wbs-project' : ''} ${isSelected ? 'selected' : ''}`}
        onClick={() => onSelect(node)}
        style={{ '--level': level }}
      >
        <div className="wbs-node-header">
          {hasChildren && (
            <button
              className="wbs-expand-btn"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(!expanded);
              }}
            >
              {expanded ? '▼' : '▶'}
            </button>
          )}
          <span className="wbs-node-title">
            {isProject ? node.name : node.title}
          </span>
        </div>

        <div className="wbs-node-metrics">
          <div className="wbs-metric">
            <span className="wbs-metric-value">{node.rollupEstimatedHours || 0}h</span>
            <span className="wbs-metric-label">Est.</span>
          </div>
          {!isProject && (
            <div
              className="wbs-completion"
              style={{ '--completion-color': getStatusColor(node.status, node.completionPercent) }}
            >
              {node.completionPercent}%
            </div>
          )}
        </div>

        <button
          className="wbs-add-btn"
          onClick={(e) => {
            e.stopPropagation();
            onAddChild(node.id);
          }}
          title="Add child item"
        >
          +
        </button>
      </div>

      {expanded && hasChildren && (
        <div className="wbs-children">
          <div className="wbs-connector-line" />
          {node.children.map((child, index) => (
            <WBSNode
              key={child.id}
              node={child}
              level={level + 1}
              onAddChild={onAddChild}
              onSelect={onSelect}
              selectedId={selectedId}
              teamId={teamId}
              projectId={projectId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function WorkBreakdownStructure({ projectId, teamId, onClose, onTaskClick }) {
  const [selectedNode, setSelectedNode] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [parentIdForNew, setParentIdForNew] = useState(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskHours, setNewTaskHours] = useState('');
  const containerRef = useRef(null);

  const { data, loading, error, refetch } = useQuery(GET_WBS_DATA, {
    variables: { projectId },
    fetchPolicy: 'cache-and-network'
  });

  const [createTask, { loading: creating }] = useMutation(CREATE_WBS_TASK, {
    onCompleted: () => {
      setShowAddModal(false);
      setNewTaskTitle('');
      setNewTaskHours('');
      refetch();
    }
  });

  const wbsData = data?.getWBSData;

  const handleAddChild = (parentId) => {
    setParentIdForNew(parentId === wbsData?.id ? null : parentId);
    setShowAddModal(true);
  };

  const handleCreateTask = async (e) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    await createTask({
      variables: {
        projectId,
        teamId,
        input: {
          title: newTaskTitle,
          estimatedHours: newTaskHours ? parseFloat(newTaskHours) : null,
          parentTaskId: parentIdForNew
        }
      }
    });
  };

  const handleSelect = (node) => {
    setSelectedNode(node);
    if (node.type !== 'project' && onTaskClick) {
      onTaskClick(node.id);
    }
  };

  if (loading && !wbsData) {
    return (
      <div className="wbs-container">
        <header className="wbs-header">
          <button className="mobile-menu-btn" onClick={onClose} aria-label="Close">
            <span></span><span></span><span></span>
          </button>
          <h3>Work Breakdown Structure</h3>
        </header>
        <div className="wbs-content">
          <div className="loading-screen">
            <div className="loading-spinner"></div>
            <p>Loading WBS...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="wbs-container">
        <header className="wbs-header">
          <button className="mobile-menu-btn" onClick={onClose} aria-label="Close">
            <span></span><span></span><span></span>
          </button>
          <h3>Work Breakdown Structure</h3>
        </header>
        <div className="wbs-content">
          <div className="error-screen">
            <p>Error loading WBS: {error.message}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!wbsData) {
    return (
      <div className="wbs-container">
        <header className="wbs-header">
          <button className="mobile-menu-btn" onClick={onClose} aria-label="Close">
            <span></span><span></span><span></span>
          </button>
          <h3>Work Breakdown Structure</h3>
        </header>
        <div className="wbs-content">
          <div className="wbs-empty">
            <p>No project selected</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="wbs-container" ref={containerRef}>
      <header className="wbs-header">
        <button className="mobile-menu-btn" onClick={onClose} aria-label="Close">
          <span></span><span></span><span></span>
        </button>
        <h3>Work Breakdown Structure</h3>
        <div className="wbs-summary">
          <span className="wbs-summary-item">
            <strong>{wbsData.rollupEstimatedHours}h</strong> total effort
          </span>
        </div>
        <div className="header-spacer"></div>
      </header>

      <div className="wbs-content">
        <div className="wbs-tree">
          <WBSNode
            node={wbsData}
            onAddChild={handleAddChild}
            onSelect={handleSelect}
            selectedId={selectedNode?.id}
            teamId={teamId}
            projectId={projectId}
          />
        </div>

        {/* Legend */}
        <div className="wbs-legend">
          <div className="wbs-legend-item">
            <span className="wbs-legend-color" style={{ background: 'var(--success)' }}></span>
            Complete
          </div>
          <div className="wbs-legend-item">
            <span className="wbs-legend-color" style={{ background: 'var(--warning)' }}></span>
            In Progress
          </div>
          <div className="wbs-legend-item">
            <span className="wbs-legend-color" style={{ background: 'var(--text-muted)' }}></span>
            Not Started
          </div>
        </div>
      </div>

      {/* Add Task Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal wbs-add-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add WBS Item</h3>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>×</button>
            </div>
            <form onSubmit={handleCreateTask}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Title</label>
                  <input
                    type="text"
                    className="input-field"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    placeholder="Enter item title..."
                    autoFocus
                  />
                </div>
                <div className="form-group">
                  <label>Estimated Hours</label>
                  <input
                    type="number"
                    className="input-field"
                    value={newTaskHours}
                    onChange={(e) => setNewTaskHours(e.target.value)}
                    placeholder="0"
                    min="0"
                    step="0.5"
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={!newTaskTitle.trim() || creating}
                >
                  {creating ? 'Adding...' : 'Add Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default WorkBreakdownStructure;
