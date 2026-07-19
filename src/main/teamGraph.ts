import type { AgentConfig, AgentRole } from '@shared/types';

type LegacyAgent = Omit<AgentConfig, 'role' | 'reportsTo'> & {
  role: AgentRole | 'worker';
  reportsTo?: string | null;
};

export function normalizeTeam(input: LegacyAgent[]): AgentConfig[] {
  const migrated = input.map((agent) => ({
    ...agent,
    role: agent.role === 'worker' ? ('specialist' as const) : agent.role,
    reportsTo: agent.reportsTo ?? null
  }));
  const root = migrated.find((agent) => agent.role === 'orchestrator');

  const withManagers = migrated.map((agent) => {
    if (agent.role === 'orchestrator' || agent.reportsTo) return agent;
    const legacyManager = migrated.find((candidate) => candidate.delegatesTo.includes(agent.id));
    return { ...agent, reportsTo: legacyManager?.id ?? root?.id ?? null };
  });

  return withManagers.map((agent) => ({
    ...agent,
    delegatesTo: withManagers
      .filter((candidate) => candidate.reportsTo === agent.id)
      .map((candidate) => candidate.id)
  }));
}

export function validateTeam(agents: AgentConfig[]): void {
  const active = agents.filter((agent) => !agent.archived);
  if (active.length === 0) return;

  const roots = active.filter((agent) => agent.role === 'orchestrator');
  if (roots.length !== 1) throw new Error('An active team must have exactly one orchestrator.');
  const root = roots[0];
  if (root.reportsTo !== null) throw new Error('The orchestrator cannot report to another agent.');

  const byId = new Map(active.map((agent) => [agent.id, agent]));
  for (const agent of active) {
    if (agent.role === 'specialist' && agent.tools.includes('code')) {
      throw new Error('Specialists cannot receive the code execution tool. Delegate execution to a lead.');
    }
    if (agent.id === root.id) continue;
    if (!agent.reportsTo) throw new Error(`${agent.name} must report to an active manager.`);
    const manager = byId.get(agent.reportsTo);
    if (!manager) throw new Error(`${agent.name} reports to an unknown or archived manager.`);
    if (manager.role === 'specialist') throw new Error('Specialists cannot manage other agents.');

    const seen = new Set([agent.id]);
    let current: AgentConfig | undefined = agent;
    let depth = 1;
    while (current.reportsTo) {
      if (seen.has(current.reportsTo)) throw new Error('Agent hierarchy cannot contain a cycle.');
      seen.add(current.reportsTo);
      current = byId.get(current.reportsTo);
      if (!current) break;
      depth += 1;
    }
    if (depth > 3) throw new Error('Agent hierarchy cannot exceed three levels.');
  }
}