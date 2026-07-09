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
  streamConversationId: string | null;
  error: string | null;
  initialized: boolean;

  init: () => Promise<void>;
  newConversation: () => void;
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

    api.chat.onChunk(({ streamId, delta }) => {
      const state = get();
      if (streamId !== state.streamId || !state.streamConversationId) return;
      set({
        conversations: patchConversation(state.conversations, state.streamConversationId, (c) => {
          const messages = [...c.messages];
          const last = messages[messages.length - 1];
          if (last && last.role === 'assistant') {
            messages[messages.length - 1] = { ...last, content: last.content + delta };
          }
          return { ...c, messages, updatedAt: Date.now() };
        })
      });
    });

    api.chat.onDone(({ streamId }) => {
      const state = get();
      if (streamId !== state.streamId) return;
      const convId = state.streamConversationId;
      set({ isStreaming: false, streamId: null, streamConversationId: null });
      const conv = get().conversations.find((c) => c.id === convId);
      if (conv) void api.conversations.save(conv);
    });

    api.chat.onError(({ streamId, message }) => {
      const state = get();
      if (streamId !== state.streamId) return;
      const convId = state.streamConversationId;
      set({
        error: message,
        isStreaming: false,
        streamId: null,
        streamConversationId: null,
        conversations: convId
          ? patchConversation(state.conversations, convId, (c) => {
              const messages = [...c.messages];
              const last = messages[messages.length - 1];
              if (last && last.role === 'assistant' && last.content === '') {
                messages[messages.length - 1] = {
                  ...last,
                  content: `_⚠️ ${message}_`
                };
              }
              return { ...c, messages };
            })
          : state.conversations
      });
      const conv = get().conversations.find((c) => c.id === convId);
      if (conv) void api.conversations.save(conv);
    });
  },

  newConversation: () => {
    const conv = makeConversation();
    set((s) => ({ conversations: [conv, ...s.conversations], activeId: conv.id, error: null }));
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
      activeId = conv.id;
    }

    const userMsg: ChatMessage = { role: 'user', content };
    const current = get().conversations.find((c) => c.id === activeId)!;
    const outgoing: ChatMessage[] = [...current.messages, userMsg];

    set((s) => ({
      error: null,
      conversations: patchConversation(s.conversations, activeId!, (c) => ({
        ...c,
        title: c.messages.length === 0 ? content.slice(0, 48) : c.title,
        connectionId,
        model,
        messages: [...outgoing, { role: 'assistant', content: '' }],
        updatedAt: Date.now()
      }))
    }));

    try {
      const { streamId } = await api.chat.send({ connectionId, model, messages: outgoing });
      set({ isStreaming: true, streamId, streamConversationId: activeId });
    } catch (err) {
      set({ error: (err as Error).message, isStreaming: false });
    }
  },

  stop: () => {
    const { streamId } = get();
    if (streamId) void api.chat.cancel(streamId);
    set({ isStreaming: false, streamId: null, streamConversationId: null });
  }
}));
