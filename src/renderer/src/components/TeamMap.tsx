import { useMemo } from 'react';
import dagre from '@dagrejs/dagre';
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps
} from '@xyflow/react';
import clsx from 'clsx';
import type { AgentConfig } from '@shared/types';
import type { EdgeActivity } from '@/lib/runActivity';
import { ChatView } from './ChatView';
import { getAgentIcon } from './AgentIconPicker';

const NODE_WIDTH = 224;
const NODE_HEIGHT = 92;

interface AgentNodeData extends Record<string, unknown> {
  agent: AgentConfig;
  selected: boolean;
  working: boolean;
}

function roleLabel(role: AgentConfig['role']): string {
  if (role === 'team-lead') return 'Team lead';
  return role[0].toUpperCase() + role.slice(1);
}

function AgentNode({ data }: NodeProps<Node<AgentNodeData>>) {
  const { agent, selected, working } = data;
  return (
    <div
      className={clsx(
        'relative w-[224px] h-[92px] rounded-lg border bg-surface px-3 py-2.5 shadow-lg transition-colors',
        working
          ? 'border-neon shadow-neon'
          : selected
            ? 'border-neon shadow-neon-sm'
            : 'border-border hover:border-borderStrong'
      )}
    >
      {working && (
        <span
          className="absolute right-2.5 top-2.5 flex h-2.5 w-2.5"
          role="status"
          aria-label={`${agent.name} is working`}
          title="Working"
        >
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-neon opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-neon" />
        </span>
      )}
      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-content-faint !border-0" />
      <div className="flex items-center gap-3 h-full">
        <div
          className={clsx(
            'w-11 h-11 shrink-0 rounded-lg grid place-items-center text-lg border',
            agent.role === 'orchestrator'
              ? 'bg-neon/15 text-neon border-neon/40'
              : agent.role === 'team-lead'
                ? 'bg-white/10 text-content border-borderStrong'
                : 'bg-white/5 text-content-muted border-border'
          )}
        >
          {getAgentIcon(agent.icon, agent.role)}
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-sm truncate">{agent.name}</div>
          <div className="text-[11px] text-content-muted truncate">{agent.title}</div>
          <div className="text-[10px] text-content-faint mt-1">{roleLabel(agent.role)}</div>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-neon !border-0" />
    </div>
  );
}

const nodeTypes = { agent: AgentNode };

function layoutTeam(
  agents: AgentConfig[],
  selectedId: string | null,
  workingAgentIds: ReadonlySet<string>,
  edgeActivity: ReadonlyMap<string, EdgeActivity>
): { nodes: Node<AgentNodeData>[]; edges: Edge[] } {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: 'TB', ranksep: 72, nodesep: 40, marginx: 32, marginy: 32 });
  agents.forEach((agent) => graph.setNode(agent.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));
  agents.forEach((agent) => {
    if (agent.reportsTo && agents.some((candidate) => candidate.id === agent.reportsTo)) {
      graph.setEdge(agent.reportsTo, agent.id);
    }
  });
  dagre.layout(graph);

  const nodes = agents.map<Node<AgentNodeData>>((agent) => {
    const position = graph.node(agent.id) as { x: number; y: number };
    return {
      id: agent.id,
      type: 'agent',
      position: { x: position.x - NODE_WIDTH / 2, y: position.y - NODE_HEIGHT / 2 },
      data: { agent, selected: agent.id === selectedId, working: workingAgentIds.has(agent.id) },
      draggable: false
    };
  });
  const edges = agents
    .filter((agent) => agent.reportsTo && agents.some((candidate) => candidate.id === agent.reportsTo))
    .map<Edge>((agent) => ({
      id: `${agent.reportsTo}-${agent.id}`,
      source: agent.reportsTo!,
      target: agent.id,
      type: 'smoothstep',
      className: edgeActivity.has(`${agent.reportsTo}-${agent.id}`)
        ? `team-edge-active team-edge-${edgeActivity.get(`${agent.reportsTo}-${agent.id}`)!.direction}`
        : undefined,
      style: {
        stroke:
          edgeActivity.has(`${agent.reportsTo}-${agent.id}`) ||
          agent.id === selectedId ||
          agent.reportsTo === selectedId
            ? 'var(--color-neon)'
            : 'var(--color-borderStrong)',
        strokeWidth:
          edgeActivity.has(`${agent.reportsTo}-${agent.id}`) ||
          agent.id === selectedId ||
          agent.reportsTo === selectedId
            ? 2
            : 1
      }
    }));
  return { nodes, edges };
}

export function TeamMap({
  agents,
  selectedId,
  workingAgentIds,
  edgeActivity,
  onSelect,
  onConfigure
}: {
  agents: AgentConfig[];
  selectedId: string | null;
  workingAgentIds: ReadonlySet<string>;
  edgeActivity: ReadonlyMap<string, EdgeActivity>;
  onSelect: (id: string) => void;
  onConfigure: (id: string) => void;
}) {
  const { nodes, edges } = useMemo(
    () => layoutTeam(agents, selectedId, workingAgentIds, edgeActivity),
    [agents, selectedId, workingAgentIds, edgeActivity]
  );
  const selected = agents.find((agent) => agent.id === selectedId) ?? null;
  const manager = selected?.reportsTo ? agents.find((agent) => agent.id === selected.reportsTo) : null;

  if (agents.length === 0) {
    return <div className="flex-1 grid place-items-center text-sm text-content-faint">Create an orchestrator to begin the team map.</div>;
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col min-[1200px]:flex-row">
      <div className="flex-1 min-w-0 min-h-[210px]">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.35}
          maxZoom={1.6}
          nodesConnectable={false}
          nodesDraggable={false}
          onNodeClick={(_event, node) => onSelect(node.id)}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={22} size={1} color="var(--color-border)" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      {selected && (
        <aside className="h-[48%] min-h-[240px] shrink-0 border-t border-border bg-overlay/40 flex flex-col min-[1200px]:h-auto min-[1200px]:min-h-0 min-[1200px]:w-[360px] min-[1200px]:border-l min-[1200px]:border-t-0">
          <div className="px-4 py-3 border-b border-border flex items-center gap-3">
            <div className="w-10 h-10 shrink-0 rounded-lg bg-neon/10 border border-neon/30 text-neon grid place-items-center text-lg">
              {getAgentIcon(selected.icon, selected.role)}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold truncate">{selected.name}</h2>
              <p className="text-[11px] text-content-muted truncate">
                {roleLabel(selected.role)} · {manager ? `Reports to ${manager.name}` : 'Team root'}
              </p>
            </div>
            <button className="btn-outline !px-2.5 !py-1.5 text-xs" onClick={() => onConfigure(selected.id)}>
              Configure
            </button>
          </div>
          <ChatView compact />
        </aside>
      )}
    </div>
  );
}