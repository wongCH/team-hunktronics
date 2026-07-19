import type { AgentConfig } from '@shared/types';

export function selectVisibleAgents(
  agents: AgentConfig[],
  selectedId: string | null
): AgentConfig[] {
  if (agents.length <= 60) return agents;
  const root = agents.find((agent) => agent.role === 'orchestrator');
  const leads = agents.filter((agent) => agent.role === 'team-lead');
  const selected = agents.find((agent) => agent.id === selectedId);
  const selectedLead =
    selected?.role === 'team-lead'
      ? selected
      : selected?.reportsTo
        ? agents.find((agent) => agent.id === selected.reportsTo && agent.role === 'team-lead')
        : undefined;
  const visibleIds = new Set(
    [root, ...leads, selected]
      .filter((agent): agent is AgentConfig => Boolean(agent))
      .map((agent) => agent.id)
  );
  if (selectedLead) {
    agents
      .filter((agent) => agent.reportsTo === selectedLead.id)
      .slice(0, 50)
      .forEach((agent) => visibleIds.add(agent.id));
  }
  return agents.filter((agent) => visibleIds.has(agent.id));
}
