/**
 * WBS Draft Editor - Generic Ephemeral Tree Structure
 * Allows creating arbitrary tree structures that can be AI-materialized into projects/tasks
 *
 * Can be removed by deleting this file and removing imports from TeamDashboard
 */

import { gql, useQuery, useMutation } from '@apollo/client';
import { useState, useRef, useCallback } from 'react';

const GET_WBS_DRAFTS = gql`
  query GetWBSDrafts($teamId: ID!) {
    getWBSDrafts(teamId: $teamId) {
      id
      name
      description
      treeData
      materializedProjectId
      materializedAt
      createdAt
      updatedAt
    }
  }
`;

const CREATE_WBS_DRAFT = gql`
  mutation CreateWBSDraft($teamId: ID!, $input: WBSDraftInput!) {
    createWBSDraft(teamId: $teamId, input: $input) {
      id
      name
      treeData
    }
  }
`;

const UPDATE_WBS_DRAFT = gql`
  mutation UpdateWBSDraft($draftId: ID!, $input: WBSDraftInput!) {
    updateWBSDraft(draftId: $draftId, input: $input) {
      id
      name
      treeData
    }
  }
`;

const DELETE_WBS_DRAFT = gql`
  mutation DeleteWBSDraft($draftId: ID!) {
    deleteWBSDraft(draftId: $draftId)
  }
`;

const MATERIALIZE_WBS_DRAFT = gql`
  mutation MaterializeWBSDraft($draftId: ID!, $teamId: ID!, $projectName: String) {
    materializeWBSDraft(draftId: $draftId, teamId: $teamId, projectName: $projectName) {
      project {
        id
        name
      }
      tasksCreated
      totalEstimatedHours
      aiSummary
    }
  }
`;

// Generate unique IDs for tree nodes
let nodeIdCounter = 0;
function generateNodeId() {
  return `node_${Date.now()}_${++nodeIdCounter}`;
}

