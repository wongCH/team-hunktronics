import type { RunStatus, RunView } from '@shared/types';

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