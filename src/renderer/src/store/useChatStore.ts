import { create } from 'zustand';
import type { ChatMessage, Conversation } from '@shared/types';
import { api } from '@/lib/api';
import { useAppStore } from './useAppStore';

function makeConversation(): Conversation {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: 'New chat',
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
  isStreaming: boolean;
  streamId: string | null;
  runId: string | null;
  pendingRunKey: string | null;
  streamConversationId: string | null;
  error: string | null;
  initialized: boolean;

  init: () => Promise<void>;
  newConversation: () => Promise<void>;
  selectConversation: (id: string) => void;
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

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeId: null,
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
    const conv = makeConversation();
    set((s) => ({ conversations: [conv, ...s.conversations], activeId: conv.id, error: null }));
    await api.conversations.save(conv);
  },

  selectConversation: (id) => set({ activeId: id, error: null }),

  deleteConversation: async (id) => {
    const conversations = await api.conversations.delete(id);
    set((s) => ({
      conversations,
      activeId: s.activeId === id ? (conversations[0]?.id ?? null) : s.activeId
    }));
  },

  sendMessage: async (text) => {
    const content = text.trim();
    if (!content || get().isStreaming) return;

    const app = useAppStore.getState();
    const connectionId = app.settings?.activeConnectionId ?? null;
    const model = app.settings?.activeModel ?? null;
    if (!connectionId || !model) {
      set({ error: 'Select a connection and model first.' });
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
        title: c.messages.length === 0 ? content.slice(0, 48) : c.title,
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
