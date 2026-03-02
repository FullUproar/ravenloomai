/**
 * KnowledgeGraphViz - Interactive knowledge graph visualization
 * Uses native SVG for rendering without external dependencies
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, gql } from '@apollo/client';
import './KnowledgeGraphViz.css';

const GET_KNOWLEDGE_GRAPH = gql`
  query GetKnowledgeTree($teamId: ID!, $parentId: ID) {
    getKnowledgeTree(teamId: $teamId, parentId: $parentId) {
      id
      name
      type
      scaleLevel
      childCount
      factCount
    }
  }
`;

const GET_NODE_WITH_CHILDREN = gql`
  query GetKnowledgeNode($nodeId: ID!) {
    getKnowledgeNode(nodeId: $nodeId) {
      id
      name
      type
      scaleLevel
      childCount
      children {
        id
        name
        type
        scaleLevel
        childCount
      }
    }
  }
`;

// Node colors based on type
const TYPE_COLORS = {
  conversation: '#6366f1',
  project: '#22c55e',
  event: '#f97316',
  product: '#ec4899',
  person: '#8b5cf6',
  company: '#3b82f6',
  process: '#14b8a6',
  concept: '#eab308',
  topic: '#06b6d4',
  default: '#6b7280'
};

// Scale-based node sizes
const SCALE_SIZES = {
  2: 50,  // Container
  1: 35,  // Group
  0: 25   // Item
};

function KnowledgeGraphViz({ teamId }) {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [expandedNodes, setExpandedNodes] = useState(new Set());
  const [viewBox, setViewBox] = useState({ x: -400, y: -300, width: 800, height: 600 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);

  // Fetch root nodes
  const { data: rootData, loading } = useQuery(GET_KNOWLEDGE_GRAPH, {
    variables: { teamId, parentId: null },
    skip: !teamId
  });

  // Fetch children of expanded nodes
  const { refetch: fetchNode } = useQuery(GET_NODE_WITH_CHILDREN, {
    variables: { nodeId: '' },
    skip: true
  });

  // Initialize nodes from root data
  useEffect(() => {
    if (!rootData?.getKnowledgeTree) return;

    const rootNodes = rootData.getKnowledgeTree;
    const angleStep = (2 * Math.PI) / Math.max(rootNodes.length, 1);
    const radius = 200;

    const positioned = rootNodes.map((node, i) => ({
      ...node,
      x: Math.cos(i * angleStep) * radius,
      y: Math.sin(i * angleStep) * radius,
      vx: 0,
      vy: 0
    }));

    setNodes(positioned);
    setEdges([]);
  }, [rootData]);

  // Expand a node to show children
  const expandNode = useCallback(async (nodeId) => {
    if (expandedNodes.has(nodeId)) return;

    try {
      const result = await fetchNode({ nodeId });
      const nodeData = result.data?.getKnowledgeNode;
      if (!nodeData?.children?.length) return;

      const parentNode = nodes.find(n => n.id === nodeId);
      if (!parentNode) return;

      const angleStep = (2 * Math.PI) / nodeData.children.length;
      const childRadius = 100;

      const newNodes = nodeData.children.map((child, i) => ({
        ...child,
        x: parentNode.x + Math.cos(i * angleStep) * childRadius,
        y: parentNode.y + Math.sin(i * angleStep) * childRadius,
        vx: 0,
        vy: 0
      }));

      const newEdges = nodeData.children.map(child => ({
        source: nodeId,
        target: child.id
      }));

      setNodes(prev => [...prev.filter(n => !newNodes.find(nn => nn.id === n.id)), ...newNodes]);
      setEdges(prev => [...prev, ...newEdges]);
      setExpandedNodes(prev => new Set([...prev, nodeId]));
    } catch (error) {
      console.error('Error expanding node:', error);
    }
  }, [nodes, expandedNodes, fetchNode]);

  // Simple force simulation
  useEffect(() => {
    if (nodes.length < 2) return;

    const simulate = () => {
      setNodes(prev => {
        const updated = prev.map(node => ({ ...node }));

        // Repulsion between nodes
        for (let i = 0; i < updated.length; i++) {
          for (let j = i + 1; j < updated.length; j++) {
            const dx = updated[j].x - updated[i].x;
            const dy = updated[j].y - updated[i].y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const force = 5000 / (dist * dist);
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;

            updated[i].vx -= fx * 0.1;
            updated[i].vy -= fy * 0.1;
            updated[j].vx += fx * 0.1;
            updated[j].vy += fy * 0.1;
          }
        }

        // Edge attraction
        edges.forEach(edge => {
          const source = updated.find(n => n.id === edge.source);
          const target = updated.find(n => n.id === edge.target);
          if (!source || !target) return;

          const dx = target.x - source.x;
          const dy = target.y - source.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = (dist - 100) * 0.01;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

          source.vx += fx;
          source.vy += fy;
          target.vx -= fx;
          target.vy -= fy;
        });

        // Apply velocity with damping
        updated.forEach(node => {
          node.vx *= 0.9;
          node.vy *= 0.9;
          node.x += node.vx;
          node.y += node.vy;
        });

        return updated;
      });
    };

    const interval = setInterval(simulate, 50);
    return () => clearInterval(interval);
  }, [nodes.length, edges]);

  // Pan handling
  const handleMouseDown = (e) => {
    if (e.target === svgRef.current) {
      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const dx = (e.clientX - dragStart.x) / zoom;
    const dy = (e.clientY - dragStart.y) / zoom;
    setViewBox(prev => ({ ...prev, x: prev.x - dx, y: prev.y - dy }));
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => setIsDragging(false);

  // Zoom handling
  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 1.1 : 0.9;
    const newZoom = Math.max(0.1, Math.min(5, zoom * delta));
    setZoom(newZoom);
    setViewBox(prev => ({
      ...prev,
      width: 800 / newZoom,
      height: 600 / newZoom
    }));
  };

  const handleNodeClick = (node) => {
    setSelectedNode(node.id === selectedNode ? null : node.id);
    if (node.childCount > 0) {
      expandNode(node.id);
    }
  };

  if (loading) {
    return <div className="kgv-loading">Loading graph...</div>;
  }

  return (
    <div className="knowledge-graph-viz" ref={containerRef}>
      <div className="kgv-header">
        <h3>Knowledge Graph</h3>
        <div className="kgv-controls">
          <button onClick={() => setZoom(z => Math.min(5, z * 1.2))}>+</button>
          <button onClick={() => setZoom(z => Math.max(0.1, z * 0.8))}>-</button>
          <button onClick={() => { setZoom(1); setViewBox({ x: -400, y: -300, width: 800, height: 600 }); }}>Reset</button>
        </div>
      </div>

      <svg
        ref={svgRef}
        className="kgv-svg"
        viewBox={viewBox.x + ' ' + viewBox.y + ' ' + viewBox.width + ' ' + viewBox.height}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <defs>
          <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#4b5563" />
          </marker>
        </defs>

        {/* Edges */}
        <g className="kgv-edges">
          {edges.map((edge, i) => {
            const source = nodes.find(n => n.id === edge.source);
            const target = nodes.find(n => n.id === edge.target);
            if (!source || !target) return null;
            return (
              <line
                key={i}
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                stroke="#4b5563"
                strokeWidth="2"
                markerEnd="url(#arrowhead)"
              />
            );
          })}
        </g>

        {/* Nodes */}
        <g className="kgv-nodes">
          {nodes.map(node => {
            const size = SCALE_SIZES[node.scaleLevel] || SCALE_SIZES[0];
            const color = TYPE_COLORS[node.type] || TYPE_COLORS.default;
            const isSelected = node.id === selectedNode;

            return (
              <g
                key={node.id}
                className={'kgv-node' + (isSelected ? ' selected' : '')}
                transform={'translate(' + node.x + ',' + node.y + ')'}
                onClick={() => handleNodeClick(node)}
                style={{ cursor: 'pointer' }}
              >
                <circle
                  r={size / 2}
                  fill={color}
                  stroke={isSelected ? '#fff' : 'transparent'}
                  strokeWidth="3"
                />
                {node.childCount > 0 && !expandedNodes.has(node.id) && (
                  <circle r={size / 2 + 5} fill="none" stroke={color} strokeWidth="2" strokeDasharray="4 2" />
                )}
                <text
                  y={size / 2 + 14}
                  textAnchor="middle"
                  fill="#e8e8e8"
                  fontSize="12"
                  fontWeight="500"
                >
                  {node.name.length > 20 ? node.name.substring(0, 18) + '...' : node.name}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* Legend */}
      <div className="kgv-legend">
        {Object.entries(TYPE_COLORS).filter(([k]) => k !== 'default').slice(0, 6).map(([type, color]) => (
          <div key={type} className="kgv-legend-item">
            <span className="kgv-legend-color" style={{ background: color }}></span>
            <span>{type}</span>
          </div>
        ))}
      </div>

      {/* Selected Node Info */}
      {selectedNode && (
        <div className="kgv-node-info">
          {(() => {
            const node = nodes.find(n => n.id === selectedNode);
            if (!node) return null;
            return (
              <>
                <h4>{node.name}</h4>
                <p>Type: {node.type}</p>
                <p>Facts: {node.factCount || 0}</p>
                <p>Children: {node.childCount || 0}</p>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}

export default KnowledgeGraphViz;
