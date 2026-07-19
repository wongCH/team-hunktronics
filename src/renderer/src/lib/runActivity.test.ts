import { describe, expect, it } from 'vitest';
import type { RunStatus, RunView } from '@shared/types';
import { getWorkingAgentIds, mergeRunActivity } from './runActivity';

function run(id: string, agentId: string, status: RunStatus, updatedAt: number): RunView {
  return {
    id,
    streamId: `stream-${id}`,
    idempotencyKey: `request-${id}`,
    conversationId: `conversation-${id}`,
    agentId,
    connectionId: 'connection-1',
    model: 'model-1',
    status,
    error: null,
    createdAt: 1,
    updatedAt
  };
}

describe('run activity', () => {
  it('tracks concurrent work until every run for an agent is terminal', () => {
    let activity = mergeRunActivity(
      new Map(),
      [run('a', 'agent-1', 'running', 2), run('b', 'agent-1', 'queued', 2), run('c', 'agent-2', 'running', 2)]
    );
    expect([...getWorkingAgentIds(activity)].sort()).toEqual(['agent-1', 'agent-2']);

    activity = mergeRunActivity(activity, [run('a', 'agent-1', 'completed', 3)]);
    expect([...getWorkingAgentIds(activity)].sort()).toEqual(['agent-1', 'agent-2']);

    activity = mergeRunActivity(activity, [run('b', 'agent-1', 'failed', 3), run('c', 'agent-2', 'cancelled', 3)]);
    expect(getWorkingAgentIds(activity).size).toBe(0);
  });

  it('does not let an older snapshot overwrite a terminal event', () => {
    const terminal = mergeRunActivity(new Map(), [run('a', 'agent-1', 'completed', 2)]);
    const merged = mergeRunActivity(terminal, [run('a', 'agent-1', 'running', 2)]);

    expect(merged.get('a')?.status).toBe('completed');
    expect(getWorkingAgentIds(merged).size).toBe(0);
  });
});