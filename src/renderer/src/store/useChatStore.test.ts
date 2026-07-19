import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentConfig, Conversation, RunView } from '@shared/types';

const mocks = vi.hoisted(() => ({
  saveConversation: vi.fn(),
  startRun: vi.fn()
}));

vi.mock('@/lib/api', () => ({
  api: {
    conversations: {
      save: mocks.saveConversation,
      list: vi.fn()
    },
    runs: {
      start: mocks.startRun,
      cancel: vi.fn(),
      onEvent: vi.fn(() => () => {})
    }
  }
}));

import { useAgentStore } from './useAgentStore';
import { useAppStore } from './useAppStore';
import { useChatStore } from './useChatStore';

const conversation: Conversation = {
  id: 'conversation-1',
  title: 'New chat',
  agentId: 'agent-1',
  connectionId: null,
  model: null,
  messages: [],
  createdAt: 1,
  updatedAt: 1
};

const agent: AgentConfig = {
  id: 'agent-1',
  name: 'Email Agent',
  title: 'Email specialist',
  role: 'specialist',
  reportsTo: 'root',
  connectionId: 'connection-1',
  model: 'model-1',
  soul: 'Triage email.',
  tools: [],
  skills: [],
  autonomy: 'draft',
  delegatesTo: [],
  createdAt: 1,
  updatedAt: 1
};

describe('useChatStore agent routing', () => {
  beforeEach(() => {
    mocks.saveConversation.mockReset().mockResolvedValue([]);
    mocks.startRun.mockReset().mockResolvedValue({
      id: 'run-1',
      streamId: 'stream-1',
      idempotencyKey: 'request-1',
      conversationId: conversation.id,
      agentId: agent.id,
      connectionId: 'connection-1',
      model: 'model-1',
      status: 'queued',
      error: null,
      createdAt: 1,
      updatedAt: 1
    } satisfies RunView);
    useAppStore.setState({ settings: null });
    useAgentStore.setState({ agents: [agent], loaded: true });
    useChatStore.setState({
      conversations: [conversation],
      activeId: conversation.id,
      selectedAgentId: agent.id,
      isStreaming: false,
      streamId: null,
      runId: null,
      pendingRunKey: null,
      streamConversationId: null,
      error: null,
      initialized: true
    });
  });

  it('sends chat through the selected agent', async () => {
    await useChatStore.getState().sendMessage('Review my inbox');

    expect(mocks.startRun).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: conversation.id,
        agentId: agent.id,
        userContent: 'Review my inbox'
      })
    );
  });

  it('creates and activates a separate blank session', async () => {
    mocks.saveConversation.mockImplementation(async (created: Conversation) => [
      created,
      conversation
    ]);

    await useChatStore.getState().newConversation();

    const state = useChatStore.getState();
    expect(state.activeId).not.toBe(conversation.id);
    expect(state.selectedAgentId).toBeNull();
    expect(mocks.saveConversation).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'New chat', agentId: null, messages: [] })
    );
  });

  it('clears the active chat while preserving its agent assignment', async () => {
    const active = {
      ...conversation,
      title: agent.name,
      messages: [{ role: 'user' as const, content: 'Review my inbox' }]
    };
    useChatStore.setState({ conversations: [active] });
    mocks.saveConversation.mockImplementation(async (cleared: Conversation) => [cleared]);

    await useChatStore.getState().clearConversation();

    expect(useChatStore.getState().conversations[0]).toMatchObject({
      id: conversation.id,
      title: agent.name,
      agentId: agent.id,
      messages: []
    });
  });

  it('opens one persistent conversation for an agent contact', async () => {
    useChatStore.setState({ conversations: [], activeId: null, selectedAgentId: null });

    await useChatStore.getState().openAgentConversation(agent.id);

    expect(useChatStore.getState()).toMatchObject({
      selectedAgentId: agent.id,
      conversations: [expect.objectContaining({ title: agent.name, agentId: agent.id })]
    });
    expect(mocks.saveConversation).toHaveBeenCalledWith(
      expect.objectContaining({ title: agent.name, agentId: agent.id })
    );
  });

  it('reuses the existing persistent agent thread when selected from the team', async () => {
    const delegated: Conversation = {
      ...conversation,
      id: 'delegated-conversation',
      title: 'Delegated: inspect the inbox',
      threadType: 'delegated'
    };
    useChatStore.setState({
      conversations: [delegated, conversation],
      activeId: null,
      selectedAgentId: null
    });

    await useChatStore.getState().openAgentConversation(agent.id);

    expect(useChatStore.getState()).toMatchObject({
      activeId: conversation.id,
      selectedAgentId: agent.id,
      conversations: [delegated, conversation]
    });
    expect(mocks.saveConversation).not.toHaveBeenCalled();
  });
});
