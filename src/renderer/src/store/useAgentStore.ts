import { create } from 'zustand';
import type { AgentConfig, AgentIcon, AgentRole } from '@shared/types';
import { DEFAULT_AGENT_ICONS, DEFAULT_ORCHESTRATOR_SOUL, DEFAULT_WORKER_SOUL } from '@shared/types';
import { api } from '@/lib/api';

interface CreateAgentInput {
  role: AgentRole;
  icon?: AgentIcon;
  name?: string;
  title?: string;
  soul?: string;
  reportsTo?: string | null;
}

interface AgentState {
  agents: AgentConfig[];
  selectedId: string | null;
  loaded: boolean;

  init: () => Promise<void>;
  select: (id: string | null) => void;
  createAgent: (input: CreateAgentInput) => Promise<AgentConfig>;
  saveAgent: (agent: AgentConfig) => Promise<void>;
  deleteAgent: (id: string) => Promise<void>;
}

export const useAgentStore = create<AgentState>((set, get) => ({
  agents: [],
  selectedId: null,
  loaded: false,

  init: async () => {
    if (get().loaded) return;
    const agents = await api.agents.list();
    set({ agents, loaded: true, selectedId: get().selectedId ?? agents[0]?.id ?? null });
  },

  select: (id) => set({ selectedId: id }),

  createAgent: async ({ role, icon, name, title, soul, reportsTo }) => {
    const now = Date.now();
    const root = get().agents.find((agent) => agent.role === 'orchestrator' && !agent.archived);
    const agent: AgentConfig = {
      id: crypto.randomUUID(),
      icon: icon ?? DEFAULT_AGENT_ICONS[role],
      name:
        name?.trim() ||
        (role === 'orchestrator' ? 'Orchestrator' : role === 'team-lead' ? 'Team lead' : 'Specialist'),
      title:
        title?.trim() ||
        (role === 'orchestrator' ? 'Chief of Staff' : role === 'team-lead' ? 'Domain lead' : 'Specialist'),
      role,
      reportsTo: role === 'orchestrator' ? null : (reportsTo ?? root?.id ?? null),
      connectionId: null,
      model: null,
      soul: soul?.trim() ? soul : role === 'orchestrator' ? DEFAULT_ORCHESTRATOR_SOUL : DEFAULT_WORKER_SOUL,
      tools: [],
      skills: [],
      autonomy: 'draft',
      delegatesTo: [],
      createdAt: now,
      updatedAt: now
    };
    const agents = await api.agents.save(agent);
    set({ agents, selectedId: agent.id });
    return agent;
  },

  saveAgent: async (agent) => {
    const agents = await api.agents.save({ ...agent, updatedAt: Date.now() });
    set({ agents });
  },

  deleteAgent: async (id) => {
    const agents = await api.agents.delete(id);
    set((s) => ({
      agents,
      selectedId: s.selectedId === id ? (agents[0]?.id ?? null) : s.selectedId
    }));
  }
}));
