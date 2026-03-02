/**
 * EntityTreeExplorer - Hierarchical knowledge graph browser
 *
 * Features:
 * - Collapsible tree view of knowledge nodes
 * - Scale level indicators (container/grouping/atomic)
 * - Inline summary preview
 * - Click to expand and see child nodes + facts
 * - Search within tree
 * - "Copy for AI" to export context
 * - Conversation import
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, gql } from '@apollo/client';
import './EntityTreeExplorer.css';

// GraphQL Queries
const GET_KNOWLEDGE_TREE = gql`
  query GetKnowledgeTree($teamId: ID!, $parentId: ID) {
    getKnowledgeTree(teamId: $teamId, parentId: $parentId) {
      id
      name
      type
      description
      summary
      scaleLevel
      childCount
      factCount
      createdAt
    }
  }
`;

const GET_KNOWLEDGE_NODE = gql`
  query GetKnowledgeNode($nodeId: ID!) {
    getKnowledgeNode(nodeId: $nodeId) {
      id
      name
      type
      description
      summary
      scaleLevel
      childCount
      factCount
      children {
        id
        name
        type
        scaleLevel
        childCount
        factCount
      }
      facts {
        id
        content
        category
        createdAt
      }
    }
  }
`;

const SEARCH_KNOWLEDGE_NODES = gql`
  query SearchKnowledgeNodes($teamId: ID!, $query: String!, $limit: Int) {
    searchKnowledgeNodes(teamId: $teamId, query: $query, limit: $limit) {
      id
      name
      type
      summary
      scaleLevel
      factCount
    }
  }
`;

const IMPORT_CONVERSATION = gql`
  mutation ImportConversation($teamId: ID!, $input: ConversationImportInput!) {
    importConversation(teamId: $teamId, input: $input) {
      success
      nodesCreated
      factsCreated
      rootNodeId
      message
    }
  }
`;

const CREATE_KNOWLEDGE_NODE = gql`
  mutation CreateKnowledgeNode($teamId: ID!, $input: CreateKnowledgeNodeInput!) {
    createKnowledgeNode(teamId: $teamId, input: $input) {
      id
      name
      type
      scaleLevel
    }
  }
`;

const REPARENT_KNOWLEDGE_NODE = gql`
  mutation ReparentKnowledgeNode($nodeId: ID!, $newParentId: ID) {
    reparentKnowledgeNode(nodeId: $nodeId, newParentId: $newParentId) {
      id
      name
      type
    }
  }
`;

// Scale level icons and labels
const SCALE_ICONS = {
  2: { icon: '📦', label: 'Container' },
  1: { icon: '📁', label: 'Group' },
  0: { icon: '📄', label: 'Item' }
};

const TYPE_ICONS = {
  conversation: '💬',
  project: '🎯',
  event: '📅',
  product: '🎮',
  person: '👤',
  company: '🏢',
  process: '⚙️',
  concept: '💡',
  default: '📌'
};

function EntityTreeExplorer({ teamId, onClose }) {
  const [expandedNodes, setExpandedNodes] = useState(new Set());
  const [selectedNode, setSelectedNode] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createParentId, setCreateParentId] = useState(null);
  const [draggedNode, setDraggedNode] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);

  // Fetch root nodes
  const { data: rootData, loading: rootLoading, refetch: refetchRoot } = useQuery(GET_KNOWLEDGE_TREE, {
    variables: { teamId, parentId: null },
    skip: !teamId
  });

  // Fetch selected node details
  const { data: nodeData, loading: nodeLoading } = useQuery(GET_KNOWLEDGE_NODE, {
    variables: { nodeId: selectedNode },
    skip: !selectedNode
  });

  // Search query
  const { refetch: searchNodes } = useQuery(SEARCH_KNOWLEDGE_NODES, {
    variables: { teamId, query: searchQuery, limit: 20 },
    skip: true // Manual trigger only
  });

  // Reparent mutation for drag-drop
  const [reparentNode] = useMutation(REPARENT_KNOWLEDGE_NODE, {
    onCompleted: () => {
      refetchRoot();
      setDraggedNode(null);
      setDropTarget(null);
    },
    onError: (error) => {
      console.error('Reparent error:', error);
      alert('Failed to move node: ' + error.message);
    }
  });

  const handleDrop = useCallback((targetNodeId) => {
    if (!draggedNode || draggedNode === targetNodeId) return;
    reparentNode({
      variables: { nodeId: draggedNode, newParentId: targetNodeId }
    });
  }, [draggedNode, reparentNode]);

  // Handle search
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    try {
      const result = await searchNodes({ teamId, query: searchQuery, limit: 20 });
      setSearchResults(result.data?.searchKnowledgeNodes || []);
    } catch (error) {
      console.error('Search error:', error);
    }
  }, [searchQuery, searchNodes, teamId]);

  useEffect(() => {
    const debounce = setTimeout(() => {
      if (searchQuery.trim()) {
        handleSearch();
      } else {
        setSearchResults(null);
      }
    }, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery, handleSearch]);

  // Toggle node expansion
  const toggleNode = (nodeId) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  // Copy node context for AI
  const copyContextForAI = (node, facts = []) => {
    let context = `## ${node.name} (${node.type})\n`;
    if (node.description) context += `${node.description}\n`;
    if (node.summary) context += `\nSummary: ${node.summary}\n`;
    if (facts.length > 0) {
      context += `\n### Facts:\n`;
      facts.forEach(f => {
        context += `- ${f.content}\n`;
      });
    }
    navigator.clipboard.writeText(context);
  };

  const rootNodes = rootData?.getKnowledgeTree || [];
  const selectedNodeDetails = nodeData?.getKnowledgeNode;

  return (
    <div className="entity-tree-explorer">
      {/* Header */}
      <div className="ete-header">
        <h2>Knowledge Graph</h2>
        <div className="ete-actions">
          <button
            className="ete-btn ete-btn-primary"
            onClick={() => setShowImportModal(true)}
          >
            Import Conversation
          </button>
          <button
            className="ete-btn"
            onClick={() => { setCreateParentId(null); setShowCreateModal(true); }}
          >
            + New Entity
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="ete-search">
        <input
          type="text"
          placeholder="Search knowledge..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="ete-search-input"
        />
        {searchQuery && (
          <button className="ete-search-clear" onClick={() => setSearchQuery('')}>×</button>
        )}
      </div>

      <div className="ete-content">
        {/* Tree Panel */}
        <div className="ete-tree-panel">
          {searchResults ? (
            // Search Results
            <div className="ete-search-results">
              <div className="ete-section-header">
                Search Results ({searchResults.length})
                <button className="ete-link-btn" onClick={() => setSearchResults(null)}>Clear</button>
              </div>
              {searchResults.length === 0 ? (
                <div className="ete-empty">No matching entities found</div>
              ) : (
                searchResults.map(node => (
                  <TreeNode
                    key={node.id}
                    node={node}
                    teamId={teamId}
                    isExpanded={false}
                    isSelected={selectedNode === node.id}
                    onToggle={() => {}}
                    onSelect={() => setSelectedNode(node.id)}
                    onCreateChild={() => { setCreateParentId(node.id); setShowCreateModal(true); }}
                    depth={0}
                    expandedNodes={expandedNodes}
                    setExpandedNodes={setExpandedNodes}
                    draggedNode={draggedNode}
                    setDraggedNode={setDraggedNode}
                    dropTarget={dropTarget}
                    setDropTarget={setDropTarget}
                    onDrop={handleDrop}
                  />
                ))
              )}
            </div>
          ) : (
            // Tree View
            <div className="ete-tree">
              {rootLoading ? (
                <div className="ete-loading">Loading...</div>
              ) : rootNodes.length === 0 ? (
                <div className="ete-empty">
                  <p>No knowledge entities yet.</p>
                  <p className="ete-hint">Import a conversation or create an entity to get started.</p>
                </div>
              ) : (
                rootNodes.map(node => (
                  <TreeNode
                    key={node.id}
                    node={node}
                    teamId={teamId}
                    isExpanded={expandedNodes.has(node.id)}
                    isSelected={selectedNode === node.id}
                    onToggle={() => toggleNode(node.id)}
                    onSelect={() => setSelectedNode(node.id)}
                    onCreateChild={() => { setCreateParentId(node.id); setShowCreateModal(true); }}
                    depth={0}
                    expandedNodes={expandedNodes}
                    setExpandedNodes={setExpandedNodes}
                    draggedNode={draggedNode}
                    setDraggedNode={setDraggedNode}
                    dropTarget={dropTarget}
                    setDropTarget={setDropTarget}
                    onDrop={handleDrop}
                  />
                ))
              )}
            </div>
          )}
        </div>

        {/* Detail Panel */}
        <div className="ete-detail-panel">
          {selectedNode && selectedNodeDetails ? (
            <NodeDetail
              node={selectedNodeDetails}
              loading={nodeLoading}
              onCopyContext={copyContextForAI}
              onCreateChild={() => { setCreateParentId(selectedNode); setShowCreateModal(true); }}
            />
          ) : (
            <div className="ete-detail-empty">
              <p>Select an entity to view details</p>
            </div>
          )}
        </div>
      </div>

      {/* Import Modal */}
      {showImportModal && (
        <ImportModal
          teamId={teamId}
          onClose={() => setShowImportModal(false)}
          onSuccess={() => {
            setShowImportModal(false);
            refetchRoot();
          }}
        />
      )}

      {/* Create Entity Modal */}
      {showCreateModal && (
        <CreateEntityModal
          teamId={teamId}
          parentId={createParentId}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            refetchRoot();
          }}
        />
      )}
    </div>
  );
}

