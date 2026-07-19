import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentConfig } from '@shared/types';

const mocks = vi.hoisted(() => ({
  saveAgent: vi.fn()
}));

vi.mock('@/lib/api', () => ({
  api: {
    agents: {
      save: mocks.saveAgent
    }
  }
}));

import { useAgentStore } from './useAgentStore';

function agent(overrides: Partial<AgentConfig>): AgentConfig {
  return {
    id: 'root',
    name: 'Root',
    title: 'Orchestrator',
    role: 'orchestrator',
    reportsTo: null,
    connectionId: null,
    model: null,
    soul: '',
    tools: [],
    skills: [],
    autonomy: 'draft',
    delegatesTo: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  };
}

describe('useAgentStore', () => {
  beforeEach(() => {
    mocks.saveAgent.mockReset();
    useAgentStore.setState({ agents: [], selectedId: null, loaded: false });
  });

  it('creates a sub-agent under the selected manager', async () => {
    const root = agent({});
    const lead = agent({
      id: 'lead',
      name: 'Lead',
      role: 'team-lead',
      reportsTo: root.id
    });
    useAgentStore.setState({ agents: [root, lead], loaded: true });
    mocks.saveAgent.mockImplementation(async (created: AgentConfig) => [root, lead, created]);

    const created = await useAgentStore.getState().createAgent({
      role: 'specialist',
      name: 'Researcher',
      reportsTo: lead.id
    });

    expect(created).toMatchObject({
      name: 'Researcher',
      role: 'specialist',
      reportsTo: lead.id
    });
    expect(mocks.saveAgent).toHaveBeenCalledWith(created);
  });
});
