/**
 * KnowledgeGraph — Force-directed graph visualization
 *
 * Renders concepts as nodes, triples as edges.
 * SST scope breadcrumbs let you drill into categories.
 * Click a node to see its connections. Hover for details.
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import { gql, useQuery } from '@apollo/client';
import * as d3Force from 'd3-force';
import * as d3Selection from 'd3-selection';
import * as d3Zoom from 'd3-zoom';
import * as d3Drag from 'd3-drag';
import './KnowledgeGraph.css';

const GET_GRAPH_DATA = gql`
  query GetGraphData($teamId: ID!, $sstNodeId: ID, $limit: Int) {
    getGraphData(teamId: $teamId, sstNodeId: $sstNodeId, limit: $limit) {
      nodes { id name type mentionCount connectionCount }
      edges { id sourceId targetId relationship displayText confidence trustTier }
    }
  }
`;

const GET_SST_TREE = gql`
  query GetSSTTree($teamId: ID!) {
    getSSTTree(teamId: $teamId) {
      id name description parentId depth tripleCount queryCount isRoot
    }
  }
`;

// Node colors by type
const TYPE_COLORS = {
  product: '#3b82f6',
  company: '#8b5cf6',
  person: '#ec4899',
  date: '#f59e0b',
  location: '#10b981',
  event: '#ef4444',
  quantity: '#06b6d4',
  concept: '#6366f1',
  process: '#14b8a6',
  organization: '#8b5cf6',
  technology: '#a855f7',
  default: '#6b7280',
};

function getNodeColor(type) {
  return TYPE_COLORS[(type || '').toLowerCase()] || TYPE_COLORS.default;
}

// ── Scope Breadcrumbs ────────────────────────────────────────────────────

function ScopeBreadcrumbs({ sstTree, activeScopeId, onSelectScope }) {
  if (!sstTree || sstTree.length === 0) return null;

  // Build path from root to active scope
  const nodeMap = new Map(sstTree.map(n => [n.id, n]));
  const path = [];
  let current = activeScopeId ? nodeMap.get(activeScopeId) : null;
  while (current) {
    path.unshift(current);
    current = current.parentId ? nodeMap.get(current.parentId) : null;
  }

  // Children of active scope (or root-level if no active)
  const parentId = activeScopeId || null;
  const children = sstTree.filter(n =>
    activeScopeId ? n.parentId === activeScopeId : n.isRoot || (!n.parentId && !n.isRoot)
  ).filter(n => n.id !== activeScopeId);

  return (
    <div className="graph-scope-nav">
      {/* Breadcrumb trail */}
      <div className="scope-breadcrumbs">
        <button
          className={`scope-crumb ${!activeScopeId ? 'active' : ''}`}
          onClick={() => onSelectScope(null)}
        >
          All Knowledge
        </button>
        {path.map((node, i) => (
          <span key={node.id}>
            <span className="scope-crumb-separator">/</span>
            <button
              className={`scope-crumb ${i === path.length - 1 ? 'active' : ''}`}
              onClick={() => onSelectScope(node.id)}
            >
              {node.name}
              <span className="scope-crumb-count">{node.tripleCount}</span>
            </button>
          </span>
        ))}
      </div>

      {/* Child scope chips */}
      {children.length > 0 && (
        <div className="scope-children">
          {children
            .filter(n => n.tripleCount > 0)
            .sort((a, b) => b.tripleCount - a.tripleCount)
            .map(child => (
              <button
                key={child.id}
                className="scope-child-btn"
                onClick={() => onSelectScope(child.id)}
                title={child.description || ''}
              >
                {child.name}
                <span className="scope-child-count">{child.tripleCount}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

// ── Node Detail Panel ────────────────────────────────────────────────────

function NodeDetail({ node, edges, allNodes, onClose }) {
  if (!node) return null;

  const nodeMap = new Map(allNodes.map(n => [n.id, n]));
  const connected = edges
    .filter(e => e.sourceId === node.id || e.targetId === node.id)
    .map(e => {
      const otherId = e.sourceId === node.id ? e.targetId : e.sourceId;
      const other = nodeMap.get(otherId);
      const direction = e.sourceId === node.id ? 'outgoing' : 'incoming';
      return { ...e, other, direction };
    });

  return (
    <div className="graph-detail-panel">
      <div className="detail-header">
        <div className="detail-name">{node.name}</div>
        <div className="detail-type" style={{ color: getNodeColor(node.type) }}>{node.type}</div>
        <button className="detail-close" onClick={onClose}>&times;</button>
      </div>

      <div className="detail-stats">
        <span>{node.connectionCount} connections</span>
        <span>{node.mentionCount} mentions</span>
      </div>

      <div className="detail-connections">
        {connected.map(conn => (
          <div key={conn.id} className={`detail-edge detail-edge--${conn.direction}`}>
            {conn.direction === 'outgoing' ? (
              <span className="detail-edge-text">
                <strong>{node.name}</strong>
                <span className="detail-rel">{conn.relationship}</span>
                <strong>{conn.other?.name || '?'}</strong>
              </span>
            ) : (
              <span className="detail-edge-text">
                <strong>{conn.other?.name || '?'}</strong>
                <span className="detail-rel">{conn.relationship}</span>
                <strong>{node.name}</strong>
              </span>
            )}
            {conn.confidence != null && (
              <span className="detail-conf">{Math.round(conn.confidence * 100)}%</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────

export default function KnowledgeGraph({ teamId, traversalPath, realtimePhases, onTraversalComplete }) {
  const svgRef = useRef(null);
  const simRef = useRef(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [activeScopeId, setActiveScopeId] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const animFrameRef = useRef(null);

  const { data: graphData, loading: graphLoading } = useQuery(GET_GRAPH_DATA, {
    variables: { teamId, sstNodeId: activeScopeId, limit: 300 },
    fetchPolicy: 'cache-and-network',
  });

  const { data: sstData } = useQuery(GET_SST_TREE, {
    variables: { teamId },
    fetchPolicy: 'cache-and-network',
  });

  const nodes = graphData?.getGraphData?.nodes || [];
  const edges = graphData?.getGraphData?.edges || [];
  const sstTree = sstData?.getSSTTree || [];

  // ── D3 Force Simulation — "Living Brain" ───────────────────────────

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return;

    const svg = d3Selection.select(svgRef.current);
    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    svg.selectAll('*').remove();

    // Defs: glow filter + radial gradient for nodes
    const defs = svg.append('defs');
    const glow = defs.append('filter').attr('id', 'glow').attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%');
    glow.append('feGaussianBlur').attr('stdDeviation', '4').attr('result', 'coloredBlur');
    const glowMerge = glow.append('feMerge');
    glowMerge.append('feMergeNode').attr('in', 'coloredBlur');
    glowMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    // Soft glow for ambient particles
    const softGlow = defs.append('filter').attr('id', 'softGlow').attr('x', '-100%').attr('y', '-100%').attr('width', '300%').attr('height', '300%');
    softGlow.append('feGaussianBlur').attr('stdDeviation', '2').attr('result', 'blur');
    const sgMerge = softGlow.append('feMerge');
    sgMerge.append('feMergeNode').attr('in', 'blur');
    sgMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    const g = svg.append('g');

    // Zoom
    const zoom = d3Zoom.zoom().scaleExtent([0.1, 4]).on('zoom', (event) => g.attr('transform', event.transform));
    svg.call(zoom);

    // Max connections for normalization
    const maxConn = Math.max(1, ...nodes.map(n => n.connectionCount));

    // Node data with computed properties
    const nodeData = nodes.map(n => {
      const importance = n.connectionCount / maxConn; // 0-1
      return {
        ...n,
        importance,
        radius: Math.max(5, Math.min(35, 3 + Math.sqrt(n.connectionCount) * 6)),
        breatheSpeed: 3000 + (1 - importance) * 4000, // important nodes breathe faster
        breatheAmount: 0.15 + importance * 0.25, // important nodes breathe more
      };
    });
    const nodeMap = new Map(nodeData.map(n => [n.id, n]));

    const edgeData = edges
      .filter(e => nodeMap.has(e.sourceId) && nodeMap.has(e.targetId))
      .map(e => ({ ...e, source: e.sourceId, target: e.targetId }));

    // Force simulation — gravity pulls important nodes toward center
    const simulation = d3Force.forceSimulation(nodeData)
      .force('link', d3Force.forceLink(edgeData).id(d => d.id).distance(70).strength(0.4))
      .force('charge', d3Force.forceManyBody().strength(d => -100 - d.importance * 200).distanceMax(350))
      .force('center', d3Force.forceCenter(width / 2, height / 2))
      .force('collision', d3Force.forceCollide().radius(d => d.radius + 3))
      .force('gravity', d3Force.forceRadial(
        d => (1 - d.importance) * Math.min(width, height) * 0.35,
        width / 2, height / 2
      ).strength(0.05));

    simRef.current = simulation;

    // ── Layer 1: Ambient particles ──────────────────────────────
    const particleLayer = g.append('g').attr('class', 'ambient-particles');

    // ── Layer 2: Edges ──────────────────────────────────────────
    const links = g.append('g').attr('class', 'graph-links')
      .selectAll('line').data(edgeData).join('line')
      .attr('class', 'graph-link')
      .attr('stroke-opacity', d => 0.15 + (d.confidence || 0.5) * 0.25)
      .attr('stroke-width', d => Math.max(0.5, (d.confidence || 0.5) * 2));

    const linkLabels = g.append('g').attr('class', 'graph-link-labels')
      .selectAll('text').data(edgeData).join('text')
      .attr('class', 'graph-link-label')
      .text(d => d.relationship)
      .attr('font-size', '7px')
      .attr('opacity', 0);

    // ── Layer 3: Node groups ────────────────────────────────────
    const nodeGroups = g.append('g').attr('class', 'graph-nodes')
      .selectAll('g').data(nodeData).join('g')
      .attr('class', 'graph-node-group')
      .style('cursor', 'pointer');

    // Outer glow ring (breathing)
    nodeGroups.append('circle')
      .attr('class', 'node-glow-ring')
      .attr('r', d => d.radius + 6)
      .attr('fill', 'none')
      .attr('stroke', d => getNodeColor(d.type))
      .attr('stroke-width', 1)
      .attr('opacity', 0.15);

    // Main circle
    nodeGroups.append('circle')
      .attr('class', 'node-main')
      .attr('r', d => d.radius)
      .attr('fill', d => getNodeColor(d.type))
      .attr('stroke', d => getNodeColor(d.type))
      .attr('stroke-width', 0.5)
      .attr('fill-opacity', d => 0.3 + d.importance * 0.5)
      .attr('stroke-opacity', 0.6);

    // Inner bright core (more important = brighter core)
    nodeGroups.append('circle')
      .attr('class', 'node-core')
      .attr('r', d => d.radius * 0.4 * (0.5 + d.importance * 0.5))
      .attr('fill', d => getNodeColor(d.type))
      .attr('opacity', d => 0.5 + d.importance * 0.5)
      .attr('filter', 'url(#softGlow)');

    // Labels
    nodeGroups.append('text')
      .text(d => d.name.length > 20 ? d.name.substring(0, 18) + '...' : d.name)
      .attr('text-anchor', 'middle')
      .attr('dy', d => d.radius + 14)
      .attr('font-size', d => Math.max(8, Math.min(12, 7 + d.importance * 5)))
      .attr('fill', d => d.importance > 0.3 ? '#d1d5db' : '#6b7280')
      .attr('pointer-events', 'none');

    // ── Interactions ────────────────────────────────────────────
    nodeGroups
      .on('click', (event, d) => {
        event.stopPropagation();
        setSelectedNode(prev => prev?.id === d.id ? null : d);
      })
      .on('mouseenter', (event, d) => {
        setHoveredNode(d);
        // Neural pathway: highlight all connections cascading outward
        highlightPathways(svg, g, d, edgeData, nodeData, 2);
      })
      .on('mouseleave', () => {
        setHoveredNode(null);
        resetHighlight(svg);
      });

    svg.on('click', () => { setSelectedNode(null); resetHighlight(svg); });

    // Drag
    const drag = d3Drag.drag()
      .on('start', (event, d) => { if (!event.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
      .on('end', (event, d) => { if (!event.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; });
    nodeGroups.call(drag);

    // ── Tick + Breathing ────────────────────────────────────────
    let tickCount = 0;
    simulation.on('tick', () => {
      tickCount++;

      links.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y);

      linkLabels.attr('x', d => (d.source.x + d.target.x) / 2)
        .attr('y', d => (d.source.y + d.target.y) / 2);

      nodeGroups.attr('transform', d => `translate(${d.x},${d.y})`);

      // Breathing animation (every 3 ticks to reduce overhead)
      if (tickCount % 3 === 0) {
        const now = Date.now();
        nodeGroups.select('.node-glow-ring')
          .attr('r', d => {
            const phase = Math.sin(now / d.breatheSpeed * Math.PI * 2);
            return d.radius + 5 + phase * d.radius * d.breatheAmount;
          })
          .attr('opacity', d => {
            const phase = Math.sin(now / d.breatheSpeed * Math.PI * 2);
            return 0.08 + (0.5 + phase * 0.5) * 0.15;
          });
      }
    });

    // ── Ambient Particles (synapse flow) ────────────────────────
    let particleAnimId;
    function spawnParticle() {
      if (edgeData.length === 0) return;
      // Pick a random edge
      const edge = edgeData[Math.floor(Math.random() * edgeData.length)];
      const source = typeof edge.source === 'object' ? edge.source : nodeMap.get(edge.source);
      const target = typeof edge.target === 'object' ? edge.target : nodeMap.get(edge.target);
      if (!source || !target || !source.x || !target.x) return;

      const color = getNodeColor(source.type || 'default');
      const particle = particleLayer.append('circle')
        .attr('r', 1.5)
        .attr('fill', color)
        .attr('opacity', 0.6)
        .attr('filter', 'url(#softGlow)')
        .attr('cx', source.x)
        .attr('cy', source.y);

      particle.transition()
        .duration(2000 + Math.random() * 2000)
        .ease(t => t)
        .attr('cx', target.x)
        .attr('cy', target.y)
        .attr('opacity', 0)
        .attr('r', 0.5)
        .remove();
    }

    // Spawn particles at a steady rate
    const particleInterval = setInterval(() => {
      const count = Math.min(3, Math.ceil(edgeData.length / 50));
      for (let i = 0; i < count; i++) spawnParticle();
    }, 800);

    // Initial zoom
    setTimeout(() => {
      svg.transition().duration(1000).call(zoom.transform, d3Zoom.zoomIdentity.translate(0, 0).scale(0.75));
    }, 600);

    return () => {
      simulation.stop();
      clearInterval(particleInterval);
      cancelAnimationFrame(particleAnimId);
    };
  }, [nodes, edges]);

  // Neural pathway highlighting — cascading wave from hovered node
  function highlightPathways(svg, g, centerNode, edgeData, nodeData, maxDepth) {
    const visited = new Map(); // id → depth
    const queue = [{ id: centerNode.id, depth: 0 }];
    visited.set(centerNode.id, 0);

    while (queue.length > 0) {
      const { id, depth } = queue.shift();
      if (depth >= maxDepth) continue;

      for (const edge of edgeData) {
        const srcId = typeof edge.source === 'object' ? edge.source.id : edge.source;
        const tgtId = typeof edge.target === 'object' ? edge.target.id : edge.target;
        const neighborId = srcId === id ? tgtId : tgtId === id ? srcId : null;
        if (neighborId && !visited.has(neighborId)) {
          visited.set(neighborId, depth + 1);
          queue.push({ id: neighborId, depth: depth + 1 });
        }
      }
    }

    // Dim everything first
    svg.selectAll('.graph-node-group .node-main').transition().duration(200).attr('fill-opacity', 0.05).attr('stroke-opacity', 0.1);
    svg.selectAll('.graph-node-group .node-core').transition().duration(200).attr('opacity', 0.05);
    svg.selectAll('.graph-node-group .node-glow-ring').transition().duration(200).attr('opacity', 0.02);
    svg.selectAll('.graph-node-group text').transition().duration(200).attr('opacity', 0.05);
    svg.selectAll('.graph-link').transition().duration(200).attr('stroke-opacity', 0.02);
    svg.selectAll('.graph-link-label').transition().duration(200).attr('opacity', 0);

    // Light up visited nodes with cascading delay
    visited.forEach((depth, nodeId) => {
      const delay = depth * 150;
      const intensity = 1 - depth * 0.3;
      const color = depth === 0 ? '#fff' : getNodeColor(nodeData.find(n => n.id === nodeId)?.type || 'default');

      svg.selectAll('.graph-node-group').filter(d => d.id === nodeId).each(function() {
        const node = d3Selection.select(this);
        node.select('.node-main').transition().delay(delay).duration(300)
          .attr('fill-opacity', 0.4 * intensity + 0.2).attr('stroke-opacity', 0.8 * intensity)
          .attr('stroke', color).attr('stroke-width', depth === 0 ? 2 : 1);
        node.select('.node-core').transition().delay(delay).duration(300)
          .attr('opacity', 0.7 * intensity).attr('filter', 'url(#glow)');
        node.select('.node-glow-ring').transition().delay(delay).duration(300)
          .attr('opacity', 0.2 * intensity).attr('stroke', color);
        node.select('text').transition().delay(delay).duration(300)
          .attr('opacity', Math.max(0.4, intensity)).attr('fill', depth === 0 ? '#fff' : '#d1d5db');
      });
    });

    // Light up edges between visited nodes
    svg.selectAll('.graph-link').each(function(d) {
      const srcId = typeof d.source === 'object' ? d.source.id : d.source;
      const tgtId = typeof d.target === 'object' ? d.target.id : d.target;
      if (visited.has(srcId) && visited.has(tgtId)) {
        const depth = Math.max(visited.get(srcId), visited.get(tgtId));
        d3Selection.select(this).transition().delay(depth * 150).duration(300)
          .attr('stroke-opacity', 0.5 - depth * 0.15).attr('stroke-width', 2 - depth * 0.4);
      }
    });

    // Show edge labels for direct connections
    svg.selectAll('.graph-link-label').each(function(d) {
      const srcId = typeof d.source === 'object' ? d.source.id : d.source;
      const tgtId = typeof d.target === 'object' ? d.target.id : d.target;
      if ((srcId === centerNode.id || tgtId === centerNode.id) && visited.has(srcId) && visited.has(tgtId)) {
        d3Selection.select(this).transition().delay(100).duration(300).attr('opacity', 0.8);
      }
    });
  }

  function resetHighlight(svg) {
    svg.selectAll('.graph-node-group .node-main').transition().duration(400)
      .attr('fill-opacity', d => 0.3 + (d.importance || 0) * 0.5)
      .attr('stroke-opacity', 0.6).attr('stroke-width', 0.5)
      .attr('stroke', d => getNodeColor(d.type));
    svg.selectAll('.graph-node-group .node-core').transition().duration(400)
      .attr('opacity', d => 0.5 + (d.importance || 0) * 0.5).attr('filter', 'url(#softGlow)');
    svg.selectAll('.graph-node-group .node-glow-ring').transition().duration(400)
      .attr('opacity', 0.15).attr('stroke', d => getNodeColor(d.type));
    svg.selectAll('.graph-node-group text').transition().duration(400)
      .attr('opacity', d => (d.importance || 0) > 0.3 ? 1 : 0.7)
      .attr('fill', d => (d.importance || 0) > 0.3 ? '#d1d5db' : '#6b7280');
    svg.selectAll('.graph-link').transition().duration(400)
      .attr('stroke-opacity', d => 0.15 + ((d.confidence || 0.5) * 0.25)).attr('stroke-width', d => Math.max(0.5, (d.confidence || 0.5) * 2));
    svg.selectAll('.graph-link-label').transition().duration(400).attr('opacity', 0);
  }

  // Highlight selected node's connections
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3Selection.select(svgRef.current);

    if (selectedNode) {
      const connectedIds = new Set();
      connectedIds.add(selectedNode.id);
      edges.forEach(e => {
        if (e.sourceId === selectedNode.id) connectedIds.add(e.targetId);
        if (e.targetId === selectedNode.id) connectedIds.add(e.sourceId);
      });

      svg.selectAll('.graph-node-group circle')
        .attr('opacity', d => connectedIds.has(d.id) ? 1 : 0.15);
      svg.selectAll('.graph-node-group text')
        .attr('opacity', d => connectedIds.has(d.id) ? 1 : 0.15);
      svg.selectAll('.graph-link')
        .attr('stroke-opacity', d =>
          d.sourceId === selectedNode.id || d.targetId === selectedNode.id ? 0.8 : 0.05
        );
      svg.selectAll('.graph-link-label')
        .attr('opacity', d =>
          d.sourceId === selectedNode.id || d.targetId === selectedNode.id ? 0.9 : 0
        );
    } else {
      svg.selectAll('.graph-node-group circle').attr('opacity', 0.85);
      svg.selectAll('.graph-node-group text').attr('opacity', 1);
      svg.selectAll('.graph-link').attr('stroke-opacity', 0.4);
      svg.selectAll('.graph-link-label').attr('opacity', 0.5);
    }
  }, [selectedNode, edges]);

  // ── Real-time Phase Animation ───────────────────────────────────────
  // Triggered as each phase arrives from the streaming endpoint
  const lastPhaseCountRef = useRef(0);

  useEffect(() => {
    if (!realtimePhases || realtimePhases.length === 0 || !svgRef.current || nodes.length === 0) return;
    if (realtimePhases.length <= lastPhaseCountRef.current) return;

    // Only animate the NEW phase(s)
    const newPhases = realtimePhases.slice(lastPhaseCountRef.current);
    lastPhaseCountRef.current = realtimePhases.length;

    const svg = d3Selection.select(svgRef.current);
    const g = svg.select('g');
    if (g.empty()) return;

    // On first phase, dim everything
    if (realtimePhases.length === 1) {
      setIsAnimating(true);
      svg.selectAll('.graph-node-group circle').transition().duration(600).attr('opacity', 0.08).attr('stroke-width', 1.5);
      svg.selectAll('.graph-node-group text').transition().duration(600).attr('opacity', 0.05);
      svg.selectAll('.graph-link').transition().duration(600).attr('stroke-opacity', 0.03);
      svg.selectAll('.graph-link-label').transition().duration(600).attr('opacity', 0);

      // Ensure glow filter exists
      let defs = svg.select('defs');
      if (defs.empty()) defs = svg.append('defs');
      if (defs.select('#glow').empty()) {
        const filter = defs.append('filter').attr('id', 'glow');
        filter.append('feGaussianBlur').attr('stdDeviation', '4').attr('result', 'coloredBlur');
        const merge = filter.append('feMerge');
        merge.append('feMergeNode').attr('in', 'coloredBlur');
        merge.append('feMergeNode').attr('in', 'SourceGraphic');
      }
    }

    const PHASE_COLORS = {
      embedding_search: '#3b82f6',
      multi_hop: '#f59e0b',
      selected: '#22c55e',
    };

    for (const phase of newPhases) {
      const color = PHASE_COLORS[phase.phase] || '#3b82f6';
      const conceptIds = new Set();
      const edgeIds = new Set();
      (phase.nodesVisited || []).forEach(n => {
        if (n.subjectId) conceptIds.add(n.subjectId);
        if (n.objectId) conceptIds.add(n.objectId);
        edgeIds.add(n.id);
      });

      // Auto-zoom to cluster
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, count = 0;
      svg.selectAll('.graph-node-group').each(function(d) {
        if (conceptIds.has(d.id)) {
          minX = Math.min(minX, d.x); maxX = Math.max(maxX, d.x);
          minY = Math.min(minY, d.y); maxY = Math.max(maxY, d.y);
          count++;
        }
      });

      if (count > 0) {
        const padding = 80;
        const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
        const bw = maxX - minX + padding * 2, bh = maxY - minY + padding * 2;
        const width = svgRef.current.clientWidth, height = svgRef.current.clientHeight;
        const scale = Math.min(width / bw, height / bh, 2.0) * 0.85;
        const tx = width / 2 - cx * scale, ty = height / 2 - cy * scale;
        const zoom = d3Zoom.zoom().scaleExtent([0.1, 4]);
        svg.transition().duration(1000).ease(t => t * (2 - t))
          .call(zoom.transform, d3Zoom.zoomIdentity.translate(tx, ty).scale(scale));
      }

      // Stagger node reveals
      let nodeIdx = 0;
      svg.selectAll('.graph-node-group').each(function(d) {
        if (conceptIds.has(d.id)) {
          const node = d3Selection.select(this);
          const stagger = nodeIdx * 150;

          setTimeout(() => {
            // Ripple
            const ripple = g.append('circle').attr('class', 'traversal-ripple')
              .attr('cx', d.x).attr('cy', d.y).attr('r', d.radius || 10)
              .attr('fill', 'none').attr('stroke', color).attr('stroke-width', 2.5).attr('opacity', 0.9);
            ripple.transition().duration(1200).ease(t => Math.sqrt(t))
              .attr('r', (d.radius || 10) + 40).attr('stroke-width', 0.5).attr('opacity', 0).remove();

            // Glow node
            node.select('circle').transition().duration(500).ease(t => t * (2 - t))
              .attr('opacity', 1).attr('stroke', color)
              .attr('stroke-width', phase.phase === 'selected' ? 4 : 2.5).attr('filter', 'url(#glow)');
            node.select('text').transition().duration(500)
              .attr('opacity', 1).attr('fill', phase.phase === 'selected' ? '#fff' : color);
          }, stagger);
          nodeIdx++;
        }
      });

      // Edge particles
      let edgeIdx = 0;
      svg.selectAll('.graph-link').each(function(d) {
        if (edgeIds.has(d.id)) {
          const stagger = edgeIdx * 150 + 200;
          setTimeout(() => {
            d3Selection.select(this).transition().duration(600)
              .attr('stroke', color).attr('stroke-opacity', phase.phase === 'selected' ? 0.9 : 0.6)
              .attr('stroke-width', phase.phase === 'selected' ? 3.5 : 2);

            const source = typeof d.source === 'object' ? d.source : { x: 0, y: 0 };
            const target = typeof d.target === 'object' ? d.target : { x: 0, y: 0 };
            for (let p = 0; p < 4; p++) {
              g.append('circle').attr('class', 'traversal-particle')
                .attr('r', phase.phase === 'selected' ? 4 : 2.5).attr('fill', color)
                .attr('opacity', 0.95).attr('filter', 'url(#glow)')
                .attr('cx', source.x).attr('cy', source.y)
                .transition().delay(p * 180).duration(900)
                .ease(t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t)
                .attr('cx', target.x).attr('cy', target.y)
                .transition().duration(300).attr('r', 1).attr('opacity', 0).remove();
            }
          }, stagger);
          edgeIdx++;
        }
      });

      // If this is the final 'selected' phase, end animation after a delay
      if (phase.phase === 'selected') {
        setTimeout(() => {
          setIsAnimating(false);
          // Zoom out gently
          const zoom = d3Zoom.zoom().scaleExtent([0.1, 4]);
          svg.transition().duration(1500).ease(t => t * (2 - t))
            .call(zoom.transform, d3Zoom.zoomIdentity.translate(0, 0).scale(0.75));
        }, 2500);
      }
    }
  }, [realtimePhases, nodes]);

  // ── Replay Traversal Animation (from "Watch Raven think" button) ────
  useEffect(() => {
    if (!traversalPath || !svgRef.current || nodes.length === 0) return;

    const svg = d3Selection.select(svgRef.current);
    const g = svg.select('g');
    if (g.empty()) return;

    setIsAnimating(true);
    setSelectedNode(null);

    // Collect all concept IDs involved in the traversal
    const allSteps = traversalPath.steps || [];
    if (allSteps.length === 0) { setIsAnimating(false); return; }

    // Build concept ID sets for each phase
    const phaseData = allSteps.map(step => {
      const conceptIds = new Set();
      const edgeIds = new Set();
      (step.nodesVisited || []).forEach(n => {
        if (n.subjectId) conceptIds.add(n.subjectId);
        if (n.objectId) conceptIds.add(n.objectId);
        edgeIds.add(n.id);
      });
      return { ...step, conceptIds, edgeIds };
    });

    // Phase 1: Dim everything
    svg.selectAll('.graph-node-group circle')
      .transition().duration(400)
      .attr('opacity', 0.08)
      .attr('stroke-width', 1.5);
    svg.selectAll('.graph-node-group text')
      .transition().duration(400)
      .attr('opacity', 0.05);
    svg.selectAll('.graph-link')
      .transition().duration(400)
      .attr('stroke-opacity', 0.03);
    svg.selectAll('.graph-link-label')
      .transition().duration(400)
      .attr('opacity', 0);

    // Remove old animation elements
    g.selectAll('.traversal-particle').remove();
    g.selectAll('.traversal-ripple').remove();
    g.selectAll('.traversal-glow').remove();

    // Create glow filter
    let defs = svg.select('defs');
    if (defs.empty()) defs = svg.append('defs');
    defs.selectAll('#glow').remove();
    const filter = defs.append('filter').attr('id', 'glow');
    filter.append('feGaussianBlur').attr('stdDeviation', '4').attr('result', 'coloredBlur');
    const merge = filter.append('feMerge');
    merge.append('feMergeNode').attr('in', 'coloredBlur');
    merge.append('feMergeNode').attr('in', 'SourceGraphic');

    // ── Phase animation config ──────────────────────────────────────
    const PHASE_CONFIG = {
      embedding_search: { color: '#3b82f6', label: 'Searching knowledge...', duration: 2500 },
      multi_hop: { color: '#f59e0b', label: 'Following connections...', duration: 2500 },
      selected: { color: '#22c55e', label: 'Found the answer', duration: 2000 },
    };
    const PHASE_GAP = 800; // pause between phases

    // Compute bounding box for a set of concept IDs
    function getClusterBounds(conceptIds) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      let count = 0;
      svg.selectAll('.graph-node-group').each(function(d) {
        if (conceptIds.has(d.id)) {
          minX = Math.min(minX, d.x); maxX = Math.max(maxX, d.x);
          minY = Math.min(minY, d.y); maxY = Math.max(maxY, d.y);
          count++;
        }
      });
      if (count === 0) return null;
      const padding = 80;
      return { minX: minX - padding, minY: minY - padding,
               maxX: maxX + padding, maxY: maxY + padding,
               cx: (minX + maxX) / 2, cy: (minY + maxY) / 2,
               width: maxX - minX + padding * 2, height: maxY - minY + padding * 2 };
    }

    // Auto-zoom to a cluster
    function zoomToCluster(conceptIds, duration = 1000) {
      const bounds = getClusterBounds(conceptIds);
      if (!bounds) return;
      const width = svgRef.current.clientWidth;
      const height = svgRef.current.clientHeight;
      const scale = Math.min(
        width / bounds.width,
        height / bounds.height,
        2.0 // max zoom
      ) * 0.85; // slight padding
      const tx = width / 2 - bounds.cx * scale;
      const ty = height / 2 - bounds.cy * scale;
      const zoom = d3Zoom.zoom().scaleExtent([0.1, 4]);
      svg.transition().duration(duration).ease(t => t * (2 - t)) // ease-out quad
        .call(zoom.transform, d3Zoom.zoomIdentity.translate(tx, ty).scale(scale));
    }

    // Phase label element
    const phaseLabel = g.append('text')
      .attr('class', 'traversal-phase-label')
      .attr('text-anchor', 'middle')
      .attr('font-size', '14px')
      .attr('font-weight', '600')
      .attr('opacity', 0)
      .attr('pointer-events', 'none');

    let totalDelay = 800; // initial dim delay

    phaseData.forEach((phase, phaseIdx) => {
      const config = PHASE_CONFIG[phase.phase] || PHASE_CONFIG.embedding_search;
      const phaseStart = totalDelay;
      const nodeCount = phase.conceptIds.size;
      const staggerDelay = Math.min(200, config.duration / (nodeCount + 1)); // stagger per node

      setTimeout(() => {
        // Auto-zoom to this phase's cluster
        zoomToCluster(phase.conceptIds, 800);

        // Update phase label
        const bounds = getClusterBounds(phase.conceptIds);
        if (bounds) {
          phaseLabel
            .attr('x', bounds.cx)
            .attr('y', bounds.minY - 10)
            .attr('fill', config.color)
            .text(config.label)
            .transition().duration(400)
            .attr('opacity', 0.9);
        }

        // Stagger node reveals
        let nodeIdx = 0;
        svg.selectAll('.graph-node-group').each(function(d) {
          if (phase.conceptIds.has(d.id)) {
            const node = d3Selection.select(this);
            const stagger = nodeIdx * staggerDelay;

            // Expanding ripple
            setTimeout(() => {
              const ripple = g.append('circle')
                .attr('class', 'traversal-ripple')
                .attr('cx', d.x).attr('cy', d.y)
                .attr('r', d.radius || 10)
                .attr('fill', 'none')
                .attr('stroke', config.color)
                .attr('stroke-width', 2.5)
                .attr('opacity', 0.9);

              ripple.transition().duration(1200).ease(t => Math.sqrt(t))
                .attr('r', (d.radius || 10) + 40)
                .attr('stroke-width', 0.5)
                .attr('opacity', 0)
                .remove();

              // Second ripple, delayed
              const ripple2 = g.append('circle')
                .attr('class', 'traversal-ripple')
                .attr('cx', d.x).attr('cy', d.y)
                .attr('r', d.radius || 10)
                .attr('fill', 'none')
                .attr('stroke', config.color)
                .attr('stroke-width', 1.5)
                .attr('opacity', 0.5);

              ripple2.transition().delay(300).duration(1400).ease(t => Math.sqrt(t))
                .attr('r', (d.radius || 10) + 55)
                .attr('opacity', 0)
                .remove();

              // Glow the node
              node.select('circle')
                .transition().duration(500).ease(t => t * (2 - t))
                .attr('opacity', 1)
                .attr('stroke', config.color)
                .attr('stroke-width', phase.phase === 'selected' ? 4 : 2.5)
                .attr('filter', 'url(#glow)');

              // Reveal label
              node.select('text')
                .transition().duration(500)
                .attr('opacity', 1)
                .attr('fill', phase.phase === 'selected' ? '#fff' : config.color);
            }, stagger);

            nodeIdx++;
          }
        });

        // Stagger edge reveals with particles
        let edgeIdx = 0;
        svg.selectAll('.graph-link').each(function(d) {
          if (phase.edgeIds.has(d.id)) {
            const stagger = edgeIdx * staggerDelay + 200;

            setTimeout(() => {
              // Glow the edge
              d3Selection.select(this)
                .transition().duration(600).ease(t => t * (2 - t))
                .attr('stroke', config.color)
                .attr('stroke-opacity', phase.phase === 'selected' ? 0.9 : 0.6)
                .attr('stroke-width', phase.phase === 'selected' ? 3.5 : 2);

              // Flowing particles along edge
              const source = typeof d.source === 'object' ? d.source : { x: 0, y: 0 };
              const target = typeof d.target === 'object' ? d.target : { x: 0, y: 0 };

              for (let p = 0; p < 5; p++) {
                const particle = g.append('circle')
                  .attr('class', 'traversal-particle')
                  .attr('r', phase.phase === 'selected' ? 4 : 2.5)
                  .attr('fill', config.color)
                  .attr('opacity', 0.95)
                  .attr('filter', 'url(#glow)')
                  .attr('cx', source.x)
                  .attr('cy', source.y);

                particle.transition()
                  .delay(p * 180)
                  .duration(900)
                  .ease(t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t) // ease-in-out quad
                  .attr('cx', target.x)
                  .attr('cy', target.y)
                  .transition().duration(300)
                  .attr('r', 1)
                  .attr('opacity', 0)
                  .remove();
              }

              // Trail line that fades
              const trail = g.append('line')
                .attr('class', 'traversal-ripple')
                .attr('x1', source.x).attr('y1', source.y)
                .attr('x2', source.x).attr('y2', source.y)
                .attr('stroke', config.color)
                .attr('stroke-width', 1.5)
                .attr('stroke-opacity', 0.4);

              trail.transition().duration(700)
                .attr('x2', target.x).attr('y2', target.y)
                .transition().duration(1500)
                .attr('stroke-opacity', 0)
                .remove();
            }, stagger);

            edgeIdx++;
          }
        });

        // Edge labels
        svg.selectAll('.graph-link-label').each(function(d) {
          if (phase.edgeIds.has(d.id)) {
            d3Selection.select(this)
              .transition().delay(300).duration(400)
              .attr('opacity', 0.9)
              .attr('fill', config.color)
              .attr('font-size', '10px');
          }
        });

        // Fade phase label before next phase
        setTimeout(() => {
          phaseLabel.transition().duration(400).attr('opacity', 0);
        }, config.duration - 400);

      }, phaseStart);

      totalDelay += config.duration + PHASE_GAP;
    });

    // Final: zoom out to show full graph with selected nodes glowing
    setTimeout(() => {
      // Gentle zoom out
      const zoom = d3Zoom.zoom().scaleExtent([0.1, 4]);
      svg.transition().duration(1500).ease(t => t * (2 - t))
        .call(zoom.transform, d3Zoom.zoomIdentity.translate(0, 0).scale(0.75));

      // Pulse selected nodes
      const selectedPhase = phaseData.find(p => p.phase === 'selected');
      if (selectedPhase) {
        svg.selectAll('.graph-node-group').each(function(d) {
          if (selectedPhase.conceptIds.has(d.id)) {
            const node = d3Selection.select(this);
            // Breathing pulse
            function pulseNode() {
              node.select('circle')
                .transition().duration(1200).ease(t => Math.sin(t * Math.PI))
                .attr('stroke-width', 5)
                .transition().duration(1200).ease(t => Math.sin(t * Math.PI))
                .attr('stroke-width', 3)
                .on('end', () => { if (isAnimating) pulseNode(); });
            }
            pulseNode();
          }
        });
      }

      phaseLabel.remove();

      setTimeout(() => {
        setIsAnimating(false);
        onTraversalComplete?.();
      }, 2000);
    }, totalDelay);

    return () => {
      g.selectAll('.traversal-particle').remove();
      g.selectAll('.traversal-ripple').remove();
    };
  }, [traversalPath, nodes]);

  return (
    <div className="knowledge-graph">
      {/* Scope navigation */}
      <ScopeBreadcrumbs
        sstTree={sstTree}
        activeScopeId={activeScopeId}
        onSelectScope={setActiveScopeId}
      />

      {/* Graph canvas */}
      <div className="graph-canvas-container">
        {graphLoading && nodes.length === 0 && (
          <div className="graph-loading">Loading graph...</div>
        )}

        {!graphLoading && nodes.length === 0 && (
          <div className="graph-empty">
            <p>No knowledge to visualize yet.</p>
            <p className="graph-empty-hint">Tell Raven something to get started.</p>
          </div>
        )}

        <svg ref={svgRef} className="graph-svg" />

        {/* Traversal animation overlay */}
        {isAnimating && (
          <div className="graph-traversal-status">
            <div className="traversal-pulse" />
            <span>Traversing knowledge graph...</span>
          </div>
        )}

        {/* Hover tooltip */}
        {hoveredNode && !selectedNode && (
          <div className="graph-tooltip">
            <strong>{hoveredNode.name}</strong>
            <span className="tooltip-type" style={{ color: getNodeColor(hoveredNode.type) }}>
              {hoveredNode.type}
            </span>
            <span className="tooltip-stats">
              {hoveredNode.connectionCount} connections
            </span>
          </div>
        )}

        {/* Stats bar */}
        {nodes.length > 0 && (
          <div className="graph-stats">
            <span>{nodes.length} concepts</span>
            <span>{edges.length} connections</span>
            {activeScopeId && (
              <button className="graph-stats-reset" onClick={() => setActiveScopeId(null)}>
                Show all
              </button>
            )}
          </div>
        )}
      </div>

      {/* Detail panel */}
      <NodeDetail
        node={selectedNode}
        edges={edges}
        allNodes={nodes}
        onClose={() => setSelectedNode(null)}
      />
    </div>
  );
}
