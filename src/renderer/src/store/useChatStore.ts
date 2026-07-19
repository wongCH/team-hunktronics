import { create } from 'zustand';
import type { ChatMessage, Conversation } from '@shared/types';
import { api } from '@/lib/api';
import { useAppStore } from './useAppStore';
import { useAgentStore } from './useAgentStore';

function makeConversation(): Conversation {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: 'New chat',
    agentId: null,
    connectionId: null,
    model: null,
    messages: [],
    createdAt: now,
    updatedAt: now
  };
}

interface ChatState {
  conversations: Conversation[];
  activeId: string | null;
  selectedAgentId: string | null;
  isStreaming: boolean;
  streamId: string | null;
  runId: string | null;
  pendingRunKey: string | null;
  streamConversationId: string | null;
  error: string | null;
  initialized: boolean;

  init: () => Promise<void>;
  newConversation: () => Promise<void>;
  clearConversation: () => Promise<void>;
  openAgentConversation: (agentId: string) => Promise<void>;
  selectConversation: (id: string) => void;
  selectAgent: (id: string | null) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  stop: () => void;
}

function patchConversation(
  list: Conversation[],
  id: string,
  fn: (c: Conversation) => Conversation
): Conversation[] {
  return list.map((c) => (c.id === id ? fn(c) : c));
}

