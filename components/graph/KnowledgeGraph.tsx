'use client'

import { useState, useCallback, useEffect } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  BackgroundVariant,
  MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { apiGet, apiPost } from '@/lib/api'
import { KGNodeComponent, type KGFlowNode } from './KGNode'
import { KGEdgeComponent, type KGFlowEdge } from './KGEdge'
import { NodeDetailPanel } from './NodeDetailPanel'
import type { KgNode as PrismaKgNode, KgEdge as PrismaKgEdge } from '@prisma/client'

const nodeTypes = { kgNode: KGNodeComponent }
const edgeTypes = { kgEdge: KGEdgeComponent }

function toFlowNode(n: PrismaKgNode & { childCount?: number }): KGFlowNode {
  return {
    id: n.id,
    type: 'kgNode',
    position: { x: Math.random() * 600, y: Math.random() * 400 },
    data: {
      label: n.name,
      type: n.type,
      description: n.description ?? undefined,
      mentionCount: n.mentionCount,
      childCount: n.childCount ?? 0,
      scaleLevel: n.scaleLevel,
    },
  }
}

function toFlowEdge(e: PrismaKgEdge): KGFlowEdge {
  return {
    id: e.id,
    source: e.sourceNodeId,
    target: e.targetNodeId,
    type: 'kgEdge',
    markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12 },
    data: {
      relationship: e.relationship,
      contextConditions: e.contextConditions as Array<{ tag: string }> | undefined,
      weight: e.weight,
    },
  }
}

interface Props {
  teamId: string
  scopeId?: string
}

export function KnowledgeGraph({ teamId, scopeId }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState<KGFlowNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<KGFlowEdge>([])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [parentStack, setParentStack] = useState<Array<{ id: string; name: string }>>([])
  const [loading, setLoading] = useState(true)

  const currentParentId = parentStack[parentStack.length - 1]?.id ?? null

  const loadGraph = useCallback(async (parentNodeId: string | null) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ teamId })
      if (parentNodeId) params.set('parentNodeId', parentNodeId)
      const data = await apiGet<{ nodes: PrismaKgNode[]; edges: PrismaKgEdge[] }>(`/api/graph?${params}`)
      setNodes(data.nodes.map(toFlowNode))
      setEdges(data.edges.map(toFlowEdge))
    } catch (err) {
      console.error('[graph] Load error:', err)
    } finally {
      setLoading(false)
    }
  }, [teamId, setNodes, setEdges])

  useEffect(() => {
    loadGraph(currentParentId)
  }, [loadGraph, currentParentId])

  const onConnect = useCallback(async (params: Connection) => {
    if (!params.source || !params.target) return
    try {
      const edge = await apiPost<PrismaKgEdge>('/api/graph', {
        type: 'edge',
        teamId,
        sourceNodeId: params.source,
        targetNodeId: params.target,
        relationship: 'RELATED_TO',
      })
      setEdges((eds) => addEdge(toFlowEdge(edge), eds))
    } catch (err) {
      console.error('[graph] Create edge error:', err)
    }
  }, [teamId, setEdges])

  function drillIntoNode(nodeId: string) {
    const node = nodes.find((n) => n.id === nodeId)
    if (!node) return
    setParentStack((prev) => [...prev, { id: nodeId, name: node.data.label }])
    setSelectedNodeId(null)
  }

  function drillBack() {
    setParentStack((prev) => prev.slice(0, -1))
    setSelectedNodeId(null)
  }

  return (
    <div className="relative w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_, node) => setSelectedNodeId(node.id)}
        onPaneClick={() => setSelectedNodeId(null)}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="hsl(var(--border))" />
        <Controls showInteractive={false} />
        <MiniMap nodeColor={() => 'hsl(var(--muted))'} maskColor="hsl(var(--background) / 0.8)" />
      </ReactFlow>

      {parentStack.length > 0 && (
        <div className="absolute top-4 left-4 flex items-center gap-1.5 bg-card border border-border rounded-lg px-3 py-1.5 shadow text-xs z-10">
          <button onClick={() => setParentStack([])} className="text-muted-foreground hover:text-foreground">Root</button>
          {parentStack.map((item, i) => (
            <span key={item.id} className="flex items-center gap-1.5">
              <span className="text-muted-foreground/40">/</span>
              <button
                onClick={() => setParentStack((prev) => prev.slice(0, i + 1))}
                className={i === parentStack.length - 1 ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'}
              >
                {item.name}
              </button>
            </span>
          ))}
          <button onClick={drillBack} className="ml-2 text-muted-foreground hover:text-foreground">← Back</button>
        </div>
      )}

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
          <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div className="text-center">
            <p className="text-sm font-medium text-foreground mb-1">Knowledge graph is empty</p>
            <p className="text-xs text-muted-foreground">Tell Raven something to start building your graph.</p>
          </div>
        </div>
      )}

      <NodeDetailPanel nodeId={selectedNodeId} onClose={() => setSelectedNodeId(null)} onDrillIn={drillIntoNode} />
    </div>
  )
}
