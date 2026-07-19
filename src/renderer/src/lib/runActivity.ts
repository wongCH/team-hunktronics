import type { RunEvent, RunStatus, RunView } from '@shared/types';

export interface DelegationActivity {
  branchRunId: string;
  rootRunId: string;
  agentPath: string[];
  direction: 'outbound' | 'inbound';
}

export interface EdgeActivity {
  direction: 'outbound' | 'inbound' | 'both';
  branchRunIds: string[];
}

const STATUS_ORDER: Record<RunStatus, number> = {
  queued: 0,
  running: 1,
  completed: 2,
  failed: 2,
  cancelled: 2
};

export function mergeRunActivity(
  current: ReadonlyMap<string, RunView>,
  incoming: readonly RunView[]
): Map<string, RunView> {
  const next = new Map(current);
  incoming.forEach((run) => {
    const existing = next.get(run.id);
    if (
      !existing ||
      run.updatedAt > existing.updatedAt ||
      (run.updatedAt === existing.updatedAt && STATUS_ORDER[run.status] >= STATUS_ORDER[existing.status])
    ) {
      next.set(run.id, run);
    }
  });
  return next;
}

export function getWorkingAgentIds(runs: ReadonlyMap<string, RunView>): Set<string> {
  const agentIds = new Set<string>();
  runs.forEach((run) => {
    if (run.agentId && (run.status === 'queued' || run.status === 'running')) {
      agentIds.add(run.agentId);
    }
  });
  return agentIds;
}

export function mergeDelegationActivity(
  current: ReadonlyMap<string, DelegationActivity>,
  event: RunEvent
): Map<string, DelegationActivity> {
  const next = new Map(current);
  if (event.type === 'delegation') {
    next.set(event.run.id, {
      branchRunId: event.run.id,
      rootRunId: event.run.rootRunId ?? event.run.id,
      agentPath: event.agentPath,
      direction: event.direction
    });
    return next;
  }
  if (event.type !== 'state' || !['completed', 'failed', 'cancelled'].includes(event.run.status)) {
    return next;
  }
  if (!event.run.parentRunId) {
    next.forEach((activity, branchRunId) => {
      if (activity.rootRunId === (event.run.rootRunId ?? event.run.id)) next.delete(branchRunId);
    });
  } else {
    next.delete(event.run.id);
  }
  return next;
}

export function getEdgeActivity(
  branches: ReadonlyMap<string, DelegationActivity>
): Map<string, EdgeActivity> {
  const edges = new Map<string, EdgeActivity>();
  branches.forEach((branch) => {
    for (let index = 1; index < branch.agentPath.length; index += 1) {
      const edgeId = `${branch.agentPath[index - 1]}-${branch.agentPath[index]}`;
      const current = edges.get(edgeId);
      edges.set(edgeId, {
        direction:
          current && current.direction !== branch.direction ? 'both' : current?.direction ?? branch.direction,
        branchRunIds: [...(current?.branchRunIds ?? []), branch.branchRunId]
      });
    }
  });
  return edges;
}

export function getActiveDelegationActivity(
  runs: readonly RunView[]
): Map<string, DelegationActivity> {
  const byId = new Map(runs.map((run) => [run.id, run]));
  const branches = new Map<string, DelegationActivity>();
  runs.forEach((run) => {
    if (!run.parentRunId || !run.agentId) return;
    const agentPath: string[] = [];
    let current: RunView | undefined = run;
    while (current) {
      if (current.agentId) agentPath.unshift(current.agentId);
      current = current.parentRunId ? byId.get(current.parentRunId) : undefined;
    }
    if (agentPath.length < 2) return;
    branches.set(run.id, {
      branchRunId: run.id,
      rootRunId: run.rootRunId ?? run.id,
      agentPath,
      direction: 'outbound'
    });
  });
  return branches;
}