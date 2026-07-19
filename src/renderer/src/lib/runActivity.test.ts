import { describe, expect, it } from 'vitest';
import type { RunStatus, RunView } from '@shared/types';
import type { RunEvent } from '@shared/types';
import {
  getActiveDelegationActivity,
  getEdgeActivity,
  getWorkingAgentIds,
  mergeDelegationActivity,
  mergeRunActivity
} from './runActivity';

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

  it('derives only the authoritative nested hierarchy path and reverses it for replies', () => {
    const childRun = {
      ...run('child', 'samuel', 'running', 2),
      parentRunId: 'lead-run',
      rootRunId: 'root-run',
      depth: 2
    };
    let branches = mergeDelegationActivity(new Map(), {
      type: 'delegation',
      run: childRun,
      direction: 'outbound',
      agentPath: ['jennifer', 'lta', 'samuel']
    });

    expect([...getEdgeActivity(branches)]).toEqual([
      ['jennifer-lta', { direction: 'outbound', branchRunIds: ['child'] }],
      ['lta-samuel', { direction: 'outbound', branchRunIds: ['child'] }]
    ]);
    expect(getEdgeActivity(branches).has('jennifer-bob')).toBe(false);

    branches = mergeDelegationActivity(branches, {
      type: 'delegation',
      run: { ...childRun, status: 'completed', updatedAt: 3 },
      direction: 'inbound',
      agentPath: ['jennifer', 'lta', 'samuel']
    });
    expect(getEdgeActivity(branches).get('jennifer-lta')?.direction).toBe('inbound');
    expect(getEdgeActivity(branches).get('lta-samuel')?.direction).toBe('inbound');
  });

  it('keeps concurrent branches independent and clears failed branches or a completed root', () => {
    const events: RunEvent[] = [
      {
        type: 'delegation',
        run: { ...run('lta-run', 'lta', 'running', 2), parentRunId: 'root-run', rootRunId: 'root-run' },
        direction: 'outbound',
        agentPath: ['jennifer', 'lta']
      },
      {
        type: 'delegation',
        run: { ...run('bob-run', 'bob', 'running', 2), parentRunId: 'root-run', rootRunId: 'root-run' },
        direction: 'outbound',
        agentPath: ['jennifer', 'bob']
      }
    ];
    let branches = events.reduce(mergeDelegationActivity, new Map<string, never>());
    branches = mergeDelegationActivity(branches, {
      type: 'state',
      run: { ...run('bob-run', 'bob', 'failed', 3), parentRunId: 'root-run', rootRunId: 'root-run' }
    });
    expect([...getEdgeActivity(branches).keys()]).toEqual(['jennifer-lta']);

    branches = mergeDelegationActivity(branches, {
      type: 'state',
      run: { ...run('root-run', 'jennifer', 'completed', 4), parentRunId: null, rootRunId: 'root-run' }
    });
    expect(branches.size).toBe(0);
  });

  it('restores an active nested path from run lineage without selected-agent state', () => {
    const root = { ...run('root', 'jennifer', 'running', 2), parentRunId: null, rootRunId: 'root' };
    const lead = { ...run('lead', 'lta', 'running', 2), parentRunId: root.id, rootRunId: root.id };
    const child = { ...run('child', 'samuel', 'running', 2), parentRunId: lead.id, rootRunId: root.id };

    expect(getActiveDelegationActivity([root, lead, child]).get(child.id)?.agentPath).toEqual([
      'jennifer',
      'lta',
      'samuel'
    ]);
  });

  it('marks a shared ancestor edge bidirectional for concurrent opposite phases', () => {
    const branches = new Map([
      [
        'samuel-run',
        {
          branchRunId: 'samuel-run',
          rootRunId: 'root',
          agentPath: ['jennifer', 'lta', 'samuel'],
          direction: 'inbound' as const
        }
      ],
      [
        'alex-run',
        {
          branchRunId: 'alex-run',
          rootRunId: 'root',
          agentPath: ['jennifer', 'lta', 'alex'],
          direction: 'outbound' as const
        }
      ]
    ]);

    expect(getEdgeActivity(branches).get('jennifer-lta')).toEqual({
      direction: 'both',
      branchRunIds: ['samuel-run', 'alex-run']
    });
  });
});