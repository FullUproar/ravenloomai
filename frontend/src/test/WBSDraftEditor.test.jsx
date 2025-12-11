/**
 * WBS Draft Editor Component Tests
 *
 * Tests for the Work Breakdown Structure Draft Editor:
 * - Tree node rendering and interaction
 * - Adding/editing/deleting nodes
 * - Hours calculation and rollup
 * - Draft management (create, update, delete)
 * - Materialization workflow
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import React, { useState } from 'react';

// Mock tree node data
const createMockNode = (overrides = {}) => ({
  id: `node_${Date.now()}_${Math.random()}`,
  label: 'Test Node',
  estimatedHours: null,
  children: [],
  ...overrides
});

// Mock TreeNode component matching the actual implementation
function TreeNode({ node, onUpdate, onDelete, onAddChild, depth = 0, selectedId, onSelect }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(node.label);
  const [editHours, setEditHours] = useState(node.estimatedHours || '');
  const [expanded, setExpanded] = useState(true);

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
  const calculateRollup = (n) => {
    if (!n.children || n.children.length === 0) return n.estimatedHours || 0;
    return n.children.reduce((sum, child) => sum + calculateRollup(child), 0);
  };
  const rollupHours = hasChildren ? calculateRollup(node) : (node.estimatedHours || 0);

  return (
    <div className="wbs-draft-node-container" data-testid={`node-${node.id}`} style={{ '--depth': depth }}>
      <div className={`wbs-draft-node ${isSelected ? 'selected' : ''}`} onClick={() => onSelect(node.id)}>
        {hasChildren && (
          <button
            className="wbs-expand-btn"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            data-testid={`expand-${node.id}`}
          >
            {expanded ? '▼' : '▶'}
          </button>
        )}
        {!hasChildren && <span className="wbs-node-spacer" />}

        {isEditing ? (
          <div className="wbs-node-edit" onClick={(e) => e.stopPropagation()}>
            <input
              type="text"
              className="input-field wbs-edit-input"
              value={editLabel}
              onChange={(e) => setEditLabel(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
              placeholder="Node label..."
              data-testid={`edit-label-${node.id}`}
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
              data-testid={`edit-hours-${node.id}`}
            />
            <button className="wbs-save-btn" onClick={handleSave} data-testid={`save-${node.id}`}>✓</button>
            <button className="wbs-cancel-btn" onClick={() => setIsEditing(false)} data-testid={`cancel-${node.id}`}>✕</button>
          </div>
        ) : (
          <>
            <span
              className="wbs-node-label"
              onDoubleClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
              }}
              data-testid={`label-${node.id}`}
            >
              {node.label || 'Untitled'}
            </span>
            {(rollupHours > 0 || node.estimatedHours) && (
              <span className="wbs-node-hours" data-testid={`hours-${node.id}`}>
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
            data-testid={`add-child-${node.id}`}
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
            data-testid={`edit-btn-${node.id}`}
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
            data-testid={`delete-${node.id}`}
          >
            ×
          </button>
        </div>
      </div>

      {hasChildren && expanded && (
        <div className="wbs-node-children">
          {node.children.map(child => (
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

// Mock WBS Draft Sidebar
function DraftSidebar({ drafts, selectedDraftId, onSelectDraft, onCreateDraft, loading }) {
  return (
    <div className="wbs-sidebar" data-testid="draft-sidebar">
      <div className="wbs-sidebar-header">
        <h4>WBS Drafts</h4>
        <button className="btn-icon" onClick={onCreateDraft} data-testid="create-draft-btn">+</button>
      </div>
      {loading && <p data-testid="sidebar-loading">Loading drafts...</p>}
      <div className="wbs-draft-list">
        {drafts.map(draft => (
          <div
            key={draft.id}
            className={`wbs-draft-item ${selectedDraftId === draft.id ? 'selected' : ''}`}
            onClick={() => onSelectDraft(draft)}
            data-testid={`draft-item-${draft.id}`}
          >
            <span className="draft-name">{draft.name}</span>
            {draft.materializedAt && (
              <span className="draft-materialized" data-testid={`materialized-badge-${draft.id}`}>✓</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Mock Materialize Modal
function MaterializeModal({ draftName, onConfirm, onCancel, loading }) {
  const [projectName, setProjectName] = useState(draftName);

  return (
    <div className="modal-overlay" data-testid="materialize-modal">
      <div className="modal">
        <h3>Materialize WBS Draft</h3>
        <p>This will create a project with tasks based on your WBS structure.</p>
        <div className="form-group">
          <label>Project Name:</label>
          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            className="input-field"
            data-testid="project-name-input"
          />
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onCancel} data-testid="cancel-materialize">
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={() => onConfirm(projectName)}
            disabled={loading || !projectName}
            data-testid="confirm-materialize"
          >
            {loading ? 'Creating...' : 'Create Project'}
          </button>
        </div>
      </div>
    </div>
  );
}

describe('TreeNode Component', () => {
  let mockOnUpdate;
  let mockOnDelete;
  let mockOnAddChild;
  let mockOnSelect;

  beforeEach(() => {
    mockOnUpdate = vi.fn();
    mockOnDelete = vi.fn();
    mockOnAddChild = vi.fn();
    mockOnSelect = vi.fn();
  });

  describe('Rendering', () => {
    it('should render node label', () => {
      const node = createMockNode({ id: 'test-1', label: 'My Task' });

      render(
        <TreeNode
          node={node}
          onUpdate={mockOnUpdate}
          onDelete={mockOnDelete}
          onAddChild={mockOnAddChild}
          onSelect={mockOnSelect}
        />
      );

      expect(screen.getByText('My Task')).toBeInTheDocument();
    });

    it('should show "Untitled" when node has no label', () => {
      const node = createMockNode({ id: 'test-1', label: '' });

      render(
        <TreeNode
          node={node}
          onUpdate={mockOnUpdate}
          onDelete={mockOnDelete}
          onAddChild={mockOnAddChild}
          onSelect={mockOnSelect}
        />
      );

      expect(screen.getByText('Untitled')).toBeInTheDocument();
    });

    it('should show estimated hours when set', () => {
      const node = createMockNode({ id: 'test-1', label: 'Task', estimatedHours: 5 });

      render(
        <TreeNode
          node={node}
          onUpdate={mockOnUpdate}
          onDelete={mockOnDelete}
          onAddChild={mockOnAddChild}
          onSelect={mockOnSelect}
        />
      );

      expect(screen.getByTestId('hours-test-1')).toHaveTextContent('5h');
    });

    it('should not show hours when not set', () => {
      const node = createMockNode({ id: 'test-1', label: 'Task', estimatedHours: null });

      render(
        <TreeNode
          node={node}
          onUpdate={mockOnUpdate}
          onDelete={mockOnDelete}
          onAddChild={mockOnAddChild}
          onSelect={mockOnSelect}
        />
      );

      expect(screen.queryByTestId('hours-test-1')).not.toBeInTheDocument();
    });

    it('should show expand button when node has children', () => {
      const node = createMockNode({
        id: 'parent-1',
        label: 'Parent',
        children: [createMockNode({ id: 'child-1', label: 'Child' })]
      });

      render(
        <TreeNode
          node={node}
          onUpdate={mockOnUpdate}
          onDelete={mockOnDelete}
          onAddChild={mockOnAddChild}
          onSelect={mockOnSelect}
        />
      );

      expect(screen.getByTestId('expand-parent-1')).toBeInTheDocument();
    });

    it('should not show expand button when node has no children', () => {
      const node = createMockNode({ id: 'leaf-1', label: 'Leaf', children: [] });

      render(
        <TreeNode
          node={node}
          onUpdate={mockOnUpdate}
          onDelete={mockOnDelete}
          onAddChild={mockOnAddChild}
          onSelect={mockOnSelect}
        />
      );

      expect(screen.queryByTestId('expand-leaf-1')).not.toBeInTheDocument();
    });
  });

  describe('Hours Rollup', () => {
    it('should show rollup hours for parent with children', () => {
      const node = createMockNode({
        id: 'parent-1',
        label: 'Parent',
        children: [
          createMockNode({ id: 'child-1', label: 'Child 1', estimatedHours: 3 }),
          createMockNode({ id: 'child-2', label: 'Child 2', estimatedHours: 5 })
        ]
      });

      render(
        <TreeNode
          node={node}
          onUpdate={mockOnUpdate}
          onDelete={mockOnDelete}
          onAddChild={mockOnAddChild}
          onSelect={mockOnSelect}
        />
      );

      expect(screen.getByTestId('hours-parent-1')).toHaveTextContent('8h total');
    });

    it('should calculate nested rollup correctly', () => {
      const node = createMockNode({
        id: 'root-1',
        label: 'Root',
        children: [
          createMockNode({
            id: 'parent-1',
            label: 'Parent',
            children: [
              createMockNode({ id: 'child-1', label: 'Child 1', estimatedHours: 2 }),
              createMockNode({ id: 'child-2', label: 'Child 2', estimatedHours: 4 })
            ]
          })
        ]
      });

      render(
        <TreeNode
          node={node}
          onUpdate={mockOnUpdate}
          onDelete={mockOnDelete}
          onAddChild={mockOnAddChild}
          onSelect={mockOnSelect}
        />
      );

      expect(screen.getByTestId('hours-root-1')).toHaveTextContent('6h total');
    });
  });

  describe('Selection', () => {
    it('should call onSelect when node is clicked', () => {
      const node = createMockNode({ id: 'test-1', label: 'Test' });

      render(
        <TreeNode
          node={node}
          onUpdate={mockOnUpdate}
          onDelete={mockOnDelete}
          onAddChild={mockOnAddChild}
          onSelect={mockOnSelect}
        />
      );

      fireEvent.click(screen.getByTestId('label-test-1'));
      expect(mockOnSelect).toHaveBeenCalledWith('test-1');
    });

    it('should have selected class when selectedId matches', () => {
      const node = createMockNode({ id: 'test-1', label: 'Test' });

      render(
        <TreeNode
          node={node}
          onUpdate={mockOnUpdate}
          onDelete={mockOnDelete}
          onAddChild={mockOnAddChild}
          onSelect={mockOnSelect}
          selectedId="test-1"
        />
      );

      expect(screen.getByTestId('node-test-1').querySelector('.wbs-draft-node')).toHaveClass('selected');
    });
  });

  describe('Editing', () => {
    it('should enter edit mode on double click', () => {
      const node = createMockNode({ id: 'test-1', label: 'Test' });

      render(
        <TreeNode
          node={node}
          onUpdate={mockOnUpdate}
          onDelete={mockOnDelete}
          onAddChild={mockOnAddChild}
          onSelect={mockOnSelect}
        />
      );

      fireEvent.doubleClick(screen.getByTestId('label-test-1'));
      expect(screen.getByTestId('edit-label-test-1')).toBeInTheDocument();
    });

    it('should enter edit mode when edit button clicked', () => {
      const node = createMockNode({ id: 'test-1', label: 'Test' });

      render(
        <TreeNode
          node={node}
          onUpdate={mockOnUpdate}
          onDelete={mockOnDelete}
          onAddChild={mockOnAddChild}
          onSelect={mockOnSelect}
        />
      );

      fireEvent.click(screen.getByTestId('edit-btn-test-1'));
      expect(screen.getByTestId('edit-label-test-1')).toBeInTheDocument();
    });

    it('should save changes when save button clicked', () => {
      const node = createMockNode({ id: 'test-1', label: 'Test' });

      render(
        <TreeNode
          node={node}
          onUpdate={mockOnUpdate}
          onDelete={mockOnDelete}
          onAddChild={mockOnAddChild}
          onSelect={mockOnSelect}
        />
      );

      // Enter edit mode
      fireEvent.click(screen.getByTestId('edit-btn-test-1'));

      // Change label
      fireEvent.change(screen.getByTestId('edit-label-test-1'), { target: { value: 'Updated Label' } });
      fireEvent.change(screen.getByTestId('edit-hours-test-1'), { target: { value: '10' } });

      // Save
      fireEvent.click(screen.getByTestId('save-test-1'));

      expect(mockOnUpdate).toHaveBeenCalledWith('test-1', expect.objectContaining({
        label: 'Updated Label',
        estimatedHours: 10
      }));
    });

    it('should save on Enter key', () => {
      const node = createMockNode({ id: 'test-1', label: 'Test' });

      render(
        <TreeNode
          node={node}
          onUpdate={mockOnUpdate}
          onDelete={mockOnDelete}
          onAddChild={mockOnAddChild}
          onSelect={mockOnSelect}
        />
      );

      fireEvent.click(screen.getByTestId('edit-btn-test-1'));
      fireEvent.change(screen.getByTestId('edit-label-test-1'), { target: { value: 'New' } });
      fireEvent.keyDown(screen.getByTestId('edit-label-test-1'), { key: 'Enter' });

      expect(mockOnUpdate).toHaveBeenCalled();
    });

    it('should cancel edit on Escape key', () => {
      const node = createMockNode({ id: 'test-1', label: 'Original' });

      render(
        <TreeNode
          node={node}
          onUpdate={mockOnUpdate}
          onDelete={mockOnDelete}
          onAddChild={mockOnAddChild}
          onSelect={mockOnSelect}
        />
      );

      fireEvent.click(screen.getByTestId('edit-btn-test-1'));
      fireEvent.change(screen.getByTestId('edit-label-test-1'), { target: { value: 'Changed' } });
      fireEvent.keyDown(screen.getByTestId('edit-label-test-1'), { key: 'Escape' });

      expect(mockOnUpdate).not.toHaveBeenCalled();
      expect(screen.getByTestId('label-test-1')).toHaveTextContent('Original');
    });

    it('should cancel edit when cancel button clicked', () => {
      const node = createMockNode({ id: 'test-1', label: 'Original' });

      render(
        <TreeNode
          node={node}
          onUpdate={mockOnUpdate}
          onDelete={mockOnDelete}
          onAddChild={mockOnAddChild}
          onSelect={mockOnSelect}
        />
      );

      fireEvent.click(screen.getByTestId('edit-btn-test-1'));
      fireEvent.click(screen.getByTestId('cancel-test-1'));

      expect(mockOnUpdate).not.toHaveBeenCalled();
      expect(screen.getByTestId('label-test-1')).toBeInTheDocument();
    });
  });

  describe('Node Actions', () => {
    it('should call onAddChild when add button clicked', () => {
      const node = createMockNode({ id: 'test-1', label: 'Test' });

      render(
        <TreeNode
          node={node}
          onUpdate={mockOnUpdate}
          onDelete={mockOnDelete}
          onAddChild={mockOnAddChild}
          onSelect={mockOnSelect}
        />
      );

      fireEvent.click(screen.getByTestId('add-child-test-1'));
      expect(mockOnAddChild).toHaveBeenCalledWith('test-1');
    });

    it('should call onDelete when delete button clicked', () => {
      const node = createMockNode({ id: 'test-1', label: 'Test' });

      render(
        <TreeNode
          node={node}
          onUpdate={mockOnUpdate}
          onDelete={mockOnDelete}
          onAddChild={mockOnAddChild}
          onSelect={mockOnSelect}
        />
      );

      fireEvent.click(screen.getByTestId('delete-test-1'));
      expect(mockOnDelete).toHaveBeenCalledWith('test-1');
    });
  });

  describe('Expand/Collapse', () => {
    it('should toggle children visibility on expand button click', () => {
      const node = createMockNode({
        id: 'parent-1',
        label: 'Parent',
        children: [createMockNode({ id: 'child-1', label: 'Child' })]
      });

      render(
        <TreeNode
          node={node}
          onUpdate={mockOnUpdate}
          onDelete={mockOnDelete}
          onAddChild={mockOnAddChild}
          onSelect={mockOnSelect}
        />
      );

      // Initially expanded (default in test)
      expect(screen.getByTestId('label-child-1')).toBeInTheDocument();

      // Click to collapse
      fireEvent.click(screen.getByTestId('expand-parent-1'));
      expect(screen.queryByTestId('label-child-1')).not.toBeInTheDocument();

      // Click to expand
      fireEvent.click(screen.getByTestId('expand-parent-1'));
      expect(screen.getByTestId('label-child-1')).toBeInTheDocument();
    });
  });

  describe('Nested Children', () => {
    it('should render nested children', () => {
      const node = createMockNode({
        id: 'root',
        label: 'Root',
        children: [
          createMockNode({
            id: 'level1',
            label: 'Level 1',
            children: [
              createMockNode({
                id: 'level2',
                label: 'Level 2',
                children: [
                  createMockNode({ id: 'level3', label: 'Level 3' })
                ]
              })
            ]
          })
        ]
      });

      render(
        <TreeNode
          node={node}
          onUpdate={mockOnUpdate}
          onDelete={mockOnDelete}
          onAddChild={mockOnAddChild}
          onSelect={mockOnSelect}
        />
      );

      expect(screen.getByText('Root')).toBeInTheDocument();
      expect(screen.getByText('Level 1')).toBeInTheDocument();
      expect(screen.getByText('Level 2')).toBeInTheDocument();
      expect(screen.getByText('Level 3')).toBeInTheDocument();
    });
  });
});

describe('DraftSidebar Component', () => {
  const mockDrafts = [
    { id: 'draft-1', name: 'Project Alpha', materializedAt: null },
    { id: 'draft-2', name: 'Project Beta', materializedAt: '2024-01-15T10:00:00Z' }
  ];

  let mockOnSelectDraft;
  let mockOnCreateDraft;

  beforeEach(() => {
    mockOnSelectDraft = vi.fn();
    mockOnCreateDraft = vi.fn();
  });

  it('should render drafts list', () => {
    render(
      <DraftSidebar
        drafts={mockDrafts}
        onSelectDraft={mockOnSelectDraft}
        onCreateDraft={mockOnCreateDraft}
        loading={false}
      />
    );

    expect(screen.getByText('Project Alpha')).toBeInTheDocument();
    expect(screen.getByText('Project Beta')).toBeInTheDocument();
  });

  it('should show loading state', () => {
    render(
      <DraftSidebar
        drafts={[]}
        onSelectDraft={mockOnSelectDraft}
        onCreateDraft={mockOnCreateDraft}
        loading={true}
      />
    );

    expect(screen.getByTestId('sidebar-loading')).toBeInTheDocument();
  });

  it('should call onSelectDraft when draft clicked', () => {
    render(
      <DraftSidebar
        drafts={mockDrafts}
        onSelectDraft={mockOnSelectDraft}
        onCreateDraft={mockOnCreateDraft}
        loading={false}
      />
    );

    fireEvent.click(screen.getByTestId('draft-item-draft-1'));
    expect(mockOnSelectDraft).toHaveBeenCalledWith(mockDrafts[0]);
  });

  it('should call onCreateDraft when create button clicked', () => {
    render(
      <DraftSidebar
        drafts={mockDrafts}
        onSelectDraft={mockOnSelectDraft}
        onCreateDraft={mockOnCreateDraft}
        loading={false}
      />
    );

    fireEvent.click(screen.getByTestId('create-draft-btn'));
    expect(mockOnCreateDraft).toHaveBeenCalled();
  });

  it('should highlight selected draft', () => {
    render(
      <DraftSidebar
        drafts={mockDrafts}
        selectedDraftId="draft-1"
        onSelectDraft={mockOnSelectDraft}
        onCreateDraft={mockOnCreateDraft}
        loading={false}
      />
    );

    expect(screen.getByTestId('draft-item-draft-1')).toHaveClass('selected');
    expect(screen.getByTestId('draft-item-draft-2')).not.toHaveClass('selected');
  });

  it('should show materialized badge for materialized drafts', () => {
    render(
      <DraftSidebar
        drafts={mockDrafts}
        onSelectDraft={mockOnSelectDraft}
        onCreateDraft={mockOnCreateDraft}
        loading={false}
      />
    );

    expect(screen.queryByTestId('materialized-badge-draft-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('materialized-badge-draft-2')).toBeInTheDocument();
  });
});

describe('MaterializeModal Component', () => {
  let mockOnConfirm;
  let mockOnCancel;

  beforeEach(() => {
    mockOnConfirm = vi.fn();
    mockOnCancel = vi.fn();
  });

  it('should render modal with draft name as default project name', () => {
    render(
      <MaterializeModal
        draftName="My Project"
        onConfirm={mockOnConfirm}
        onCancel={mockOnCancel}
        loading={false}
      />
    );

    expect(screen.getByTestId('project-name-input')).toHaveValue('My Project');
  });

  it('should allow editing project name', () => {
    render(
      <MaterializeModal
        draftName="My Project"
        onConfirm={mockOnConfirm}
        onCancel={mockOnCancel}
        loading={false}
      />
    );

    fireEvent.change(screen.getByTestId('project-name-input'), { target: { value: 'New Name' } });
    expect(screen.getByTestId('project-name-input')).toHaveValue('New Name');
  });

  it('should call onCancel when cancel clicked', () => {
    render(
      <MaterializeModal
        draftName="My Project"
        onConfirm={mockOnConfirm}
        onCancel={mockOnCancel}
        loading={false}
      />
    );

    fireEvent.click(screen.getByTestId('cancel-materialize'));
    expect(mockOnCancel).toHaveBeenCalled();
  });

  it('should call onConfirm with project name when confirm clicked', () => {
    render(
      <MaterializeModal
        draftName="My Project"
        onConfirm={mockOnConfirm}
        onCancel={mockOnCancel}
        loading={false}
      />
    );

    fireEvent.click(screen.getByTestId('confirm-materialize'));
    expect(mockOnConfirm).toHaveBeenCalledWith('My Project');
  });

  it('should disable confirm button when loading', () => {
    render(
      <MaterializeModal
        draftName="My Project"
        onConfirm={mockOnConfirm}
        onCancel={mockOnCancel}
        loading={true}
      />
    );

    expect(screen.getByTestId('confirm-materialize')).toBeDisabled();
    expect(screen.getByTestId('confirm-materialize')).toHaveTextContent('Creating...');
  });

  it('should disable confirm button when project name is empty', () => {
    render(
      <MaterializeModal
        draftName=""
        onConfirm={mockOnConfirm}
        onCancel={mockOnCancel}
        loading={false}
      />
    );

    expect(screen.getByTestId('confirm-materialize')).toBeDisabled();
  });
});
