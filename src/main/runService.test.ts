import { describe, expect, it, vi } from 'vitest';
import type {
  AgentConfig,
  ChatMessage,
  ConnectionConfig,
  Conversation,
  RunEvent
} from '@shared/types';
import { RunService, type RunExecution } from './runService';

function conversation(): Conversation {
  return {
    id: 'conversation-1',
    title: 'Existing chat',
    connectionId: 'connection-1',
    model: 'model-1',
    messages: [
      { role: 'user', content: 'Earlier question' },
      { role: 'assistant', content: 'Earlier answer' }
    ],
    createdAt: 1,
    updatedAt: 1
  };
}

function connection(): ConnectionConfig {
  return {
    id: 'connection-1',
    providerType: 'openai',
    label: 'Provider',
    hasKey: true,
    createdAt: 1,
    updatedAt: 1
  };
}

function agent(): AgentConfig {
  return {
    id: 'agent-1',
    name: 'Researcher',
    title: 'Research specialist',
    role: 'specialist',
    reportsTo: null,
    connectionId: 'connection-1',
    model: 'model-1',
    soul: 'Stay focused on verified evidence.',
    tools: ['web-search'],
    skills: ['research'],
    autonomy: 'draft',
    delegatesTo: [],
    createdAt: 1,
    updatedAt: 1
  };
}

describe('RunService', () => {
  it('loads authoritative history and agent identity before provider execution', async () => {
    const saved: Conversation[] = [];
    const events: RunEvent[] = [];
    let execution: RunExecution | undefined;
    const service = new RunService({
      getConversation: async () => conversation(),
      saveConversation: async (value) => saved.push(structuredClone(value)),
      getAgent: async () => agent(),
      getConnection: async () => connection(),
      getDefaultTarget: async () => ({ connectionId: null, model: null }),
      getMemory: async () => ({ teamMemory: '', agentMemory: '' }),
      execute: async (value) => {
        execution = value;
        value.onChunk('Verified response');
      },
      onEvent: (event) => events.push(event),
      createId: vi.fn().mockReturnValueOnce('run-1').mockReturnValueOnce('stream-1'),
      now: vi.fn().mockReturnValueOnce(10).mockReturnValueOnce(11).mockReturnValueOnce(12)
    });

    const view = await service.start({
      conversationId: 'conversation-1',
      agentId: 'agent-1',
      userContent: 'New question',
      idempotencyKey: 'request-1'
    });

    await vi.waitFor(() => expect(events.at(-1)?.run.status).toBe('completed'));
    expect(view).toEqual({
      id: 'run-1',
      streamId: 'stream-1',
      idempotencyKey: 'request-1',
      conversationId: 'conversation-1',
      agentId: 'agent-1',
      connectionId: 'connection-1',
      model: 'model-1',
      status: 'queued',
      error: null,
      createdAt: 10,
      updatedAt: 10
    });
    expect(execution?.messages).toEqual<ChatMessage[]>([
      { role: 'system', content: 'Stay focused on verified evidence.' },
      { role: 'user', content: 'Earlier question' },
      { role: 'assistant', content: 'Earlier answer' },
      { role: 'user', content: 'New question' }
    ]);
    expect(events.filter((event) => event.type === 'state').map((event) => event.run.status)).toEqual([
      'queued',
      'running',
      'completed'
    ]);
    expect(saved.at(-1)?.messages.at(-1)).toEqual({
      role: 'assistant',
      content: 'Verified response'
    });
    expect(JSON.stringify(view)).not.toContain('secret');
  });

  it('cancels an active provider execution and records a terminal state', async () => {
    const events: RunEvent[] = [];
    const service = new RunService({
      getConversation: async () => conversation(),
      saveConversation: async () => undefined,
      getAgent: async () => undefined,
      getConnection: async () => connection(),
      getDefaultTarget: async () => ({ connectionId: null, model: null }),
      getMemory: async () => ({ teamMemory: '', agentMemory: '' }),
      execute: ({ signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }),
      onEvent: (event) => events.push(event),
      createId: vi.fn().mockReturnValueOnce('run-2').mockReturnValueOnce('stream-2')
    });

    const run = await service.start({
      conversationId: 'conversation-1',
      userContent: 'Long request',
      idempotencyKey: 'request-2'
    });
    expect(service.cancel(run.id)).toBe(true);

    await vi.waitFor(() => expect(events.at(-1)?.run.status).toBe('cancelled'));
    expect(events.at(-1)?.run.error).toBe('Generation stopped.');
    expect(service.cancel(run.id)).toBe(false);
  });

  it('rejects unknown conversations before executing', async () => {
    const execute = vi.fn();
    const service = new RunService({
      getConversation: async () => undefined,
      saveConversation: async () => undefined,
      getAgent: async () => undefined,
      getConnection: async () => undefined,
      getDefaultTarget: async () => ({ connectionId: null, model: null }),
      getMemory: async () => ({ teamMemory: '', agentMemory: '' }),
      execute,
      onEvent: () => undefined
    });

    await expect(
      service.start({
        conversationId: 'missing',
        userContent: 'Hello',
        idempotencyKey: 'request-3'
      })
    ).rejects.toThrow('Conversation not found.');
    expect(execute).not.toHaveBeenCalled();
  });

  it('returns the latest lifecycle state for a duplicate idempotency key', async () => {
    const service = new RunService({
      getConversation: async () => conversation(),
      saveConversation: async () => undefined,
      getAgent: async () => undefined,
      getConnection: async () => connection(),
      getDefaultTarget: async () => ({ connectionId: null, model: null }),
      getMemory: async () => ({ teamMemory: '', agentMemory: '' }),
      execute: async ({ onChunk }) => onChunk('Done'),
      onEvent: () => undefined,
      createId: vi.fn().mockReturnValueOnce('run-idempotent').mockReturnValueOnce('stream-idempotent')
    });
    const command = {
      conversationId: 'conversation-1',
      userContent: 'Do this once',
      idempotencyKey: 'same-request'
    };
    await service.start(command);
    await vi.waitFor(async () => {
      expect((await service.start(command)).status).toBe('completed');
    });
  });
});