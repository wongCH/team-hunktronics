import { describe, expect, it } from 'vitest';
import type { AgentConfig } from '@shared/types';
import { selectVisibleAgents } from '@/lib/teamMapLayout';

function agent(id: string, role: AgentConfig['role'], reportsTo: string | null): AgentConfig {
  return {
    id,
    name: id,
    title: role,
    role,
    reportsTo,
    connectionId: null,
    model: null,
    soul: '',
    capabilities: id,
    tools: [],
    skills: [],
    autonomy: 'draft',
    delegatesTo: [],
    createdAt: 1,
    updatedAt: 1
  };
}

describe('selectVisibleAgents', () => {
  it.each([100, 250, 1_000])('shows only the selected branch for %i agents', (count) => {
    const root = agent('root', 'orchestrator', null);
    const leads = Array.from({ length: 10 }, (_, index) =>
      agent(`lead-${index}`, 'team-lead', root.id)
    );
    const specialists = Array.from({ length: count - 11 }, (_, index) =>
      agent(`specialist-${index}`, 'specialist', leads[index % leads.length].id)
    );
    const team = [root, ...leads, ...specialists];
    const selected = specialists.find((candidate) => candidate.reportsTo === leads[3].id)!;
    const visible = selectVisibleAgents(team, selected.id);

    expect(visible).toContain(root);
    expect(visible).toContain(selected);
    expect(visible.filter((candidate) => candidate.role === 'team-lead')).toHaveLength(10);
    expect(visible.length).toBeLessThanOrEqual(61);
    expect(
      visible
        .filter((candidate) => candidate.role === 'specialist')
        .every((candidate) => candidate.reportsTo === leads[3].id)
    ).toBe(true);
  });
});
