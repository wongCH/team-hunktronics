import { describe, expect, it } from 'vitest';
import type { AgentConfig } from '@shared/types';
import { normalizeTeam, validateTeam } from './teamGraph';

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

describe('team graph', () => {
  it('migrates workers and derives direct reports from one canonical edge', () => {
    const team = normalizeTeam([
      agent({ delegatesTo: ['legacy-worker'] }),
      { ...agent({ id: 'legacy-worker', name: 'Legacy', role: 'specialist' }), role: 'worker' } as never
    ]);

    expect(team[1]).toMatchObject({ role: 'specialist', reportsTo: 'root' });
    expect(team[0].delegatesTo).toEqual(['legacy-worker']);
    validateTeam(team);
  });

  it('accepts an orchestrator, lead, and specialist at depth three', () => {
    const team = normalizeTeam([
      agent({}),
      agent({ id: 'lead', name: 'Lead', role: 'team-lead', reportsTo: 'root' }),
      agent({ id: 'leaf', name: 'Leaf', role: 'specialist', reportsTo: 'lead' })
    ]);
    expect(() => validateTeam(team)).not.toThrow();
  });

  it('rejects multiple roots, cycles, specialist managers, and depth above three', () => {
    expect(() => validateTeam([agent({}), agent({ id: 'other' })])).toThrow(/exactly one/i);
    expect(() =>
      validateTeam([
        agent({}),
        agent({ id: 'a', role: 'team-lead', reportsTo: 'b' }),
        agent({ id: 'b', role: 'team-lead', reportsTo: 'a' })
      ])
    ).toThrow(/cycle/i);
    expect(() =>
      validateTeam([
        agent({}),
        agent({ id: 'leaf', role: 'specialist', reportsTo: 'root' }),
        agent({ id: 'child', role: 'specialist', reportsTo: 'leaf' })
      ])
    ).toThrow(/specialists cannot manage/i);
    expect(() =>
      validateTeam([
        agent({}),
        agent({ id: 'lead', role: 'team-lead', reportsTo: 'root' }),
        agent({ id: 'nested-lead', role: 'team-lead', reportsTo: 'lead' }),
        agent({ id: 'leaf', role: 'specialist', reportsTo: 'nested-lead' })
      ])
    ).toThrow(/three levels/i);
  });

  it('denies code execution grants to specialists', () => {
    expect(() =>
      validateTeam([
        agent({}),
        agent({
          id: 'leaf',
          role: 'specialist',
          reportsTo: 'root',
          tools: ['read', 'code']
        })
      ])
    ).toThrow(/code execution tool/i);
  });
});