export function findDirectAgentConversation(
  conversations: Conversation[],
  agentId: string
): Conversation | undefined {
  return (
    conversations.find(
      (conversation) => conversation.agentId === agentId && conversation.threadType === 'direct'
    ) ??
    conversations.find(
      (conversation) =>
        conversation.agentId === agentId &&
        conversation.threadType !== 'delegated' &&
        !conversation.title.startsWith('Delegated: ')
    )
  );
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeId: null,
  selectedAgentId: null,
  isStreaming: false,
  streamId: null,
  runId: null,
  pendingRunKey: null,
  streamConversationId: null,
  error: null,
  initialized: false,

  init: async () => {
    if (get().initialized) return;
    const conversations = await api.conversations.list();
    set({
      conversations,
      activeId: conversations[0]?.id ?? null,
      selectedAgentId: conversations[0]?.agentId ?? null,
      initialized: true
    });

    api.runs.onEvent((event) => {
      const state = get();
      const matches =
        event.run.id === state.runId || event.run.idempotencyKey === state.pendingRunKey;
      if (!matches) return;

      if (event.type === 'chunk' && event.delta) {
        set({
          runId: event.run.id,
          streamId: event.run.streamId,
          conversations: patchConversation(state.conversations, event.run.conversationId, (c) => {
            const messages = [...c.messages];
            const last = messages[messages.length - 1];
            if (last?.role === 'assistant') {
              messages[messages.length - 1] = { ...last, content: last.content + event.delta };
            }
            return { ...c, messages, updatedAt: Date.now() };
          })
        });
        return;
      }

      if (event.type === 'state' && ['completed', 'failed', 'cancelled'].includes(event.run.status)) {
        set({
          error: event.run.status === 'failed' ? event.run.error : null,
          isStreaming: false,
          streamId: null,
          runId: null,
          pendingRunKey: null,
          streamConversationId: null
        });
        void api.conversations.list().then((conversations) => set({ conversations }));
        return;
      }

      set({ runId: event.run.id, streamId: event.run.streamId });
    });
  },

  newConversation: async () => {
    if (get().isStreaming) return;
    const conv = makeConversation();
    try {
      const conversations = await api.conversations.save(conv);
      set({
        conversations,
        activeId: conv.id,
        selectedAgentId: null,
        error: null
      });
    } catch (reason) {
      set({ error: (reason as Error).message });
    }
  },

  clearConversation: async () => {
    const { activeId, conversations, isStreaming } = get();
    if (!activeId || isStreaming) return;
    const conversation = conversations.find((item) => item.id === activeId);
    if (!conversation || conversation.messages.length === 0) return;

    const cleared: Conversation = {
      ...conversation,
      title: conversation.agentId ? conversation.title : 'New chat',
      messages: [],
      updatedAt: Date.now()
    };
    try {
      const next = await api.conversations.save(cleared);
      set({ conversations: next, error: null });
    } catch (reason) {
      set({ error: (reason as Error).message });
    }
  },

  openAgentConversation: async (agentId) => {
    const existing = findDirectAgentConversation(get().conversations, agentId);
    if (existing) {
      set({ activeId: existing.id, selectedAgentId: agentId, error: null });
      return;
    }
    const agent = useAgentStore
      .getState()
      .agents.find((candidate) => candidate.id === agentId && !candidate.archived);
    if (!agent) {
      set({ error: 'The selected agent is no longer available.' });
      return;
    }
    const conversation: Conversation = {
      ...makeConversation(),
      title: agent.name,
      threadType: 'direct',
      agentId: agent.id,
      connectionId: agent.connectionId,
      model: agent.model
    };
    set((state) => ({
      conversations: [conversation, ...state.conversations],
      activeId: conversation.id,
      selectedAgentId: agent.id,
      error: null
    }));
    await api.conversations.save(conversation);
  },

  selectConversation: (id) => {
    const conversation = get().conversations.find((item) => item.id === id);
    set({ activeId: id, selectedAgentId: conversation?.agentId ?? null, error: null });
  },

  selectAgent: async (id) => {
    let activeId = get().activeId;
    if (!activeId) {
      const conversation = { ...makeConversation(), agentId: id };
      set((state) => ({
        conversations: [conversation, ...state.conversations],
        activeId: conversation.id,
        selectedAgentId: id,
        error: null
      }));
      await api.conversations.save(conversation);
      return;
    }
    const conversation = get().conversations.find((item) => item.id === activeId);
    if (!conversation) return;
    const updated = { ...conversation, agentId: id, updatedAt: Date.now() };
    set((state) => ({
      conversations: patchConversation(state.conversations, activeId!, () => updated),
      selectedAgentId: id,
      error: null
    }));
    await api.conversations.save(updated);
  },

  deleteConversation: async (id) => {
    const conversations = await api.conversations.delete(id);
    set((s) => ({
      conversations,
      activeId: s.activeId === id ? (conversations[0]?.id ?? null) : s.activeId,
      selectedAgentId:
        s.activeId === id
          ? (conversations[0]?.agentId ?? null)
          : s.selectedAgentId
    }));
  },

  sendMessage: async (text) => {
    const content = text.trim();
    if (!content || get().isStreaming) return;

    const app = useAppStore.getState();
    const selectedAgentId = get().selectedAgentId;
    const selectedAgent = selectedAgentId
      ? useAgentStore.getState().agents.find((agent) => agent.id === selectedAgentId && !agent.archived)
      : undefined;
    if (selectedAgentId && !selectedAgent) {
      set({ error: 'The selected agent is no longer available.' });
      return;
    }
    const connectionId = selectedAgent
      ? selectedAgent.connectionId
      : (app.settings?.activeConnectionId ?? null);
    const model = selectedAgent ? selectedAgent.model : (app.settings?.activeModel ?? null);
    if (!connectionId || !model) {
      set({
        error: selectedAgent
          ? `Configure a connection and model for ${selectedAgent.name} first.`
          : 'Select a connection and model first.'
      });
      return;
    }

    // Ensure there is an active conversation.
    let activeId = get().activeId;
    if (!activeId) {
      const conv = makeConversation();
      set((s) => ({ conversations: [conv, ...s.conversations], activeId: conv.id }));
      await api.conversations.save(conv);
      activeId = conv.id;
    }

    const userMsg: ChatMessage = { role: 'user', content };
    const current = get().conversations.find((c) => c.id === activeId)!;
    set((s) => ({
      error: null,
      conversations: patchConversation(s.conversations, activeId!, (c) => ({
        ...c,
        title: c.messages.length === 0 && !c.agentId ? content.slice(0, 48) : c.title,
        agentId: selectedAgent?.id ?? null,
        connectionId,
        model,
        messages: [...current.messages, userMsg, { role: 'assistant', content: '' }],
        updatedAt: Date.now()
      }))
    }));

    try {
      const idempotencyKey = crypto.randomUUID();
      set({
        isStreaming: true,
        pendingRunKey: idempotencyKey,
        streamConversationId: activeId
      });
      const run = await api.runs.start({
        conversationId: activeId,
        userContent: content,
        agentId: selectedAgent?.id,
        idempotencyKey
      });
      if (get().pendingRunKey === idempotencyKey) {
        set({ runId: run.id, streamId: run.streamId });
      }
    } catch (err) {
      set({
        error: (err as Error).message,
        isStreaming: false,
        streamId: null,
        runId: null,
        pendingRunKey: null,
        streamConversationId: null
      });
    }
  },

  stop: () => {
    const { runId } = get();
    if (runId) void api.runs.cancel(runId);
  }
}));
