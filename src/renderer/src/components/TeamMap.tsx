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
  workingAgentIds: ReadonlySet<string>
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
      animated: workingAgentIds.has(agent.id) || workingAgentIds.has(agent.reportsTo!),
      style: {
        stroke:
          workingAgentIds.has(agent.id) ||
          workingAgentIds.has(agent.reportsTo!) ||
          agent.id === selectedId ||
          agent.reportsTo === selectedId
            ? 'var(--color-neon)'
            : 'var(--color-borderStrong)',
        strokeWidth:
          workingAgentIds.has(agent.id) ||
          workingAgentIds.has(agent.reportsTo!) ||
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
  onSelect,
  onConfigure
}: {
  agents: AgentConfig[];
  selectedId: string | null;
  workingAgentIds: ReadonlySet<string>;
  onSelect: (id: string) => void;
  onConfigure: (id: string) => void;
}) {
  const { nodes, edges } = useMemo(
    () => layoutTeam(agents, selectedId, workingAgentIds),
    [agents, selectedId, workingAgentIds]
  );
  const selected = agents.find((agent) => agent.id === selectedId) ?? null;
  const manager = selected?.reportsTo ? agents.find((agent) => agent.id === selected.reportsTo) : null;
  const reports = selected ? agents.filter((agent) => agent.reportsTo === selected.id) : [];

  if (agents.length === 0) {
    return <div className="flex-1 grid place-items-center text-sm text-content-faint">Create an orchestrator to begin the team map.</div>;
  }

  return (
    <div className="flex-1 min-h-0 flex">
      <div className="flex-1 min-w-0">
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
        <aside className="w-72 shrink-0 border-l border-border bg-overlay/40 p-5 overflow-y-auto">
          <div className="w-12 h-12 rounded-lg bg-neon/10 border border-neon/30 text-neon grid place-items-center text-xl mb-4">
            {getAgentIcon(selected.icon, selected.role)}
          </div>
          <h2 className="text-lg font-semibold">{selected.name}</h2>
          <p className="text-sm text-content-muted">{selected.title}</p>
          <span className="chip mt-3 capitalize">{roleLabel(selected.role)}</span>

          <dl className="mt-6 space-y-4 text-xs">
            <div>
              <dt className="text-content-faint uppercase tracking-wider mb-1">Reports to</dt>
              <dd>{manager?.name ?? 'Team root'}</dd>
            </div>
            <div>
              <dt className="text-content-faint uppercase tracking-wider mb-1">Direct reports</dt>
              <dd>{reports.length ? reports.map((report) => report.name).join(', ') : 'None'}</dd>
            </div>
            <div>
              <dt className="text-content-faint uppercase tracking-wider mb-1">Tools</dt>
              <dd>{selected.tools.length ? selected.tools.join(', ') : 'No tools assigned'}</dd>
            </div>
            <div>
              <dt className="text-content-faint uppercase tracking-wider mb-1">Autonomy</dt>
              <dd className="capitalize">{selected.autonomy}</dd>
            </div>
          </dl>
          <button className="btn-primary w-full mt-6" onClick={() => onConfigure(selected.id)}>
            Configure agent
          </button>
        </aside>
      )}
    </div>
  );
}