// Recursive tree node component
function TreeNode({ node, onUpdate, onDelete, onAddChild, depth = 0, selectedId, onSelect }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(node.label);
  const [editHours, setEditHours] = useState(node.estimatedHours || '');
  const [expanded, setExpanded] = useState(depth < 3);
  const inputRef = useRef(null);

  const hasChildren = node.children && node.children.length > 0;
  const isSelected = selectedId === node.id;

  const handleSave = () => {
    onUpdate(node.id, {
      ...node,
      label: editLabel,
      estimatedHours: editHours ? parseFloat(editHours) : null
    });
    setIsEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setEditLabel(node.label);
      setEditHours(node.estimatedHours || '');
      setIsEditing(false);
    }
  };

  // Calculate rollup hours from children
  const rollupHours = hasChildren
    ? node.children.reduce((sum, child) => {
        const childHours = child.children?.length > 0
          ? child.children.reduce((s, c) => s + (c.estimatedHours || 0), 0)
          : (child.estimatedHours || 0);
        return sum + childHours + (child.estimatedHours || 0);
      }, 0)
    : (node.estimatedHours || 0);

  return (
    <div className="wbs-draft-node-container" style={{ '--depth': depth }}>
      <div
        className={`wbs-draft-node ${isSelected ? 'selected' : ''}`}
        onClick={() => onSelect(node.id)}
      >
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
        {!hasChildren && <span className="wbs-node-spacer" />}

        {isEditing ? (
          <div className="wbs-node-edit" onClick={(e) => e.stopPropagation()}>
            <input
              ref={inputRef}
              type="text"
              className="input-field wbs-edit-input"
              value={editLabel}
              onChange={(e) => setEditLabel(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
              placeholder="Node label..."
            />
            <input
              type="number"
              className="input-field wbs-hours-input"
              value={editHours}
              onChange={(e) => setEditHours(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Hours"
              min="0"
              step="0.5"
            />
            <button className="wbs-save-btn" onClick={handleSave}>✓</button>
            <button className="wbs-cancel-btn" onClick={() => setIsEditing(false)}>✕</button>
          </div>
        ) : (
          <>
            <span
              className="wbs-node-label"
              onDoubleClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
              }}
            >
              {node.label || 'Untitled'}
            </span>
            {(rollupHours > 0 || node.estimatedHours) && (
              <span className="wbs-node-hours">
                {hasChildren && rollupHours > 0 ? `${rollupHours}h total` : `${node.estimatedHours}h`}
              </span>
            )}
          </>
        )}

        <div className="wbs-node-actions">
          <button
            className="wbs-action-btn"
            onClick={(e) => {
              e.stopPropagation();
              onAddChild(node.id);
            }}
            title="Add child"
          >
            +
          </button>
          <button
            className="wbs-action-btn edit"
            onClick={(e) => {
              e.stopPropagation();
              setIsEditing(true);
            }}
            title="Edit"
          >
            ✎
          </button>
          <button
            className="wbs-action-btn delete"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(node.id);
            }}
            title="Delete"
          >
            ×
          </button>
        </div>
      </div>

      {expanded && hasChildren && (
        <div className="wbs-draft-children">
          <div className="wbs-connector-line" />
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onAddChild={onAddChild}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function WBSDraftEditor({ teamId, onClose, onMaterialized }) {
  const [selectedDraftId, setSelectedDraftId] = useState(null);
  const [treeData, setTreeData] = useState({ nodes: [] });
  const [draftName, setDraftName] = useState('New WBS');
  const [draftDescription, setDraftDescription] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [showMaterializeModal, setShowMaterializeModal] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [materializing, setMaterializing] = useState(false);

  const { data, loading, refetch } = useQuery(GET_WBS_DRAFTS, {
    variables: { teamId },
    fetchPolicy: 'cache-and-network'
  });

  const [createDraft] = useMutation(CREATE_WBS_DRAFT);
  const [updateDraft] = useMutation(UPDATE_WBS_DRAFT);
  const [deleteDraft] = useMutation(DELETE_WBS_DRAFT);
  const [materialize] = useMutation(MATERIALIZE_WBS_DRAFT);

  const drafts = data?.getWBSDrafts || [];

  // Load a draft into the editor
  const loadDraft = (draft) => {
    setSelectedDraftId(draft.id);
    setDraftName(draft.name);
    setDraftDescription(draft.description || '');
    setTreeData(draft.treeData || { nodes: [] });
    setSelectedNodeId(null);
  };

  // Create a new draft
  const handleNewDraft = () => {
    setSelectedDraftId(null);
    setDraftName('New WBS');
    setDraftDescription('');
    setTreeData({ nodes: [] });
    setSelectedNodeId(null);
  };

  // Save current draft
  const handleSave = async () => {
    try {
      if (selectedDraftId) {
        await updateDraft({
          variables: {
            draftId: selectedDraftId,
            input: {
              name: draftName,
              description: draftDescription,
              treeData
            }
          }
        });
      } else {
        const result = await createDraft({
          variables: {
            teamId,
            input: {
              name: draftName,
              description: draftDescription,
              treeData
            }
          }
        });
        setSelectedDraftId(result.data.createWBSDraft.id);
      }
      refetch();
    } catch (err) {
      console.error('Error saving draft:', err);
    }
  };

  // Delete current draft
  const handleDelete = async () => {
    if (!selectedDraftId) return;
    if (!window.confirm('Delete this WBS draft?')) return;

    try {
      await deleteDraft({ variables: { draftId: selectedDraftId } });
      handleNewDraft();
      refetch();
    } catch (err) {
      console.error('Error deleting draft:', err);
    }
  };

  // Add root node
  const handleAddRoot = () => {
    const newNode = {
      id: generateNodeId(),
      label: 'New Item',
      estimatedHours: null,
      children: []
    };
    setTreeData({ nodes: [...treeData.nodes, newNode] });
  };

  // Add child to a node
  const handleAddChild = useCallback((parentId) => {
    const newNode = {
      id: generateNodeId(),
      label: 'New Item',
      estimatedHours: null,
      children: []
    };

    const addChildRecursive = (nodes) => {
      return nodes.map(node => {
        if (node.id === parentId) {
          return {
            ...node,
            children: [...(node.children || []), newNode]
          };
        }
        if (node.children?.length > 0) {
          return {
            ...node,
            children: addChildRecursive(node.children)
          };
        }
        return node;
      });
    };

    setTreeData({ nodes: addChildRecursive(treeData.nodes) });
  }, [treeData]);

  // Update a node
  const handleUpdateNode = useCallback((nodeId, updatedNode) => {
    const updateRecursive = (nodes) => {
      return nodes.map(node => {
        if (node.id === nodeId) {
          return { ...node, ...updatedNode };
        }
        if (node.children?.length > 0) {
          return {
            ...node,
            children: updateRecursive(node.children)
          };
        }
        return node;
      });
    };

    setTreeData({ nodes: updateRecursive(treeData.nodes) });
  }, [treeData]);

  // Delete a node
  const handleDeleteNode = useCallback((nodeId) => {
    const deleteRecursive = (nodes) => {
      return nodes
        .filter(node => node.id !== nodeId)
        .map(node => {
          if (node.children?.length > 0) {
            return {
              ...node,
              children: deleteRecursive(node.children)
            };
          }
          return node;
        });
    };

    setTreeData({ nodes: deleteRecursive(treeData.nodes) });
    if (selectedNodeId === nodeId) {
      setSelectedNodeId(null);
    }
  }, [treeData, selectedNodeId]);

  // Materialize draft into project
  const handleMaterialize = async () => {
    if (!selectedDraftId) {
      // Save first if not saved
      await handleSave();
    }

    setMaterializing(true);
    try {
      const result = await materialize({
        variables: {
          draftId: selectedDraftId,
          teamId,
          projectName: projectName || draftName
        }
      });

      const { project, tasksCreated, totalEstimatedHours, aiSummary } = result.data.materializeWBSDraft;

      setShowMaterializeModal(false);
      refetch();

      // Notify parent of successful materialization
      if (onMaterialized) {
        onMaterialized({
          project,
          tasksCreated,
          totalEstimatedHours,
          aiSummary
        });
      }
    } catch (err) {
      console.error('Error materializing draft:', err);
      alert('Failed to materialize WBS: ' + err.message);
    } finally {
      setMaterializing(false);
    }
  };

  // Calculate total hours
  const calculateTotalHours = (nodes) => {
    return nodes.reduce((sum, node) => {
      const childHours = node.children?.length > 0
        ? calculateTotalHours(node.children)
        : 0;
      return sum + (node.estimatedHours || 0) + childHours;
    }, 0);
  };

  const totalHours = calculateTotalHours(treeData.nodes);
  const nodeCount = (() => {
    const count = (nodes) => nodes.reduce((sum, n) => sum + 1 + (n.children ? count(n.children) : 0), 0);
    return count(treeData.nodes);
  })();

  return (
    <div className="wbs-draft-editor">
      <header className="wbs-header">
        <button className="mobile-menu-btn" onClick={onClose} aria-label="Close">
          <span></span><span></span><span></span>
        </button>
        <h3>WBS Draft Editor</h3>
        <div className="wbs-summary">
          <span className="wbs-summary-item">
            <strong>{nodeCount}</strong> items
          </span>
          {totalHours > 0 && (
            <span className="wbs-summary-item">
              <strong>{totalHours}h</strong> total
            </span>
          )}
        </div>
        <div className="header-spacer"></div>
      </header>

      <div className="wbs-draft-layout">
        {/* Sidebar - Draft List */}
        <aside className="wbs-draft-sidebar">
          <div className="wbs-draft-sidebar-header">
            <h4>Drafts</h4>
            <button className="btn-sm" onClick={handleNewDraft}>+ New</button>
          </div>
          <div className="wbs-draft-list">
            {loading && <p className="wbs-loading">Loading...</p>}
            {drafts.map(draft => (
              <div
                key={draft.id}
                className={`wbs-draft-item ${selectedDraftId === draft.id ? 'selected' : ''} ${draft.materializedProjectId ? 'materialized' : ''}`}
                onClick={() => loadDraft(draft)}
              >
                <span className="wbs-draft-name">{draft.name}</span>
                {draft.materializedProjectId && (
                  <span className="wbs-materialized-badge" title="Already materialized">✓</span>
                )}
              </div>
            ))}
            {!loading && drafts.length === 0 && (
              <p className="wbs-empty">No drafts yet</p>
            )}
          </div>
        </aside>

        {/* Main Editor Area */}
        <div className="wbs-draft-main">
          {/* Draft Header */}
          <div className="wbs-draft-header-row">
            <input
              type="text"
              className="input-field wbs-draft-name-input"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="WBS Name..."
            />
            <div className="wbs-draft-actions">
              <button
                className="btn-secondary"
                onClick={handleSave}
                disabled={treeData.nodes.length === 0}
              >
                Save
              </button>
              {selectedDraftId && (
                <button className="btn-danger" onClick={handleDelete}>
                  Delete
                </button>
              )}
              <button
                className="btn-primary"
                onClick={() => {
                  setProjectName(draftName);
                  setShowMaterializeModal(true);
                }}
                disabled={treeData.nodes.length === 0}
              >
                🤖 Materialize
              </button>
            </div>
          </div>

          {/* Tree Editor */}
          <div className="wbs-draft-tree">
            {treeData.nodes.length === 0 ? (
              <div className="wbs-empty-state">
                <p>Start building your Work Breakdown Structure</p>
                <button className="btn-primary" onClick={handleAddRoot}>
                  + Add First Item
                </button>
              </div>
            ) : (
              <>
                {treeData.nodes.map(node => (
                  <TreeNode
                    key={node.id}
                    node={node}
                    onUpdate={handleUpdateNode}
                    onDelete={handleDeleteNode}
                    onAddChild={handleAddChild}
                    selectedId={selectedNodeId}
                    onSelect={setSelectedNodeId}
                  />
                ))}
                <button
                  className="wbs-add-root-btn"
                  onClick={handleAddRoot}
                >
                  + Add Item
                </button>
              </>
            )}
          </div>

          {/* Instructions */}
          <div className="wbs-draft-help">
            <p>💡 Double-click to edit • Click + to add children • AI will structure this into tasks</p>
          </div>
        </div>
      </div>

      {/* Materialize Modal */}
      {showMaterializeModal && (
        <div className="modal-overlay" onClick={() => setShowMaterializeModal(false)}>
          <div className="modal wbs-materialize-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🤖 Materialize WBS</h3>
              <button className="modal-close" onClick={() => setShowMaterializeModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <p>AI will analyze your WBS and create a structured project with tasks.</p>

              <div className="form-group">
                <label>Project Name</label>
                <input
                  type="text"
                  className="input-field"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="Enter project name..."
                />
              </div>

              <div className="wbs-materialize-preview">
                <h4>Preview</h4>
                <ul>
                  <li><strong>{nodeCount}</strong> items will become tasks</li>
                  {totalHours > 0 && <li><strong>{totalHours}h</strong> total estimated effort</li>}
                  <li>AI will add descriptions and refine estimates</li>
                </ul>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn-secondary"
                onClick={() => setShowMaterializeModal(false)}
                disabled={materializing}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleMaterialize}
                disabled={materializing}
              >
                {materializing ? 'Creating Project...' : '🤖 Create Project'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default WBSDraftEditor;