// Tree Node Component
function TreeNode({
  node, teamId, isExpanded, isSelected, onToggle, onSelect, onCreateChild,
  depth, expandedNodes, setExpandedNodes,
  draggedNode, setDraggedNode, dropTarget, setDropTarget, onDrop
}) {
  const [children, setChildren] = useState([]);
  const [loadingChildren, setLoadingChildren] = useState(false);

  const { refetch: fetchChildren } = useQuery(GET_KNOWLEDGE_TREE, {
    variables: { teamId, parentId: node.id },
    skip: true
  });

  // Load children when expanded
  useEffect(() => {
    if (isExpanded && node.childCount > 0 && children.length === 0) {
      setLoadingChildren(true);
      fetchChildren({ teamId, parentId: node.id })
        .then(result => {
          setChildren(result.data?.getKnowledgeTree || []);
          setLoadingChildren(false);
        })
        .catch(() => setLoadingChildren(false));
    }
  }, [isExpanded, node.childCount, children.length, fetchChildren, teamId, node.id]);

  const scaleInfo = SCALE_ICONS[node.scaleLevel] || SCALE_ICONS[0];
  const typeIcon = TYPE_ICONS[node.type] || TYPE_ICONS.default;
  const hasChildren = node.childCount > 0;

  // Drag-drop handlers
  const handleDragStart = (e) => {
    e.stopPropagation();
    setDraggedNode(node.id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', node.id);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggedNode && draggedNode !== node.id) {
      setDropTarget(node.id);
      e.dataTransfer.dropEffect = 'move';
    }
  };

  const handleDragLeave = (e) => {
    e.stopPropagation();
    if (dropTarget === node.id) {
      setDropTarget(null);
    }
  };

  const handleDropEvent = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggedNode && draggedNode !== node.id) {
      onDrop(node.id);
    }
    setDropTarget(null);
  };

  const handleDragEnd = () => {
    setDraggedNode(null);
    setDropTarget(null);
  };

  const isDragging = draggedNode === node.id;
  const isDropTarget = dropTarget === node.id && draggedNode !== node.id;

  return (
    <div className="ete-tree-node" style={{ '--depth': depth }}>
      <div
        className={`ete-node-row ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''} ${isDropTarget ? 'drop-target' : ''}`}
        onClick={onSelect}
        draggable
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDropEvent}
        onDragEnd={handleDragEnd}
      >
        {/* Expand/Collapse */}
        <button
          className="ete-node-toggle"
          onClick={(e) => { e.stopPropagation(); if (hasChildren) onToggle(); }}
          disabled={!hasChildren}
        >
          {hasChildren ? (isExpanded ? '▼' : '▶') : '·'}
        </button>

        {/* Icon */}
        <span className="ete-node-icon" title={scaleInfo.label}>
          {typeIcon}
        </span>

        {/* Name */}
        <span className="ete-node-name">{node.name}</span>

        {/* Badges */}
        <span className="ete-node-badges">
          {node.childCount > 0 && (
            <span className="ete-badge ete-badge-children" title="Child entities">
              {node.childCount}
            </span>
          )}
          {node.factCount > 0 && (
            <span className="ete-badge ete-badge-facts" title="Facts">
              {node.factCount}
            </span>
          )}
        </span>

        {/* Quick Actions */}
        <button
          className="ete-node-action"
          onClick={(e) => { e.stopPropagation(); onCreateChild(); }}
          title="Add child entity"
        >
          +
        </button>
      </div>

      {/* Children */}
      {isExpanded && hasChildren && (
        <div className="ete-node-children">
          {loadingChildren ? (
            <div className="ete-loading-children">Loading...</div>
          ) : (
            children.map(child => (
              <TreeNode
                key={child.id}
                node={child}
                teamId={teamId}
                isExpanded={expandedNodes.has(child.id)}
                isSelected={false}
                onToggle={() => {
                  setExpandedNodes(prev => {
                    const next = new Set(prev);
                    if (next.has(child.id)) next.delete(child.id);
                    else next.add(child.id);
                    return next;
                  });
                }}
                onSelect={() => {}}
                onCreateChild={() => {}}
                depth={depth + 1}
                expandedNodes={expandedNodes}
                setExpandedNodes={setExpandedNodes}
                draggedNode={draggedNode}
                setDraggedNode={setDraggedNode}
                dropTarget={dropTarget}
                setDropTarget={setDropTarget}
                onDrop={onDrop}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// Node Detail Panel
function NodeDetail({ node, loading, onCopyContext, onCreateChild }) {
  if (loading) {
    return <div className="ete-detail-loading">Loading...</div>;
  }

  const scaleInfo = SCALE_ICONS[node.scaleLevel] || SCALE_ICONS[0];
  const typeIcon = TYPE_ICONS[node.type] || TYPE_ICONS.default;

  return (
    <div className="ete-detail">
      {/* Header */}
      <div className="ete-detail-header">
        <span className="ete-detail-icon">{typeIcon}</span>
        <div className="ete-detail-title">
          <h3>{node.name}</h3>
          <span className="ete-detail-type">{node.type} · {scaleInfo.label}</span>
        </div>
        <button
          className="ete-btn ete-btn-small"
          onClick={() => onCopyContext(node, node.facts || [])}
          title="Copy context for AI"
        >
          Copy for AI
        </button>
      </div>

      {/* Description/Summary */}
      {(node.description || node.summary) && (
        <div className="ete-detail-section">
          {node.description && <p className="ete-detail-desc">{node.description}</p>}
          {node.summary && (
            <div className="ete-detail-summary">
              <strong>Summary:</strong> {node.summary}
            </div>
          )}
        </div>
      )}

      {/* Children */}
      {node.children && node.children.length > 0 && (
        <div className="ete-detail-section">
          <div className="ete-detail-section-header">
            <h4>Contains ({node.children.length})</h4>
            <button className="ete-link-btn" onClick={onCreateChild}>+ Add</button>
          </div>
          <div className="ete-detail-children">
            {node.children.map(child => (
              <div key={child.id} className="ete-detail-child">
                <span className="ete-detail-child-icon">
                  {TYPE_ICONS[child.type] || TYPE_ICONS.default}
                </span>
                <span className="ete-detail-child-name">{child.name}</span>
                <span className="ete-detail-child-type">{child.type}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Facts */}
      {node.facts && node.facts.length > 0 && (
        <div className="ete-detail-section">
          <div className="ete-detail-section-header">
            <h4>Facts ({node.facts.length})</h4>
          </div>
          <div className="ete-detail-facts">
            {node.facts.map(fact => (
              <div key={fact.id} className="ete-detail-fact">
                <span className="ete-fact-content">{fact.content}</span>
                <span className="ete-fact-category">{fact.category}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {(!node.children || node.children.length === 0) && (!node.facts || node.facts.length === 0) && (
        <div className="ete-detail-empty-content">
          <p>This entity has no children or facts yet.</p>
          <button className="ete-btn" onClick={onCreateChild}>Add Child Entity</button>
        </div>
      )}
    </div>
  );
}

// Import Modal
function ImportModal({ teamId, onClose, onSuccess }) {
  const [format, setFormat] = useState('chatgpt_json');
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const [importConversation] = useMutation(IMPORT_CONVERSATION);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setContent(event.target.result);
      if (!title) {
        setTitle(file.name.replace(/\.[^/.]+$/, ''));
      }
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!content.trim()) {
      setError('Please provide content to import');
      return;
    }

    setImporting(true);
    setError(null);

    try {
      const response = await importConversation({
        variables: {
          teamId,
          input: { format, content, title: title || undefined }
        }
      });

      setResult(response.data.importConversation);
      if (response.data.importConversation.success) {
        setTimeout(onSuccess, 2000);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="ete-modal-overlay" onClick={onClose}>
      <div className="ete-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ete-modal-header">
          <h3>Import Conversation</h3>
          <button className="ete-modal-close" onClick={onClose}>×</button>
        </div>

        <div className="ete-modal-body">
          {result?.success ? (
            <div className="ete-import-success">
              <div className="ete-success-icon">✓</div>
              <h4>Import Successful!</h4>
              <p>{result.message}</p>
              <div className="ete-import-stats">
                <span>{result.nodesCreated} entities created</span>
                <span>{result.factsCreated} facts extracted</span>
              </div>
            </div>
          ) : (
            <>
              {/* Format Selection */}
              <div className="ete-form-group">
                <label>Source Format</label>
                <select value={format} onChange={(e) => setFormat(e.target.value)}>
                  <option value="chatgpt_json">ChatGPT Export (JSON)</option>
                  <option value="claude_markdown">Claude Export (Markdown)</option>
                  <option value="plain_text">Plain Text</option>
                </select>
              </div>

              {/* Title */}
              <div className="ete-form-group">
                <label>Title (optional)</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Conversation title..."
                />
              </div>

              {/* File Upload */}
              <div className="ete-form-group">
                <label>Upload File</label>
                <input
                  type="file"
                  accept=".json,.md,.txt"
                  onChange={handleFileUpload}
                />
              </div>

              {/* Or Paste */}
              <div className="ete-form-group">
                <label>Or Paste Content</label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Paste conversation content here..."
                  rows={10}
                />
              </div>

              {error && <div className="ete-error">{error}</div>}
            </>
          )}
        </div>

        <div className="ete-modal-footer">
          {!result?.success && (
            <>
              <button className="ete-btn" onClick={onClose}>Cancel</button>
              <button
                className="ete-btn ete-btn-primary"
                onClick={handleImport}
                disabled={importing || !content.trim()}
              >
                {importing ? 'Importing...' : 'Import'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Create Entity Modal
function CreateEntityModal({ teamId, parentId, onClose, onSuccess }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('concept');
  const [description, setDescription] = useState('');
  const [scaleLevel, setScaleLevel] = useState(parentId ? 1 : 2);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  const [createNode] = useMutation(CREATE_KNOWLEDGE_NODE);

  const handleCreate = async () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    setCreating(true);
    setError(null);

    try {
      await createNode({
        variables: {
          teamId,
          input: {
            name: name.trim(),
            type,
            description: description.trim() || undefined,
            parentNodeId: parentId || undefined,
            scaleLevel
          }
        }
      });
      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="ete-modal-overlay" onClick={onClose}>
      <div className="ete-modal ete-modal-small" onClick={(e) => e.stopPropagation()}>
        <div className="ete-modal-header">
          <h3>{parentId ? 'Create Child Entity' : 'Create Entity'}</h3>
          <button className="ete-modal-close" onClick={onClose}>×</button>
        </div>

        <div className="ete-modal-body">
          <div className="ete-form-group">
            <label>Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Entity name..."
              autoFocus
            />
          </div>

          <div className="ete-form-group">
            <label>Type</label>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="project">Project</option>
              <option value="event">Event</option>
              <option value="product">Product</option>
              <option value="person">Person</option>
              <option value="company">Company</option>
              <option value="process">Process</option>
              <option value="concept">Concept</option>
              <option value="conversation">Conversation</option>
            </select>
          </div>

          <div className="ete-form-group">
            <label>Scale</label>
            <select value={scaleLevel} onChange={(e) => setScaleLevel(parseInt(e.target.value))}>
              <option value={2}>Container (high-level)</option>
              <option value={1}>Group (mid-level)</option>
              <option value={0}>Item (detailed)</option>
            </select>
          </div>

          <div className="ete-form-group">
            <label>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description..."
              rows={3}
            />
          </div>

          {error && <div className="ete-error">{error}</div>}
        </div>

        <div className="ete-modal-footer">
          <button className="ete-btn" onClick={onClose}>Cancel</button>
          <button
            className="ete-btn ete-btn-primary"
            onClick={handleCreate}
            disabled={creating || !name.trim()}
          >
            {creating ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default EntityTreeExplorer;
