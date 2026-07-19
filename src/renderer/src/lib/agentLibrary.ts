import type { AgentIcon } from '@shared/types';
import emailSoul from '../../../../agent-library/souls/email-agent.md?raw';
import incidentSoul from '../../../../agent-library/souls/incident-agent.md?raw';
import meetingSoul from '../../../../agent-library/souls/meeting-agent.md?raw';
import reportingSoul from '../../../../agent-library/souls/reporting-agent.md?raw';
import researchSoul from '../../../../agent-library/souls/research-agent.md?raw';
import scheduleSoul from '../../../../agent-library/souls/schedule-agent.md?raw';

export type AgentLibraryCategory = 'Communication' | 'Productivity' | 'Operations' | 'Insights';

export interface AgentLibraryTemplate {
  id: string;
  name: string;
  title: string;
  icon: AgentIcon;
  category: AgentLibraryCategory;
  description: string;
  soulFile: string;
  soul: string;
  ready: boolean;
}

interface TemplateDefinition extends Omit<AgentLibraryTemplate, 'soul' | 'ready'> {
  rawSoul: string;
}

export function parseAgentSoul(rawSoul: string): { soul: string; ready: boolean } {
  const match = rawSoul.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { soul: rawSoul.trim(), ready: false };
  return {
    soul: match[2].trim(),
    ready: /^status:\s*ready\s*$/im.test(match[1]) && match[2].trim().length > 0
  };
}

const DEFINITIONS: TemplateDefinition[] = [
  {
    id: 'email-agent',
    name: 'Email Agent',
    title: 'Email Operations Specialist',
    icon: '✍️',
    category: 'Communication',
    description: 'Triages inboxes, drafts replies, and tracks follow-up actions.',
    soulFile: 'agent-library/souls/email-agent.md',
    rawSoul: emailSoul
  },
  {
    id: 'meeting-agent',
    name: 'Meeting Agent',
    title: 'Meeting Intelligence Specialist',
    icon: '🧠',
    category: 'Communication',
    description: 'Prepares agendas, captures decisions, and turns discussions into actions.',
    soulFile: 'agent-library/souls/meeting-agent.md',
    rawSoul: meetingSoul
  },
  {
    id: 'schedule-agent',
    name: 'Schedule Agent',
    title: 'Scheduling Specialist',
    icon: '🧭',
    category: 'Productivity',
    description: 'Coordinates calendars, resolves conflicts, and protects focus time.',
    soulFile: 'agent-library/souls/schedule-agent.md',
    rawSoul: scheduleSoul
  },
  {
    id: 'research-agent',
    name: 'Research Agent',
    title: 'Research Specialist',
    icon: '🔍',
    category: 'Insights',
    description: 'Finds evidence, compares sources, and produces concise research briefs.',
    soulFile: 'agent-library/souls/research-agent.md',
    rawSoul: researchSoul
  },
  {
    id: 'incident-agent',
    name: 'Incident Agent',
    title: 'Incident Response Specialist',
    icon: '🛡️',
    category: 'Operations',
    description: 'Tracks incidents, coordinates updates, and records recovery actions.',
    soulFile: 'agent-library/souls/incident-agent.md',
    rawSoul: incidentSoul
  },
  {
    id: 'reporting-agent',
    name: 'Reporting Agent',
    title: 'Reporting and Analytics Specialist',
    icon: '📊',
    category: 'Insights',
    description: 'Turns operational data into summaries, trends, and decision-ready reports.',
    soulFile: 'agent-library/souls/reporting-agent.md',
    rawSoul: reportingSoul
  }
];

export const AGENT_LIBRARY: AgentLibraryTemplate[] = DEFINITIONS.map(
  ({ rawSoul, ...definition }) => ({ ...definition, ...parseAgentSoul(rawSoul) })
);
