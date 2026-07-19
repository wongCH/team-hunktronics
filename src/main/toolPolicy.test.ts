import { describe, expect, it, vi } from 'vitest';
import type { AgentConfig, Approval, ToolAction } from '@shared/types';
import { ToolPolicyBroker } from './toolPolicy';

function agent(autonomy: AgentConfig['autonomy'], tools = ['http']): AgentConfig {
  return {
    id: 'agent', name: 'Agent', title: 'Specialist', role: 'specialist', reportsTo: 'root',
    connectionId: null, model: null, soul: '', tools, skills: [], autonomy, delegatesTo: [],
    createdAt: 1, updatedAt: 1
  };
}

describe('ToolPolicyBroker', () => {
  it('denies ungranted tools and redacts sensitive arguments', async () => {
    const actions: ToolAction[] = [];
    const broker = new ToolPolicyBroker({
      getAgent: async () => agent('autonomous', []), saveAction: async (action) => { actions.push(action); },
      getApproval: async () => undefined, saveApproval: async () => undefined,
      createId: () => 'action', now: () => 1
    });
    const { action } = await broker.authorize({ agentId: 'agent', toolId: 'http', sideEffect: 'external', arguments: { url: 'https://example.com', apiKey: 'secret' } });
    expect(action).toMatchObject({ status: 'denied', sanitizedArguments: { url: 'https://example.com', apiKey: '[REDACTED]' } });
    expect(JSON.stringify(actions)).not.toContain('secret');
  });

  it('auto-approves read-only or granted autonomous actions', async () => {
    const saveAction = vi.fn();
    const broker = new ToolPolicyBroker({ getAgent: async () => agent('autonomous'), saveAction, getApproval: async () => undefined, saveApproval: async () => undefined });
    expect((await broker.authorize({ agentId: 'agent', toolId: 'http', sideEffect: 'external', arguments: {} })).action.status).toBe('approved');
    const draftBroker = new ToolPolicyBroker({ getAgent: async () => agent('draft'), saveAction, getApproval: async () => undefined, saveApproval: async () => undefined });
    expect((await draftBroker.authorize({ agentId: 'agent', toolId: 'http', sideEffect: 'none', arguments: {} })).action.status).toBe('approved');
  });

  it('creates and decides approvals for draft and assist side effects', async () => {
    let approval: Approval | undefined;
    const broker = new ToolPolicyBroker({
      getAgent: async () => agent('assist'), saveAction: async () => undefined,
      getApproval: async () => approval, saveApproval: async (value) => { approval = value; },
      createId: vi.fn().mockReturnValueOnce('action').mockReturnValueOnce('approval'), now: () => 100
    });
    const result = await broker.authorize({ agentId: 'agent', toolId: 'http', sideEffect: 'external', arguments: {} });
    expect(result.action).toMatchObject({ status: 'awaiting-approval', approvalId: 'approval' });
    expect(await broker.decide('approval', true)).toMatchObject({ status: 'approved', decidedAt: 100 });
  });
});